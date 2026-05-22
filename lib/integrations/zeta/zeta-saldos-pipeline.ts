import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { serializeError } from "@/lib/copilot-structured-logger";
import { createLogger } from "@/lib/observability/logger";
import { sanitizeError, sanitizeLogPayload } from "@/lib/observability/sanitize";
import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import {
  protoCreateInvoice,
  protoUpdateInvoice,
} from "@/lib/copilot-proto-crud-service";
import { reconcileMissingPendingInvoices, type ReconciliationRunResult } from "@/lib/integrations/zeta/zeta-saldos-reconciliation";
import type { ProtoInvoiceInput } from "@/lib/copilot-proto-crud-types";
import {
  insertZetaSyncRawPayload,
  insertZetaSyncRun,
  selectZetaSyncStateByResource,
  updateZetaSyncRunById,
  upsertZetaSyncState,
} from "@/lib/data/zeta-sync-repository";
import type { ZetaSyncRunStatus } from "@/lib/data/zeta-sync-types";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { ZetaHttpError } from "@/lib/integrations/zeta/zeta-http-client";
import {
  ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
  mapSaldoRowsToZetaInvoicesBestEffort,
  queryFacturaClienteSaldosPendientes,
} from "@/lib/integrations/zeta/zeta-factura-cliente";
import { sanitizeZetaInvoiceKeyPart } from "@/lib/integrations/zeta/zeta-customer-vouchers-mapper";
import {
  maybeLogZetaBalanceWriteAfterUpdate,
  shouldLogZetaBalanceWrite,
} from "@/lib/integrations/zeta/zeta-balance-write-diag";
import { zetaLog } from "@/lib/integrations/zeta/zeta-log";
import {
  extractRegistroIdsFromInvoiceZetaMetadata,
  fetchProtoInvoiceZetaMetadata,
  findActiveProtoInvoiceIdByZetaRegistroMetadata,
  invoiceZetaMetadataRegistroConsistentWithExpected,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";
import {
  computeHeuristicSaldoProtoScore,
  extractSerieNumeroFromSaldoSourceRow,
  findBestHeuristicProtoInvoiceForSaldoRow,
  HEURISTIC_THRESHOLD_ACCEPT,
  HEURISTIC_THRESHOLD_MIN_LOG,
  parseCcV1ClienteSegmentFromInvoiceNumber,
  type HeuristicMatchOutcome,
  type ProtoInvoiceHeuristicRow,
} from "@/lib/integrations/zeta/zeta-saldos-heuristic-match";
import {
  ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES,
  type ZetaSaldosPipelineMode,
  type ZetaSaldosPipelineOptions,
  type ZetaSaldosPipelineResult,
} from "@/lib/integrations/zeta/zeta-pipeline-types";
import { normalizeZetaCurrency } from "@/lib/integrations/zeta/zeta-currency-normalize";
import {
  sumOpenInstallmentSaldoForInvoice,
  INSTALLMENT_SALDO_EPSILON,
} from "@/lib/integrations/zeta/zeta-installment-guard";
import {
  fetchOpenCuotaKeysFromZeta,
  prepareInvoiceCloseAfterStaleInstallmentCleanup,
} from "@/lib/integrations/zeta/zeta-stale-installment-cleanup";
import {
  isZetaLegacyShadowInvoiceNumber,
  isZetaSaldosMatchWatchInvoice,
} from "@/lib/integrations/zeta/zeta-invoice-registro-metadata-merge";
import {
  COPILOT_OPERATIONAL_START_DATE,
  isPreOperationalPeriod,
} from "@/lib/copilot-operational-period";
import {
  deriveInvoiceFinancialStatusFromBalance,
  isTerminalInvoiceStatus,
} from "@/lib/integrations/zeta/zeta-invoice-status";
import type { ZetaInvoice } from "@/types/zeta";

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_PAGE_DELAY_MS = 400;
const DEFAULT_OVERLAP_SECONDS = 7 * 24 * 3600;

/** Límite de filas en el cache CCV1 por cliente. Por encima de este valor el cache carga parcial
 *  (las más recientes) y emite warn. En producción un cliente con >5k CCV1 es anómalo. */
const CACHE_MAX_ROWS = 5_000;

/** Tamaño máx. del JSON stringificado en staging (caracteres). Evita filas enormes; mantiene preview + hash. */
const ZETA_RAW_STAGING_MAX_JSON_CHARS = 48_000;

/**
 * Política ZETA-03 — staging raw (`zeta_sync_raw_payloads`):
 * - Objetivo: troubleshooting de contrato/parseo, no data lake ni archivo legal.
 * - No se almacenan credenciales (van en Connection fuera de este payload de negocio).
 * - La respuesta Zeta puede contener datos comerciales/PII; por eso se trunca y se guarda
 *   `preview` + `sha256` del cuerpo completo para correlacionar sin volcar todo el documento.
 */
function buildStagingPayloadJson(raw: unknown): Record<string, unknown> {
  let serialized: string;
  try {
    serialized = JSON.stringify(raw ?? null);
  } catch {
    serialized = JSON.stringify({ _nonSerializable: true });
  }
  const fullDigest = createHash("sha256").update(serialized, "utf8").digest("hex");
  if (serialized.length <= ZETA_RAW_STAGING_MAX_JSON_CHARS) {
    return {
      _staging_policy: "zeta-03-full-under-cap",
      _original_sha256: fullDigest,
      _original_char_length: serialized.length,
      body: raw as Record<string, unknown>,
    };
  }
  return {
    _staging_policy: "zeta-03-truncated",
    _original_sha256: fullDigest,
    _original_char_length: serialized.length,
    _truncated_to: ZETA_RAW_STAGING_MAX_JSON_CHARS,
    preview_json_text: serialized.slice(0, ZETA_RAW_STAGING_MAX_JSON_CHARS),
  };
}

const _pipelineLogger = createLogger({ source: "zeta_pipeline" });

function pipelineEmit(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown>,
  err?: unknown
) {
  const payload = err !== undefined
    ? { ...fields, error: sanitizeError(err) }
    : fields;
  _pipelineLogger[level](message, undefined, payload);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function zetaSaldosDiagEnabled(): boolean {
  const v = (process.env.ZETA_SALDOS_DIAG ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function diagLog(message: string, payload: unknown) {
  if (!zetaSaldosDiagEnabled()) return;
  const extra: Record<string, unknown> =
    payload != null && typeof payload === "object" && !Array.isArray(payload)
      ? sanitizeLogPayload(payload as Record<string, unknown>)
      : { diag_value: payload };
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "debug",
      message,
      source: "zeta_saldos_diag",
      tag: "zeta_saldos_diag",
      ...extra,
    })
  );
}

// ─── Client invoice cache (Q-02) ─────────────────────────────────────────────

type CachedCcv1Invoice = {
  id: string;
  invoice_number: string;
  issue_date: string;
  total_amount: number;
  zeta_metadata: unknown;
};

type ClientInvoiceCache = {
  rows: CachedCcv1Invoice[];
  /** invoice_number → id */
  byNumber: Map<string, string>;
  /** RegistroId → id (extraído de zeta_metadata) */
  byRegistroId: Map<string, string>;
  /** id → zeta_metadata */
  metadataById: Map<string, unknown>;
  /** true si la carga se detuvo al alcanzar CACHE_MAX_ROWS */
  capped: boolean;
};

async function preloadClientZetaInvoiceCache(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string
): Promise<ClientInvoiceCache> {
  const wid = workspaceCompanyId.trim();
  const pageSize = 800;
  const allRows: CachedCcv1Invoice[] = [];
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
    if (error) throw new Error(`preloadClientZetaInvoiceCache: ${error.message}`);
    const rows = (data ?? []) as Array<{
      id?: unknown;
      invoice_number?: unknown;
      issue_date?: unknown;
      total_amount?: unknown;
      zeta_metadata?: unknown;
    }>;
    for (const r of rows) {
      const id = typeof r.id === "string" ? r.id : null;
      const num = typeof r.invoice_number === "string" ? r.invoice_number : null;
      if (!id || !num) continue;
      const totalRaw = r.total_amount;
      const total =
        typeof totalRaw === "number"
          ? totalRaw
          : Number.isFinite(Number(String(totalRaw ?? "").replace(",", ".")))
            ? Number(String(totalRaw).replace(",", "."))
            : 0;
      allRows.push({
        id,
        invoice_number: num,
        issue_date: typeof r.issue_date === "string" ? r.issue_date.slice(0, 10) : "",
        total_amount: total,
        zeta_metadata: r.zeta_metadata ?? null,
      });
    }
    if (rows.length < pageSize) break;
    if (allRows.length >= CACHE_MAX_ROWS) break;
    from += pageSize;
  }

  const capped = allRows.length >= CACHE_MAX_ROWS;

  const byNumber = new Map<string, string>();
  const byRegistroId = new Map<string, string>();
  const metadataById = new Map<string, unknown>();
  for (const inv of allRows) {
    byNumber.set(inv.invoice_number, inv.id);
    metadataById.set(inv.id, inv.zeta_metadata);
    for (const rid of extractRegistroIdsFromInvoiceZetaMetadata(inv.zeta_metadata)) {
      if (!byRegistroId.has(rid)) byRegistroId.set(rid, inv.id);
    }
  }
  return { rows: allRows, byNumber, byRegistroId, metadataById, capped };
}

