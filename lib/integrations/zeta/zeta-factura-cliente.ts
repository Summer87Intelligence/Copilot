/**
 * Cliente de alto nivel — Facturas cliente (ZetaSoftware REST).
 *
 * Documentación del método de ejemplo:
 * https://zetasoftware.info/ayuda/apis/soap-y-rest/
 */

import type { CompanyId } from "@/types/zeta";
import type { ZetaInvoice } from "@/types/zeta";
import { loadZetaServerConfig } from "@/lib/integrations/zeta/zeta-config";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { zetaInvokeConnectionAndData } from "@/lib/integrations/zeta/zeta-invoke";

export const ZETA_METHOD_FACTURA_SALDOS_PENDIENTES =
  "RESTFacturaClienteV4QuerySaldosPendientes";

export type ZetaSaldoPendienteRow = {
  ClienteCodigo?: string;
  ClienteNombre?: string;
  RegistroId?: string;
  Saldo?: string;
  Total?: string;
  MonedaNombre?: string;
  Fecha?: string;
  [key: string]: unknown;
};

export type QuerySaldosPendientesResult = {
  succeed: boolean;
  isLastPage?: boolean;
  rows: ZetaSaldoPendienteRow[];
  raw: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/**
 * Interpreta la respuesta documentada (`QuerySaldosPendientesOut`) y tolera `Success`/`Succeed`.
 */
export function parseQuerySaldosPendientesOut(json: unknown): QuerySaldosPendientesResult {
  const rootRaw = asRecord(json)?.QuerySaldosPendientesOut;
  if (!rootRaw) {
    return { succeed: false, rows: [], raw: json };
  }
  const root = rootRaw as Record<string, unknown>;
  const succeed =
    typeof root.Succeed === "boolean"
      ? root.Succeed
      : typeof root.Success === "boolean"
        ? root.Success
        : false;
  const isLastPage =
    typeof root.IsLastPage === "boolean" ? root.IsLastPage : undefined;
  const response = root.Response;
  const rows = Array.isArray(response)
    ? (response as ZetaSaldoPendienteRow[])
    : [];
  return { succeed, isLastPage, rows, raw: json };
}

/**
 * Consulta saldos pendientes de facturación para un código de cliente.
 * No realiza mapping completo a `ZetaInvoice` (varía por comprobante); usar `mapSaldoRowsToZetaInvoicesBestEffort` si hace falta bootstrap.
 */
export async function queryFacturaClienteSaldosPendientes(
  ctx: ZetaCallContext,
  input: { clienteCodigo: string; page?: string },
  config = loadZetaServerConfig()
): Promise<QuerySaldosPendientesResult> {
  const page = input.page ?? "1";
  const { json } = await zetaInvokeConnectionAndData(ctx, {
    methodName: ZETA_METHOD_FACTURA_SALDOS_PENDIENTES,
    rootInKey: "QuerySaldosPendientesIn",
    data: {
      Page: page,
      Filters: { ClienteCodigo: input.clienteCodigo.trim() },
    },
    credentials: config.credentials,
    config,
  });
  return parseQuerySaldosPendientesOut(json);
}

/**
 * Mapeo conservador hacia el modelo conceptual `ZetaInvoice` del repo (bootstrap parcial).
 * `RegistroId` → `zetaId`; `Saldo` / `Total` → montos; fechas y estado best-effort.
 */
export function mapSaldoRowsToZetaInvoicesBestEffort(
  companyId: CompanyId,
  rows: ZetaSaldoPendienteRow[]
): ZetaInvoice[] {
  const out: ZetaInvoice[] = [];
  for (const r of rows) {
    const zetaId = String(r.RegistroId ?? "").trim();
    if (!zetaId) continue;
    const saldo = parseAmount(r.Saldo ?? r.Total);
    const total = parseAmount(r.Total ?? r.Saldo);
    out.push({
      zetaId,
      companyId,
      issueDate: String(r.Fecha ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      clientZetaId: r.ClienteCodigo ? String(r.ClienteCodigo) : undefined,
      currency: "ARS",
      totalAmount: Number.isFinite(total) && total > 0 ? total : saldo,
      outstandingAmount: saldo,
      status: "issued",
    });
  }
  return out;
}

function parseAmount(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
