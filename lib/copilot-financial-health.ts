/**
 * Financial Health Monitor — detección temprana de bugs financieros.
 *
 * Expone funciones puras por check (testables sin DB) y un runner que
 * carga datos reales y ejecuta todos los checks.
 *
 * Checks implementados:
 *   A) drift_detected          — Zeta/DB drift desde zeta_completeness_audits
 *   B) balance_overwrite       — facturas con balance=0 en estado no-paid
 *   C) mixed_currency_ambiguity — facturas con deuda y currency_code NULL
 *   D) orphan_close_spike      — caída brusca de open_invoices_count vs ayer
 *   E) sync_truncation         — pipelines que alcanzaron exactamente el ROW_CAP
 *   F) missing_customers       — company_id con deuda sin proto_company
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types públicos ────────────────────────────────────────────────────────────

export type HealthCheckCode =
  | "drift_detected"
  | "balance_overwrite_detected"
  | "mixed_currency_ambiguity"
  | "orphan_close_spike"
  | "sync_truncation"
  | "missing_customers";

export type HealthCheckSeverity = "ok" | "warning" | "critical";

export type HealthCheckResult = {
  code: HealthCheckCode;
  severity: HealthCheckSeverity;
  summary: string;
  details: string;
  affectedCount: number;
  suggestedAction: string;
};

export type FinancialHealthReport = {
  severity: HealthCheckSeverity;
  checks: HealthCheckResult[];
  runAt: string;
  durationMs: number;
  workspaceCompanyId: string;
};

export type HealthCheckOptions = {
  /** Tolerancia de drift antes de warning. Default 0 (cualquier drift es warning). */
  driftTolerancePct?: number;
  /** Filas en que consideramos truncación. Default 500. */
  rowCapThreshold?: number;
  /** Drop pct de open invoices que dispara warning. Default 0.10 (10%). */
  orphanDropPctWarning?: number;
  /** Drop pct que dispara critical. Default 0.25 (25%). */
  orphanDropPctCritical?: number;
};

// ── Stat types para pure check functions ─────────────────────────────────────

export type DriftStats = {
  recentCriticalAudits: number;
  recentWarningAudits: number;
  maxAbsoluteDrift: number;
  affectedEntities: string[];
};

export type BalanceOverwriteStats = {
  /** Facturas en estado issued/partial/overdue con balance_amount = 0. */
  zeroBalanceUnpaidCount: number;
  totalActiveInvoices: number;
};

export type CurrencyAmbiguityStats = {
  invoicesWithNullCurrency: number;
  totalInvoicesWithBalance: number;
};

export type OrphanCloseStats = {
  yesterdayOpenCount: number;
  currentOpenCount: number;
};

export type TruncationStats = {
  pipelinesAtCap: string[];
  rowCap: number;
};

export type MissingCustomerStats = {
  invoicesWithMissingCompany: number;
  affectedCompanyIds: string[];
};

// ── Internal ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: HealthCheckSeverity[] = ["ok", "warning", "critical"];

function maxSeverity(a: HealthCheckSeverity, b: HealthCheckSeverity): HealthCheckSeverity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function overallSeverity(checks: HealthCheckResult[]): HealthCheckSeverity {
  return checks.reduce<HealthCheckSeverity>(
    (acc, c) => maxSeverity(acc, c.severity),
    "ok"
  );
}

// ── A) Drift check ────────────────────────────────────────────────────────────

/**
 * Evalúa drift Zeta/DB desde los audits ya computados por zeta-completeness-audit.
 * Cualquier audit "critical" en las últimas 48h → critical.
 * Audit "warning" → warning.
 */
