/**
 * SIAE — Componente raíz con rutas protegidas.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './context/AuthContext';

// Layout
import MainLayout from './components/Layout/MainLayout';

// Pages
import LoginPage from './pages/Login/LoginPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import UsersPage from './pages/Admin/UsersPage';
import RolesPage from './pages/Admin/RolesPage';
import PortsPage from './pages/Admin/PortsPage';
import AuditPage from './pages/Admin/AuditPage';
import VesselsPage from './pages/Vessels/VesselsPage';
import DocumentsPage from './pages/Documents/DocumentsPage';
import MaintenancePage from './pages/Maintenance/MaintenancePage';
import InventoryPage from './pages/Inventory/InventoryPage';
import LogbooksPage from './pages/Logbooks/LogbooksPage';
import CruisesPage from './pages/Cruises/CruisesPage';
import PersonnelPage from './pages/Personnel/PersonnelPage';
import ParticipantsPage from './pages/Participants/ParticipantsPage';
import EquipmentPage from './pages/Equipment/EquipmentPage';
import HelpPage from './pages/Help/HelpPage';
import PublicSchedulePage from './pages/PublicSchedule/PublicSchedulePage';
import VesselRequestsPage from './pages/VesselRequests/VesselRequestsPage';
import FuelLogsPage from './pages/FuelLogs/FuelLogsPage';
import BillingPage from './pages/Billing/BillingPage';

/**
 * Ruta protegida: redirige a login si no está autenticado.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" tip="Cargando..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/**
 * Ruta pública: redirige al dashboard si ya está autenticado.
 */
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route path="/agenda" element={<PublicSchedulePage />} />

      {/* Rutas protegidas con layout */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/vessels" element={<VesselsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/logbooks" element={<LogbooksPage />} />
        <Route path="/cruises" element={<CruisesPage />} />
        <Route path="/requests" element={<VesselRequestsPage />} />
        <Route path="/participants" element={<ParticipantsPage />} />
        <Route path="/personnel" element={<PersonnelPage />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/fuel-logs" element={<FuelLogsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/roles" element={<RolesPage />} />
        <Route path="/admin/ports" element={<PortsPage />} />
        <Route path="/admin/audit" element={<AuditPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
