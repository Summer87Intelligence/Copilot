/**
 * Textos de “Clave de lectura” por ruta del módulo Copilot.
 * Conservan el copy que existía en cada pantalla (CopilotReadingKey histórico).
 */

export type CopilotReadingKeyEntry = {
  title: string;
  lines: string[];
};

export const COPILOT_READING_KEY_FINANZAS_DEFAULT: CopilotReadingKeyEntry = {
  title: "Clave de lectura",
  lines: [
    "Entiendo si el negocio está sano.",
    "Veo ingresos, egresos y margen.",
    "Puedo anticiparme.",
  ],
};

/** Modo cobertura guiada en Finanzas (misma URL; el panel se actualiza vía contexto). */
export const COPILOT_READING_KEY_FINANZAS_COBERTURA: CopilotReadingKeyEntry = {
  title: "Clave de lectura",
  lines: [
    "Sé cuánto falta cubrir.",
    "Tengo un primer paso claro.",
    "Puedo bajar a cobranzas, pagos u obligaciones.",
  ],
};

export const COPILOT_READING_KEYS: Record<string, CopilotReadingKeyEntry> = {
  "/copilot/rutas": {
    title: "Clave de lectura",
    lines: [
      "Un paso a la vez.",
      "Cada botón me lleva adelante.",
      "Termino en una acción concreta.",
    ],
  },
  "/copilot": {
    title: "Clave de lectura",
    lines: ["Acá empieza todo.", "Entiendo el sistema.", "Sé por dónde avanzar."],
  },
  "/copilot/datos": {
    title: "Clave de lectura",
    lines: [
      "Acá están los datos reales.",
      "Puedo validar cada decisión.",
      "Puedo bajar al detalle cuando quiero.",
    ],
  },
  "/copilot/gestion-ia": {
    title: "Clave de lectura",
    lines: [
      "Veo el pipeline completo.",
      "Detecto cuellos de botella rápido.",
      "Ejecuto con contexto, no a ciegas.",
    ],
  },
  "/copilot/atencion-prioritaria": {
    title: "Clave de lectura",
    lines: [
      "Entiendo qué está en juego.",
      "Sé qué hacer primero y qué posponer.",
      "Tengo una acción principal y accesos rápidos.",
    ],
  },
  "/copilot/finanzas": COPILOT_READING_KEY_FINANZAS_DEFAULT,
  "/copilot/acciones": {
    title: "Clave de lectura",
    lines: [
      "Estas son mis siguientes jugadas.",
      "Puedo registrar qué pasó.",
      "Cierro el ciclo con resultados.",
    ],
  },
  "/copilot/agentes": {
    title: "Clave de lectura",
    lines: [
      "No son gráficos sueltos: son roles.",
      "Cada agente cubre un frente.",
      "Armo el equipo que necesito.",
    ],
  },
  "/copilot/alertas": {
    title: "Clave de lectura",
    lines: [
      "Veo qué requiere atención ya.",
      "Entiendo el nivel de riesgo.",
      "Sé qué conviene revisar primero.",
    ],
  },
  "/copilot/clientes": {
    title: "Clave de lectura",
    lines: ["Esto es claro.", "Lo entiendo.", "Lo usaría."],
  },
  "/copilot/configuracion": {
    title: "Clave de lectura",
    lines: [
      "Entiendo qué documentos alimentan al sistema.",
      "Sé cómo se relacionan las tablas.",
      "Puedo planificar el salto a contabilidad y bancos.",
    ],
  },
  "/copilot/escenarios": {
    title: "Clave de lectura",
    lines: [
      "No decido solo con el presente.",
      "Puedo comparar contextos.",
      "Esto me ayuda a pensar estratégicamente.",
    ],
  },
  "/copilot/mesa-de-ayuda": {
    title: "Clave de lectura",
    lines: [
      "Tengo un canal directo.",
      "Pido ayuda sin fricción.",
      "Mi voz cuenta para mejorar el producto.",
    ],
  },
  "/copilot/personalizacion": {
    title: "Clave de lectura",
    lines: [
      "El copiloto se adapta a mí.",
      "Elijo qué ver y qué silenciar.",
      "Menos ruido, más señal.",
    ],
  },
  "/copilot/insights": {
    title: "Clave de lectura",
    lines: [
      "Acá están las lecturas que importan.",
      "Conecto causa y efecto.",
      "Me ayuda a decidir con criterio.",
    ],
  },
};

const COPILOT_READING_KEY_FALLBACK: CopilotReadingKeyEntry = {
  title: "Clave de lectura",
  lines: [
    "Acá están los datos reales.",
    "Puedo validar cada decisión.",
    "Puedo bajar al detalle cuando quiero.",
  ],
};

export function normalizeCopilotPath(pathname: string): string {
  const pathOnly = pathname.split("?")[0] ?? pathname;
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }
  return pathOnly;
}

/**
 * Resuelve la clave para la ruta actual: match exacto o prefijo más largo registrado.
 */
export function getCopilotReadingKeyForPath(pathname: string): CopilotReadingKeyEntry {
  const p = normalizeCopilotPath(pathname);
  if (COPILOT_READING_KEYS[p]) {
    return COPILOT_READING_KEYS[p];
  }
  const keys = Object.keys(COPILOT_READING_KEYS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (p.startsWith(`${k}/`)) {
      return COPILOT_READING_KEYS[k];
    }
  }
  return COPILOT_READING_KEY_FALLBACK;
}
