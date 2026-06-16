/**
 * Detector central de unicidad de "sombras" Zeta vs CCV1.
 *
 * Una **sombra** es una fila `proto_invoices` con `category =
 * 'Zeta / saldos pendientes'` y `invoice_number` que empieza con `ZETA:`
 * pero NO con `ZETA:CCV1:`. La crea el pipeline de saldos cuando, después
 * de agotar todos los caminos de match (RegistroId, CCV1 number, heurístico
 * Serie/Numero y fallback company+total+fecha), no logra linkear con una
 * factura CCV1 ya persistida.
 *
 * Una **CCV1** es la fuente canónica de identidad CFE: persistida desde el
 * endpoint `RESTComprobantesClienteV1Query`. Su `invoice_number` empieza
 * con `ZETA:CCV1:`.
 *
 * Una sombra y una CCV1 son **gemelas** si comparten:
 *   - workspace_company_id
 *   - company_id
 *   - currency_code (UYU o USD)
 *   - issue_date
 *   - total_amount dentro de tolerancia (±0.20)
 *
 * Si existe una gemela activa al momento de persistir la sombra, esa
 * sombra es redundante: la CCV1 ya representa esa venta, y la sombra solo
 * inflaría `totalInvoiced / salesPeriod*`.
 *
 * Este módulo agrupa:
 *   - el detector "in-flight" usado por el pipeline de saldos para suprimir
 *     la creación de sombras duplicadas;
 *   - el detector "histórico" usado por la auditoría de integridad y por
 *     el cron diario para reportar sombras activas que tienen gemela CCV1.
 *
 * Es DEFENSE-IN-DEPTH: complementa el guardrail in-memory del motor de
 * reconciliación (`copilot-financial-reconciliation.ts`) y la migración
 * histórica `20260612000000_fix_zeta_invoice_shadow_duplicates_june_2026`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";

/** Tolerancia para considerar dos importes "iguales" (Zeta a veces redondea el saldo). */
export const SHADOW_UNIQUENESS_TOTAL_TOLERANCE = 0.2;

/** Categoría que el pipeline de saldos asigna a sombras `ZETA:{RegistroId}`. */
export const ZETA_SHADOW_CATEGORY = "Zeta / saldos pendientes";

const VALID_CURRENCIES = new Set(["UYU", "USD"]);

/** Input para detectar si una sombra a punto de crearse tiene CCV1 gemela. */
export type ShadowUniquenessInput = {
  workspaceCompanyId: string;
  companyId: string;
  currencyCode: string | null;
  issueYmd: string;
  totalAmount: number;
};

export type ShadowTwinCandidate = {
  invoice_id: string;
  invoice_number: string;
  total_amount: number;
  due_date?: string | null;
  cfe_tipo?: string | null;
  match_score?: number;
};

export type ShadowUniquenessOutcome =
  | { kind: "no_twin" }
  | { kind: "invalid_input"; reason: string }
  | { kind: "twin_present"; candidates: ShadowTwinCandidate[] };

function toNumberLoose(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Devuelve la(s) CCV1 activa(s) gemela(s) de una sombra **antes** de que se
 * persista. Se usa como último guardrail del pipeline de saldos.
 *
 * Reglas:
 *   - input.totalAmount > 0 e issueYmd YYYY-MM-DD, currency UYU/USD;
 *   - filtra solo `is_active = true` por `applyProtoActiveListFilter`;
 *   - tolerancia `±SHADOW_UNIQUENESS_TOTAL_TOLERANCE` sobre `total_amount`.
 *
 * No requiere coincidencia de RegistroId — es deliberadamente permisivo:
 * cualquier CCV1 activa con misma huella financiera invalida la sombra.
 */
export async function detectActiveCcv1TwinForShadow(
  supabase: SupabaseClient,
  input: ShadowUniquenessInput
): Promise<ShadowUniquenessOutcome> {
  const wid = (input.workspaceCompanyId ?? "").trim();
  const company = (input.companyId ?? "").trim();
  const currency = (input.currencyCode ?? "").trim().toUpperCase();
  const issue = (input.issueYmd ?? "").slice(0, 10);

  if (!wid) return { kind: "invalid_input", reason: "missing_workspace_company_id" };
  if (!company) return { kind: "invalid_input", reason: "missing_company_id" };
  if (!VALID_CURRENCIES.has(currency)) return { kind: "invalid_input", reason: "invalid_currency" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) return { kind: "invalid_input", reason: "invalid_issue_date" };
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    return { kind: "invalid_input", reason: "invalid_total_amount" };
  }

  const query = applyProtoActiveListFilter(
    supabase
      .from("proto_invoices")
      .select("id, invoice_number, total_amount")
      .eq("workspace_company_id", wid)
      .eq("company_id", company)
      .eq("currency_code", currency)
      .eq("issue_date", issue)
      .like("invoice_number", "ZETA:CCV1:%"),
    "active"
  );

  const { data, error } = await query;
  if (error) return { kind: "no_twin" };

  const candidates: ShadowTwinCandidate[] = [];
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const id = typeof raw.id === "string" ? raw.id : null;
    const invNum = typeof raw.invoice_number === "string" ? raw.invoice_number : null;
    if (!id || !invNum) continue;
    const total = round2(toNumberLoose(raw.total_amount));
    if (Math.abs(total - round2(input.totalAmount)) > SHADOW_UNIQUENESS_TOTAL_TOLERANCE) continue;
    candidates.push({ invoice_id: id, invoice_number: invNum, total_amount: total });
  }

  if (candidates.length === 0) return { kind: "no_twin" };
  return { kind: "twin_present", candidates };
}

