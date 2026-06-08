"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ActionListItem } from "@/lib/ai/action-types";
import { CopilotAssociatedDocumentsSection } from "@/components/copilot/copilot-associated-documents";
import {
  DOCUMENT_RELATED_TABLE,
  getDocumentsByRelation,
  type ProtoDocument,
} from "@/lib/copilot-documents-data";
import { getActionEvidenceCase } from "@/lib/copilot-actions-evidence-mock";
import { CopilotGhostButton, CopilotGhostLink } from "@/components/copilot/copilot-ui";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";
import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";
import {
  mapActionChannel,
  mapExecutionStatus,
  mapOutcomeTypeLabelEs,
} from "@/lib/copilot-format";

type DrawerTab = "resumen" | "origen" | "contexto" | "ejecucion" | "lectura";

const tabs: { id: DrawerTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "origen", label: "Origen" },
  { id: "contexto", label: "Contexto" },
  { id: "ejecucion", label: "Ejecución" },
  { id: "lectura", label: "Lectura IA" },
];

function executionStatusSeverity(status: string): CopilotSeverity {
  const s = status.toLowerCase();
  if (s === "executed") return "low";
  if (s === "failed") return "critical";
  return "medium";
}

function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function CopilotActionsEvidenceDrawer({
  action,
  isOpen,
  onClose,
}: {
  action: ActionListItem | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("resumen");
  const [assocDocs, setAssocDocs] = useState<ProtoDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setTab("resumen");
  }, [action?.id, isOpen]);

  useEffect(() => {
    const actionId = action?.id;
    if (!isOpen || !actionId) {
      setAssocDocs([]);
      setDocsError(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setDocsLoading(true);
      setDocsError(null);
      try {
        const rows = await getDocumentsByRelation(DOCUMENT_RELATED_TABLE.action, actionId);
        if (!cancelled) setAssocDocs(rows);
      } catch (e) {
        if (!cancelled) {
          setAssocDocs([]);
          setDocsError(
            e instanceof Error ? e.message : "No se pudieron cargar documentos asociados."
          );
        }
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, action?.id]);

  const data = useMemo(() => {
    if (!action) return null;
    return getActionEvidenceCase(action);
  }, [action]);

  if (!isOpen || !action || !data) return null;

  const company = action.company_name?.trim() || "Empresa (sin dato)";
  const liveMessage =
    action.action_payload?.suggested_message?.trim() || "—";
  const execSev = executionStatusSeverity(action.execution_status);
  const isExecuted = action.execution_status.toLowerCase() === "executed";

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar respaldo de acción"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-[rgba(19,23,22,0.28)]"
      />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl">
        <div className="border-b border-[var(--copilot-border)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CopilotSeverityBadge severity={data.primarySeverity} />
                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                  {company}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">{data.title}</h3>
              <p className="text-sm text-[var(--copilot-ink-muted)]">{data.subtitle}</p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Actualizado: {data.updatedAt}
              </p>
            </div>
            <CopilotGhostButton onClick={onClose} className="px-3 py-1.5">
              Cerrar
            </CopilotGhostButton>
          </div>
        </div>

        <div className="border-b border-[var(--copilot-border)] px-4">
          <div className="flex flex-wrap gap-2 py-3">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  tab === item.id
                    ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                    : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
          {tab === "resumen" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiPill label="Tipo de acción" value={data.summary.actionTypeLabel} />
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Prioridad
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                      {data.summary.priority}
                    </span>
                    <CopilotSeverityBadge severity={data.summary.prioritySeverity} compact />
                  </div>
                </div>
                <KpiPill label="Canal" value={data.summary.channel} />
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Objetivo
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--copilot-ink)]">
                    {data.summary.objective}
                  </p>
                </div>
              </div>
              <CopilotAssociatedDocumentsSection
                documents={assocDocs}
                loading={docsLoading}
                error={docsError}
              />
            </div>
          ) : null}

          {tab === "origen" ? (
            <div className="space-y-4">
              <SectionBlock title="Iniciativa / decisión" content={data.origin.initiative} />
              <SectionBlock title="Disparador (trigger)" content={data.origin.trigger} />
              {data.origin.score ? (
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">Score</h4>
                    <CopilotSeverityBadge severity={data.origin.scoreSeverity} compact />
                  </div>
                  <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">{data.origin.score}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                  Criticidad del origen
                </span>
                <CopilotSeverityBadge severity={data.origin.originSeverity} />
              </div>
              {data.origin.relatedAlert && data.origin.relatedAlert !== "—" ? (
                <SectionBlock title="Alerta relacionada" content={data.origin.relatedAlert} />
              ) : null}
              {data.origin.relatedInsight && data.origin.relatedInsight !== "—" ? (
                <SectionBlock title="Insight relacionado" content={data.origin.relatedInsight} />
              ) : null}
            </div>
          ) : null}

          {tab === "contexto" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Empresa
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">{company}</p>
              </div>
              <SectionBlock title="Situación comercial o financiera" content={data.context.situation} />
              <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">Dato clave</h4>
                  <CopilotSeverityBadge severity={data.context.contextSeverity} compact />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                  {data.context.keyData}
                </p>
              </div>
            </div>
          ) : null}

          {tab === "ejecucion" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Mensaje / payload (vivo)
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {liveMessage}
                </p>
                <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">
                  Plantilla de referencia: {data.executionTemplate.suggestedMessage}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiPill label="Canal" value={mapActionChannel(action.channel)} />
                <KpiPill label="Creada" value={formatDateShort(action.created_at)} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                <span className="text-sm font-semibold text-[var(--copilot-ink)]">Estado</span>
                <div className="flex flex-wrap items-center gap-2">
                  <CopilotBadgeInline>
                    {mapExecutionStatus(action.execution_status)}
                  </CopilotBadgeInline>
                  <CopilotSeverityBadge severity={execSev} compact />
                </div>
              </div>
              {action.assignee_name?.trim() ||
              action.expected_result?.trim() ||
              action.before_note?.trim() ? (
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                  <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">
                    Seguimiento (persistido)
                  </h4>
                  <dl className="mt-2 space-y-2 text-sm text-[var(--copilot-ink-muted)]">
                    {action.assignee_name?.trim() ? (
                      <div>
                        <dt className="text-xs font-semibold uppercase">Responsable</dt>
                        <dd className="mt-0.5 text-[var(--copilot-ink)]">{action.assignee_name}</dd>
                      </div>
                    ) : null}
                    {action.expected_result?.trim() ? (
                      <div>
                        <dt className="text-xs font-semibold uppercase">Esperado</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-[var(--copilot-ink)]">
                          {action.expected_result}
                        </dd>
                      </div>
                    ) : null}
                    {action.before_note?.trim() ? (
                      <div>
                        <dt className="text-xs font-semibold uppercase">Antes</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-[var(--copilot-ink)]">
                          {action.before_note}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ) : null}
              {action.outcome ? (
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                  <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">
                    Resultado registrado
                  </h4>
                  <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
                    <span className="font-medium text-[var(--copilot-ink)]">Tipo: </span>
                    {mapOutcomeTypeLabelEs(action.outcome.outcome_type)}
                  </p>
                  {action.outcome.notes?.trim() ? (
                    <p className="mt-2 text-sm whitespace-pre-wrap text-[var(--copilot-ink)]">
                      {action.outcome.notes}
                    </p>
                  ) : null}
                  {action.outcome.after_note?.trim() ? (
                    <p className="mt-2 text-sm text-[var(--copilot-ink)]">
                      <span className="font-medium text-[var(--copilot-ink-muted)]">
                        Después:{" "}
                      </span>
                      {action.outcome.after_note}
                    </p>
                  ) : null}
                  {action.outcome.outcome_type === "sale" &&
                  action.outcome.revenue_amount != null ? (
                    <p className="mt-2 text-sm text-[var(--copilot-ink)]">
                      <span className="font-medium text-[var(--copilot-ink-muted)]">
                        Monto:{" "}
                      </span>
                      {action.outcome.revenue_amount.toLocaleString("es-AR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                    Registrado: {formatDateShort(action.outcome.created_at)}
                  </p>
                </div>
              ) : isExecuted ? (
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  Estado cerrado sin outcome en esta vista (revisá listado o permisos).
                </p>
              ) : (
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  Outcome pendiente: registrá el resultado desde la tarjeta principal.
                </p>
              )}
              {isExecuted && data.executionTemplate.outcomeWhenExecuted ? (
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">Resultado</h4>
                    <CopilotSeverityBadge
                      severity={data.executionTemplate.outcomeSeverity ?? "low"}
                      compact
                    />
                  </div>
                  <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
                    {data.executionTemplate.outcomeWhenExecuted}
                  </p>
                </div>
              ) : null}
              <SectionBlock
                title="Ventana sugerida (mock)"
                content={
                  data.executionTemplate.suggestedDate === "—"
                    ? "No aplica para acciones ya cerradas."
                    : data.executionTemplate.suggestedDate
                }
              />
            </div>
          ) : null}

          {tab === "lectura" ? (
            <div className="space-y-4">
              <SectionBlock title="Por qué se eligió esa acción" content={data.aiRead.whyAction} />
              <SectionBlock title="Por qué ese canal" content={data.aiRead.whyChannel} />
              <SectionBlock title="Qué espera conseguir el sistema" content={data.aiRead.expectation} />
              <SectionBlock title="Siguiente paso sugerido" content={data.aiRead.nextStep} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--copilot-border)] px-6 py-4">
          <CopilotGhostLink href="/copilot/alertas">Ir a alertas</CopilotGhostLink>
          <CopilotGhostLink href="/copilot/clientes">Ver cliente</CopilotGhostLink>
          <CopilotGhostButton onClick={onClose}>Cerrar</CopilotGhostButton>
        </div>
      </aside>
    </>
  );
}

function KpiPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--copilot-ink)]">{value}</p>
    </div>
  );
}

function SectionBlock({ title, content }: { title: string; content: string }) {
  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
      <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">{content}</p>
    </section>
  );
}

function CopilotBadgeInline({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-lg bg-[rgba(44,40,37,0.06)] px-2.5 py-1 text-xs font-semibold text-[var(--copilot-ink)]">
      {children}
    </span>
  );
}
