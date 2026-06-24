/**
 * Wiring del Manual de uso Copilot (web + PDF).
 * Contenido editable en lib/copilot-manual/sections.generated.ts (UTF-8).
 * Glosario extra: lib/copilot-manual/glossary-extra.ts
 * Validar antes de commit: node scripts/generate-copilot-manual-content.mjs --check
 */

export type {
  CopilotManualBlock,
  CopilotManualSection,
} from "@/lib/copilot-manual/types";

import { COPILOT_MANUAL_EXTRA_GLOSSARY } from "@/lib/copilot-manual/glossary-extra";
import {
  COPILOT_MANUAL_DAILY_FLOW,
  COPILOT_MANUAL_FAQ,
  COPILOT_MANUAL_FIVE_MINUTE_STEPS,
  COPILOT_MANUAL_GENERATED_SECTIONS,
} from "@/lib/copilot-manual/sections.generated";
import type { CopilotManualSection } from "@/lib/copilot-manual/types";

function mergeGlosarioSection(sections: CopilotManualSection[]): CopilotManualSection[] {
  return sections.map((s) => {
    if (s.id !== "glosario") return s;
    const entries = [
      ...s.blocks.flatMap((b) => (b.type === "glossary" ? b.entries : [])),
      ...COPILOT_MANUAL_EXTRA_GLOSSARY,
    ];
    const rest = s.blocks.filter((b) => b.type !== "glossary");
    return {
      ...s,
      title: "Glosario — Términos de deuda y operación",
      blocks: [...rest, { type: "glossary" as const, entries }],
    };
  });
}

export {
  COPILOT_MANUAL_DAILY_FLOW,
  COPILOT_MANUAL_FAQ,
  COPILOT_MANUAL_FIVE_MINUTE_STEPS,
  COPILOT_MANUAL_GENERATED_SECTIONS,
};

export const COPILOT_MANUAL_TITLE = "Manual de Usuario";
export const COPILOT_MANUAL_PRODUCT = "Summer87 Copilot";
export const COPILOT_MANUAL_TAGLINE =
  "Guía operativa para usuarios, administración, tesorería, cobranza, CEO y contador.";

export const COPILOT_MANUAL_PDF_FILENAME = "manual-uso-copilot.pdf";

/** Orden del índice PDF (alineado al manual web + login, Santander, rutinas, FAQ, glosario). */
export const COPILOT_MANUAL_TOC_ORDER: Array<{ id: string; title: string }> = [
  { id: "copilot", title: "¿Qué es Summer87 Copilot?" },
  { id: "navegacion", title: "Cómo moverse por Copilot" },
  { id: "inicio-sesion", title: "Inicio de sesión" },
  { id: "roles-permisos", title: "Roles y permisos" },
  { id: "admin", title: "Panel administrativo" },
  { id: "hoy", title: "Hoy" },
  { id: "dashboard", title: "Dashboard Resumen" },
  { id: "acciones", title: "Acciones" },
  { id: "alertas", title: "Alertas" },
  { id: "clientes", title: "Clientes" },
  { id: "cartera", title: "Cartera" },
  { id: "tesoreria", title: "Tesorería" },
  { id: "importador-santander", title: "Importador bancario Santander" },
  { id: "finanzas", title: "Panorama financiero" },
  { id: "reportes", title: "Reportes" },
  { id: "datos", title: "Datos" },
  { id: "agentes", title: "Agentes IA" },
  { id: "operacional", title: "Estado del sistema" },
  { id: "estado", title: "Estado del negocio" },
  { id: "campana", title: "Campana de notificaciones" },
  { id: "problemas", title: "¿Qué hacer si algo aparece en rojo?" },
  { id: "rutinas", title: "Rutinas recomendadas" },
  { id: "faq", title: "Preguntas frecuentes" },
  { id: "glosario", title: "Glosario" },
];

export const COPILOT_MANUAL_SECTIONS = mergeGlosarioSection(
  COPILOT_MANUAL_GENERATED_SECTIONS
);

export function getCopilotManualSectionById(
  id: string
): (typeof COPILOT_MANUAL_SECTIONS)[number] | undefined {
  return COPILOT_MANUAL_SECTIONS.find((s) => s.id === id);
}

export function getCopilotManualSectionsForPdf() {
  return COPILOT_MANUAL_TOC_ORDER.map((entry) =>
    getCopilotManualSectionById(entry.id)
  ).filter((s): s is NonNullable<typeof s> => s != null);
}

/** Secciones del acordeón web (sin login, Santander duplicado, rutinas, FAQ, glosario global). */
export const COPILOT_MANUAL_WEB_SECTION_IDS = [
  "copilot",
  "navegacion",
  "hoy",
  "dashboard",
  "acciones",
  "alertas",
  "clientes",
  "cartera",
  "tesoreria",
  "finanzas",
  "datos",
  "agentes",
  "reportes",
  "operacional",
  "estado",
  "campana",
  "problemas",
  "roles-permisos",
  "admin",
  "glosario-deuda",
] as const;

export function getCopilotManualWebSections() {
  const glosario = getCopilotManualSectionById("glosario");
  return COPILOT_MANUAL_WEB_SECTION_IDS.map((id) => {
    if (id === "glosario-deuda" && glosario) {
      return { ...glosario, id: "glosario-deuda", title: glosario.title };
    }
    return getCopilotManualSectionById(id);
  }).filter((s): s is NonNullable<typeof s> => s != null);
}

export const COPILOT_MANUAL_MODULE_CARDS = [
  { label: "Hoy", href: "/copilot/hoy", color: "text-emerald-600 bg-emerald-50" },
  { label: "Dashboard Resumen", href: "/copilot/dashboard", color: "text-sky-600 bg-sky-50" },
  { label: "Cobranza", href: "/copilot/cobranza", color: "text-blue-600 bg-blue-50" },
  { label: "Alertas", href: "/copilot/alertas", color: "text-amber-600 bg-amber-50" },
  { label: "Clientes", href: "/copilot/clientes", color: "text-violet-600 bg-violet-50" },
  { label: "Cartera", href: "/copilot/cartera", color: "text-orange-600 bg-orange-50" },
  { label: "Tesorería", href: "/copilot/tesoreria", color: "text-teal-600 bg-teal-50" },
  {
    label: "Panorama financiero",
    href: "/copilot/finanzas",
    color: "text-indigo-600 bg-indigo-50",
  },
  { label: "Datos", href: "/copilot/datos", color: "text-slate-600 bg-slate-100" },
  { label: "Agentes IA", href: "/copilot/agentes", color: "text-purple-600 bg-purple-50" },
  {
    label: "Estado del sistema",
    href: "/copilot/alertas",
    color: "text-rose-600 bg-rose-50",
  },
] as const;
