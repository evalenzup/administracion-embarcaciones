"""
SIAE — Servicio de Envío de Notificaciones por Correo Electrónico.
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import BackgroundTasks

from app.config import get_settings

logger = logging.getLogger("siae.email")

def send_email_raw(to_email: str, subject: str, html_content: str) -> None:
    """
    Envía un correo electrónico de forma síncrona utilizando la configuración SMTP.
    Esta función es llamada internamente en segundo plano por FastAPI BackgroundTasks.
    """
    settings = get_settings()
    
    # Si no se configuró usuario de correo, omitir el envío silenciosamente
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("El correo no se envió porque no están configurados SMTP_USER y SMTP_PASSWORD en el archivo .env")
        return

    msg = MIMEMultipart()
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM or settings.SMTP_USER}>"
    msg["To"] = to_email
    msg["Subject"] = subject

    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        # Conectar al servidor SMTP
        if settings.SMTP_SSL:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
            if settings.SMTP_TLS:
                server.starttls()
        
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM or settings.SMTP_USER, [to_email], msg.as_string())
        server.quit()
        logger.info("Notificación por correo enviada con éxito a %s: '%s'", to_email, subject)
    except Exception:
        logger.exception("Error al enviar correo SMTP a %s", to_email)


def send_vessel_request_notification(
    background_tasks: BackgroundTasks,
    to_email: str,
    user_name: str,
    project_name: str,
    vessel_name: str,
    departure_date: str,
    return_date: str,
    status: str,
    cruise_number: str = None,
    admin_notes: str = None
) -> None:
    """
    Construye la plantilla HTML y encola el envío asíncrono del correo
    para notificar cambios en la solicitud de embarcación.
    """
    is_approved = status.lower() == "aprobada"
    status_label = "APROBADA" if is_approved else "RECHAZADA"
    status_color = "#52c41a" if is_approved else "#f5222d"
    status_bg = "#f6ffed" if is_approved else "#fff1f0"
    status_border = "#b7eb8f" if is_approved else "#ffa39e"

    subject = f"SIAE — Solicitud de Embarcación {status_label}"

    # Construcción de la plantilla HTML
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                background-color: #f0f2f5;
                color: #262626;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
            }}
            .container {{
                max-width: 600px;
                margin: 40px auto;
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                overflow: hidden;
                border: 1px solid #e8e8e8;
            }}
            .header {{
                background-color: #0A2647;
                padding: 30px;
                text-align: center;
                color: #ffffff;
            }}
            .header h1 {{
                margin: 0;
                font-size: 24px;
                font-weight: 600;
                letter-spacing: 0.5px;
            }}
            .content {{
                padding: 35px 30px;
            }}
            .content p {{
                font-size: 15px;
                line-height: 1.6;
                margin-top: 0;
                margin-bottom: 20px;
                color: #595959;
            }}
            .status-badge {{
                display: inline-block;
                padding: 8px 16px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 4px;
                color: {status_color};
                background-color: {status_bg};
                border: 1px solid {status_border};
                text-align: center;
                margin-bottom: 25px;
                letter-spacing: 0.5px;
            }}
            .details-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 25px;
                background-color: #fafafa;
                border-radius: 8px;
                border: 1px solid #f0f0f0;
            }}
            .details-table td {{
                padding: 12px 16px;
                font-size: 14px;
                border-bottom: 1px solid #f0f0f0;
            }}
            .details-table td.label {{
                font-weight: bold;
                color: #262626;
                width: 35%;
            }}
            .details-table td.value {{
                color: #595959;
            }}
            .notes-box {{
                background-color: #fffbe6;
                border: 1px solid #ffe58f;
                padding: 16px 20px;
                border-radius: 8px;
                margin-bottom: 25px;
            }}
            .notes-box h4 {{
                margin: 0 0 8px 0;
                color: #ad8b00;
                font-size: 14px;
                font-weight: 600;
            }}
            .notes-box p {{
                margin: 0;
                font-size: 13.5px;
                color: #595959;
                line-height: 1.5;
            }}
            .btn-container {{
                text-align: center;
                margin-top: 30px;
                margin-bottom: 10px;
            }}
            .btn {{
                display: inline-block;
                background-color: #FA8C16;
                color: #ffffff !important;
                text-decoration: none;
                padding: 12px 30px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 6px;
                transition: background-color 0.2s;
            }}
            .footer {{
                background-color: #fafafa;
                padding: 20px 30px;
                text-align: center;
                font-size: 12px;
                color: #bfbfbf;
                border-top: 1px solid #f0f0f0;
            }}
            .footer a {{
                color: #FA8C16;
                text-decoration: none;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>SIAE — Notificación de Estatus</h1>
            </div>
            <div class="content">
                <p>Estimado(a) <strong>{user_name}</strong>,</p>
                
                <p>Le informamos que el Departamento de Embarcaciones Oceanográficas (DEO) del CICESE ha revisado su solicitud de reserva de embarcación:</p>
                
                <div class="status-badge">
                    SOLICITUD {status_label}
                </div>
                
                <table class="details-table">
                    <tr>
                        <td class="label">Proyecto:</td>
                        <td class="value">{project_name}</td>
                    </tr>
                    <tr>
                        <td class="label">Embarcación:</td>
                        <td class="value">{vessel_name}</td>
                    </tr>
                    <tr>
                        <td class="label">Fecha de Salida:</td>
                        <td class="value">{departure_date}</td>
                    </tr>
                    <tr>
                        <td class="label">Fecha de Regreso:</td>
                        <td class="value">{return_date}</td>
                    </tr>
                    {"<tr><td class='label'>No. de Crucero:</td><td class='value'><strong>" + cruise_number + "</strong></td></tr>" if is_approved and cruise_number else ""}
                </table>
    """

    if not is_approved and admin_notes:
        html_content += f"""
                <div class="notes-box">
                    <h4>Notas del Administrador / Motivo de Rechazo:</h4>
                    <p>{admin_notes}</p>
                </div>
        """
    elif is_approved:
        html_content += f"""
                <p>Dado que su solicitud ha sido <strong>Aprobada</strong>, el sistema ha creado automáticamente un borrador de su <strong>Plan de Crucero</strong>. Ya puede ingresar a la plataforma para definir waypoints, registrar participantes y descargar su plan generado.</p>
        """

    html_content += f"""
                <div class="btn-container">
                    <a href="http://158.97.12.24:3010/" class="btn">Ingresar al Portal SIAE</a>
                </div>
            </div>
            <div class="footer">
                Este es un mensaje generado automáticamente por el sistema SIAE.<br>
                Departamento de Embarcaciones Oceanográficas — <a href="https://www.cicese.edu.mx">CICESE</a>
            </div>
        </div>
    </body>
    </html>
    """

    # Encolar el envío asíncrono
    background_tasks.add_task(send_email_raw, to_email, subject, html_content)


