/**
 * SIAE — Cliente HTTP centralizado con Axios.
 * Configura interceptors para auth (JWT) y manejo de errores.
 */

import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request interceptor: inyectar token JWT ──
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('siae_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: manejo de errores ──
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido: limpiar y redirigir a login
      localStorage.removeItem('siae_token');
      localStorage.removeItem('siae_user');
      // Solo redirigir si no estamos ya en login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
