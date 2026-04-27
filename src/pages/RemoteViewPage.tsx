// src/pages/RemoteViewPage.tsx

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Wifi, Play, Square,
  Loader2, AlertTriangle, MousePointer, RefreshCw,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const INITIAL_KEYFRAME_TIMEOUT_MS = 3000;
const OUTPUT_STALL_TIMEOUT_MS = 5000;
const KEYFRAME_REQUEST_INTERVAL_MS = 10000;
const MAX_DECODE_QUEUE_SIZE = 10;
const MAX_CONSECUTIVE_ERRORS = 5;
const AUTH_TIMEOUT_MS = 5000;
const WATCH_TIMEOUT_MS = 5000;

// ══════════════════════════════════════════════════════════════════════════════
// H.264 / NAL HELPERS (pure functions, no React dependencies)
// ══════════════════════════════════════════════════════════════════════════════

function b64ToU8(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function stripStartCode(data: Uint8Array): Uint8Array {
  if (data.length >= 4 && data[0] === 0 && data[1] === 0 && data[2] === 0 && data[3] === 1) {
    return data.slice(4);
  }
  if (data.length >= 3 && data[0] === 0 && data[1] === 0 && data[2] === 1) {
    return data.slice(3);
  }
  return data.slice(0);
}

function buildAVCCExtraData(rawSPS: Uint8Array, rawPPS: Uint8Array): Uint8Array {
  const sps = stripStartCode(rawSPS);
  const pps = stripStartCode(rawPPS);

  if (sps.length < 4) {
    throw new Error(`SPS too short: ${sps.length} bytes`);
  }

  const buf = new Uint8Array(11 + sps.length + pps.length);
  let i = 0;

  buf[i++] = 0x01;
  buf[i++] = sps[1];
  buf[i++] = sps[2];
  buf[i++] = sps[3];
  buf[i++] = 0xff;
  buf[i++] = 0xe1;
  buf[i++] = (sps.length >> 8) & 0xff;
  buf[i++] = sps.length & 0xff;
  buf.set(sps, i); i += sps.length;
  buf[i++] = 0x01;
  buf[i++] = (pps.length >> 8) & 0xff;
  buf[i++] = pps.length & 0xff;
  buf.set(pps, i);

  return buf;
}

function spsToCodecString(rawSPS: Uint8Array): string {
  const sps = stripStartCode(rawSPS);
  if (sps.length < 4) {
    throw new Error(`Cannot extract codec from SPS: ${sps.length} bytes`);
  }
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `avc1.${h(sps[1])}${h(sps[2])}${h(sps[3])}`;
}

function splitAnnexB(data: Uint8Array): Uint8Array[] {
  const starts: Array<{ pos: number; scLen: number }> = [];

  for (let i = 0; i < data.length - 2; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0) continue;

    if (data[i + 2] === 1) {
      starts.push({ pos: i, scLen: 3 });
      i += 2;
    } else if (i + 3 < data.length && data[i + 2] === 0 && data[i + 3] === 1) {
      starts.push({ pos: i, scLen: 4 });
      i += 3;
    }
  }

  if (starts.length === 0) {
    return data.length > 0 ? [data.slice(0)] : [];
  }

  return starts.map((sc, k) => {
    const payloadStart = sc.pos + sc.scLen;
    const payloadEnd = k + 1 < starts.length ? starts[k + 1].pos : data.length;
    return payloadEnd > payloadStart
      ? data.slice(payloadStart, payloadEnd)
      : new Uint8Array(0);
  }).filter(n => n.length > 0);
}

