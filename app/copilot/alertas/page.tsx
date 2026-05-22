"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useCopilotAlerts } from "@/components/copilot/copilot-alerts-context";
import { CopilotOperationalStatusSection } from "@/components/copilot/copilot-operational-status-section";
import { CopilotTaxEvidenceDrawer } from "@/components/copilot/copilot-tax-evidence-drawer";
import { CopilotAlertOpsActions } from "@/components/copilot/copilot-alert-ops-actions";
import { copilotInteractiveTextGroupAffordance } from "@/components/copilot/copilot-interactive-text";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotSectionTitle,
  copilotPageMainClass,
} from "@/components/copilot/copilot-ui";
import { CopilotOperationalEmptyState } from "@/components/copilot/copilot-operational-empty-state";
import { mapAlertCategory } from "@/lib/copilot-format";
import { buildCopilotAlertOpsContext } from "@/lib/copilot-alert-ops-mapper";
import { COPILOT_EMPTY_COPY } from "@/lib/copilot-empty-state";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";

type PriorityFilter = "all" | "critical" | "high" | "medium";
type TypeFilter =
  | "all"
  | "fiscalidad"
  | "liquidez"
  | "cobertura"
  | "conciliacion";

const priorityLabel: Record<Exclude<PriorityFilter, "all">, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
};

function CopilotAlertasPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const fromOperationalSource = searchParams.get("source") === "operational";
  const {
    items: allAlerts,
    fiscalError: fiscalLoadError,
    predictiveError: predictiveLoadError,
  } = useCopilotAlerts();
  const [selectedId, setSelectedId] = useState("");
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [openAlertActionById, setOpenAlertActionById] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/operational-actions?limit=120");
        const json = (await res.json()) as { actions?: OperationalActionListItem[] };
        if (!res.ok) return;
        const next: Record<string, string> = {};
        for (const action of json.actions ?? []) {
          if (action.origin !== "alert" || !action.related_entity_id) continue;
          if (!["pending", "in_progress", "blocked"].includes(action.operational_status)) {
            continue;
          }
          if (!next[action.related_entity_id]) {
            next[action.related_entity_id] = action.id;
          }
        }
        setOpenAlertActionById(next);
      } catch {
        /* cola operativa opcional en alertas */
      }
    })();
  }, []);

  useLayoutEffect(() => {
    const raw = searchParams.get("priority");
    if (raw === "critical" || raw === "high" || raw === "medium") {
      setPriority(raw);
    } else {
      setPriority("all");
    }
  }, [searchParams]);

  const setPriorityFilter = useCallback(
    (id: PriorityFilter) => {
      setPriority(id);
      const next = new URLSearchParams(searchParams.toString());
      if (id === "all") {
        next.delete("priority");
      } else {
        next.set("priority", id);
      }
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const summaryCounts = useMemo(() => {
    const fc = { critical: 0, high: 0, medium: 0 };
    for (const a of allAlerts) {
      fc[a.priority] += 1;
    }
    return fc;
  }, [allAlerts]);

  const filtered = useMemo(() => {
    return allAlerts.filter((a) => {
      if (priority !== "all" && a.priority !== priority) return false;
      if (type !== "all" && a.type !== type) return false;
      return true;
    });
  }, [allAlerts, priority, type]);

  const effectiveSelectedId = useMemo(() => {
    if (filtered.length === 0) return null;
    if (filtered.some((a) => a.id === selectedId)) return selectedId;
    return filtered[0].id;
  }, [filtered, selectedId]);

  const selectedAlert = useMemo(() => {
    if (effectiveSelectedId == null) return null;
    return filtered.find((a) => a.id === effectiveSelectedId) ?? null;
  }, [filtered, effectiveSelectedId]);

  const selectedOps = useMemo(
    () => (selectedAlert ? buildCopilotAlertOpsContext(selectedAlert) : null),
    [selectedAlert]
  );

  useEffect(() => {
    if (filtered.length === 0) {
      setIsEvidenceOpen(false);
      return;
    }
    if (filtered.some((a) => a.id === selectedId)) return;
    setIsEvidenceOpen(false);
    setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    const qp = searchParams.get("priority");
    if (qp !== "critical" && qp !== "high" && qp !== "medium") return;
    if (!effectiveSelectedId || filtered.length === 0) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`copilot-alert-card-${effectiveSelectedId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [searchParams, effectiveSelectedId, filtered.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.alertas"
        title="Alertas"
        description="Riesgos y desvíos detectados — priorizados para que sepas dónde mirar primero."
      />

      <div className={copilotPageMainClass}>
        <CopilotOperationalStatusSection scrollIntoView={fromOperationalSource} />

        <CopilotSectionTitle
          title="Alertas detectadas"
          subtitle="Riesgos fiscales, liquidez y conciliación del motor de alertas."
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <CopilotCard className="border-rose-200/70 bg-rose-50/45 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-900/80">
              Críticas
            </p>
            <p className="mt-1 text-2xl font-semibold text-rose-950">
              {summaryCounts.critical}
            </p>
            <p className="mt-0.5 text-xs text-rose-900/70">Acción inmediata</p>
          </CopilotCard>
          <CopilotCard className="border-amber-200/70 bg-amber-50/45 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">
              Altas
            </p>
            <p className="mt-1 text-2xl font-semibold text-amber-950">
              {summaryCounts.high}
            </p>
            <p className="mt-0.5 text-xs text-amber-900/70">Seguimiento semanal</p>
          </CopilotCard>
          <CopilotCard className="py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Medias
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--copilot-ink)]">
              {summaryCounts.medium}
            </p>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
              Monitoreo habitual
            </p>
          </CopilotCard>
        </div>

        <CopilotCard>
          <CopilotSectionTitle
            title="Filtros"
            subtitle="Refiná la lista sin perder el contexto."
          />
          <div className="flex flex-wrap gap-3">
            {fiscalLoadError ? (
              <p className="w-full text-xs text-amber-800/90">
                Alertas fiscales no disponibles: {fiscalLoadError}
              </p>
            ) : null}
            {predictiveLoadError ? (
              <p className="w-full text-xs text-amber-800/90">
                Alertas predictivas no disponibles: {predictiveLoadError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Prioridad
              </span>
              {(
                [
                  ["all", "Todas"],
                  ["critical", "Crítica"],
                  ["high", "Alta"],
                  ["medium", "Media"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPriorityFilter(id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    priority === id
                      ? "bg-[var(--copilot-ink)] text-white"
                      : "bg-white/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="hidden h-8 w-px bg-[var(--copilot-border)] sm:block" />
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Tipo
              </span>
              {(
                [
                  ["all", "Todos"],
                  ["fiscalidad", "Fiscalidad"],
                  ["liquidez", "Liquidez"],
                  ["cobertura", "Cobertura"],
                  ["conciliacion", "Conciliación"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setType(id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    type === id
                      ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                      : "bg-white/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CopilotCard>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            {filtered.map((a) => {
              const active = a.id === effectiveSelectedId;
              const evidenceOpenForCard = isEvidenceOpen && a.id === effectiveSelectedId;
              const ops = buildCopilotAlertOpsContext(a);
              return (
                <div
                  key={a.id}
                  id={`copilot-alert-card-${a.id}`}
                  className={`w-full scroll-mt-24 rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-[rgba(31,107,74,0.35)] bg-white shadow-[var(--copilot-shadow)] ring-1 ring-[rgba(31,107,74,0.12)]"
                      : "border-[var(--copilot-border)] bg-[var(--copilot-card)] hover:bg-white"
                  } ${evidenceOpenForCard ? "ring-2 ring-[rgba(31,107,74,0.22)]" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="group w-full text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <CopilotBadge
                        tone={
                          a.priority === "critical"
                            ? "danger"
                            : a.priority === "high"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {priorityLabel[a.priority]}
                      </CopilotBadge>
                      <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                        {mapAlertCategory(a.type)}
                      </span>
                      {evidenceOpenForCard ? (
                        <span className="rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
                          Respaldo abierto
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={`mt-2 text-sm font-semibold text-[var(--copilot-ink)] ${copilotInteractiveTextGroupAffordance}`}
                    >
                      {a.title}
                    </p>
                    <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                      {ops.impact}
                    </p>
                  </button>
                  <CopilotAlertOpsActions
                    primary={ops.primary}
                    quick={ops.quick}
                    compact
                    followupAlert={a}
                    openOperationalActionId={openAlertActionById[a.id] ?? null}
                    showEvidence={Boolean(a.obligationId)}
                    onOpenEvidence={() => {
                      setSelectedId(a.id);
                      setIsEvidenceOpen(true);
                    }}
                  />
                </div>
              );
            })}
            {allAlerts.length === 0 && (fiscalLoadError || predictiveLoadError) ? (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                {fiscalLoadError ? (
                  <p>No se pudieron cargar alertas fiscales: {fiscalLoadError}</p>
                ) : null}
                {predictiveLoadError ? (
                  <p>No se pudieron cargar alertas predictivas: {predictiveLoadError}</p>
                ) : null}
              </div>
            ) : filtered.length === 0 ? (
              allAlerts.length === 0 ? (
                <CopilotOperationalEmptyState
                  title="Monitoreo activo"
                  status="Última evaluación correcta · sin incidentes detectados"
                  statusTone="healthy"
                  metrics={[
                    { label: "Críticas", value: summaryCounts.critical },
                    { label: "Altas", value: summaryCounts.high },
                    { label: "Medias", value: summaryCounts.medium },
                    { label: "Total", value: allAlerts.length },
                  ]}
                  footnote={COPILOT_EMPTY_COPY.alertasPage.example}
                />
              ) : (
                <p className="text-sm text-[var(--copilot-ink-muted)]">
                  No hay alertas con estos filtros.
                </p>
              )
            ) : null}
          </div>

          <CopilotCard className="lg:col-span-3">
            <CopilotSectionTitle
              title="Detalle"
              subtitle="Contexto y lectura recomendada."
            />
            {selectedAlert && selectedOps ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <CopilotBadge
                    tone={
                      selectedAlert.priority === "critical"
                        ? "danger"
                        : selectedAlert.priority === "high"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {priorityLabel[selectedAlert.priority]}
                  </CopilotBadge>
                  <CopilotBadge tone="neutral">
                    {mapAlertCategory(selectedAlert.type)}
                  </CopilotBadge>
                </div>
                <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">
                  {selectedAlert.title}
                </h3>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                    {selectedOps.impact}
                  </p>
                  <p className="text-sm text-[var(--copilot-ink-muted)]">
                    {selectedOps.whyItMatters}
                  </p>
                </div>
                <CopilotAlertOpsActions
                  primary={selectedOps.primary}
                  quick={selectedOps.quick}
                  followupAlert={selectedAlert}
                  openOperationalActionId={openAlertActionById[selectedAlert.id] ?? null}
                  showEvidence={Boolean(selectedAlert.obligationId)}
                  onOpenEvidence={() => setIsEvidenceOpen(true)}
                />
                <details className="rounded-xl border border-[var(--copilot-border)] bg-white/60 px-4 py-3 text-sm text-[var(--copilot-ink-muted)]">
                  <summary className="cursor-pointer font-semibold text-[var(--copilot-ink)]">
                    Detalle técnico
                  </summary>
                  <p className="mt-3 whitespace-pre-line leading-relaxed">
                    {selectedOps.technicalDetail}
                  </p>
                </details>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--copilot-border)] bg-white/50 px-4 py-8 text-center">
                <p className="text-base font-semibold text-[var(--copilot-ink)]">
                  Sin alerta seleccionada
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                  No hay alertas para los filtros actuales. Ajustá prioridad o tipo para
                  ver detalle.
                </p>
              </div>
            )}
          </CopilotCard>
        </div>
      </div>
      <CopilotTaxEvidenceDrawer
        obligationId={
          isEvidenceOpen && selectedAlert?.obligationId
            ? selectedAlert.obligationId
            : null
        }
        isOpen={isEvidenceOpen && Boolean(selectedAlert?.obligationId)}
        onClose={() => setIsEvidenceOpen(false)}
      />
    </div>
  );
}

export default function CopilotAlertasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-20 text-sm text-[var(--copilot-ink-muted)] transition-opacity duration-200">
          Cargando vista de alertas…
        </div>
      }
    >
      <CopilotAlertasPageContent />
    </Suspense>
  );
}
