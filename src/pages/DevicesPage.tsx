import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Smartphone,
  Search,
  Filter,
  RefreshCw,
  Battery,
  Wifi,
  Monitor,
  MoreVertical,
  Eye,
  Trash2,
  XCircle,
  Lock,
  Trash,
} from 'lucide-react';
import api, { DeviceListItem } from '../services/api';

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [selectedDevice, setSelectedDevice] = useState<DeviceListItem | null>(null);
  const [showActions, setShowActions] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const response = await api.getDevices();
      if (response.success && response.data) {
        setDevices(response.data.devices);
      } else {
        setError(response.error || 'Error al cargar dispositivos');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.deviceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.deviceName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      (device.model?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    const matchesFilter =
      filter === 'all' ||
      (filter === 'online' && device.isOnline) ||
      (filter === 'offline' && !device.isOnline);

    return matchesSearch && matchesFilter;
  });

  const getTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Hace un momento';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
    return `Hace ${Math.floor(seconds / 86400)} días`;
  };

  const getBatteryColor = (level: number | null) => {
    if (level === null) return 'text-gray-500';
    if (level > 50) return 'text-emerald-400';
    if (level > 20) return 'text-amber-400';
    return 'text-red-400';
  };

  const handleDeactivate = async (deviceId: string) => {
    if (!confirm('¿Estás seguro de desactivar este dispositivo?')) return;
    const response = await api.deactivateDevice(deviceId);
    if (response.success) {
      fetchDevices();
    } else {
      alert(response.error || 'Error al desactivar dispositivo');
    }
    setShowActions(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispositivos</h1>
          <p className="text-sm text-gray-400 mt-1">
            {devices.length} dispositivos registrados
          </p>
        </div>
        <button
          onClick={fetchDevices}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por ID, nombre o modelo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'online', 'offline'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {f === 'all' ? 'Todos' : f === 'online' ? 'Online' : 'Offline'}
            </button>
          ))}
        </div>
      </div>

      {/* Devices List */}
      {loading && devices.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {error}
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Smartphone className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">
            No se encontraron dispositivos
          </h3>
          <p className="text-sm text-gray-500">
            {searchTerm || filter !== 'all'
              ? 'Intenta con otros filtros de búsqueda'
              : 'No hay dispositivos registrados'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDevices.map((device) => (
            <div
              key={device.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors"
            >
              {/* Device Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${device.isOnline ? 'bg-emerald-500/20' : 'bg-gray-800'
                      }`}
                  >
                    <Monitor
                      className={`w-6 h-6 ${device.isOnline ? 'text-emerald-400' : 'text-gray-500'
                        }`}
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-white truncate max-w-[180px]">
                      {device.deviceName || 'Sin nombre'}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono">
                      {device.deviceId.substring(0, 16)}...
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                <div
                  className={`px-2 py-1 rounded-full text-xs font-medium ${device.isOnline
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-800 text-gray-500'
                    }`}
                >
                  {device.isOnline ? 'Online' : 'Offline'}
                </div>
              </div>

              {/* Device Info */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Modelo</span>
                  <span className="text-gray-300">
                    {device.model || 'Desconocido'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Última actividad</span>
                  <span className="text-gray-300">
                    {getTimeAgo(device.lastSeen)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Batería</span>
                  <div className="flex items-center gap-2">
                    <Battery
                      className={`w-4 h-4 ${getBatteryColor(device.batteryLevel)}`}
                    />
                    <span className={getBatteryColor(device.batteryLevel)}>
                      {device.batteryLevel !== null
                        ? `${device.batteryLevel}%`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {device.kioskModeEnabled && (
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">
                    Kiosk
                  </span>
                )}
                {device.cameraDisabled && (
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">
                    Cámara Off
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Link
                  to={`/dispositivos/${encodeURIComponent(device.deviceId)}`}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  <span>Ver</span>
                </Link>
                <Link
                  to={`/comandos?device=${encodeURIComponent(device.deviceId)}`}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  <span>Comando</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