export function checkDrift(stats: DriftStats): HealthCheckResult {
  const code: HealthCheckCode = "drift_detected";

  if (stats.recentCriticalAudits > 0) {
    return {
      code,
      severity: "critical",
      summary: `${stats.recentCriticalAudits} audit(s) crítico(s) detectado(s) en las últimas 48h`,
      details: `Entidades afectadas: ${stats.affectedEntities.join(", ") || "desconocida"}. Drift máximo: ${stats.maxAbsoluteDrift} registros.`,
      affectedCount: stats.recentCriticalAudits,
      suggestedAction:
        "Revisar zeta_completeness_audits y lanzar resync manual. Verificar que zeta-completeness-audit cron esté pasando.",
    };
  }

  if (stats.recentWarningAudits > 0) {
    return {
      code,
      severity: "warning",
      summary: `${stats.recentWarningAudits} audit(s) con drift moderado detectado(s)`,
      details: `Entidades: ${stats.affectedEntities.join(", ") || "desconocida"}. Drift máximo: ${stats.maxAbsoluteDrift} registros.`,
      affectedCount: stats.recentWarningAudits,
      suggestedAction:
        "Monitorear en el próximo ciclo. Si persiste más de 2 días, lanzar resync.",
    };
  }

  return {
    code,
    severity: "ok",
    summary: "Sin drift Zeta/DB detectado en las últimas 48h",
    details: "Todos los audits de completeness pasaron sin drift.",
    affectedCount: 0,
    suggestedAction: "",
  };
}

// ── B) Balance overwrite detection ────────────────────────────────────────────

/**
 * Detecta facturas con balance_amount=0 que no deberían tenerlo (issued/partial/overdue).
 * Un bug de overwrite deja facturas con status activo pero sin saldo.
 */
export function checkBalanceOverwrite(stats: BalanceOverwriteStats): HealthCheckResult {
  const code: HealthCheckCode = "balance_overwrite_detected";
  const { zeroBalanceUnpaidCount, totalActiveInvoices } = stats;

  const ratio = totalActiveInvoices > 0 ? zeroBalanceUnpaidCount / totalActiveInvoices : 0;

  if (zeroBalanceUnpaidCount > 20 || ratio > 0.15) {
    return {
      code,
      severity: "critical",
      summary: `${zeroBalanceUnpaidCount} factura(s) con balance=0 en estado no-pagado (${(ratio * 100).toFixed(1)}% del total)`,
      details:
        "Facturas con status issued/partial/overdue deberían tener balance > 0. " +
        "Este patrón indica posible overwrite de balance_amount por sync de vouchers o saldos.",
      affectedCount: zeroBalanceUnpaidCount,
      suggestedAction:
        "Verificar logs de zeta-sync-vouchers y zeta-sync-saldos. Comparar balance_amount con proto_invoice_financials.",
    };
  }

  if (zeroBalanceUnpaidCount > 5 || ratio > 0.05) {
    return {
      code,
      severity: "warning",
      summary: `${zeroBalanceUnpaidCount} factura(s) con balance=0 en estado no-pagado`,
      details:
        `${(ratio * 100).toFixed(1)}% de las facturas activas tienen balance=0 sin estar en estado paid/cancelled.`,
      affectedCount: zeroBalanceUnpaidCount,
      suggestedAction:
        "Investigar si la sync de vouchers o saldos actualizó incorrectamente estos registros.",
    };
  }

  return {
    code,
    severity: "ok",
    summary: "Sin indicadores de balance overwrite detectados",
    details: `${zeroBalanceUnpaidCount} facturas con balance=0 no-pagado (dentro de tolerancia).`,
    affectedCount: zeroBalanceUnpaidCount,
    suggestedAction: "",
  };
}

// ── C) Mixed currency ambiguity ───────────────────────────────────────────────

/**
 * Detecta facturas con balance pendiente y currency_code NULL.
 * Cualquier factura con deuda sin moneda es ambigua para alerts y scoring.
 */
