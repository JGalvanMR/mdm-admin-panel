import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { ArrowLeft, Wifi, Play, Square, Loader2, AlertTriangle } from 'lucide-react';

declare global {
  interface Window {
    Player: any;
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

  // Cargar lista de dispositivos
  useEffect(() => {
    api.getDevices().then(res => {
      if (res.success && res.data) {
        const devs = res.data.devices.map(d => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          isOnline: d.isOnline,
        }));
        setDevices(devs);
        const firstOnline = devs.find(d => d.isOnline);
        if (firstOnline) setDeviceId(firstOnline.deviceId);
      }
    });
  }, []);

  // Cargar Broadway dinámicamente (asegurar orden)
  useEffect(() => {
    if (!canvasRef.current) return;
    if (playerRef.current) return;

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false; // Mantener orden
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
          canvas: canvasRef.current
        });
        setPlayerReady(true);
        console.log('Broadway Player inicializado');
      } catch (err) {
        console.error('Error inicializando Player:', err);
        setError('Error al inicializar decodificador de video');
      }
    };

    // Cargar Decoder.js y luego Player.js
    loadScript('/broadway/Decoder.js')
      .then(() => loadScript('/broadway/Player.js'))
      .then(() => {
        // Pequeña pausa para que el objeto window.Player esté completamente definido
        setTimeout(initializePlayer, 100);
      })
      .catch(err => {
        console.error(err);
        setError('No se pudieron cargar los scripts de Broadway');
      });
  }, [canvasRef]);

  // Conectar WebSocket
  const connect = () => {
    if (!deviceId) return;
    const wsUrl = `${import.meta.env.VITE_SERVER_URL?.replace('http', 'ws')}/ws/viewer`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', adminKey }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.status === 'watching') {
          setConnected(true);
          setError('');
        } else if (msg.error) {
          setError(msg.error);
          setConnected(false);
        }
      } else if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(buffer);
          if (playerRef.current && playerReady) {
            playerRef.current.decode(uint8Array);
          }
        };
        reader.readAsArrayBuffer(event.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setStreaming(false);
    };

    ws.onerror = () => {
      setError('Error de conexión WebSocket');
      setConnected(false);
    };
  };

  const disconnect = () => {
    wsRef.current?.close();
    setConnected(false);
    setStreaming(false);
  };

  const startStreaming = async () => {
    setLoading(true);
    const res = await api.sendCommand({
      deviceId,
      commandType: 'START_SCREEN_STREAM',
      parameters: null,
      priority: 5
    });
    if (res.success) {
      setStreaming(true);
    } else {
      setError(res.error || 'No se pudo iniciar el streaming');
    }
    setLoading(false);
  };

  const stopStreaming = async () => {
    setLoading(true);
    await api.sendCommand({
      deviceId,
      commandType: 'STOP_SCREEN_STREAM',
      parameters: null,
      priority: 5
    });
    setStreaming(false);
    setLoading(false);
  };

  const sendInput = (type: string, x?: number, y?: number, keyCode?: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg: any = { type: 'input', event: type };
    if (x !== undefined) msg.x = Math.round(x);
    if (y !== undefined) msg.y = Math.round(y);
    if (keyCode !== undefined) msg.keyCode = keyCode;
    wsRef.current.send(JSON.stringify(msg));
  };

  // Eventos de ratón y teclado
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!connected) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      sendInput('mouse_move', x, y);
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (!connected) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      sendInput('mouse_down', x, y);
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (!connected) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      sendInput('mouse_up', x, y);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!connected) return;
      sendInput('key_down', undefined, undefined, e.keyCode);
      e.preventDefault();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!connected) return;
      sendInput('key_up', undefined, undefined, e.keyCode);
      e.preventDefault();
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [canvasRef.current, connected]);

  const selectedDevice = devices.find(d => d.deviceId === deviceId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/dispositivos" className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-white">Vista Remota (Streaming)</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={deviceId}
          onChange={e => setDeviceId(e.target.value)}
          disabled={connected}
          className="flex-1 min-w-48 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white"
        >
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.isOnline ? '● ' : '○ '}{d.deviceName || d.deviceId}
            </option>
          ))}
        </select>

        {!connected ? (
          <button
            onClick={connect}
            disabled={!selectedDevice?.isOnline}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg disabled:opacity-50"
          >
            Conectar
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg"
          >
            Desconectar
          </button>
        )}

        {connected && !streaming && (
          <button
            onClick={startStreaming}
            disabled={loading || !playerReady}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : <Play className="w-4 h-4 inline mr-1" />}
            Iniciar streaming
          </button>
        )}

        {connected && streaming && (
          <button
            onClick={stopStreaming}
            disabled={loading}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : <Square className="w-4 h-4 inline mr-1" />}
            Detener streaming
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {!selectedDevice?.isOnline && !connected && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
          El dispositivo no está online. No se puede conectar.
        </div>
      )}

      {!playerReady && !error && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando decodificador de video...
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        style={{ width: '100%', height: 'auto', border: '1px solid #333', background: '#000' }}
      />

      <div className="text-xs text-gray-500 text-center">
        {connected ? (streaming ? 'Conectado y transmitiendo – mouse y teclado se envían al dispositivo.' : 'Conectado, esperando streaming. Presiona "Iniciar streaming".') : 'Conecta para ver la pantalla remota.'}
      </div>
    </div>
  );
}