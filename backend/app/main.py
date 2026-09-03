"""
SIAE — Sistema de Administración de Embarcaciones
Entry point de la aplicación FastAPI.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base, SessionLocal
from app.routers import auth, users, roles, vessels, audit, documents, maintenance, inventory, logbooks, cruises, personnel, equipment
from app.routers import cruise_participants, participant_profiles, vessel_requests, ports, fuel_logs, vessel_rates, cruise_billings, petty_cash, accounts, services, providers, projects, weather, gastos_reserva_comprobar, notifications, viaticos


# Importar modelos para que SQLAlchemy los registre
import app.models  # noqa: F401
import app.models.equipment  # noqa: F401
import app.models.viatico  # noqa: F401

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle: crear tablas y ejecutar seed al iniciar."""
    # Crear tablas si no existen
    Base.metadata.create_all(bind=engine)

    # Asegurar que la columna attachment_file existe en service_observations
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE service_observations ADD COLUMN IF NOT EXISTS attachment_file VARCHAR(300);"))
        conn.execute(text("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'MXN' NOT NULL;"))
        conn.execute(text("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION;"))
        conn.execute(text("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS tentative_exchange_rate DOUBLE PRECISION;"))
        conn.execute(text("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;"))
        conn.execute(text("ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completado' NOT NULL;"))
        conn.execute(text("ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS service_request_id INTEGER REFERENCES service_requests(id) ON DELETE SET NULL;"))
        conn.execute(text("ALTER TABLE gastos_reserva_comprobar ADD COLUMN IF NOT EXISTS comprobante_devolucion_path VARCHAR(500);"))
        conn.execute(text("ALTER TABLE viaticos_facturas ADD COLUMN IF NOT EXISTS ticket_filename VARCHAR(300);"))
        conn.execute(text("ALTER TABLE gastos_reserva_comprobar_facturas ADD COLUMN IF NOT EXISTS ticket_filename VARCHAR(300);"))

    # Crear directorios de subida
    os.makedirs("uploads/documents", exist_ok=True)
    os.makedirs("uploads/equipment_manuals", exist_ok=True)
    os.makedirs("uploads/participants", exist_ok=True)
    os.makedirs("uploads/receipts", exist_ok=True)
    os.makedirs("uploads/vessel_orders", exist_ok=True)
    os.makedirs("uploads/petty_cash/xml", exist_ok=True)
    os.makedirs("uploads/petty_cash/pdf", exist_ok=True)
    os.makedirs("uploads/petty_cash/scans", exist_ok=True)
    os.makedirs("uploads/services", exist_ok=True)
    os.makedirs("uploads/weather_archive", exist_ok=True)
    os.makedirs("uploads/gastos_reserva_comprobar/pdf", exist_ok=True)
    os.makedirs("uploads/gastos_reserva_comprobar/xml", exist_ok=True)
    os.makedirs("uploads/gastos_reserva_comprobar/tickets", exist_ok=True)
    os.makedirs("uploads/gastos_reserva_comprobar/reports", exist_ok=True)
    os.makedirs("uploads/gastos_reserva_comprobar/devoluciones", exist_ok=True)
    os.makedirs("uploads/viaticos/pdf", exist_ok=True)
    os.makedirs("uploads/viaticos/xml", exist_ok=True)
    os.makedirs("uploads/viaticos/tickets", exist_ok=True)
    os.makedirs("uploads/viaticos/solicitudes", exist_ok=True)

    # Ejecutar seed
    from app.services.seed import seed_database
    db = SessionLocal()
    try:
        seed_database(db)
    except Exception as e:
        print(f"⚠️ Error en seed: {e}")
        db.rollback()
    finally:
        db.close()

    # Iniciar scheduler del módulo de meteorología (descarga GFS/WW3 cada hora)
    import asyncio
    from app.services.weather_scheduler import (
        run_pipeline_if_new_run,
        run_tide_ingest,
        run_smn_ingest,
        shutdown_scheduler,
        start_scheduler,
    )
    start_scheduler()
    # Disparar la primera descarga/ingesta en segundo plano para no bloquear el arranque
    asyncio.create_task(run_pipeline_if_new_run())
    asyncio.create_task(run_tide_ingest())
    asyncio.create_task(run_smn_ingest())

    yield

    shutdown_scheduler()


app = FastAPI(
    title="SIAE — Sistema de Administración de Embarcaciones",
    description="API para la gestión integral de embarcaciones: documentación, mantenimientos, inventarios, bitácoras, cruceros y personal.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3010",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Archivos Estáticos ────────────────────────────────────────
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── Registrar routers ────────────────────────────────────────
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(roles.router)
app.include_router(vessels.router)
app.include_router(ports.router)
app.include_router(fuel_logs.router)
app.include_router(documents.router)
app.include_router(maintenance.router)
app.include_router(inventory.router)
app.include_router(logbooks.router)
app.include_router(cruises.router)
app.include_router(cruise_participants.router)
app.include_router(participant_profiles.router)
app.include_router(personnel.router)
app.include_router(equipment.router)
app.include_router(vessel_requests.router)
app.include_router(vessel_rates.router)
app.include_router(cruise_billings.router)
app.include_router(petty_cash.router)
app.include_router(accounts.router)
app.include_router(services.router)
app.include_router(providers.router)
app.include_router(projects.router)
app.include_router(audit.router)
app.include_router(weather.router)
app.include_router(gastos_reserva_comprobar.router)
app.include_router(notifications.router)
app.include_router(viaticos.router)


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    """Endpoint de salud del servicio."""
    return {"status": "ok", "service": "SIAE Backend"}


@app.get("/api/v1/status", tags=["Health"])
async def api_status():
    """Estado de la API v1."""
    return {
        "status": "ok",
        "version": "0.1.0",
        "message": "SIAE API funcionando correctamente",
    }
