/**
 * FASE F — Reglas puras del motor de Integridad.
 *
 * Cada regla es determinística y opera sobre entradas ya normalizadas por el
 * loader canónico. Devuelve a lo sumo UN hallazgo agregado (con `count` y una
 * muestra de evidencia). Si la fuente de una regla no está disponible, el runner
 * la marca como "skipped" (cobertura), nunca inventa datos.
 */

import {
  sumAppliedByMovement,
  type ReconciliationLink,
} from "@/lib/bank-movements/bank-reconciliation-links";
import type {
  IntegrityCategory,
  IntegrityEvidence,
  IntegrityFinding,
  IntegrityModule,
  IntegritySeverity,
} from "@/lib/integrity/integrity-types";

const EVIDENCE_CAP = 5;
const MONEY_TOLERANCE = 1; // divergencias de dinero canónico: casi exactas
const KPI_MIN_DATE = "2026-01-01";

export type CurrencyBucket = { UYU: number; USD: number };

export type IntegrityDocInput = {
  id: string;
  label: string;
  rawCurrency: string | null;
  resolvedCurrency: "UYU" | "USD" | null;
  issueDate: string | null;
  clientId: string | null;
  isVoided: boolean;
  includedInKpi: boolean;
  isCreditNote: boolean;
  creditNoteRef: string | null;
  registroKey: string | null;
};

export type CobranzaAppInput = {
  id: string;
  label: string;
  applied: number;
  outstanding: number;
  currency: string;
  agingDays: number;
};

export type BankMovInput = {
  id: string;
  label: string;
  amount: number;
  currency: string;
  fingerprint: string | null;
};

export type AssignmentInput = {
  clientId: string;
  clientLabel: string;
  salespersonId: string;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
};

export type ClientInput = {
  id: string;
  name: string | null;
  docNumber: string | null;
  hasSales: boolean;
};

export type RlsAuditRow = { table: string; rlsEnabled: boolean; policies: number };

export type IntegritySystemInput = {
  hoursSinceCron: number | null;
  hoursSinceSync: number | null;
  hoursSinceSnapshot: number | null;
  lastSyncFailed: boolean;
  rlsAudit?: RlsAuditRow[];
  pendingMigrations?: number;
  cronStalledThresholdHours?: number;
};

export type IntegrityInputs = {
  documents?: IntegrityDocInput[];
  salesNet?: {
    sales: CurrencyBucket;
    reports?: CurrencyBucket;
    finance?: CurrencyBucket;
    dashboard?: CurrencyBucket;
  };
  cobranza?: CobranzaAppInput[];
  bank?: { movements: BankMovInput[]; links: ReconciliationLink[] };
  comerciales?: AssignmentInput[];
  clientes?: ClientInput[];
  system?: IntegritySystemInput;
};

type FindingMeta = {
  ruleId: string;
  category: IntegrityCategory;
  severity: IntegritySeverity;
  title: string;
  impact: string;
  where: string;
  modules: IntegrityModule[];
  resolution: string;
  autoRepairable?: boolean;
};

export type IntegrityRuleSpec = {
  ruleId: string;
  category: IntegrityCategory;
  title: string;
  /** Devuelve true si la entrada requerida está presente. */
  applicable: (i: IntegrityInputs) => boolean;
  run: (i: IntegrityInputs) => IntegrityFinding | null;
};

function build(meta: FindingMeta, count: number, evidence: IntegrityEvidence[]): IntegrityFinding {
  return {
    ruleId: meta.ruleId,
    category: meta.category,
    severity: meta.severity,
    title: meta.title,
    count,
    impact: meta.impact,
    where: meta.where,
    modules: meta.modules,
    resolution: meta.resolution,
    autoRepairable: meta.autoRepairable ?? false,
    evidence: evidence.slice(0, EVIDENCE_CAP),
  };
}

