import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, Search, RefreshCw, Battery, Wifi, WifiOff, Eye, Terminal, Monitor, Trash2, } from 'lucide-react';
import api, { DeviceListItem, TelemetrySnapshot, LocationPoint, ScreenshotData } from '../services/api';
import { Activity, MapPin, Camera, Cpu } from 'lucide-react';


type Filter = 'all' | 'online' | 'offline';

function BatteryIndicator({ level }: { level: number | null }) {
  if (level === null) return <span className="text-xs text-gray-600">N/A</span>;
  const color = level > 50 ? 'text-emerald-400' : level > 20 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Battery className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">{level}%</span>
    </div>
  );
}

function timeAgo(dateString: string | null): string {
  if (!dateString) return 'Nunca';
  const s = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (s < 60) return 'Hace un momento';
  if (s < 3600) return `Hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Hace ${Math.floor(s / 3600)} h`;
  return `Hace ${Math.floor(s / 86400)} días`;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDevices();
      if (res.success && res.data) setDevices(res.data.devices);
      else setError(res.error || 'Error al cargar dispositivos');
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, [load]);

  const handleDeactivate = async (deviceId: string, deviceName: string | null) => {
    const label = deviceName || deviceId;
    if (!confirm(`¿Desactivar "${label}"?\n\nEl dispositivo dejará de poder autenticarse.`)) return;
    setDeactivating(deviceId);
    const res = await api.deactivateDevice(deviceId);
    if (res.success) {
      setDevices(prev => prev.filter(d => d.deviceId !== deviceId));
    } else {
      alert(res.error || 'Error al desactivar dispositivo');
    }
    setDeactivating(null);
  };

  const filtered = devices.filter(d => {
    const q = search.toLowerCase();
    const matchSearch =
      d.deviceId.toLowerCase().includes(q) ||
      (d.deviceName?.toLowerCase().includes(q) ?? false) ||
      (d.model?.toLowerCase().includes(q) ?? false);
    const matchFilter =
      filter === 'all' ||
      (filter === 'online' && d.isOnline) ||
      (filter === 'offline' && !d.isOnline);
    return matchSearch && matchFilter;
  });

  const counts = {
    all: devices.length,
    online: devices.filter(d => d.isOnline).length,
    offline: devices.filter(d => !d.isOnline).length,
  };

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispositivos</h1>
          <p className="text-sm text-gray-400 mt-1">
            {counts.online} online · {counts.offline} offline · {counts.all} total
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700
            text-gray-300 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por ID, nombre o modelo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg
              text-white placeholder-gray-500 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'online', 'offline'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${filter === f
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {f === 'all' ? `Todos (${counts.all})` : f === 'online' ? `Online (${counts.online})` : `Offline (${counts.offline})`}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      {loading && devices.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Smartphone className="w-14 h-14 mx-auto mb-4 text-gray-700" />
          <p className="text-gray-400 font-medium">Sin dispositivos</p>
          <p className="text-sm text-gray-600 mt-1">
            {search || filter !== 'all' ? 'Prueba otros filtros' : 'No hay dispositivos registrados'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(device => (
            <div
              key={device.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5
                hover:border-gray-700 transition-colors"
            >
              {/* Cabecera tarjeta */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${device.isOnline ? 'bg-emerald-500/20' : 'bg-gray-800'
                    }`}>
                    <Monitor className={`w-5 h-5 ${device.isOnline ? 'text-emerald-400' : 'text-gray-500'}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {device.deviceName || 'Sin nombre'}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono truncate">
                      {device.deviceId.substring(0, 16)}…
                    </p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${device.isOnline
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-gray-800 text-gray-500'
                  }`}>
                  {device.isOnline
                    ? <Wifi className="w-3 h-3" />
                    : <WifiOff className="w-3 h-3" />}
                  {device.isOnline ? 'Online' : 'Offline'}
                </div>
              </div>

              {/* Info */}
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Modelo</span>
                  <span className="text-gray-300 text-xs">{device.model || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Último contacto</span>
                  <span className="text-gray-300 text-xs">{timeAgo(device.lastSeen)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Batería</span>
                  <BatteryIndicator level={device.batteryLevel} />
                </div>
              </div>

              {/* Badges de estado */}
              {(device.kioskModeEnabled || device.cameraDisabled) && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {device.kioskModeEnabled && (
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                      Kiosk activo
                    </span>
                  )}
                  {device.cameraDisabled && (
                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                      Cámara off
                    </span>
                  )}
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-2 pt-3 border-t border-gray-800">
                <Link
                  to={`/dispositivos/${encodeURIComponent(device.deviceId)}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2
                    bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs
                    font-medium transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver detalle
                </Link>
                <Link
                  to={`/comandos?device=${encodeURIComponent(device.deviceId)}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2
                    bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400
                    rounded-lg text-xs font-medium transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Comando
                </Link>
                <button
                  onClick={() => handleDeactivate(device.deviceId, device.deviceName)}
                  disabled={deactivating === device.deviceId}
                  className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400
                    rounded-lg transition-colors disabled:opacity-50"
                  title="Desactivar dispositivo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-gray-700 text-right">
          Mostrando {filtered.length} de {devices.length} dispositivos · actualiza cada 15s
        </p>
      )}
    </div>
  );
}

