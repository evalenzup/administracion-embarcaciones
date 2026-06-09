# Propuesta de Integración — Inicio de Sesión con Google (cicese.edu.mx)

Este documento contiene el plan técnico y las credenciales obtenidas para integrar el inicio de sesión y registro automático con cuentas de Google restringido a correos institucionales de CICESE.

---

## Parámetros de Configuración

* **Google Client ID:** `680523245044-nvvok1ohsueegbdulchpi7mn3hqs4hfm.apps.googleusercontent.com`
* **Dominios Permitidos:** `@cicese.edu.mx` y `@cicese.mx`
* **Rol Asignado por Defecto:** `Consulta` (ID: 5, solo lectura)

---

## Flujo de Trabajo Propuesto

### 1. Variables de Entorno (.env)
Añadir la nueva variable tanto en `.env` como en `.env.example`:
```env
# === Google Auth ===
VITE_GOOGLE_CLIENT_ID=680523245044-nvvok1ohsueegbdulchpi7mn3hqs4hfm.apps.googleusercontent.com
```

### 2. Backend (FastAPI)
* **Endpoint de Validación (`/api/v1/auth/google`):**
  - Recibe el token JWT emitido por el cliente de Google.
  - Verifica el token haciendo una llamada a `https://oauth2.googleapis.com/tokeninfo?id_token={token}`.
  - Valida el dominio del correo (`@cicese.edu.mx` o `@cicese.mx`). Si no coincide, rechaza con `400 Bad Request`.
  - Si el usuario no existe en la base de datos, lo registra automáticamente con:
    - `username` = Prefijo del correo.
    - `email` = Correo institucional de Google.
    - `full_name` = Nombre entregado por Google.
    - `roles` = Rol de `Consulta` (ID: 5) por defecto.
    - Contraseña bloqueada/deshabilitada.
  - Genera y retorna los tokens JWT locales (`access_token` y `refresh_token`).

### 3. Frontend (React / Vite)
* **AuthContext.jsx:**
  - Añadir la función `loginWithGoogle(googleToken)` que envía la credencial recibida al backend y guarda los tokens locales en `localStorage`.
* **LoginPage.jsx:**
  - Cargar de forma dinámica el script de Google Identity Services (`https://accounts.google.com/gsi/client`).
  - Renderizar el botón oficial de Google (`google.accounts.id.renderButton`) debajo del formulario de login clásico.

---

## Consideraciones sobre Dominios e IPs locales
Dado que Google Cloud prohíbe el uso de direcciones IP directas (ej: `http://192.168.1.50:3010`) en los orígenes autorizados, para que otros usuarios accedan al sistema de forma remota se debe:
1. **En desarrollo:** Configurar un dominio local (ej: `http://siae.local:3010`) y mapear la IP de la computadora host en los archivos de `hosts` de las máquinas cliente.
2. **En producción:** Asignar un subdominio DNS oficial de CICESE (ej: `https://siae.cicese.mx`) y registrarlo en la consola de Google.