export function checkMixedCurrencyAmbiguity(stats: CurrencyAmbiguityStats): HealthCheckResult {
  const code: HealthCheckCode = "mixed_currency_ambiguity";
  const { invoicesWithNullCurrency, totalInvoicesWithBalance } = stats;

  const ratio = totalInvoicesWithBalance > 0 ? invoicesWithNullCurrency / totalInvoicesWithBalance : 0;

  if (invoicesWithNullCurrency > 0 && ratio > 0.20) {
    return {
      code,
      severity: "critical",
      summary: `${invoicesWithNullCurrency} facturas con deuda pendiente sin currency_code (${(ratio * 100).toFixed(1)}%)`,
      details:
        "Más del 20% de las facturas con balance > 0 carecen de currency_code. " +
        "Los alerts de Fase 3 multi-moneda usarán aggregate legacy incorrecto.",
      affectedCount: invoicesWithNullCurrency,
      suggestedAction:
        "Verificar que el sync de Zeta esté mapeando currency_code. Ejecutar backfill si aplica.",
    };
  }

  if (invoicesWithNullCurrency > 0) {
    return {
      code,
      severity: "warning",
      summary: `${invoicesWithNullCurrency} facturas con deuda pendiente sin currency_code`,
      details:
        `${(ratio * 100).toFixed(1)}% de las facturas activas tienen moneda desconocida. ` +
        "El desglose UYU/USD para estos registros caerá en legacy totals.",
      affectedCount: invoicesWithNullCurrency,
      suggestedAction:
        "Revisar logs del sync de vouchers/saldos para verificar que se mapea currency_code.",
    };
  }

  return {
    code,
    severity: "ok",
    summary: "Todas las facturas con deuda tienen currency_code definido",
    details: "Sin ambigüedad de moneda detectada.",
    affectedCount: 0,
    suggestedAction: "",
  };
}

// ── D) Orphan auto-close spike ────────────────────────────────────────────────

/**
 * Detecta una caída brusca en open_invoices_count respecto al snapshot de ayer.
 * Indica posible cierre masivo de facturas (orphan auto-close bug).
 */
export function checkOrphanCloseSpike(
  stats: OrphanCloseStats,
  opts?: Pick<Required<HealthCheckOptions>, "orphanDropPctWarning" | "orphanDropPctCritical">
): HealthCheckResult {
  const code: HealthCheckCode = "orphan_close_spike";
  const warnPct = opts?.orphanDropPctWarning ?? 0.10;
  const critPct = opts?.orphanDropPctCritical ?? 0.25;
  const { yesterdayOpenCount, currentOpenCount } = stats;

  if (yesterdayOpenCount <= 0) {
    return {
      code,
      severity: "ok",
      summary: "Sin datos de ayer para comparar open_invoices_count",
      details: "No hay snapshot de ayer disponible.",
      affectedCount: 0,
      suggestedAction: "",
    };
  }

  const drop = yesterdayOpenCount - currentOpenCount;
  const dropPct = drop / yesterdayOpenCount;

  if (dropPct > critPct && drop > 10) {
    return {
      code,
      severity: "critical",
      summary: `Caída crítica: ${drop} facturas abiertas cerradas (${(dropPct * 100).toFixed(1)}% en 24h)`,
      details:
        `Ayer: ${yesterdayOpenCount} facturas abiertas. Hoy: ${currentOpenCount}. ` +
        "Una caída de esta magnitud sugiere cierre automático masivo (orphan auto-close bug o resync agresivo).",
      affectedCount: drop,
      suggestedAction:
        "Revisar logs de zeta-sync-vouchers y zeta-orphan-metadata-repair. " +
        "Verificar que no se hayan cerrado facturas legítimas.",
    };
  }

  if (dropPct > warnPct && drop > 5) {
    return {
      code,
      severity: "warning",
      summary: `Caída inusual: ${drop} facturas abiertas cerradas (${(dropPct * 100).toFixed(1)}% en 24h)`,
      details:
        `Ayer: ${yesterdayOpenCount} facturas abiertas. Hoy: ${currentOpenCount}. ` +
        "Puede ser normal (pagos reales) o indicar orphan auto-close.",
      affectedCount: drop,
      suggestedAction:
        "Verificar con el cliente si hubo pagos masivos. Si no, revisar logs de sync.",
    };
  }

  return {
    code,
    severity: "ok",
    summary: `Open invoices: ${currentOpenCount} (${drop >= 0 ? "-" : "+"}${Math.abs(drop)} vs ayer)`,
    details: "Variación dentro del rango esperado.",
    affectedCount: 0,
    suggestedAction: "",
  };
}

