import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Camera, Play, Square, RefreshCw,
  Maximize2, Download, Clock, Wifi, AlertTriangle,
  CheckCircle, Loader2,
} from 'lucide-react';
import api from '../services/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface DeviceOption {
  deviceId: string;
  deviceName: string | null;
  isOnline: boolean;
}

interface ScreenshotFrame {
  base64:    string;
  sizeKB:    number;
  takenAt:   Date;
  commandId: number;
}

type CaptureState = 'idle' | 'requesting' | 'waiting' | 'done' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseScreenshotResult(resultJson: string | null): {
  screenshot: string;
  sizeKB: number;
} | null {
  if (!resultJson) return null;
  try {
    const parsed = JSON.parse(resultJson);
    if (parsed.screenshot) {
      return {
        screenshot: parsed.screenshot,
        sizeKB: parsed.sizeKB || parsed.sizeKb || 0 // acepta ambos casos
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function RemoteViewPage() {
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selDevice, setSelDevice] = useState('');
  const [frame, setFrame] = useState<ScreenshotFrame | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [liveMode, setLiveMode] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [fps, setFps] = useState(0);

  const liveRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fpsCountRef = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // Cargar dispositivos
  useEffect(() => {
    api.getDevices().then(r => {
      if (r.success && r.data) {
        const devs = r.data.devices.map(d => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          isOnline: d.isOnline,
        }));
        setDevices(devs);
        const first = devs.find(d => d.isOnline) || devs[0];
        if (first) setSelDevice(first.deviceId);
      }
    });
  }, []);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      liveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, []);

  // Contador de FPS
  useEffect(() => {
    if (!liveMode) { setFps(0); return; }
    liveTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current);
      fpsCountRef.current = 0;
    }, 1000);
    return () => {
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, [liveMode]);

  // ── Solicitar una captura ─────────────────────────────────────────────────
  const requestCapture = useCallback(async (): Promise<boolean> => {
    if (!selDevice) return false;
    setCaptureState('requesting');
    setErrorMsg('');

    const res = await api.requestScreenshot(selDevice);
    if (!res.success || !res.data) {
      setCaptureState('error');
      setErrorMsg(res.error || 'Error solicitando captura');
      return false;
    }

    const commandId = res.data.commandId;
    setCaptureState('waiting');

    // Polling hasta que el comando esté Executed (max 15s, cada 500ms)
    const MAX_POLLS = 30;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, 500));

      // Si salimos del modo live, abortar
      if (!liveRef.current && liveMode) return false;

      const cmdRes = await api.pollScreenshotResult(commandId);
      if (!cmdRes.success || !cmdRes.data) continue;

      const cmd = cmdRes.data;

      if (cmd.status === 'Executed' && cmd.result) {
        const parsed = parseScreenshotResult(cmd.result);
        if (parsed) {
          setFrame({
            base64: parsed.screenshot,
            width: parsed.width,
            height: parsed.height,
            sizeKb: parsed.sizeKb,
            takenAt: new Date(),
            commandId,
          });
          fpsCountRef.current++;
          setFrameCount(c => c + 1);
          setCaptureState('done');
          return true;
        }
      }

      if (cmd.status === 'Failed') {
        setCaptureState('error');
        setErrorMsg(cmd.errorMessage || 'El dispositivo reportó un error');
        return false;
      }

      if (cmd.status === 'Expired' || cmd.status === 'Cancelled') {
        setCaptureState('error');
        setErrorMsg(`Comando ${cmd.status.toLowerCase()}`);
        return false;
      }
    }

    setCaptureState('error');
    setErrorMsg('Timeout: el dispositivo no respondió en 15s');
    return false;
  }, [selDevice, liveMode]);

  // ── Loop de Live Mode ─────────────────────────────────────────────────────
  const startLive = useCallback(async () => {
    liveRef.current = true;
    setLiveMode(true);
    setFrameCount(0);

    const loop = async () => {
      if (!liveRef.current) return;
      await requestCapture();
      if (liveRef.current) {
        // Pequeña pausa entre capturas para no saturar
        pollRef.current = setTimeout(loop, 500);
      }
    };
    loop();
  }, [requestCapture]);

  const stopLive = useCallback(() => {
    liveRef.current = false;
    setLiveMode(false);
    if (pollRef.current) clearTimeout(pollRef.current);
    setCaptureState('idle');
  }, []);

  // ── Descargar imagen ──────────────────────────────────────────────────────
  const downloadFrame = () => {
    if (!frame) return;
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${frame.base64}`;
    a.download = `screenshot_${selDevice}_${Date.now()}.jpg`;
    a.click();
  };

  const selectedDev = devices.find(d => d.deviceId === selDevice);

  return (
    <div className="space-y-4 h-full flex flex-col">

      {/* Encabezado */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/dispositivos"
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Vista Remota</h1>
            <p className="text-xs text-gray-500">
              Snapshots bajo demanda · modo live ~1fps
            </p>
          </div>
        </div>

        {/* Indicadores live */}
        {liveMode && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5
              bg-red-500/20 border border-red-500/30 rounded-full">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-medium">LIVE</span>
            </div>
            <span className="text-xs text-gray-500">{fps} fps</span>
            <span className="text-xs text-gray-500">{frameCount} frames</span>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
        {/* Selector de dispositivo */}
        <select
          value={selDevice}
          onChange={e => { setSelDevice(e.target.value); stopLive(); setFrame(null); }}
          disabled={liveMode}
          className="flex-1 min-w-48 px-3 py-2 bg-gray-900 border border-gray-800
            rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500
            disabled:opacity-50"
        >
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.isOnline ? '● ' : '○ '}
              {d.deviceName || d.deviceId}
            </option>
          ))}
        </select>

        {/* Estado del dispositivo */}
        {selectedDev && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
            font-medium ${selectedDev.isOnline
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'}`}>
            <Wifi className="w-3.5 h-3.5" />
            {selectedDev.isOnline ? 'Online' : 'Offline'}
          </div>
        )}

        {/* Botón captura única */}
        <button
          onClick={() => requestCapture()}
          disabled={liveMode || captureState === 'requesting' || captureState === 'waiting' || !selectedDev?.isOnline}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700
            disabled:opacity-40 disabled:cursor-not-allowed text-gray-300
            rounded-lg text-sm transition-colors"
        >
          <Camera className="w-4 h-4" />
          Capturar
        </button>

        {/* Botón Live */}
        {!liveMode ? (
          <button
            onClick={startLive}
            disabled={!selectedDev?.isOnline}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30
              disabled:opacity-40 disabled:cursor-not-allowed text-red-400
              rounded-lg text-sm transition-colors border border-red-500/30"
          >
            <Play className="w-4 h-4" />
            Iniciar Live
          </button>
        ) : (
          <button
            onClick={stopLive}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600
              text-white rounded-lg text-sm transition-colors"
          >
            <Square className="w-4 h-4" />
            Detener
          </button>
        )}

        {/* Acciones sobre el frame */}
        {frame && (
          <>
            <button
              onClick={downloadFrame}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700
                text-gray-400 rounded-lg text-sm transition-colors"
              title="Descargar imagen"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => imgRef.current?.requestFullscreen()}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700
                text-gray-400 rounded-lg text-sm transition-colors"
              title="Pantalla completa"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Estado de captura */}
      {captureState !== 'idle' && captureState !== 'done' && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm
          flex-shrink-0 ${captureState === 'error'
            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
            : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
          }`}>
          {captureState === 'requesting' && <Loader2 className="w-4 h-4 animate-spin" />}
          {captureState === 'waiting' && <Loader2 className="w-4 h-4 animate-spin" />}
          {captureState === 'error' && <AlertTriangle className="w-4 h-4" />}
          <span>
            {captureState === 'requesting' && 'Enviando comando al dispositivo…'}
            {captureState === 'waiting' && 'Esperando respuesta del dispositivo…'}
            {captureState === 'error' && errorMsg}
          </span>
        </div>
      )}

      {/* Área principal de visualización */}
      <div className="flex-1 bg-gray-950 border border-gray-800 rounded-xl
        overflow-hidden flex items-center justify-center relative min-h-96">

        {frame ? (
          <>
            {/* Imagen del frame */}
            <img
              ref={imgRef}
              src={`data:image/png;base64,${frame.base64}`}
              alt="Screenshot"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'crisp-edges' }}
            />

            {/* Overlay info */}
            <div className="absolute bottom-0 left-0 right-0 px-4 py-2
              bg-gradient-to-t from-black/80 to-transparent
              flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {frame.takenAt.toLocaleTimeString('es-ES')}
                </span>
                {/* <span>{frame.width} × {frame.height}</span>
                <span>{frame.sizeKb} KB</span> */}
                <span>#{frame.commandId}</span>
              </div>
              {captureState === 'done' && !liveMode && (
                <div className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle className="w-3 h-3" />
                  Capturado
                </div>
              )}
              {liveMode && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  LIVE · {fps} fps
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center p-12">
            <Camera className="w-16 h-16 mx-auto mb-4 text-gray-700" />
            <p className="text-gray-400 font-medium mb-2">Sin captura</p>
            <p className="text-sm text-gray-600 mb-6">
              Selecciona un dispositivo online y presiona "Capturar"
              o inicia el modo Live
            </p>
            <div className="text-xs text-gray-700 space-y-1 text-left
              bg-gray-900 rounded-lg p-4 inline-block">
              <p className="text-gray-500 font-medium mb-2">Requisitos:</p>
              <p>✓ Dispositivo online (WebSocket activo)</p>
              <p>✓ Accessibility Service activo en el dispositivo</p>
              <p>✓ Android 12+ (API 31) para capturas</p>
            </div>
          </div>
        )}

        {/* Overlay de carga sobre imagen existente */}
        {frame && (captureState === 'requesting' || captureState === 'waiting') && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="bg-gray-900/90 rounded-xl px-6 py-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
              <span className="text-sm text-gray-300">
                {captureState === 'requesting' ? 'Enviando…' : 'Capturando…'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Info de uso */}
      {!liveMode && (
        <div className="flex items-start gap-3 p-3 bg-amber-500/5
          border border-amber-500/20 rounded-lg flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-500/60 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600">
            El modo Live envía un comando cada ~2s. Consumo de red estimado: ~50-200 KB/s
            dependiendo del contenido de pantalla. Detén el live cuando no sea necesario.
          </p>
        </div>
      )}
    </div>
  );
}
