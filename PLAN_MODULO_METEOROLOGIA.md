# Plan de desarrollo — Módulo de Meteorología y Planeación de Cruceros (SIAE)

> **Instrucciones para el asistente (Claude u otro modelo):** Este documento es la
> especificación completa del módulo. Trabaja **una fase a la vez**, en orden.
> Al terminar cada fase, verifica los criterios de aceptación antes de continuar.
> No inventes rutas ni convenciones nuevas: sigue los patrones existentes del
> proyecto (revisa `backend/app/routers/cruises.py` y
> `frontend/src/pages/Cruises/CruisesPage.jsx` como referencia de estilo).

## Contexto del proyecto

- **Qué es SIAE:** Sistema de administración de embarcaciones oceanográficas de CICESE (DEO).
- **Backend:** FastAPI + SQLAlchemy 2 + PostgreSQL + Alembic, en `backend/app/`.
  Los routers se registran en `backend/app/main.py` con `app.include_router(...)`.
  Prefijo de API: `/api/v1` (verificar en `config.py`).
- **Frontend:** React 18 + Vite + Ant Design 5 + react-leaflet 4 + Leaflet 1.9, en `frontend/src/`.
  Las páginas viven en `frontend/src/pages/<Modulo>/`. Cliente HTTP: `frontend/src/api/client.js` (axios con auth).
  Permisos: componente `CanAccess` (`frontend/src/components/common/CanAccess.jsx`).
- **Servidor de producción:** Mac Studio M1 Ultra (Apple Silicon, macOS). Los jobs
  programados se harán con `launchd` o APScheduler dentro del backend.
- **Ya existe** una página de Cruceros con mapa Leaflet y waypoints (`frontend/src/pages/Cruises/CruisesPage.jsx`).

## Objetivo del módulo

Una página nueva **"Meteorología / Planeación"** dentro de SIAE que muestre:

1. **Mapa animado de viento y oleaje** (estilo Windy) sobre la región de operación
   (Baja California / Golfo de California / Pacífico frente a Ensenada), con datos
   propios descargados de modelos globales (GFS y WaveWatch III de NOAA).
2. **Pronóstico numérico por punto de interés** (puertos/rampas): tablas y gráficas
   de viento, ráfagas, oleaje, visibilidad.
3. **Predicción de mareas** con cálculo de ventanas de operación por rampa
   (fase posterior; los datos vienen de CICESE, formato por definir con el usuario).
4. **Disponibilidad de embarcaciones** (línea de tiempo con los cruceros ya registrados).
5. **Integración con planes de crucero**: semáforo de condiciones para las fechas del plan.

### Decisiones ya tomadas (no re-discutir)

- **NO** usar la API de Windy. Se descargan los modelos directamente de NOAA (gratuitos).
- Fuente de viento: **GFS 0.25°** vía NOMADS (`https://nomads.ncep.noaa.gov`).
- Fuente de oleaje: **WaveWatch III (GFS-Wave)** vía NOMADS.
- Procesamiento con **Python: xarray + cfgrib** (requiere `eccodes` instalado con Homebrew: `brew install eccodes`).
- Visualización de viento con **leaflet-velocity** (npm: `leaflet-velocity`) sobre el Leaflet existente.
- El backend actúa de **proxy con caché**: el frontend solo consume la API de SIAE, nunca a NOAA directo.
- Región de recorte (bounding box): originalmente lat 18-34, lon -122 a -105;
  **ampliada el 2026-07-10 a lat 14-34, lon -122 a -85** (todos los mares
  mexicanos: Pacífico, Golfo de California, Golfo de México y Caribe, cubriendo
  las 43 estaciones mareográficas). Definida en `BBOX` de `weather_fetcher.py`
  y su gemela `MODEL_BOUNDS` en `WeatherPage.jsx` — cambiar ambas juntas.
  **⚠️ Al cambiar el bbox hay que borrar `weather_data/raw` y `processed`**
  (los GRIB cacheados tienen el recorte viejo y la descarga los salta).
  **⚠️ Rate-limit de NOMADS:** ~120 peticiones/minuto por IP; excederlo produce
  bloqueo temporal con respuestas 302. Por eso existe
  `INTER_REQUEST_DELAY_SECONDS = 0.7` entre descargas (nos bloquearon al
  redescargar el dominio completo dos veces seguidas). Relacionado: el
  scheduler ya no da por buena una corrida con manifest vacío
  (`wind_hours` vacío = reintentar, no saltar).

---

## FASE 1 — Pipeline de descarga y procesamiento (backend)

### 1.1 Dependencias nuevas — ✅ HECHO

Agregado a `backend/requirements.txt` (versiones exactas usadas y verificadas):

```
httpx==0.27.2
xarray==2024.9.0
cfgrib==0.9.14.0
numpy>=1.26
apscheduler==3.10.4
```

**Corrección importante sobre el entorno de ejecución:** el backend de SIAE
corre **containerizado** (`backend/Dockerfile`, base `python:3.11-slim`), no
directo sobre macOS del Mac Studio. La nota original sobre Homebrew/`brew
install eccodes` no aplica al contenedor. En su lugar:

- Se agregó `libeccodes-dev` a las dependencias de `apt-get` en `backend/Dockerfile`
  (por si algún día se compila algo contra la librería nativa).
- En la práctica, el paquete `cfgrib` de PyPI para `linux/aarch64` (compatible
  con Apple Silicon vía Docker Desktop) **ya trae binarios precompilados**
  (`eccodeslib`), así que la instalación funcionó sin depender de `apt`.
  Confirmado con `docker compose build backend` exitoso.
- **Importante — persistencia de datos:** se agregó un volumen nombrado
  `siae_weather_data` en `docker-compose.yml`, montado en `/app/weather_data`
  dentro del contenedor `backend`. Sin este volumen, los GRIB descargados y los
  JSON procesados viven solo en la capa de escritura del contenedor y **se
  pierden en cada `docker compose build`/recreate**, forzando redescargas
  innecesarias. Si en el futuro se despliega el backend de otra forma, no
  olvidar este volumen (o el equivalente en el nuevo esquema de despliegue).

### 1.2 Servicio de descarga — `backend/app/services/weather_fetcher.py`

Crear un módulo con estas funciones:

