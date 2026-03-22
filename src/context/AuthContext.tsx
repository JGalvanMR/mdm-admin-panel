import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import api from '../services/api';

interface AuthContextType {
  adminKey:        string;
  setAdminKey:     (key: string) => void;
  isAuthenticated: boolean;
  logout:          () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [adminKey, setAdminKeyState] = useState(() => {
    const stored = localStorage.getItem('mdm_admin_key') || '';
    // Inicializar SINCRÓNICAMENTE antes del primer render de cualquier hijo.
    // Sin esto, Header.tsx dispara peticiones sin la key → 401.
    if (stored) api.setAdminKey(stored);
    return stored;
  });

  // Sincronizar cambios posteriores a la instancia de api
  useEffect(() => {
    if (adminKey) {
      localStorage.setItem('mdm_admin_key', adminKey);
      api.setAdminKey(adminKey);
    }
  }, [adminKey]);

  const setAdminKey = (key: string) => {
    setAdminKeyState(key);
    if (key) {
      localStorage.setItem('mdm_admin_key', key);
      api.setAdminKey(key);
    }
  };

  const logout = () => {
    setAdminKeyState('');
    localStorage.removeItem('mdm_admin_key');
    api.setAdminKey('');
  };

  return (
    <AuthContext.Provider
      value={{ adminKey, setAdminKey, isAuthenticated: !!adminKey, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
