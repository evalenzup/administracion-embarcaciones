/**
 * SIAE — AuthContext: manejo global de autenticación.
 * Provee: user, login, logout, loading, isAuthenticated.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import apiClient from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar usuario al montar si hay token
  useEffect(() => {
    const token = localStorage.getItem('siae_token');
    if (token) {
      fetchMe();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchMe = async () => {
    try {
      const response = await apiClient.get('/auth/me');
      setUser(response.data);
      setPermissions(response.data.permissions || []);
    } catch {
      localStorage.removeItem('siae_token');
      localStorage.removeItem('siae_refresh_token');
      setUser(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async (username, password) => {
    try {
      const response = await apiClient.post('/auth/login', { username, password });
      const { access_token, refresh_token } = response.data;

      localStorage.setItem('siae_token', access_token);
      localStorage.setItem('siae_refresh_token', refresh_token);

      // Cargar datos del usuario
      const meResponse = await apiClient.get('/auth/me');
      setUser(meResponse.data);
      setPermissions(meResponse.data.permissions || []);

      message.success(`¡Bienvenido, ${meResponse.data.full_name}!`);
      return { success: true };
    } catch (error) {
      const detail = error.response?.data?.detail || 'Error al iniciar sesión';
      message.error(detail);
      return { success: false, error: detail };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('siae_token');
    localStorage.removeItem('siae_refresh_token');
    setUser(null);
    setPermissions([]);
    message.info('Sesión cerrada');
  }, []);

  const hasPermission = useCallback((module, action) => {
    if (!user) return false;
    if (user.is_superadmin) return true;
    return permissions.includes(`${module}:${action}`);
  }, [user, permissions]);

  const value = {
    user,
    permissions,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    hasPermission,
    refreshUser: fetchMe,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}

export default AuthContext;