function findBestHeuristicProtoInvoiceFromCache(
  cache: ClientInvoiceCache,
  inv: ZetaInvoice,
  zetaClienteCodigo: string
): HeuristicMatchOutcome {
  const expectedCli = sanitizeZetaInvoiceKeyPart(zetaClienteCodigo.trim(), 24) || "NCLI";
  const { serie: saldoSerie, numero: saldoNumero } = extractSerieNumeroFromSaldoSourceRow(
    inv.saldoSourceRow ?? null
  );
  if (!saldoNumero && !saldoSerie) return { kind: "none" };

  const saldoIssue = inv.issueDate.slice(0, 10);
  const saldoTotal = inv.totalAmount;

  const candidates: ProtoInvoiceHeuristicRow[] = [];
  for (const r of cache.rows) {
    const cliSegRaw = parseCcV1ClienteSegmentFromInvoiceNumber(r.invoice_number);
    const cliSegNorm = cliSegRaw ? sanitizeZetaInvoiceKeyPart(cliSegRaw, 24) || "NCLI" : null;
    if (!cliSegNorm || cliSegNorm !== expectedCli) continue;
    if (!invoiceZetaMetadataRegistroConsistentWithExpected(r.zeta_metadata, inv.zetaId)) continue;
    candidates.push(r);
  }

  const scored = candidates.map((p) => {
    const { score, breakdown } = computeHeuristicSaldoProtoScore(
      { serie: saldoSerie, numero: saldoNumero, issueYmd: saldoIssue, totalAmount: saldoTotal },
      p
    );
    return { invoice_id: p.id, invoice_number: p.invoice_number, score, breakdown };
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

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee `due_date_source` para decidir si el saldos pipeline puede actualizar
 * `due_date`. ZETA-08 introduce `due_date_source = 'zeta_cuotas_v1'` cuando
 * el pipeline de cuotas migra el sintético al vencimiento REAL — el saldos
 * pipeline NUNCA debe pisarlo con `issue_date + 30`.
 *
 * Devuelve un patch que el caller debe spreadear en el `protoUpdateInvoice`.
 * Si la factura ya tiene `due_date_source = 'zeta_cuotas_v1'`, devuelve `{}`.
 * En cualquier otro caso (null o `synthetic_30d`), devuelve el patch sintético.
 */
async function buildSaldosDueDatePatch(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  invoiceId: string,
  syntheticDueDate: string
): Promise<{ due_date?: string; due_date_source?: "synthetic_30d" }> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("due_date_source")
    .eq("id", invoiceId)
    .eq("workspace_company_id", workspaceCompanyId)
    .maybeSingle();
  if (error) {
    // Defensivo: si no podemos leer, mantenemos el comportamiento legacy
    // (sintético) — preferible que un campo viejo a una factura sin due_date.
    return { due_date: syntheticDueDate, due_date_source: "synthetic_30d" };
  }
  const row = data as { due_date_source?: string | null } | null;
  if (row?.due_date_source === "zeta_cuotas_v1") {
    return {};
  }
  return { due_date: syntheticDueDate, due_date_source: "synthetic_30d" };
}

async function readProtoInvoiceSaldoSnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  invoiceId: string
): Promise<{ balance_amount: number; status: string; invoice_number: string } | null> {
  const wid = workspaceCompanyId.trim();
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("balance_amount, status, invoice_number")
    .eq("id", invoiceId)
    .eq("workspace_company_id", wid)
    .maybeSingle();
  if (error) {
    diagLog("snapshot_read_error", {
      invoice_id: invoiceId,
      message: error.message,
    });
    return null;
  }
  const row = data as {
    balance_amount?: unknown;
    status?: unknown;
    invoice_number?: unknown;
  } | null;
  if (!row || typeof row.invoice_number !== "string") return null;
  const balRaw = row.balance_amount;
  const bal =
    balRaw === null || balRaw === undefined
      ? 0
      : typeof balRaw === "number"
        ? balRaw
        : Number(String(balRaw).replace(",", "."));
  return {
    balance_amount: Number.isFinite(bal) ? bal : 0,
    status: String(row.status ?? "").trim() || "issued",
    invoice_number: row.invoice_number,
  };
}

/** Violación de unicidad PostgreSQL / PostgREST (código estable). */
function isPostgresUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "23505";
}

function fingerprintSaldosPage(clienteCodigo: string, page: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ f: "saldos_pendientes", c: clienteCodigo, p: page }))
    .digest("hex");
}

