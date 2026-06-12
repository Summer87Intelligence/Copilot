"use client";

import { useEffect, useState } from "react";

import { copilotApiFetch } from "@/lib/copilot-fetch";

type FinancialTraceOk = {
  ok: true;
  active_company_name: string | null;
  workspace_company_id: string;
  tenant_user_email: string | null;
  limit: number;
  counts: {
    invoices: number;
    receipts: number;
    payments: number;
    invoice_financials: number;
  };
  tables: {
    invoices: Array<{
      id: string;
      invoice_number: string;
      total_amount: number | null;
      balance_amount: number | null;
      due_date: string | null;
      company_id: string | null;
      workspace_company_id: string | null;
    }>;
    receipts: Array<{
      id: string;
      receipt_number: string;
      amount: number | null;
      invoice_id: string | null;
      company_id: string | null;
      workspace_company_id: string | null;
      receipt_date: string | null;
    }>;
    payments: Array<{
      id: string;
      payment_number: string;
      amount: number | null;
      invoice_id: string | null;
      company_id: string | null;
      category: string | null;
      workspace_company_id: string | null;
      payment_date: string | null;
    }>;
    invoice_financials: Array<{
      invoice_id: string | null;
      total_amount: number | null;
      payments: number | null;
      balance: number | null;
      workspace_company_id: string | null;
    }>;
  };
  computedAt: string;
};

type FinancialTraceErr = {
  ok?: false;
  error?: string;
};

