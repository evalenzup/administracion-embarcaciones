# SIAE — Archivo de Contexto del Proyecto

> **Este archivo sirve como referencia persistente para mantener la coherencia del desarrollo.**
> Actualizar conforme se avanza en las fases.

---

## Información General

| Campo | Valor |
|---|---|
| **Nombre** | SIAE — Sistema de Administración de Embarcaciones |
| **Organización** | CICESE — Departamento de Embarcaciones Oceanográficas |
| **Versión actual** | 0.1.0 |
| **Fase actual** | Mantenimiento Continuo / Soporte |
| **Última actualización** | 2026-05-26 |

---

## Stack Tecnológico

- **Frontend:** React 18 + Ant Design 5 + Vite 5 + React Router 6
- **Backend:** FastAPI + Python 3.11 + SQLAlchemy 2 + Alembic
- **Base de datos:** PostgreSQL 16
- **Contenedores:** Docker + Docker Compose
- **Autenticación:** JWT (python-jose) + RBAC personalizado
- **Tipografía:** Inter (Google Fonts)

---

## Puertos

| Servicio | Puerto |
|---|---|
| Frontend | `localhost:3010` |
| Backend API | `localhost:8010` |
| PostgreSQL | `localhost:5433` |
| Swagger docs | `localhost:8010/docs` |

---

## Convenciones de Código

### Backend (Python)
- **Nomenclatura:** `snake_case` para todo
- **Modelos:** Un archivo por modelo en `app/models/`, hereda de `Base`
- **Schemas Pydantic:** Sufijos `Create`, `Update`, `Response`, `List`
- **Routers:** Prefijo `/api/v1/`, un archivo por módulo
- **Services:** Lógica de negocio en `app/services/`, separada de routers
- **Dependencies:** En `app/dependencies.py` (get_db, require_permission, etc.)
- **Errores:** `HTTPException` con códigos HTTP estándar
- **Paginación:** Parámetros `skip` + `limit`

### Frontend (React)
- **Nomenclatura:** PascalCase para componentes, camelCase para funciones/variables
- **Componentes:** Functional components con hooks
- **Estado global:** React Context (AuthContext, PermissionContext)
- **Estado local:** useState / useReducer
- **API:** Axios centralizado en `src/api/client.js` con interceptors
- **Rutas:** React Router v6, lazy loading para pages
- **Formularios:** Ant Design `<Form>` con reglas de validación
- **Notificaciones:** `message` (inline) y `notification` (flotante) de AntD
- **Permisos UI:** Componente `<CanAccess module="x" action="y">` 

### CSS / Diseño
- **Tema:** Definido en `src/styles/theme.js`
- **Paleta principal:** Azul marino/náutico (#0A2647, #1B4F72, #2C74B3)
- **Fuente:** Inter (300, 400, 500, 600, 700)
- **Border radius:** 8px (normal), 12px (cards), 16px (modales)
- **Animaciones:** fadeIn y slideInLeft en `global.css`
- **Sidebar:** Fondo oscuro (#0A2647) con menú filtrado por permisos

### General
- **Commits:** Conventional Commits (feat:, fix:, chore:, refactor:, docs:)
- **DRY:** No duplicar lógica
- **Docstrings:** En funciones de servicio (Python) y hooks custom (JSDoc)
- **Idioma interfaz:** Español
- **Idioma código:** Inglés (variables, funciones, endpoints)

---

## Estructura de Permisos (RBAC)

- **Módulos:** vessels, documents, maintenance, inventory, logbooks, cruises, personnel, users, roles, dashboard
- **Acciones:** view, create, edit, delete
- **Roles predeterminados:** Administrador, Capitán, Jefe de Máquinas, Operador, Consulta
- Los roles y permisos son configurables desde la UI de admin

---

## Módulos del Sistema

| # | Módulo | Fase | Estado |
|---|---|---|---|
| 1 | Infraestructura Docker | 1 | ✅ Completado |
| 2 | Auth + Usuarios + Permisos + Layout | 2 | ✅ Completado |
| 3 | Embarcaciones (CRUD) + Auditoría | 3 | ✅ Completado |
| 4 | Documentación + Mantenimiento | 4 | ✅ Completado |
| 5 | Inventario + Bitácoras | 5 | ✅ Completado |
| 6 | Cruceros + Personal | 6 | ✅ Completado |
| 7 | Dashboard + Polish + Producción | 7 | ✅ Completado (Local) / ⏳ Prod Pendiente |

---

## Notas de Desarrollo

- **Flota:** 1 barco, 1 yate, 4 pangas (6 embarcaciones)
- El usuario puede tener relación opcional con `Personnel` via `personnel_id`
- Los documentos de embarcaciones y personal tienen control de vigencia (semáforo)
- Las categorías de mantenimiento son **configurables** desde la UI
- **Rutinas de Mantenimiento:** Integradas con el inventario (BOM). Al completar un mantenimiento, se descuentan automáticamente las piezas del stock.
- Los tipos de bitácora (Libros Oficiales): Capitán, Cubierta, Máquinas. Las lecturas de horómetros se capturan como parte de Máquinas.
- **Catálogo Dinámico de Eventos:** Los eventos de bitácora (Fondeo, Zarpe, Falla, etc.) son configurables y unificados.
- **Bitácora de auditoría del sistema:** registrar automáticamente quién hizo qué (user, action, module, entity, timestamp, details)
- Los planes de crucero incluirán **mapa interactivo** (Leaflet) como fuente principal + tabla de coordenadas
- **Idioma interfaz:** 100% español

---

## Archivos Importantes

| Archivo | Descripción |
|---|---|
| `CONTEXT.md` | Este archivo — contexto persistente |
| `docker-compose.yml` | Configuración de servicios Docker |
| `.env` | Variables de entorno (NO commitear) |
| `backend/app/main.py` | Entry point FastAPI + lifespan (seed) |
| `backend/app/config.py` | Settings centralizados |
| `backend/app/database.py` | Conexión a BD |
| `backend/app/dependencies.py` | get_db, get_current_user, require_permission |
| `backend/app/models/` | User, Role, Permission, UserRole, role_permissions |
| `backend/app/services/seed.py` | Seed de datos iniciales (permisos, roles, admin) |
| `backend/app/utils/security.py` | hash_password, verify_password, JWT tokens |
| `frontend/src/App.jsx` | Rutas protegidas y layout |
| `frontend/src/context/AuthContext.jsx` | Estado global de autenticación |
| `frontend/src/components/Layout/MainLayout.jsx` | Layout con sidebar filtrado por permisos |
| `frontend/src/components/common/CanAccess.jsx` | Componente y hook de permisos UI |
| `frontend/src/styles/theme.js` | Tema Ant Design |
| `frontend/src/api/client.js` | Cliente Axios centralizado |

---

## Gestión Financiera del DEO

Como parte de la administración de las embarcaciones en el DEO, se cuenta con un área de finanzas encargada de gestionar órdenes de compra, adquisiciones, contrataciones de personal y viáticos. Esta gestión se maneja a través de dos cuentas contables:
*   **Cuenta 624602**: Recursos autogenerados del Departamento de Embarcaciones Oceanográficas.
*   **Cuenta 624108**: Recursos fiscales del Departamento de Embarcaciones Oceanográficas.

