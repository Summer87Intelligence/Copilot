"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";
import {
  mapPriority,
  mapTaxObligationStatus,
  mapTaxPaymentMethod,
  mapTaxPaymentRecordStatus,
  mapTaxTypeLabel,
  sharedObligationPaymentStatusPillClass,
  taxPriorityToSeverity,
} from "@/lib/copilot-format";
import { CopilotAssociatedDocumentsSection } from "@/components/copilot/copilot-associated-documents";
import {
  DOCUMENT_RELATED_TABLE,
  getDocumentsByRelation,
  type ProtoDocument,
} from "@/lib/copilot-documents-data";
import {
  getDocumentEvidenceUiLine,
  getObligationDocumentStatus,
} from "@/lib/copilot-document-intelligence";
import {
  getProtoTaxObligationById,
  getTaxPaymentsByObligation,
  type ProtoTaxObligation,
  type ProtoTaxPayment,
} from "@/lib/copilot-tax-data";

type DrawerTab = "resumen" | "obligacion" | "pagos" | "documentos" | "lectura";

const tabs: { id: DrawerTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "obligacion", label: "Obligación" },
  { id: "pagos", label: "Pagos" },
  { id: "documentos", label: "Documentos" },
  { id: "lectura", label: "Lectura IA" },
];

function formatMoney(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function SectionBlock({ title, content }: { title: string; content: string }) {
  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
      <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">{content}</p>
    </section>
  );
}

function buildExecutiveSummary(o: ProtoTaxObligation): string {
  const tipo = mapTaxTypeLabel(o.tax_type);
  return `Obligación ${tipo} — ${o.period_label}. El vencimiento operativo es el ${formatDate(o.due_date)}. Monto referencial estimado ${formatMoney(o.estimated_amount)}. La prioridad marcada permite ordenar la agenda fiscal frente a otras salidas de caja.`;
}

function buildCashImpact(o: ProtoTaxObligation): string {
  const remaining = Math.max(0, o.estimated_amount - (o.confirmed_amount ?? 0));
  if (o.status === "paid") {
    return "Sin salida pendiente: la obligación figura como pagada. El efecto en caja ya ocurrió en las fechas de pago registradas.";
  }
  return `Salida de caja aún requerida (aprox. ${formatMoney(remaining)}), sujeta a confirmación contable y comprobantes. Convive con otras obligaciones del mismo mes; conviene calendarizar junto a nómina y proveedores críticos.`;
}

function buildUrgency(o: ProtoTaxObligation): string {
  if (o.status === "overdue") {
    return "Crítica: atrasada. Hay riesgo de recargos, intereses y ajustes de fiscalización si no se regulariza.";
  }
  if (o.priority === "critical") {
    return "Alta: prioridad crítica en el semáforo interno — coordinar pago y documentación con tiempo.";
  }
  if (o.priority === "high") {
    return "Elevada: conviene cerrar la liquidación antes del vencimiento para evitar apreturas de tesorería.";
  }
  return "Moderada: seguimiento habitual dentro del calendario fiscal.";
}

function mockDocuments(o: ProtoTaxObligation) {
  return [
    {
      id: "d1",
      name: "Declaración jurada / formulario",
      type: "Declaración",
      status: o.status === "paid" ? "Presentada y cerrada" : "En preparación o presentada",
    },
    {
      id: "d2",
      name: "Comprobante de liquidación",
      type: "Comprobante",
      status: o.confirmed_amount != null ? "Parcialmente aplicado" : "Pendiente de cierre",
    },
    {
      id: "d3",
      name: "Acreditación bancaria",
      type: "Pago",
      status: o.status === "paid" ? "Acreditada" : "Sin acreditar",
    },
    {
      id: "d4",
      name: "Referencia organismo",
      type: "Referencia",
      status: "DGI / BPS / según tipo",
    },
  ];
}

