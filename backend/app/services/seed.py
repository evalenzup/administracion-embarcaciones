"""
SIAE — Seed de datos iniciales: permisos, roles y superadmin.
Se ejecuta al iniciar la aplicación si no existen datos.
"""

from sqlalchemy.orm import Session
from app.models.permission import Permission
from app.models.role import Role
from app.models.user import User, UserRole
from app.utils.security import hash_password
from app.config import get_settings

settings = get_settings()

# ── Definición de permisos por módulo ──
PERMISSIONS = [
    # Embarcaciones
    ("vessels", "view", "Ver embarcaciones"),
    ("vessels", "create", "Crear embarcaciones"),
    ("vessels", "edit", "Editar embarcaciones"),
    ("vessels", "delete", "Eliminar embarcaciones"),
    # Documentación
    ("documents", "view", "Ver documentos"),
    ("documents", "create", "Crear documentos"),
    ("documents", "edit", "Editar documentos"),
    ("documents", "delete", "Eliminar documentos"),
    # Mantenimiento
    ("maintenance", "view", "Ver mantenimientos"),
    ("maintenance", "create", "Crear mantenimientos"),
    ("maintenance", "edit", "Editar mantenimientos"),
    ("maintenance", "delete", "Eliminar mantenimientos"),
    # Inventario
    ("inventory", "view", "Ver inventario"),
    ("inventory", "create", "Crear items de inventario"),
    ("inventory", "edit", "Editar items de inventario"),
    ("inventory", "delete", "Eliminar items de inventario"),
    # Bitácoras
    ("logbooks", "view", "Ver bitácoras"),
    ("logbooks", "create", "Crear entradas de bitácora"),
    ("logbooks", "edit", "Editar entradas de bitácora"),
    ("logbooks", "delete", "Eliminar entradas de bitácora"),
    # Cruceros
    ("cruises", "view", "Ver planes de crucero"),
    ("cruises", "create", "Crear planes de crucero"),
    ("cruises", "edit", "Editar planes de crucero"),
    ("cruises", "delete", "Eliminar planes de crucero"),
    # Personal
    ("personnel", "view", "Ver personal"),
    ("personnel", "create", "Crear registros de personal"),
    ("personnel", "edit", "Editar registros de personal"),
    ("personnel", "delete", "Eliminar registros de personal"),
    # Usuarios (admin)
    ("users", "view", "Ver usuarios"),
    ("users", "create", "Crear usuarios"),
    ("users", "edit", "Editar usuarios"),
    ("users", "delete", "Eliminar usuarios"),
    # Roles (admin)
    ("roles", "view", "Ver roles"),
    ("roles", "create", "Crear roles"),
    ("roles", "edit", "Editar roles"),
    ("roles", "delete", "Eliminar roles"),
    # Dashboard
    ("dashboard", "view", "Ver dashboard"),
    # Catálogo de Participantes de Crucero
    ("participants", "view",   "Ver catálogo de participantes"),
    ("participants", "create", "Crear perfiles de participantes"),
    ("participants", "edit",   "Editar perfiles de participantes"),
    ("participants", "delete", "Desactivar perfiles de participantes"),
    # Catálogo de Puertos
    ("ports", "view",   "Ver catálogo de puertos"),
    ("ports", "create", "Crear puertos"),
    ("ports", "edit",   "Editar puertos"),
    ("ports", "delete", "Eliminar puertos"),
    # Equipos y Sistemas
    ("equipment", "view", "Ver equipos y sistemas"),
    ("equipment", "create", "Crear equipos y sistemas"),
    ("equipment", "edit", "Editar equipos y sistemas"),
    ("equipment", "delete", "Eliminar equipos y sistemas"),
    # Solicitudes de Embarcación
    ("vessel_requests", "view", "Ver solicitudes de embarcación"),
    ("vessel_requests", "create", "Crear solicitudes de embarcación"),
    ("vessel_requests", "edit", "Editar/Revisar solicitudes de embarcación"),
    ("vessel_requests", "delete", "Eliminar/Cancelar solicitudes de embarcación"),
    # Registro de Combustible
    ("fuel_logs", "view",   "Ver registros de combustible"),
    ("fuel_logs", "create", "Registrar carga de combustible"),
    ("fuel_logs", "edit",   "Editar registros de combustible"),
    ("fuel_logs", "delete", "Eliminar registros de combustible"),
    # Facturación y Cobros
    ("billing", "view",   "Ver facturas y cobros"),
    ("billing", "create", "Registrar cobro de crucero"),
    ("billing", "edit",   "Editar cobros y subir recibos"),
    ("billing", "delete", "Eliminar cobros"),
    # Fondo Fijo (Caja Chica)
    ("petty_cash", "view",   "Ver fondo fijo"),
    ("petty_cash", "create", "Crear en fondo fijo"),
    ("petty_cash", "edit",   "Editar en fondo fijo"),
    ("petty_cash", "delete", "Eliminar en fondo fijo"),
]