function nalListToAVCC(nals: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const n of nals) total += 4 + n.length;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;

  for (const n of nals) {
    view.setUint32(offset, n.length, false);
    out.set(n, offset + 4);
    offset += 4 + n.length;
  }

  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function RemoteViewPage() {
  const { adminKey } = useAuth();

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const configReadyRef = useRef(false);
  const tsRef = useRef(0);
  const nalBufRef = useRef<Uint8Array[]>([]);
  const firstFrameRef = useRef(false);
  const lastOutputTimeRef = useRef(0);
  const consecutiveErrorsRef = useRef(0);
  const deviceIdRef = useRef('');
  const authSentRef = useRef(false);
  const watchSentRef = useRef(false);
  const binaryFramesReceivedRef = useRef(0);
  const videoConfigsReceivedRef = useRef(0);

  // Timer refs
  const initialWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyframeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // RECONEXIÓN – Refs para gestionar reconexiones automáticas
  const manualCloseRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReconnectingRef = useRef(false);

  // ══════════════════════════════════════════════════════════════════════════
  // THROTTLING INPUT – nuevas refs para optimizar touch_move
  // ══════════════════════════════════════════════════════════════════════════
  const moveFrameRef = useRef<number>(0);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const streamingRef = useRef(false); // para leer dentro de requestAnimationFrame

  // State
  const [devices, setDevices] = useState<
    Array<{ deviceId: string; deviceName: string | null; isOnline: boolean }>
  >([]);
  const [deviceId, setDeviceId] = useState('');
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [wcOk, setWcOk] = useState<boolean | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [waitingKey, setWaitingKey] = useState(false);

  // Diag state
  const [diag, setDiag] = useState({
    wsState: 'idle' as string,
    authSent: false,
    authReceived: false,
    watchSent: false,
    watchReceived: false,
    videoConfigCount: 0,
    binaryFrameCount: 0,
    decoderState: 'none' as string,
    lastMsg: '',
    lastMsgTime: '',
  });

  const updateDiag = useCallback((patch: Partial<typeof diag>) => {
    setDiag(prev => ({ ...prev, ...patch }));
  }, []);

  // Sincronizar streamingRef con el estado
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  // Bootstrap
  useEffect(() => {
    setWcOk(typeof VideoDecoder !== 'undefined');
  }, []);

  useEffect(() => {
    api.getDevices().then(res => {
      if (res.success && res.data) {
        const devs = res.data.devices.map((d: any) => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          isOnline: d.isOnline,
        }));
        setDevices(devs);
        const first = devs.find((d: any) => d.isOnline) ?? devs[0];
        if (first) setDeviceId(first.deviceId);
      }
    }).catch(err => {
      console.error('[Devices] fetch failed:', err);
    });
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d');
    }
  }, []);

  // Timer management
  const clearAllTimers = useCallback(() => {
    if (initialWatchdogRef.current) {
      clearTimeout(initialWatchdogRef.current);
      initialWatchdogRef.current = null;
    }
    if (stallWatchdogRef.current) {
      clearInterval(stallWatchdogRef.current);
      stallWatchdogRef.current = null;
    }
    if (keyframeIntervalRef.current) {
      clearInterval(keyframeIntervalRef.current);
      keyframeIntervalRef.current = null;
    }
    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    if (watchTimeoutRef.current) {
      clearTimeout(watchTimeoutRef.current);
      watchTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      manualCloseRef.current = true;
      wsRef.current?.close();
      if (decoderRef.current && decoderRef.current.state !== 'closed') {
        decoderRef.current.close();
      }
      clearAllTimers();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      // Limpiar throttle input
      if (moveFrameRef.current) {
        cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = 0;
      }
    };
  }, [clearAllTimers]);

  // Request keyframe
  const requestKeyframeWS = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'request_keyframe' }));
      console.log('[Keyframe] requested via WebSocket');
      return true;
    }
    return false;
  }, []);

  const forceKeyframe = useCallback(async () => {
    const devId = deviceIdRef.current;
    if (!devId) return;

    console.warn('[Keyframe] forcing encoder restart for fresh IDR');
    setWaitingKey(true);

    try {
      await api.sendCommand({
        deviceId: devId,
        commandType: 'STOP_SCREEN_STREAM',
        priority: 10,
      });
      await new Promise(r => setTimeout(r, 400));
      await api.sendCommand({
        deviceId: devId,
        commandType: 'START_SCREEN_STREAM',
        parameters: JSON.stringify({
          width: 1080,
          height: 2336,
          bitrate: 1_500_000,
          fps: 30,
        }),
        priority: 10,
      });
      console.log('[Keyframe] encoder restart commands sent');
    } catch (e) {
      console.error('[Keyframe] restart failed:', e);
      setError('Failed to restart encoder');
    }
  }, []);

  // Stall monitor
  const startStallMonitor = useCallback(() => {
    if (stallWatchdogRef.current) {
      clearInterval(stallWatchdogRef.current);
    }

    lastOutputTimeRef.current = performance.now();

    stallWatchdogRef.current = setInterval(() => {
      if (!firstFrameRef.current) return;

      const elapsed = performance.now() - lastOutputTimeRef.current;
      if (elapsed > OUTPUT_STALL_TIMEOUT_MS) {
        console.warn('[Stall] no output for', Math.round(elapsed), 'ms');
        if (!requestKeyframeWS()) {
          forceKeyframe();
        }
        lastOutputTimeRef.current = performance.now();
      }
    }, 1000);
  }, [requestKeyframeWS, forceKeyframe]);

  const startKeyframeInterval = useCallback(() => {
    if (keyframeIntervalRef.current) {
      clearInterval(keyframeIntervalRef.current);
    }

    keyframeIntervalRef.current = setInterval(() => {
      if (firstFrameRef.current) {
        requestKeyframeWS();
      }
    }, KEYFRAME_REQUEST_INTERVAL_MS);
  }, [requestKeyframeWS]);

  // Flush AU
  const flushAU = useCallback(
    (decoder: VideoDecoder, buf: Uint8Array[]) => {
      if (!buf.length) return;

      const avcc = nalListToAVCC(buf);
      const isKey = buf.some(n => (n[0] & 0x1f) === 5);
      buf.length = 0;

      try {
        decoder.decode(
          new EncodedVideoChunk({
            type: isKey ? 'key' : 'delta',
            timestamp: tsRef.current,
            data: avcc,
          })
        );
        tsRef.current += 33_333;
        consecutiveErrorsRef.current = 0;
      } catch (e) {
        console.error('[flushAU] decode error:', e);
        consecutiveErrorsRef.current++;

        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
          console.error('[flushAU] max consecutive errors — resetting decoder');
          consecutiveErrorsRef.current = 0;

          if (decoder.state !== 'closed') {
            try { decoder.close(); } catch (closeErr) {
              console.error('[flushAU] decoder.close() error:', closeErr);
            }
          }
          decoderRef.current = null;
          configReadyRef.current = false;
          updateDiag({ decoderState: 'error-recovery' });
          requestKeyframeWS();
        }
      }
    },
    [requestKeyframeWS, updateDiag]
  );

  // Init decoder
  const initDecoder = useCallback(
    (spsRaw: Uint8Array, ppsRaw: Uint8Array) => {
      if (decoderRef.current) {
        if (decoderRef.current.state !== 'closed') {
          try { decoderRef.current.close(); } catch (e) {
            console.warn('[initDecoder] close existing decoder error:', e);
          }
        }
        decoderRef.current = null;
      }

      if (initialWatchdogRef.current) {
        clearTimeout(initialWatchdogRef.current);
        initialWatchdogRef.current = null;
      }
      if (stallWatchdogRef.current) {
        clearInterval(stallWatchdogRef.current);
        stallWatchdogRef.current = null;
      }
      if (keyframeIntervalRef.current) {
        clearInterval(keyframeIntervalRef.current);
        keyframeIntervalRef.current = null;
      }

      const codec = spsToCodecString(spsRaw);
      const extraData = buildAVCCExtraData(spsRaw, ppsRaw);
      const description: ArrayBufferLike = extraData.buffer;

      console.log('[initDecoder] codec:', codec, 'extraData length:', extraData.length);
      updateDiag({ decoderState: 'configuring' });

      const decoder = new VideoDecoder({
        output: (frame: VideoFrame) => {
          lastOutputTimeRef.current = performance.now();

          if (!firstFrameRef.current) {
            firstFrameRef.current = true;
            setWaitingKey(false);

            if (initialWatchdogRef.current) {
              clearTimeout(initialWatchdogRef.current);
              initialWatchdogRef.current = null;
            }

            startStallMonitor();
            startKeyframeInterval();

            console.log('[VideoDecoder] ✅ FIRST FRAME OUTPUT — decoding active');
            updateDiag({ decoderState: 'active' });
          }

          const canvas = canvasRef.current;
          const ctx = ctxRef.current;

          if (canvas && ctx) {
            if (
              canvas.width !== frame.displayWidth ||
              canvas.height !== frame.displayHeight
            ) {
              canvas.width = frame.displayWidth;
              canvas.height = frame.displayHeight;
            }
            ctx.drawImage(frame, 0, 0);
            setFrameCount(c => c + 1);
          }

          frame.close();
        },

        error: (e: DOMException) => {
          console.error('[VideoDecoder] error:', e.message, 'name:', e.name);
          setError(`Decoder error: ${e.message}`);
          updateDiag({ decoderState: `error: ${e.message}` });

          configReadyRef.current = false;

          if (decoderRef.current && decoderRef.current.state !== 'closed') {
            try { decoderRef.current.close(); } catch (closeErr) {
              console.error('[VideoDecoder] close error:', closeErr);
            }
          }
          decoderRef.current = null;

          requestKeyframeWS();
        },
      });

      decoder.configure({
        codec,
        description,
        optimizeForLatency: true,
      });

      decoderRef.current = decoder;
      configReadyRef.current = true;
      firstFrameRef.current = false;
      tsRef.current = 0;
      nalBufRef.current = [];
      consecutiveErrorsRef.current = 0;

      console.log('[VideoDecoder] configured successfully');
      updateDiag({ decoderState: 'configured-waiting-key' });

      setWaitingKey(true);
      initialWatchdogRef.current = setTimeout(() => {
        if (!firstFrameRef.current) {
          console.warn('[Watchdog] no keyframe after', INITIAL_KEYFRAME_TIMEOUT_MS, 'ms');
          const wsSuccess = requestKeyframeWS();
          if (!wsSuccess) {
            forceKeyframe();
          } else {
            setTimeout(() => {
              if (!firstFrameRef.current) {
                console.warn('[Watchdog] WS keyframe request didn\'t help — forcing restart');
                forceKeyframe();
              }
            }, 500);
          }
        }
      }, INITIAL_KEYFRAME_TIMEOUT_MS);
    },
    [forceKeyframe, requestKeyframeWS, startStallMonitor, startKeyframeInterval, updateDiag]
  );

  // Handle video config
  const handleVideoConfig = useCallback(
    (msg: { sps?: string; pps?: string }) => {
      videoConfigsReceivedRef.current++;
      updateDiag({ videoConfigCount: videoConfigsReceivedRef.current });

      if (!msg.sps || !msg.pps) {
        console.warn('[VideoConfig] missing SPS or PPS');
        return;
      }

      console.log('[VideoConfig] ✅ received — SPS length:', msg.sps.length, 'PPS length:', msg.pps.length);

      try {
        const sps = b64ToU8(msg.sps);
        const pps = b64ToU8(msg.pps);
        initDecoder(sps, pps);
      } catch (e) {
        console.error('[VideoConfig] init failed:', e);
        setError('Failed to configure H.264 decoder');
        updateDiag({ decoderState: `config-error: ${e}` });
      }
    },
    [initDecoder, updateDiag]
  );

  // Handle binary video data
  const handleVideoData = useCallback(
    (data: Uint8Array) => {
      binaryFramesReceivedRef.current++;
      updateDiag({ binaryFrameCount: binaryFramesReceivedRef.current });

      const decoder = decoderRef.current;

      if (!decoder || decoder.state !== 'configured' || !configReadyRef.current) {
        if (binaryFramesReceivedRef.current <= 3) {
          console.error(
            '🔴 [VideoData] BINARY FRAME RECEIVED BUT DECODER NOT READY!',
            '\n  → Frame size:', data.length, 'bytes'
          );
        }
        return;
      }

      if (decoder.decodeQueueSize > MAX_DECODE_QUEUE_SIZE) {
        console.warn('[VideoData] backpressure — queue size:', decoder.decodeQueueSize);
        return;
      }

      const nals = splitAnnexB(data);
      const buf = nalBufRef.current;

      for (const nal of nals) {
        if (nal.length === 0) continue;

        const nalType = nal[0] & 0x1f;

        if (nalType === 9) {
          if (buf.length > 0) flushAU(decoder, buf);
          continue;
        }

        if (nalType === 7 || nalType === 8) continue;

        buf.push(nal);

        if (nalType === 5 || nalType === 1) {
          flushAU(decoder, buf);
        }
      }

      if (buf.length > 0) {
        flushAU(decoder, buf);
      }
    },
    [flushAU, updateDiag]
  );

  // Input forwarding
  const sendInput = useCallback(
    (eventType: string, x: number, y: number) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: 'input',
          eventType,
          x: x,
          y: y,
          timestamp: Date.now(),
        })
      );
    },
    []
  );

  const getCanvasCoords = useCallback(
    (e: React.MouseEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    []
  );

  // ══════════════════════════════════════════════════════════════════════════
  // THROTTLING INPUT FUNCTIONS
  // ══════════════════════════════════════════════════════════════════════════
  const scheduleMove = useCallback((x: number, y: number) => {
    pendingMoveRef.current = { x, y };
    if (!moveFrameRef.current && streamingRef.current) {
      moveFrameRef.current = requestAnimationFrame(() => {
        if (pendingMoveRef.current && streamingRef.current) {
          sendInput('touch_move', pendingMoveRef.current.x, pendingMoveRef.current.y);
          lastTouchCoordsRef.current = pendingMoveRef.current;
          pendingMoveRef.current = null;
        }
        moveFrameRef.current = 0;
      });
    }
  }, [sendInput]);

  const cancelPendingMove = useCallback(() => {
    if (moveFrameRef.current) {
      cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = 0;
    }
    pendingMoveRef.current = null;
  }, []);

  // Connect
  const connect = useCallback((isRetry = false) => {
    if (!deviceId || !adminKey) {
      setError('Missing device or auth key');
      return;
    }

    const existing = wsRef.current;
    if (
      existing &&
      existing.readyState !== WebSocket.CLOSED &&
      existing.readyState !== WebSocket.CLOSING
    ) {
      return;
    }

    const base = import.meta.env.VITE_SERVER_URL || 'http://192.168.123.155:5000';
    const wsUrl = `${base.replace(/^http/, 'ws')}/ws/viewer`;

    if (!isRetry) {
      console.log('[WS] ══════════════════════════════════════════════════');
      console.log('[WS] connecting to', wsUrl);
    } else {
      console.log(`[WS] Reconexión intento #${retryCountRef.current} a ${wsUrl}`);
    }

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    authSentRef.current = false;
    watchSentRef.current = false;
    binaryFramesReceivedRef.current = 0;
    videoConfigsReceivedRef.current = 0;

    if (!isReconnectingRef.current) {
      updateDiag({
        wsState: 'connecting',
        authSent: false, authReceived: false,
        watchSent: false, watchReceived: false,
        videoConfigCount: 0, binaryFrameCount: 0,
        decoderState: 'none', lastMsg: '', lastMsgTime: '',
      });
    }

    ws.onopen = () => {
      console.log('[WS] ✅ OPEN');
      updateDiag({ wsState: 'open' });

      const authMsg = JSON.stringify({ type: 'auth', adminKey });
      ws.send(authMsg);
      authSentRef.current = true;
      updateDiag({ authSent: true, lastMsg: '→ auth', lastMsgTime: new Date().toLocaleTimeString() });

      authTimeoutRef.current = setTimeout(() => {
        if (!diag.authReceived) {
          console.warn('[WS] Auth timeout');
        }
      }, AUTH_TIMEOUT_MS);
    };

    ws.onmessage = (event: MessageEvent) => {
      const timeStr = new Date().toLocaleTimeString();

      if (typeof event.data === 'string') {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          console.warn('[WS] non-JSON text message:', event.data.substring(0, 100));
          return;
        }

        console.log('[WS] ← TEXT:', JSON.stringify(msg).substring(0, 200));
        updateDiag({ lastMsg: '← ' + JSON.stringify(msg).substring(0, 80), lastMsgTime: timeStr });

        if (msg.status === 'authenticated') {
          console.log('[WS] ✅ AUTH SUCCESS — sending watch for device:', deviceId);
          updateDiag({ authReceived: true });

          if (authTimeoutRef.current) {
            clearTimeout(authTimeoutRef.current);
            authTimeoutRef.current = null;
          }

          const watchMsg = JSON.stringify({ type: 'watch', deviceId });
          ws.send(watchMsg);
          watchSentRef.current = true;
          updateDiag({ watchSent: true, lastMsg: '→ watch', lastMsgTime: timeStr });

          watchTimeoutRef.current = setTimeout(() => {
            if (!diag.watchReceived) {
              const msg = '⚠️ SERVER BUG: Watch sent but no {status:"watching"} received in 5s. Check /ws/viewer handler.';
              console.error('[WS]', msg);
              setError(msg);
              updateDiag({ wsState: 'watch-timeout' });
            }
          }, WATCH_TIMEOUT_MS);

        } else if (msg.status === 'watching') {
          console.log('[WS] ✅ WATCH CONFIRMED — now waiting for video_config from device');
          updateDiag({ watchReceived: true });

          if (watchTimeoutRef.current) {
            clearTimeout(watchTimeoutRef.current);
            watchTimeoutRef.current = null;
          }

          setConnected(true);
          setError('');

        } else if (msg.type === 'video_config') {
          handleVideoConfig(msg);

        } else if (msg.error) {
          console.error('[WS] error from server:', msg.error);
          setError(msg.error);
          setConnected(false);
          ws.close();

        } else {
          console.log('[WS] ⚠️ Unknown message type:', msg.type ?? msg.status ?? '(no type/status)');
        }

      } else if (event.data instanceof ArrayBuffer) {
        if (binaryFramesReceivedRef.current < 3) {
          const view = new Uint8Array(event.data);
          const headerHex = Array.from(view.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log('[WS] ← BINARY:', event.data.byteLength, 'bytes, header:', headerHex);
        }

        handleVideoData(new Uint8Array(event.data));
      }
    };

    ws.onclose = (event: CloseEvent) => {
      console.log('[WS] CLOSED — code:', event);
      if (wsRef.current === ws) wsRef.current = null;

      if (!manualCloseRef.current) {
        retryCountRef.current++;
        isReconnectingRef.current = true;

        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 30000);

        console.log(`[WS] Reconectando en ${delay}ms (intento #${retryCountRef.current})`);
        updateDiag({ wsState: `reconnecting (${retryCountRef.current})` });

        retryTimerRef.current = setTimeout(() => {
          connect(true);
        }, delay);
      } else {
        setConnected(false);
        setStreaming(false);
        setWaitingKey(false);
        configReadyRef.current = false;
        updateDiag({ wsState: `closed (${event.code})` });
      }

      clearAllTimers();
    };

    ws.onerror = () => {
      if (!isReconnectingRef.current) {
        setError('Error de conexión WebSocket');
      }
      updateDiag({ wsState: 'error' });
    };
  }, [deviceId, adminKey, handleVideoConfig, handleVideoData, clearAllTimers, updateDiag, diag.authReceived]);

  // Disconnect
  const disconnect = useCallback(() => {
    cancelPendingMove(); // limpiar cualquier movimiento pendiente
    manualCloseRef.current = true;
    isReconnectingRef.current = false;
    retryCountRef.current = 0;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    wsRef.current?.close();
    wsRef.current = null;

    if (decoderRef.current && decoderRef.current.state !== 'closed') {
      try { decoderRef.current.close(); } catch (e) { /* ignore */ }
    }
    decoderRef.current = null;
    configReadyRef.current = false;
    nalBufRef.current = [];
    firstFrameRef.current = false;

    setConnected(false);
    setStreaming(false);
    setWaitingKey(false);
    setFrameCount(0);
  }, [cancelPendingMove]);

  // Start streaming
  const startStreaming = useCallback(async () => {
    if (!deviceId) return;

    setLoading(true);
    setError('');
    firstFrameRef.current = false;
    configReadyRef.current = false;
    nalBufRef.current = [];

    try {
      const res = await api.sendCommand({
        deviceId,
        commandType: 'START_SCREEN_STREAM',
        parameters: JSON.stringify({
          width: 1080,
          height: 2336,
          bitrate: 1_500_000,
          fps: 30,
        }),
        priority: 10,
      });

      if (res.success) {
        setStreaming(true);
        console.log('[Stream] ✅ start command succeeded — waiting for video_config from server');
      } else {
        const msg = res.error ?? 'Error starting stream';
        setError(
          msg.includes('PERMISO_REQUERIDO')
            ? '📱 Acepta el permiso de captura en el dispositivo y reintenta.'
            : msg
        );
      }
    } catch (e) {
      console.error('[Stream] start error:', e);
      setError('Network error starting stream');
    }

    setLoading(false);
  }, [deviceId]);

  // Stop streaming
  const stopStreaming = useCallback(async () => {
    if (!deviceId) return;

    cancelPendingMove(); // limpiar movimientos pendientes al detener el video
    setLoading(true);
    clearAllTimers();

    try {
      await api.sendCommand({
        deviceId,
        commandType: 'STOP_SCREEN_STREAM',
        priority: 10,
      });
      console.log('[Stream] stop command succeeded');
    } catch (e) {
      console.error('[Stream] stop error:', e);
    }

    configReadyRef.current = false;
    nalBufRef.current = [];
    firstFrameRef.current = false;
    setStreaming(false);
    setWaitingKey(false);
    setLoading(false);
  }, [deviceId, clearAllTimers, cancelPendingMove]);

  // Render
  const selectedDevice = devices.find(d => d.deviceId === deviceId);

  const handshakeBroken = diag.authSent && !diag.authReceived;
  const watchBroken = diag.watchSent && !diag.watchReceived;
  const framesWithoutConfig = diag.binaryFrameCount > 0 && diag.videoConfigCount === 0;

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/dispositivos"
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Vista Remota</h1>
        {streaming && !waitingKey && (
          <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm flex items-center gap-2 animate-pulse">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            EN VIVO · {frameCount} frames
          </span>
        )}
        {streaming && waitingKey && (
          <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Esperando keyframe…
          </span>
        )}
      </div>

      {/* Diagnostic Panel */}
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-2 text-xs font-mono">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <span className="text-yellow-500">⚑</span>
          <span className="font-semibold text-white uppercase tracking-wider">Pipeline Diagnostics</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'WS State', value: diag.wsState, ok: diag.wsState === 'open' },
            { label: 'Auth →', value: diag.authSent ? '✅ sent' : '❌ no', ok: diag.authSent },
            { label: 'Auth ←', value: diag.authReceived ? '✅ received' : '❌ MISSING', ok: diag.authReceived },
            { label: 'Watch →', value: diag.watchSent ? '✅ sent' : '⏳ waiting auth', ok: diag.watchSent },
            { label: 'Watch ←', value: diag.watchReceived ? '✅ received' : '❌ MISSING', ok: diag.watchReceived },
            { label: 'video_config', value: `${diag.videoConfigCount} received`, ok: diag.videoConfigCount > 0 },
            { label: 'Binary frames', value: `${diag.binaryFrameCount} received`, ok: diag.binaryFrameCount > 0 },
            { label: 'Decoder', value: diag.decoderState, ok: diag.decoderState === 'active' },
          ].map(item => (
            <div
              key={item.label}
              className={`px-2 py-1.5 rounded ${item.ok
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
            >
              <div className="text-gray-500 text-[10px]">{item.label}</div>
              <div className="truncate">{item.value}</div>
            </div>
          ))}
        </div>
        {diag.lastMsg && (
          <div className="text-gray-500 mt-1">
            Last: {diag.lastMsgTime} — {diag.lastMsg}
          </div>
        )}

        {handshakeBroken && (
          <div className="mt-2 p-2 bg-red-500/20 border border-red-500/40 rounded text-red-300">
            <strong>🔴 SERVER BUG DETECTED:</strong> Auth message was sent but server never responded with{' '}
            <code className="bg-gray-800 px-1 rounded">{"{status:'authenticated'}"}</code>.
          </div>
        )}
        {watchBroken && (
          <div className="mt-2 p-2 bg-red-500/20 border border-red-500/40 rounded text-red-300">
            <strong>🔴 SERVER BUG DETECTED:</strong> Watch message was sent but server never responded with{' '}
            <code className="bg-gray-800 px-1 rounded">{"{status:'watching'}"}</code>.
          </div>
        )}
        {framesWithoutConfig && (
          <div className="mt-2 p-2 bg-red-500/20 border border-red-500/40 rounded text-red-300">
            <strong>🔴 SERVER BUG DETECTED:</strong> {diag.binaryFrameCount} binary frames received but 0 video_config messages.
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 p-4 rounded-lg">
        <select
          value={deviceId}
          onChange={e => {
            setDeviceId(e.target.value);
            disconnect();
          }}
          disabled={connected}
          className="flex-1 min-w-48 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-50"
        >
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.isOnline ? '🟢' : '🔴'} {d.deviceName || d.deviceId}
            </option>
          ))}
        </select>

        {!connected ? (
          <button
            onClick={connect}
            disabled={!selectedDevice?.isOnline || loading || wcOk === false}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <Wifi className="w-4 h-4" /> Conectar
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            <Square className="w-4 h-4" /> Desconectar
          </button>
        )}

        {connected &&
          (streaming ? (
            <>
              <button
                onClick={forceKeyframe}
                disabled={loading}
                title="Forzar keyframe (reiniciar encoder)"
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={stopStreaming}
                disabled={loading}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Detener Video
              </button>
            </>
          ) : (
            <button
              onClick={startStreaming}
              disabled={loading || wcOk === false}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Iniciar Video
            </button>
          ))}
      </div>

      {/* Alerts */}
      {wcOk === false && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">
            Tu navegador no soporta <strong>WebCodecs API</strong>. Usa Chrome 94+ o Edge 94+.
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!selectedDevice?.isOnline && !connected && deviceId && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
          El dispositivo seleccionado no está online.
        </div>
      )}

      {streaming && waitingKey && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          Esperando el primer IDR keyframe. Si no llega en {INITIAL_KEYFRAME_TIMEOUT_MS / 1000}s el encoder reiniciará automáticamente.
        </div>
      )}

      {/* Video container with throttled input */}
      <div
        className="relative bg-black rounded-lg overflow-hidden border-2 border-gray-800 cursor-crosshair select-none mx-auto"
        style={{ aspectRatio: '1080 / 2336', maxWidth: '420px' }}
        onMouseDown={e => {
          const c = getCanvasCoords(e);
          if (c && streaming) {
            sendInput('touch_down', c.x, c.y);
            lastTouchCoordsRef.current = c;
          }
        }}
        onMouseUp={e => {
          cancelPendingMove();
          const c = getCanvasCoords(e);
          if (c && streaming) {
            sendInput('touch_up', c.x, c.y);
            lastTouchCoordsRef.current = null;
          }
        }}
        onMouseLeave={e => {
          cancelPendingMove();
          if (streaming && lastTouchCoordsRef.current) {
            sendInput('touch_up', lastTouchCoordsRef.current.x, lastTouchCoordsRef.current.y);
            lastTouchCoordsRef.current = null;
          }
        }}
        onMouseMove={e => {
          if (e.buttons !== 1) return;
          const c = getCanvasCoords(e);
          if (c && streaming) scheduleMove(c.x, c.y);
        }}
      >
        <canvas
          ref={canvasRef}
          width={1080}
          height={2336}
          className="absolute inset-0 w-full h-full"
          style={{
            display: streaming && !waitingKey ? 'block' : 'none',
          }}
        />

        {(!streaming || waitingKey) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-4 pointer-events-none">
            {connected ? (
              <>
                {streaming && waitingKey ? (
                  <Loader2 className="w-12 h-12 opacity-40 animate-spin" />
                ) : (
                  <Play className="w-12 h-12 opacity-40" />
                )}
                <p className="text-sm text-gray-300 text-center px-4">
                  {streaming && waitingKey
                    ? 'Sincronizando con el encoder Android…'
                    : <>Conectado. Presiona <span className="font-semibold text-white">"Iniciar Video"</span>.</>}
                </p>
              </>
            ) : (
              <>
                <Wifi className="w-12 h-12 opacity-40" />
                <p className="text-sm text-gray-400">Desconectado</p>
              </>
            )}
          </div>
        )}

        {streaming && !waitingKey && (
          <div className="absolute top-3 right-3 z-10 px-2.5 py-1 bg-black/60 text-white text-xs rounded backdrop-blur pointer-events-none">
            <MousePointer className="w-3 h-3 inline mr-1 opacity-70" />
            Click para interactuar
          </div>
        )}
      </div>

      {/* Status */}
      <div className="grid grid-cols-3 gap-4 text-sm text-gray-400">
        <div className="bg-gray-900 p-3 rounded-lg">
          <strong className="text-white block mb-1">Estado WS</strong>
          {connected
            ? streaming
              ? '🔴 Transmitiendo'
              : '🟢 Conectado'
            : '⚫ Desconectado'}
        </div>
        <div className="bg-gray-900 p-3 rounded-lg">
          <strong className="text-white block mb-1">Decoder</strong>
          {wcOk === null
            ? '⏳ Verificando…'
            : wcOk
              ? '✅ WebCodecs (nativo)'
              : '❌ No soportado'}
        </div>
        <div className="bg-gray-900 p-3 rounded-lg">
          <strong className="text-white block mb-1">Frames</strong>
          {frameCount > 0
            ? `✅ ${frameCount} renderizados`
            : '⏳ Sin frames aún'}
        </div>
      </div>
    </div>
  );
}