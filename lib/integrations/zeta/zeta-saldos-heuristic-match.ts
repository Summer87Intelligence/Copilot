/**
 * Matching heurístico determinístico: fila REST saldos pendientes ↔ `proto_invoices` (CCV1),
 * solo cuando fallan identidad por `RegistroId` y match por `invoice_number` CCV1.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import { invoiceZetaMetadataRegistroConsistentWithExpected } from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";
import { sanitizeZetaInvoiceKeyPart } from "@/lib/integrations/zeta/zeta-customer-vouchers-mapper";
import type { ZetaInvoice } from "@/types/zeta";

/** Puntos por criterio (máx. teórico 100). */
export const HEURISTIC_SCORE_NUMERO = 50;
export const HEURISTIC_SCORE_SERIE = 20;
export const HEURISTIC_SCORE_TOTAL = 20;
export const HEURISTIC_SCORE_FECHA = 10;

export const HEURISTIC_THRESHOLD_ACCEPT = 80;
export const HEURISTIC_THRESHOLD_MIN_LOG = 60;

export type HeuristicScoreBreakdown = {
  numero_match: boolean;
  serie_match: boolean;
  total_match: boolean;
  fecha_match: boolean;
};

export type ProtoInvoiceHeuristicRow = {
  id: string;
  invoice_number: string;
  issue_date: string;
  total_amount: number;
  zeta_metadata: unknown;
};

function normStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function readSaldoField(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(row, n)) return row[n];
    const want = n.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === want) return row[k];
    }
  }
  return undefined;
}

/** Serie / número desde la fila REST de saldos (best-effort). */
export function extractSerieNumeroFromSaldoSourceRow(
  row: Record<string, unknown> | null | undefined
): { serie: string | null; numero: string | null } {
  if (!row) return { serie: null, numero: null };
  const serieRaw = readSaldoField(row, ["Serie", "serie"]);
  const numRaw = readSaldoField(row, ["Numero", "numero", "Número", "número"]);
  const serie = normStr(serieRaw) || null;
  const numero = numRaw !== undefined && numRaw !== null ? normStr(numRaw) || null : null;
  return { serie, numero };
}

/** `ZETA:CCV1:{emp}:{cli}:{serie}:{numero}` → serie/numero en posiciones 4 y 5. */
export function parseCcV1SerieNumeroFromInvoiceNumber(
  invoiceNumber: string
): { serie: string; numero: string } | null {
  if (!invoiceNumber.startsWith("ZETA:CCV1:")) return null;
  const parts = invoiceNumber.split(":");
  if (parts.length < 6) return null;
  const serie = normStr(parts[4]);
  const numero = normStr(parts[5]);
  if (!serie || !numero) return null;
  return { serie, numero };
}

function readSerieNumeroFromProtoMetadata(zeta_metadata: unknown): { serie: string; numero: string } | null {
  if (zeta_metadata === null || zeta_metadata === undefined || typeof zeta_metadata !== "object" || Array.isArray(zeta_metadata)) {
    return null;
  }
  const v1 = (zeta_metadata as Record<string, unknown>).zeta_customer_voucher_v1;
  if (v1 === null || v1 === undefined || typeof v1 !== "object" || Array.isArray(v1)) return null;
  const rec = v1 as Record<string, unknown>;
  const serie = normStr(rec.serie);
  const numero = normStr(rec.numero);
  if (!serie || !numero) return null;
  return { serie, numero };
}

/** Serie/número para scoring: CCV1 estándar o metadata voucher. */
export function extractProtoSerieNumeroForHeuristic(proto: ProtoInvoiceHeuristicRow): {
  serie: string | null;
  numero: string | null;
} {
  const fromNum = parseCcV1SerieNumeroFromInvoiceNumber(proto.invoice_number);
  if (fromNum) return { serie: fromNum.serie, numero: fromNum.numero };
  const fromMeta = readSerieNumeroFromProtoMetadata(proto.zeta_metadata);
  if (fromMeta) return { serie: fromMeta.serie, numero: fromMeta.numero };
  return { serie: null, numero: null };
}

