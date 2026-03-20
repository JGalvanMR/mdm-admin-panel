import { useState, useEffect } from 'react';
import {
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Filter,
  Terminal,
} from 'lucide-react';
import api, { Command, PagedResult } from '../services/api';

export default function ActivityPage() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'pending'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<{ total: number; completed: number; failed: number; pending: number }>({
    total: 0,
    completed: 0,
    failed: 0,
    pending: 0,
  });

  useEffect(() => {
    fetchActivity();
  }, [page]);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      // Get all devices first to gather command history
      const devicesRes = await api.getDevices();
      if (!devicesRes.success || !devicesRes.data) {
        setError('Error al cargar actividad');
        return;
      }

      const allCommands: Command[] = [];
      let completed = 0;
      let failed = 0;
      let pending = 0;

      // Fetch commands for each device
      const commandPromises = devicesRes.data.devices.slice(0, 20).map(async (device) => {
        const res = await api.getDeviceCommands(device.deviceId, 1, 5);
        if (res.success && res.data) {
          return res.data.items;
        }
        return [];
      });

      const results = await Promise.all(commandPromises);
      results.forEach((cmds) => {
        allCommands.push(...cmds);
        cmds.forEach((cmd) => {
          const status = cmd.status.toUpperCase();
          if (status === 'COMPLETED' || status === 'SUCCESS') completed++;
          else if (status === 'FAILED' || status === 'ERROR') failed++;
          else pending++;
        });
      });

      setStats({
        total: allCommands.length,
        completed,
        failed,
        pending,
      });

      // Sort by creation date
      allCommands.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setCommands(allCommands);
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const filteredCommands = commands.filter((cmd) => {
    if (filter === 'all') return true;
    const status = cmd.status.toUpperCase();
    if (filter === 'completed') return status === 'COMPLETED' || status === 'SUCCESS';
    if (filter === 'failed') return status === 'FAILED' || status === 'ERROR';
    if (filter === 'pending') return status === 'PENDING' || status === 'QUEUED' || status === 'SENT';
    return true;
  });

  const getStatusIcon = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'COMPLETED' || s === 'SUCCESS') {
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    }
    if (s === 'FAILED' || s === 'ERROR') {
      return <XCircle className="w-4 h-4 text-red-400" />;
    }
    if (s === 'PENDING' || s === 'QUEUED') {
      return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
    }
    return <RefreshCw className="w-4 h-4 text-blue-400" />;
  };

  const getStatusColor = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'COMPLETED' || s === 'SUCCESS') return 'text-emerald-400';
    if (s === 'FAILED' || s === 'ERROR') return 'text-red-400';
    if (s === 'PENDING' || s === 'QUEUED') return 'text-amber-400';
    return 'text-blue-400';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Actividad</h1>
          <p className="text-sm text-gray-400 mt-1">
            Historial de comandos ejecutados
          </p>
        </div>
        <button
          onClick={fetchActivity}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total"
          value={stats.total}
          icon={Activity}
          color="text-blue-400"
          bgColor="bg-blue-500/20"
        />
        <StatCard
          label="Completados"
          value={stats.completed}
          icon={CheckCircle}
          color="text-emerald-400"
          bgColor="bg-emerald-500/20"
        />
        <StatCard
          label="Fallidos"
          value={stats.failed}
          icon={XCircle}
          color="text-red-400"
          bgColor="bg-red-500/20"
        />
        <StatCard
          label="Pendientes"
          value={stats.pending}
          icon={Loader2}
          color="text-amber-400"
          bgColor="bg-amber-500/20"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'completed', 'failed', 'pending'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
          >
            {f === 'all'
              ? 'Todos'
              : f === 'completed'
                ? 'Completados'
                : f === 'failed'
                  ? 'Fallidos'
                  : 'Pendientes'}
          </button>
        ))}
      </div>

      {/* Activity List */}
      {loading && commands.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
          {error}
        </div>
      ) : filteredCommands.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Activity className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">
            No hay actividad
          </h3>
          <p className="text-sm text-gray-500">
            {filter !== 'all'
              ? 'No hay comandos con este estado'
              : 'Aún no se han enviado comandos'}
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
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
                    Dispositivo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Creado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Ejecutado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Resultado
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCommands.map((cmd) => (
                  <tr
                    key={`${cmd.id}-${cmd.deviceId}`}
                    className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(cmd.status)}
                        <span className={`text-sm font-medium ${getStatusColor(cmd.status)}`}>
                          {cmd.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-gray-500" />
                        <code className="text-sm text-emerald-400 font-mono">
                          {cmd.commandType}
                        </code>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300 font-mono">
                        {cmd.deviceId.substring(0, 12)}...
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        {formatDate(cmd.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(cmd.executedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {cmd.errorMessage ? (
                        <span className="text-xs text-red-400" title={cmd.errorMessage}>
                          {cmd.errorMessage.substring(0, 30)}...
                        </span>
                      ) : cmd.result ? (
                        <span className="text-xs text-gray-500">
                          {cmd.result.substring(0, 30)}...
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
