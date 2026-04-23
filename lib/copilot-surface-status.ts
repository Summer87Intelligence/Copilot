/**
 * Bloque 12 — Estado de superficie Copilot (demo / parcial / datos reales).
 *
 * Clasificación **estática** según el código actual (no promete capacidades futuras).
 * Para cambiar una vista cuando evolucione el producto: editar `COPILOT_SURFACE_INDEX`
 * y el comentario `rationale` de la entrada correspondiente.
 *
 * Definiciones:
 * - `real`: el contenido principal se alimenta de datos persistidos / APIs operativas sin mocks de negocio.
 * - `partial`: mezcla de datos reales con supuestos, evidencia mock, reglas simplificadas o cobertura incompleta.
 * - `demo`: depende de datos de ejemplo, simulación local o pantalla mayormente orientativa.
 */

export type CopilotSurfaceKind = "real" | "partial" | "demo";

/** Identificador estable por pantalla principal del módulo Copilot. */
export const COPILOT_SURFACE_IDS = [
  "copilot.home",
  "copilot.datos",
  "copilot.gestion-ia",
  "copilot.rutas",
  "copilot.acciones",
  "copilot.finanzas",
  "copilot.alertas",
  "copilot.insights",
  "copilot.clientes",
  "copilot.escenarios",
  "copilot.mesa-ayuda",
  "copilot.agentes",
  "copilot.configuracion",
  "copilot.personalizacion",
  "copilot.atencion-prioritaria",
] as const;

export type CopilotSurfaceId = (typeof COPILOT_SURFACE_IDS)[number];

export type CopilotSurfaceMeta = {
  id: CopilotSurfaceId;
  kind: CopilotSurfaceKind;
  /** Por qué esta clasificación con el código actual (mantener al día al evolucionar la vista). */
  rationale: string;
};

export const COPILOT_SURFACE_INDEX: Record<CopilotSurfaceId, CopilotSurfaceMeta> = {
  "copilot.home": {
    id: "copilot.home",
    kind: "real",
    rationale:
      "Agenda fiscal, snapshot del motor financiero y alertas fiscales vía `getUpcomingTaxAgenda`, `getFinancialSnapshot`, `getFiscalAlerts` (proto/Supabase). Empty states honestos sin MOCK_* de negocio.",
  },
  "copilot.datos": {
    id: "copilot.datos",
    kind: "real",
    rationale:
      "CRUD operativo sobre `proto_*` mediante `copilotApiFetch` y APIs `/api/copilot/data/*`.",
  },
  "copilot.gestion-ia": {
    id: "copilot.gestion-ia",
    kind: "partial",
    rationale:
      "`/api/copilot/real-insights` calcula sobre datos reales; el copy reconoce prototipo y las reglas de insight no cubren todo el negocio.",
  },
  "copilot.rutas": {
    id: "copilot.rutas",
    kind: "partial",
    rationale:
      "Hub mezcla motor financiero, cartera, agenda fiscal y conteo de insights; agregaciones y visibilidad son reglas de producto simplificadas.",
  },
  "copilot.acciones": {
    id: "copilot.acciones",
    kind: "partial",
    rationale:
      "Listado y mutación vía `/api/copilot/actions*` sobre motor; evidencia en drawers puede combinar lectura real con piezas explicativas.",
  },
  "copilot.finanzas": {
    id: "copilot.finanzas",
    kind: "partial",
    rationale:
      "Motor de caja y obligaciones reales (`getFinancialSnapshot`, proto); drawers fiscales usan mocks de documentos/IA donde no hay archivo real.",
  },
  "copilot.alertas": {
    id: "copilot.alertas",
    kind: "partial",
    rationale:
      "Alertas fiscales y predictivas desde motor real (`useCopilotAlerts`); drawer de evidencia puede recurrir a casos mock por id.",
  },
  "copilot.insights": {
    id: "copilot.insights",
    kind: "partial",
    rationale:
      "`generateInsightsFromBatch` consume datos vía `GET /api/copilot/insight-engine-dataset` (tenant); cada insight adjunta evidencia tipo mock (`copilot-insights-evidence-mock`).",
  },
  "copilot.clientes": {
    id: "copilot.clientes",
    kind: "real",
    rationale:
      "Cartera y detalle desde `getClientPortfolio` / datos proto vía APIs; sin dataset MOCK_* para el listado principal.",
  },
  "copilot.escenarios": {
    id: "copilot.escenarios",
    kind: "demo",
    rationale:
      "Pantalla vacía orientativa hasta que existan escenarios calculados sobre datos; no muestra comparativas reales aún.",
  },
  "copilot.mesa-ayuda": {
    id: "copilot.mesa-ayuda",
    kind: "demo",
    rationale:
      "Tickets listados desde `MOCK_TICKETS` (`lib/copilot-mock-data.ts`); formulario sin persistencia operativa en el flujo actual.",
  },
  "copilot.agentes": {
    id: "copilot.agentes",
    kind: "demo",
    rationale:
      "Agentes y pasos basados en `MOCK_AI_AGENTS`; toggles locales sin backend de activación.",
  },
  "copilot.configuracion": {
    id: "copilot.configuracion",
    kind: "partial",
    rationale:
      "Contenido mayormente documental / roadmap (`copilot-document-architecture`), no un panel de configuración persistida end-to-end.",
  },
  "copilot.personalizacion": {
    id: "copilot.personalizacion",
    kind: "demo",
    rationale:
      "Preferencias en estado local de React; no hay guardado en servidor en esta pantalla.",
  },
  "copilot.atencion-prioritaria": {
    id: "copilot.atencion-prioritaria",
    kind: "partial",
    rationale:
      "Priorización sobre alertas y obligaciones reales; drawers fiscales pueden mostrar evidencia simulada al faltar documentos.",
  },
};

export function getCopilotSurfaceMeta(id: CopilotSurfaceId): CopilotSurfaceMeta {
  return COPILOT_SURFACE_INDEX[id];
}

export function copilotSurfaceKindLabelEs(kind: CopilotSurfaceKind): string {
  switch (kind) {
    case "real":
      return "Datos reales";
    case "partial":
      return "Parcial";
    case "demo":
      return "Demo";
  }
}
