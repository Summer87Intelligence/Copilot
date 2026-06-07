/**
 * Ficha Cliente 360 — agrega `proto_companies`, facturas, recibos y estado de sync Zeta (solo lectura local).
 * No llama APIs Zeta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DataRow } from "@/lib/copilot-data";
import { companyPrimaryLabel } from "@/lib/copilot-datos-company-display";
import { COPILOT_COMMERCIAL_CLIENT_METADATA_KEY } from "@/lib/integrations/zeta/zeta-commercial-data-client-mapper";
import { fetchInvoiceFinancialBalanceMap } from "@/lib/data/proto-analytics-read-repository";
import { readInvoiceFinancial } from "@/lib/copilot-invoice-financial-read";
import { getZetaSyncResourceFlowLabel } from "@/lib/integrations/zeta/zeta-sync-resource-keys";
import {
  buildCurrencyRiskSummary,
  currencyRiskToClientRiskLabel,
  type SnapshotCurrencyCode,
} from "@/lib/copilot-financial-thresholds";
import { aggregateOperationalDebtForCompany } from "@/lib/zeta/zeta-operational-debt-dedup";

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymd(iso: unknown): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetweenYmd(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00.000Z`).getTime();
  const db = new Date(`${b}T12:00:00.000Z`).getTime();
  return Math.round((db - da) / 86400000);
}

export type Client360CommercialBlock = {
  condicion_comercial: string | null;
  categoria: string | null;
  vendedor_codigo: string | null;
  moneda_codigo: string | null;
  local_codigo: string | null;
  local_nombre: string | null;
  estado_comercial_activo: boolean | null;
  limite_credito_monto: string | null;
  limite_credito_dias: string | null;
  observaciones: string | null;
  commercial_synced_at: string | null;
};

export type Client360Summary = {
  company_id: string;
  razon_social: string;
  nombre_visible: string;
  codigo: string | null;
  rut_documento: string | null;
  industry: string | null;
  phone: string | null;
  commercial: Client360CommercialBlock | null;
};

export type Client360InvoiceRow = {
  id: string;
  issue_date: string;
  serie_numero: string;
  tipo: string;
  importe: number;
  saldo: string;
  estado: string;
  referencia: string | null;
};

export type Client360ReceiptRow = {
  id: string;
  receipt_date: string;
  importe: number;
  medio: string | null;
  referencia: string | null;
  estado: string;
};

export type Client360Movement = {
  kind: "factura" | "recibo";
  fecha: string;
  label: string;
  importe: number;
};

export type Client360AccountBlock = {
  saldo_pendiente_total: number;
  comprobantes_count: number;
  recibos_count: number;
  ultimos_movimientos: Client360Movement[];
};

export type Client360Insight = {
  id: "saldo_activo" | "sin_recibos_recientes" | "actividad_reciente" | "riesgo_basico";
  label: string;
  tone: "neutral" | "warning" | "danger" | "success";
  active: boolean;
};

export type Client360ZetaSyncRow = {
  resource_flow: string;
  label: string;
  last_success_at: string | null;
  updated_at: string | null;
  bootstrap_completed: boolean;
};

export type Client360Contact = {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
};

export type TransferAlias = {
  id: string;
  label: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

export type Client360Payload = {
  summary: Client360Summary;
  cuenta: Client360AccountBlock;
  invoices: Client360InvoiceRow[];
  receipts: Client360ReceiptRow[];
  insights: Client360Insight[];
  contacts: Client360Contact[];
  zeta_sync_rows: Client360ZetaSyncRow[];
  zeta_metadata: unknown;
  debt_uyu: number;
  debt_usd: number;
  overdue_uyu: number;
  overdue_usd: number;
  last_receipt_date: string | null;
  last_invoice_date: string | null;
  last_sync_at: string | null;
  transfer_method: string | null;
  transferAliases: TransferAlias[];
};

function resourceLabel(flow: string): string {
  return getZetaSyncResourceFlowLabel(flow);
}

function parseCommercialBlock(zeta_metadata: unknown): Client360CommercialBlock | null {
  if (
    zeta_metadata === null ||
    zeta_metadata === undefined ||
    typeof zeta_metadata !== "object" ||
    Array.isArray(zeta_metadata)
  ) {
    return null;
  }
  const root = zeta_metadata as Record<string, unknown>;
  const raw = root[COPILOT_COMMERCIAL_CLIENT_METADATA_KEY];
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const c = raw as Record<string, unknown>;
  return {
    condicion_comercial: str(c.condicion_pago_nombre) || str(c.condicion_pago_codigo) || null,
    categoria: str(c.categoria_nombre) || str(c.categoria_codigo) || null,
    vendedor_codigo: str(c.vendedor_codigo) || null,
    moneda_codigo: str(c.moneda_codigo) || null,
    local_codigo: str(c.local_codigo) || null,
    local_nombre: str(c.local_nombre) || null,
    estado_comercial_activo:
      typeof c.estado_comercial_activo === "boolean" ? c.estado_comercial_activo : null,
    limite_credito_monto: str(c.limite_credito_monto) || null,
    limite_credito_dias: str(c.limite_credito_dias) || null,
    observaciones: str(c.observaciones) || null,
    commercial_synced_at: str(c.synced_at) || null,
  };
}

function invoiceSerieNumero(inv: Record<string, unknown>): string {
  const num = str(inv.invoice_number);
  return num || "—";
}

function invoiceTipo(inv: Record<string, unknown>): string {
  const cat = str(inv.category);
  if (cat) return cat;
  const notes = str(inv.notes);
  if (notes.startsWith("zeta_vouchers:")) return "Comprobante Zeta";
  return "Factura / comprobante";
}

function invoiceReferencia(inv: Record<string, unknown>): string | null {
  const n = str(inv.notes);
  return n || null;
}

function receiptMedioExtra(notes: string | null): string | null {
  if (!notes) return null;
  try {
    const j = JSON.parse(notes) as { zeta_collection_receipt_v1?: { raw_payload?: Record<string, unknown> } };
    const raw = j?.zeta_collection_receipt_v1?.raw_payload;
    if (!raw || typeof raw !== "object") return null;
    const caja = str((raw as Record<string, unknown>).CajaNombre ?? (raw as Record<string, unknown>).cajaNombre);
    const cob = str(
      (raw as Record<string, unknown>).CobradorNombre ?? (raw as Record<string, unknown>).cobradorNombre
    );
    if (caja && cob) return `${caja} · ${cob}`;
    return caja || cob || null;
  } catch {
    return null;
  }
}

function computeInsights(input: {
  saldoPendiente: number;
  receipts: Client360ReceiptRow[];
  movements: Client360Movement[];
  overdueDebt: number;
  /** Fase 3: overdue por moneda — cuando presente reemplaza al threshold mixto legacy */
  overdueByCurrency?: Partial<Record<SnapshotCurrencyCode, number>>;
}): Client360Insight[] {
  const today = localTodayYmd();
  const lastReceipt = input.receipts
    .map((r) => r.receipt_date)
    .filter((d) => d && d.length >= 10)
    .sort((a, b) => b.localeCompare(a))[0];
  const daysSinceReceipt = lastReceipt ? daysBetweenYmd(lastReceipt, today) : 9999;
  const recentMove = input.movements.some((m) => {
    if (!m.fecha || m.fecha.length < 10) return false;
    return daysBetweenYmd(m.fecha, today) <= 35;
  });

  let riesgo: "Bajo" | "Medio" | "Alto" = "Bajo";
  if (input.saldoPendiente <= 0) {
    riesgo = "Bajo";
  } else if (input.overdueByCurrency && Object.keys(input.overdueByCurrency).length > 0) {
    // Fase 3: evaluar overdue por moneda sin sumar UYU+USD
    const byCurrencyInput = Object.fromEntries(
      (Object.entries(input.overdueByCurrency) as [SnapshotCurrencyCode, number][]).map(
        ([cur, overdue]) => [cur, { overdue: overdue ?? 0 }]
      )
    ) as Partial<Record<SnapshotCurrencyCode, { overdue: number }>>;
    const summary = buildCurrencyRiskSummary(byCurrencyInput);
    riesgo = currencyRiskToClientRiskLabel(summary.highestRisk);
    // TODO FASE 4: saldoPendiente >= 80_000 es threshold UYU-scale; no aplica a USD puro
    if (riesgo === "Bajo" && input.saldoPendiente >= 80_000) riesgo = "Medio";
  } else {
    // Legacy: threshold mixto UYU+USD — TODO FASE 4: separar por moneda
    const odShare = input.saldoPendiente > 0 ? input.overdueDebt / input.saldoPendiente : 0;
    if (input.overdueDebt >= 200_000 || odShare >= 0.55) riesgo = "Alto";
    else if (input.overdueDebt > 0 || input.saldoPendiente >= 80_000) riesgo = "Medio";
  }

  return [
    {
      id: "saldo_activo",
      label: "Saldo cartera activo",
      tone: "warning",
      active: input.saldoPendiente > 1,
    },
    {
      id: "sin_recibos_recientes",
      label: "Sin cobros recientes (60d)",
      tone: "neutral",
      active: input.receipts.length === 0 || daysSinceReceipt > 60,
    },
    {
      id: "actividad_reciente",
      label: "Actividad reciente (35d)",
      tone: "success",
      active: recentMove,
    },
    {
      id: "riesgo_basico",
      label: `Riesgo básico: ${riesgo}`,
      tone: riesgo === "Alto" ? "danger" : riesgo === "Medio" ? "warning" : "neutral",
      active: riesgo !== "Bajo",
    },
  ];
}

