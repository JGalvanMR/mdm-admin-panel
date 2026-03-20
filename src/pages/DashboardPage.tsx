import { useState, useEffect } from 'react';
import {
  Smartphone,
  CheckCircle,
  XCircle,
  Terminal,
  Battery,
  Wifi,
  Clock,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import api, { SystemStats, DeviceListItem } from '../services/api';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  trend?: { value: number; positive: boolean };
}

function StatCard({ title, value, subtitle, icon: Icon, color, trend }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-sm ${trend.positive ? 'text-emerald-400' : 'text-red-400'
              }`}
          >
            <TrendingUp className={`w-4 h-4 ${!trend.positive ? 'rotate-180' : ''}`} />
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-3xl font-bold text-white">{value}</h3>
        <p className="text-sm text-gray-400">{title}</p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function RecentDeviceCard({ device }: { device: DeviceListItem }) {
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

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${device.isOnline ? 'bg-emerald-500/20' : 'bg-gray-600/20'
          }`}
      >
        <Smartphone
          className={`w-5 h-5 ${device.isOnline ? 'text-emerald-400' : 'text-gray-500'
            }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {device.deviceName || device.deviceId}
        </p>
        <p className="text-xs text-gray-500">
          {device.model || 'Dispositivo desconocido'}
        </p>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${device.isOnline ? 'bg-emerald-400' : 'bg-gray-500'
              }`}
          />
          <span className="text-xs text-gray-400">
            {device.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {getTimeAgo(device.lastSeen)}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, devicesRes] = await Promise.all([
          api.getStats(),
          api.getDevices(),
        ]);

        if (statsRes.success && statsRes.data) {
          setStats(statsRes.data);
        }

        if (devicesRes.success && devicesRes.data) {
          setDevices(devicesRes.data.devices.slice(0, 5));
        }
      } catch (err) {
        setError('Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

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
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Dispositivos"
          value={stats?.totalDevices || 0}
          subtitle="Registrados en el sistema"
          icon={Smartphone}
          color="bg-blue-500/20 text-blue-400"
        />
        <StatCard
          title="Dispositivos Online"
          value={stats?.onlineDevices || 0}
          subtitle={`De ${stats?.totalDevices || 0} totales`}
          icon={Wifi}
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          title="Comandos Enviados"
          value={stats?.commandsSent || 0}
          subtitle="Últimas 24 horas"
          icon={Terminal}
          color="bg-purple-500/20 text-purple-400"
        />
        <StatCard
          title="Batería Promedio"
          value={`${stats?.averageBatteryLevel || 0}%`}
          subtitle="De todos los dispositivos"
          icon={Battery}
          color="bg-amber-500/20 text-amber-400"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Comandos Ejecutados"
          value={stats?.commandsExecuted || 0}
          icon={CheckCircle}
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          title="Comandos Fallidos"
          value={stats?.commandsFailed || 0}
          icon={XCircle}
          color="bg-red-500/20 text-red-400"
        />
        <StatCard
          title="Dispositivos Offline"
          value={stats?.offlineDevices || 0}
          icon={Clock}
          color="bg-gray-500/20 text-gray-400"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Devices */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">
              Actividad Reciente
            </h3>
            <a
              href="/dispositivos"
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              Ver todos
            </a>
          </div>
          <div className="space-y-3">
            {devices.length > 0 ? (
              devices.map((device) => (
                <RecentDeviceCard key={device.id} device={device} />
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No hay dispositivos registrados</p>
              </div>
            )}
          </div>
        </div>

        {/* System Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">
            Estado del Sistema
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-gray-300">MDM Server</span>
              </div>
              <span className="text-emerald-400 text-sm">Operativo</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-gray-300">Base de Datos</span>
              </div>
              <span className="text-emerald-400 text-sm">Conectada</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-gray-300">WebSocket Hub</span>
              </div>
              <span className="text-emerald-400 text-sm">
                {stats?.onlineDevices || 0} conexiones
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 pt-6 border-t border-gray-800">
            <h4 className="text-sm font-medium text-gray-400 mb-3">
              Acciones Rápidas
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="/comandos"
                className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm text-center hover:bg-emerald-500/30 transition-colors"
              >
                Enviar Comando
              </a>
              <a
                href="/dispositivos"
                className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm text-center hover:bg-gray-700 transition-colors"
              >
                Ver Dispositivos
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
