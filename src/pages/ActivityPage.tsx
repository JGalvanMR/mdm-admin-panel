import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Clock, CheckCircle, XCircle,
  Loader2, RefreshCw, Terminal, AlertCircle,
} from 'lucide-react';
import api, { Command } from '../services/api';

type FilterType = 'all' | 'Executed' | 'Failed' | 'Pending' | 'Sent' | 'Cancelled' | 'Expired';

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  Executed:  { label: 'Ejecutado',  color: 'text-emerald-400', icon: CheckCircle  },
  Failed:    { label: 'Fallido',    color: 'text-red-400',     icon: XCircle      },
  Pending:   { label: 'Pendiente',  color: 'text-amber-400',   icon: Loader2      },
  Sent:      { label: 'Enviado',    color: 'text-blue-400',    icon: RefreshCw    },
  Cancelled: { label: 'Cancelado',  color: 'text-gray-400',    icon: XCircle      },
  Expired:   { label: 'Expirado',   color: 'text-orange-400',  icon: AlertCircle  },
  Executing: { label: 'Ejecutando', color: 'text-blue-300',    icon: Loader2      },
};

function StatusBadge({ status }: { status: string }) {
  const cfg   = STATUS_MAP[status] ?? { label: status, color: 'text-gray-400', icon: Activity };
  const Icon  = cfg.icon;
  const spin  = status === 'Pending' || status === 'Executing';
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`w-4 h-4 ${cfg.color} ${spin ? 'animate-spin' : ''}`} />
      <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
    </div>
  );
}

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function ActivityPage() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<FilterType>('all');

  const stats = {
    total:     commands.length,
    executed:  commands.filter(c => c.status === 'Executed').length,
    failed:    commands.filter(c => c.status === 'Failed').length,
    pending:   commands.filter(c => c.status === 'Pending' || c.status === 'Sent').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const devRes = await api.getDevices();
      if (!devRes.success || !devRes.data) {
        setError(devRes.error || 'Error al cargar dispositivos');
        return;
      }

      // Obtener hasta 10 comandos de cada dispositivo (máx 30 dispositivos)
      const deviceSlice = devRes.data.devices.slice(0, 30);
      const results = await Promise.allSettled(
        deviceSlice.map(d => api.getDeviceCommands(d.deviceId, 1, 10))
      );

      const all: Command[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.success && r.value.data) {
          all.push(...r.value.data.items);
        }
      }

      // Ordenar por fecha de creación descendente
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCommands(all);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all'
    ? commands
    : commands.filter(c => c.status === filter);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all',       label: 'Todos'      },
    { key: 'Executed',  label: 'Ejecutados' },
    { key: 'Failed',    label: 'Fallidos'   },
    { key: 'Pending',   label: 'Pendientes' },
    { key: 'Sent',      label: 'Enviados'   },
    { key: 'Cancelled', label: 'Cancelados' },
    { key: 'Expired',   label: 'Expirados'  },
  ];

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Actividad</h1>
          <p className="text-sm text-gray-400 mt-1">Historial de comandos de todos los dispositivos</p>
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

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total',       value: stats.total,    color: 'text-blue-400',    bg: 'bg-blue-500/20',    icon: Activity    },
          { label: 'Ejecutados',  value: stats.executed, color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: CheckCircle },
          { label: 'Fallidos',    value: stats.failed,   color: 'text-red-400',     bg: 'bg-red-500/20',     icon: XCircle     },
          { label: 'Pendientes',  value: stats.pending,  color: 'text-amber-400',   bg: 'bg-amber-500/20',   icon: Loader2     },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading && commands.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Activity className="w-14 h-14 mx-auto mb-4 text-gray-700" />
          <p className="text-gray-400 font-medium">Sin resultados</p>
          <p className="text-sm text-gray-600 mt-1">
            {filter !== 'all' ? 'No hay comandos con este estado' : 'Aún no se han enviado comandos'}
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Comando</th>
                  <th className="px-4 py-3 text-left">Dispositivo</th>
                  <th className="px-4 py-3 text-left">Prioridad</th>
                  <th className="px-4 py-3 text-left">Creado</th>
                  <th className="px-4 py-3 text-left">Ejecutado</th>
                  <th className="px-4 py-3 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(cmd => (
                  <tr
                    key={`${cmd.id}-${cmd.deviceId}`}
                    className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <StatusBadge status={cmd.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                        <code className="text-emerald-400 font-mono text-xs">{cmd.commandType}</code>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-400 font-mono text-xs">
                        {cmd.deviceId.substring(0, 16)}…
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        cmd.priority <= 3 ? 'bg-red-500/20 text-red-400'
                        : cmd.priority <= 6 ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-gray-700 text-gray-400'
                      }`}>
                        P{cmd.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                        <Clock className="w-3.5 h-3.5" />
                        {fmt(cmd.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmt(cmd.executedAt)}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {cmd.errorMessage ? (
                        <span className="text-xs text-red-400 truncate block" title={cmd.errorMessage}>
                          {cmd.errorMessage.substring(0, 40)}{cmd.errorMessage.length > 40 ? '…' : ''}
                        </span>
                      ) : cmd.result ? (
                        <span className="text-xs text-gray-500 truncate block font-mono" title={cmd.result}>
                          {cmd.result.substring(0, 40)}{cmd.result.length > 40 ? '…' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-700">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
            Mostrando {filtered.length} de {commands.length} comandos
          </div>
        </div>
      )}
    </div>
  );
}
