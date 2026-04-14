import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { ArrowLeft, Wifi, Play, Square, Loader2, AlertTriangle, MousePointer } from 'lucide-react';

declare global {
  interface Window {
    Player: any;
    Decoder: any;
  }
}

export default function RemoteViewPage() {
  const { adminKey } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<any>(null);
  const [devices, setDevices] = useState<{ deviceId: string; deviceName: string | null; isOnline: boolean }[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [videoConfig, setVideoConfig] = useState<any>(null);

  // Cargar dispositivos
  useEffect(() => {
    api.getDevices().then(res => {
      if (res.success && res.data) {
        const devs = res.data.devices.map((d: any) => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          isOnline: d.isOnline,
        }));
        setDevices(devs);
        const firstOnline = devs.find((d: any) => d.isOnline);
        if (firstOnline) setDeviceId(firstOnline.deviceId);
      }
    });
  }, []);

  // Cargar Broadway.js
  useEffect(() => {
    if (!canvasRef.current || playerRef.current) return;

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    };

    const initializePlayer = () => {
      if (!window.Player) {
        setError('Decodificador Broadway no disponible');
        return;
      }
      try {
        playerRef.current = new window.Player({
          useWorker: true,
          workerFile: '/broadway/Decoder.js',
          webgl: true,
          size: { width: 1280, height: 720 }
        });
        
        // Asignar canvas
        if (canvasRef.current) {
          playerRef.current.canvas = canvasRef.current;
        }
        
        setPlayerReady(true);
        console.log('Broadway Player inicializado');
      } catch (err) {
        console.error('Error inicializando Player:', err);
        setError('Error al inicializar decodificador de video');
      }
    };

    // Cargar en orden: Decoder.js primero, luego Player.js
    loadScript('/broadway/Decoder.js')
      .then(() => loadScript('/broadway/Player.js'))
      .then(() => {
        setTimeout(initializePlayer, 200);
      })
      .catch(err => {
        console.error(err);
        setError('No se pudieron cargar los scripts de Broadway. Verifica que /public/broadway/ exista.');
      });
  }, []);

  // Concatenar arrays (helper)
  const concatenateArrays = (a: Uint8Array, b: Uint8Array): Uint8Array => {
    const result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
  };

  // Conectar WebSocket
  const connect = useCallback(() => {
    if (!deviceId || !adminKey) {
      setError('Selecciona un dispositivo y asegúrate de estar autenticado');
      return;
    }

    const wsUrl = `${import.meta.env.VITE_SERVER_URL?.replace('http', 'ws')}/ws/viewer`;
    console.log('Conectando a:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WS conectado, enviando auth...');
      ws.send(JSON.stringify({ type: 'auth', adminKey }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        console.log('WS Mensaje:', msg);

        if (msg.status === 'authenticated') {
          console.log('Autenticado, solicitando ver dispositivo...');
          ws.send(JSON.stringify({ type: 'watch', deviceId }));
        }
        else if (msg.status === 'watching') {
          setConnected(true);
          setError('');
          // Iniciar streaming automáticamente
          startStreaming();
        } 
        else if (msg.error) {
          setError(msg.error);
          setConnected(false);
          ws.close();
        }
        else if (msg.type === 'video_config') {
          handleVideoConfig(msg);
        }
      } else if (event.data instanceof ArrayBuffer) {
        const data = new Uint8Array(event.data);
        handleVideoData(data);
      }
    };

    ws.onclose = (e) => {
      console.log('WS cerrado:', e.code, e.reason);
      setConnected(false);
      setStreaming(false);
    };

    ws.onerror = (e) => {
      console.error('WS Error:', e);
      setError('Error de conexión WebSocket');
      setConnected(false);
    };
  }, [deviceId, adminKey]);

  const handleVideoConfig = (config: any) => {
    if (!config.sps || !config.pps || !playerRef.current) return;
    
    try {
      // Convertir Base64 a Uint8Array
      const spsString = atob(config.sps);
      const ppsString = atob(config.pps);
      
      const sps = new Uint8Array(spsString.length);
      const pps = new Uint8Array(ppsString.length);
      
      for (let i = 0; i < spsString.length; i++) sps[i] = spsString.charCodeAt(i);
      for (let i = 0; i < ppsString.length; i++) pps[i] = ppsString.charCodeAt(i);
      
      // NAL start code
      const startCode = new Uint8Array([0, 0, 0, 1]);
      
      // En Broadway, debemos enviar SPS y PPS antes de los frames
      const spsData = concatenateArrays(startCode, sps);
      const ppsData = concatenateArrays(startCode, pps);
      
      playerRef.current.decode(spsData);
      playerRef.current.decode(ppsData);
      
      setVideoConfig(config);
      console.log('Decoder configurado con SPS/PPS');
    } catch (e) {
      console.error('Error procesando config H264:', e);
    }
  };

  const handleVideoData = (data: Uint8Array) => {
    if (!playerRef.current) return;
    
    // Asegurar start code
    let nalData = data;
    if (data.length < 4 || data[0] !== 0 || data[1] !== 0 || data[2] !== 0 || data[3] !== 1) {
      const startCode = new Uint8Array([0, 0, 0, 1]);
      nalData = concatenateArrays(startCode, data);
    }
    
    try {
      playerRef.current.decode(nalData);
    } catch (e) {
      console.error('Error decodificando frame:', e);
    }
  };

  // Enviar input al dispositivo
  const sendInput = useCallback((type: string, x?: number, y?: number, keyCode?: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    const msg: any = { 
      type: 'input', 
      eventType: type,
      timestamp: Date.now()
    };
    if (x !== undefined) msg.x = Math.round(x);
    if (y !== undefined) msg.y = Math.round(y);
    if (keyCode !== undefined) msg.keyCode = keyCode;
    
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  // Eventos de mouse
  const handleMouseEvent = useCallback((e: React.MouseEvent, type: string) => {
    if (!canvasRef.current || !connected) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    sendInput(type, x, y);
  }, [connected, sendInput]);

  // Iniciar/Detener streaming
const startStreaming = async () => {
    setLoading(true);
    try {
        const res = await api.sendCommand({
            deviceId,
            commandType: 'START_SCREEN_STREAM',
            parameters: JSON.stringify({ width: 1280, height: 720, bitrate: 1500000, fps: 25 }),
            priority: 10
        });
        
        if (res.success) {
            setStreaming(true);
            setError('');
        } else {
            // Detectar si es error de permiso
            if (res.error?.includes("PERMISO_REQUERIDO")) {
                setError("📱 Se solicitó permiso en el dispositivo Android. Por favor acepta el diálogo de captura de pantalla y luego presiona 'Iniciar Video' nuevamente.");
                // No es un error real, es una instrucción
            } else {
                setError(res.error || 'Error iniciando streaming');
            }
        }
    } catch (e) {
        setError('Error de conexión al iniciar streaming');
    }
    setLoading(false);
};

  const stopStreaming = async () => {
    setLoading(true);
    try {
      await api.sendCommand({
        deviceId,
        commandType: 'STOP_SCREEN_STREAM',
        priority: 10
      });
      setStreaming(false);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const disconnect = () => {
    wsRef.current?.close();
    setConnected(false);
    setStreaming(false);
  };

  const selectedDevice = devices.find(d => d.deviceId === deviceId);

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Link to="/dispositivos" className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Vista Remota</h1>
        {streaming && (
          <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm flex items-center gap-2 animate-pulse">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            EN VIVO
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-gray-900 p-4 rounded-lg">
        <select
          value={deviceId}
          onChange={e => setDeviceId(e.target.value)}
          disabled={connected}
          className="flex-1 min-w-48 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
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
            disabled={!selectedDevice?.isOnline || loading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2"
          >
            <Wifi className="w-4 h-4" />
            Conectar
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
          >
            <Square className="w-4 h-4" />
            Desconectar
          </button>
        )}

        {connected && (
          streaming ? (
            <button
              onClick={stopStreaming}
              disabled={loading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Detener Video
            </button>
          ) : (
            <button
              onClick={startStreaming}
              disabled={loading || !playerReady}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Iniciar Video
            </button>
          )
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {!selectedDevice?.isOnline && !connected && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
          El dispositivo no está online. No se puede conectar.
        </div>
      )}

      {!playerReady && !error && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando decodificador de video...
        </div>
      )}

      <div className="relative bg-black rounded-lg overflow-hidden border-2 border-gray-800" style={{ aspectRatio: '16/9' }}>
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full cursor-crosshair block"
          style={{ imageRendering: 'pixelated' }}
          onMouseDown={(e) => handleMouseEvent(e, 'touch_down')}
          onMouseUp={(e) => handleMouseEvent(e, 'touch_up')}
          onMouseMove={(e) => handleMouseEvent(e, 'touch_move')}
        />
        
        {!streaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-4">
            {connected ? (
              <>
                <Play className="w-12 h-12 opacity-50" />
                <p>Conectado. Presiona "Iniciar Video" para ver la pantalla.</p>
              </>
            ) : (
              <>
                <Wifi className="w-12 h-12 opacity-50" />
                <p>Desconectado</p>
              </>
            )}
          </div>
        )}
        
        {streaming && (
          <div className="absolute top-4 right-4 px-3 py-1 bg-black/50 text-white text-xs rounded backdrop-blur">
            <MousePointer className="w-3 h-3 inline mr-1" />
            Haz click para interactuar
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm text-gray-400">
        <div className="bg-gray-900 p-3 rounded">
          <strong className="text-white block mb-1">Estado</strong>
          {connected ? (streaming ? 'Transmitiendo video' : 'Conectado') : 'Desconectado'}
        </div>
        <div className="bg-gray-900 p-3 rounded">
          <strong className="text-white block mb-1">Decoder</strong>
          {playerReady ? 'Broadway.js listo' : 'Cargando...'}
        </div>
        <div className="bg-gray-900 p-3 rounded">
          <strong className="text-white block mb-1">Resolución</strong>
          1280x720 ( adaptable )
        </div>
      </div>
    </div>
  );
}