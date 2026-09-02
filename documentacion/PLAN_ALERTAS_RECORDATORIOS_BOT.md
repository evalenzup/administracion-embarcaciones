# Plan de Desarrollo: Sistema de Alertas y Recordatorios Inteligentes vía Telegram

> **Estado:** 📋 Pendiente / En Backlog  
> **Módulo:** Telegram Bot & Notificaciones Financieras (Viáticos y GRC)  
> **Fecha de creación:** 2026-09-02  

---

## 1. Objetivo General
Diseñar e implementar un motor de notificaciones proactivas y recordatorios automáticos a través del **Bot de Telegram** (`@DEO_facturabot`) para asistir a los comisionados y solicitantes del DEO durante todo el ciclo de vida de sus trámites de **Viáticos** y **Gastos a Reserva a Comprobar (GRC)**, optimizando los tiempos de comprobación y reduciendo la morosidad documental.

---

## 2. Tipos de Alertas y Recordatorios

### A. Asignación y Salida a Comisión
1. **Aprobación y Disponibilidad de Fondos:**
   - **Disparador:** Trámite cambia a estado `aprobado`.
   - **Contenido:** Notificación con destino, periodo, monto autorizado, recordatorio de facturación a nombre de CICESE (`CIC7309189G8`) y botón inline `[📋 Ver Trámite]`.
2. **Recordatorio de Salida (Día previo):**
   - **Disparador:** 1 día natural antes de `fecha_inicio`.
   - **Contenido:** Consejos rápidos sobre desglose de CFDI (XML + PDF) y categorías permitidas.

### B. Seguimiento de Comprobación y Plazos
3. **Fin de Comisión:**
   - **Disparador:** Fecha actual coincide con `fecha_fin`.
   - **Contenido:** Mensaje de bienvenida de regreso invitando a iniciar la carga de facturas.
4. **Semáforo de Plazos de Comprobación:**
   - **🟡 Preventivo (Día +3 de fin de viaje):** Resumen de avance: Monto Asignado vs. Monto Comprobado y saldo pendiente.
   - **🔴 Urgente / Vencido (Día +8 o más):** Alerta de comisión con fecha fin vencida y trámite en estado pendiente.
5. **Detección de Archivos Incompletos:**
   - **Disparador:** Factura registrada únicamente con XML (sin archivo PDF asociado).
   - **Contenido:** Mensaje con botón directo `[📎 Adjuntar PDF]` para completar el expediente.

### C. Liquidación y Cierre
6. **Alerta Inteligente de Remanente / Devolución:**
   - **Disparador:** Comisión concluida donde `monto_solicitado > monto_comprobado` y no existe `comprobante_devolucion_path`.
   - **Contenido:** Cálculo exacto del remanente a reintegrar y botón `[💳 Subir Ficha de Devolución]`.
7. **Confirmación de Cierre y Liquidación:**
   - **Disparador:** Trámite cambia a `comprobado`.
   - **Contenido:** Aviso de cierre exitoso del expediente financiero.

### D. Notificaciones para Administradores / Supervisores
8. **Resumen Semanal de Morosidad:**
   - **Disparador:** Lunes 9:00 AM (Cron).
   - **Contenido:** Lista de comisionados con trámites vencidos (+10 días) enviado a los administradores.
9. **Aviso de Expediente Listo para Revisión:**
   - **Disparador:** Comisionado completa el 100% de la comprobación (Facturas + Devolución).

---

## 3. Arquitectura Técnica Propuesta

1. **Motor de Tareas Programadas (Scheduler):**
   - Integración de `APScheduler` o `Asyncio Cron Worker` en el contenedor `telegram_bot` o `backend`.
   - Ejecución periódica (ej. escaneo diario a las 9:00 AM).
2. **Control Anti-Spam y Horarios:**
   - Ventana de envío en días hábiles: 9:00 AM a 6:00 PM.
   - Límite de 1 notificación automática por trámite al día.
   - Tabla de registro de notificaciones (`notification_logs`) para evitar envíos duplicados.
3. **Deep Linking e Interacción:**
   - Botones interactivos (`InlineKeyboardMarkup`) para navegar directamente a la carga de facturas o fichas de devolución.