- `download_gfs_wind(run_date, run_hour, forecast_hours) -> Path`
  Descarga GRIB2 recortado usando el filtro de NOMADS. URL patrón:

  ```
  https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl
    ?dir=%2Fgfs.{YYYYMMDD}%2F{HH}%2Fatmos
    &file=gfs.t{HH}z.pgrb2.0p25.f{FFF}
    &var_UGRD=on&var_VGRD=on&var_GUST=on
    &lev_10_m_above_ground=on&lev_surface=on
    &subregion=&toplat=34&leftlon=-122&rightlon=-105&bottomlat=18
  ```

  donde `{HH}` ∈ {00,06,12,18} y `{FFF}` es la hora de pronóstico con 3 dígitos
  (000, 003, 006 … 120). Descargar horas 0 a 120 en pasos de 3 h.

- `download_ww3_waves(run_date, run_hour, forecast_hours) -> Path`
  Igual pero con `filter_gfswave.pl`, archivo
  `gfswave.t{HH}z.global.0p25.f{FFF}.grib2`, variables
  `var_HTSGW=on` (altura significativa), `var_PERPW=on` (periodo), `var_DIRPW=on` (dirección).

- `latest_available_run() -> (date, hour)`
  Los datos de una corrida están disponibles ~3.5-5 h después de su hora nominal.
  Calcular la corrida más reciente probable y verificar con una petición HEAD;
  si no existe, retroceder 6 h.

- Guardar los GRIB crudos en `backend/weather_data/raw/{YYYYMMDD}{HH}/` y
  borrar corridas con más de 48 h de antigüedad.

Manejo de errores: NOMADS a veces responde 302/503 o archivos incompletos.
Reintentar 3 veces con backoff. Si una hora de pronóstico falla, continuar con
las demás (registrar warning), no abortar la corrida completa.

### 1.3 Procesamiento — `backend/app/services/weather_processor.py`

- `grib_to_velocity_json(grib_path) -> dict`
  Leer con `xarray.open_dataset(path, engine="cfgrib")` y producir el formato
  que consume leaflet-velocity: una **lista de 2 objetos** (componente U y V),
  cada uno con:

  ```json
  {
    "header": {
      "parameterCategory": 2, "parameterNumber": 2,   // 2 para U, 3 para V
      "lo1": -122.0, "la1": 34.0, "lo2": -105.0, "la2": 18.0,
      "dx": 0.25, "dy": 0.25, "nx": 69, "ny": 65,
      "refTime": "2026-07-08T12:00:00Z", "forecastTime": 24
    },
    "data": [/* nx*ny valores fila por fila desde la1,lo1 */]
  }
  ```

  Cuidado con la convención de longitudes: GFS usa 0-360; convertir a -180/180.
  Verificar el orden de las latitudes (GFS entrega de norte a sur, que es lo que
  leaflet-velocity espera con `la1` = norte).

- `grib_waves_to_grid_json(grib_path) -> dict`
  Para oleaje basta una malla escalar: `{"header": {...igual...}, "data": [...]}`,
  con `null` en celdas de tierra (los GRIB de WW3 traen NaN en tierra).

- `process_run(run_date, run_hour)`
  Procesa todos los GRIB de la corrida y escribe JSONs en
  `backend/weather_data/processed/{YYYYMMDD}{HH}/wind_f{FFF}.json` y `waves_f{FFF}.json`,
  más un `manifest.json` con la lista de horas disponibles y metadatos de la corrida.

### 1.4 Scheduler

En `backend/app/main.py`, dentro del evento de arranque (lifespan), iniciar
APScheduler con un job que corra cada hora: si hay una corrida nueva no procesada,
descargarla y procesarla. También exponer un disparo manual (ver endpoint abajo).
Proteger con un lock para no descargar dos veces en paralelo.

### 1.5 Router — `backend/app/routers/weather.py`