function ev(entityId: string, label: string, detail: string): IntegrityEvidence {
  return { entityId, label, detail };
}

function ymd(v: string | null): string | null {
  return v ? v.slice(0, 10) : null;
}

// ── DOCUMENTS ────────────────────────────────────────────────────────────────

function docsRule(
  meta: FindingMeta,
  predicate: (d: IntegrityDocInput) => boolean,
  detail: (d: IntegrityDocInput) => string
): IntegrityRuleSpec {
  return {
    ruleId: meta.ruleId,
    category: meta.category,
    title: meta.title,
    applicable: (i) => Array.isArray(i.documents),
    run: (i) => {
      const hits = (i.documents ?? []).filter(predicate);
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map((d) => ev(d.id, d.label, detail(d))));
    },
  };
}

// ── SALES divergences ──────────────────────────────────────────────────────────

function divergenceRule(
  meta: FindingMeta,
  pick: (s: NonNullable<IntegrityInputs["salesNet"]>) => CurrencyBucket | undefined
): IntegrityRuleSpec {
  return {
    ruleId: meta.ruleId,
    category: meta.category,
    title: meta.title,
    applicable: (i) => Boolean(i.salesNet && pick(i.salesNet)),
    run: (i) => {
      const s = i.salesNet!;
      const other = pick(s);
      if (!other) return null;
      const evidence: IntegrityEvidence[] = [];
      (["UYU", "USD"] as const).forEach((cur) => {
        const diff = Math.round((s.sales[cur] - other[cur]) * 100) / 100;
        if (Math.abs(diff) > MONEY_TOLERANCE) {
          evidence.push(ev(cur, `Divergencia ${cur}`, `Ventas ${s.sales[cur]} vs ${other[cur]} (Δ ${diff})`));
        }
      });
      if (evidence.length === 0) return null;
      return build(meta, evidence.length, evidence);
    },
  };
}