/**
 * Carga la ficha 360 para un cliente (`proto_companies.id`) del workspace dado.
 * @returns `null` si el cliente no existe o no pertenece al workspace.
 */
export async function loadClientCompany360(
  client: SupabaseClient,
  workspaceCompanyId: string,
  companyId: string
): Promise<Client360Payload | null> {
  const wid = workspaceCompanyId.trim();
  const cid = companyId.trim();
  if (!wid || !cid) return null;

  const { data: company, error: cErr } = await client
    .from("proto_companies")
    .select("*")
    .eq("id", cid)
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .maybeSingle();

  if (cErr || !company) return null;

  const crow = company as Record<string, unknown>;

  const { data: invRows, error: iErr } = await client
    .from("proto_invoices")
    .select("*")
    .eq("workspace_company_id", wid)
    .eq("company_id", cid)
    .eq("is_active", true);

  if (iErr) throw new Error(iErr.message);

  const invoicesRaw = (invRows ?? []) as Record<string, unknown>[];
  const ids = invoicesRaw.map((r) => str(r.id)).filter(Boolean);
  const balMap = await fetchInvoiceFinancialBalanceMap(client, wid, ids);
  const todayYmd = localTodayYmd();

  let saldoPendiente = 0;
  let overdueDebt = 0;
  const overdueByCurrency: Partial<Record<SnapshotCurrencyCode, number>> = {};
  const debtByCurrency: Partial<Record<SnapshotCurrencyCode, number>> = {};

  const operationalDebt = aggregateOperationalDebtForCompany(invoicesRaw, {
    todayYmd,
    invoiceBalanceMap: balMap,
  });
  debtByCurrency.UYU = operationalDebt.debtUYU;
  debtByCurrency.USD = operationalDebt.debtUSD;
  overdueByCurrency.UYU = operationalDebt.overdueUYU;
  overdueByCurrency.USD = operationalDebt.overdueUSD;
  saldoPendiente = operationalDebt.debtUYU + operationalDebt.debtUSD;
  overdueDebt = operationalDebt.overdueUYU + operationalDebt.overdueUSD;

  const invoices: Client360InvoiceRow[] = [...invoicesRaw]
    .map((inv) => {
      const id = str(inv.id);
      const fin = readInvoiceFinancial({
        invoiceId: id,
        balancePersisted: inv.balance_amount,
        totalAmount: inv.total_amount,
        balanceFromFinancialsMap: balMap,
      });
      const bal = fin.balance_authoritative;
      return {
        id,
        issue_date: ymd(inv.issue_date) || "—",
        serie_numero: invoiceSerieNumero(inv),
        tipo: invoiceTipo(inv),
        importe: num(inv.total_amount),
        saldo: bal.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
        estado: str(inv.status) || "—",
        referencia: invoiceReferencia(inv),
      };
    })
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

  const { data: recRows, error: rErr } = await client
    .from("proto_receipts")
    .select("*")
    .eq("workspace_company_id", wid)
    .eq("company_id", cid)
    .eq("is_active", true);

  if (rErr) throw new Error(rErr.message);

  const receiptsRaw = (recRows ?? []) as Record<string, unknown>[];
  const receipts: Client360ReceiptRow[] = receiptsRaw
    .map((r) => {
      const pm = str(r.payment_method) || null;
      const notes = str(r.notes) || null;
      const extra = receiptMedioExtra(notes);
      const medio = [pm, extra].filter(Boolean).join(" · ") || null;
      return {
        id: str(r.id),
        receipt_date: ymd(r.receipt_date) || "—",
        importe: num(r.amount),
        medio,
        referencia: str(r.reference) || null,
        estado: str(r.status) || "—",
      };
    })
    .sort((a, b) => b.receipt_date.localeCompare(a.receipt_date));

  const movements: Client360Movement[] = [];
  for (const inv of invoices.slice(0, 40)) {
    movements.push({
      kind: "factura",
      fecha: inv.issue_date,
      label: `${inv.serie_numero} · ${inv.tipo}`,
      importe: inv.importe,
    });
  }
  for (const rec of receipts.slice(0, 40)) {
    movements.push({
      kind: "recibo",
      fecha: rec.receipt_date,
      label: rec.medio ? `Recibo · ${rec.medio}` : "Recibo de cobro",
      importe: rec.importe,
    });
  }
  movements.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ultimos = movements.slice(0, 10);

  const { data: contactRows, error: ctErr } = await client
    .from("proto_contacts")
    .select("id, full_name, job_title, email, is_active")
    .eq("workspace_company_id", wid)
    .eq("company_id", cid)
    .eq("is_active", true);

  if (ctErr) throw new Error(ctErr.message);

  const contacts: Client360Contact[] = (contactRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: str(r.id),
      full_name: str(r.full_name) || "—",
      email: str(r.email) || null,
      job_title: str(r.job_title) || null,
    };
  });

  const { data: syncRows, error: sErr } = await client
    .from("zeta_sync_state")
    .select("*")
    .eq("company_id", wid)
    .order("updated_at", {
      ascending: false,
    });
  if (sErr) throw new Error(sErr.message);

  const zeta_sync_rows: Client360ZetaSyncRow[] = (syncRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const flow = str(r.resource_flow);
    return {
      resource_flow: flow,
      label: resourceLabel(flow),
      last_success_at: str(r.last_success_at) || null,
      updated_at: str(r.updated_at) || null,
      bootstrap_completed: Boolean(r.bootstrap_completed),
    };
  });

  const razon = str(crow.RazonSocial) || str(crow.Nombre) || str(crow.name) || "";
  const nombreVisible = companyPrimaryLabel(crow as DataRow);

  const summary: Client360Summary = {
    company_id: cid,
    razon_social: razon || nombreVisible,
    nombre_visible: nombreVisible,
    codigo: str(crow.Codigo) || null,
    rut_documento: str(crow.RUT) || str(crow.Documento) || null,
    industry: str(crow.industry) || str(crow.sector) || null,
    phone: str(crow.Celular) || str(crow.Telefono) || null,
    commercial: parseCommercialBlock(crow.zeta_metadata),
  };

  const cuenta: Client360AccountBlock = {
    saldo_pendiente_total: saldoPendiente,
    comprobantes_count: invoices.length,
    recibos_count: receipts.length,
    ultimos_movimientos: ultimos,
  };

  const insights = computeInsights({
    saldoPendiente,
    receipts,
    movements,
    overdueDebt,
    overdueByCurrency: Object.keys(overdueByCurrency).length > 0 ? overdueByCurrency : undefined,
  });

  const lastReceiptDate =
    receipts.map((r) => r.receipt_date).filter((d) => d && d !== "—").sort((a, b) => b.localeCompare(a))[0] ?? null;
  const lastInvoiceDate =
    invoices.map((r) => r.issue_date).filter((d) => d && d !== "—").sort((a, b) => b.localeCompare(a))[0] ?? null;
  const lastSyncAt =
    zeta_sync_rows.map((r) => r.last_success_at).filter(Boolean).sort((a, b) => (b ?? "").localeCompare(a ?? ""))[0] ?? null;

  const { data: aliasRows } = await client
    .from("client_transfer_aliases")
    .select("id, label, notes, is_active, created_at")
    .eq("workspace_id", wid)
    .eq("company_id", cid)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const transferAliases: TransferAlias[] = (aliasRows ?? []).map((r) => {
    const row = r as {
      id: string;
      label: string;
      notes: string | null;
      is_active: boolean;
      created_at: string;
    };
    return {
      id: row.id,
      label: row.label,
      notes: row.notes ?? null,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  });

  return {
    summary,
    cuenta,
    invoices,
    receipts,
    insights,
    contacts,
    zeta_sync_rows,
    zeta_metadata: crow.zeta_metadata ?? null,
    debt_uyu: debtByCurrency.UYU ?? 0,
    debt_usd: debtByCurrency.USD ?? 0,
    overdue_uyu: overdueByCurrency.UYU ?? 0,
    overdue_usd: overdueByCurrency.USD ?? 0,
    last_receipt_date: lastReceiptDate,
    last_invoice_date: lastInvoiceDate,
    last_sync_at: lastSyncAt,
    transfer_method: str(crow.transfer_method) || null,
    transferAliases,
  };
}