// ── E) Sync truncation ────────────────────────────────────────────────────────

const FINANCIAL_PIPELINES = new Set([
  "zeta-sync-vouchers",
  "zeta-sync-saldos",
  "zeta-sync-collection-receipts",
  "zeta-completeness-audit",
]);

/**
 * Detecta pipelines que procesaron exactamente rows == ROW_CAP.
 * Es indicio de que la query fue truncada y el dataset puede estar incompleto.
 */
export function checkSyncTruncation(stats: TruncationStats): HealthCheckResult {
  const code: HealthCheckCode = "sync_truncation";
  const { pipelinesAtCap, rowCap } = stats;

  if (pipelinesAtCap.length === 0) {
    return {
      code,
      severity: "ok",
      summary: "Sin pipelines en el límite de filas detectados",
      details: `ROW_CAP: ${rowCap}. Ningún pipeline procesó exactamente ${rowCap} filas.`,
      affectedCount: 0,
      suggestedAction: "",
    };
  }

  const financialAtCap = pipelinesAtCap.filter((p) => FINANCIAL_PIPELINES.has(p));

  if (financialAtCap.length > 0) {
    return {
      code,
      severity: "critical",
      summary: `${financialAtCap.length} pipeline(s) financiero(s) con posible truncación (rows == ${rowCap})`,
      details:
        `Pipelines: ${financialAtCap.join(", ")}. ` +
        `Cuando rows_processed == ${rowCap} exacto, el dataset puede estar incompleto. ` +
        "KPIs de cartera y snapshots podrían estar subestimados.",
      affectedCount: financialAtCap.length,
      suggestedAction:
        "Incrementar ROW_CAP o implementar paginación. Verificar que los snapshots coincidan con Zeta.",
    };
  }

  return {
    code,
    severity: "warning",
    summary: `${pipelinesAtCap.length} pipeline(s) en el límite de filas (rows == ${rowCap})`,
    details: `Pipelines: ${pipelinesAtCap.join(", ")}.`,
    affectedCount: pipelinesAtCap.length,
    suggestedAction:
      "Evaluar si los pipelines afectados son críticos para finanzas. Incrementar ROW_CAP si aplica.",
  };
}

// ── F) Missing customers ──────────────────────────────────────────────────────

/**
 * Detecta company_ids con deuda pendiente que no tienen proto_company activo.
 * Indica que el cliente existe en Zeta pero no fue importado (o fue eliminado).
 */