/** Segmento cliente en `ZETA:CCV1:…` (alineado a `parseCcV1ClienteFromInvoiceNumber` en saldos-pipeline). */
export function parseCcV1ClienteSegmentFromInvoiceNumber(invoiceNumber: string): string | null {
  if (!invoiceNumber.startsWith("ZETA:CCV1:")) return null;
  const parts = invoiceNumber.split(":");
  if (parts.length < 4) return null;
  if (parts[2] === "NOSER") return normStr(parts[3]) || null;
  return normStr(parts[3]) || null;
}

function totalsWithinTolerance(saldoTotal: number, protoTotal: number): boolean {
  if (!Number.isFinite(saldoTotal) || !Number.isFinite(protoTotal)) return false;
  const diff = Math.abs(saldoTotal - protoTotal);
  const tol = Math.max(0.01, 1e-4 * Math.max(Math.abs(saldoTotal), Math.abs(protoTotal)));
  return diff <= tol;
}

function issueDatesWithinDays(saldoYmd: string, protoYmd: string, maxDays: number): boolean {
  const a = saldoYmd.slice(0, 10);
  const b = protoYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
  const da = new Date(`${a}T12:00:00.000Z`).getTime();
  const db = new Date(`${b}T12:00:00.000Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return false;
  const days = Math.abs(da - db) / (24 * 3600 * 1000);
  return days <= maxDays + 1e-9;
}

/**
 * Score determinístico saldo ↔ factura proto (misma `company_id` ya asumida por el caller).
 */
export function computeHeuristicSaldoProtoScore(
  saldo: {
    serie: string | null;
    numero: string | null;
    issueYmd: string;
    totalAmount: number;
  },
  proto: ProtoInvoiceHeuristicRow
): { score: number; breakdown: HeuristicScoreBreakdown } {
  const breakdown: HeuristicScoreBreakdown = {
    numero_match: false,
    serie_match: false,
    total_match: false,
    fecha_match: false,
  };
  let score = 0;
  const pSn = extractProtoSerieNumeroForHeuristic(proto);
  const saldoNum = saldo.numero?.trim() || null;
  const saldoSer = saldo.serie?.trim() || null;
  const protoNum = pSn.numero?.trim() || null;
  const protoSer = pSn.serie?.trim() || null;

  if (saldoNum && protoNum && saldoNum === protoNum) {
    score += HEURISTIC_SCORE_NUMERO;
    breakdown.numero_match = true;
  }
  if (saldoSer && protoSer && saldoSer.toUpperCase() === protoSer.toUpperCase()) {
    score += HEURISTIC_SCORE_SERIE;
    breakdown.serie_match = true;
  }
  if (totalsWithinTolerance(saldo.totalAmount, proto.total_amount)) {
    score += HEURISTIC_SCORE_TOTAL;
    breakdown.total_match = true;
  }
  if (issueDatesWithinDays(saldo.issueYmd, proto.issue_date, 3)) {
    score += HEURISTIC_SCORE_FECHA;
    breakdown.fecha_match = true;
  }
  return { score, breakdown };
}

function protoHasRegistroContradiction(zeta_metadata: unknown, expectedRegistroId: string): boolean {
  return !invoiceZetaMetadataRegistroConsistentWithExpected(zeta_metadata, expectedRegistroId);
}

export type HeuristicConfidence = "high" | "medium" | "low";

export type HeuristicMatchOutcome =
  | { kind: "none" }
  | { kind: "applied"; confidence: "high"; invoice_id: string; invoice_number: string; score: number; breakdown: HeuristicScoreBreakdown }
  | { kind: "ambiguous"; top: Array<{ invoice_id: string; invoice_number: string; score: number }> }
  | { kind: "rejected_low_score"; confidence: HeuristicConfidence; best_score: number; best_invoice_id: string | null; band: "below_60" | "60_79_doubt" };

/**
 * Busca a lo sumo una factura CCV1 del cliente Zeta con score ≥ umbral y sin ambigüedad.
 */
export async function findBestHeuristicProtoInvoiceForSaldoRow(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string,
  inv: ZetaInvoice,
  zetaClienteCodigo: string
): Promise<HeuristicMatchOutcome> {
  const wid = workspaceCompanyId.trim();
  const expectedCli = sanitizeZetaInvoiceKeyPart(zetaClienteCodigo, 24) || "NCLI";
  const row = inv.saldoSourceRow;
  const { serie: saldoSerie, numero: saldoNumero } = extractSerieNumeroFromSaldoSourceRow(row ?? null);
  const saldoIssue = inv.issueDate.slice(0, 10);
  const saldoTotal = inv.totalAmount;

  if (!saldoNumero && !saldoSerie) {
    return { kind: "none" };
  }

  const pageSize = 800;
  const candidates: ProtoInvoiceHeuristicRow[] = [];
  let from = 0;
  for (;;) {
    const q = applyProtoActiveListFilter(
      supabase
        .from("proto_invoices")
        .select("id, invoice_number, issue_date, total_amount, zeta_metadata")
        .eq("workspace_company_id", wid)
        .eq("company_id", protoCompanyId)
        .like("invoice_number", "ZETA:CCV1:%")
        .order("issue_date", { ascending: false })
        .range(from, from + pageSize - 1),
      "active"
    );
    const { data, error } = await q;
    if (error) throw new Error(`heuristic proto_invoices: ${error.message}`);
    const rows = (data ?? []) as Array<{
      id?: unknown;
      invoice_number?: unknown;
      issue_date?: unknown;
      total_amount?: unknown;
      zeta_metadata?: unknown;
    }>;
    for (const r of rows) {
      const id = typeof r.id === "string" ? r.id : null;
      const invNum = typeof r.invoice_number === "string" ? r.invoice_number : null;
      if (!id || !invNum) continue;
      const cliSegRaw = parseCcV1ClienteSegmentFromInvoiceNumber(invNum);
      const cliSegNorm = cliSegRaw ? sanitizeZetaInvoiceKeyPart(cliSegRaw, 24) || "NCLI" : null;
      if (!cliSegNorm || cliSegNorm !== expectedCli) continue;
      if (protoHasRegistroContradiction(r.zeta_metadata, inv.zetaId)) continue;
      const totalRaw = r.total_amount;
      const total =
        typeof totalRaw === "number"
          ? totalRaw
          : Number.isFinite(Number(String(totalRaw ?? "").replace(",", ".")))
            ? Number(String(totalRaw).replace(",", "."))
            : 0;
      const issue = typeof r.issue_date === "string" ? r.issue_date.slice(0, 10) : "";
      candidates.push({
        id,
        invoice_number: invNum,
        issue_date: issue,
        total_amount: total,
        zeta_metadata: r.zeta_metadata,
      });
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  if (candidates.length === 0) {
    return { kind: "none" };
  }

  const scored = candidates.map((p) => {
    const { score, breakdown } = computeHeuristicSaldoProtoScore(
      {
        serie: saldoSerie,
        numero: saldoNumero,
        issueYmd: saldoIssue,
        totalAmount: saldoTotal,
      },
      p
    );
    return {
      invoice_id: p.id,
      invoice_number: p.invoice_number,
      score,
      breakdown,
    };
  });
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < HEURISTIC_THRESHOLD_MIN_LOG) {
    return {
      kind: "rejected_low_score",
      confidence: "low" as const,
      best_score: best?.score ?? 0,
      best_invoice_id: best?.invoice_id ?? null,
      band: "below_60",
    };
  }

  if (best.score < HEURISTIC_THRESHOLD_ACCEPT) {
    return {
      kind: "rejected_low_score",
      confidence: "medium" as const,
      best_score: best.score,
      best_invoice_id: best.invoice_id,
      band: "60_79_doubt",
    };
  }

  const strong = scored.filter((s) => s.score >= HEURISTIC_THRESHOLD_ACCEPT);
  if (strong.length >= 2) {
    return {
      kind: "ambiguous",
      top: strong.slice(0, 4).map((s) => ({
        invoice_id: s.invoice_id,
        invoice_number: s.invoice_number,
        score: s.score,
      })),
    };
  }

  const winner = strong[0]!;
  return {
    kind: "applied",
    confidence: "high" as const,
    invoice_id: winner.invoice_id,
    invoice_number: winner.invoice_number,
    score: winner.score,
    breakdown: winner.breakdown,
  };
}