Seguir el patrón de los routers existentes (prefijo, tags, `Depends` de auth).
Endpoints:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/weather/status` | Corrida activa, horas disponibles, timestamp de última actualización |
| GET | `/weather/wind?hour={FFF}` | JSON leaflet-velocity de la corrida más reciente |
| GET | `/weather/waves?hour={FFF}` | JSON de malla escalar de oleaje |
| GET | `/weather/point?lat=..&lon=..` | Serie temporal (todas las horas de pronóstico) interpolada al punto: viento, ráfaga, dirección, ola, periodo |
| POST | `/weather/refresh` | (solo admin) dispara descarga/procesamiento manual |

El endpoint `point` lee los JSON procesados (o mantiene los arrays en memoria) e
interpola bilinealmente. Responder con lista de
`{time, wind_speed_kt, wind_gust_kt, wind_dir_deg, wave_height_m, wave_period_s, wave_dir_deg}`.
**Convertir m/s a nudos** (× 1.9438) — los usuarios son marinos, trabajan en nudos.

Registrar el router en `main.py` junto a los demás.

### Criterios de aceptación Fase 1 — ✅ TODOS VERIFICADOS (2026-07-08)

1. ✅ `/weather/status` devolvió la corrida `20260708 12Z` con 41 horas de pronóstico (0-120h cada 3h).
2. ✅ `/weather/wind?hour=24` devolvió JSON formato velocity válido: 2 componentes, `nx=69, ny=65`, `nx*ny == len(data) == 4485`.
3. ✅ `/weather/point?lat=30.0&lon=-118.0` (punto mar adentro) devolvió serie con viento 16-20 kt y oleaje 2.2 m, periodo 8-17 s — físicamente plausible.
   ⚠️ **Nota de datos:** el punto de Ensenada (31.845, -116.64, dentro de la bahía)
   devuelve `wave_height_m: null` — el modelo global WW3 a 0.25° enmascara esa
   celda como tierra por estar muy cerca de la costa en una bahía angosta.
   Esto **no es un bug**, es una limitación real de resolución del modelo.
   Tenerlo en cuenta en Fase 2/4: la UI debe mostrar "sin datos de oleaje en
   este punto" en vez de fallar, y al definir `operation_points` en Fase 4
   puede convenir usar un punto ligeramente más mar adentro para rampas en
   bahías cerradas, o interpolar desde el punto navegable más cercano con datos.
4. ✅ Pipeline completo (82 archivos GRIB2, ~13 MB) tardó **60 segundos** de
   punta a punta (descarga + procesamiento), muy por debajo del límite de 10 min.
   Se dispara en background (`asyncio.create_task`) desde el lifespan de FastAPI,
   por lo que el backend reporta "Application startup complete" sin esperar al
   pipeline — no bloquea ni rompe el arranque.

### Desviaciones respecto al diseño original (documentadas, no arbitrarias)

- **`waves_f{fff}.json` agrupa 3 variables** (`height`, `period`, `direction`)
  en un solo archivo con esa estructura, en vez de la forma genérica
  `{header, data}` descrita originalmente — porque `/weather/point` necesita
  las tres variables por cada hora, y el mapa (Fase 2) solo usará el campo
  `height`. Ver docstring de `grib_waves_to_grid_json` en `weather_processor.py`.
- Se agregó una malla adicional de **ráfaga** (`gust_f{fff}.json`, formato
  `{header, data}` como oleaje) que no estaba explícita en el diseño original,
  necesaria para poblar `wind_gust_kt` en `/weather/point`.
- Se agregó `backend/app/schemas/weather.py` (no mencionado explícitamente en
  el plan original) siguiendo la convención del resto del proyecto de usar
  `response_model` con Pydantic en los routers.
- El endpoint `POST /weather/refresh` usa `require_permission("weather", "refresh")`.
  Esa combinación módulo/acción **no está seedeada** en ningún rol todavía —
  en la práctica solo el superadmin (que siempre pasa `has_permission`) puede
  usarlo por ahora. Si se quiere dar el permiso a un rol específico, hay que
  agregarlo al seed de permisos (`backend/app/services/seed.py`).

### Archivos creados/modificados en esta fase

- `backend/requirements.txt` — dependencias nuevas.
- `backend/Dockerfile` — `libeccodes-dev`.
- `docker-compose.yml` — volumen `siae_weather_data` para persistir `weather_data/`.
- `backend/.gitignore` — nuevo, ignora `weather_data/` (no versionar GRIB/JSON descargados).
- `backend/app/services/weather_fetcher.py` — descarga NOMADS con reintentos.
- `backend/app/services/weather_processor.py` — GRIB2 → JSON (viento, ráfaga, oleaje).
- `backend/app/services/weather_query.py` — interpolación bilineal para `/weather/point`.
- `backend/app/services/weather_scheduler.py` — orquestación con lock + APScheduler.
- `backend/app/schemas/weather.py` — schemas Pydantic de respuesta.
- `backend/app/routers/weather.py` — endpoints `/status`, `/wind`, `/waves`, `/point`, `/refresh`.
- `backend/app/main.py` — registro del router + arranque/cierre del scheduler en el lifespan.

Todo el trabajo de esta fase está en la rama `feature/weather-module` (no mergeada a `main` — pendiente de revisión del usuario).

---

## FASE 2 — Página de Meteorología (frontend)

### Archivos creados/modificados en esta fase

- `frontend/package.json` — `leaflet-velocity`, `recharts`.
- `frontend/src/utils/leafletGlobal.js` — nuevo, ver "Desviación" abajo.
- `frontend/src/pages/Weather/WeatherPage.jsx` — página principal.
- `frontend/src/pages/Weather/VelocityLayer.jsx` — capa de partículas de viento.
- `frontend/src/pages/Weather/WaveOverlay.jsx` — capa de color de oleaje.
- `frontend/src/pages/Weather/PointForecastPanel.jsx` — panel lateral con gráficas (Recharts) y tabla.
- `frontend/src/App.jsx` — ruta `/weather`.
- `frontend/src/components/Layout/MainLayout.jsx` — ítem de menú "Meteorología" (sin permiso, visible a todos) + breadcrumb.

### 2.1 Dependencias

`npm install leaflet-velocity` (en `frontend/`). Se importa con
`import 'leaflet-velocity'` (registra `L.velocityLayer` como plugin global de Leaflet)
y `import 'leaflet-velocity/dist/leaflet-velocity.css'`.

### 2.2 Estructura

Crear `frontend/src/pages/Weather/`:

- `WeatherPage.jsx` — página principal.
- `VelocityLayer.jsx` — componente react-leaflet que envuelve `L.velocityLayer`
  (crear la capa en un `useEffect` con `useMap()`, destruirla en el cleanup;
  al cambiar la hora del pronóstico usar `layer.setData(nuevo)` en vez de recrear).
- `WaveOverlay.jsx` — capa de color para altura de ola: renderizar la malla escalar
  a un `<canvas>` (colorear por valor con una escala tipo viridis/turbo, transparente
  en `null`) y montarlo como `L.imageOverlay` con el bbox del header.
- `PointForecastPanel.jsx` — panel lateral con el pronóstico del punto seleccionado.

### 2.3 Comportamiento de `WeatherPage`

- Mapa Leaflet a pantalla (misma configuración de tiles OSM que `CruisesPage.jsx`),
  centrado en [29.5, -113.5], zoom 6.
- **Slider de tiempo** (antd `Slider` con marcas cada 24 h) sobre el mapa: al moverlo
  se pide `/weather/wind?hour=X` y `/weather/waves?hour=X` y se actualizan capas.
  Mostrar fecha/hora local legible de la hora seleccionada (usar dayjs, ya instalado).
  Cachear en memoria las horas ya visitadas. Botón play/pausa que avanza cada ~800 ms.
- **Selector de capas**: checkboxes Viento (partículas) / Oleaje (color).
- **Click en el mapa** → llama `/weather/point` y abre `PointForecastPanel` con:
  - Gráfica de viento y ráfagas (kt) vs tiempo.
  - Gráfica de altura de ola (m) vs tiempo.
  - Tabla horaria compacta.
  - Para gráficas: usar SVG simple hecho a mano o instalar `recharts` (preferir recharts).
- **Puntos de interés fijos** (marcadores siempre visibles, hardcodear por ahora,
  en Fase 4 saldrán de la BD): Rada de Ensenada (31.845, -116.64), El Sauzal
  (31.895, -116.70), San Quintín (30.40, -116.00). Click en marcador = igual que click en mapa.
- Banner discreto con la corrida activa: "Modelo GFS/WW3 — corrida 2026-07-08 12Z,
  actualizado hace N horas" (de `/weather/status`).

### 2.4 Ruta y menú

- Agregar la ruta en `frontend/src/App.jsx` siguiendo el patrón de las demás páginas
  (ej. `/weather`, envuelta en `ProtectedRoute`).
- Agregar entrada al menú en `frontend/src/components/Layout/MainLayout.jsx`
  ("Meteorología", icono `CloudOutlined` de `@ant-design/icons`), visible para
  todos los usuarios autenticados.

### Criterios de aceptación Fase 2

1. La página carga y muestra animación de partículas de viento coherente (las
   partículas fluyen, no estática, dirección plausible).
2. El slider cambia la hora sin recargar la página ni parpadeos largos.
3. Click en Ensenada muestra panel con gráficas pobladas.
4. La capa de oleaje colorea el mar y deja la tierra transparente.
5. Sin errores en consola del navegador.

### Estado — ⚠️ IMPLEMENTADA, VERIFICACIÓN VISUAL PENDIENTE (2026-07-08)

Todo el código de esta fase está escrito y "verificado en frío" (ver abajo),
pero **no se pudo abrir un navegador real en esta sesión** (la extensión
Chrome del entorno no conectó, y el puerto 3010 ya lo ocupa el contenedor
Docker del frontend, así que tampoco se pudo levantar una instancia paralela
con la herramienta de preview). Los criterios de aceptación 1-5 de arriba
**no están confirmados visualmente todavía**.

**Lo que sí se verificó (sin navegador):**

- `docker exec siae_frontend npx vite build` — compiló sin errores: 4137
  módulos resueltos, incluidos `leaflet-velocity` y `recharts` sin conflictos
  de imports/sintaxis.
- Las opciones pasadas a `L.velocityLayer(...)` (`displayValues`,
  `displayOptions.{velocityType, position, emptyString, angleConvention,
  speedUnit}`, `maxVelocity`, `velocityScale`, y el método `.setData()`) se
  contrastaron línea por línea contra el código fuente real de
  `node_modules/leaflet-velocity/dist/leaflet-velocity.js` — coinciden exactamente.
- `GET /api/v1/weather/status` sigue respondiendo `available: true` con la
  corrida de la Fase 1 intacta (el volumen persistente funciona).
- El dev server de Vite (`docker compose logs frontend`) no reportó errores
  de compilación al recibir los archivos nuevos vía HMR.

**Qué falta — pide al usuario (o hazlo tú si tienes Chrome disponible) que:**

1. Abra `http://localhost:3010/weather` con sesión iniciada.
2. Confirme que las partículas de viento se animan sobre el mapa.
3. Mueva el slider de tiempo y confirme que cambia sin parpadeos raros.
4. Haga click en "Rada de Ensenada" y confirme que el panel lateral muestra
   gráficas de oleaje pobladas (ya no deberían salir vacías — ver fix de
   "vecino más cercano" y máscara de tierra más abajo en esta sección).
