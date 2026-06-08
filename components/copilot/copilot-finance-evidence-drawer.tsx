"use client";

import { useMemo, useState } from "react";

import {
  COPILOT_FINANCE_EVIDENCE_MOCK,
  type CopilotFinanceIndicatorId,
} from "@/lib/copilot-finance-evidence-mock";
import { formatLooseDocumentStatus } from "@/lib/copilot-format";
import { CopilotGhostButton, CopilotGhostLink } from "@/components/copilot/copilot-ui";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";

type DrawerTab = "resumen" | "composicion" | "movimientos" | "documentos" | "lectura";

const tabs: { id: DrawerTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "composicion", label: "Composición" },
  { id: "movimientos", label: "Movimientos" },
  { id: "documentos", label: "Documentos" },
  { id: "lectura", label: "Lectura IA" },
];

export function CopilotFinanceEvidenceDrawer({
  indicatorId,
  isOpen,
  onClose,
}: {
  indicatorId: CopilotFinanceIndicatorId | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("resumen");
  const [tabScope, setTabScope] = useState(indicatorId);

  if (indicatorId !== tabScope) {
    setTabScope(indicatorId);
    setTab("resumen");
  }

  const data = useMemo(() => {
    if (!indicatorId) return null;
    return COPILOT_FINANCE_EVIDENCE_MOCK[indicatorId] ?? null;
  }, [indicatorId]);

  if (!isOpen || !data) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar respaldo financiero"
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
                  Indicador financiero
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
                item.id === "composicion"
                  ? data.composition.length
                  : item.id === "movimientos"
                    ? data.movements.length
                    : item.id === "documentos"
                      ? data.documents.length
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
              <SectionBlock title="Qué representa" content={data.summary.represents} />
              <SectionBlock title="Por qué importa" content={data.summary.importance} />
            </div>
          ) : null}

          {tab === "composicion" ? (
            <div className="space-y-3">
              {data.composition.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                        {item.category}
                      </p>
                      <p className="text-sm text-[var(--copilot-ink-muted)]">{item.detail}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                        {item.subtotal}
                      </p>
                      <div className="mt-1">
                        <CopilotSeverityBadge severity={item.severity} compact />
                      </div>
                    </div>
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
                    <CopilotSeverityBadge severity={item.severity} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--copilot-ink-muted)]">
                    <span>Monto: {item.amount}</span>
                    <span>Fecha: {item.date}</span>
                  </div>
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
                    <CopilotSeverityBadge severity={item.severity} compact />
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
              <SectionBlock title="Lectura del riesgo" content={data.aiRead.why} />
              <SectionBlock title="Recomendación" content={data.aiRead.recommend} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--copilot-border)] px-6 py-4">
          <CopilotGhostLink href="/copilot/alertas">Ir a alertas</CopilotGhostLink>
          <CopilotGhostLink href="/copilot/acciones">Ver acciones relacionadas</CopilotGhostLink>
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
