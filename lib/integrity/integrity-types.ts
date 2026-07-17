/**
 * FASE F — Motor canónico de Integridad y Salud de plataforma (tipos puros).
 *
 * El motor es DETERMINÍSTICO y sin DB: recibe entradas ya normalizadas desde
 * las fuentes canónicas (Ventas/Finanzas/Banco/Cobranza/Comerciales/Clientes/
 * Sistema) y emite hallazgos clasificados con evidencia. La persistencia y la
 * carga viven aparte (`*-source.server.ts`) y deben degradar si falta una fuente.
 *
 * Vocabulario de severidad alineado con `copilot-financial-health` + un nivel
 * `info` para la card "Información" del panel ejecutivo.
 */

export type IntegritySeverity = "critical" | "warning" | "info";

export type IntegrityCategory =
  | "documents"
  | "sales"
  | "cobranza"
  | "banco"
  | "comerciales"
  | "clientes"
  | "system";

/** Superficies afectadas por un hallazgo (para "qué módulos afecta"). */
export type IntegrityModule =
  | "ventas"
  | "finanzas"
  | "reportes"
  | "dashboard"
  | "cartera"
  | "cobranza"
  | "banco"
  | "tesoreria"
  | "clientes"
  | "cliente360"
  | "comerciales"
  | "sistema";

/** Un ejemplo concreto que respalda el hallazgo (evidencia, nunca inventar). */
export type IntegrityEvidence = {
  entityId: string;
  label: string;
  detail: string;
};

export type IntegrityFinding = {
  /** Slug estable de la regla, kebab-case. */
  ruleId: string;
  category: IntegrityCategory;
  severity: IntegritySeverity;
  title: string;
  /** Cuántas entidades dispararon la regla. */
  count: number;
  /** Impacto en Dirección si no se resuelve. */
  impact: string;
  /** Dónde se detectó (fuente/consulta). */
  where: string;
  modules: IntegrityModule[];
  /** Cómo resolverlo (instrucción humana). */
  resolution: string;
  /** True solo si la reparación es 100% segura y no toca datos reales. */
  autoRepairable: boolean;
  /** Muestra acotada de entidades afectadas (máx. algunos ejemplos). */
  evidence: IntegrityEvidence[];
};

/** Regla que resultó OK (sin hallazgos) — para trazabilidad de cobertura. */
export type IntegrityRulePass = {
  ruleId: string;
  category: IntegrityCategory;
  title: string;
};

export type IntegrityStatus = "healthy" | "info" | "warning" | "critical";

export type IntegrityReport = {
  status: IntegrityStatus;
  computedAt: string;
  findings: IntegrityFinding[];
  passes: IntegrityRulePass[];
  counts: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  byCategory: Record<IntegrityCategory, number>;
  byModule: Partial<Record<IntegrityModule, number>>;
  /** Cobertura: reglas evaluadas vs reglas que no pudieron correr por fuente faltante. */
  coverage: {
    evaluated: number;
    skipped: number;
    skippedRules: string[];
  };
  observability: IntegrityObservability;
};

/** Métricas de observabilidad operativa (últimos eventos del sistema). */
export type IntegrityObservability = {
  lastCronAt: string | null;
  lastSyncAt: string | null;
  lastSnapshotAt: string | null;
  lastBankImportAt: string | null;
  lastReconciliationAt: string | null;
  lastMigrationAt: string | null;
  pendingJobs: number;
  hoursSinceCron: number | null;
  hoursSinceSync: number | null;
};

export function emptyByCategory(): Record<IntegrityCategory, number> {
  return {
    documents: 0,
    sales: 0,
    cobranza: 0,
    banco: 0,
    comerciales: 0,
    clientes: 0,
    system: 0,
  };
}