5. Abra la consola del navegador (F12) y confirme que no hay errores en rojo.
6. Si algo falla, reportar el error exacto de consola para poder corregirlo
   en la siguiente sesión — no dar la fase por cerrada hasta confirmar.

### Desviación respecto al diseño original

- Se agregó `frontend/src/utils/leafletGlobal.js`, no mencionado en el plan
  original. Es necesario porque `leaflet-velocity` (dist/leaflet-velocity.js)
  no es un módulo ES/UMD — asume que `L` ya existe como variable global del
  navegador (patrón de plugin de Leaflet pre-ES-modules). Este archivo importa
  `leaflet` y hace `window.L = L` como efecto secundario de módulo, y debe
  importarse ANTES que `'leaflet-velocity'` en cualquier archivo que lo use
  (ver comentario en el propio archivo). `VelocityLayer.jsx` y `WeatherPage.jsx`
  importan `L` desde este wrapper en vez de `'leaflet'` directamente.
- `package.json` del frontend: se agregaron `leaflet-velocity@^1.4.0`
  (resolvió a 1.9.2) y `recharts@^2.12.7`. Como el `Dockerfile` del frontend
  copia `package.json` e instala en build time (no hay `node_modules` bind-mounteado),
  **hubo que reconstruir la imagen** (`docker compose build frontend`) para
  que tomara las nuevas dependencias — igual que pasó con el backend en Fase 1.

### Fixes post-verificación visual (2026-07-08, sesión con screenshots del usuario)

Durante la revisión con el usuario (compartiendo screenshots reales del navegador)
salieron 4 problemas que no se detectaron con la verificación "en frío":

1. **Slider de tiempo roto/apachurrado.** Causa: `antd Space` no propaga
   `flex: 1` a sus hijos (el div que envolvía el `Slider` nunca se estiraba).
   Fix: reemplazado por un `<div style={{ display: 'flex' }}>` plano en
   `WeatherPage.jsx`.
2. **Vite dev server sirviendo código viejo pese a que el archivo en disco ya
   tenía el fix.** El watcher de archivos de Vite (`usePolling: true`) dejó de
   detectar cambios en `src/pages/Weather/` después de un rato — problema
   conocido de bind mounts de Docker Desktop en macOS. Se resolvió con
   `docker compose restart frontend`. **Si en una sesión futura un cambio no
   se refleja en el navegador pese a estar guardado en disco, sospechar esto
   primero** (verificar con `curl http://localhost:3010/src/...` si el
   servidor realmente está sirviendo el contenido actualizado antes de asumir
   que el código está mal).
3. **Slider solo saltaba entre marcas de 24h** (`step={null}` restringe el
   valor a los `marks`). Fix: `step={6}` (compatible con los datos, que están
   cada 3h) + prop `dots` para mostrar visualmente cada paso en la línea.
4. **Mapa con centro/zoom fijo mostraba demasiado territorio sin datos**
   (Texas, interior de EE.UU.). Fix: `MapContainer` usa ahora `bounds`
   (fit automático al bbox del modelo `[[18,-122],[34,-105]]`, constante
   `MODEL_BOUNDS`) en vez de `center`/`zoom` fijos.
5. **Oleaje con borde rectangular duro visible en el mar** al alejar el zoom.
   Fix inicial: desvanecido (feather) de 10 celdas en `WaveOverlay.jsx` sobre
   el borde del recorte del modelo (`edgeDist` = distancia al borde del array,
   no a la costa).
