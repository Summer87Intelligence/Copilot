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
      "Acá ves primero las acciones que más pueden impactar en tu caja.",
      "Entrá en una por vez y seguí la recomendación.",
      "Cada alerta se traduce en una próxima acción concreta.",
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

/** Rutas donde no se muestra el panel lateral “Clave de lectura”. */
export const COPILOT_READING_KEY_SUPPRESSED_PATHS = new Set<string>([
  "/copilot/hoy",
  "/copilot/tesoreria",
]);

export function isCopilotReadingKeySuppressed(pathname: string): boolean {
  return COPILOT_READING_KEY_SUPPRESSED_PATHS.has(normalizeCopilotPath(pathname));
}

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
