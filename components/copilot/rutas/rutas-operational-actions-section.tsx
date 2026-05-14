"use client";

import { useEffect, useState } from "react";

import {
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { OperationalActionSlaSummary } from "@/lib/copilot-operational-actions-types";

const EMPTY_SLA: OperationalActionSlaSummary = {
  overdue: 0,
  dueToday: 0,
  dueSoon: 0,
  noDueDate: 0,
  blockedCritical: 0,
};

export function RutasOperationalActionsSection() {
  const [sla, setSla] = useState<OperationalActionSlaSummary>(EMPTY_SLA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await copilotApiFetch("/api/copilot/operational-actions?limit=120");
        const json = (await res.json()) as { sla_summary?: OperationalActionSlaSummary };
        if (res.ok) {
          setSla(json.sla_summary ?? EMPTY_SLA);
        } else {
          setSla(EMPTY_SLA);
        }
      } catch {
        setSla(EMPTY_SLA);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const hasSignal =
    sla.overdue > 0 || sla.dueToday > 0 || sla.blockedCritical > 0;

  if (!loading && !hasSignal) return null;

  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Seguimiento operativo"
        subtitle="Acciones persistidas con vencimiento y responsable."
      />
      {loading ? (
        <p className="text-sm text-[var(--copilot-ink-muted)]">Cargando seguimiento…</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {sla.overdue > 0 ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-900">
              Vencidas: {sla.overdue}
            </span>
          ) : null}
          {sla.dueToday > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-950">
              Para hoy: {sla.dueToday}
            </span>
          ) : null}
          {sla.blockedCritical > 0 ? (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-semibold text-orange-950">
              Críticas bloqueadas: {sla.blockedCritical}
            </span>
          ) : null}
          <CopilotGhostLink href="/copilot/acciones" className="px-0 text-xs font-semibold">
            Abrir cola
          </CopilotGhostLink>
        </div>
      )}
    </CopilotCard>
  );
}
