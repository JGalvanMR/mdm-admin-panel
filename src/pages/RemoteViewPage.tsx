import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { ArrowLeft, Wifi, Play, Square, Loader2, AlertTriangle, MousePointer } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades H.264
// ─────────────────────────────────────────────────────────────────────────────
function b64ToU8(b64: string): Uint8Array {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function stripStartCode(data: Uint8Array): Uint8Array {
  if (data.length >= 4 && data[0] === 0 && data[1] === 0 && data[2] === 0 && data[3] === 1)
    return data.subarray(4);
  if (data.length >= 3 && data[0] === 0 && data[1] === 0 && data[2] === 1)
    return data.subarray(3);
  return data;
}

function buildAVCCExtraData(rawSPS: Uint8Array, rawPPS: Uint8Array): Uint8Array {
  const sps = stripStartCode(rawSPS);
  const pps = stripStartCode(rawPPS);
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
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `avc1.${h(sps[1])}${h(sps[2])}${h(sps[3])}`;
}

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
  if (starts.length === 0) return data.length > 0 ? [data] : [];
  const nals: Uint8Array[] = [];
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k].pos + starts[k].scLen;
    const end = k + 1 < starts.length ? starts[k + 1].pos : data.length;
    if (end > start) nals.push(data.subarray(start, end));
  }
  return nals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function RemoteViewPage() {
  const { adminKey } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const configReadyRef = useRef(false);
  const tsRef = useRef(0);
  const nalBufferRef = useRef<Uint8Array[]>([]);

  const [devices, setDevices] = useState<{ deviceId: string; deviceName: string | null; isOnline: boolean }[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [wcSupported, setWcSupported] = useState<boolean | null>(null);

  useEffect(() => { setWcSupported(typeof VideoDecoder !== 'undefined'); }, []);
  useEffect(() => {
    api.getDevices().then(res => {
      if (res.success && res.data) {
        const devs = res.data.devices.map((d: any) => ({
          deviceId: d.deviceId, deviceName: d.deviceName, isOnline: d.isOnline,
        }));
        setDevices(devs);
        const first = devs.find((d: any) => d.isOnline) ?? devs[0];
        if (first) setDeviceId(first.deviceId);
      }
    });
  }, []);
  useEffect(() => { if (canvasRef.current) ctxRef.current = canvasRef.current.getContext('2d'); }, []);
  useEffect(() => () => {
    wsRef.current?.close();
    if (decoderRef.current?.state !== 'closed') decoderRef.current?.close();
  }, []);

  const initDecoder = useCallback((spsRaw: Uint8Array, ppsRaw: Uint8Array) => {
    if (decoderRef.current?.state !== 'closed') decoderRef.current?.close();
    const codec = spsToCodecString(spsRaw);
    const description = buildAVCCExtraData(spsRaw, ppsRaw);
    const decoder = new VideoDecoder({
      output: (frame) => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (canvas && ctx) {
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
          }
          ctx.drawImage(frame, 0, 0);
        }
        frame.close();
      },
      error: (e) => console.error('[VideoDecoder]', e),
    });
    decoder.configure({ codec, codedWidth: 1080, codedHeight: 2336, description, optimizeForLatency: true });
    decoderRef.current = decoder;
    configReadyRef.current = true;
    tsRef.current = 0;
    console.log('[Decoder] Configurado:', codec);
  }, []);

  const processFrame = useCallback((nals: Uint8Array[]) => {
    const decoder = decoderRef.current;
    if (!decoder || decoder.state !== 'configured') return;
    const filtered = nals.filter(n => { const t = n[0] & 0x1f; return t !== 7 && t !== 8; });
    if (filtered.length === 0) return;
    let total = 0;
    for (const n of filtered) total += 4 + n.length;
    const avcc = new Uint8Array(total);
    const view = new DataView(avcc.buffer);
    let off = 0;
    for (const n of filtered) {
      view.setUint32(off, n.length, false);
      avcc.set(n, off + 4);
      off += 4 + n.length;
    }
    const isKey = filtered.some(n => (n[0] & 0x1f) === 5);
    try {
      decoder.decode(new EncodedVideoChunk({
        type: isKey ? 'key' : 'delta',
        timestamp: tsRef.current,
        data: avcc,
      }));
      tsRef.current += 33333;
    } catch (e) {
      console.error('[Decode]', e);
    }
  }, []);

  const handleVideoData = useCallback((data: Uint8Array) => {
    if (!decoderRef.current || decoderRef.current.state !== 'configured' || !configReadyRef.current) return;
    const nals = splitAnnexB(data);
    const buffer = nalBufferRef.current;
    for (const nal of nals) {
      const nalType = nal[0] & 0x1f;
      if (nalType === 9) { if (buffer.length) { processFrame(buffer); buffer.length = 0; } continue; }
      buffer.push(nal);
      if (nalType === 5 || nalType === 1) { processFrame(buffer); buffer.length = 0; }
    }
  }, [processFrame]);

  const handleVideoConfig = useCallback((msg: any) => {
    if (!msg.sps || !msg.pps) return;
    try { initDecoder(b64ToU8(msg.sps), b64ToU8(msg.pps)); }
    catch (e) { console.error(e); }
  }, [initDecoder]);

  const connect = useCallback(() => {
    if (!deviceId || !adminKey) return;
    const base = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
    const wsUrl = `${base.replace(/^http/, 'ws')}/ws/viewer`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', adminKey }));
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data);
        if (msg.status === 'authenticated') {
          ws.send(JSON.stringify({ type: 'watch', deviceId }));
          setConnected(true);
        } else if (msg.type === 'video_config') {
          handleVideoConfig(msg);
        } else if (msg.error) {
          setError(msg.error);
        }
      } else if (e.data instanceof ArrayBuffer) {
        handleVideoData(new Uint8Array(e.data));
      }
    };
    ws.onclose = () => { setConnected(false); setStreaming(false); configReadyRef.current = false; };
    ws.onerror = () => setError('Error WebSocket');
  }, [deviceId, adminKey, handleVideoConfig, handleVideoData]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    decoderRef.current?.close();
    configReadyRef.current = false;
    setConnected(false);
    setStreaming(false);
  }, []);

  const startStreaming = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const res = await api.sendCommand({ deviceId, commandType: 'START_SCREEN_STREAM', parameters: JSON.stringify({ width: 1080, height: 2336, bitrate: 1_500_000, fps: 30 }), priority: 10 });
      if (res.success) setStreaming(true);
      else setError(res.error || 'Error');
    } catch { setError('Error de red'); }
    setLoading(false);
  }, [deviceId]);

  const stopStreaming = useCallback(async () => {
    if (!deviceId) return;
    await api.sendCommand({ deviceId, commandType: 'STOP_SCREEN_STREAM', priority: 10 });
    setStreaming(false);
  }, [deviceId]);

  const selectedDevice = devices.find(d => d.deviceId === deviceId);

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Link to="/dispositivos" className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold text-white">Vista Remota</h1>
        {streaming && <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm animate-pulse">EN VIVO</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 p-4 rounded-lg">
        <select value={deviceId} onChange={e => { setDeviceId(e.target.value); disconnect(); }} disabled={connected} className="flex-1 min-w-48 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
          {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.isOnline ? '🟢' : '🔴'} {d.deviceName || d.deviceId}</option>)}
        </select>
        {!connected ? (
          <button onClick={connect} disabled={!selectedDevice?.isOnline || wcSupported === false} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 text-white rounded-lg flex items-center gap-2"><Wifi className="w-4 h-4" /> Conectar</button>
        ) : (
          <button onClick={disconnect} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"><Square className="w-4 h-4" /> Desconectar</button>
        )}
        {connected && (streaming ? (
          <button onClick={stopStreaming} disabled={loading} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg flex items-center gap-2">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />} Detener</button>
        ) : (
          <button onClick={startStreaming} disabled={loading || wcSupported === false} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Iniciar Video</button>
        ))}
      </div>
      {wcSupported === false && <div className="p-4 bg-red-500/10 text-red-400 rounded-lg"><AlertTriangle className="w-5 h-5 inline mr-2" />Navegador no soporta WebCodecs.</div>}
      {error && <div className="p-4 bg-red-500/10 text-red-400 rounded-lg"><AlertTriangle className="w-5 h-5 inline mr-2" />{error}</div>}
      <div className="relative bg-black rounded-lg overflow-hidden border-2 border-gray-800 cursor-crosshair mx-auto" style={{ aspectRatio: '1080 / 2336', maxWidth: '420px' }}>
        <canvas ref={canvasRef} width={1080} height={2336} className="absolute inset-0 w-full h-full" style={{ display: streaming ? 'block' : 'none' }} />
        {!streaming && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white"><Play className="w-12 h-12 opacity-40" /><p className="text-sm mt-2">{connected ? 'Conectado. Presiona "Iniciar Video"' : 'Desconectado'}</p></div>}
      </div>
    </div>
  );
}