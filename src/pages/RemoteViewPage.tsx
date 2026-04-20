// src/pages/RemoteViewPage.tsx
//
// ══════════════════════════════════════════════════════════════════════════════
// ROOT CAUSES FIXED
// ══════════════════════════════════════════════════════════════════════════════
//
// 1. KEYFRAME STARVATION (primary — why output callback never fires)
//    VideoDecoder silently discards every 'delta' chunk until it receives a
//    'key' chunk.  A viewer that joins mid-stream may wait many seconds (or
//    forever if the hardware encoder ignores KEY_I_FRAME_INTERVAL).
//    Fix → after initDecoder(), start a WATCHDOG_MS watchdog; if no frame
//    arrives, send STOP_SCREEN_STREAM + START_SCREEN_STREAM so the Android
//    encoder restarts and emits a fresh SPS/PPS + IDR.
//
// 2. description MUST be a plain ArrayBuffer (secondary)
//    Chrome's WebCodecs reads the AVCDecoderConfigurationRecord from the
//    backing ArrayBuffer at byteOffset 0.  A Uint8Array view created via
//    subarray() can have byteOffset > 0, producing a silently corrupt record.
//    Fix → pass description.buffer (always byteOffset 0 since we allocate
//    the Uint8Array with `new Uint8Array(N)`).
//
// 3. NAL units stored as subarray() views of released ArrayBuffers (tertiary)
//    WebSocket ArrayBuffers are freed as soon as onmessage() returns.
//    Any view created with data.subarray() is invalid afterward, so the
//    decoder's async path reads garbage bytes.
//    Fix → splitAnnexB() now uses data.slice() which always copies.
//
// ══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Wifi, Play, Square,
  Loader2, AlertTriangle, MousePointer, RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// H.264 / NAL helpers  (pure, no React deps)
// ─────────────────────────────────────────────────────────────────────────────

