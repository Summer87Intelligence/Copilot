/**
 * Auditoría read-only: Zeta QueryComprobantes (mayo u otro mes) vs `proto_receipts`.
 *
 * Uso:
 *   npx tsx scripts/audit-zeta-receipts-divergence.ts
 *   npx tsx scripts/audit-zeta-receipts-divergence.ts --mes 5 --anio 2026
 *
 * Env (.env.local): credenciales Zeta + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   AUDIT_WORKSPACE_ID (default Summer87 workspace)
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  readIsLastPageFromReceiptRows,
  readZetaCollectionReceiptsQueryOutFlags,
  summarizeZetaCollectionReceiptsResponseShape,
} from "@/lib/integrations/zeta/contracts/zeta-collection-receipts.contract";
import {
  buildQueryInData,
  fetchZetaCollectionReceipts,
} from "@/lib/integrations/zeta/zeta-collection-receipts-fetch";
import {
  buildZetaCollectionReceiptNumber,
  mapCopilotCollectionReceiptToProtoReceiptInput,
  mapZetaCollectionReceiptToCopilot,
  normalizeZetaReceiptCurrency,
} from "@/lib/integrations/zeta/zeta-collection-receipts-mapper";
import { resolveZetaCollectionReceiptsRestMethod } from "@/lib/integrations/zeta/zeta-collection-receipts-rest-method";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ZETA_EMPRESA_CODIGO) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const DEFAULT_WORKSPACE = "040321ff-10fd-4da3-aeca-f1865f879986";
const MAX_PAGES = 5_000;

function parseArgs(argv: string[]) {
  let mes = 5;
  let anio = 2026;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--mes") mes = Number.parseInt(argv[i + 1] ?? "", 10);
    if (argv[i] === "--anio") anio = Number.parseInt(argv[i + 1] ?? "", 10);
  }
  return { mes, anio };
}

function readOwn(row: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(row, n)) return row[n];
    const want = n.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === want) return row[k];
    }
  }
  return undefined;
}

function normalizeDateYmd(fecha: unknown): string | null {
  if (fecha == null) return null;
  const s = String(fecha).trim();
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const ymd = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}

function parseTotal(row: Record<string, unknown>): number | null {
  const total = readOwn(row, ["Total", "total"]);
  if (total == null) return null;
  const n = typeof total === "number" ? total : Number(String(total).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

type ZetaReceiptAuditRow = {
  registro_id: string;
  receipt_number: string;
  numero: string;
  fecha: string | null;
  moneda: string | null;
  currency: string | null;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
  total: number | null;
  emitido: string | null;
  serie: string | null;
};

function mapZetaRow(row: Record<string, unknown>): ZetaReceiptAuditRow | null {
  const regRaw = readOwn(row, ["RegistroId", "registroId"]);
  const registroId = regRaw != null ? String(regRaw).trim() : "";
  if (!registroId) return null;
  const fecha = normalizeDateYmd(readOwn(row, ["Fecha", "fecha"]));
  const monedaCodigo = readOwn(row, ["MonedaCodigo", "monedaCodigo"]);
  const monedaSimbolo = readOwn(row, ["MonedaSimbolo", "monedaSimbolo"]);
  const numRaw = readOwn(row, ["Numero", "numero", "Número", "número"]);
  return {
    registro_id: registroId,
    receipt_number: buildZetaCollectionReceiptNumber(registroId),
    numero: numRaw != null ? String(numRaw).trim() : "",
    fecha,
    moneda: monedaCodigo != null ? String(monedaCodigo).trim() : null,
    currency: normalizeZetaReceiptCurrency(
      monedaCodigo != null ? String(monedaCodigo).trim() : null,
      monedaSimbolo != null ? String(monedaSimbolo).trim() : null
    ),
    cliente_codigo:
      readOwn(row, ["ClienteCodigo", "clienteCodigo"]) != null
        ? String(readOwn(row, ["ClienteCodigo", "clienteCodigo"])).trim()
        : null,
    cliente_nombre:
      readOwn(row, ["ClienteNombre", "clienteNombre"]) != null
        ? String(readOwn(row, ["ClienteNombre", "clienteNombre"])).trim()
        : null,
    total: parseTotal(row),
    emitido: readOwn(row, ["Emitido", "emitido"]) != null ? String(readOwn(row, ["Emitido", "emitido"])).trim() : null,
    serie: readOwn(row, ["Serie", "serie"]) != null ? String(readOwn(row, ["Serie", "serie"])).trim() : null,
  };
}

type ProtoReceiptAuditRow = {
  id: string;
  receipt_number: string;
  receipt_date: string;
  amount: number;
  currency_code: string | null;
  company_id: string | null;
  reference: string | null;
  status: string | null;
  is_active: boolean;
  registro_id_from_number: string | null;
  numero_from_notes: string | null;
  cliente_from_notes: string | null;
};

function registroIdFromReceiptNumber(receiptNumber: string): string | null {
  const m = /^ZETA:COB:(.+)$/.exec(receiptNumber.trim());
  return m ? m[1] : null;
}

function parseNotes(notes: string | null): { numero: string | null; cliente: string | null } {
  if (!notes) return { numero: null, cliente: null };
  try {
    const parsed = JSON.parse(notes) as {
      zeta_collection_receipt_v1?: { raw_payload?: Record<string, unknown> };
    };
    const raw = parsed.zeta_collection_receipt_v1?.raw_payload;
    if (!raw) return { numero: null, cliente: null };
    const num = readOwn(raw, ["Numero", "numero"]);
    const cliente = readOwn(raw, ["ClienteNombre", "clienteNombre"]);
    return {
      numero: num != null ? String(num).trim() : null,
      cliente: cliente != null ? String(cliente).trim() : null,
    };
  } catch {
    return { numero: null, cliente: null };
  }
}

async function fetchAllZetaPages(
  ctx: ZetaCallContext,
  mes: number,
  anio: number
): Promise<{
  rows: ZetaReceiptAuditRow[];
  pages: Array<Record<string, unknown>>;
  pipelineWouldStopAtPage: number | null;
  paginationGap: boolean;
}> {
  const filters = { mes: String(mes), anio: String(anio) };
  const all: ZetaReceiptAuditRow[] = [];
  const pages: Array<Record<string, unknown>> = [];
  let pipelineWouldStopAtPage: number | null = null;
  let paginationGap = false;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchZetaCollectionReceipts({ ctx, page: String(page), filters });
    const shape = res.ok && res.raw ? summarizeZetaCollectionReceiptsResponseShape(res.raw) : null;
    const flags = res.ok && res.raw ? readZetaCollectionReceiptsQueryOutFlags(res.raw) : null;
    const isLastRow =
      res.ok && res.rows.length > 0 ? readIsLastPageFromReceiptRows(res.rows) : null;

    const pageInfo: Record<string, unknown> = {
      page,
      ok: res.ok,
      http_status: res.ok ? res.httpStatus : res.httpStatus,
      rows_raw: res.ok ? res.rows.length : 0,
      has_more_pipeline: res.ok ? res.hasMore : null,
      is_last_page_outer: flags?.isLastPage ?? null,
      is_last_page_last_row: isLastRow,
      total_registros: flags?.total ?? null,
      array_path: shape?.array_path_detected ?? null,
      warnings: res.ok ? res.warnings : res.errors,
      query_data: buildQueryInData(String(page), filters),
    };
    pages.push(pageInfo);

    if (!res.ok) break;

    for (const row of res.rows) {
      const mapped = mapZetaRow(row as Record<string, unknown>);
      if (mapped) all.push(mapped);
    }

    if (res.hasMore === false && pipelineWouldStopAtPage == null) {
      pipelineWouldStopAtPage = page;
    }

    if (!res.hasMore) {
      if (page === 1 && res.rows.length > 0 && flags?.isLastPage == null && isLastRow == null) {
        paginationGap = true;
      }
      break;
    }
  }

  return { rows: all, pages, pipelineWouldStopAtPage, paginationGap };
}

async function listProtoReceiptsMay(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  mes: number,
  anio: number
): Promise<ProtoReceiptAuditRow[]> {
  const from = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const to = `${anio}-${String(mes).padStart(2, "0")}-31`;
  const { data, error } = await supabase
    .from("proto_receipts")
    .select("id,receipt_number,receipt_date,amount,currency_code,company_id,reference,status,is_active,notes")
    .eq("workspace_company_id", workspaceId)
    .gte("receipt_date", from)
    .lte("receipt_date", to);

  if (error) throw new Error(error.message);

  type ProtoRow = {
    id: string;
    receipt_number: string | null;
    receipt_date: string | null;
    amount: number | null;
    currency_code: string | null;
    company_id: string | null;
    reference: string | null;
    status: string | null;
    is_active: boolean | null;
    notes: string | null;
  };

  return ((data ?? []) as ProtoRow[]).map((row) => {
    const notes = typeof row.notes === "string" ? row.notes : null;
    const parsed = parseNotes(notes);
    return {
      id: String(row.id),
      receipt_number: String(row.receipt_number ?? ""),
      receipt_date: String(row.receipt_date ?? "").slice(0, 10),
      amount: Number(row.amount ?? 0),
      currency_code: row.currency_code != null ? String(row.currency_code) : null,
      company_id: row.company_id != null ? String(row.company_id) : null,
      reference: row.reference != null ? String(row.reference) : null,
      status: row.status != null ? String(row.status) : null,
      is_active: row.is_active !== false,
      registro_id_from_number: registroIdFromReceiptNumber(String(row.receipt_number ?? "")),
      numero_from_notes: parsed.numero,
      cliente_from_notes: parsed.cliente,
    };
  });
}

function classifyMapperSkips(rows: Record<string, unknown>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const copilot = mapZetaCollectionReceiptToCopilot(row);
    if (!copilot) {
      counts.no_registro_id = (counts.no_registro_id ?? 0) + 1;
      continue;
    }
    const proto = mapCopilotCollectionReceiptToProtoReceiptInput(null, copilot, "audit");
    if (!proto.ok) {
      counts[proto.reason] = (counts[proto.reason] ?? 0) + 1;
    }
  }
  return counts;
}

async function main() {
  const { mes, anio } = parseArgs(process.argv.slice(2));
  const workspaceId = process.env.AUDIT_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const ctx: ZetaCallContext = {
    requestId: `audit-receipts-${Date.now()}`,
    tenantId: workspaceId,
  };

  console.log(
    JSON.stringify({
      kind: "audit_zeta_receipts_start",
      mes,
      anio,
      workspace_id: workspaceId,
      zeta_method: resolveZetaCollectionReceiptsRestMethod(),
    })
  );

  const zetaFetch = await fetchAllZetaPages(ctx, mes, anio);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const protoRows = await listProtoReceiptsMay(
    supabase as ReturnType<typeof createClient>,
    workspaceId,
    mes,
    anio
  );
  const protoActive = protoRows.filter((r) => r.is_active);
  const protoInactive = protoRows.filter((r) => !r.is_active);

  const zetaByRegistro = new Map(zetaFetch.rows.map((r) => [r.registro_id, r]));
  const protoByRegistro = new Map(
    protoActive
      .map((r) => [r.registro_id_from_number ?? "", r] as const)
      .filter(([id]) => id.length > 0)
  );

  const missingInProto: ZetaReceiptAuditRow[] = [];
  for (const z of zetaFetch.rows) {
    if (!protoByRegistro.has(z.registro_id)) missingInProto.push(z);
  }

  const ghostInProto: ProtoReceiptAuditRow[] = [];
  for (const [regId, p] of protoByRegistro) {
    if (!zetaByRegistro.has(regId)) ghostInProto.push(p);
  }

  const duplicateProto: string[] = [];
  const seenNumbers = new Map<string, number>();
  for (const p of protoActive) {
    const n = seenNumbers.get(p.receipt_number) ?? 0;
    seenNumbers.set(p.receipt_number, n + 1);
  }
  for (const [num, count] of seenNumbers) {
    if (count > 1) duplicateProto.push(num);
  }

  const mapperSkips =
    zetaFetch.pages.length > 0 && zetaFetch.pages[0].ok
      ? classifyMapperSkips(
          (
            await fetchZetaCollectionReceipts({
              ctx,
              page: "1",
              filters: { mes: String(mes), anio: String(anio) },
            })
          ).rows as Record<string, unknown>[]
        )
      : {};

  const presentInProto = protoActive
    .map((p) => ({
      registro_id: p.registro_id_from_number,
      receipt_number: p.receipt_number,
      receipt_date: p.receipt_date,
      amount: p.amount,
      currency_code: p.currency_code,
      cliente: p.cliente_from_notes,
    }))
    .filter((p) => p.registro_id);

  const report = {
    kind: "audit_zeta_receipts_divergence_report",
    mes,
    anio,
    workspace_id: workspaceId,
    total_zeta: zetaFetch.rows.length,
    total_proto_active: protoActive.length,
    total_proto_all: protoRows.length,
    total_proto_inactive: protoInactive.length,
    present_in_proto_count: presentInProto.length,
    present_in_proto: presentInProto,
    missing_in_proto_count: missingInProto.length,
    missing_in_proto: missingInProto.slice(0, 50),
    ghost_in_proto_count: ghostInProto.length,
    ghost_in_proto: ghostInProto.slice(0, 20),
    duplicate_proto_count: duplicateProto.length,
    duplicate_proto: duplicateProto.slice(0, 20),
    pagination_pages_fetched: zetaFetch.pages.length,
    pagination_gap_suspected: zetaFetch.paginationGap,
    pipeline_would_stop_at_page: zetaFetch.pipelineWouldStopAtPage,
    pages: zetaFetch.pages,
    skipped_by_filters: {
      watermark: 0,
      note: "El pipeline actual no filtra filas por watermark; solo persiste marca de sync.",
    },
    skipped_by_mapper_page1: mapperSkips,
    likely_loss_stage:
      zetaFetch.paginationGap && zetaFetch.rows.length > protoActive.length
        ? "fetch_pagination"
        : missingInProto.length > 0
          ? "mapper_or_upsert"
          : "none_or_display_filter",
    root_cause_hypothesis:
      zetaFetch.paginationGap
        ? "resolveHasMore devuelve false cuando IsLastPage no viene en QueryComprobantesOut; el pipeline solo lee página 1."
        : null,
  };

  const outDir = path.join(process.cwd(), "temp-audits");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `audit-zeta-receipts-${anio}-${String(mes).padStart(2, "0")}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReporte escrito en ${outPath}`);
}

main().catch((e) => {
  console.error(JSON.stringify({ kind: "audit_zeta_receipts_fatal", error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
