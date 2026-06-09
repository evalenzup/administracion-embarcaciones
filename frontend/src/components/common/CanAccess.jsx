/**
 * SIAE — Componente CanAccess: renderizado condicional por permisos.
 *
 * Uso:
 *   <CanAccess module="maintenance" action="create">
 *     <Button>Nuevo Mantenimiento</Button>
 *   </CanAccess>
 */

import { useAuth } from '../../context/AuthContext';

export function CanAccess({ module, action, children, fallback = null }) {
  const { hasPermission } = useAuth();

  if (hasPermission(module, action)) {
    return children;
  }

  return fallback;
}

/**
 * Hook para verificar permisos.
 * Uso: const canEdit = usePermission('vessels', 'edit');
 */
export function usePermission(module, action) {
  const { hasPermission } = useAuth();
  return hasPermission(module, action);
}

export default CanAccess;
