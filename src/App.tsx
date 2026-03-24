import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import CommandsPage from './pages/CommandsPage';
import ActivityPage from './pages/ActivityPage';
import MonitoringPage from './pages/MonitoringPage';
import GeofencesPage from './pages/GeofencesPage';
import RemoteViewPage from './pages/RemoteViewPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="dispositivos" element={<DevicesPage />} />
        <Route path="dispositivos/:deviceId" element={<DeviceDetailPage />} />
        <Route path="comandos" element={<CommandsPage />} />
        <Route path="actividad" element={<ActivityPage />} />
        <Route path="monitoreo" element={<MonitoringPage />} />
        <Route path="monitoreo/:deviceId" element={<MonitoringPage />} />
        <Route path="geofences" element={<GeofencesPage />} />
        <Route path="geofences/:deviceId" element={<GeofencesPage />} />
		<Route path="remoto"  element={<RemoteViewPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}