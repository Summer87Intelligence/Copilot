/**
 * Cliente de alto nivel — Facturas cliente (ZetaSoftware REST).
 *
 * Documentación del método de ejemplo:
 * https://zetasoftware.info/ayuda/apis/soap-y-rest/
 */

import type { ZetaCustomerVoucherRecord } from "@/lib/integrations/zeta/contracts/zeta-customer-vouchers.contract";
import { resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow } from "@/lib/integrations/zeta/zeta-customer-vouchers-mapper";
import { normalizeZetaCurrency } from "@/lib/integrations/zeta/zeta-currency-normalize";
import {
  COPILOT_OPERATIONAL_START_DATE,
  isPreOperationalPeriod,
} from "@/lib/copilot-operational-period";
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
  /**
   * `true` si `QuerySaldosPendientesOut.Response` existía en JSON y era un **array** (puede ser `[]`).
   * Si `Response` falta o no es array, `rows` queda `[]` pero **no** es evidencia contractual de “cero pendientes”.
   */
  responseExplicitArray: boolean;
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
    return { succeed: false, rows: [], raw: json, responseExplicitArray: false };
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
  const responseExplicitArray = Array.isArray(response);
  const rows = responseExplicitArray
    ? (response as ZetaSaldoPendienteRow[])
    : [];
  return { succeed, isLastPage, rows, raw: json, responseExplicitArray };
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

    // Hard cutoff: fecha vacía → skip (no caer a new Date())
    const rawFecha = String(r.Fecha ?? "").slice(0, 10);
    if (!rawFecha || rawFecha.length < 8) {
      console.log(
        JSON.stringify({
          kind: "saldo_row_skip_invalid_fecha",
          reason: "missing_fecha",
          zeta_registro_id: zetaId,
          operational_cutoff: COPILOT_OPERATIONAL_START_DATE,
        })
      );
      continue;
    }

    // Hard cutoff: pre-operacional → skip
    if (isPreOperationalPeriod(rawFecha)) {
      console.log(
        JSON.stringify({
          kind: "saldo_row_skip_pre_operational",
          reason: "pre_operational_cutoff",
          zeta_registro_id: zetaId,
          fecha: rawFecha,
          operational_cutoff: COPILOT_OPERATIONAL_START_DATE,
        })
      );
      continue;
    }

    const saldoRaw = r.Saldo;
    const saldo =
      saldoRaw === undefined || saldoRaw === null || saldoRaw === ""
        ? 0
        : parseAmount(saldoRaw);
    const total = parseAmount(r.Total);
    const ccv1 = resolveCcV1InvoiceNumberFromZetaSaldoOrVoucherRow(r as ZetaCustomerVoucherRecord);
    const totalAmount =
      Number.isFinite(total) && total > 0 ? total : Number.isFinite(saldo) && saldo > 0 ? saldo : 0;
    const status: ZetaInvoice["status"] = saldo <= 1e-6 ? "paid" : "issued";
    const monedaNombre = r.MonedaNombre != null ? String(r.MonedaNombre) : null;
    const currency = normalizeZetaCurrency(monedaNombre) ?? monedaNombre ?? "";
    out.push({
      zetaId,
      companyId,
      issueDate: rawFecha,
      clientZetaId: r.ClienteCodigo ? String(r.ClienteCodigo) : undefined,
      currency,
      totalAmount,
      outstandingAmount: saldo,
      ccv1InvoiceNumber: ccv1,
      saldoSourceRow: { ...(r as Record<string, unknown>) },
      status,
    });
  }
  return out;
}

function parseAmount(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
