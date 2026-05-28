"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { CopilotCard, CopilotGhostLink } from "@/components/copilot/copilot-ui";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { useOicActividad } from "@/hooks/use-oic-actividad";
import { useOicReconciliacion } from "@/hooks/use-oic-reconciliacion";

type DatasetCounts = {
  companies: number;
  invoices: number;
  receipts: number;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Sin registro";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function DataConfidencePanel() {
  const act = useOicActividad();
  const rec = useOicReconciliacion();
  const [counts, setCounts] = useState<DatasetCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);

  const loadCounts = () => {
    setCountsLoading(true);
    void copilotApiFetch("/api/copilot/dataset?active=active")
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          data?: {
            companies?: unknown[];
            invoices?: unknown[];
            receipts?: unknown[];
          };
        } | null;
        if (json?.ok && json.data) {
          setCounts({
            companies: json.data.companies?.length ?? 0,
            invoices: json.data.invoices?.length ?? 0,
            receipts: json.data.receipts?.length ?? 0,
          });
        } else {
          setCounts(null);
        }
      })
      .catch(() => setCounts(null))
      .finally(() => setCountsLoading(false));
  };

  useEffect(() => {
    loadCounts();
  }, []);

  const status = useMemo((): {
    level: "ok" | "attention" | "critical";
    label: string;
    detail: string;
  } => {
    const failPct = act.data ? Math.round(act.data.failureRateLastDay * 100) : null;
    const conflicts = rec.data?.conflictCount ?? 0;
    const criticalConflicts = rec.data?.criticalCount ?? 0;

    if (act.error || rec.error) {
      return {
        level: "attention",
        label: "Revisar",
        detail: "No se pudo cargar todo el estado de sincronización.",
      };
    }
    if (failPct != null && failPct > 50) {
      return {
        level: "critical",
        label: "Error",
        detail: "Varios procesos de actualización fallaron en las últimas 24 h.",
      };
    }
    if (criticalConflicts > 0 || (failPct != null && failPct > 20)) {
      return {
        level: "attention",
        label: "Revisar",
        detail:
          criticalConflicts > 0
            ? `Hay ${criticalConflicts} conflicto${criticalConflicts === 1 ? "" : "s"} en facturas.`
            : "Algunas actualizaciones requieren atención.",
      };
    }
    if (conflicts > 0) {
      return {
        level: "attention",
        label: "Revisar",
        detail: `${conflicts} factura${conflicts === 1 ? "" : "s"} con diferencias menores.`,
      };
    }
    return {
      level: "ok",
      label: "OK",
      detail: "Los datos se están leyendo con normalidad.",
    };
  }, [act.data, act.error, rec.data, rec.error]);

  const loading = (act.loading && !act.data) || (rec.loading && !rec.data) || countsLoading;

  const StatusIcon =
    status.level === "ok"
      ? CheckCircle2
      : status.level === "critical"
        ? AlertTriangle
        : AlertTriangle;

  const statusColors =
    status.level === "ok"
      ? "border-emerald-200/80 bg-emerald-50/50 text-emerald-900"
      : status.level === "critical"
        ? "border-rose-200/80 bg-rose-50/50 text-rose-950"
        : "border-amber-200/80 bg-amber-50/50 text-amber-950";

  return (
    <CopilotCard className="border-[var(--copilot-border)] bg-white/95">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Confianza del dato
          </p>
          <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
            Esta sección ayuda a saber si Copilot está leyendo información actualizada de Zeta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            act.refetch();
            rec.refetch();
            loadCounts();
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--copilot-accent)] hover:underline"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Actualizar
        </button>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Cargando estado…
        </p>
      ) : (
        <>
          <div className={`mt-4 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${statusColors}`}>
            <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-semibold">Estado: {status.label}</p>
              <p className="mt-0.5 text-xs opacity-90">{status.detail}</p>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Última actualización Zeta
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-[var(--copilot-ink)]">
                {formatWhen(act.data?.lastSuccessAt)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Clientes sincronizados
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums text-[var(--copilot-ink)]">
                {counts?.companies ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Facturas sincronizadas
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums text-[var(--copilot-ink)]">
                {counts?.invoices ?? "—"}
                {rec.data && rec.data.conflictCount > 0 ? (
                  <span className="ml-1 text-xs font-normal text-amber-700">
                    · {rec.data.conflictCount} con revisión
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Recibos sincronizados
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums text-[var(--copilot-ink)]">
                {counts?.receipts ?? "—"}
              </dd>
            </div>
          </dl>

          {act.data && act.data.failureRateLastDay > 0.2 ? (
            <p className="mt-3 text-xs text-amber-800">
              Fallos en pipelines (24 h):{" "}
              {Math.round(act.data.failureRateLastDay * 100)}% de corridas con error.
            </p>
          ) : null}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <CopilotGhostLink href="/copilot/operacional/pipelines" className="text-xs font-semibold">
          Ver pipelines →
        </CopilotGhostLink>
        <Link
          href="/copilot/operacional/reconciliacion"
          className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          Ver reconciliación →
        </Link>
      </div>
    </CopilotCard>
  );
}