export const INTEGRITY_RULES: IntegrityRuleSpec[] = [
  // DOCUMENTS
  docsRule(
    { ruleId: "documents-without-currency", category: "documents", severity: "critical", title: "Documentos sin moneda resoluble", impact: "Se excluyen de KPIs o se cuentan en moneda equivocada.", where: "Universo canónico de ventas emitidas", modules: ["ventas", "finanzas", "reportes"], resolution: "Revisar currency_code / MonedaCodigo del comprobante en Zeta." },
    (d) => d.includedInKpi && !d.isVoided && d.resolvedCurrency === null,
    (d) => `raw='${d.rawCurrency ?? "∅"}' sin fallback MonedaCodigo`
  ),
  docsRule(
    { ruleId: "documents-invalid-currency", category: "documents", severity: "warning", title: "Documentos con moneda inválida", impact: "Moneda fuera de {UYU,USD} rompe agregados por moneda.", where: "Universo canónico de ventas", modules: ["ventas", "finanzas"], resolution: "Normalizar la moneda del comprobante." },
    (d) => d.rawCurrency != null && d.resolvedCurrency === null && d.rawCurrency.trim() !== "",
    (d) => `moneda='${d.rawCurrency}'`
  ),
  docsRule(
    { ruleId: "documents-without-client", category: "documents", severity: "warning", title: "Documentos válidos sin cliente", impact: "No pueden atribuirse a Cliente 360 ni a un comercial.", where: "Ventas emitidas incluidas en KPI", modules: ["ventas", "cliente360", "comerciales"], resolution: "Asociar el comprobante a un cliente." },
    (d) => d.includedInKpi && !d.isVoided && !d.clientId,
    (d) => `${d.label} sin clientId`
  ),
  docsRule(
    { ruleId: "documents-without-date", category: "documents", severity: "warning", title: "Documentos sin fecha", impact: "No pueden ubicarse en un período; distorsionan cortes.", where: "Ventas emitidas incluidas en KPI", modules: ["ventas", "reportes"], resolution: "Completar la fecha de emisión." },
    (d) => d.includedInKpi && !d.issueDate,
    (d) => `${d.label} sin fecha`
  ),
  docsRule(
    { ruleId: "documents-before-2026-in-kpi", category: "documents", severity: "warning", title: "Documentos anteriores a 2026 en KPIs", impact: "Datos históricos contaminan métricas del período vigente.", where: "Ventas incluidas en KPI con fecha < 2026-01-01", modules: ["ventas", "reportes", "dashboard"], resolution: "Excluir del período o revisar el rango del import." },
    (d) => d.includedInKpi && ymd(d.issueDate) != null && (ymd(d.issueDate) as string) < KPI_MIN_DATE,
    (d) => `${d.label} fecha ${ymd(d.issueDate)}`
  ),
  docsRule(
    { ruleId: "voided-documents-in-kpi", category: "documents", severity: "critical", title: "Documentos anulados incluidos en KPIs", impact: "Infla ventas/finanzas con comprobantes anulados.", where: "Ventas incluidas en KPI con estado anulado", modules: ["ventas", "finanzas", "reportes", "dashboard"], resolution: "Excluir anulados del universo de KPI (isVoidedSaleStatus)." },
    (d) => d.includedInKpi && d.isVoided,
    (d) => `${d.label} anulado`
  ),
  docsRule(
    { ruleId: "credit-note-without-reference", category: "documents", severity: "warning", title: "Notas de crédito sin referencia", impact: "No se puede vincular la NC al comprobante que corrige.", where: "Comprobantes tipo nota de crédito", modules: ["ventas", "finanzas"], resolution: "Registrar el comprobante referenciado por la NC." },
    (d) => d.isCreditNote && !d.creditNoteRef,
    (d) => `${d.label} NC sin ref`
  ),
  {
    ruleId: "duplicate-documents",
    category: "documents",
    title: "Documentos duplicados (registro/shadow)",
    applicable: (i) => Array.isArray(i.documents),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "duplicate-documents", category: "documents", severity: "critical", title: "Documentos duplicados (registro/shadow)", impact: "Doble conteo de ventas: la misma operación cuenta dos veces.", where: "Universo canónico agrupado por registro/fingerprint", modules: ["ventas", "finanzas", "reportes"], resolution: "Deduplicar por registro canónico (dedupeZetaShadowInvoicesCanonical)." };
      const byKey = new Map<string, IntegrityDocInput[]>();
      for (const d of i.documents ?? []) {
        if (!d.includedInKpi || !d.registroKey) continue;
        const arr = byKey.get(d.registroKey) ?? [];
        arr.push(d);
        byKey.set(d.registroKey, arr);
      }
      const dups = [...byKey.entries()].filter(([, arr]) => arr.length > 1);
      if (dups.length === 0) return null;
      return build(meta, dups.length, dups.map(([k, arr]) => ev(k, `registro ${k}`, `${arr.length} copias`)));
    },
  },
  // SALES divergences
  divergenceRule(
    { ruleId: "sales-vs-reports-divergence", category: "sales", severity: "critical", title: "Divergencia Ventas vs Reportes", impact: "Reportes muestra un neto distinto que Ventas.", where: "netIssuedByCurrency (Ventas) vs net-sales-report", modules: ["ventas", "reportes"], resolution: "Verificar que Reportes consuma resolveCanonicalSaleCurrency/isVoidedSaleStatus." },
    (s) => s.reports
  ),
  divergenceRule(
    { ruleId: "sales-vs-finance-divergence", category: "sales", severity: "critical", title: "Divergencia Ventas vs Finanzas", impact: "Finanzas y Ventas no cuadran por moneda.", where: "Ventas vs generateFinancialConsistencyReport", modules: ["ventas", "finanzas"], resolution: "Alinear resolución de moneda (issued-sale-universe)." },
    (s) => s.finance
  ),
  divergenceRule(
    { ruleId: "dashboard-vs-sales-divergence", category: "sales", severity: "warning", title: "Divergencia Dashboard vs Ventas", impact: "El Dashboard directivo muestra un neto distinto que Ventas.", where: "Ventas vs adapter de Dashboard", modules: ["ventas", "dashboard"], resolution: "Verificar el adapter del Dashboard contra el universo canónico." },
    (s) => s.dashboard
  ),
  // COBRANZA
  {
    ruleId: "receipt-application-over-balance",
    category: "cobranza",
    title: "Aplicaciones mayores al saldo",
    applicable: (i) => Array.isArray(i.cobranza),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "receipt-application-over-balance", category: "cobranza", severity: "critical", title: "Aplicaciones mayores al saldo", impact: "Sobrepago aparente: aplicado supera el saldo del cliente.", where: "Aplicaciones de recibos por cliente", modules: ["cobranza", "cartera"], resolution: "Revisar la aplicación del recibo contra el saldo real." };
      const hits = (i.cobranza ?? []).filter((c) => c.applied > c.outstanding + 0.01 && c.outstanding >= 0);
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map((c) => ev(c.id, c.label, `aplicado ${c.applied} > saldo ${c.outstanding}`)));
    },
  },
  {
    ruleId: "negative-outstanding",
    category: "cobranza",
    title: "Saldo negativo",
    applicable: (i) => Array.isArray(i.cobranza),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "negative-outstanding", category: "cobranza", severity: "warning", title: "Saldo negativo", impact: "Un saldo negativo indica sobre-aplicación o dato corrupto.", where: "Saldos por cliente", modules: ["cobranza", "cartera"], resolution: "Revisar recibos aplicados de más." };
      const hits = (i.cobranza ?? []).filter((c) => c.outstanding < -0.01);
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map((c) => ev(c.id, c.label, `saldo ${c.outstanding}`)));
    },
  },
  {
    ruleId: "negative-aging",
    category: "cobranza",
    title: "Atraso negativo",
    applicable: (i) => Array.isArray(i.cobranza),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "negative-aging", category: "cobranza", severity: "warning", title: "Atraso negativo", impact: "Días de atraso negativos rompen los buckets de aging.", where: "Aging por cliente", modules: ["cobranza", "cartera"], resolution: "Revisar fechas de vencimiento vs fecha de corte." };
      const hits = (i.cobranza ?? []).filter((c) => c.agingDays < 0);
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map((c) => ev(c.id, c.label, `aging ${c.agingDays}d`)));
    },
  },
  // BANCO
  {
    ruleId: "bank-without-currency",
    category: "banco",
    title: "Movimientos bancarios sin moneda",
    applicable: (i) => Boolean(i.bank),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "bank-without-currency", category: "banco", severity: "warning", title: "Movimientos bancarios sin moneda", impact: "No pueden conciliarse ni sumarse por moneda.", where: "bank_movements", modules: ["banco"], resolution: "Completar la moneda del movimiento importado." };
      const hits = (i.bank?.movements ?? []).filter((m) => !m.currency || m.currency.trim() === "");
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map((m) => ev(m.id, m.label, "sin moneda")));
    },
  },
  {
    ruleId: "bank-duplicate-fingerprint",
    category: "banco",
    title: "Movimientos bancarios duplicados (fingerprint)",
    applicable: (i) => Boolean(i.bank),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "bank-duplicate-fingerprint", category: "banco", severity: "critical", title: "Movimientos bancarios duplicados (fingerprint)", impact: "Importaciones repetidas duplican caja bancaria.", where: "bank_movements agrupado por fingerprint", modules: ["banco", "tesoreria"], resolution: "Deduplicar por fingerprint (lib/bank/canonical/dedup)." };
      const byFp = new Map<string, BankMovInput[]>();
      for (const m of i.bank?.movements ?? []) {
        if (!m.fingerprint) continue;
        const arr = byFp.get(m.fingerprint) ?? [];
        arr.push(m);
        byFp.set(m.fingerprint, arr);
      }
      const dups = [...byFp.entries()].filter(([, arr]) => arr.length > 1);
      if (dups.length === 0) return null;
      return build(meta, dups.length, dups.map(([fp, arr]) => ev(fp, `fp ${fp.slice(0, 12)}`, `${arr.length} copias`)));
    },
  },
  {
    ruleId: "bank-reconciliation-over-applied",
    category: "banco",
    title: "Conciliación con sobre-aplicación (doble conteo)",
    applicable: (i) => Boolean(i.bank),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "bank-reconciliation-over-applied", category: "banco", severity: "critical", title: "Conciliación con sobre-aplicación (doble conteo)", impact: "Σ aplicado supera el importe del movimiento: riesgo de doble conteo.", where: "bank_movement_reconciliation_links vs bank_movements", modules: ["banco"], resolution: "Archivar links sobrantes (validateReconciliationApplication)." };
      const applied = sumAppliedByMovement(i.bank?.links ?? []);
      const amountById = new Map((i.bank?.movements ?? []).map((m) => [m.id, Math.abs(m.amount)] as const));
      const hits: IntegrityEvidence[] = [];
      for (const [movId, sum] of applied.entries()) {
        const amount = amountById.get(movId);
        if (amount != null && sum > amount + 0.01) {
          hits.push(ev(movId, `mov ${movId.slice(0, 8)}`, `aplicado ${sum} > importe ${amount}`));
        }
      }
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits);
    },
  },
  {
    ruleId: "bank-cross-currency-link",
    category: "banco",
    title: "Conciliación cruzando monedas",
    applicable: (i) => Boolean(i.bank),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "bank-cross-currency-link", category: "banco", severity: "critical", title: "Conciliación cruzando monedas", impact: "Vincula UYU con USD: mezcla de monedas prohibida.", where: "reconciliation_links vs bank_movements", modules: ["banco"], resolution: "Archivar el link; nunca conciliar cruzando monedas." };
      const curById = new Map((i.bank?.movements ?? []).map((m) => [m.id, m.currency] as const));
      const hits = (i.bank?.links ?? [])
        .filter((l) => l.archivedAt == null && l.targetType !== "ignored")
        .filter((l) => {
          const cur = curById.get(l.bankMovementId);
          return cur != null && cur.toUpperCase() !== l.currency;
        });
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map((l) => ev(l.id, `link ${l.id.slice(0, 8)}`, `${l.currency} vs mov ${curById.get(l.bankMovementId)}`)));
    },
  },
  // COMERCIALES
  {
    ruleId: "client-multiple-active-salespeople",
    category: "comerciales",
    title: "Cliente con múltiples comerciales activos",
    applicable: (i) => Array.isArray(i.comerciales),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "client-multiple-active-salespeople", category: "comerciales", severity: "critical", title: "Cliente con múltiples comerciales activos", impact: "Doble atribución de ventas netas por cliente.", where: "Asignaciones activas por cliente", modules: ["comerciales", "ventas"], resolution: "Cerrar la vigencia sobrante (una activa por cliente)." };
      const byClient = new Map<string, AssignmentInput[]>();
      for (const a of i.comerciales ?? []) {
        if (!a.active) continue;
        const arr = byClient.get(a.clientId) ?? [];
        arr.push(a);
        byClient.set(a.clientId, arr);
      }
      const hits = [...byClient.entries()].filter(([, arr]) => arr.length > 1);
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map(([c, arr]) => ev(c, arr[0]!.clientLabel, `${arr.length} comerciales activos`)));
    },
  },
  {
    ruleId: "salesperson-overlapping-vigencias",
    category: "comerciales",
    title: "Vigencias de comercial superpuestas",
    applicable: (i) => Array.isArray(i.comerciales),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "salesperson-overlapping-vigencias", category: "comerciales", severity: "warning", title: "Vigencias de comercial superpuestas", impact: "Solapamiento temporal ambigua la atribución histórica.", where: "Vigencias [validFrom,validTo] por cliente", modules: ["comerciales"], resolution: "Ajustar rangos para que no se solapen." };
      const byClient = new Map<string, AssignmentInput[]>();
      for (const a of i.comerciales ?? []) {
        const arr = byClient.get(a.clientId) ?? [];
        arr.push(a);
        byClient.set(a.clientId, arr);
      }
      const hits: IntegrityEvidence[] = [];
      for (const [clientId, arr] of byClient.entries()) {
        const sorted = arr
          .map((a) => ({ from: a.validFrom ?? "0000-01-01", to: a.validTo ?? "9999-12-31", label: a.clientLabel }))
          .sort((x, y) => x.from.localeCompare(y.from));
        for (let k = 1; k < sorted.length; k++) {
          if (sorted[k]!.from <= sorted[k - 1]!.to) {
            hits.push(ev(clientId, sorted[k]!.label, `solapa ${sorted[k]!.from} ≤ ${sorted[k - 1]!.to}`));
            break;
          }
        }
      }
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits);
    },
  },
  // CLIENTES
  {
    ruleId: "client-without-name",
    category: "clientes",
    title: "Clientes sin nombre",
    applicable: (i) => Array.isArray(i.clientes),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "client-without-name", category: "clientes", severity: "warning", title: "Clientes sin nombre", impact: "Fichas ilegibles en Clientes / Cliente 360.", where: "proto_companies", modules: ["clientes", "cliente360"], resolution: "Completar la razón social del cliente." };
      const hits = (i.clientes ?? []).filter((c) => !c.name || c.name.trim() === "");
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map((c) => ev(c.id, c.id, "sin nombre")));
    },
  },
  {
    ruleId: "client-duplicate-document",
    category: "clientes",
    title: "Clientes duplicados (documento)",
    applicable: (i) => Array.isArray(i.clientes),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "client-duplicate-document", category: "clientes", severity: "warning", title: "Clientes duplicados (documento)", impact: "Ventas de un mismo cliente se reparten en fichas distintas.", where: "proto_companies por documento", modules: ["clientes", "cliente360"], resolution: "Unificar las fichas duplicadas." };
      const byDoc = new Map<string, ClientInput[]>();
      for (const c of i.clientes ?? []) {
        if (!c.docNumber) continue;
        const arr = byDoc.get(c.docNumber) ?? [];
        arr.push(c);
        byDoc.set(c.docNumber, arr);
      }
      const dups = [...byDoc.entries()].filter(([, arr]) => arr.length > 1);
      if (dups.length === 0) return null;
      return build(meta, dups.length, dups.map(([d, arr]) => ev(d, `doc ${d}`, `${arr.length} fichas`)));
    },
  },
  {
    ruleId: "client-with-sales-no-record",
    category: "clientes",
    title: "Clientes con ventas pero sin ficha",
    applicable: (i) => Array.isArray(i.clientes),
    run: (i) => {
      const meta: FindingMeta = { ruleId: "client-with-sales-no-record", category: "clientes", severity: "warning", title: "Clientes con ventas pero sin ficha", impact: "Ventas atribuidas a un cliente sin datos maestros.", where: "Cruce ventas × proto_companies", modules: ["clientes", "ventas", "cliente360"], resolution: "Crear/completar la ficha del cliente." };
      const hits = (i.clientes ?? []).filter((c) => c.hasSales && (!c.name || c.name.trim() === ""));
      if (hits.length === 0) return null;
      return build(meta, hits.length, hits.map((c) => ev(c.id, c.id, "ventas sin ficha")));
    },
  },
  // SYSTEM
  {
    ruleId: "cron-stalled",
    category: "system",
    title: "Cron detenido",
    applicable: (i) => Boolean(i.system),
    run: (i) => {
      const s = i.system!;
      const threshold = s.cronStalledThresholdHours ?? 26;
      if (s.hoursSinceCron == null || s.hoursSinceCron <= threshold) return null;
      const meta: FindingMeta = { ruleId: "cron-stalled", category: "system", severity: "critical", title: "Cron detenido", impact: "Sin cron, snapshots/sync/tareas dejan de actualizarse.", where: "zeta_pipeline_runs / cron heartbeat", modules: ["sistema"], resolution: "Revisar el scheduler de cron y reintentar.", autoRepairable: false };
      return build(meta, 1, [ev("cron", "Último cron", `hace ${Math.round(s.hoursSinceCron)} h (umbral ${threshold} h)`)]);
    },
  },
  {
    ruleId: "snapshot-stale",
    category: "system",
    title: "Snapshot atrasado",
    applicable: (i) => Boolean(i.system),
    run: (i) => {
      const s = i.system!;
      if (s.hoursSinceSnapshot == null || s.hoursSinceSnapshot <= 48) return null;
      const meta: FindingMeta = { ruleId: "snapshot-stale", category: "system", severity: "warning", title: "Snapshot atrasado", impact: "Los agregados directivos pueden estar desactualizados.", where: "oic snapshots", modules: ["sistema", "dashboard"], resolution: "Recalcular snapshot (autorreparación segura).", autoRepairable: true };
      return build(meta, 1, [ev("snapshot", "Último snapshot", `hace ${Math.round(s.hoursSinceSnapshot)} h`)]);
    },
  },
  {
    ruleId: "sync-zeta-failed",
    category: "system",
    title: "Último sync Zeta falló",
    applicable: (i) => Boolean(i.system),
    run: (i) => {
      if (!i.system!.lastSyncFailed) return null;
      const meta: FindingMeta = { ruleId: "sync-zeta-failed", category: "system", severity: "critical", title: "Último sync Zeta falló", impact: "Datos de Zeta pueden estar incompletos o vencidos.", where: "zeta_sync_runs (status=failed)", modules: ["sistema", "ventas", "finanzas"], resolution: "Reintentar el sync (autorreparación segura).", autoRepairable: true };
      return build(meta, 1, [ev("sync", "Sync Zeta", "estado failed")]);
    },
  },
  {
    ruleId: "tables-without-rls",
    category: "system",
    title: "Tablas sin RLS",
    applicable: (i) => Array.isArray(i.system?.rlsAudit),
    run: (i) => {
      const rows = (i.system?.rlsAudit ?? []).filter((r) => !r.rlsEnabled);
      if (rows.length === 0) return null;
      const meta: FindingMeta = { ruleId: "tables-without-rls", category: "system", severity: "critical", title: "Tablas sin RLS", impact: "Riesgo de fuga de datos entre workspaces.", where: "pg_class.relrowsecurity", modules: ["sistema"], resolution: "Habilitar RLS y crear policies por workspace." };
      return build(meta, rows.length, rows.map((r) => ev(r.table, r.table, "RLS deshabilitado")));
    },
  },
  {
    ruleId: "pending-migrations",
    category: "system",
    title: "Migraciones pendientes",
    applicable: (i) => typeof i.system?.pendingMigrations === "number",
    run: (i) => {
      const n = i.system?.pendingMigrations ?? 0;
      if (n <= 0) return null;
      const meta: FindingMeta = { ruleId: "pending-migrations", category: "system", severity: "warning", title: "Migraciones pendientes", impact: "El esquema local difiere del remoto.", where: "supabase/migrations vs remoto", modules: ["sistema"], resolution: "Revisar y aplicar la migración pendiente con autorización." };
      return build(meta, n, [ev("migrations", "Migraciones", `${n} pendientes`)]);
    },
  },
];
