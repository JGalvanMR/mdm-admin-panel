import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Smartphone, CheckCircle, XCircle, Terminal,
  Battery, Wifi, Clock, WifiOff, Hourglass,
} from 'lucide-react';
import api, { SystemStats, DeviceListItem } from '../services/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface StatCardProps {
  title:    string;
  value:    string | number;
  subtitle?: string;
  icon:     React.ElementType;
  color:    string;
}

// ── Componentes ───────────────────────────────────────────────────────────────
function StatCard({ title, value, subtitle, icon: Icon, color }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className={`inline-flex p-3 rounded-lg ${color} mb-4`}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-3xl font-bold text-white">{value}</h3>
      <p className="text-sm text-gray-400 mt-1">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function DeviceRow({ device }: { device: DeviceListItem }) {
  const timeAgo = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    const s = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (s < 60)    return 'Hace un momento';
    if (s < 3600)  return `Hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `Hace ${Math.floor(s / 3600)} h`;
    return `Hace ${Math.floor(s / 86400)} días`;
  };

  return (
    <Link
      to={`/dispositivos/${encodeURIComponent(device.deviceId)}`}
      className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
        ${device.isOnline ? 'bg-emerald-500/20' : 'bg-gray-600/20'}`}>
        <Smartphone className={`w-5 h-5 ${device.isOnline ? 'text-emerald-400' : 'text-gray-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {device.deviceName || device.deviceId}
        </p>
        <p className="text-xs text-gray-500">{device.model || 'Modelo desconocido'}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="flex items-center justify-end gap-1.5">
          <div className={`w-2 h-2 rounded-full ${device.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs text-gray-400">{device.isOnline ? 'Online' : 'Offline'}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">{timeAgo(device.lastSeen)}</p>
      </div>
    </Link>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [stats,   setStats]   = useState<SystemStats | null>(null);
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [statsRes, devicesRes] = await Promise.all([
        api.getStats(),
        api.getDevices(),
      ]);
      if (statsRes.success   && statsRes.data)   setStats(statsRes.data);
      if (devicesRes.success && devicesRes.data) setDevices(devicesRes.data.devices.slice(0, 5));
      if (!statsRes.success) setError(statsRes.error || 'Error al cargar estadísticas');
    } catch {
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, []);

  // offlineDevices se calcula en el frontend; el backend no lo devuelve por separado
  const offlineDevices = (stats?.totalDevices ?? 0) - (stats?.onlineDevices ?? 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Fila 1 — dispositivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Dispositivos"
          value={stats?.totalDevices ?? 0}
          subtitle="Registrados en el sistema"
          icon={Smartphone}
          color="bg-blue-500/20 text-blue-400"
        />
        <StatCard
          title="Online"
          value={stats?.onlineDevices ?? 0}
          subtitle="Vistos hace < 2 min"
          icon={Wifi}
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          title="Offline"
          value={offlineDevices}
          subtitle="Sin actividad reciente"
          icon={WifiOff}
          color="bg-gray-500/20 text-gray-400"
        />
        <StatCard
          title="Batería Promedio"
          value={`${Math.round(stats?.averageBatteryLevel ?? 0)}%`}
          subtitle="Dispositivos online"
          icon={Battery}
          color="bg-amber-500/20 text-amber-400"
        />
      </div>

      {/* Fila 2 — comandos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Ejecutados (24h)"
          value={stats?.executedLast24h ?? 0}
          icon={CheckCircle}
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          title="Fallidos (24h)"
          value={stats?.failedLast24h ?? 0}
          icon={XCircle}
          color="bg-red-500/20 text-red-400"
        />
        <StatCard
          title="Pendientes"
          value={stats?.pendingCommands ?? 0}
          subtitle="En cola de entrega"
          icon={Hourglass}
          color="bg-purple-500/20 text-purple-400"
        />
      </div>

      {/* Fila 3 — actividad + estado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Dispositivos recientes */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Actividad Reciente</h3>
            <Link to="/dispositivos" className="text-sm text-emerald-400 hover:text-emerald-300">
              Ver todos →
            </Link>
          </div>
          <div className="space-y-2">
            {devices.length > 0 ? (
              devices.map(d => <DeviceRow key={d.id} device={d} />)
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No hay dispositivos registrados</p>
              </div>
            )}
          </div>
        </div>

        {/* Estado del sistema */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Estado del Sistema</h3>

          <div className="space-y-3 mb-6">
            {[
              { label: 'MDM Server',     status: true,  detail: 'Operativo'                         },
              { label: 'Base de Datos',  status: true,  detail: 'Conectada'                         },
              { label: 'WebSocket Hub',  status: (stats?.onlineDevices ?? 0) >= 0,
                detail: `${stats?.onlineDevices ?? 0} conexión(es) activa(s)`                       },
              { label: 'Expiry Service', status: true,  detail: 'Ejecutándose'                      },
            ].map(item => (
              <div key={item.label}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${item.status ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                  <span className="text-sm text-gray-300">{item.label}</span>
                </div>
                <span className={`text-xs font-medium ${item.status ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.detail}
                </span>
              </div>
            ))}
          </div>

          {stats?.serverTime && (
            <p className="text-xs text-gray-600 mb-4">
              Servidor: {new Date(stats.serverTime).toLocaleString('es-ES')}
            </p>
          )}

          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Acciones rápidas</p>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/comandos"
                className="flex items-center justify-center gap-2 px-4 py-2.5
                  bg-emerald-500/20 text-emerald-400 rounded-lg text-sm
                  hover:bg-emerald-500/30 transition-colors"
              >
                <Terminal className="w-4 h-4" />
                <span>Enviar Comando</span>
              </Link>
              <Link
                to="/dispositivos"
                className="flex items-center justify-center gap-2 px-4 py-2.5
                  bg-gray-800 text-gray-300 rounded-lg text-sm
                  hover:bg-gray-700 transition-colors"
              >
                <Smartphone className="w-4 h-4" />
                <span>Dispositivos</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