# ── Definición de roles con sus permisos ──
ROLES = {
    "Administrador": {
        "description": "Acceso total al sistema",
        "permissions": "*",  # Todos los permisos
    },
    "Capitán": {
        "description": "Gestión de documentos, bitácoras y cruceros",
        "permissions": [
            "vessels:view",
            "documents:view", "documents:create", "documents:edit", "documents:delete",
            "maintenance:view",
            "inventory:view",
            "logbooks:view", "logbooks:create", "logbooks:edit", "logbooks:delete",
            "cruises:view", "cruises:create", "cruises:edit", "cruises:delete",
            "personnel:view",
            "participants:view", "participants:create", "participants:edit",
            "dashboard:view",
            "equipment:view", "equipment:create", "equipment:edit",
            "ports:view",
            "fuel_logs:view", "fuel_logs:create", "fuel_logs:edit",
            "billing:view", "billing:create", "billing:edit",
        ],
    },
    "Jefe de Máquinas": {
        "description": "Gestión de mantenimiento e inventario",
        "permissions": [
            "vessels:view",
            "documents:view",
            "maintenance:view", "maintenance:create", "maintenance:edit", "maintenance:delete",
            "inventory:view", "inventory:create", "inventory:edit", "inventory:delete",
            "logbooks:view", "logbooks:create", "logbooks:edit",
            "cruises:view",
            "personnel:view",
            "dashboard:view",
            "equipment:view", "equipment:create", "equipment:edit", "equipment:delete",
            "ports:view",
            "fuel_logs:view", "fuel_logs:create", "fuel_logs:edit", "fuel_logs:delete",
            "billing:view",
        ],
    },
    "Operador": {
        "description": "Operaciones diarias y registro de datos",
        "permissions": [
            "vessels:view",
            "documents:view", "documents:create",
            "maintenance:view", "maintenance:create",
            "inventory:view", "inventory:create", "inventory:edit",
            "logbooks:view", "logbooks:create",
            "cruises:view",
            "personnel:view",
            "participants:view",
            "dashboard:view",
            "equipment:view", "equipment:create", "equipment:edit",
            "ports:view",
            "fuel_logs:view", "fuel_logs:create",
            "billing:view",
        ],
    },
    "Consulta": {
        "description": "Solo lectura en todos los módulos",
        "permissions": [
            "vessels:view",
            "documents:view",
            "maintenance:view",
            "inventory:view",
            "logbooks:view",
            "cruises:view",
            "personnel:view",
            "participants:view",
            "dashboard:view",
            "equipment:view",
            "ports:view",
            "fuel_logs:view",
            "billing:view",
        ],
    },
    "Investigador": {
        "description": "Solicitar embarcaciones y configurar planes de crucero propios",
        "permissions": [
            "vessels:view",
            "vessel_requests:view", "vessel_requests:create", "vessel_requests:edit", "vessel_requests:delete",
            "cruises:view", "cruises:create", "cruises:edit",
            "participants:view", "participants:create", "participants:edit",
            "ports:view",
            "fuel_logs:view",
            "billing:view",
        ],
    },
}