function mockAiRead(o: ProtoTaxObligation): { why: string; risk: string; suggest: string } {
  return {
    why: `Esta obligación concentra atención porque impacta ${mapTaxTypeLabel(o.tax_type)} en el período ${o.period_label}, con lectura clara de vencimiento y monto.`,
    risk:
      o.status === "overdue"
        ? "Si no se regulariza, la presión de caja puede aumentar por recargos y el costo financiero implícito del incumplimiento."
        : "Si se posterga el pago más allá del vencimiento, se suma incertidumbre de caja y cumplimiento.",
    suggest:
      o.status === "paid"
        ? "Mantener archivo digital de comprobantes y conciliar contra extractos; revisar próximo período."
        : "Agendar salida en tesorería, validar monto con contador y dejar referencia de pago lista antes del vencimiento.",
  };
}

export function CopilotTaxEvidenceDrawer({
  obligationId,
  isOpen,
  onClose,
}: {
  obligationId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("resumen");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [obligation, setObligation] = useState<ProtoTaxObligation | null>(null);
  const [payments, setPayments] = useState<ProtoTaxPayment[]>([]);
  const [assocDocs, setAssocDocs] = useState<ProtoDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setTab("resumen");
  }, [obligationId, isOpen]);

  useEffect(() => {
    if (!isOpen || !obligationId) {
      setObligation(null);
      setPayments([]);
      setAssocDocs([]);
      setDocsError(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setDocsLoading(true);
      setError(null);
      setDocsError(null);
      try {
        const [obl, pays] = await Promise.all([
          getProtoTaxObligationById(obligationId),
          getTaxPaymentsByObligation(obligationId),
        ]);
        if (cancelled) return;
        setObligation(obl);
        setPayments(pays);
        if (!obl) setError("No se encontró la obligación fiscal.");

        let linked: ProtoDocument[] = [];
        try {
          linked = await getDocumentsByRelation(
            DOCUMENT_RELATED_TABLE.taxObligation,
            obligationId
          );
        } catch (de) {
          if (!cancelled) {
            setDocsError(
              de instanceof Error ? de.message : "No se pudieron cargar documentos asociados."
            );
          }
        }
        if (!cancelled) setAssocDocs(linked);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "No se pudo cargar el respaldo fiscal.");
          setObligation(null);
          setPayments([]);
          setAssocDocs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setDocsLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, obligationId]);

  const mockDocsList = useMemo(() => (obligation ? mockDocuments(obligation) : []), [obligation]);
  const documentEvidenceLine = useMemo(() => {
    if (!obligation) return "";
    const st = getObligationDocumentStatus(obligation, assocDocs);
    return getDocumentEvidenceUiLine(obligation, st);
  }, [obligation, assocDocs]);
  const hasRealDocuments = assocDocs.length > 0;
  const documentosTabCount = hasRealDocuments ? assocDocs.length : mockDocsList.length;
  const ai = useMemo(() => (obligation ? mockAiRead(obligation) : null), [obligation]);

  if (!isOpen || !obligationId) return null;

  const title = obligation
    ? `${mapTaxTypeLabel(obligation.tax_type)} · ${obligation.period_label}`
    : "Obligación fiscal";

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar respaldo fiscal"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-[rgba(19,23,22,0.28)]"
      />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl">
        <div className="border-b border-[var(--copilot-border)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              {obligation ? (
                <div className="flex flex-wrap items-center gap-2">
                  <CopilotSeverityBadge
                    severity={taxPriorityToSeverity(obligation.priority)}
                  />
                  <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                    {mapTaxObligationStatus(obligation.status)}
                  </span>
                </div>
              ) : (
                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                  Respaldo fiscal
                </span>
              )}
              <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">{title}</h3>
              {obligation ? (
                <p className="text-sm text-[var(--copilot-ink-muted)]">
                  Vence el {formatDate(obligation.due_date)} · Estimado{" "}
                  {formatMoney(obligation.estimated_amount)}
                </p>
              ) : null}
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
                item.id === "pagos"
                  ? payments.length
                  : item.id === "documentos"
                    ? documentosTabCount
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
          {loading ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Cargando respaldo…</p>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-4 py-3 text-sm text-[var(--copilot-danger-text-strong)]">
              {error}
            </div>
          ) : null}

          {!loading && obligation && tab === "resumen" ? (
            <div className="space-y-4">
              <SectionBlock title="Lectura ejecutiva" content={buildExecutiveSummary(obligation)} />
              <SectionBlock title="Impacto en caja" content={buildCashImpact(obligation)} />
              <SectionBlock title="Nivel de urgencia" content={buildUrgency(obligation)} />
              <SectionBlock title="Respaldo documental" content={documentEvidenceLine} />
              <CopilotAssociatedDocumentsSection
                documents={assocDocs}
                loading={docsLoading}
                error={docsError}
              />
            </div>
          ) : null}

          {!loading && obligation && tab === "obligacion" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Kv label="Impuesto" value={mapTaxTypeLabel(obligation.tax_type)} />
              <Kv label="Período" value={obligation.period_label} />
              <Kv label="Vencimiento" value={formatDate(obligation.due_date)} />
              <Kv
                label="Estado"
                value={
                  <span
                    className={sharedObligationPaymentStatusPillClass(obligation.status)}
                  >
                    {mapTaxObligationStatus(obligation.status)}
                  </span>
                }
              />
              <Kv label="Prioridad" value={mapPriority(obligation.priority)} />
              <Kv label="Monto estimado" value={formatMoney(obligation.estimated_amount)} />
              <Kv
                label="Monto confirmado"
                value={
                  obligation.confirmed_amount != null
                    ? formatMoney(obligation.confirmed_amount)
                    : "—"
                }
              />
              {obligation.notes ? (
                <div className="sm:col-span-2">
                  <SectionBlock title="Notas" content={obligation.notes} />
                </div>
              ) : null}
            </div>
          ) : null}

          {!loading && obligation && tab === "pagos" ? (
            <div className="space-y-3">
              {payments.length === 0 ? (
                <p className="text-sm text-[var(--copilot-ink-muted)]">
                  No hay pagos registrados para esta obligación.
                </p>
              ) : (
                payments.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                        {formatMoney(p.amount)}
                      </p>
                      <span
                        className={sharedObligationPaymentStatusPillClass(p.status)}
                      >
                        {mapTaxPaymentRecordStatus(p.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                      {formatDate(p.payment_date)} · {mapTaxPaymentMethod(p.payment_method)}
                    </p>
                    {p.reference ? (
                      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                        Ref. {p.reference}
                      </p>
                    ) : null}
                    {p.notes ? (
                      <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">{p.notes}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}

          {!loading && obligation && tab === "documentos" ? (
            <div className="space-y-4">
              {docsLoading && !hasRealDocuments ? (
                <p className="text-sm text-[var(--copilot-ink-muted)]">Cargando documentos…</p>
              ) : hasRealDocuments ? (
                <CopilotAssociatedDocumentsSection
                  documents={assocDocs}
                  loading={false}
                  error={docsError}
                  showHeader={false}
                />
              ) : (
                <>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    No hay filas en{" "}
                    <code className="rounded bg-[rgba(44,40,37,0.06)] px-1">proto_documents</code>{" "}
                    para esta obligación. Vista ilustrativa de documentos típicos:
                  </p>
                  <div className="space-y-3">
                    {mockDocsList.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4"
                      >
                        <p className="text-sm font-semibold text-[var(--copilot-ink)]">{d.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          {d.type}
                        </p>
                        <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
                          Estado: {d.status}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {!loading && obligation && tab === "lectura" && ai ? (
            <div className="space-y-4">
              <SectionBlock title="Por qué es importante" content={ai.why} />
              <SectionBlock title="Riesgo si no se atiende" content={ai.risk} />
              <SectionBlock title="Recomendación del sistema" content={ai.suggest} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--copilot-border)] px-6 py-4">
          <CopilotGhostButton type="button" className="px-3 py-2" onClick={onClose}>
            Cerrar
          </CopilotGhostButton>
        </div>
      </aside>
    </>
  );
}

function Kv({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <div className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">{value}</div>
    </div>
  );
}
