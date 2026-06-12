import type { ModuleKey } from "@/lib/auth/module-permissions";
import {
  COPILOT_API_MODULE_PREFIXES,
  resolveCopilotApiModuleKey,
} from "@/lib/auth/copilot-api-module-map";

export { COPILOT_API_MODULE_PREFIXES, resolveCopilotApiModuleKey };

/** Rutas públicas intencionales (sin sesión Copilot). */
export const COPILOT_API_PUBLIC_PATHS = [
  "/api/copilot/login",
  "/api/copilot/logout",
] as const;

/** Prefijo admin — middleware + requireAdminApiAuth (superadmin). */
export const COPILOT_API_ADMIN_PREFIX = "/api/copilot/admin";

/**
 * Solo tenant auth documentado (sin module_key).
 * [pathname exacto o prefijo, motivo]
 */
export const COPILOT_API_TENANT_ONLY_ALLOWLIST: ReadonlyArray<readonly [string, string]> = [
  ["/api/copilot/me", "Identidad/sesión — expone solo appUser de la sesión"],
  [
    "/api/copilot/dev-dataset-summary",
    "Dev tooling — conteos proto_* para diagnóstico local",
  ],
  [
    "/api/copilot/dev-financial-trace",
    "Dev tooling — traza financiera interna",
  ],
  [
    "/api/copilot/notifications/generate",
    "Side-effect del sistema — idempotente vía dedup_key, no es write del usuario; lo invoca el cron all-tenants y best-effort el cliente al iniciar sesión (incluye read-only).",
  ],
];

/**
 * Prefijos que exponen datos o cálculos financieros.
 * Cobertura: no pueden quedar solo con requireCopilotTenantContext.
 */
export const COPILOT_API_FINANCIAL_PREFIXES: readonly string[] = [
  "/api/copilot/financial-reconciliation",
  "/api/copilot/financial-snapshot",
  "/api/copilot/predictive-financial-dataset",
  "/api/copilot/cashflow-dataset",
  "/api/copilot/real-insights",
  "/api/copilot/insight-engine-dataset",
  "/api/copilot/executive-briefing",
  "/api/copilot/rutas-hub",
  "/api/copilot/rutas-snapshot",
];

export type CopilotApiRbacKind =
  | "public"
  | "admin"
  | "tenant_only"
  | "module";

export type CopilotApiRbacClassification =
  | { kind: "public"; reason: string }
  | { kind: "admin"; reason: string }
  | { kind: "tenant_only"; reason: string }
  | { kind: "module"; moduleKey: ModuleKey };

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Clasifica una ruta API Copilot para auditoría y tests de cobertura. */
export function classifyCopilotApiRoute(pathname: string): CopilotApiRbacClassification | null {
  const normalized = pathname.replace(/\/+$/, "") || pathname;

  for (const pub of COPILOT_API_PUBLIC_PATHS) {
    if (normalized === pub) {
      return { kind: "public", reason: "Auth PIN / logout — sin sesión previa" };
    }
  }

  if (matchesPrefix(normalized, COPILOT_API_ADMIN_PREFIX)) {
    return { kind: "admin", reason: "Superadmin — requireAdminApiAuth + middleware" };
  }

  for (const [prefix, reason] of COPILOT_API_TENANT_ONLY_ALLOWLIST) {
    if (matchesPrefix(normalized, prefix)) {
      return { kind: "tenant_only", reason };
    }
  }

  const moduleKey = resolveCopilotApiModuleKey(normalized);
  if (moduleKey) {
    return { kind: "module", moduleKey };
  }

  return null;
}

export function isCopilotFinancialApiPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || pathname;
  return COPILOT_API_FINANCIAL_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix));
}