def seed_database(db: Session) -> None:
    """Ejecutar seed de datos iniciales y asegurar que todos los permisos y roles estén actualizados."""
    print("🌱 Verificando y actualizando seed de datos iniciales...")

    # ── 1. Crear permisos faltantes ──
    perm_map = {}
    db_permissions = {(p.module, p.action): p for p in db.query(Permission).all()}
    
    for module, action, description in PERMISSIONS:
        key = (module, action)
        if key not in db_permissions:
            perm = Permission(module=module, action=action, description=description)
            db.add(perm)
            db.flush()
            perm_map[f"{module}:{action}"] = perm
            print(f"  -> Creado permiso faltante: {module}:{action}")
        else:
            perm_map[f"{module}:{action}"] = db_permissions[key]

    # ── 2. Asegurar que los roles por defecto existan y tengan sus permisos ──
    for role_name, role_data in ROLES.items():
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            role = Role(
                name=role_name,
                description=role_data["description"],
                is_system_role=True,
            )
            db.add(role)
            db.flush()
            print(f"  -> Creado rol faltante: {role_name}")

        # Actualizar permisos del rol
        if role_data["permissions"] == "*":
            target_perms = list(perm_map.values())
        else:
            target_perms = [
                perm_map[p] for p in role_data["permissions"] if p in perm_map
            ]
        
        role.permissions = target_perms
        db.add(role)

    db.flush()

    # ── 3. Crear superadmin si no existe ──
    admin_role = db.query(Role).filter(Role.name == "Administrador").first()
    superadmin = db.query(User).filter(User.username == settings.SUPERADMIN_USERNAME).first()
    if not superadmin:
        superadmin = User(
            username=settings.SUPERADMIN_USERNAME,
            email=settings.SUPERADMIN_EMAIL,
            hashed_password=hash_password(settings.SUPERADMIN_PASSWORD),
            full_name="Administrador del Sistema",
            is_active=True,
            is_superadmin=True,
        )
        db.add(superadmin)
        db.flush()
        
        # Asignar rol de administrador
        user_role = UserRole(user_id=superadmin.id, role_id=admin_role.id)
        db.add(user_role)
        print(f"  -> Creado superadmin: {settings.SUPERADMIN_USERNAME}")

    # ── 4. Crear categorías de mantenimiento por defecto si no existen ──
    from app.models.maintenance import MaintenanceCategory as MaintCat
    existing_cats = {c.name for c in db.query(MaintCat).all()}
    
    default_categories = [
        ("Motores", "Mantenimiento de motores principales y auxiliares", "🔧", "#E67E22"),
        ("Telecomunicaciones", "Equipos de comunicación y navegación", "📡", "#3498DB"),
        ("Instrumentación Científica", "Equipos de investigación y medición", "🔬", "#8E44AD"),
        ("Sistemas Eléctricos", "Instalaciones y equipos eléctricos", "⚡", "#F1C40F"),
        ("Sistemas Hidráulicos", "Grúas, winches y sistemas de presión", "💧", "#2980B9"),
        ("Casco y Estructura", "Casco, pintura, ánodos y estructura", "🛡️", "#95A5A6"),
        ("Sistemas de Seguridad", "Equipos contra incendio, salvavidas, balsas", "🆘", "#E74C3C"),
        ("Plomería y Sanitarios", "Tuberías, bombas de agua, sanitarios", "🚿", "#1ABC9C"),
        ("Refrigeración y Clima", "Aire acondicionado, refrigeración", "❄️", "#00BCD4"),
        ("Cubierta y Maniobras", "Cabos, anclas, defensas, aparejos", "⚓", "#0A2647"),
    ]
    for name, desc, icon, color in default_categories:
        if name not in existing_cats:
            cat = MaintCat(name=name, description=desc, icon=icon, color=color)
            db.add(cat)
            print(f"  -> Creada categoría de mantenimiento: {name}")

    # ── 5. Crear tarifas vigentes 2025 si no existen ──
    from app.models.vessel_rate import VesselRate, VesselRateClientType
    from app.models.vessel import Vessel

    # Para asegurar idempotencia en el seed, limpiamos las de 2025 si ya existen
    db.query(VesselRate).filter(VesselRate.year == 2025).delete()
    db.flush()

    print("🌱 Creando tarifas vigentes 2025...")
    # Buscar embarcaciones
    boah = db.query(Vessel).filter(Vessel.name.ilike("%Alpha Helix%")).first()
    rigel = db.query(Vessel).filter(Vessel.name.ilike("%Rigel%")).first()
    antares = db.query(Vessel).filter(Vessel.name.ilike("%Antares%")).first()

    rates_to_create = []

    if boah:
        rates_to_create.extend([
            VesselRate(vessel_id=boah.id, concept="Día de buque (cruceros y/o traslados)", client_type=VesselRateClientType.NACIONAL_INSTITUCION, rate_amount=20500.0, currency="USD", year=2025),
            VesselRate(vessel_id=boah.id, concept="Día de buque (cruceros y/o traslados)", client_type=VesselRateClientType.NACIONAL_EMPRESA, rate_amount=20500.0, currency="USD", year=2025),
            VesselRate(vessel_id=boah.id, concept="Día de buque (cruceros y/o traslados)", client_type=VesselRateClientType.EXTRANJERO, rate_amount=25000.0, currency="USD", year=2025),
            VesselRate(vessel_id=boah.id, concept="Día de movilización y desmovilización en su propio muelle", client_type=VesselRateClientType.GENERAL, rate_amount=9500.0, currency="USD", year=2025),
        ])
    if rigel:
        rates_to_create.extend([
            # Interno
            VesselRate(vessel_id=rigel.id, concept="Renta de embarcación (Rigel) - Interno", client_type=VesselRateClientType.CICESE_INTERNO, rate_amount=500.0, currency="MXN", year=2025),
            VesselRate(vessel_id=rigel.id, concept="Renta de Vehículo / Remolque (Pickup) - Interno", client_type=VesselRateClientType.CICESE_INTERNO, rate_amount=1500.0, currency="MXN", year=2025),
            
            # Bahía
            VesselRate(vessel_id=rigel.id, concept="Renta de embarcación (Rigel) - Bahía", client_type=VesselRateClientType.CICESE_INTERNO_BAHIA, rate_amount=600.0, currency="MXN", year=2025),
            
            # SECIHTI
            VesselRate(vessel_id=rigel.id, concept="Renta de embarcación (Rigel) - SECIHTI", client_type=VesselRateClientType.SECIHTI, rate_amount=1300.0, currency="MXN", year=2025),
            VesselRate(vessel_id=rigel.id, concept="Renta de Vehículo / Remolque (Pickup) - SECIHTI", client_type=VesselRateClientType.SECIHTI, rate_amount=1500.0, currency="MXN", year=2025),
            
            # Autogenerados
            VesselRate(vessel_id=rigel.id, concept="Renta de embarcación (Rigel) - Autogenerados", client_type=VesselRateClientType.CICESE_AUTOGENERADO, rate_amount=2100.0, currency="MXN", year=2025),
            VesselRate(vessel_id=rigel.id, concept="Renta de Vehículo / Remolque (Pickup) - Autogenerados", client_type=VesselRateClientType.CICESE_AUTOGENERADO, rate_amount=1500.0, currency="MXN", year=2025),
            
            # Externo Nacional
            VesselRate(vessel_id=rigel.id, concept="Renta de embarcación (Rigel) - Externo Nacional", client_type=VesselRateClientType.EXTERNO_NACIONAL, rate_amount=3500.0, currency="MXN", year=2025),
            VesselRate(vessel_id=rigel.id, concept="Renta de Vehículo / Remolque (Pickup) - Externo Nacional", client_type=VesselRateClientType.EXTERNO_NACIONAL, rate_amount=1500.0, currency="MXN", year=2025),
        ])
    if antares:
        rates_to_create.extend([
            VesselRate(vessel_id=antares.id, concept="Salida de campo menor de 24 horas - General", client_type=VesselRateClientType.GENERAL, rate_amount=1600.0, currency="MXN", year=2025),
        ])

    for rate in rates_to_create:
        db.add(rate)
    db.flush()
    print(f"  -> Creadas {len(rates_to_create)} tarifas para 2025.")

    # ── 6. Crear categorías financieras por defecto si no existen ──
    from app.models.financial_category import FinancialCategory
    existing_financial_cats = {c.name for c in db.query(FinancialCategory).all()}
    
    default_financial_categories = [
        # Materiales
        ("Combustible y Lubricantes", "materiales", "⛽", "#E74C3C"),
        ("Mats. para Mantto. de Máquinas", "materiales", "⚙️", "#F1C40F"),
        ("Mats. para Embarcaciones Menores", "materiales", "🛶", "#3498DB"),
        ("Mats. para Mantto. en Dique Seco", "materiales", "🏗️", "#95A5A6"),
        ("Equipo de Seguridad y Navegación", "materiales", "🛟", "#E67E22"),
        ("Mats. para Laboratorio y Electrónico", "materiales", "🧪", "#9B59B6"),
        # Servicios
        ("Mantto. a Máquinas", "servicios", "🔧", "#E74C3C"),
        ("Mantto. a Cubiertas", "servicios", "🧹", "#F1C40F"),
        ("Mantto. en Dique Seco", "servicios", "🚢", "#3498DB"),
        ("Mantto. a Embarcaciones Menores", "servicios", "🛥️", "#95A5A6"),
        ("Mantto. a Vehículos Terrestres", "servicios", "🚗", "#E67E22"),
        ("Limpieza / Lavandería", "servicios", "🧼", "#9B59B6"),
        ("Comunicaciones", "servicios", "📞", "#1ABC9C"),
        ("Fletes y Acarreos", "servicios", "🚚", "#2ECC71"),
        ("Comisiones y Servicios Financieros", "servicios", "💳", "#34495E"),
        # Otros
        ("Compras Generales (Papelería, Oficina)", "otros", "📝", "#BDC3C7"),
        ("Materiales de Limpieza", "otros", "🧽", "#16A085"),
        ("Otros Gastos", "otros", "📦", "#7F8C8D"),
    ]
    for name, group, icon, color in default_financial_categories:
        if name not in existing_financial_cats:
            cat = FinancialCategory(name=name, group=group, icon=icon, color=color, is_active=True)
            db.add(cat)
            print(f"  -> Creada categoría financiera: {name}")
    db.flush()

    # ── 7. Crear configuración de saldo inicial por defecto si no existe ──
    from app.models.finance_setting import FinanceSetting
    pc_setting = db.query(FinanceSetting).filter(FinanceSetting.key == "petty_cash_assigned").first()
    if not pc_setting:
        pc_setting = FinanceSetting(key="petty_cash_assigned", value="80000.00")
        db.add(pc_setting)
        print("  -> Creado ajuste de caja chica inicial de $80,000.00 MXN")
    db.flush()

    db.commit()
    print(f"✅ Sincronización de seed completada.")
