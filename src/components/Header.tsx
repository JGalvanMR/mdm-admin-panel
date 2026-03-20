import { useLocation } from 'react-router-dom';
import { Bell, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import api, { WsStatus } from '../services/api';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/dispositivos': 'Dispositivos',
  '/comandos': 'Enviar Comandos',
  '/actividad': 'Actividad',
};

export default function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'MDM Admin';
  const [wsStatus, setWsStatus] = useState<WsStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const fetchWsStatus = async () => {
      const response = await api.getWsStatus();
      if (response.success && response.data) {
        setWsStatus(response.data);
        setLastUpdate(new Date());
      }
    };

    fetchWsStatus();
    const interval = setInterval(fetchWsStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-800 px-6 flex items-center justify-between">
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="text-xs text-gray-500">
          Última actualización: {formatTime(lastUpdate)}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {/* WebSocket Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg">
          <div
            className={`w-2 h-2 rounded-full ${(wsStatus?.onlineViaWebSocket || 0) > 0
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-gray-500'
              }`}
          />
          <span className="text-sm text-gray-400">
            {wsStatus?.onlineViaWebSocket || 0} WS activos
          </span>
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => window.location.reload()}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          title="Actualizar"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
      </div>
    </header>
  );
}