// ── Auditor histórico ──────────────────────────────────────────────────────────

export type HistoricalShadowDuplicate = {
  shadow_id: string;
  shadow_invoice_number: string;
  workspace_company_id: string;
  company_id: string;
  currency_code: string;
  issue_date: string;
  total_amount: number;
  candidates: ShadowTwinCandidate[];
  review_required: boolean;
  /** True when scoring could not pick a single best CCV1 candidate (margin < threshold). */
  ambiguous: boolean;
};

export type ShadowDuplicateScanRange = {
  /** Fecha YMD inclusiva (issue_date >=). */
  from: string;
  /** Fecha YMD inclusiva (issue_date <=). */
  to: string;
};

type RawInvoiceRow = {
  id: string;
  invoice_number: string;
  workspace_company_id: string;
  company_id: string;
  currency_code: string | null;
  issue_date: string;
  due_date: string | null;
  created_at: string | null;
  total_amount: unknown;
  is_active: boolean | null;
  category: string | null;
  zeta_metadata: unknown;
};

/** Página máxima por sweep. PostgREST default 1000; mantenemos margen. */
const SCAN_PAGE_SIZE = 1000;

// ── Multi-field candidate scoring ─────────────────────────────────────────────

/** due_date match between shadow and CCV1 — strongest positional signal. */
const SCORE_DUE_DATE_MATCH = 40;
/** Temporal proximity: the CCV1 closest in creation time to the shadow. */
const SCORE_TEMPORAL_PROXIMITY_BONUS = 20;
/**
 * Minimum score-gap between best and second-best candidate to consider the
 * match non-ambiguous. If the gap is below this threshold the checker emits
 * `shadow_duplicate_ambiguous_match` (warning) instead of
 * `invoice_shadow_duplicate_ccv1` (critical).
 */
const SCORE_AMBIGUOUS_MIN_MARGIN = 20;

type CcvBucketEntry = {
  id: string;
  invoice_number: string;
  total: number;
  due_date: string | null;
  cfe_tipo: string | null;
  created_at: string | null;
};

function scoreCandidates(
  shadowDueDate: string | null,
  shadowCreatedAt: string | null,
  candidates: CcvBucketEntry[]
): Array<CcvBucketEntry & { score: number }> {
  // Pre-compute which candidate is temporally closest to the shadow.
  let closestDiffMs = Infinity;
  if (shadowCreatedAt) {
    const shadowTs = new Date(shadowCreatedAt).getTime();
    if (Number.isFinite(shadowTs)) {
      for (const c of candidates) {
        if (!c.created_at) continue;
        const diff = Math.abs(new Date(c.created_at).getTime() - shadowTs);
        if (diff < closestDiffMs) closestDiffMs = diff;
      }
    }
  }

  return candidates.map((c) => {
    let score = 0;
    if (shadowDueDate && c.due_date && c.due_date === shadowDueDate) {
      score += SCORE_DUE_DATE_MATCH;
    }
    if (shadowCreatedAt && c.created_at && Number.isFinite(closestDiffMs)) {
      const diff = Math.abs(new Date(c.created_at).getTime() - new Date(shadowCreatedAt).getTime());
      if (diff === closestDiffMs) score += SCORE_TEMPORAL_PROXIMITY_BONUS;
    }
    return { ...c, score };
  });
}

function pickBestCandidate(scored: Array<CcvBucketEntry & { score: number }>): {
  best: CcvBucketEntry & { score: number };
  ambiguous: boolean;
} {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const second = sorted[1];
  const margin = second !== undefined ? best.score - second.score : Infinity;
  return { best, ambiguous: margin < SCORE_AMBIGUOUS_MIN_MARGIN };
}

/**
 * Recorre el período `[from, to]` y devuelve toda fila sombra activa que
 * tiene al menos una CCV1 activa gemela. Es la versión "batch" del detector
 * anterior — usado por:
 *   - el check `invoice_shadow_duplicate_ccv1` del integrity-checker;
 *   - el script de auditoría histórica.
 *
 * Una sombra marcada como `review_required = true` en `zeta_metadata
 * .cleanup_audit.review_required` se reporta igual pero con `review_required:
 * true` para que el caller pueda filtrarla del resumen "duplicados activos".
 */