def send_new_vessel_request_admin_notification(
    background_tasks: BackgroundTasks,
    applicant_name: str,
    project_name: str,
    vessel_name: str,
    departure_date: str,
    return_date: str,
    scientists_count: int,
    crew_count: int
) -> None:
    """
    Construye la plantilla HTML y encola las tareas asíncronas para notificar
    a los administradores del DEO que se ha registrado una nueva solicitud de embarcación.
    """
    admin_emails = ["evalenzu@cicese.edu.mx", "lenero@cicese.edu.mx", "yalvarez@cicese.edu.mx"]
    subject = "SIAE — Nueva Solicitud de Embarcación Registrada"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                background-color: #f0f2f5;
                color: #262626;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
            }}
            .container {{
                max-width: 600px;
                margin: 40px auto;
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                overflow: hidden;
                border: 1px solid #e8e8e8;
            }}
            .header {{
                background-color: #0A2647;
                padding: 30px;
                text-align: center;
                color: #ffffff;
            }}
            .header h1 {{
                margin: 0;
                font-size: 22px;
                font-weight: 600;
                letter-spacing: 0.5px;
            }}
            .content {{
                padding: 35px 30px;
            }}
            .content p {{
                font-size: 15px;
                line-height: 1.6;
                margin-top: 0;
                margin-bottom: 20px;
                color: #595959;
            }}
            .details-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 25px;
                background-color: #fafafa;
                border-radius: 8px;
                border: 1px solid #f0f0f0;
            }}
            .details-table td {{
                padding: 12px 16px;
                font-size: 14px;
                border-bottom: 1px solid #f0f0f0;
            }}
            .details-table td.label {{
                font-weight: bold;
                color: #262626;
                width: 35%;
            }}
            .details-table td.value {{
                color: #595959;
            }}
            .btn-container {{
                text-align: center;
                margin-top: 30px;
                margin-bottom: 10px;
            }}
            .btn {{
                display: inline-block;
                background-color: #FA8C16;
                color: #ffffff !important;
                text-decoration: none;
                padding: 12px 30px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 6px;
                transition: background-color 0.2s;
            }}
            .footer {{
                background-color: #fafafa;
                padding: 20px 30px;
                text-align: center;
                font-size: 12px;
                color: #bfbfbf;
                border-top: 1px solid #f0f0f0;
            }}
            .footer a {{
                color: #FA8C16;
                text-decoration: none;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>SIAE — Nueva Solicitud Recibida</h1>
            </div>
            <div class="content">
                <p>Estimado(a) Administrador(a) del DEO,</p>
                
                <p>Le informamos que se ha registrado una nueva solicitud de reserva de embarcación en la plataforma SIAE. A continuación se presentan los detalles del proyecto:</p>
                
                <table class="details-table">
                    <tr>
                        <td class="label">Solicitante:</td>
                        <td class="value">{applicant_name}</td>
                    </tr>
                    <tr>
                        <td class="label">Proyecto:</td>
                        <td class="value">{project_name}</td>
                    </tr>
                    <tr>
                        <td class="label">Embarcación:</td>
                        <td class="value">{vessel_name}</td>
                    </tr>
                    <tr>
                        <td class="label">Fecha de Salida:</td>
                        <td class="value">{departure_date}</td>
                    </tr>
                    <tr>
                        <td class="label">Fecha de Regreso:</td>
                        <td class="value">{return_date}</td>
                    </tr>
                    <tr>
                        <td class="label">Científicos:</td>
                        <td class="value">{scientists_count}</td>
                    </tr>
                    <tr>
                        <td class="label">Tripulación:</td>
                        <td class="value">{crew_count}</td>
                    </tr>
                </table>
                
                <p>Por favor, ingrese a la sección de administración de SIAE para revisar, asignar el plan de crucero y aprobar o rechazar la solicitud.</p>

                <div class="btn-container">
                    <a href="http://158.97.12.24:3010/" class="btn">Revisar Solicitudes</a>
                </div>
            </div>
            <div class="footer">
                Este es un mensaje generado automáticamente por el sistema SIAE.<br>
                Departamento de Embarcaciones Oceanográficas — <a href="https://www.cicese.edu.mx">CICESE</a>
            </div>
        </div>
    </body>
    </html>
    """

    for email in admin_emails:
        background_tasks.add_task(send_email_raw, email, subject, html_content)
