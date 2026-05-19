/**
 * Compara saldos pendientes LIVE de Zeta (QuerySaldosPendientes por cliente)
 * vs proto_invoices.balance_amount — sin Excel.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/audit-zeta-live-pending-vs-db.ts
 *   npx tsx --env-file=.env.local scripts/audit-zeta-live-pending-vs-db.ts --max-clients 200
 */

import { createClient } from "@supabase/supabase-js";

import { loadZetaServerConfig } from "@/lib/integrations/zeta/zeta-config";
import {
  mapSaldoRowsToZetaInvoicesBestEffort,
  queryFacturaClienteSaldosPendientes,
} from "@/lib/integrations/zeta/zeta-factura-cliente";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";

const EPS = 0.005;
const AMOUNT_TOL = 0.02;
const args = process.argv.slice(2);
const maxClients = (() => {
  const i = args.indexOf("--max-clients");
  return i >= 0 ? Number(args[i + 1]) : 200;
})();

const workspaceId =
  process.env.WORKSPACE_COMPANY_ID ??
  process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID ??
  "040321ff-10fd-4da3-aeca-f1865f879986";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

type ZetaPending = {
  registroId: string;
  clienteCodigo: string;
  clienteName: string;
  protoCompanyId: string;
  serie: string;
  numero: string;
  currency: string;
  saldoZeta: number;
  totalZeta: number;
  issueDate: string;
  ccv1: string | null;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error("Faltan credenciales Supabase");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const config = loadZetaServerConfig();
  const ctx: ZetaCallContext = {
    tenantId: workspaceId,
    requestId: `audit-live-${Date.now()}`,
  };

  const { data: companies, error: cErr } = await sb
    .from("proto_companies")
    .select("id, name, RazonSocial, Codigo")
    .eq("workspace_company_id", workspaceId)
    .eq("is_active", true)
    .not("Codigo", "is", null)
    .limit(maxClients);

  if (cErr) throw cErr;

  const eligible = (companies ?? []).filter(
    (c) => String((c as { Codigo?: unknown }).Codigo ?? "").trim().length > 0
  ) as { id: string; name: string | null; RazonSocial: string | null; Codigo: string }[];

  console.log("\n══ Zeta LIVE QuerySaldosPendientes vs DB balance_amount ══\n");
  console.log(`Clientes a consultar: ${eligible.length}\n`);

  const zetaRows: ZetaPending[] = [];

  for (let i = 0; i < eligible.length; i++) {
    const c = eligible[i]!;
    const codigo = String(c.Codigo).trim();
    if (i > 0) await new Promise((r) => setTimeout(r, 350));

    let page = "1";
    for (let guard = 0; guard < 10; guard++) {
      const res = await queryFacturaClienteSaldosPendientes(ctx, { clienteCodigo: codigo, page }, config);
      const mapped = mapSaldoRowsToZetaInvoicesBestEffort(c.id, res.rows);
      for (const z of mapped) {
        if ((z.outstandingAmount ?? 0) <= EPS) continue;
        const raw = z.saldoSourceRow as Record<string, unknown> | undefined;
        zetaRows.push({
          registroId: z.zetaId,
          clienteCodigo: codigo,
          clienteName: c.RazonSocial ?? c.name ?? codigo,
          protoCompanyId: c.id,
          serie: String(raw?.Serie ?? raw?.serie ?? ""),
          numero: String(raw?.Numero ?? raw?.numero ?? ""),
          currency: z.currency === "USD" || z.currency === "UYU" ? z.currency : "?",
          saldoZeta: round2(z.outstandingAmount ?? 0),
          totalZeta: round2(z.totalAmount ?? 0),
          issueDate: z.issueDate,
          ccv1: z.ccv1InvoiceNumber ?? null,
        });
      }
      if (res.isLastPage !== false) break;
      page = String(Number(page) + 1);
    }
  }

  const { data: dbInv, error: iErr } = await sb
    .from("proto_invoices")
    .select("id, invoice_number, balance_amount, total_amount, currency_code, company_id, zeta_metadata, issue_date")
    .eq("workspace_company_id", workspaceId)
    .eq("is_active", true)
    .gt("balance_amount", 0);

  if (iErr) throw iErr;

  type DbInv = (typeof dbInv)[number];
  const byRegistro = new Map<string, DbInv>();
  const byCcv1Numero = new Map<string, DbInv[]>();

  for (const inv of dbInv ?? []) {
    const meta = inv.zeta_metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const v1 = (meta as Record<string, unknown>).zeta_customer_voucher_v1 as Record<string, unknown> | undefined;
      const reg = String(v1?.zeta_registro_id ?? v1?.registro_id ?? "").trim();
      if (reg) byRegistro.set(reg, inv);
    }
    const parts = String(inv.invoice_number ?? "").split(":");
    if (parts[1] === "CCV1" && parts.length >= 6) {
      const num = parts[5]!;
      const arr = byCcv1Numero.get(num) ?? [];
      arr.push(inv);
      byCcv1Numero.set(num, arr);
    }
    if (parts.length === 2 && /^\d+$/.test(parts[1] ?? "")) {
      byRegistro.set(parts[1]!, inv);
    }
  }

  let ok = 0;
  let saldoMal = 0;
  let falta = 0;

  const zetaUyu = round2(zetaRows.filter((r) => r.currency === "UYU").reduce((s, r) => s + r.saldoZeta, 0));
  const zetaUsd = round2(zetaRows.filter((r) => r.currency === "USD").reduce((s, r) => s + r.saldoZeta, 0));

  console.log(`Zeta LIVE pendientes: ${zetaRows.length} filas | UYU ${zetaUyu} | USD ${zetaUsd}`);
  console.log(`DB balance>0:         ${(dbInv ?? []).length} filas\n`);

  console.log(
    ["Cliente", "Nº", "Mon", "Saldo Zeta", "balance DB", "Diff", "Estado"].join(" | ")
  );
  console.log("-".repeat(90));

  for (const z of zetaRows.sort((a, b) => b.saldoZeta - a.saldoZeta)) {
    let db: DbInv | undefined = byRegistro.get(z.registroId);
    if (!db && z.numero) {
      const cands = (byCcv1Numero.get(z.numero) ?? []).filter(
        (c) => c.company_id === z.protoCompanyId
      );
      if (cands.length === 1) db = cands[0];
    }

    const dbBal = db ? round2(num(db.balance_amount)) : null;
    const diff = dbBal != null ? round2(dbBal - z.saldoZeta) : null;
    let estado = "OK";
    if (!db) {
      estado = "falta";
      falta++;
    } else if (dbBal == null || Math.abs(dbBal - z.saldoZeta) > AMOUNT_TOL) {
      estado = "saldo mal";
      saldoMal++;
    } else {
      ok++;
    }
    if (db && isCreditNoteFromMetadata(db.zeta_metadata)) estado = "NC mal aplicada";

    console.log(
      [
        (z.clienteName ?? "").slice(0, 20),
        z.numero || z.registroId,
        z.currency,
        z.saldoZeta.toFixed(2),
        dbBal == null ? "—" : dbBal.toFixed(2),
        diff == null ? "—" : diff.toFixed(2),
        estado,
      ].join(" | ")
    );
  }

  console.log(`\nResumen: OK=${ok} saldo_mal=${saldoMal} falta=${falta}`);
  console.log("Si saldo_mal domina → sync saldos desactualizado. Si falta → vouchers sin fila DB.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