export function checkMissingCustomers(stats: MissingCustomerStats): HealthCheckResult {
  const code: HealthCheckCode = "missing_customers";
  const { invoicesWithMissingCompany, affectedCompanyIds } = stats;

  if (invoicesWithMissingCompany > 10) {
    return {
      code,
      severity: "critical",
      summary: `${invoicesWithMissingCompany} empresa(s) con deuda sin proto_company activo`,
      details:
        `Company IDs afectados (primeros 10): ${affectedCompanyIds.slice(0, 10).join(", ")}.` +
        " Estos clientes tienen deuda visible en proto_invoices pero no en el directorio /clientes.",
      affectedCount: invoicesWithMissingCompany,
      suggestedAction:
        "Lanzar sync de contactos/companies desde Zeta. Verificar que is_active=true en proto_companies.",
    };
  }

  if (invoicesWithMissingCompany > 0) {
    return {
      code,
      severity: "warning",
      summary: `${invoicesWithMissingCompany} empresa(s) con deuda pendiente sin proto_company activo`,
      details: `Company IDs: ${affectedCompanyIds.join(", ")}.`,
      affectedCount: invoicesWithMissingCompany,
      suggestedAction:
        "Verificar si los clientes fueron desactivados intencionalmente o si faltan de importar.",
    };
  }

  return {
    code,
    severity: "ok",
    summary: "Todas las empresas con deuda tienen proto_company activo",
    details: "Sin clientes fantasma detectados.",
    affectedCount: 0,
    suggestedAction: "",
  };
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function loadDriftStats(
  client: SupabaseClient,
  wid: string
): Promise<DriftStats> {
  return safe(async () => {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1_000).toISOString();
    const { data } = await client
      .from("zeta_completeness_audits")
      .select("entity, audit_scope, zeta_count, local_count, severity")
      .eq("workspace_company_id", wid)
      .gte("audited_at", cutoff)
      .order("audited_at", { ascending: false })
      .limit(200);

    const rows = (data ?? []) as Array<{
      entity: string;
      audit_scope: string;
      zeta_count: number;
      local_count: number;
      severity: string;
    }>;

    const critical = rows.filter((r) => r.severity === "critical");
    const warning = rows.filter((r) => r.severity === "warning");
    const maxDrift = rows.reduce(
      (max, r) => Math.max(max, Math.abs((r.zeta_count ?? 0) - (r.local_count ?? 0))),
      0
    );
    const entities = [...new Set(rows.filter((r) => r.severity !== "ok").map((r) => r.entity))];

    return {
      recentCriticalAudits: critical.length,
      recentWarningAudits: warning.length,
      maxAbsoluteDrift: maxDrift,
      affectedEntities: entities,
    };
  }, { recentCriticalAudits: 0, recentWarningAudits: 0, maxAbsoluteDrift: 0, affectedEntities: [] });
}

async function loadBalanceOverwriteStats(
  client: SupabaseClient,
  wid: string
): Promise<BalanceOverwriteStats> {
  return safe(async () => {
    const [suspiciousRes, totalRes] = await Promise.all([
      client
        .from("proto_invoices")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", wid)
        .eq("is_active", true)
        .eq("balance_amount", 0)
        .in("status", ["issued", "partial", "overdue"]),
      client
        .from("proto_invoices")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", wid)
        .eq("is_active", true),
    ]);

    return {
      zeroBalanceUnpaidCount: suspiciousRes.count ?? 0,
      totalActiveInvoices: totalRes.count ?? 0,
    };
  }, { zeroBalanceUnpaidCount: 0, totalActiveInvoices: 0 });
}

async function loadCurrencyAmbiguityStats(
  client: SupabaseClient,
  wid: string
): Promise<CurrencyAmbiguityStats> {
  return safe(async () => {
    const [nullCurrRes, totalWithBalRes] = await Promise.all([
      client
        .from("proto_invoices")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", wid)
        .eq("is_active", true)
        .gt("balance_amount", 0)
        .is("currency_code", null),
      client
        .from("proto_invoices")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", wid)
        .eq("is_active", true)
        .gt("balance_amount", 0),
    ]);

    return {
      invoicesWithNullCurrency: nullCurrRes.count ?? 0,
      totalInvoicesWithBalance: totalWithBalRes.count ?? 0,
    };
  }, { invoicesWithNullCurrency: 0, totalInvoicesWithBalance: 0 });
}

async function loadOrphanCloseStats(
  client: SupabaseClient,
  wid: string,
  yesterdayYmd: string
): Promise<OrphanCloseStats> {
  return safe(async () => {
    const [snapshotRes, currentRes] = await Promise.all([
      client
        .from("zeta_daily_snapshots")
        .select("open_invoices_count")
        .eq("workspace_company_id", wid)
        .eq("snapshot_date", yesterdayYmd)
        .maybeSingle(),
      client
        .from("proto_invoices")
        .select("id", { count: "exact", head: true })
        .eq("workspace_company_id", wid)
        .eq("is_active", true)
        .gt("balance_amount", 0),
    ]);

    const yesterdayOpen = (snapshotRes.data as { open_invoices_count?: number } | null)
      ?.open_invoices_count ?? 0;

    return {
      yesterdayOpenCount: yesterdayOpen,
      currentOpenCount: currentRes.count ?? 0,
    };
  }, { yesterdayOpenCount: 0, currentOpenCount: 0 });
}

