import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Smartphone, Terminal,
  Activity, Settings, LogOut, BarChart2, Crosshair,MonitorSpeaker
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/dispositivos', icon: Smartphone, label: 'Dispositivos' },
  { path: '/monitoreo', icon: BarChart2, label: 'Monitoreo' },
  { path: '/comandos', icon: Terminal, label: 'Enviar Comandos' },
  { path: '/actividad', icon: Activity, label: 'Actividad' },
  { path: '/geofences', icon: Crosshair, label: 'Geofences' },
  { path: '/remoto', icon: MonitorSpeaker, label: 'Vista Remota' },
];

export default function Sidebar() {
  const { adminKey, logout } = useAuth();
  const maskedKey = adminKey ? `${adminKey.substring(0, 8)}...` : '';

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full flex-shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">MDM Panel</h1>
            <p className="text-xs text-gray-500">Administración</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <div className="bg-gray-800 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
            <Settings className="w-3 h-3" />
            <span>Clave API</span>
          </div>
          <code className="text-emerald-400 text-xs font-mono">{maskedKey}</code>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5
            bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="font-medium text-sm">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
