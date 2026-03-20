import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Smartphone,
  Battery,
  HardDrive,
  Monitor,
  Wifi,
  Clock,
  Edit3,
  Trash2,
  Lock,
  Unlock,
  Camera,
  Eye,
  Terminal,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import api, { DeviceDetail, Command, PagedResult } from '../services/api';

export default function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'commands'>('info');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const fetchDevice = async () => {
    if (!deviceId) return;
    try {
      const response = await api.getDevice(decodeURIComponent(deviceId));
      if (response.success && response.data) {
        setDevice(response.data);
        setNotes(response.data.notes || '');
      } else {
        setError(response.error || 'Dispositivo no encontrado');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const fetchCommands = async () => {
    if (!deviceId) return;
    try {
      const response = await api.getDeviceCommands(decodeURIComponent(deviceId), 1, 10);
      if (response.success && response.data) {
        setCommands(response.data.items);
      }
    } catch (err) {
      console.error('Error fetching commands:', err);
    }
  };

  useEffect(() => {
    fetchDevice();
    fetchCommands();
  }, [deviceId]);

  const handleSaveNotes = async () => {
    if (!deviceId) return;
    const response = await api.updateNotes(decodeURIComponent(deviceId), notes);
    if (response.success) {
      setEditingNotes(false);
      fetchDevice();
    } else {
      alert(response.error || 'Error al guardar notas');
    }
  };

  const handleCancelAllCommands = async () => {
    if (!deviceId) return;
    if (!confirm('¿Cancelar todos los comandos pendientes?')) return;
    const response = await api.cancelAllPendingCommands(decodeURIComponent(deviceId));
    if (response.success) {
      fetchCommands();
    } else {
      alert(response.error || 'Error al cancelar comandos');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
      case 'SUCCESS':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'FAILED':
      case 'ERROR':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'PENDING':
      case 'QUEUED':
        return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
      case 'SENT':
        return <RefreshCw className="w-4 h-4 text-blue-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('es-ES');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="space-y-4">
        <Link
          to="/dispositivos"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a dispositivos</span>
        </Link>
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {error || 'Dispositivo no encontrado'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/dispositivos"
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center ${device.isOnline ? 'bg-emerald-500/20' : 'bg-gray-800'
                }`}
            >
              <Smartphone
                className={`w-7 h-7 ${device.isOnline ? 'text-emerald-400' : 'text-gray-500'
                  }`}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {device.deviceName || 'Sin nombre'}
              </h1>
              <p className="text-sm text-gray-500 font-mono">{device.deviceId}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/comandos?device=${encodeURIComponent(device.deviceId)}`}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
          >
            <Terminal className="w-4 h-4" />
            <span>Enviar Comando</span>
          </Link>
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2">
        <div
          className={`px-3 py-1.5 rounded-full text-sm font-medium ${device.isOnline
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-gray-800 text-gray-400'
            }`}
        >
          {device.isOnline ? 'Online' : 'Offline'}
        </div>
        {device.kioskModeEnabled && (
          <span className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium">
            Kiosk Mode
          </span>
        )}
        {device.cameraDisabled && (
          <span className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-full text-sm font-medium">
            Cámara Deshabilitada
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <nav className="flex gap-6">
          {(['info', 'commands'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
            >
              {tab === 'info' ? 'Información' : 'Comandos'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Device Info Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">
              Información del Dispositivo
            </h3>
            <div className="space-y-4">
              <InfoRow label="Modelo" value={device.model || 'Desconocido'} />
              <InfoRow label="Fabricante" value={device.manufacturer || 'Desconocido'} />
              <InfoRow label="Android" value={device.androidVersion || '-'} />
              <InfoRow label="API Level" value={device.apiLevel?.toString() || '-'} />
              <InfoRow
                label="Registrado"
                value={formatDate(device.registeredAt)}
              />
              <InfoRow
                label="Última actividad"
                value={formatDate(device.lastSeen)}
              />
              <InfoRow
                label="Polls realizados"
                value={device.pollCount?.toString() || '0'}
              />
            </div>
          </div>

          {/* Status Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Estado Actual</h3>
            <div className="space-y-4">
              <StatusRow
                icon={Battery}
                label="Batería"
                value={
                  device.batteryLevel !== null
                    ? `${device.batteryLevel}%`
                    : 'N/A'
                }
                color={
                  device.batteryLevel !== null
                    ? device.batteryLevel > 50
                      ? 'text-emerald-400'
                      : device.batteryLevel > 20
                        ? 'text-amber-400'
                        : 'text-red-400'
                    : 'text-gray-500'
                }
              />
              <StatusRow
                icon={HardDrive}
                label="Storage"
                value={
                  device.storageAvailableMB && device.totalStorageMB
                    ? `${device.storageAvailableMB} MB / ${device.totalStorageMB} MB`
                    : 'N/A'
                }
              />
              <StatusRow
                icon={Wifi}
                label="IP"
                value={device.ipAddress || 'N/A'}
              />
              <StatusRow
                icon={Clock}
                label="Comandos Pendientes"
                value={device.pendingCommandsCount?.toString() || '0'}
              />
            </div>
          </div>

          {/* Notes Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Notas</h3>
              {!editingNotes && (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Editar</span>
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none"
                  placeholder="Agregar notas sobre este dispositivo..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm transition-colors"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => {
                      setEditingNotes(false);
                      setNotes(device.notes || '');
                    }}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">
                {device.notes || 'Sin notas agregadas'}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold text-white mb-4">Acciones</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleCancelAllCommands}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg text-sm transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span>Cancelar Comandos Pendientes</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              Últimos Comandos
            </h3>
            <Link
              to={`/comandos?device=${encodeURIComponent(device.deviceId)}`}
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              Enviar nuevo comando
            </Link>
          </div>

          {commands.length > 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Comando
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Creado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ejecutado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {commands.map((cmd) => (
                    <tr key={cmd.id} className="border-b border-gray-800 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(cmd.status)}
                          <span className="text-sm text-gray-400">
                            {cmd.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-sm text-emerald-400 font-mono">
                          {cmd.commandType}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(cmd.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(cmd.executedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <Terminal className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400">No hay comandos registrados</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-300">{value}</span>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  color = 'text-gray-300',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-gray-500" />
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <span className={`text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}