6. **Oleaje pintado sobre tierra firme (desierto de Sonora/Chihuahua), como
   manchas circulares aisladas.** Causa raíz real: WW3 a 0.25° (~27 km/celda)
   usa una máscara tierra/agua basada en batimetría gruesa que a veces cuenta
   lagos/presas grandes (ej. cerca de Hermosillo/Cuauhtémoc) como si fueran
   mar. **Se investigó cómo lo resuelve Windy** (es información pública que ha
   compartido su fundador): ellos desacoplan el mask de la fuente
   meteorológica y usan una línea de costa propia de alta resolución en vez
   de confiar en la bandera nativa del modelo — la misma resolución de datos
   base (GFS/WW3 0.25°) que usamos nosotros. Se replicó ese enfoque:
   - Nueva dependencia `global-land-mask==1.0.0` (agregada a
     `backend/requirements.txt`), basada en datos de costa GSHHG a ~1 km de
     resolución (`globe.is_land(lat, lon)`, vectorizable con arrays numpy).
   - `weather_processor.py`: nueva función `_land_mask(lats, lons)` que
     construye una malla booleana tierra/agua de alta resolución sobre la
     grilla del modelo. Se aplica **solo a oleaje** (`grib_waves_to_grid_json`
     → height/period/direction), forzando `null` donde la máscara real dice
     tierra, sin importar lo que diga la bandera nativa de WW3. **No se aplica
     a viento/ráfaga** — esas variables sí son válidas y significativas sobre
     tierra (GFS las modela ahí también), enmascararlas sería incorrecto.
   - Efecto colateral esperado y correcto: la celda de malla más cercana a
     bahías angostas (ej. Ensenada) ahora también puede salir `null` en el
     endpoint de malla (`/weather/waves`) si el centro de esa celda de 27 km
     cae sobre la costa — es física correcta a esa resolución, no un bug. Para
     eso existe el fallback de "vecino más cercano con datos" en
     `weather_query.py` (`/weather/point`), que sigue funcionando bien tras
     este cambio (verificado con El Sauzal y Rada de Ensenada).
   - **Importante:** las corridas ya procesadas antes de este fix tienen el
     oleaje viejo (sin máscara) en `weather_data/processed/`. Se reprocesó
     manualmente la corrida activa (`process_run(run_date, run_hour)` desde un
     shell dentro del contenedor) para aplicar el fix sin esperar a la
     siguiente corrida automática. Si se despliega este fix en otro ambiente,
     considerar hacer lo mismo o simplemente esperar a la próxima corrida
     programada (cada 6h).
7. **El fix 6 no bastó: el color seguía "sangrando" sobre tierra en el mapa**
   (screenshot del usuario: el color del Golfo se derramaba sobre la costa de
   Sonora cerca de Puerto Peñasco). Causa: aunque los DATOS ya estaban bien
   enmascarados, el frontend rasterizaba la malla cruda a un canvas de 68×65
   píxeles que el navegador estira/difumina sobre todo el mapa — cada celda de
   ~27 km se esparce visualmente sobre la costa. **Solución definitiva
   (arquitectura cambiada):** el renderizado del oleaje se movió al backend.
   - `weather_processor.py`: nueva función `render_waves_png()` — sobremuestrea
     la malla 10× con interpolación bilineal (0.25° → 0.025°, ~2.7 km/píxel),
     rellena NaNs costeros por dilatación iterativa (`_fill_nan_nearest`, solo
     para que la interpolación no propague huecos — la máscara decide qué se
     ve), aplica la máscara de costa GSHHG **por píxel**, y guarda un PNG RGBA
     (~107 KB/hora) junto a los JSON (`waves_f{FFF}.png`). Requiere `pillow`
     (agregado a requirements). El corte en la línea de costa queda exacto.
   - `manifest.json` ahora incluye `wave_bbox` (bounds Leaflet de la malla de
     oleaje), expuesto también en `/weather/status`.
   - Nuevo endpoint `GET /weather/waves-image?hour=N` → `FileResponse` del PNG.
   - `WaveOverlay.jsx` reescrito: ya no rasteriza nada — baja el PNG como blob
     vía axios (necesario para mandar el JWT; un `<img src>` directo no puede),
     crea un object URL y lo monta como `L.imageOverlay` con `wave_bbox`.
     `WeatherPage.jsx` cachea los object URLs por hora y los revoca al
     desmontar la página.
   - El endpoint JSON `/weather/waves` sigue existiendo (lo usa internamente
     `/weather/point` y puede servir a futuros consumidores de datos crudos),
     pero el mapa ya no lo consume.
   - Verificado: el PNG generado (inspeccionado como imagen) muestra la
     península de BC y la costa de Sonora recortadas limpiamente, sin sangrado
     ni lagos interiores.
8. **Máscara "movida" respecto a la costa (desajuste de proyección).** Tras el
   fix 7, el usuario reportó que la costa del PNG de oleaje quedaba desplazada
   norte-sur decenas de km en las latitudes intermedias del dominio. Causa:
   el PNG se generaba con filas uniformes en LATITUD (equirrectangular, como
   la malla del modelo), pero `L.imageOverlay` estira la imagen linealmente
   en coordenadas WEB MERCATOR entre sus bounds — y el espaciado de latitudes
   en Mercator no es lineal. En los extremos del dominio coincide, en el
   centro se desplaza. Fix en `weather_processor.py`: `_mercator_lat_rows()`
   genera las latitudes de las filas del PNG espaciadas uniformemente en Y de
   Mercator, y `_sample_bilinear()` muestrea la malla del modelo en esas
   coordenadas (reemplaza al upsample uniforme `_bilinear_upsample`, que se
   eliminó). Aplica a AMBOS renderizadores (viento y oleaje). **Cualquier
   render futuro de mallas geográficas a imagen para Leaflet debe recordar
   esto**: si la imagen se monta con imageOverlay, sus filas deben estar en
   espaciado Mercator, no en grados.
9. **Rediseño de capas a petición del usuario: "como Windy" — una capa a la
   vez y viento con fondo de color.**
   - Las capas ya no son acumulables: `Segmented` de antd ("💨 Viento" /
     "🌊 Oleaje"), estado `activeLayer` en `WeatherPage.jsx` (antes eran dos
     switches independientes).
   - **Capa de viento** = fondo de color de velocidad (nuevo PNG
     `wind_f{FFF}.png`, endpoint `GET /weather/wind-image?hour=N`, bounds
     `wind_bbox` en status/manifest) + partículas animadas encima
     (leaflet-velocity, sin cambios). El PNG usa la paleta pública de Windy
     (azul-morado calma → verdes → naranjas/rojos → magenta, constantes
     `WIND_COLOR_STOPS`/`WIND_MAX_MS` en `weather_processor.py`,
     `render_wind_png()`), sobremuestreo 10× igual que oleaje, y **sin máscara
     de costa** — el viento a 10 m es válido sobre tierra.
   - `WaveOverlay.jsx` renombrado a `RasterOverlay.jsx` (componente genérico
     de imageOverlay); se instancia dos veces (viento y oleaje).
   - `loadHourData(h, layer)` ahora solo baja lo que la capa activa necesita
     (viento: PNG + JSON U/V; oleaje: PNG), con cachés separados por hora
     (`windImgCache`, `wavesCache`, `windCache`) y revocación de object URLs
     al desmontar.
