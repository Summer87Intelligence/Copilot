"use client";

import { useEffect, useState } from "react";

import { copilotApiFetch } from "@/lib/copilot-fetch";

type DevDatasetSummaryOk = {
  ok: true;
  active_company_name: string | null;
  workspace_company_id: string;
  counts: Record<string, number>;
  computedAt: string;
};

type DevDatasetSummaryErr = {
  ok?: false;
  error?: string;
};

const COUNT_LABELS: { key: string; short: string }[] = [
  { key: "proto_companies", short: "empresas" },
  { key: "proto_invoices", short: "facturas" },
  { key: "proto_receipts", short: "recibos" },
  { key: "proto_payments", short: "pagos" },
  { key: "proto_tax_obligations", short: "imp. fiscal" },
  { key: "proto_contacts", short: "contactos" },
];

/**
 * Diagnóstico temporal: conteos activos por tabla (solo dev; datos desde GET /api/copilot/dev-dataset-summary).
 */
export function CopilotDevDatasetSummary() {
  const [state, setState] = useState<
    | { status: "idle" | "loading" }
    | { status: "ok"; data: DevDatasetSummaryOk }
    | { status: "err"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let cancelled = false;
    void (async () => {
      setState({ status: "loading" });
      const res = await copilotApiFetch("/api/copilot/dev-dataset-summary");
      const json = (await res.json()) as DevDatasetSummaryOk | DevDatasetSummaryErr;
      if (cancelled) return;
      if (!res.ok || !json || typeof json !== "object" || (json as DevDatasetSummaryErr).ok === false) {
        const msg =
          (json as DevDatasetSummaryErr)?.error ??
          (!res.ok ? `HTTP ${res.status}` : "Respuesta inválida");
        setState({ status: "err", message: msg });
        return;
      }
      if ((json as DevDatasetSummaryOk).ok !== true) {
        setState({ status: "err", message: "Respuesta inválida" });
        return;
      }
      setState({ status: "ok", data: json as DevDatasetSummaryOk });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="border-b border-dashed border-slate-500/35 bg-slate-100/90 px-4 py-1 font-mono text-[10px] text-slate-700 dark:bg-slate-900/40 dark:text-slate-200 sm:px-6">
        <span className="mr-2 rounded bg-slate-300/90 px-1 py-0.5 text-[9px] font-semibold uppercase text-slate-900 dark:bg-slate-600 dark:text-slate-50">
          Dev dataset
        </span>
        {state.status === "loading" ? "Cargando conteos…" : "—"}
      </div>
    );
  }

  if (state.status === "err") {
    return (
      <div className="border-b border-dashed border-rose-600/40 bg-rose-50/90 px-4 py-1 font-mono text-[10px] text-rose-900 dark:bg-rose-950/35 dark:text-rose-100 sm:px-6">
        <span className="mr-2 rounded bg-rose-200/90 px-1 py-0.5 text-[9px] font-semibold uppercase dark:bg-rose-800/70">
          Dev dataset
        </span>
        {state.message}
      </div>
    );
  }

  if (state.status !== "ok") {
    return null;
  }

  const { data } = state;
  const company =
    data.active_company_name?.trim() || "—";

  return (
    <div className="border-b border-dashed border-slate-500/35 bg-slate-100/90 px-4 py-1.5 font-mono text-[10px] leading-relaxed text-slate-800 dark:bg-slate-900/40 dark:text-slate-100 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 rounded bg-slate-300/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-900 dark:bg-slate-600 dark:text-slate-50">
          Dev dataset (temporal)
        </span>
        <span className="text-slate-700 dark:text-slate-200">
          Empresa: <strong>{company}</strong>
        </span>
        <code className="rounded bg-white/70 px-1 text-[9px] dark:bg-black/30">
          workspace_company_id={data.workspace_company_id}
        </code>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {COUNT_LABELS.map(({ key, short }) => {
          const n = data.counts[key] ?? 0;
          return (
            <span
              key={key}
              className="inline-flex items-center gap-0.5 rounded border border-slate-400/40 bg-white/80 px-1.5 py-0.5 text-[9px] dark:border-slate-500/40 dark:bg-slate-800/60"
              title={key}
            >
              <span className="text-slate-500 dark:text-slate-400">{short}</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {n}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
