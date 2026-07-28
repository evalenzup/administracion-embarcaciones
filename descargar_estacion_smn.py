#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
SIAE — Descarga de Estaciones Meteorológicas Automáticas (EMA) del SMN/CONAGUA.

Este script obtiene el listado oficial de estaciones activas de CONAGUA
y permite descargar de forma interactiva y directa los reportes de datos
en formato CSV (24 horas, 1 semana o 90 días).
"""

import urllib.request
import urllib.parse
import json
import ssl
import sys

# Desactivar verificación de certificados SSL (común en servidores de CONAGUA/NOAA)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

BASE_URL = "https://smn.conagua.gob.mx/tools/GUI/sivea_v3/php"

def get_stations():
    """Descarga el catálogo de todas las estaciones disponibles."""
    url = f"{BASE_URL}/getTodasEstaciones.php"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            data = response.read().decode('latin-1')
            return json.loads(data)
    except Exception as e:
        print(f"Error al descargar la lista de estaciones: {e}")
        sys.exit(1)

def download_report(station_name, report_type):
    """Descarga el reporte CSV para la estación y rango seleccionados."""
    # Codificar correctamente el nombre de la estación para UTF-8 (requerido por el backend de Conagua)
    encoded_name = urllib.parse.quote(station_name)
    url = f"{BASE_URL}/getReporteEstacion.php?tipo={report_type}&nombre_estacion={encoded_name}"
    
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        print(f"\nDescargando reporte desde: {url}")
        print("Esto puede tomar unos segundos para periodos largos...")
        
        with urllib.request.urlopen(req, context=ctx) as response:
            content = response.read()
            
            # Verificar si devolvió un error del backend de Conagua
            try:
                text_content = content.decode('latin-1').strip()
                if text_content.startswith("Error") or "No se encontr" in text_content:
                    print(f"❌ El servidor de Conagua devolvió un error: {text_content}")
                    return False
            except UnicodeDecodeError:
                pass
            
            # Nombre de archivo sugerido
            ranges = {1: "24h", 2: "1semana", 3: "90dias"}
            filename = f"reporte_EMA_{station_name.replace(' ', '_')}_{ranges.get(report_type, 'reporte')}.csv"
            
            with open(filename, 'wb') as f:
                f.write(content)
                
            print(f"✅ ¡Descarga completada con éxito! Guardado como: {filename}")
            return True
            
    except Exception as e:
        print(f"❌ Error durante la descarga: {e}")
        return False

def main():
    print("=" * 65)
    print("  SIAE — Descarga de Reportes de Estaciones Automáticas (SMN)")
    print("=" * 65)
    
    print("Obteniendo catálogo de estaciones...")
    stations = get_stations()
    print(f"Se encontraron {len(stations)} estaciones registradas.\n")
    
    while True:
        search = input("Busca una estación (escribe parte de su nombre, municipio o estado): ").strip().upper()
        if not search:
            continue
            
        matched = []
        for s in stations:
            name = s.get("nombre_estacion", "")
            mun = s.get("municipio", "")
            est = s.get("estado", "")
            
            if search in name.upper() or search in mun.upper() or search in est.upper():
                matched.append(s)
                
        if not matched:
            print("No se encontraron coincidencias. Intenta con otro término.")
            continue
            
        print("\nEstaciones encontradas:")
        for idx, s in enumerate(matched, 1):
            print(f" [{idx}] {s.get('nombre_estacion')} — {s.get('municipio')}, {s.get('estado')} ({s.get('organismo')})")
            
        try:
            choice = input(f"\nSelecciona el número (1-{len(matched)}) o presiona Enter para buscar de nuevo: ").strip()
            if not choice:
                continue
            selected_idx = int(choice) - 1
            if selected_idx < 0 or selected_idx >= len(matched):
                print("Selección inválida.")
                continue
                
            selected_station = matched[selected_idx]
            station_name = selected_station.get("nombre_estacion")
            print(f"\nEstación seleccionada: {station_name}")
            break
        except ValueError:
            print("Entrada no válida.")
            continue
            
    print("\nSelecciona el rango de tiempo del reporte:")
    print(" [1] 24 Horas")
    print(" [2] 1 Semana")
    print(" [3] 90 Días")
    
    while True:
        try:
            r_choice = input("Selecciona opción (1-3): ").strip()
            report_type = int(r_choice)
            if report_type in (1, 2, 3):
                break
            print("Opción inválida.")
        except ValueError:
            print("Entrada no válida.")
            
    download_report(station_name, report_type)

if __name__ == "__main__":
    main()
