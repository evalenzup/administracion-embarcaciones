"""
SIAE — Script de verificación integral de notificaciones, recordatorios y anuncios vía Telegram.
Prueba el enrutamiento dual (Titular + Asistente), el scheduler diario y los logs de auditoría.
"""

import sys
import asyncio
import httpx

BACKEND_URL = "http://localhost:8010"
BOT_API_KEY = "siae_bot_secret_key_2026"


async def run_tests():
    print("🚀 Iniciando pruebas del sistema de notificaciones y recordatorios...")

    async with httpx.AsyncClient() as client:
        # 1. Login como Admin
        print("\n🔑 1. Login como Administrador...")
        login_res = await client.post(f"{BACKEND_URL}/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
        if login_res.status_code != 200:
            print(f"❌ Error en login: {login_res.text}")
            sys.exit(1)
        
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ Login exitoso.")

        # 2. Probar endpoint de ejecución manual de recordatorios (Scheduler)
        print("\n⏰ 2. Probando ejecución del Scheduler de Recordatorios Financieros...")
        sched_res = await client.post(f"{BACKEND_URL}/api/v1/notifications/run-reminders-now", headers=headers)
        print(f"Status: {sched_res.status_code}")
        print(f"Resultado Scheduler: {sched_res.json()}")
        assert sched_res.status_code == 200, "Error ejecutando el scheduler"
        print("✅ Scheduler ejecutado correctamente.")

        # 3. Probar endpoint de Anuncio Manual para un Viático
        print("\n📢 3. Probando envío de anuncio manual para un Viático...")
        # Obtener primer viático
        viaticos_res = await client.get(f"{BACKEND_URL}/api/v1/viaticos", headers=headers)
        viaticos_items = viaticos_res.json().get("items", [])
        if viaticos_items:
            v_id = viaticos_items[0]["id"]
            ann_payload = {
                "tramite_type": "viatico",
                "tramite_id": v_id,
                "message": "Mensaje de prueba de anuncio con enrutamiento dual para el Viático.",
                "send_to_titular": True,
                "send_to_asistente": True
            }
            ann_res = await client.post(f"{BACKEND_URL}/api/v1/notifications/announcement", json=ann_payload, headers=headers)
            print(f"Resultado Anuncio Viático: {ann_res.json()}")
            assert ann_res.status_code == 200, "Error en anuncio de viático"
            print("✅ Anuncio de Viático despachado.")

        # 4. Probar endpoint de Broadcast Masivo
        print("\n📡 4. Probando comunicado broadcast general...")
        broadcast_payload = {
            "title": "Aviso de Mantenimiento Programado",
            "message": "Se informa a todos los usuarios que la plataforma operará con normalidad.",
            "target_group": "all_linked"
        }
        bcast_res = await client.post(f"{BACKEND_URL}/api/v1/notifications/broadcast", json=broadcast_payload, headers=headers)
        print(f"Resultado Broadcast: {bcast_res.json()}")
        assert bcast_res.status_code == 200, "Error en broadcast"
        print("✅ Comunicado broadcast despachado.")

        # 5. Consultar Histórico de Logs de Notificaciones
        print("\n📋 5. Consultando histórico de NotificationLog...")
        logs_res = await client.get(f"{BACKEND_URL}/api/v1/notifications/logs?limit=5", headers=headers)
        logs_data = logs_res.json()
        print(f"Total de notificaciones registradas: {logs_data.get('total')}")
        for log in logs_data.get("items", [])[:3]:
            print(f" - [{log['sent_at']}] {log['tramite_type'].upper()} ({log['recipient_role']}): {log['title']} -> Status: {log['status']}")
        
        assert logs_data.get("total", 0) > 0, "Debe haber registros de notificaciones en la BD"
        print("✅ Histórico de notificaciones verificado en BD.")

        print("\n🎉 ¡TODAS LAS PRUEBAS DEL MOTOR DE NOTIFICACIONES PASARON CON ÉXITO!")


if __name__ == "__main__":
    asyncio.run(run_tests())