async function loadTruncationStats(
  client: SupabaseClient,
  rowCap: number
): Promise<TruncationStats> {
  return safe(async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const { data } = await client
      .from("zeta_pipeline_runs")
      .select("pipeline_name, rows_processed")
      .gte("started_at", cutoff)
      .eq("rows_processed", rowCap)
      .in("status", ["succeeded", "partial"])
      .limit(50);

    const pipelinesAtCap = [...new Set(
      ((data ?? []) as Array<{ pipeline_name: string; rows_processed: number }>)
        .map((r) => r.pipeline_name)
    )];

    return { pipelinesAtCap, rowCap };
  }, { pipelinesAtCap: [], rowCap });
}

async function loadMissingCustomerStats(
  client: SupabaseClient,
  wid: string
): Promise<MissingCustomerStats> {
  return safe(async () => {
    const { data: invRows } = await client
      .from("proto_invoices")
      .select("company_id")
      .eq("workspace_company_id", wid)
      .eq("is_active", true)
      .gt("balance_amount", 0)
      .limit(500);

    const companyIds = [
      ...new Set(
        ((invRows ?? []) as Array<{ company_id: string }>)
          .map((r) => r.company_id)
          .filter(Boolean)
      ),
    ];

    if (companyIds.length === 0) {
      return { invoicesWithMissingCompany: 0, affectedCompanyIds: [] };
    }

    const { data: companies } = await client
      .from("proto_companies")
      .select("id")
      .eq("workspace_company_id", wid)
      .eq("is_active", true)
      .in("id", companyIds);

    const existingIds = new Set(((companies ?? []) as Array<{ id: string }>).map((c) => c.id));
    const missing = companyIds.filter((id) => !existingIds.has(id));

    return {
      invoicesWithMissingCompany: missing.length,
      affectedCompanyIds: missing.slice(0, 20),
    };
  }, { invoicesWithMissingCompany: 0, affectedCompanyIds: [] });
}

// ── Main runner ───────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<HealthCheckOptions> = {
  driftTolerancePct: 0,
  rowCapThreshold: 500,
  orphanDropPctWarning: 0.10,
  orphanDropPctCritical: 0.25,
};

/**
 * Carga datos reales desde Supabase y ejecuta todos los health checks.
 * Nunca lanza excepciones — errores de DB resultan en checks con datos vacíos.
 */
export async function runFinancialHealthChecks(
  client: SupabaseClient,
  workspaceCompanyId: string,
  options?: HealthCheckOptions
): Promise<FinancialHealthReport> {
  const started = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const wid = workspaceCompanyId.trim();

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const yesterdayYmd = yesterday.toISOString().slice(0, 10);

  const [driftStats, balanceStats, currencyStats, orphanStats, truncationStats, missingStats] =
    await Promise.all([
      loadDriftStats(client, wid),
      loadBalanceOverwriteStats(client, wid),
      loadCurrencyAmbiguityStats(client, wid),
      loadOrphanCloseStats(client, wid, yesterdayYmd),
      loadTruncationStats(client, opts.rowCapThreshold),
      loadMissingCustomerStats(client, wid),
    ]);

  const checks: HealthCheckResult[] = [
    checkDrift(driftStats),
    checkBalanceOverwrite(balanceStats),
    checkMixedCurrencyAmbiguity(currencyStats),
    checkOrphanCloseSpike(orphanStats, {
      orphanDropPctWarning: opts.orphanDropPctWarning,
      orphanDropPctCritical: opts.orphanDropPctCritical,
    }),
    checkSyncTruncation(truncationStats),
    checkMissingCustomers(missingStats),
  ];

  return {
    severity: overallSeverity(checks),
    checks,
    runAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    workspaceCompanyId: wid,
  };
}