10. **Animación de oleaje + leyendas de color (a petición del usuario, para
    igualar la capa de olas de Windy).**
    - Backend: `waves_velocity_from_grid()` en `weather_processor.py` sintetiza
      un campo U/V en formato leaflet-velocity a partir del oleaje: vector en
      la dirección de PROPAGACIÓN del swell (DIRPW es "de dónde viene",
      convención meteorológica → el vector de propagación es el opuesto:
      u = -h·sin(dir), v = -h·cos(dir)) con magnitud = altura de ola (m).
      En tierra el vector es (0,0): partícula sin desplazamiento = trazo de
      longitud cero = invisible, así el swell solo se anima sobre el mar.
      Se escribe `waves_vel_f{FFF}.json` por hora en `process_run`; endpoint
      `GET /weather/waves-velocity?hour=N`.
    - `VelocityLayer.jsx` acepta prop `options` (overrides de L.velocityLayer);
      se instancia dos veces: viento (defaults) y oleaje (`displayValues:
      false` — el readout convertiría metros a "nudos" sin sentido —,
      `maxVelocity: 6`, `velocityScale: 0.03`, partículas blancas
      semitransparentes tipo Windy).
    - Nuevo `ColorLegend.jsx`: barra de gradiente con ticks, esquina inferior
      derecha del mapa. `WIND_LEGEND` (nudos, 0-50 kt sobre rango de 30 m/s) y
      `WAVE_LEGEND` (metros). **Los stops duplican las paletas del
      backend** (`WIND_COLOR_STOPS`/`WAVE_COLOR_STOPS` de
      `weather_processor.py`) — si se cambia una paleta, actualizar ambos lados.
    - Las escalas de color son **fijas** (comparables entre horas/corridas,
      como todo servicio meteorológico operativo), no min-max de los datos.
      A petición del usuario, el tope de oleaje se bajó de 6 a 4 m
      (`WAVE_MAX_M=4.0` + leyenda + `maxVelocity` de partículas) para dar más
      contraste al rango típico de la región; >4 m satura en rojo oscuro.
11. **Extrapolación costera limitada — oleaje visible dentro de bahías.**
    El modelo global enmascara la bahía de Ensenada (y similares) como tierra,
    y el filtro `had_data` dejaba esas zonas transparentes aunque la máscara
    fina las reconoce como agua. Se evaluaron 3 opciones (extrapolación
    limitada / malla regional WW3 ep-10min / modelado SWAN anidado) y se
    implementó la primera: constante `WAVE_EXTRAP_MAX_CELLS = 2` (~55 km máx)
    con `_binary_dilate()` (dilatación binaria 4-conectada, sin scipy).
    - PNG: `had_data` ahora acepta la franja dilatada — la bahía se pinta con
      el oleaje de mar abierto más cercano (el relleno de `_fill_nan_nearest`
      ya existía; solo se amplió dónde se permite mostrarlo).
    - Partículas: `waves_velocity_from_grid` rellena U/V hacia la franja
      (la dirección se extrapola vía componentes, no en grados — promediar
      350° y 10° daría 180°).
    - **Caveat documentado:** el valor extrapolado ignora el abrigo real de la
      bahía (refracción/difracción/sombra de Punta Banda) → tiende a
      SOBREESTIMAR el oleaje interior. Sesgo conservador, aceptable para
      planeación. La solución científicamente correcta sería un modelo costero
      anidado (SWAN) — posible colaboración futura dentro de CICESE, fuera del
      alcance de este módulo.
    - Verificado: píxel de la bahía alpha=150 (visible), El Sauzal/tierra
      adentro/desierto alpha=0; celda de la bahía con vector de swell
      (0.69, 1.32) propagándose hacia el NE, coherente con swell del SSW.
12. **Animación de oleaje reescrita: guiones cortos estilo Windy con máscara
    por píxel (`WaveDashLayer.jsx`).** El intento anterior (punto 10, segundo
    `VelocityLayer` con U/V sintéticos) tenía dos defectos que reportó el
    usuario con screenshot: (a) las partículas se dibujaban sobre tierra —
    la franja de extrapolación del punto 11 dilata sin distinguir tierra, la
    malla de 27 km no puede recortar la costa, y leaflet-velocity no soporta
    máscaras; (b) las estelas largas parecen viento, no olas (Windy usa
    guiones cortos que "marchan" en la dirección del swell).
    - `WaveDashLayer.jsx` es un renderizador propio sobre `L.canvasLayer`
      (clase base que registra globalmente leaflet-velocity;
      `.delegate({onDrawLayer})` + `needRedraw()` en un `setInterval` ~20fps):
      retícula de guiones en pantalla cada 34 px, cada guion marcha en la
      dirección de propagación (interpolación bilineal del JSON
      `/weather/waves-velocity`), con velocidad y longitud proporcionales a
      la altura de ola, desfase pseudoaleatorio por punto y fundido en los
      extremos del ciclo para que el reinicio no parpadee.
    - **Truco clave de la máscara:** en vez de intentar enmascarar la malla
      gruesa, cada guion consulta el CANAL ALFA del PNG de oleaje (el mismo
      object URL que la capa de color, muestreado vía canvas offscreen +
      `getImageData`, con la misma transformación Mercator de filas que usa
      el backend). El PNG ya está recortado a la costa a ~2.7 km/píxel, así
      que los guiones heredan exactamente ese recorte — cero dibujo en tierra.
    - El `VelocityLayer` de oleaje se eliminó de `WeatherPage.jsx` (el de
      viento queda igual); `wavesVelData` ahora alimenta a `WaveDashLayer`.
13. **Ráfaga acotada al viento sostenido en `/weather/point`.** El usuario
    notó ráfagas MENORES que el sostenido en las gráficas. Se verificó contra
    el GRIB crudo: es propio del modelo (37.6% de las celdas de la región en
    la corrida analizada; factor de ráfaga mediana 1.02, p5 0.72) — GUST de
    GFS es un diagnóstico de turbulencia de capa límite independiente del
    viento a 10 m, y en capa límite marina estable queda ~empatado con ruido.
    Fix estándar de visualizadores operativos aplicado en `weather_query.py`:
    `ráfaga_mostrada = max(ráfaga, sostenido)`.
14. **Scheduler que nunca corría (datos rancios ~22 h).** El job de APScheduler
    se registró con `next_run_time=None` creyendo que significaba "sin
    ejecución inicial inmediata" — en APScheduler significa **job pausado
    permanentemente**, así que solo corría la descarga que main.py dispara al
    arrancar y nunca más. Detectado por el usuario al ver "actualizado hace
    21.8 h" en el banner. Fix en `weather_scheduler.py`: se quitó el
    parámetro (el intervalo de 1 h programa su primera ejecución
    normalmente); el lock interno evita traslape con la corrida de arranque.
    Verificado: tras el fix se descargó y procesó la corrida 20260709 12Z.
    **Nota operativa:** con `uvicorn --reload` en dev, cada edición de código
    reinicia el proceso y el scheduler — en producción sin --reload el
    intervalo corre ininterrumpido.

