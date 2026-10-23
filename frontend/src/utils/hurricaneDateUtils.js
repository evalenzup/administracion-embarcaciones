/**
 * SIAE — Utilidades de conversión horaria para ciclones y huracanes.
 * Convierte timestamps UTC / Zulu de la NOAA (ej. "24/1200Z", ISO) a hora local
 * de Tijuana / Ensenada / Baja California (America/Tijuana, UTC-7 / PDT).
 */

export function formatTijuanaDateTime(dateStr, baseYear = null, baseMonth = null) {
  if (!dateStr) return { localStr: '', utcStr: '', fullLocalDesc: '', timeTijuana: '' };

  const str = String(dateStr).trim();

  // Caso 1: formato oficial NHC "24/1200Z" (Día/HHMMZ)
  const nhcMatch = str.match(/^(\d{2})\/(\d{2})(\d{2})Z$/i);
  if (nhcMatch) {
    const day = parseInt(nhcMatch[1], 10);
    const hour = parseInt(nhcMatch[2], 10);
    const minute = parseInt(nhcMatch[3], 10);

    const now = new Date();
    let year = baseYear || now.getUTCFullYear();
    let month = baseMonth != null ? baseMonth : now.getUTCMonth();

    // Detección de salto de mes
    const currentDay = now.getUTCDate();
    if (day < currentDay - 15) {
      // Cruzó a inicio del siguiente mes
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    } else if (day > currentDay + 15) {
      // Es fin del mes anterior
      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    }

    const utcDate = new Date(Date.UTC(year, month, day, hour, minute, 0));

    // Formatear en hora local de Tijuana (America/Tijuana)
    try {
      const options = {
        timeZone: 'America/Tijuana',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      };
      const formatted = new Intl.DateTimeFormat('es-MX', options).format(utcDate);
      const clean = formatted.replace(/\./g, '');
      const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
      
      return {
        localStr: `${capitalized} hrs`,
        utcStr: str,
        fullLocalDesc: `${capitalized} hrs (Hora local Tijuana)`,
      };
    } catch {
      return { localStr: str, utcStr: str, fullLocalDesc: str, timeTijuana: '' };
    }
  }

  // Caso 2: Formato ISO o fecha completa
  if (str.includes('T') || (str.includes('-') && str.length >= 10)) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const options = {
          timeZone: 'America/Tijuana',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        };
        const formatted = new Intl.DateTimeFormat('es-MX', options).format(d);
        const clean = formatted.replace(/\./g, '');
        const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
        return {
          localStr: `${capitalized} hrs`,
          utcStr: str,
          fullLocalDesc: `${capitalized} hrs (Hora local Tijuana)`,
        };
      }
    } catch {
      // fallback
    }
  }

  // Caso 3: Texto con mes en español (ej. "25 Oct - 06:00" o "24 Oct 2023 - 21:00")
  const spanishDateMatch = str.match(/^(\d{1,2})\s+([A-Za-z]{3,4})(?:\s+(\d{4}))?\s*-\s*(\d{1,2}):(\d{2})/i);
  if (spanishDateMatch) {
    const day = parseInt(spanishDateMatch[1], 10);
    const monthStr = spanishDateMatch[2].toLowerCase();
    const year = spanishDateMatch[3] ? parseInt(spanishDateMatch[3], 10) : (baseYear || new Date().getFullYear());
    const hour = parseInt(spanishDateMatch[4], 10);
    const minute = parseInt(spanishDateMatch[5], 10);

    const monthMap = {
      ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
      jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11
    };

    const month = monthMap[monthStr] !== undefined ? monthMap[monthStr] : 9;
    const utcDate = new Date(Date.UTC(year, month, day, hour, minute, 0));

    try {
      const options = {
        timeZone: 'America/Tijuana',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      };
      const formatted = new Intl.DateTimeFormat('es-MX', options).format(utcDate);
      const clean = formatted.replace(/\./g, '');
      const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
      return {
        localStr: `${capitalized} hrs`,
        utcStr: str,
        fullLocalDesc: `${capitalized} hrs (Hora local Tijuana)`,
      };
    } catch {
      // fallback
    }
  }

  // Caso 4: Texto preformateado (ej. "Viernes 25 - 10:00", "Ayer - 12:00")
  return {
    localStr: str,
    utcStr: str,
    fullLocalDesc: `${str} (Hora local)`,
  };
}
