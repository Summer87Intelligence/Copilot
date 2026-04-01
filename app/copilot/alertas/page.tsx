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
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import { CopilotTaxEvidenceDrawer } from "@/components/copilot/copilot-tax-evidence-drawer";
import { copilotInteractiveTextGroupAffordance } from "@/components/copilot/copilot-interactive-text";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { mapAlertCategory } from "@/lib/copilot-format";
import { COPILOT_EMPTY_COPY } from "@/lib/copilot-empty-state";

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
  const {
    items: allAlerts,
    fiscalError: fiscalLoadError,
    predictiveError: predictiveLoadError,
  } = useCopilotAlerts();
  const [selectedId, setSelectedId] = useState("");
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

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
        title="Alertas"
        description="Riesgos y desvíos detectados — priorizados para que sepas dónde mirar primero."
        readingKey={
          <CopilotReadingKey
            lines={[
              "Veo qué requiere atención ya.",
              "Entiendo el nivel de riesgo.",
              "Sé qué conviene revisar primero.",
            ]}
          />
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <CopilotCard className="border-rose-200/80 bg-rose-50/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-900/80">
              Críticas
            </p>
            <p className="mt-2 text-3xl font-semibold text-rose-950">
              {summaryCounts.critical}
            </p>
            <p className="mt-1 text-sm text-rose-900/70">Requieren acción inmediata</p>
          </CopilotCard>
          <CopilotCard className="border-amber-200/80 bg-amber-50/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
              Altas
            </p>
            <p className="mt-2 text-3xl font-semibold text-amber-950">
              {summaryCounts.high}
            </p>
            <p className="mt-1 text-sm text-amber-900/70">Seguimiento esta semana</p>
          </CopilotCard>
          <CopilotCard>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Medias
            </p>
            <p className="mt-2 text-3xl font-semibold text-[var(--copilot-ink)]">
              {summaryCounts.medium}
            </p>
            <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
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

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            {filtered.map((a) => {
              const active = a.id === effectiveSelectedId;
              const evidenceOpenForCard = isEvidenceOpen && a.id === effectiveSelectedId;
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
                      {a.summary}
                    </p>
                  </button>
                  <div className="mt-3">
                    {a.obligationId ? (
                      <CopilotGhostButton
                        onClick={() => {
                          setSelectedId(a.id);
                          setIsEvidenceOpen(true);
                        }}
                        className="w-full justify-center py-2"
                      >
                        Ver respaldo fiscal
                      </CopilotGhostButton>
                    ) : (
                      <p className="rounded-xl bg-[rgba(44,40,37,0.04)] px-3 py-2 text-center text-xs text-[var(--copilot-ink-muted)]">
                        Sin obligación asociada: revisá el detalle a la derecha o en
                        Finanzas / Datos.
                      </p>
                    )}
                  </div>
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
                <CopilotEmptyPanel
                  title={COPILOT_EMPTY_COPY.alertasPage.title}
                  paragraphs={COPILOT_EMPTY_COPY.alertasPage.paragraphs}
                  example={COPILOT_EMPTY_COPY.alertasPage.example}
                  importance="Las alertas no son decorativas: si no hay filas en la base, la pantalla vacía es la lectura correcta."
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
            {selectedAlert ? (
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
                <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                  {selectedAlert.detail}
                </p>
                <div className="rounded-xl border border-dashed border-[var(--copilot-border)] bg-white/60 p-4 text-sm text-[var(--copilot-ink)]">
                  <p className="font-semibold">Próximo paso sugerido</p>
                  <p className="mt-2 text-[var(--copilot-ink-muted)]">
                    Asignar responsable y fecha de seguimiento en la vista Acciones.
                  </p>
                </div>
                {selectedAlert.obligationId ? (
                  <div className="flex items-center justify-between rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                        Ver respaldo y evidencia
                      </p>
                      <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                        Abrí trazabilidad completa: origen, registros, movimientos y
                        documentos.
                      </p>
                    </div>
                    <CopilotGhostButton
                      onClick={() => setIsEvidenceOpen(true)}
                      className="shrink-0 whitespace-nowrap"
                    >
                      Ver respaldo fiscal
                    </CopilotGhostButton>
                  </div>
                ) : null}
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
