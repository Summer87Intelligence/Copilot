import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { serializeError } from "@/lib/copilot-structured-logger";
import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import {
  protoCreateInvoice,
  protoUpdateInvoice,
} from "@/lib/copilot-proto-crud-service";
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
import { zetaLog } from "@/lib/integrations/zeta/zeta-log";
import {
  fetchProtoInvoiceZetaMetadata,
  findActiveProtoInvoiceIdByZetaRegistroMetadata,
  invoiceZetaMetadataRegistroConsistentWithExpected,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";
import {
  extractSerieNumeroFromSaldoSourceRow,
  findBestHeuristicProtoInvoiceForSaldoRow,
} from "@/lib/integrations/zeta/zeta-saldos-heuristic-match";
import {
  ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES,
  type ZetaSaldosPipelineOptions,
  type ZetaSaldosPipelineResult,
} from "@/lib/integrations/zeta/zeta-pipeline-types";
import type { ZetaInvoice } from "@/types/zeta";

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_PAGE_DELAY_MS = 400;
const DEFAULT_OVERLAP_SECONDS = 7 * 24 * 3600;

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

function pipelineEmit(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown>,
  err?: unknown
) {
  const base: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    source: "zeta_pipeline",
    ...fields,
  };
  if (err !== undefined) base.error = serializeError(err);
  const line = JSON.stringify(base);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function zetaSaldosDiagEnabled(): boolean {
  const v = (process.env.ZETA_SALDOS_DIAG ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function diagLog(message: string, payload: any) {
  if (!zetaSaldosDiagEnabled()) return;
  const extra =
    payload != null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : { payload };
  console.log(JSON.stringify({ tag: "zeta_saldos_diag", message, ...extra }));
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

function zetaInvoiceToProtoInput(inv: ZetaInvoice, syncRunId: string): ProtoInvoiceInput {
  const issue = inv.issueDate.slice(0, 10);
  const bal = inv.outstandingAmount ?? 0;
  const status = bal <= 1e-6 ? "paid" : "issued";
  return {
    company_id: inv.companyId,
    invoice_number: `ZETA:${inv.zetaId}`,
    issue_date: issue,
    due_date: addDaysIso(issue, 30),
    total_amount: inv.totalAmount,
    balance_amount: bal,
    status,
    category: "Zeta / saldos pendientes",
    notes: `sync_run:${syncRunId}`.slice(0, 500),
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
  touchedInvoiceIds: Set<string>
): Promise<number> {
  const wid = workspaceCompanyId.trim();
  const expectedCli = sanitizeZetaInvoiceKeyPart(clienteCodigo, 24) || "NCLI";

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
    if (st === "cancelled") continue;

    const cur =
      row.balance_amount === null || row.balance_amount === undefined
        ? 0
        : typeof row.balance_amount === "number"
          ? row.balance_amount
          : Number(String(row.balance_amount).replace(",", "."));
    const curBal = Number.isFinite(cur) ? cur : 0;
    const alreadyClosed = Math.abs(curBal) <= 1e-6 && st === "paid";
    if (alreadyClosed) continue;

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
      wid
    );
    if (!up.ok) throw new Error(up.message);
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
  zetaClienteCodigo: string
): Promise<"insert" | "update" | "skip"> {
  const key = inv.zetaId;
  if (!key || seenInRun.has(key)) return "skip";
  seenInRun.add(key);

  const wid = workspaceCompanyId.trim();
  const bal = inv.outstandingAmount ?? 0;
  const status = bal <= 1e-6 ? "paid" : "issued";
  const diagOn = zetaSaldosDiagEnabled();

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

  const regHit = await findActiveProtoInvoiceIdByZetaRegistroMetadata(
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
  if (diagOn) {
    diagLog("lookup_by_registro_id", {
      found: Boolean(regHit?.id),
      invoice_id: regHit?.id ?? null,
      matched_path: regHit?.matched_path ?? null,
    });
  }
  if (regHit) {
    const prev = diagOn ? await readProtoInvoiceSaldoSnapshot(supabase, wid, regHit.id) : null;
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
      },
      wid
    );
    if (!up.ok) throw new Error(up.message);
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
    const ccv1Id = await findActiveInvoiceIdByZetaNumber(supabase, inv.companyId, ccv1, wid);
    if (diagOn) {
      diagLog("lookup_by_invoice_number", {
        found: Boolean(ccv1Id),
        invoice_id: ccv1Id ?? null,
      });
    }
    let ccv1Target = ccv1Id;
    if (ccv1Target) {
      const meta = await fetchProtoInvoiceZetaMetadata(supabase, wid, ccv1Target);
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
      const prev = diagOn ? await readProtoInvoiceSaldoSnapshot(supabase, wid, ccv1Target) : null;
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
        },
        wid
      );
      if (!up.ok) throw new Error(up.message);
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

  const heuristicOutcome = await findBestHeuristicProtoInvoiceForSaldoRow(
    supabase,
    wid,
    inv.companyId,
    inv,
    zetaClienteCodigo.trim()
  );
  const { serie: logSaldoSerie, numero: logSaldoNumero } = extractSerieNumeroFromSaldoSourceRow(
    inv.saldoSourceRow ?? null
  );

  if (heuristicOutcome.kind === "applied") {
    const metaHeur = await fetchProtoInvoiceZetaMetadata(supabase, wid, heuristicOutcome.invoice_id);
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
        breakdown: heuristicOutcome.breakdown,
        saldo_serie: logSaldoSerie,
        saldo_numero: logSaldoNumero,
        ccv1_computed: ccv1,
        total_amount_saldo: inv.totalAmount,
        issue_date_saldo: inv.issueDate,
        match_tier: "heuristic_controlado",
      });
      const prevHeur = diagOn
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
        },
        wid
      );
      if (!upHeur.ok) throw new Error(upHeur.message);
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
      saldo_serie: logSaldoSerie,
      saldo_numero: logSaldoNumero,
      ccv1_computed: ccv1,
      total_amount_saldo: inv.totalAmount,
      issue_date_saldo: inv.issueDate,
    });
  }

  const input = zetaInvoiceToProtoInput(inv, syncRunId);
  if (diagOn) {
    diagLog("fallback_legacy", {
      zeta_registro_id: inv.zetaId,
    });
  }

  const existingLegacy = await findActiveInvoiceIdByZetaNumber(
    supabase,
    inv.companyId,
    input.invoice_number,
    wid
  );
  if (existingLegacy) {
    const prev = diagOn ? await readProtoInvoiceSaldoSnapshot(supabase, wid, existingLegacy) : null;
    if (diagOn) {
      diagLog("before_update", {
        invoice_id: existingLegacy,
        prev_balance: prev?.balance_amount ?? null,
        prev_status: prev?.status ?? null,
      });
    }
    const up = await protoUpdateInvoice(
      supabase,
      existingLegacy,
      {
        issue_date: input.issue_date,
        due_date: input.due_date,
        total_amount: input.total_amount,
        balance_amount: input.balance_amount,
        status: input.status,
        category: input.category,
        notes: input.notes,
      },
      wid
    );
    if (!up.ok) throw new Error(up.message);
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
  const cr = await protoCreateInvoice(supabase, input, wid);
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
      const prev = diagOn ? await readProtoInvoiceSaldoSnapshot(supabase, wid, again) : null;
      if (diagOn) {
        diagLog("before_update", {
          invoice_id: again,
          prev_balance: prev?.balance_amount ?? null,
          prev_status: prev?.status ?? null,
        });
      }
      const up2 = await protoUpdateInvoice(
        supabase,
        again,
        {
          issue_date: input.issue_date,
          due_date: input.due_date,
          total_amount: input.total_amount,
          balance_amount: input.balance_amount,
          status: input.status,
          category: input.category,
          notes: input.notes,
        },
        wid
      );
      if (!up2.ok) throw new Error(up2.message);
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
function canApplyZeroPass(params: {
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

  const maxPages = opts.maxPagesPerRun ?? DEFAULT_MAX_PAGES;
  const pageDelayMs = opts.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS;
  const overlapSec = opts.overlapSeconds ?? DEFAULT_OVERLAP_SECONDS;
  const flow = ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES;

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

  const stateRow = await selectZetaSyncStateByResource(supabase, flow);
  const bootstrapCompleted = stateRow?.bootstrap_completed ?? false;
  const previousWatermark = (stateRow?.watermark?.trim() || "1") || "1";
  const startPage = resolveStartPage(stateRow?.watermark, opts.mode, bootstrapCompleted);

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
      sync_mode: opts.mode,
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
      mode: opts.mode,
      start_page: startPage,
      max_pages_per_run: maxPages,
      previous_watermark: previousWatermark,
    });

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
            opts.clienteCodigo
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
          touchedInvoiceIds
        );
        pipelineEmit("info", "zeta_saldos_ccv1_zeroed_unlisted", {
          request_id: requestId,
          sync_run_id: runId,
          tenant_id: tenantCompanyId,
          cleared_count: cleared,
        });
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
    bootstrapCompleted || (opts.mode === "bootstrap" && stopped === "completed");

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
  };
}
