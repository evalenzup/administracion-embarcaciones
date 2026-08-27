import asyncio
import logging
import sys
import socket
import aiohttp
from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from config import settings
from handlers.nav import router as nav_router
from handlers.comprobacion import router as comp_router

# Configurar logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout
)
logger = logging.getLogger(__name__)


async def main():
    logger.info("Iniciando Bot de Telegram de SIAE...")
    
    # 1. Validar configuración
    if not settings.TELEGRAM_BOT_TOKEN or settings.TELEGRAM_BOT_TOKEN == "YOUR_TELEGRAM_BOT_TOKEN":
        logger.error("❌ TELEGRAM_BOT_TOKEN no configurado en las variables de entorno.")
        sys.exit(1)
        
    # 2. Inicializar Bot con sesión IPv4 forzada y Dispatcher
    session = AiohttpSession()
    session._connector_init = {'family': socket.AF_INET}
    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN, session=session)
    dp = Dispatcher()

    # 3. Registrar routers
    dp.include_router(nav_router)
    dp.include_router(comp_router)

    # 4. Eliminar webhook previo para evitar conflictos y arrancar polling
    await bot.delete_webhook(drop_pending_updates=True)
    
    logger.info("Bot en funcionamiento y esperando mensajes (Polling)...")
    try:
        await dp.start_polling(bot)
    except Exception as e:
        logger.error(f"Error durante el polling: {e}")
    finally:
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Bot detenido de forma manual.")
