import httpx
import sys
from datetime import datetime, timezone, timedelta

# Endpoint base
BASE_URL = "http://localhost:8000/api/v1"
API_KEY = "siae_telemetry_secret_key_2026"
VESSEL_ID = 4  # Rigel

# Generar un CSV de telemetría de prueba
# Columnas: timestamp_utc,node,dir,speed,cdir,cspeed,pressure,humidity,temp,dewpoint,precip_total,precip_int,lat,lon,gps_fix,supply_v,status,uploaded
now = datetime.now(timezone.utc)
csv_lines = [
    "timestamp_utc,node,dir,speed,cdir,cspeed,pressure,humidity,temp,dewpoint,precip_total,precip_int,lat,lon,gps_fix,supply_v,status,uploaded"
]

# Crear 5 lecturas consecutivas separadas por 1 minuto
for i in range(5):
    ts = (now - timedelta(minutes=5-i)).isoformat()
    # Simular barco moviéndose al sur de Ensenada
    lat = 31.8 + (i * 0.001)
    lon = -116.6 - (i * 0.001)
    line = f"{ts},Q,120,4.5,122,4.6,1012.3,65.0,22.4,15.2,0.0,0.0,{lat},{lon},1,12.4,0000,0"
    csv_lines.append(line)

csv_content = "\n".join(csv_lines)

print("--- CONTENIDO DEL CSV DE PRUEBA ---")
print(csv_content)
print("-----------------------------------")

# 1. Probar carga de telemetría usando API Key de dispositivo
print("\n1. Probando carga de telemetría (POST) con X-API-Key...")
headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "text/csv"
}

try:
    response = httpx.post(f"{BASE_URL}/vessels/{VESSEL_ID}/telemetry", content=csv_content, headers=headers)
    print("Status Code:", response.status_code)
    print("Response JSON:", response.json())
    if response.status_code != 201:
        print("ERROR: Falló la subida")
        sys.exit(1)
except Exception as e:
    print("ERROR al conectar al servidor:", e)
    sys.exit(1)

# 2. Iniciar sesión como administrador para probar consulta e historial
print("\n2. Iniciando sesión como administrador para obtener Bearer token...")
login_payload = {
    "username": "admin",
    "password": "q1a23x4c5!"
}
try:
    auth_resp = httpx.post(f"{BASE_URL}/auth/login", json=login_payload)
    print("Auth Status:", auth_resp.status_code)
    auth_json = auth_resp.json()
    token = auth_json.get("access_token")
    if not token:
        print("ERROR: No se obtuvo token de acceso")
        sys.exit(1)
except Exception as e:
    print("ERROR al iniciar sesión:", e)
    sys.exit(1)

# 3. Consultar historial de telemetría con Bearer Token
print("\n3. Probando consulta de historial de telemetría (GET) con JWT Bearer...")
user_headers = {
    "Authorization": f"Bearer {token}"
}

try:
    hist_resp = httpx.get(f"{BASE_URL}/vessels/{VESSEL_ID}/telemetry", headers=user_headers)
    print("Historial Status Code:", hist_resp.status_code)
    hist_json = hist_resp.json()
    print(f"Total registros obtenidos: {len(hist_json)}")
    if len(hist_json) > 0:
        print("Último registro:")
        print(hist_json[-1])
except Exception as e:
    print("ERROR al consultar historial:", e)
    sys.exit(1)

# 4. Consultar última telemetría
print("\n4. Probando consulta de última lectura (GET /latest) con JWT Bearer...")
try:
    latest_resp = httpx.get(f"{BASE_URL}/vessels/{VESSEL_ID}/telemetry/latest", headers=user_headers)
    print("Latest Status Code:", latest_resp.status_code)
    print("Latest JSON:", latest_resp.json())
except Exception as e:
    print("ERROR al consultar última lectura:", e)
    sys.exit(1)

# 5. Consultar última telemetría de todas las embarcaciones
print("\n5. Probando consulta de todas las embarcaciones (GET /telemetry/latest) con JWT Bearer...")
try:
    all_latest_resp = httpx.get(f"{BASE_URL}/vessels/telemetry/latest", headers=user_headers)
    print("All Latest Status Code:", all_latest_resp.status_code)
    print("All Latest JSON:", all_latest_resp.json())
except Exception as e:
    print("ERROR al consultar todas las lecturas:", e)
    sys.exit(1)

print("\n--- PRUEBAS COMPLETADAS CON ÉXITO ---")