function money(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/**
 * Diagnóstico temporal de trazabilidad financiera (solo development).
 * Muestra filas fuente acotadas del tenant para validar KPIs en UI.
 */
export function CopilotDevFinancialTrace() {
  const [state, setState] = useState<
    | { status: "idle" | "loading" }
    | { status: "ok"; data: FinancialTraceOk }
    | { status: "err"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let cancelled = false;
    void (async () => {
      setState({ status: "loading" });

      const res = await copilotApiFetch("/api/copilot/dev-financial-trace");
      let json: FinancialTraceOk | FinancialTraceErr;
      try {
        json = (await res.json()) as FinancialTraceOk | FinancialTraceErr;
      } catch {
        json = { ok: false, error: `HTTP ${res.status} sin JSON` };
      }
      if (cancelled) return;
      if (!res.ok || !json || typeof json !== "object" || (json as FinancialTraceErr).ok === false) {
        const msg = (json as FinancialTraceErr).error ?? `HTTP ${res.status}`;
        setState({ status: "err", message: msg });
        return;
      }
      if ((json as FinancialTraceOk).ok !== true) {
        setState({ status: "err", message: "Respuesta inválida" });
        return;
      }
      setState({ status: "ok", data: json as FinancialTraceOk });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (process.env.NODE_ENV !== "development") return null;

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="border-b border-dashed border-cyan-700/40 bg-cyan-50/90 px-4 py-1 text-[10px] text-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100 sm:px-6">
        <span className="mr-2 rounded bg-cyan-200/90 px-1 py-0.5 text-[9px] font-semibold uppercase dark:bg-cyan-800/70">
          Dev trace
        </span>
        Cargando trazabilidad financiera…
      </div>
    );
  }

  if (state.status === "err") {
    return (
      <div className="border-b border-dashed border-[var(--copilot-danger-text)]/40 bg-[var(--copilot-tone-danger-bg)]/90 px-4 py-1 text-[10px] text-[var(--copilot-danger-text-strong)] dark:bg-rose-950/30 dark:text-rose-100 sm:px-6">
        <span className="mr-2 rounded bg-rose-200/90 px-1 py-0.5 text-[9px] font-semibold uppercase dark:bg-rose-800/70">
          Dev trace
        </span>
        {state.message}
      </div>
    );
  }

  if (state.status !== "ok") {
    return null;
  }

  const { data } = state;

  return (
    <div className="border-b border-dashed border-cyan-700/40 bg-cyan-50/90 px-4 py-1.5 font-mono text-[10px] text-cyan-950 dark:bg-cyan-950/30 dark:text-cyan-100 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded bg-cyan-200/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide dark:bg-cyan-800/70">
          Dev financial trace (temporal)
        </span>
        <span>
          Empresa: <strong>{data.active_company_name ?? "—"}</strong>
        </span>
        <code className="rounded bg-[var(--copilot-card-bg)]/70 px-1 dark:bg-black/25">
          workspace={data.workspace_company_id}
        </code>
        <span>usuario: {data.tenant_user_email ?? "—"}</span>
      </div>

      <div className="mt-1 flex flex-wrap gap-1">
        <span className="rounded border border-cyan-400/40 bg-[var(--copilot-card-bg)]/80 px-1.5 py-0.5 dark:bg-cyan-900/40">
          facturas: <strong>{data.counts.invoices}</strong>
        </span>
        <span className="rounded border border-cyan-400/40 bg-[var(--copilot-card-bg)]/80 px-1.5 py-0.5 dark:bg-cyan-900/40">
          recibos: <strong>{data.counts.receipts}</strong>
        </span>
        <span className="rounded border border-cyan-400/40 bg-[var(--copilot-card-bg)]/80 px-1.5 py-0.5 dark:bg-cyan-900/40">
          pagos: <strong>{data.counts.payments}</strong>
        </span>
        <span className="rounded border border-cyan-400/40 bg-[var(--copilot-card-bg)]/80 px-1.5 py-0.5 dark:bg-cyan-900/40">
          invoice_financials: <strong>{data.counts.invoice_financials}</strong>
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer font-semibold">Facturas (top {data.limit})</summary>
        <div className="mt-1 space-y-1">
          {data.tables.invoices.map((r: FinancialTraceOk["tables"]["invoices"][number]) => (
            <div key={r.id} className="rounded border border-cyan-500/25 bg-[var(--copilot-card-bg)]/70 px-2 py-1 dark:bg-cyan-950/25">
              {r.invoice_number} · total {money(r.total_amount)} · saldo {money(r.balance_amount)} · due {r.due_date ?? "—"} · company {r.company_id ?? "—"}
            </div>
          ))}
        </div>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer font-semibold">Recibos (top {data.limit})</summary>
        <div className="mt-1 space-y-1">
          {data.tables.receipts.map((r: FinancialTraceOk["tables"]["receipts"][number]) => (
            <div key={r.id} className="rounded border border-cyan-500/25 bg-[var(--copilot-card-bg)]/70 px-2 py-1 dark:bg-cyan-950/25">
              {r.receipt_number} · amount {money(r.amount)} · invoice {r.invoice_id ?? "—"} · company {r.company_id ?? "—"}
            </div>
          ))}
        </div>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer font-semibold">Pagos (top {data.limit})</summary>
        <div className="mt-1 space-y-1">
          {data.tables.payments.map((r: FinancialTraceOk["tables"]["payments"][number]) => (
            <div key={r.id} className="rounded border border-cyan-500/25 bg-[var(--copilot-card-bg)]/70 px-2 py-1 dark:bg-cyan-950/25">
              {r.payment_number} · amount {money(r.amount)} · invoice {r.invoice_id ?? "—"} · company {r.company_id ?? "—"} · cat {r.category ?? "—"}
            </div>
          ))}
        </div>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer font-semibold">invoice_financials (top {data.limit})</summary>
        <div className="mt-1 space-y-1">
          {data.tables.invoice_financials.map(
            (r: FinancialTraceOk["tables"]["invoice_financials"][number], idx: number) => (
            <div
              key={`${r.invoice_id ?? "no-invoice"}-${idx}`}
              className="rounded border border-cyan-500/25 bg-[var(--copilot-card-bg)]/70 px-2 py-1 dark:bg-cyan-950/25"
            >
              invoice {r.invoice_id ?? "—"} · total {money(r.total_amount)} · payments {money(r.payments)} · balance {money(r.balance)} · ws {r.workspace_company_id ?? "—"}
            </div>
            )
          )}
        </div>
      </details>
    </div>
  );
}
