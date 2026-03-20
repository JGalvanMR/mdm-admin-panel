import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import api from '../services/api';

interface AuthContextType {
  adminKey: string;
  setAdminKey: (key: string) => void;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [adminKey, setAdminKeyState] = useState(() => {
    return localStorage.getItem('mdm_admin_key') || '';
  });

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
  };

  return (
    <AuthContext.Provider
      value={{
        adminKey,
        setAdminKey,
        isAuthenticated: !!adminKey,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