---

## FASE 3 — Mareas y ventanas de operación

> **DESBLOQUEADA (2026-07-08):** el usuario proporcionó la fuente de datos.
> Solo falta que defina los **umbrales de marea mínima por rampa** (se le
> puede preguntar al llegar a la sub-fase de ventanas, o dejar el campo
> `min_tide_m` configurable por admin y vacío por defecto).

### Fuente de datos (verificada contra el servidor real)

Predicciones anuales de marea de la red mareográfica de CICESE:

```
https://redmar.cicese.mx/nmar/PREDCONMAR/{AÑO}/{CODIGO}{AÑO}.TXT
ej: https://redmar.cicese.mx/nmar/PREDCONMAR/2026/ENS2026.TXT
```

- **⚠️ El certificado TLS del servidor no valida** (cadena incompleta o
  self-signed). La descarga debe hacerse con verificación desactivada
  (`httpx.AsyncClient(verify=False)`) — aceptable porque es un servidor
  institucional conocido y los datos son públicos de solo lectura.
- Un archivo `.TXT` por estación por año (~231 KB, 8,760 filas horarias).
  En 2026 hay 43 estaciones. Códigos relevantes para el DEO: `ENS` (Ensenada),
  `SNQ` (San Quintín), `SNF` (San Felipe)… el nombre completo y coordenadas
  vienen DENTRO del archivo, así que no hay que mantener un catálogo manual
  de nombres — parsearlos del encabezado.

### Formato del archivo (verificado con ENS2026.TXT)

```
                             C I C E S E
                Departamento de Oceanografía Física
                             ...
Pronóstico de Mareas (nivel del mar) para : Ensenada, B.C. (31 51 N, 116 37 W)

Periodo:   00:00 20260101 - 23:0 20261231
Nivel de Referencia: Bajamar Media Inferior
Zona de Tiempo: 0
Alturas en milímetros
Intervalo de tiempo:   60 minutos
2026  1  1  0  0   264.52
2026  1  1  1  0   576.10
...
```

