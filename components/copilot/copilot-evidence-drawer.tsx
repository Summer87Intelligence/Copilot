"use client";

import { useMemo, useState } from "react";

import {
  COPILOT_ALERTS_EVIDENCE_MOCK,
  type CopilotEvidenceCase,
} from "@/lib/copilot-alerts-evidence-mock";
import { formatLooseDocumentStatus } from "@/lib/copilot-format";
import { CopilotGhostButton, CopilotGhostLink } from "@/components/copilot/copilot-ui";
import {
  CopilotSeverityBadge,
  copilotSeverityLabel,
} from "@/components/copilot/copilot-severity-badge";

type DrawerTab = "resumen" | "evidencia" | "movimientos" | "documentos" | "lectura";

const tabs: { id: DrawerTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "evidencia", label: "Evidencia" },
  { id: "movimientos", label: "Movimientos" },
  { id: "documentos", label: "Documentos" },
  { id: "lectura", label: "Lectura IA" },
];

export function CopilotEvidenceDrawer({
  alertId,
  isOpen,
  onClose,
}: {
  alertId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("resumen");
  const [tabScope, setTabScope] = useState(alertId);

  if (alertId !== tabScope) {
    setTabScope(alertId);
    setTab("resumen");
  }

  const data: CopilotEvidenceCase | null = useMemo(() => {
    if (!alertId) return null;
    return COPILOT_ALERTS_EVIDENCE_MOCK[alertId] ?? null;
  }, [alertId]);

  const tabCount = useMemo(() => {
    if (!data) return { evidencia: 0, movimientos: 0, documentos: 0 };
    return {
      evidencia: data.evidence.length,
      movimientos: data.movements.length,
      documentos: data.documents.length,
    };
  }, [data]);

  if (!isOpen || !data) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar respaldo"
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
                  Severidad principal: {copilotSeverityLabel(data.primarySeverity)}
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
            {tabs.map((item) => {
              const active = tab === item.id;
              const count =
                item.id === "evidencia"
                  ? tabCount.evidencia
                  : item.id === "movimientos"
                    ? tabCount.movimientos
                    : item.id === "documentos"
                      ? tabCount.documentos
                      : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                      : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"
                  }`}
                >
                  {item.label}
                  {count != null ? (
                    <span className="rounded-full bg-[var(--copilot-card-bg)]/90 px-2 py-0.5 text-xs font-semibold text-[var(--copilot-ink)]">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
          {tab === "resumen" ? (
            <div className="space-y-4">
              <SectionBlock title="Explicación ejecutiva" content={data.summary.executive} />
              <SectionBlock title="Qué disparó la alerta" content={data.summary.trigger} />
              <SectionBlock title="Impacto estimado" content={data.summary.impact} />
              <SectionBlock title="Recomendación resumida" content={data.summary.recommendation} />
            </div>
          ) : null}

          {tab === "evidencia" ? (
            <div className="space-y-3">
              {data.evidence.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        {item.type}
                      </p>
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                        {item.description}
                      </p>
                    </div>
                    <CopilotSeverityBadge severity={item.severity} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--copilot-ink-muted)]">
                    {item.amount ? <span>Monto: {item.amount}</span> : null}
                    <span>Fecha: {item.date}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "movimientos" ? (
            <div className="space-y-3">
              {data.movements.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{item.label}</p>
                      <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">{item.detail}</p>
                    </div>
                    <CopilotSeverityBadge severity={item.severity} compact />
                  </div>
                  <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">{item.date}</p>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "documentos" ? (
            <div className="space-y-3">
              {data.documents.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{item.name}</p>
                      <p className="text-xs uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        {item.type}
                      </p>
                    </div>
                    <CopilotSeverityBadge severity={item.severity} />
                  </div>
                  <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
                    Estado: {formatLooseDocumentStatus(item.status)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "lectura" ? (
            <div className="space-y-4">
              <SectionBlock title="Patrón detectado" content={data.aiRead.pattern} />
              <SectionBlock title="Por qué se considera relevante" content={data.aiRead.why} />
              <SectionBlock title="Sugerencia del sistema" content={data.aiRead.suggest} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--copilot-border)] px-6 py-4">
          <CopilotGhostLink href="/copilot/clientes">Ir a cliente</CopilotGhostLink>
          <CopilotGhostLink href="/copilot/acciones">Ver acción sugerida</CopilotGhostLink>
          <CopilotGhostButton onClick={onClose}>Cerrar</CopilotGhostButton>
        </div>
      </aside>
    </>
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
