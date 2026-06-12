import type { ModuleKey } from "@/lib/auth/module-permissions";

/**
 * Prefijos de API Copilot → module_key efectivo (app_user_permissions + preset).
 * Orden: más específico primero.
 */
export const COPILOT_API_MODULE_PREFIXES: ReadonlyArray<readonly [string, ModuleKey]> = [
  ["/api/copilot/treasury", "tesoreria"],
  ["/api/copilot/dashboard", "dashboard"],
  ["/api/copilot/reports", "reportes"],
  ["/api/copilot/data", "datos"],
  ["/api/copilot/financial-reconciliation", "finanzas"],
  ["/api/copilot/financial-snapshot", "finanzas"],
  ["/api/copilot/predictive-financial-dataset", "finanzas"],
  ["/api/copilot/cashflow-dataset", "finanzas"],
  ["/api/copilot/real-insights", "finanzas"],
  ["/api/copilot/insight-engine-dataset", "finanzas"],
  ["/api/copilot/executive-briefing", "finanzas"],
  ["/api/copilot/rutas-hub", "finanzas"],
  ["/api/copilot/rutas-snapshot", "finanzas"],
  ["/api/copilot/cash-status-amounts", "tesoreria"],
  ["/api/copilot/manual.pdf", "manual"],
  ["/api/copilot/portfolio", "cartera"],
  ["/api/copilot/collection-actions", "cartera"],
  ["/api/copilot/payment-behavior", "cartera"],
  ["/api/copilot/client-360", "clientes"],
  ["/api/copilot/clients", "clientes"],
  ["/api/copilot/clientes", "clientes"],
  ["/api/copilot/transfer-aliases", "clientes"],
  ["/api/copilot/dataset", "datos"],
  ["/api/copilot/proto-documents", "datos"],
  ["/api/copilot/integrations/zeta", "datos"],
  ["/api/copilot/actions", "acciones"],
  ["/api/copilot/operational-actions", "acciones"],
  ["/api/copilot/decision-engine", "acciones"],
  ["/api/copilot/decisions", "acciones"],
  ["/api/copilot/initiatives", "acciones"],
  ["/api/copilot/outcomes", "acciones"],
  ["/api/copilot/automation-governance", "acciones"],
  ["/api/copilot/notifications", "hoy"],
  ["/api/copilot/operational-events", "hoy"],
  ["/api/copilot/operational-feed", "hoy"],
  ["/api/copilot/operational-health", "hoy"],
  ["/api/copilot/operational-intelligence", "hoy"],
  ["/api/copilot/operational-memory", "hoy"],
  ["/api/copilot/operational-workflows", "hoy"],
  ["/api/copilot/pipeline-health", "hoy"],
  ["/api/copilot/enterprise-sync-health", "hoy"],
  ["/api/copilot/intelligence-bundle", "agentes"],
  ["/api/copilot/llm-briefing", "agentes"],
  ["/api/copilot/strategic-recommendations", "agentes"],
];

/** Resuelve module_key para una ruta API Copilot (null = solo auth tenant). */
export function resolveCopilotApiModuleKey(pathname: string): ModuleKey | null {
  for (const [prefix, moduleKey] of COPILOT_API_MODULE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return moduleKey;
    }
  }
  return null;
}