/** Base-64 string → owned Uint8Array */
function b64ToU8(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Remove a 3-byte (0,0,1) or 4-byte (0,0,0,1) Annex-B start code.
 * Returns a COPY (slice) so the result is always offset-0.
 */
function stripStartCode(data: Uint8Array): Uint8Array {
  if (data.length >= 4 &&
    data[0] === 0 && data[1] === 0 && data[2] === 0 && data[3] === 1)
    return data.slice(4);
  if (data.length >= 3 &&
    data[0] === 0 && data[1] === 0 && data[2] === 1)
    return data.slice(3);
  return data.slice(0);
}

/**
 * Build an AVCDecoderConfigurationRecord from raw SPS + PPS NAL units.
 * The returned Uint8Array is freshly allocated (byteOffset === 0).
 */
function buildAVCCExtraData(rawSPS: Uint8Array, rawPPS: Uint8Array): Uint8Array {
  const sps = stripStartCode(rawSPS); // starts with 0x67
  const pps = stripStartCode(rawPPS); // starts with 0x68
  const buf = new Uint8Array(11 + sps.length + pps.length);
  let i = 0;
  buf[i++] = 0x01;                       // configurationVersion
  buf[i++] = sps[1];                     // AVCProfileIndication
  buf[i++] = sps[2];                     // profile_compatibility
  buf[i++] = sps[3];                     // AVCLevelIndication
  buf[i++] = 0xff;                       // reserved | lengthSizeMinusOne=3
  buf[i++] = 0xe1;                       // reserved | numSPS=1
  buf[i++] = (sps.length >> 8) & 0xff;
  buf[i++] = sps.length & 0xff;
  buf.set(sps, i); i += sps.length;
  buf[i++] = 0x01;                       // numPPS
  buf[i++] = (pps.length >> 8) & 0xff;
  buf[i++] = pps.length & 0xff;
  buf.set(pps, i);
  return buf;
}

/**
 * Derive the avc1 codec string from the raw SPS NAL unit.
 * Format: avc1.PPCCLL
 */
function spsToCodecString(rawSPS: Uint8Array): string {
  const sps = stripStartCode(rawSPS); // sps[0]=0x67 NAL header
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `avc1.${h(sps[1])}${h(sps[2])}${h(sps[3])}`;
}

/**
 * Split Annex-B byte-stream into individual NAL unit payloads.
 * Each returned Uint8Array is an OWNED COPY (.slice) so it stays
 * valid after the WebSocket ArrayBuffer is released.
 */
function splitAnnexB(data: Uint8Array): Uint8Array[] {
  const starts: { pos: number; scLen: number }[] = [];
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
  if (starts.length === 0)
    return data.length > 0 ? [data.slice(0)] : [];

  return starts.map((sc, k) => {
    const s = sc.pos + sc.scLen;
    const e = k + 1 < starts.length ? starts[k + 1].pos : data.length;
    // ✅ FIX 3: .slice() not .subarray() — owned copy, safe after WS release
    return e > s ? data.slice(s, e) : new Uint8Array(0);
  }).filter(n => n.length > 0);
}

/** Pack NAL units into AVCC format (4-byte big-endian length prefix each). */
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

const WATCHDOG_MS = 3000; // ms to wait for first keyframe before forcing one

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function RemoteViewPage() {
  const { adminKey } = useAuth();

  // Refs (mutations never cause re-renders)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const configReadyRef = useRef(false);
  const tsRef = useRef(0);
  const nalBufRef = useRef<Uint8Array[]>([]);   // owned copies
  const firstFrameRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef('');                 // stable copy for callbacks

  const [devices, setDevices] = useState<
    { deviceId: string; deviceName: string | null; isOnline: boolean }[]
  >([]);
  const [deviceId, setDeviceId] = useState('');
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [wcOk, setWcOk] = useState<boolean | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [waitingKey, setWaitingKey] = useState(false);

  // Keep stable ref in sync
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => { setWcOk(typeof VideoDecoder !== 'undefined'); }, []);

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
    });
  }, []);

  useEffect(() => {
    if (canvasRef.current)
      ctxRef.current = canvasRef.current.getContext('2d');
  }, []);

  useEffect(() => () => {
    wsRef.current?.close();
    if (decoderRef.current?.state !== 'closed') decoderRef.current?.close();
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
  }, []);

  // ── Force keyframe (stop + restart stream) ────────────────────────────────
  const forceKeyframe = useCallback(async () => {
    const devId = deviceIdRef.current;
    if (!devId) return;
    console.warn('[Keyframe] watchdog — restarting encoder for fresh IDR');
    setWaitingKey(true);
    try {
      await api.sendCommand({ deviceId: devId, commandType: 'STOP_SCREEN_STREAM', priority: 10 });
      await new Promise(r => setTimeout(r, 400));
      await api.sendCommand({
        deviceId: devId,
        commandType: 'START_SCREEN_STREAM',
        parameters: JSON.stringify({ width: 1080, height: 2336, bitrate: 1_500_000, fps: 30 }),
        priority: 10,
      });
    } catch (e) {
      console.error('[Keyframe] restart failed:', e);
    }
  }, []);

  // ── VideoDecoder init ─────────────────────────────────────────────────────
  const initDecoder = useCallback((spsRaw: Uint8Array, ppsRaw: Uint8Array) => {
    if (decoderRef.current?.state !== 'closed') decoderRef.current?.close();

    const codec = spsToCodecString(spsRaw);
    const extraData = buildAVCCExtraData(spsRaw, ppsRaw);

    // ✅ FIX 2: pass .buffer (plain ArrayBuffer, byteOffset 0) not the Uint8Array view.
    //    Some Chrome versions read from the backing ArrayBuffer ignoring byteOffset,
    //    producing a corrupt AVCDecoderConfigurationRecord when offset != 0.
    const description = extraData.buffer;

    const decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        if (!firstFrameRef.current) {
          firstFrameRef.current = true;
          setWaitingKey(false);
          if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
        }
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (canvas && ctx) {
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
          }
          ctx.drawImage(frame, 0, 0);
          setFrameCount(c => c + 1);
        }
        frame.close();
      },
      error: (e: DOMException) => {
        console.error('[VideoDecoder]', e.message);
        setError(`Decoder error: ${e.message}`);
      },
    });

    // ── Do NOT hardcode codedWidth / codedHeight ──────────────────────────
    // If the real SPS encodes different dimensions (e.g. 1088 instead of 1080
    // due to macroblock padding) the mismatch causes the decoder to either
    // throw synchronously or silently produce no output.
    // Omitting them lets the browser derive dimensions from the description.
    decoder.configure({ codec, description, optimizeForLatency: true });

    decoderRef.current = decoder;
    configReadyRef.current = true;
    firstFrameRef.current = false;
    tsRef.current = 0;
    nalBufRef.current = [];

    console.log(`[VideoDecoder] configured — codec: ${codec}`);

    // ── Keyframe watchdog ─────────────────────────────────────────────────
    setWaitingKey(true);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      if (!firstFrameRef.current) forceKeyframe();
    }, WATCHDOG_MS);
  }, [forceKeyframe]);

  // ── video_config handler ──────────────────────────────────────────────────
  const handleVideoConfig = useCallback((msg: { sps?: string; pps?: string }) => {
    if (!msg.sps || !msg.pps) return;
    try {
      initDecoder(b64ToU8(msg.sps), b64ToU8(msg.pps));
    } catch (e) {
      console.error('[VideoConfig]', e);
      setError('Failed to configure H.264 decoder');
    }
  }, [initDecoder]);

  // ── Binary frame handler ──────────────────────────────────────────────────
  const handleVideoData = useCallback((data: Uint8Array) => {
    const decoder = decoderRef.current;
    if (!decoder || decoder.state !== 'configured' || !configReadyRef.current) return;
    if (decoder.decodeQueueSize > 10) {
      console.warn('[VideoData] queue pressure — dropping frame');
      return;
    }

    const nals = splitAnnexB(data); // owned copies
    const buf = nalBufRef.current;

    for (const nal of nals) {
      const type = nal[0] & 0x1f;

      if (type === 9) {                  // AUD → flush pending access unit
        if (buf.length) flushAU(decoder, buf);
        continue;
      }
      if (type === 7 || type === 8) continue; // SPS/PPS — already in description

      buf.push(nal);
      if (type === 5 || type === 1) flushAU(decoder, buf); // IDR or non-IDR slice
    }
  }, []);

  function flushAU(decoder: VideoDecoder, buf: Uint8Array[]) {
    if (!buf.length) return;
    const avcc = nalListToAVCC(buf);
    const isKey = buf.some(n => (n[0] & 0x1f) === 5);
    buf.length = 0;
    try {
      decoder.decode(new EncodedVideoChunk({
        type: isKey ? 'key' : 'delta',
        timestamp: tsRef.current,
        data: avcc,
      }));
      tsRef.current += 33_333; // ~30 fps in µs
    } catch (e) {
      console.error('[flushAU]', e);
    }
  }

  // ── Input forwarding ──────────────────────────────────────────────────────
  const sendInput = useCallback((eventType: string, x: number, y: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'input', eventType, x: Math.round(x), y: Math.round(y), timestamp: Date.now() }));
  }, []);

  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!deviceId || !adminKey) { setError('Missing device or auth key'); return; }
    const ex = wsRef.current;
    if (ex && ex.readyState !== WebSocket.CLOSED && ex.readyState !== WebSocket.CLOSING) return;

    const base = import.meta.env.VITE_SERVER_URL || 'http://192.168.123.155:5000';
    const wsUrl = `${base.replace(/^http/, 'ws')}/ws/viewer`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', adminKey }));

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.status === 'authenticated') {
          ws.send(JSON.stringify({ type: 'watch', deviceId }));
        } else if (msg.status === 'watching') {
          setConnected(true);
          setError('');
        } else if (msg.type === 'video_config') {
          handleVideoConfig(msg);
        } else if (msg.error) {
          setError(msg.error);
          setConnected(false);
          ws.close();
        }
      } else if (event.data instanceof ArrayBuffer) {
        handleVideoData(new Uint8Array(event.data));
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      setConnected(false); setStreaming(false); setWaitingKey(false);
      configReadyRef.current = false;
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    };

    ws.onerror = () => { setError('WebSocket error'); setConnected(false); };
  }, [deviceId, adminKey, handleVideoConfig, handleVideoData]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    if (decoderRef.current?.state !== 'closed') decoderRef.current?.close();
    decoderRef.current = null;
    configReadyRef.current = false;
    nalBufRef.current = [];
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    setConnected(false); setStreaming(false); setWaitingKey(false); setFrameCount(0);
  }, []);

  // ── Streaming commands ────────────────────────────────────────────────────
  const startStreaming = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true); setError('');
    firstFrameRef.current = false;
    configReadyRef.current = false;
    nalBufRef.current = [];
    try {
      const res = await api.sendCommand({
        deviceId,
        commandType: 'START_SCREEN_STREAM',
        parameters: JSON.stringify({ width: 1080, height: 2336, bitrate: 1_500_000, fps: 30 }),
        priority: 10,
      });
      if (res.success) setStreaming(true);
      else {
        const msg = res.error ?? 'Error starting stream';
        setError(msg.includes('PERMISO_REQUERIDO')
          ? '📱 Acepta el permiso de captura en el dispositivo y reintenta.'
          : msg);
      }
    } catch { setError('Network error'); }
    setLoading(false);
  }, [deviceId]);

  const stopStreaming = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    try { await api.sendCommand({ deviceId, commandType: 'STOP_SCREEN_STREAM', priority: 10 }); }
    catch { /**/ }
    configReadyRef.current = false;
    nalBufRef.current = [];
    setStreaming(false); setWaitingKey(false); setLoading(false);
  }, [deviceId]);

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedDevice = devices.find(d => d.deviceId === deviceId);

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/dispositivos" className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
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

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 p-4 rounded-lg">
        <select
          value={deviceId}
          onChange={e => { setDeviceId(e.target.value); disconnect(); }}
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
          <button onClick={connect} disabled={!selectedDevice?.isOnline || loading || wcOk === false}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 text-white rounded-lg flex items-center gap-2 transition-colors">
            <Wifi className="w-4 h-4" /> Conectar
          </button>
        ) : (
          <button onClick={disconnect}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 transition-colors">
            <Square className="w-4 h-4" /> Desconectar
          </button>
        )}

        {connected && (streaming ? (
          <>
            <button onClick={forceKeyframe} disabled={loading} title="Forzar keyframe (reiniciar encoder)"
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={stopStreaming} disabled={loading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Detener Video
            </button>
          </>
        ) : (
          <button onClick={startStreaming} disabled={loading || wcOk === false}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Iniciar Video
          </button>
        ))}
      </div>

      {/* Alerts */}
      {wcOk === false && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">Tu navegador no soporta <strong>WebCodecs API</strong>. Usa Chrome 94+ o Edge 94+.</span>
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
          Esperando el primer IDR keyframe. Si no llega en {WATCHDOG_MS / 1000}s el encoder reiniciará automáticamente.
        </div>
      )}

      {/* Video */}
      <div
        className="relative bg-black rounded-lg overflow-hidden border-2 border-gray-800 cursor-crosshair select-none mx-auto"
        style={{ aspectRatio: '1080 / 2336', maxWidth: '420px' }}
        onMouseDown={e => { const c = getCanvasCoords(e); if (c && streaming) sendInput('touch_down', c.x, c.y); }}
        onMouseUp={e => { const c = getCanvasCoords(e); if (c && streaming) sendInput('touch_up', c.x, c.y); }}
        onMouseMove={e => { if (e.buttons !== 1) return; const c = getCanvasCoords(e); if (c && streaming) sendInput('touch_move', c.x, c.y); }}
      >
        <canvas
          ref={canvasRef}
          width={1080}
          height={2336}
          className="absolute inset-0 w-full h-full"
          style={{ display: (streaming && !waitingKey) ? 'block' : 'none' }}
        />

        {(!streaming || waitingKey) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-4 pointer-events-none">
            {connected ? (
              <>
                {streaming && waitingKey
                  ? <Loader2 className="w-12 h-12 opacity-40 animate-spin" />
                  : <Play className="w-12 h-12 opacity-40" />}
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
          {connected ? (streaming ? '🔴 Transmitiendo' : '🟢 Conectado') : '⚫ Desconectado'}
        </div>
        <div className="bg-gray-900 p-3 rounded-lg">
          <strong className="text-white block mb-1">Decoder</strong>
          {wcOk === null ? '⏳ Verificando…' : wcOk ? '✅ WebCodecs (nativo)' : '❌ No soportado'}
        </div>
        <div className="bg-gray-900 p-3 rounded-lg">
          <strong className="text-white block mb-1">Frames</strong>
          {frameCount > 0 ? `✅ ${frameCount} renderizados` : '⏳ Sin frames aún'}
        </div>
      </div>
    </div>
  );
}
