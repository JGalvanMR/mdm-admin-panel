import { useLocation } from 'react-router-dom';
import { RefreshCw, Radio } from 'lucide-react';
import { useState, useEffect } from 'react';
import api, { WsStatus } from '../services/api';

const PAGE_TITLES: Record<string, string> = {
  '/':            'Dashboard',
  '/dispositivos': 'Dispositivos',
  '/comandos':    'Enviar Comandos',
  '/actividad':   'Actividad',
};

export default function Header() {
  const location = useLocation();

  // Resolver título incluso en rutas dinámicas como /dispositivos/:id
  const title = PAGE_TITLES[location.pathname]
    ?? (location.pathname.startsWith('/dispositivos/') ? 'Detalle de Dispositivo' : 'MDM Admin');

  const [wsStatus,    setWsStatus]    = useState<WsStatus | null>(null);
  const [lastUpdate,  setLastUpdate]  = useState(new Date());
  const [refreshing,  setRefreshing]  = useState(false);

  const fetchWs = async () => {
    const res = await api.getWsStatus();
    if (res.success && res.data) {
      setWsStatus(res.data);
      setLastUpdate(new Date());
    }
  };

  useEffect(() => {
    fetchWs();
    const iv = setInterval(fetchWs, 30_000);
    return () => clearInterval(iv);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWs();
    setTimeout(() => {
      setRefreshing(false);
      window.location.reload();
    }, 300);
  };

  const online = wsStatus?.onlineViaWebSocket ?? 0;

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-800 px-6 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="text-lg font-bold text-white leading-tight">{title}</h2>
        <p className="text-xs text-gray-600">
          Actualizado: {lastUpdate.toLocaleTimeString('es-ES')}
        </p>
      </div>

      <div className="flex items-center gap-3">

        {/* Indicador WebSocket */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg">
          <Radio className={`w-3.5 h-3.5 ${online > 0 ? 'text-emerald-400' : 'text-gray-500'}`} />
          <div className={`w-1.5 h-1.5 rounded-full ${online > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-400">
            {online} WS {online === 1 ? 'activo' : 'activos'}
          </span>
        </div>

        {/* Botón refresh */}
        <button
          onClick={handleRefresh}
          title="Recargar página"
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}