Claves de parseo:
- Encabezado de ~13 líneas; la línea `Pronóstico de Mareas ... para : <NOMBRE> (<LAT> N, <LON> W)`
  trae nombre y coordenadas en grados y minutos (31 51 N = 31°51'N).
  Ojo con el encoding: el archivo viene en Latin-1 (acentos como `Oceanograf�a`
  si se lee como UTF-8) — leer con `encoding="latin-1"`.
- Filas de datos: `AÑO MES DÍA HORA MINUTO ALTURA` separados por espacios,
  detectables porque empiezan con dígito.
- **Alturas en MILÍMETROS** sobre Bajamar Media Inferior (MLLW); pueden ser
  negativas. Convertir a metros (÷1000) al ingerir.
- **`Zona de Tiempo: 0` = UTC.** Guardar timestamps en UTC (consistente con
  el resto del módulo); el frontend ya convierte a hora local con dayjs.
- Cadencia horaria. Para la curva y las ventanas conviene interpolar (la
  marea es suave, interpolación lineal u horaria directa es suficiente para
  planeación; los extremos reales pueden quedar hasta ~30 min dentro del
  intervalo — aceptable, anotarlo en la UI si se muestran horas de pleamar).

### Diseño de implementación

**Backend:**

1. Tabla `tide_stations` (code único ej. 'ENS', name, lat, lon, is_active) y
   tabla `tide_predictions` (station_id FK, timestamp UTC indexado, height_m).
   `create_all` del arranque ya crea tablas nuevas (el proyecto no usa
   migraciones Alembic activamente — seguir el patrón existente).
   Índice compuesto (station_id, timestamp). Un año × estación = 8,760 filas;
   con 3-5 estaciones activas es volumen trivial para Postgres.
2. `backend/app/services/tide_ingester.py`:
   - `ingest_station_year(code, year)`: descarga el TXT (verify=False),
     parsea encabezado + filas, upsert de la estación, borra e inserta las
     predicciones de ese año/estación (idempotente — re-ingerir es seguro).
   - Solo ingerir las estaciones que el DEO use (configurable; empezar con
     `ENS`, `SNQ`, `SNF`). No bajar las 43.
   - Job anual en el scheduler existente (`weather_scheduler.py`): cada
     arranque verificar si existe el año en curso (y el siguiente, hacia
     diciembre) para las estaciones activas; ingerir lo que falte. CICESE
     publica el año completo por adelantado (los archivos 2026 tienen
     mtime de julio 2025).
3. Endpoints en `routers/weather.py`:
   - `GET /weather/tides/stations` — estaciones disponibles.
   - `GET /weather/tides?station=ENS&start=...&end=...` — serie {time, height_m}.
   - `GET /weather/tides/windows?station=ENS&min_height_m=1.2&start=...&end=...`
     — intervalos [desde, hasta] donde la marea ≥ umbral. El umbral viene como
     parámetro (en Fase 4 podrá salir de `operation_points.min_tide_m`).
   - `POST /weather/tides/refresh` (admin) — re-ingesta manual.

**Frontend (en `WeatherPage`):**

- Sección/pestaña "Mareas" bajo el mapa (o drawer): selector de estación,
  rango de fechas (default: hoy + 7 días), curva de marea con Recharts
  (`AreaChart`; el eje Y en metros sobre MLLW, incluir línea de 0),
  línea horizontal punteada con el umbral elegido (input numérico) y
  sombreado verde de las ventanas operables devueltas por el endpoint.
- Tabla de ventanas (desde / hasta / duración) bajo la curva — es lo que se
  consulta para programar entrada/salida por rampas y escolleras.
- Integrar con el pronóstico puntual: el drawer de un punto de interés puede
  mostrar la próxima ventana de la estación asociada.

### Umbral por rampa (pendiente del usuario)

Preguntar al implementar: ¿qué calado/altura mínima de marea requiere cada
rampa o escollera que usan (El Sauzal, rada de Ensenada, San Quintín...)?
Mientras tanto el umbral es un input libre en la UI con default 1.0 m.

### Estado — ✅ IMPLEMENTADA Y VERIFICADA EN BACKEND (2026-07-09)

Implementado según el diseño de arriba, sin desviaciones mayores:

- `backend/app/models/tide.py` — `TideStation` (con `ingested_years` para
  idempotencia) y `TidePrediction` (índice único station_id+timestamp),
  registrados en `models/__init__.py`; `create_all` del arranque crea las tablas.
- `backend/app/services/tide_ingester.py` — descarga (verify=False, Latin-1),
  parseo de encabezado con regex (nombre + coordenadas grados/minutos → decimal,
  W → negativa), mm → m, reemplazo idempotente por año, `ACTIVE_STATIONS =
  ["ENS", "SNQ", "SNF"]` (agregar códigos ahí para más estaciones).
- Scheduler: job diario `tide_ingest` + ingesta al arranque
  (`run_tide_ingest` en `weather_scheduler.py`, disparado desde `main.py`).
  Ingesta el año en curso siempre y el siguiente a partir de octubre.
- Endpoints (en `routers/weather.py`): `/tides/stations`, `/tides` (serie),
  `/tides/windows` (con interpolación lineal del instante exacto de cruce del
  umbral), `POST /tides/refresh` (admin).
- Frontend: `frontend/src/pages/Weather/TidesSection.jsx` — tarjeta bajo el
  mapa en `WeatherPage`: selector de estación, rango de fechas (default hoy
  +7 días), input de umbral (default 1.0 m), `AreaChart` de Recharts con eje X
  temporal numérico, `ReferenceArea` verde por ventana, `ReferenceLine` del
  umbral y del cero, y tabla de ventanas (desde/hasta/duración).
- **Verificado con datos reales:** ingesta de las 3 estaciones (8,760 filas
  c/u, nombres y coordenadas parseados del archivo), serie de ENS con ciclo
  semidiurno correcto (~1.5 m → 0.9 m en 3 h), ventanas ≥1.2 m coherentes
  (2-6 h de duración, una por ciclo de pleamar). Build de producción OK.
- **Falta verificación visual de la UI por el usuario** (gráfica, sombreado,
  interacción de umbral) — pedirla igual que en Fase 2.
- Nota UI: la curva aclara que es predicción armónica (no incluye marea
  meteorológica por viento/presión) y que las horas son locales.

### Ajustes posteriores (2026-07-09, a petición del usuario)

- **Todas las estaciones, no solo 3:** `discover_station_codes(year)` parsea
  el índice HTML del directorio del año en redmar y descubre los códigos
  disponibles (43 en 2026) — estaciones nuevas aparecen solas; si el índice
  no responde se usa `FALLBACK_STATIONS`. Ingeridas las 43 (376,680
  predicciones en total, ~10 MB en Postgres).
- **Markers del mapa = estaciones mareográficas** (se eliminaron los puntos
  fijos "radas" hardcodeados de Fase 2). Clic en un marker: selecciona esa
  estación en la sección de mareas Y abre el pronóstico puntual si el punto
  cae dentro del dominio del modelo meteorológico (las estaciones fuera del
  bbox — Acapulco, Veracruz, Cozumel... — solo seleccionan la marea).
  `TidesSection` pasó a componente controlado (props `stations`,
  `stationCode`, `onStationChange` desde `WeatherPage`); el selector ahora
  tiene búsqueda (`showSearch`).
- **Dos encabezados malformados en la fuente** (descubiertos porque quedaron
  sin coordenadas): SZL 2026 omite la coma entre N y la longitud (regex
  flexibilizada a `[,\s]+`) y TPL 2026 trae la latitud truncada de origen
  ("( 36 N") — para eso existe `KNOWN_COORDS` (coordenadas de respaldo por
  código; TPL = Topolobampo 25.6, -109.05) y un fallback que al menos parsea
  el nombre. **SZL resultó ser El Sauzal** — la rampa principal del DEO tiene
  estación mareográfica propia.
- El umbral de marea queda genérico en 1.0 m (decisión del usuario).

---

## FASE 4 — Disponibilidad de embarcaciones e integración con cruceros

- **Endpoint** `/vessels/availability?start=..&end=..`: por embarcación, lista de
  ocupaciones tomadas de los cruceros con estado en {planificado, en_curso, pendiente}
  usando `departure_date`/`return_date`. (Modelo: `backend/app/models/` — buscar el
  modelo Cruise; el router de referencia es `cruises.py`.)
- **Frontend**: en `WeatherPage`, sección "Disponibilidad" tipo Gantt simple
  (filas = embarcaciones, columnas = días próximos 30; celdas coloreadas por estado
  del crucero según `STATUS_MAP` de `CruisesPage.jsx`). Sin librería nueva: grid CSS.
- **Semáforo en el plan de crucero**: en el modal de edición de crucero
  (`CruisesPage.jsx`), si el plan tiene `departure_date` dentro del horizonte de
  pronóstico, consultar `/weather/point` con las coordenadas del primer waypoint y
  mostrar una `Alert` de antd: verde (ola < 1.5 m y viento < 15 kt), amarillo
  (ola < 2.5 m y viento < 22 kt), rojo (mayor). Umbrales en constantes con comentario.
- Migrar los puntos de interés hardcodeados de Fase 2 a la tabla `operation_points`
  con CRUD de admin.

---

## Convenciones y advertencias generales

- **Idioma:** toda la UI en español. Mensajes de error con `message.error(...)` de antd.
- **Unidades:** viento en **nudos**, ola en **metros**, marea en **metros**. Conversión en el backend.
- **Auth:** todos los endpoints requieren usuario autenticado (usar la dependencia
  de auth que usan los demás routers; ver `dependencies.py`). `/weather/refresh` solo admin.
- **No bloquear el event loop:** las descargas y el procesamiento GRIB corren en
  threads/executor (APScheduler con ThreadPoolExecutor está bien); nunca en un
  handler async directo.
- **Git:** trabajar en rama `feature/weather-module`. Commits por sub-fase, mensajes
  en español estilo del repo (`feat: ...`, `fix: ...`).
- **Probar en el navegador** con el dev server del frontend (puerto 3010 en la máquina
  del usuario) antes de dar una fase por terminada.
- Si NOMADS cambia de estructura o algo del formato GRIB no coincide con lo descrito
  aquí, inspeccionar el dataset real con xarray e informar al usuario en vez de forzar.

## Estado de avance

_Actualizar esta sección al terminar cada fase._

- [x] Fase 1 — Pipeline backend (GFS + WW3 → JSON + API) — completada y verificada 2026-07-08, rama `feature/weather-module`
- [~] Fase 2 — Página de meteorología con mapa animado — código completo 2026-07-08,
      **falta verificación visual en navegador real** (ver sección "Estado" de la Fase 2 arriba)
- [~] Fase 3 — Mareas — implementada 2026-07-09, backend verificado con datos
      reales (3 estaciones ingeridas, serie y ventanas correctas). Falta
      confirmación visual de la UI por el usuario y definir umbrales por rampa.
- [ ] Fase 4 — Disponibilidad + integración con cruceros