export async function findActiveShadowDuplicatesInPeriod(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  range: ShadowDuplicateScanRange
): Promise<HistoricalShadowDuplicate[]> {
  const wid = (workspaceCompanyId ?? "").trim();
  if (!wid) return [];
  const from = (range.from ?? "").slice(0, 10);
  const to = (range.to ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];

  const rows: RawInvoiceRow[] = [];
  let offset = 0;
  while (rows.length < SCAN_PAGE_SIZE * 100) {
    const { data, error } = await supabase
      .from("proto_invoices")
      .select("id, invoice_number, workspace_company_id, company_id, currency_code, issue_date, due_date, created_at, total_amount, is_active, category, zeta_metadata")
      .eq("workspace_company_id", wid)
      .gte("issue_date", from)
      .lte("issue_date", to)
      .like("invoice_number", "ZETA:%")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + SCAN_PAGE_SIZE - 1);
    if (error) break;
    const batch = (data ?? []) as RawInvoiceRow[];
    rows.push(...batch);
    if (batch.length < SCAN_PAGE_SIZE) break;
    offset += SCAN_PAGE_SIZE;
  }

  // Index CCV1 activos por (company, currency, fecha) para join O(n).
  type BucketKey = string;
  const ccv1Buckets = new Map<BucketKey, CcvBucketEntry[]>();
  for (const r of rows) {
    if (!r.invoice_number.startsWith("ZETA:CCV1:")) continue;
    const currency = (r.currency_code ?? "").trim().toUpperCase();
    if (!VALID_CURRENCIES.has(currency)) continue;
    const issue = (r.issue_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) continue;
    const zetaMeta = (r.zeta_metadata ?? {}) as Record<string, unknown>;
    const ccv1Meta = (zetaMeta.zeta_customer_voucher_v1 ?? {}) as Record<string, unknown>;
    const cfe_tipo = typeof ccv1Meta.cfe_tipo === "string" ? ccv1Meta.cfe_tipo : null;
    const key = `${r.company_id}|${currency}|${issue}`;
    const list = ccv1Buckets.get(key) ?? [];
    list.push({
      id: r.id,
      invoice_number: r.invoice_number,
      total: round2(toNumberLoose(r.total_amount)),
      due_date: r.due_date ?? null,
      cfe_tipo,
      created_at: r.created_at ?? null,
    });
    ccv1Buckets.set(key, list);
  }

  const out: HistoricalShadowDuplicate[] = [];
  for (const r of rows) {
    if (!r.invoice_number.startsWith("ZETA:")) continue;
    if (r.invoice_number.startsWith("ZETA:CCV1:")) continue;
    if ((r.category ?? "") !== ZETA_SHADOW_CATEGORY) continue;
    const currency = (r.currency_code ?? "").trim().toUpperCase();
    if (!VALID_CURRENCIES.has(currency)) continue;
    const issue = (r.issue_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) continue;
    const shadowTotal = round2(toNumberLoose(r.total_amount));
    const key = `${r.company_id}|${currency}|${issue}`;
    const peers = ccv1Buckets.get(key) ?? [];
    const matches = peers.filter(
      (p) => Math.abs(p.total - shadowTotal) <= SHADOW_UNIQUENESS_TOTAL_TOLERANCE
    );
    if (matches.length === 0) continue;

    const meta = (r.zeta_metadata ?? {}) as Record<string, unknown>;
    const cleanup = (meta.cleanup_audit ?? {}) as Record<string, unknown>;
    const reviewRequired = cleanup.review_required === true;

    let candidates: ShadowTwinCandidate[];
    let ambiguous = false;

    if (matches.length === 1) {
      const m = matches[0];
      candidates = [{
        invoice_id: m.id,
        invoice_number: m.invoice_number,
        total_amount: m.total,
        due_date: m.due_date,
        cfe_tipo: m.cfe_tipo,
        match_score: 0,
      }];
    } else {
      const scored = scoreCandidates(r.due_date ?? null, r.created_at ?? null, matches);
      const { ambiguous: isAmbiguous } = pickBestCandidate(scored);
      ambiguous = isAmbiguous;
      candidates = scored
        .sort((a, b) => b.score - a.score)
        .map((s) => ({
          invoice_id: s.id,
          invoice_number: s.invoice_number,
          total_amount: s.total,
          due_date: s.due_date,
          cfe_tipo: s.cfe_tipo,
          match_score: s.score,
        }));
    }

    out.push({
      shadow_id: r.id,
      shadow_invoice_number: r.invoice_number,
      workspace_company_id: r.workspace_company_id,
      company_id: r.company_id,
      currency_code: currency,
      issue_date: issue,
      total_amount: shadowTotal,
      candidates,
      ambiguous,
      review_required: reviewRequired,
    });
  }

  return out;
}