function addDaysIso(issueYmd: string, days: number): string {
  const d = new Date(`${issueYmd.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolveInvoiceCurrencyCode(inv: ZetaInvoice): string | null {
  const iso = normalizeZetaCurrency(inv.currency);
  if (iso) return iso;
  // currency puede traer el nombre original si normalize no pudo convertirlo
  return null;
}

function zetaInvoiceToProtoInput(inv: ZetaInvoice, syncRunId: string): ProtoInvoiceInput {
  const issue = inv.issueDate.slice(0, 10);
  const bal = inv.outstandingAmount ?? 0;
  const status = deriveInvoiceFinancialStatusFromBalance({ balanceAmount: bal, totalAmount: inv.totalAmount });
  const currencyCode = resolveInvoiceCurrencyCode(inv);
  return {
    company_id: inv.companyId,
    invoice_number: `ZETA:${inv.zetaId}`,
    issue_date: issue,
    due_date: addDaysIso(issue, 30),
    // El saldos pipeline crea facturas con due_date sintético (DIV-CONT-001).
    // El pipeline de cuotas (ZETA-08) lo migrará a 'zeta_cuotas_v1' cuando
    // exista cuota real; mientras tanto, marcamos explícito el origen.
    due_date_source: "synthetic_30d",
    total_amount: inv.totalAmount,
    balance_amount: bal,
    status,
    category: "Zeta / saldos pendientes",
    notes: `sync_run:${syncRunId}`.slice(0, 500),
    ...(currencyCode ? { currency_code: currencyCode } : {}),
  };
}

/** Segmento de cliente en `ZETA:CCV1:{emp|NOSER}:{cli}:…` (misma sanitización que vouchers). */
function parseCcV1ClienteFromInvoiceNumber(invoiceNumber: string): string | null {
  if (!invoiceNumber.startsWith("ZETA:CCV1:")) return null;
  const parts = invoiceNumber.split(":");
  if (parts.length < 4) return null;
  if (parts[2] === "NOSER") return parts[3] ?? null;
  return parts[3] ?? null;
}

/**
 * Tras una corrida **completa** de saldos: facturas `ZETA:CCV1:*` del mismo cliente que **no** vinieron
 * en la respuesta de pendientes quedan sin saldo pendiente → `balance_amount = 0` y `status = paid`.
 * No se alteran comprobantes `cancelled` (anulados en Zeta / CFE).
 */
async function zeroCcV1BalancesWithoutSaldoRow(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string,
  clienteCodigo: string,
  touchedInvoiceIds: Set<string>,
  zetaCtx: { tenantId: string; requestId: string; syncRunId: string } | null
): Promise<number> {
  const wid = workspaceCompanyId.trim();
  const expectedCli = sanitizeZetaInvoiceKeyPart(clienteCodigo, 24) || "NCLI";

  const openCuotaKeysFromZeta =
    zetaCtx != null
      ? await fetchOpenCuotaKeysFromZeta(
          {
            requestId: zetaCtx.requestId,
            tenantId: zetaCtx.tenantId,
            syncRunId: zetaCtx.syncRunId,
          },
          clienteCodigo
        )
      : null;

  const q = applyProtoActiveListFilter(
    supabase
      .from("proto_invoices")
      .select("id, invoice_number, balance_amount, status")
      .eq("workspace_company_id", wid)
      .eq("company_id", protoCompanyId)
      .like("invoice_number", "ZETA:CCV1:%"),
    "active"
  );
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  if (zetaSaldosDiagEnabled()) {
    diagLog("zero_pass_start", {
      cliente_codigo: clienteCodigo,
      total_invoices: (data ?? []).length,
    });
  }

  let cleared = 0;
  for (const raw of data ?? []) {
    const row = raw as {
      id?: string;
      invoice_number?: string;
      balance_amount?: unknown;
      status?: unknown;
    };
    const id = typeof row.id === "string" ? row.id : null;
    const num = typeof row.invoice_number === "string" ? row.invoice_number : "";
    if (!id || !num) continue;
    if (parseCcV1ClienteFromInvoiceNumber(num) !== expectedCli) continue;
    if (touchedInvoiceIds.has(id)) continue;

    const st = String(row.status ?? "").trim().toLowerCase();
    if (isTerminalInvoiceStatus(st)) continue;

    const cur =
      row.balance_amount === null || row.balance_amount === undefined
        ? 0
        : typeof row.balance_amount === "number"
          ? row.balance_amount
          : Number(String(row.balance_amount).replace(",", "."));
    const curBal = Number.isFinite(cur) ? cur : 0;
    const alreadyClosed = Math.abs(curBal) <= 1e-6 && st === "paid";
    if (alreadyClosed) continue;

    const { installmentSaldo, cleanup } =
      await prepareInvoiceCloseAfterStaleInstallmentCleanup(supabase, {
        workspaceCompanyId: wid,
        invoiceId: id,
        invoiceNumber: num,
        clienteCodigo,
        touchedInvoiceIds,
        openCuotaKeysFromZeta,
        syncRunId: zetaCtx?.syncRunId,
      });

    if (installmentSaldo === null || installmentSaldo > INSTALLMENT_SALDO_EPSILON) {
      pipelineEmit(
        "warn",
        cleanup.blocked_by_open_zeta_cuota
          ? "zero_pass_blocked_by_open_zeta_cuota"
          : "zero_pass_blocked_by_installments",
        {
          invoice_id: id,
          invoice_number: num,
          installment_saldo: installmentSaldo,
          workspace_company_id: wid,
          stale_installments_closed: cleanup.closed_count,
          cuotas_fetch_unavailable: cleanup.cuotas_fetch_unavailable,
        }
      );
      continue;
    }

    if (zetaSaldosDiagEnabled()) {
      diagLog("before_update", {
        invoice_id: id,
        prev_balance: curBal,
        prev_status: st,
      });
    }

    const up = await protoUpdateInvoice(
      supabase,
      id,
      {
        balance_amount: 0,
        status: "paid",
      },
      wid,
      { allowBalanceGtTotal: true }
    );
    if (!up.ok) throw new Error(up.message);
    await maybeLogZetaBalanceWriteAfterUpdate(supabase, wid, id, num, {
      source: "saldos_zero_pass",
      writer_process: "zeroCcV1BalancesWithoutSaldoRow",
      balance_payload: 0,
      beforeSnap: { balance_amount: curBal, status: st, invoice_number: num },
      up,
    });
    if (zetaSaldosDiagEnabled()) {
      diagLog("zero_pass_applied", {
        invoice_id: id,
        invoice_number: num,
      });
      diagLog("after_update", {
        invoice_id: id,
        new_balance: 0,
        new_status: "paid",
      });
    }
    cleared += 1;
  }
  return cleared;
}

/**
 * Alinea el status de facturas que tienen balance_amount = 0 pero status != "paid".
 * Cubre formatos CCV1 y legacy (ZETA:{id}) que no fueron alcanzados por el zero pass.
 * Solo toca facturas activas para el cliente dado; nunca toca statuses terminales.
 *
 * Se llama únicamente cuando stopped === "completed" (corrida completa).
 */
async function alignZeroBalanceStatuses(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string,
  touchedInvoiceIds: Set<string>
): Promise<number> {
  const wid = workspaceCompanyId.trim();

  const q = applyProtoActiveListFilter(
    supabase
      .from("proto_invoices")
      .select("id, invoice_number, status")
      .eq("workspace_company_id", wid)
      .eq("company_id", protoCompanyId)
      .eq("balance_amount", 0),
    "active"
  );
  const { data, error } = await q;
  if (error) throw new Error(`alignZeroBalanceStatuses: ${error.message}`);

  let aligned = 0;
  for (const raw of data ?? []) {
    const row = raw as { id?: string; invoice_number?: string; status?: string };
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    if (touchedInvoiceIds.has(id)) continue;

    const st = String(row.status ?? "").trim().toLowerCase();
    if (st === "paid") continue;
    if (isTerminalInvoiceStatus(st)) continue;

    const up = await protoUpdateInvoice(supabase, id, { status: "paid" }, wid, {});
    if (!up.ok) continue;
    aligned++;
  }
  return aligned;
}

async function findActiveInvoiceIdByZetaNumber(
  supabase: SupabaseClient,
  protoCompanyId: string,
  invoiceNumber: string,
  workspaceCompanyId: string
): Promise<string | null> {
  const wid = workspaceCompanyId.trim();
  const q = applyProtoActiveListFilter(
    supabase
      .from("proto_invoices")
      .select("id")
      .eq("company_id", protoCompanyId)
      .eq("invoice_number", invoiceNumber)
      .eq("workspace_company_id", wid),
    "active"
  );
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  const id = data && typeof (data as { id?: string }).id === "string" ? (data as { id: string }).id : null;
  return id;
}

/**
 * Persiste saldo desde `RESTFacturaClienteV4QuerySaldosPendientes`:
 * 1) `RegistroId` de la fila Zeta vs `zeta_metadata` (bloque `zeta_comprobante_identity_v1`, luego voucher v1 / raw).
 * 2) Match por `invoice_number` = `ccv1InvoiceNumber` solo si la metadata persistida no contradice ese `RegistroId`.
 * 3) Match heurístico (Serie/Numero/Total/Fecha) con umbrales y anti-ambigüedad; solo si (1) y (2) fallan.
 * 4) Upsert / update legacy `invoice_number = ZETA:{RegistroId}`.
 */
async function persistZetaInvoice(
  supabase: SupabaseClient,
  inv: ZetaInvoice,
  syncRunId: string,
  requestId: string,
  seenInRun: Set<string>,
  workspaceCompanyId: string,
  touchedInvoiceIds: Set<string>,
  zetaClienteCodigo: string,
  invoiceCache?: ClientInvoiceCache
): Promise<"insert" | "update" | "skip"> {
  const key = inv.zetaId;
  if (!key || seenInRun.has(key)) return "skip";
  seenInRun.add(key);

  // Hard cutoff: no persistir ni actualizar datos pre-operacionales
  const issueYmd = inv.issueDate.slice(0, 10);
  if (isPreOperationalPeriod(issueYmd)) {
    pipelineEmit("info", "zeta_saldos_skip_pre_operational", {
      request_id: requestId,
      sync_run_id: syncRunId,
      tenant_id: workspaceCompanyId,
      zeta_registro_id: key,
      issue_date: issueYmd,
      operational_cutoff: COPILOT_OPERATIONAL_START_DATE,
      reason: "pre_operational_cutoff",
    });
    return "skip";
  }

  const wid = workspaceCompanyId.trim();
  const bal = inv.outstandingAmount ?? 0;
  const status = deriveInvoiceFinancialStatusFromBalance({ balanceAmount: bal, totalAmount: inv.totalAmount });
  const diagOn = zetaSaldosDiagEnabled();
  const currencyCode = resolveInvoiceCurrencyCode(inv);

  const ccv1 = inv.ccv1InvoiceNumber?.trim() ?? null;

  if (diagOn) {
    diagLog("ccv1_computed", {
      ccv1_from_saldos: ccv1,
      zeta_registro_id: inv.zetaId,
    });
    diagLog("lookup_start", {
      ccv1,
      zeta_registro_id: inv.zetaId,
    });
  }

  let regHit: { id: string; matched_path: string } | null = null;
  if (invoiceCache) {
    const cachedId = invoiceCache.byRegistroId.get(inv.zetaId);
    if (cachedId) regHit = { id: cachedId, matched_path: "cache:byRegistroId" };
  } else {
    regHit = await findActiveProtoInvoiceIdByZetaRegistroMetadata(
      supabase,
      wid,
      inv.companyId,
      inv.zetaId,
      {
        onFilterError(path, message) {
          pipelineEmit("warn", "zeta_saldos_registro_metadata_lookup", { path, message });
        },
      }
    );
  }
  if (diagOn) {
    diagLog("lookup_by_registro_id", {
      found: Boolean(regHit?.id),
      invoice_id: regHit?.id ?? null,
      matched_path: regHit?.matched_path ?? null,
    });
  }
  if (regHit) {
    const invNumRegEarly = ccv1 ?? `ZETA:${inv.zetaId}`;
    const needSnap = diagOn || shouldLogZetaBalanceWrite(invNumRegEarly);
    const prev = needSnap ? await readProtoInvoiceSaldoSnapshot(supabase, wid, regHit.id) : null;
    if (diagOn) {
      diagLog("before_update", {
        invoice_id: regHit.id,
        prev_balance: prev?.balance_amount ?? null,
        prev_status: prev?.status ?? null,
      });
    }
    const up = await protoUpdateInvoice(
      supabase,
      regHit.id,
      {
        balance_amount: bal,
        status,
        ...(currencyCode ? { currency_code: currencyCode } : {}),
      },
      wid,
      { allowBalanceGtTotal: true }
    );
    if (!up.ok) throw new Error(up.message);
    const invNumReg = prev?.invoice_number ?? ccv1 ?? `ZETA:${inv.zetaId}`;
    await maybeLogZetaBalanceWriteAfterUpdate(supabase, wid, regHit.id, invNumReg, {
      source: "saldos",
      writer_process: "zeta_saldos_persist_registro",
      balance_payload: bal,
      beforeSnap: prev
        ? { balance_amount: prev.balance_amount, status: prev.status, invoice_number: invNumReg }
        : null,
      up,
      zeta_registro_id: inv.zetaId,
    });
    if (diagOn) {
      diagLog("after_update", {
        invoice_id: regHit.id,
        new_balance: bal,
        new_status: status,
      });
    }
    touchedInvoiceIds.add(regHit.id);
    return "update";
  }

  if (ccv1) {
    const ccv1Id = invoiceCache
      ? (invoiceCache.byNumber.get(ccv1) ?? null)
      : await findActiveInvoiceIdByZetaNumber(supabase, inv.companyId, ccv1, wid);
    if (diagOn) {
      diagLog("lookup_by_invoice_number", {
        found: Boolean(ccv1Id),
        invoice_id: ccv1Id ?? null,
      });
    }
    let ccv1Target = ccv1Id;
    if (ccv1Target) {
      const meta = invoiceCache
        ? invoiceCache.metadataById.get(ccv1Target)
        : await fetchProtoInvoiceZetaMetadata(supabase, wid, ccv1Target);
      if (!invoiceZetaMetadataRegistroConsistentWithExpected(meta, inv.zetaId)) {
        pipelineEmit("warn", "zeta_saldos_ccv1_match_rejected_registro_mismatch", {
          zeta_registro_id_expected: inv.zetaId,
          invoice_id: ccv1Target,
          invoice_number_ccv1: ccv1,
        });
        ccv1Target = null;
      }
    }
    if (ccv1Target) {
      const needSnapCcv1 = diagOn || shouldLogZetaBalanceWrite(ccv1);
      const prev = needSnapCcv1
        ? await readProtoInvoiceSaldoSnapshot(supabase, wid, ccv1Target)
        : null;
      if (diagOn) {
        diagLog("before_update", {
          invoice_id: ccv1Target,
          prev_balance: prev?.balance_amount ?? null,
          prev_status: prev?.status ?? null,
        });
      }
      const up = await protoUpdateInvoice(
        supabase,
        ccv1Target,
        {
          balance_amount: bal,
          status,
          ...(currencyCode ? { currency_code: currencyCode } : {}),
        },
        wid,
        { allowBalanceGtTotal: true }
      );
      if (!up.ok) throw new Error(up.message);
      await maybeLogZetaBalanceWriteAfterUpdate(supabase, wid, ccv1Target, ccv1, {
        source: "saldos",
        writer_process: "zeta_saldos_persist_ccv1",
        balance_payload: bal,
        beforeSnap: prev
          ? { balance_amount: prev.balance_amount, status: prev.status, invoice_number: ccv1 }
          : null,
        up,
        zeta_registro_id: inv.zetaId,
      });
      if (diagOn) {
        diagLog("after_update", {
          invoice_id: ccv1Target,
          new_balance: bal,
          new_status: status,
        });
      }
      touchedInvoiceIds.add(ccv1Target);
      return "update";
    }
  }

  const heuristicOutcome = invoiceCache
    ? findBestHeuristicProtoInvoiceFromCache(invoiceCache, inv, zetaClienteCodigo)
    : await findBestHeuristicProtoInvoiceForSaldoRow(supabase, wid, inv.companyId, inv, zetaClienteCodigo.trim());
  const { serie: logSaldoSerie, numero: logSaldoNumero } = extractSerieNumeroFromSaldoSourceRow(
    inv.saldoSourceRow ?? null
  );

  if (heuristicOutcome.kind === "applied") {
    const metaHeur = invoiceCache
      ? invoiceCache.metadataById.get(heuristicOutcome.invoice_id)
      : await fetchProtoInvoiceZetaMetadata(supabase, wid, heuristicOutcome.invoice_id);
    if (!invoiceZetaMetadataRegistroConsistentWithExpected(metaHeur, inv.zetaId)) {
      pipelineEmit("warn", "zeta_heuristic_match_rejected_low_score", {
        request_id: requestId,
        sync_run_id: syncRunId,
        tenant_id: wid,
        zeta_registro_id: inv.zetaId,
        invoice_id: heuristicOutcome.invoice_id,
        invoice_number: heuristicOutcome.invoice_number,
        score: heuristicOutcome.score,
        breakdown: heuristicOutcome.breakdown,
        subreason: "metadata_contradiction_after_heuristic_score",
        saldo_serie: logSaldoSerie,
        saldo_numero: logSaldoNumero,
        ccv1_computed: ccv1,
      });
    } else {
      pipelineEmit("info", "zeta_heuristic_match_applied", {
        request_id: requestId,
        sync_run_id: syncRunId,
        tenant_id: wid,
        zeta_registro_id: inv.zetaId,
        invoice_id: heuristicOutcome.invoice_id,
        invoice_number: heuristicOutcome.invoice_number,
        score: heuristicOutcome.score,
        confidence: heuristicOutcome.confidence,
        breakdown: heuristicOutcome.breakdown,
        saldo_serie: logSaldoSerie,
        saldo_numero: logSaldoNumero,
        ccv1_computed: ccv1,
        total_amount_saldo: inv.totalAmount,
        issue_date_saldo: inv.issueDate,
        match_tier: "heuristic_controlado",
      });
      const needSnapHeur =
        diagOn || shouldLogZetaBalanceWrite(heuristicOutcome.invoice_number);
      const prevHeur = needSnapHeur
        ? await readProtoInvoiceSaldoSnapshot(supabase, wid, heuristicOutcome.invoice_id)
        : null;
      if (diagOn) {
        diagLog("before_update", {
          invoice_id: heuristicOutcome.invoice_id,
          prev_balance: prevHeur?.balance_amount ?? null,
          prev_status: prevHeur?.status ?? null,
          match: "heuristic",
        });
      }
      const upHeur = await protoUpdateInvoice(
        supabase,
        heuristicOutcome.invoice_id,
        {
          balance_amount: bal,
          status,
          ...(currencyCode ? { currency_code: currencyCode } : {}),
        },
        wid,
        { allowBalanceGtTotal: true }
      );
      if (!upHeur.ok) throw new Error(upHeur.message);
      await maybeLogZetaBalanceWriteAfterUpdate(
        supabase,
        wid,
        heuristicOutcome.invoice_id,
        heuristicOutcome.invoice_number,
        {
          source: "saldos",
          writer_process: "zeta_saldos_persist_heuristic",
          balance_payload: bal,
          beforeSnap: prevHeur
            ? {
                balance_amount: prevHeur.balance_amount,
                status: prevHeur.status,
                invoice_number: heuristicOutcome.invoice_number,
              }
            : null,
          up: upHeur,
          zeta_registro_id: inv.zetaId,
        }
      );
      if (diagOn) {
        diagLog("after_update", {
          invoice_id: heuristicOutcome.invoice_id,
          new_balance: bal,
          new_status: status,
        });
      }
      touchedInvoiceIds.add(heuristicOutcome.invoice_id);
      return "update";
    }
  } else if (heuristicOutcome.kind === "ambiguous") {
    pipelineEmit("warn", "zeta_heuristic_match_ambiguous", {
      request_id: requestId,
      sync_run_id: syncRunId,
      tenant_id: wid,
      zeta_registro_id: inv.zetaId,
      top_candidates: heuristicOutcome.top,
      saldo_serie: logSaldoSerie,
      saldo_numero: logSaldoNumero,
      ccv1_computed: ccv1,
      total_amount_saldo: inv.totalAmount,
      issue_date_saldo: inv.issueDate,
    });
  } else if (heuristicOutcome.kind === "rejected_low_score") {
    pipelineEmit("warn", "zeta_heuristic_match_rejected_low_score", {
      request_id: requestId,
      sync_run_id: syncRunId,
      tenant_id: wid,
      zeta_registro_id: inv.zetaId,
      best_score: heuristicOutcome.best_score,
      best_invoice_id: heuristicOutcome.best_invoice_id,
      score_band: heuristicOutcome.band,
      confidence: heuristicOutcome.confidence,
      saldo_serie: logSaldoSerie,
      saldo_numero: logSaldoNumero,
      ccv1_computed: ccv1,
      total_amount_saldo: inv.totalAmount,
      issue_date_saldo: inv.issueDate,
    });
  }

  const input = zetaInvoiceToProtoInput(inv, syncRunId);
  if (
    isZetaSaldosMatchWatchInvoice(input.invoice_number) &&
    isZetaLegacyShadowInvoiceNumber(input.invoice_number)
  ) {
    pipelineEmit("warn", "zeta_saldos_legacy_shadow_balance_write", {
      request_id: requestId,
      sync_run_id: syncRunId,
      tenant_id: wid,
      zeta_registro_id: inv.zetaId,
      legacy_invoice_number: input.invoice_number,
      balance_payload: bal,
      ccv1_expected: inv.ccv1InvoiceNumber ?? null,
    });
  }
  pipelineEmit("info", "zeta_saldos_legacy_path", {
    request_id: requestId,
    sync_run_id: syncRunId,
    tenant_id: wid,
    zeta_registro_id: inv.zetaId,
    legacy_invoice_number: input.invoice_number,
    ccv1_computed: ccv1 ?? null,
    cache_active: invoiceCache != null,
  });

  const existingLegacy = await findActiveInvoiceIdByZetaNumber(
    supabase,
    inv.companyId,
    input.invoice_number,
    wid
  );
  if (existingLegacy) {
    const needSnapLegacy = diagOn || shouldLogZetaBalanceWrite(input.invoice_number);
    const prev = needSnapLegacy
      ? await readProtoInvoiceSaldoSnapshot(supabase, wid, existingLegacy)
      : null;
    if (diagOn) {
      diagLog("before_update", {
        invoice_id: existingLegacy,
        prev_balance: prev?.balance_amount ?? null,
        prev_status: prev?.status ?? null,
      });
    }
    const dueDatePatch = await buildSaldosDueDatePatch(
      supabase,
      wid,
      existingLegacy,
      input.due_date
    );
    const up = await protoUpdateInvoice(
      supabase,
      existingLegacy,
      {
        issue_date: input.issue_date,
        ...dueDatePatch,
        total_amount: input.total_amount,
        balance_amount: input.balance_amount,
        status: input.status,
        category: input.category,
        notes: input.notes,
        ...(input.currency_code ? { currency_code: input.currency_code } : {}),
      },
      wid,
      { allowBalanceGtTotal: true }
    );
    if (!up.ok) throw new Error(up.message);
    await maybeLogZetaBalanceWriteAfterUpdate(
      supabase,
      wid,
      existingLegacy,
      input.invoice_number,
      {
        source: "saldos",
        writer_process: "zeta_saldos_persist_legacy",
        balance_payload: bal,
        beforeSnap: prev
          ? {
              balance_amount: prev.balance_amount,
              status: prev.status,
              invoice_number: input.invoice_number,
            }
          : null,
        up,
        zeta_registro_id: inv.zetaId,
      }
    );
    if (diagOn) {
      diagLog("after_update", {
        invoice_id: existingLegacy,
        new_balance: input.balance_amount,
        new_status: input.status,
      });
    }
    touchedInvoiceIds.add(existingLegacy);
    return "update";
  }
  const cr = await protoCreateInvoice(supabase, input, wid, { allowBalanceGtTotal: true });
  if (cr.ok) {
    const created = cr.data as { id?: string } | undefined;
    if (created && typeof created.id === "string") touchedInvoiceIds.add(created.id);
    if (diagOn && created?.id) {
      diagLog("after_update", {
        invoice_id: created.id,
        new_balance: input.balance_amount,
        new_status: input.status,
      });
    }
    return "insert";
  }
  if (cr.code === "DATABASE") {
    const again = await findActiveInvoiceIdByZetaNumber(
      supabase,
      inv.companyId,
      input.invoice_number,
      wid
    );
    if (again) {
      const needSnapRetry = diagOn || shouldLogZetaBalanceWrite(input.invoice_number);
      const prev = needSnapRetry
        ? await readProtoInvoiceSaldoSnapshot(supabase, wid, again)
        : null;
      if (diagOn) {
        diagLog("before_update", {
          invoice_id: again,
          prev_balance: prev?.balance_amount ?? null,
          prev_status: prev?.status ?? null,
        });
      }
      const dueDatePatch = await buildSaldosDueDatePatch(
        supabase,
        wid,
        again,
        input.due_date
      );
      const up2 = await protoUpdateInvoice(
        supabase,
        again,
        {
          issue_date: input.issue_date,
          ...dueDatePatch,
          total_amount: input.total_amount,
          balance_amount: input.balance_amount,
          status: input.status,
          category: input.category,
          notes: input.notes,
          ...(input.currency_code ? { currency_code: input.currency_code } : {}),
        },
        wid,
        { allowBalanceGtTotal: true }
      );
      if (!up2.ok) throw new Error(up2.message);
      await maybeLogZetaBalanceWriteAfterUpdate(
        supabase,
        wid,
        again,
        input.invoice_number,
        {
          source: "saldos",
          writer_process: "zeta_saldos_persist_legacy_retry",
          balance_payload: bal,
          beforeSnap: prev
            ? {
                balance_amount: prev.balance_amount,
                status: prev.status,
                invoice_number: input.invoice_number,
              }
            : null,
          up: up2,
          zeta_registro_id: inv.zetaId,
        }
      );
      if (diagOn) {
        diagLog("after_update", {
          invoice_id: again,
          new_balance: input.balance_amount,
          new_status: input.status,
        });
      }
      touchedInvoiceIds.add(again);
      return "update";
    }
  }
  throw new Error(cr.message);
}

function resolveStartPage(
  watermark: string | undefined,
  mode: ZetaSaldosPipelineOptions["mode"],
  bootstrapCompleted: boolean
): number {
  if (!watermark || !watermark.trim()) return 1;
  const p = parseInt(watermark.trim(), 10);
  if (!Number.isFinite(p) || p < 1) return 1;
  if (mode === "bootstrap" && !bootstrapCompleted) return p;
  return 1;
}

/**
 * `zero pass` marca CCV1 no listadas como pagadas (saldo 0). Solo si la corrida terminó bien
 * y hay evidencia suficiente de que el vacío de Zeta es interpretable con seguridad.
 *
 * - **(a)** Hubo al menos una fila normalizada o un upsert distinto de `skip` en la corrida.
 * - **(b)** Última página con `IsLastPage` y `Response` **array JSON** vacío (`responseExplicitArray`
 *   y 0 filas): el contrato devolvió lista explícita `[]`, no un `[]` “sintético” por `Response` ausente.
 */
/** @internal exported for testing only */
export function canApplyZeroPass(params: {
  stopped: ZetaSaldosPipelineResult["stopped_reason"];
  pagesFetched: number;
  rowsNormalized: number;
  rowsUpserted: number;
  lastPageReliableEmptyNoRows: boolean;
}): boolean {
  if (params.stopped !== "completed") return false;
  if (params.pagesFetched < 1) return false;
  if (params.rowsNormalized > 0 || params.rowsUpserted > 0) return true;
  return params.lastPageReliableEmptyNoRows === true;
}

/**
 * Orquesta import por ventanas acotadas (paginación) sobre `RESTFacturaClienteV4QuerySaldosPendientes`.
 * Solo para jobs / rutas server-side; no exponer como backend interactivo de UI.
 */
export async function runZetaSaldosPendientesPipeline(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  requestId: string,
  opts: ZetaSaldosPipelineOptions
): Promise<ZetaSaldosPipelineResult> {
  const wid = tenantCompanyId.trim();
  if (!wid) {
    throw new Error("tenantCompanyId es obligatorio para el pipeline Zeta (service_role / workspace).");
  }

  const syncMode = opts.syncMode ?? "incremental";
  // reconciliation_cleanup forces a full bootstrap to get the complete picture
  const effectiveMode: ZetaSaldosPipelineMode = syncMode === "reconciliation_cleanup" ? "bootstrap" : opts.mode;
  const maxPages = opts.maxPagesPerRun ?? DEFAULT_MAX_PAGES;
  const pageDelayMs = opts.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS;
  const overlapSec = opts.overlapSeconds ?? DEFAULT_OVERLAP_SECONDS;
  const flow = ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES;
  let reconciliationResult: ReconciliationRunResult | null = null;

  const { data: clientRow, error: clientErr } = await supabase
    .from("proto_companies")
    .select("id")
    .eq("id", opts.protoCompanyId)
    .eq("workspace_company_id", wid)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!clientRow) {
    throw new Error("Cliente proto inexistente o fuera del workspace.");
  }

  const stateRow = await selectZetaSyncStateByResource(supabase, flow, wid);
  const bootstrapCompleted = stateRow?.bootstrap_completed ?? false;
  const previousWatermark = (stateRow?.watermark?.trim() || "1") || "1";
  const startPage = resolveStartPage(stateRow?.watermark, effectiveMode, bootstrapCompleted);

  const t1 = new Date();
  const t0 = new Date(t1.getTime() - overlapSec * 1000);

  let runId: string | null = null;
  let pagesFetched = 0;
  let rowsNormalized = 0;
  let rowsUpserted = 0;
  let stopped: ZetaSaldosPipelineResult["stopped_reason"] = "aborted";
  let errorSummary: string | undefined;
  /** Hubo al menos una página Zeta OK + persistencias completas (avance real de paginación). */
  let madePaginationProgress = false;
  /** Siguiente página a pedir en la próxima corrida; solo válido si `madePaginationProgress` o completed. */
  let watermarkAfterProgress: string | null = null;
  const seenInRun = new Set<string>();
  /** Facturas `proto_invoices` a las que ya se aplicó saldo en esta corrida (CCV1 o legacy). */
  const touchedInvoiceIds = new Set<string>();
  /**
   * Solo en la página que cierra con `IsLastPage`: 0 filas y `Response` fue array JSON
   * (p. ej. `[]` contractual). Ver `canApplyZeroPass` / `parseQuerySaldosPendientesOut`.
   */
  let lastPageReliableEmptyNoRows = false;

  let nextPage = startPage;
  const pageIterations = Math.max(1, maxPages);

  try {
    diagLog("sync_start", {
      proto_company_id: opts.protoCompanyId,
      cliente_codigo: opts.clienteCodigo,
      workspace_company_id: wid,
    });

    const { id } = await insertZetaSyncRun(supabase, {
      resource_flow: flow,
      sync_mode: effectiveMode,
      status: "running",
      overlap_from: t0.toISOString(),
      overlap_to: t1.toISOString(),
      idempotency_key: opts.idempotencyKey ?? null,
      company_id: wid,
    });
    runId = id;
    const syncRunId = runId;

    await upsertZetaSyncState(supabase, {
      resource_flow: flow,
      company_id: wid,
      last_run_id: syncRunId,
      overlap_seconds: overlapSec,
      watermark_type: "page",
      preserve_watermark: true,
    });

    const zetaCtx: ZetaCallContext = {
      requestId,
      tenantId: tenantCompanyId,
      syncRunId: syncRunId,
    };

    pipelineEmit("info", "zeta_saldos_pipeline_start", {
      request_id: requestId,
      sync_run_id: syncRunId,
      tenant_id: tenantCompanyId,
      resource_flow: flow,
      mode: effectiveMode,
      sync_mode: syncMode,
      start_page: startPage,
      max_pages_per_run: maxPages,
      previous_watermark: previousWatermark,
    });

    let invoiceCache: ClientInvoiceCache | undefined;
    try {
      invoiceCache = await preloadClientZetaInvoiceCache(supabase, wid, opts.protoCompanyId);
      pipelineEmit(
        invoiceCache.capped ? "warn" : "info",
        invoiceCache.capped ? "zeta_saldos_cache_capped" : "zeta_saldos_cache_loaded",
        {
          request_id: requestId,
          sync_run_id: syncRunId,
          proto_company_id: opts.protoCompanyId,
          ccv1_invoices_cached: invoiceCache.rows.length,
          registro_ids_indexed: invoiceCache.byRegistroId.size,
          cache_max_rows: CACHE_MAX_ROWS,
          capped: invoiceCache.capped,
        }
      );
    } catch (cacheErr) {
      pipelineEmit("warn", "zeta_saldos_cache_load_failed", {
        request_id: requestId,
        sync_run_id: syncRunId,
        proto_company_id: opts.protoCompanyId,
      }, cacheErr);
      invoiceCache = undefined;
    }

    for (let i = 0; i < pageIterations; i++) {
      if (i > 0) await sleep(pageDelayMs);

      const pageStr = String(nextPage);
      let zetaResult;
      try {
        zetaResult = await queryFacturaClienteSaldosPendientes(
          zetaCtx,
          { clienteCodigo: opts.clienteCodigo, page: pageStr }
        );
      } catch (e) {
        stopped = "zeta_error";
        errorSummary =
          e instanceof ZetaHttpError ? `${e.code} HTTP ${e.httpStatus}` : "Error HTTP Zeta";
        zetaLog.error(
          "zeta_pipeline_page_http",
          {
            request_id: requestId,
            zeta_method: ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
            tenant_id: tenantCompanyId,
            sync_run_id: syncRunId,
            zeta_attempt: i + 1,
            zeta_error_message: errorSummary,
          },
          e
        );
        if (madePaginationProgress) {
          watermarkAfterProgress = String(nextPage);
        }
        break;
      }

      try {
        await insertZetaSyncRawPayload(supabase, {
          sync_run_id: syncRunId,
          resource_flow: flow,
          chunk_index: nextPage,
          zeta_operation: ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
          http_status: 200,
          payload_json: buildStagingPayloadJson(zetaResult.raw ?? {}),
          request_fingerprint: fingerprintSaldosPage(opts.clienteCodigo, pageStr),
        });
      } catch (rawErr) {
        if (isPostgresUniqueViolation(rawErr)) {
          pipelineEmit("warn", "zeta_raw_chunk_duplicate_skipped", {
            request_id: requestId,
            sync_run_id: syncRunId,
            page: pageStr,
            pg_code: "23505",
          });
        } else {
          throw rawErr;
        }
      }

      if (!zetaResult.succeed) {
        stopped = "zeta_error";
        errorSummary = "QuerySaldosPendientesOut succeed=false";
        zetaLog.warn("zeta_pipeline_business_fail", {
          request_id: requestId,
          zeta_method: ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
          tenant_id: tenantCompanyId,
          sync_run_id: syncRunId,
          zeta_attempt: i + 1,
          zeta_succeed: false,
        });
        if (madePaginationProgress) {
          watermarkAfterProgress = String(nextPage);
        }
        break;
      }

      const normalized = mapSaldoRowsToZetaInvoicesBestEffort(opts.protoCompanyId, zetaResult.rows);
      rowsNormalized += normalized.length;

      for (let idx = 0; idx < normalized.length; idx++) {
        const inv = normalized[idx]!;
        if (zetaSaldosDiagEnabled()) {
          const row = zetaResult.rows[idx] as Record<string, unknown> | undefined;
          diagLog("saldo_row_received", {
            zeta_registro_id: row?.RegistroId ?? row?.registroId,
            saldo: row?.Saldo ?? row?.saldo,
            total: row?.Total ?? row?.total,
            cliente_codigo: row?.ClienteCodigo ?? row?.clienteCodigo,
          });
        }
        try {
          const r = await persistZetaInvoice(
            supabase,
            inv,
            syncRunId,
            requestId,
            seenInRun,
            wid,
            touchedInvoiceIds,
            opts.clienteCodigo,
            invoiceCache
          );
          if (r !== "skip") rowsUpserted += 1;
        } catch (pe) {
          stopped = "persist_error";
          errorSummary = pe instanceof Error ? pe.message.slice(0, 500) : "persist_error";
          pipelineEmit(
            "error",
            "zeta_pipeline_persist_failed",
            {
              request_id: requestId,
              sync_run_id: syncRunId,
              tenant_id: tenantCompanyId,
              zeta_id: inv.zetaId,
            },
            pe
          );
          if (madePaginationProgress) {
            watermarkAfterProgress = String(nextPage);
          }
          throw pe;
        }
      }

      pagesFetched += 1;
      madePaginationProgress = true;

      pipelineEmit("info", "zeta_saldos_page_ok", {
        request_id: requestId,
        sync_run_id: syncRunId,
        tenant_id: tenantCompanyId,
        page: pageStr,
        row_count: zetaResult.rows.length,
        is_last_page: zetaResult.isLastPage === true,
      });

      if (zetaResult.isLastPage === true) {
        lastPageReliableEmptyNoRows =
          zetaResult.rows.length === 0 && zetaResult.responseExplicitArray === true;
        watermarkAfterProgress = "1";
        stopped = "completed";
        break;
      }

      nextPage += 1;
      watermarkAfterProgress = String(nextPage);

      if (i === pageIterations - 1) {
        stopped = "max_pages";
        break;
      }
    }

    if (stopped === "completed") {
      const applyZeroPass = canApplyZeroPass({
        stopped,
        pagesFetched,
        rowsNormalized,
        rowsUpserted,
        lastPageReliableEmptyNoRows,
      });
      if (applyZeroPass) {
        const cleared = await zeroCcV1BalancesWithoutSaldoRow(
          supabase,
          wid,
          opts.protoCompanyId,
          opts.clienteCodigo,
          touchedInvoiceIds,
          runId
            ? {
                tenantId: tenantCompanyId,
                requestId,
                syncRunId: runId,
              }
            : null
        );
        pipelineEmit("info", "zeta_saldos_ccv1_zeroed_unlisted", {
          request_id: requestId,
          sync_run_id: runId,
          tenant_id: tenantCompanyId,
          cleared_count: cleared,
        });

        // Alinear status de facturas con balance=0 que no son CCV1 (formato legacy
        // ZETA:{id}) o que el zero pass no alcanzó. Protege statuses terminales.
        try {
          const aligned = await alignZeroBalanceStatuses(
            supabase,
            wid,
            opts.protoCompanyId,
            touchedInvoiceIds
          );
          if (aligned > 0) {
            pipelineEmit("info", "zeta_saldos_zero_balance_statuses_aligned", {
              request_id: requestId,
              sync_run_id: runId,
              tenant_id: tenantCompanyId,
              aligned_count: aligned,
            });
          }
        } catch (alignErr) {
          pipelineEmit("warn", "zeta_saldos_align_zero_balance_error", {
            request_id: requestId,
            sync_run_id: runId,
            tenant_id: tenantCompanyId,
          }, alignErr);
        }
      } else {
        const skipReason =
          pagesFetched < 1
            ? "no_pages_fetched"
            : "zero_rows_without_explicit_empty_response_array_on_last_page";
        pipelineEmit("warn", "zeta_saldos_zero_pass_skipped_safe_guard", {
          request_id: requestId,
          sync_run_id: runId,
          tenant_id: tenantCompanyId,
          cliente_codigo: opts.clienteCodigo,
          stopped_reason: stopped,
          pages_fetched: pagesFetched,
          rows_normalized: rowsNormalized,
          rows_upserted: rowsUpserted,
          last_page_reliable_empty_no_rows: lastPageReliableEmptyNoRows,
          skip_reason: skipReason,
        });
        diagLog("zero_pass_skipped_safe_guard", {
          request_id: requestId,
          sync_run_id: runId,
          tenant_id: tenantCompanyId,
          cliente_codigo: opts.clienteCodigo,
          stopped_reason: stopped,
          pages_fetched: pagesFetched,
          rows_normalized: rowsNormalized,
          rows_upserted: rowsUpserted,
          last_page_reliable_empty_no_rows: lastPageReliableEmptyNoRows,
          skip_reason: skipReason,
        });
      }

      // Orphan reconciliation — only when full bootstrap completed (all pages seen)
      const shouldReconcile =
        syncMode === "reconciliation_cleanup" ||
        (effectiveMode === "bootstrap" && pagesFetched >= 1);
      if (shouldReconcile && runId) {
        try {
          reconciliationResult = await reconcileMissingPendingInvoices(
            supabase,
            wid,
            opts.protoCompanyId,
            touchedInvoiceIds,
            {
              syncRunId: runId,
              requestId,
              clienteCodigo: opts.clienteCodigo,
              tenantId: tenantCompanyId,
            }
          );
        } catch (recErr) {
          pipelineEmit("warn", "zeta_reconcile_unexpected_error", {
            request_id: requestId,
            sync_run_id: runId,
            tenant_id: tenantCompanyId,
          }, recErr);
        }
      }
    }
  } catch (e) {
    if (!errorSummary) {
      errorSummary = e instanceof Error ? e.message.slice(0, 500) : String(e);
    }
    if (stopped === "aborted") {
      pipelineEmit(
        "error",
        "zeta_pipeline_unexpected",
        { request_id: requestId, sync_run_id: runId, tenant_id: tenantCompanyId },
        e
      );
    }
  } finally {
    if (runId) {
      const runStatus: ZetaSyncRunStatus =
        stopped === "completed"
          ? "succeeded"
          : stopped === "max_pages"
            ? "partial"
            : "failed";
      try {
        await updateZetaSyncRunById(supabase, runId, {
          status: runStatus,
          finished_at: new Date().toISOString(),
          records_fetched: rowsNormalized,
          records_processed: rowsUpserted,
          error_summary: errorSummary ?? null,
          error_code: stopped !== "completed" && stopped !== "max_pages" ? stopped : null,
        });
      } catch (closeErr) {
        pipelineEmit(
          "error",
          "zeta_run_close_failed",
          {
            request_id: requestId,
            sync_run_id: runId,
            tenant_id: tenantCompanyId,
          },
          closeErr
        );
      }
    }
  }

  if (!runId) {
    throw new Error(errorSummary ?? "No se pudo crear la corrida de sincronización.");
  }

  const newBootstrapCompleted =
    bootstrapCompleted || (effectiveMode === "bootstrap" && stopped === "completed");

  const runStatusFinal: ZetaSyncRunStatus =
    stopped === "completed"
      ? "succeeded"
      : stopped === "max_pages"
        ? "partial"
        : "failed";
  const auditPersisted = runStatusFinal === "succeeded" || runStatusFinal === "partial";

  try {
    await upsertZetaSyncState(supabase, {
      resource_flow: flow,
      company_id: wid,
      preserve_watermark: !madePaginationProgress,
      watermark:
        madePaginationProgress && watermarkAfterProgress != null
          ? watermarkAfterProgress
          : undefined,
      watermark_type: "page",
      overlap_seconds: overlapSec,
      bootstrap_completed: newBootstrapCompleted,
      last_run_id: runId,
      last_success_at: auditPersisted ? new Date().toISOString() : undefined,
      last_success_run_id: auditPersisted ? runId : undefined,
    });
  } catch (stateErr) {
    pipelineEmit(
      "error",
      "zeta_sync_state_upsert_failed",
      { request_id: requestId, sync_run_id: runId, tenant_id: tenantCompanyId },
      stateErr
    );
  }

  const effectiveWatermark =
    madePaginationProgress && watermarkAfterProgress != null
      ? watermarkAfterProgress
      : previousWatermark;

  pipelineEmit("info", "zeta_saldos_pipeline_end", {
    request_id: requestId,
    sync_run_id: runId,
    tenant_id: tenantCompanyId,
    stopped_reason: stopped,
    run_status:
      stopped === "completed" ? "succeeded" : stopped === "max_pages" ? "partial" : "failed",
    pages_fetched: pagesFetched,
    rows_normalized: rowsNormalized,
    rows_upserted: rowsUpserted,
    watermark_effective: effectiveWatermark,
    watermark_preserved: !madePaginationProgress,
  });

  return {
    ok: stopped === "completed" || stopped === "max_pages",
    sync_run_id: runId,
    pages_fetched: pagesFetched,
    rows_normalized: rowsNormalized,
    rows_upserted: rowsUpserted,
    stopped_reason: stopped,
    error_summary: errorSummary,
    last_page_processed: effectiveWatermark,
    bootstrap_completed: newBootstrapCompleted,
    ...(reconciliationResult !== null
      ? {
          reconciliation: {
            pending_invoices_checked: reconciliationResult.pending_invoices_checked,
            orphans_detected: reconciliationResult.orphans_detected,
            warnings: reconciliationResult.warnings.length,
            auto_closed: reconciliationResult.auto_closed.length,
            db_errors: reconciliationResult.db_errors,
          },
        }
      : {}),
  };
}
