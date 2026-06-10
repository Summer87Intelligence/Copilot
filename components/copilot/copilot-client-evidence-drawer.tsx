"use client";

import { useEffect, useMemo, useState } from "react";

import { CopilotAssociatedDocumentsSection } from "@/components/copilot/copilot-associated-documents";
import { CopilotGhostButton, CopilotGhostLink } from "@/components/copilot/copilot-ui";
import {
  CopilotSeverityBadge,
  copilotSeverityLabel,
} from "@/components/copilot/copilot-severity-badge";
import {
  DOCUMENT_RELATED_TABLE,
  getDocumentsByRelation,
  type ProtoDocument,
} from "@/lib/copilot-documents-data";
import {
  clientRiskToCopilotSeverity,
  formatMoneyPortfolio,
  paymentBehaviorLabelEs,
  type ClientCompanyDetail,
} from "@/lib/copilot-clients-portfolio";

type DrawerTab = "resumen" | "facturas" | "recibos" | "contactos";

const tabs: { id: DrawerTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "facturas", label: "Facturas" },
  { id: "recibos", label: "Recibos" },
  { id: "contactos", label: "Contactos" },
];

function formatDateShort(ymd: string): string {
  if (ymd === "—" || !ymd) return ymd;
  try {
    return new Date(ymd + "T12:00:00").toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

export function CopilotClientEvidenceDrawer({
  detail,
  isOpen,
  onClose,
}: {
  detail: ClientCompanyDetail | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("resumen");
  const [assocDocs, setAssocDocs] = useState<ProtoDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setTab("resumen");
  }, [detail?.company_id, isOpen]);

  useEffect(() => {
    const companyId = detail?.company_id;
    if (!isOpen || !companyId) {
      setAssocDocs([]);
      setDocsError(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setDocsLoading(true);
      setDocsError(null);
      try {
        const rows = await getDocumentsByRelation(DOCUMENT_RELATED_TABLE.company, companyId);
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
  }, [isOpen, detail?.company_id]);

  const visibleTabs = useMemo(() => {
    if (!detail) return tabs;
    return tabs.filter((t) => {
      if (t.id === "contactos") return detail.contacts.length > 0;
      return true;
    });
  }, [detail]);

  if (!isOpen || !detail) return null;

  const riskSev = clientRiskToCopilotSeverity(detail.risk);
  const billingUyu = detail.billing_uyu ?? 0;
  const billingUsd = detail.billing_usd ?? 0;
  const debtUyu = detail.debt_uyu ?? 0;
  const debtUsd = detail.debt_usd ?? 0;
  const overdueUyu = detail.overdue_uyu ?? 0;
  const overdueUsd = detail.overdue_usd ?? 0;
  const hasAnyOverdue = overdueUyu > 0 || overdueUsd > 0;
  const hasAnyDebt = debtUyu > 0 || debtUsd > 0;
  const narrative = [
    `Facturación acumulada ${fmtCurrencyPair(billingUyu, billingUsd)} con participación ${(detail.share_pct * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% del total cargado.`,
    hasAnyOverdue
      ? `Deuda vencida: ${fmtCurrencyPair(overdueUyu, overdueUsd)} sobre saldo total ${fmtCurrencyPair(debtUyu, debtUsd)}.`
      : hasAnyDebt
        ? `Deuda actual sin vencer (o al día según vencimientos): ${fmtCurrencyPair(debtUyu, debtUsd)}.`
        : "Sin deuda actual en facturas con balance.",
    `Comportamiento de pago estimado: ${paymentBehaviorLabelEs(detail.payment_behavior).toLowerCase()}, según mix de facturas pagadas, parciales y vencidas.`,
  ].join(" ");

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar respaldo"
        onClick={onClose}
        className="fixed inset-x-0 top-[56px] bottom-0 z-30 bg-[rgba(19,23,22,0.28)]"
      />
      <aside className="fixed top-[56px] bottom-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl">
        <div className="border-b border-[var(--copilot-border)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CopilotSeverityBadge severity={riskSev} />
                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                  Riesgo cartera: {copilotSeverityLabel(riskSev)}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">
                {detail.company_name}
              </h3>
              <p className="text-sm text-[var(--copilot-ink-muted)]">
                {detail.industry !== "—" ? detail.industry : "Industria no informada"}
              </p>
              <CopilotGhostLink
                href={`/copilot/clientes/${encodeURIComponent(detail.company_id)}`}
                className="mt-2 inline-flex px-3 py-1.5 text-xs"
              >
                Ver ficha completa
              </CopilotGhostLink>
            </div>
            <CopilotGhostButton onClick={onClose} className="px-3 py-1.5">
              Cerrar
            </CopilotGhostButton>
          </div>
        </div>

        <div className="border-b border-[var(--copilot-border)] px-4">
          <div className="flex flex-wrap gap-2 py-3">
            {visibleTabs.map((item) => {
              const active = tab === item.id;
              const count =
                item.id === "facturas"
                  ? detail.invoices.length
                  : item.id === "recibos"
                    ? detail.receipts.length
                    : item.id === "contactos"
                      ? detail.contacts.length
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
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Basado en facturas y cobros registrados en Copilot.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiPillMoney label="Facturación total" uyu={detail.billing_uyu} usd={detail.billing_usd} />
                <KpiPillMoney label="Deuda actual" uyu={detail.debt_uyu} usd={detail.debt_usd} />
                <KpiPillMoney label="Deuda vencida" uyu={detail.overdue_uyu} usd={detail.overdue_usd} />
                <KpiPill
                  label="Concentración"
                  value={`${(detail.share_pct * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}
                />
                {(detail.debt_uyu ?? 0) > 0 || (detail.debt_usd ?? 0) > 0 ? (
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Deuda por moneda
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                      {(detail.debt_uyu ?? 0) > 0 ? (
                        <span className="text-sm tabular-nums text-[var(--copilot-ink)]">
                          {formatMoneyPortfolio(detail.debt_uyu!, "UYU")}
                          <span className="ml-1 text-xs text-[var(--copilot-ink-muted)]">UYU</span>
                        </span>
                      ) : null}
                      {(detail.debt_usd ?? 0) > 0 ? (
                        <span className="text-sm tabular-nums text-amber-900">
                          {formatMoneyPortfolio(detail.debt_usd!, "USD")}
                          <span className="ml-1 text-xs text-amber-700">USD</span>
                        </span>
                      ) : null}
                    </div>
                    {detail.has_mixed_currency ? (
                      <p className="mt-1 text-[10px] text-[var(--copilot-ink-muted)]">
                        Facturación en UYU y USD
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Comportamiento de pago
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">
                    {paymentBehaviorLabelEs(detail.payment_behavior)}
                  </p>
                </div>
              </div>
              <SectionBlock title="Lectura operativa" content={narrative} />
              <CopilotAssociatedDocumentsSection
                documents={assocDocs}
                loading={docsLoading}
                error={docsError}
              />
            </div>
          ) : null}

          {tab === "facturas" ? (
            <div className="space-y-2">
              {detail.invoices.length === 0 ? (
                <p className="text-sm text-[var(--copilot-ink-muted)]">
                  No hay facturas vinculadas a esta empresa.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.invoices.map((inv) => (
                    <li
                      key={inv.id}
                      className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-semibold text-[var(--copilot-ink)]">
                          {inv.invoice_number}
                        </p>
                        <span className="text-xs uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          {inv.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                        Emisión {formatDateShort(inv.issue_date)} · Vence{" "}
                        {formatDateShort(inv.due_date)}
                      </p>
                      <p className="mt-2 tabular-nums text-[var(--copilot-ink)]">
                        Total{" "}
                        {inv.currency_code
                          ? formatMoneyPortfolio(inv.total_amount, inv.currency_code)
                          : <span>{inv.total_amount.toLocaleString("es-UY")} <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">sin moneda</span></span>
                        }{" "}
                        · Saldo{" "}
                        <span
                          className={
                            inv.balance_amount > 0 ? "font-semibold text-amber-900" : ""
                          }
                        >
                          {inv.currency_code
                            ? formatMoneyPortfolio(inv.balance_amount, inv.currency_code)
                            : <span>{inv.balance_amount.toLocaleString("es-UY")} <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">sin moneda</span></span>
                          }
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "recibos" ? (
            <div className="space-y-2">
              {detail.receipts.length === 0 ? (
                <p className="text-sm text-[var(--copilot-ink-muted)]">
                  No hay recibos vinculados a esta empresa.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.receipts.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 text-sm"
                    >
                      <p className="font-semibold tabular-nums text-emerald-800">
                        {r.currency_code
                          ? formatMoneyPortfolio(r.amount, r.currency_code)
                          : <span>{r.amount.toLocaleString("es-UY")} <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">sin moneda</span></span>
                        }
                      </p>
                      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                        Fecha {formatDateShort(r.receipt_date)}
                        {r.invoice_id
                          ? ` · Factura ${r.invoice_id.slice(0, 8)}…`
                          : <span className="ml-1 italic">· vinculación no disponible (Zeta)</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "contactos" ? (
            <div className="space-y-2">
              {detail.contacts.length === 0 ? (
                <p className="text-sm text-[var(--copilot-ink-muted)]">
                  No hay contactos registrados para este cliente.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.contacts.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 text-sm"
                    >
                      <p className="font-semibold text-[var(--copilot-ink)]">{c.name}</p>
                      {c.title ? (
                        <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{c.title}</p>
                      ) : null}
                      {c.email ? (
                        <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{c.email}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--copilot-border)] px-6 py-4">
          <CopilotGhostLink href="/copilot/cartera">Ver cartera</CopilotGhostLink>
          <CopilotGhostLink href="/copilot/operacional">Ver alertas</CopilotGhostLink>
          <CopilotGhostButton onClick={onClose}>Cerrar</CopilotGhostButton>
        </div>
      </aside>
    </>
  );
}

// Rule: UYU-only → "$ X" | USD-only → "U$S X" | mixed → "$ X · U$S Y"
function fmtCurrencyPair(uyu: number, usd: number): string {
  if (uyu > 0 && usd > 0)
    return `${formatMoneyPortfolio(uyu, "UYU")} · ${formatMoneyPortfolio(usd, "USD")}`;
  if (usd > 0) return formatMoneyPortfolio(usd, "USD");
  return formatMoneyPortfolio(uyu, "UYU");
}

function KpiPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">{value}</p>
    </div>
  );
}

function KpiPillMoney({
  label,
  uyu,
  usd,
}: {
  label: string;
  uyu?: number | null;
  usd?: number | null;
}) {
  const uyuAmt = uyu ?? 0;
  const usdAmt = usd ?? 0;
  const mixed = uyuAmt > 0 && usdAmt > 0;
  const usdOnly = usdAmt > 0 && uyuAmt === 0;
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      {!usdOnly && (
        <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">
          {formatMoneyPortfolio(uyuAmt, "UYU")}
        </p>
      )}
      {usdAmt > 0 && (
        <p className={`${mixed ? "mt-0.5" : "mt-2"} text-sm font-semibold text-amber-900`}>
          {formatMoneyPortfolio(usdAmt, "USD")}
        </p>
      )}
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
