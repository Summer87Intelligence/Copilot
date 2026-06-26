"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Copy,
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  PenLine,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  X,
  XCircle,
} from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CollectionMessageAssistant } from "@/components/copilot/clientes/collection-message-assistant";
import { CollectionFollowupForm } from "@/components/copilot/clientes/collection-followup-form";
import { ClientAgentBlock } from "@/components/copilot/clientes/client-agent-block";
import { ClientNextStepBanner } from "@/components/copilot/clientes/client-next-step-banner";
import { CopilotDataProvenanceStrip } from "@/components/copilot/copilot-data-provenance-strip";
import { ClientPaymentBehaviorCard } from "@/components/copilot/payment-behavior/client-payment-behavior-card";
import { AccountStatementSendCard } from "@/components/copilot/clientes/account-statement-send-card";
import type { Client360Payload, TransferAlias } from "@/lib/copilot-client-360";
import {
  deriveClientDebtStatus,
  CLIENT_DEBT_STATUS_LABEL,
} from "@/lib/copilot-client-debt-status";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { normalizeUruguayPhoneForWhatsApp } from "@/lib/phone/normalize-phone-for-whatsapp";
import {
  buildClientOperationalSummary,
  type OperationalHintSeverity,
  type TimelineEvent,
} from "@/lib/copilot-client-operational-summary";
import {
  metricValueClass,
  neutralFinancialCardClass,
  subtleLabelClass,
  warningFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";

const RESUMEN_ACTIVITY_LIMIT = 5;
const SESSION_TAB_KEY = "copilot-client360-active-tab";

type SectionNavId = "resumen" | "cobranza" | "cuenta" | "facturas" | "cobros" | "datos" | "transferencias";

const SECTION_NAV_TABS: { id: SectionNavId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "cobranza", label: "Cobranza" },
  { id: "cuenta", label: "Estado de cuenta" },
  { id: "facturas", label: "Facturas" },
  { id: "cobros", label: "Cobros" },
  { id: "datos", label: "Datos" },
  { id: "transferencias", label: "Formas de transferencia" },
];

function Client360TabNav({
  activeTab,
  onTabChange,
}: {
  activeTab: SectionNavId;
  onTabChange: (id: SectionNavId) => void;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-[var(--copilot-border)] bg-[var(--copilot-tab-bg)] backdrop-blur-sm">
      <nav
        className="flex overflow-x-auto scrollbar-none px-2"
        aria-label="Secciones de la ficha"
      >
        {SECTION_NAV_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-[13px] transition-colors ${
              activeTab === tab.id
                ? "border-[var(--copilot-accent)] font-semibold text-[var(--copilot-tab-active-text)]"
                : "border-transparent font-medium text-[var(--copilot-tab-text)] hover:border-[var(--copilot-border)] hover:text-[var(--copilot-text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatMoney(n: number, currency?: string | null): string {
  const sym = currency === "USD" ? "U$S" : "$";
  return `${sym} ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function formatDateShort(ymd: string): string {
  if (!ymd || ymd === "—") return ymd;
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

function formatRelativeDays(ymd: string): string {
  try {
    const d = new Date(ymd + "T12:00:00Z");
    const now = new Date();
    const diff = Math.round((now.getTime() - d.getTime()) / 86_400_000);
    if (diff === 0) return "hoy";
    if (diff === 1) return "ayer";
    if (diff < 30) return `hace ${diff} días`;
    if (diff < 60) return "hace ~1 mes";
    return formatDateShort(ymd);
  } catch {
    return formatDateShort(ymd);
  }
}

// ─── Technical reference cleaners ────────────────────────────────────────────

function cleanMovementLabel(label: string): string {
  if (!label || /^ZETA:/i.test(label)) return "";
  return label;
}

function cleanInvoiceType(tipo: string): string {
  if (!tipo) return "Factura";
  const lower = tipo.toLowerCase();
  if (lower.includes("nota de cr") || lower.includes("credit note")) return "Ajuste";
  if (lower.includes("recibo") || lower.includes("receipt")) return "Recibo";
  return "Factura";
}

function cleanSerieNumero(sn: string): string {
  if (!sn) return "—";
  return sn;
}

// ─── Status translations ──────────────────────────────────────────────────────

function translateInvoiceStatus(estado: string): string {
  const map: Record<string, string> = {
    paid: "Pagada",
    issued: "Emitida",
    pending: "Pendiente",
    overdue: "Atrasada",
    cancelled: "Cancelada",
  };
  return map[estado.toLowerCase()] ?? estado;
}

function invoiceBadgeTone(
  estado: string
): "success" | "warning" | "danger" | "neutral" {
  if (estado === "paid") return "success";
  if (estado === "overdue") return "danger";
  if (estado === "pending" || estado === "issued") return "warning";
  return "neutral";
}

function translateReceiptStatus(estado: string): string {
  const map: Record<string, string> = {
    paid: "Cobrado",
    pending: "Pendiente",
  };
  return map[estado.toLowerCase()] ?? estado;
}

// ─── Risk styling ─────────────────────────────────────────────────────────────

function riskTone(r: string) {
  if (r.includes("Alto"))
    return { bg: "bg-[var(--copilot-badge-danger-bg)]/80", text: "text-[var(--copilot-danger-text-strong)]", border: "border-[var(--copilot-danger-border)]" };
  if (r.includes("Medio"))
    return { bg: "bg-[var(--copilot-badge-warning-bg)]/80", text: "text-[var(--copilot-warning-text-strong)]", border: "border-[var(--copilot-warning-border)]" };
  return { bg: "bg-[var(--copilot-badge-success-bg)]/70", text: "text-[var(--copilot-success-text-strong)]", border: "border-[var(--copilot-success-border)]" };
}

function timelineIcon(kind: TimelineEvent["kind"], severity: OperationalHintSeverity) {
  if (kind === "receipt") return <CheckCircle2 className="h-4 w-4 text-[var(--copilot-success-text)]" aria-hidden />;
  if (kind === "invoice_overdue") return <XCircle className="h-4 w-4 text-[var(--copilot-danger-text)]" aria-hidden />;
  if (kind === "invoice_issued") return <FileText className="h-4 w-4 text-sky-600" aria-hidden />;
  if (kind === "sync") return severity === "warning"
    ? <AlertTriangle className="h-4 w-4 text-[var(--copilot-warning-text)]" aria-hidden />
    : <BadgeCheck className="h-4 w-4 text-[var(--copilot-subtle)]" aria-hidden />;
  return <CircleDashed className="h-4 w-4 text-[var(--copilot-subtle)]" aria-hidden />;
}

function timelineTypeLabel(kind: TimelineEvent["kind"]): string {
  switch (kind) {
    case "invoice_issued": return "Factura emitida";
    case "invoice_overdue": return "Factura atrasada";
    case "receipt": return "Cobro recibido";
    case "sync": return "Datos actualizados";
    default: return "Evento";
  }
}

function debtStatusLabel(data: Client360Payload): { label: string; cls: string } {
  // CLIENT-DEBT-SEMANTICS-001 Etapa C: días desde emisión a partir de las
  // facturas visibles en la ficha, medidos contra hoy en Montevideo (UTC−3).
  const today = todayYmdMontevideo();
  const openInvoices = data.invoices.map((inv) => ({
    id: inv.id,
    issueDate: inv.issue_date,
    balanceAmount: Number(String(inv.saldo).replace(",", ".")) || 0,
    currencyCode: "UYU" as const,
  }));
  const result = deriveClientDebtStatus({
    debtUyu: data.debt_uyu,
    debtUsd: data.debt_usd,
    openInvoices,
    today,
  });
  const label = CLIENT_DEBT_STATUS_LABEL[result.status];
  if (result.status === "critical" || result.status === "delayed") {
    return {
      label,
      cls: "border-[var(--copilot-danger-border)]/80 bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
    };
  }
  if (result.status === "with_debt") {
    return {
      label,
      cls: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink)]",
    };
  }
  return {
    label,
    cls: "border-[var(--copilot-success-border)]/80 bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  };
}

// ─── KPI chip ─────────────────────────────────────────────────────────────────

function KpiChip({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "warning" | "danger" | "ok";
}) {
  const tones = {
    neutral: "text-[var(--copilot-ink)]",
    warning: "text-[var(--copilot-warning-text)]",
    danger: "text-[var(--copilot-danger-text)]",
    ok: "text-[var(--copilot-success-text)]",
  };
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <span className={subtleLabelClass}>
        {label}
      </span>
      <span className={`text-[17px] leading-tight ${metricValueClass} ${tones[tone]}`}>
        {value}
      </span>
      {sub ? (
        <span className="text-[11px] text-[var(--copilot-ink-muted)]">{sub}</span>
      ) : null}
    </div>
  );
}

// ─── KPI chip ─────────────────────────────────────────────────────────────────

function TimelineEventList({ evts }: { evts: TimelineEvent[] }) {
  if (evts.length === 0) return null;
  return (
    <ol className="space-y-2">
      {evts.map((ev) => {
        const medium = ev.kind === "receipt" ? (ev.description ?? null) : null;
        return (
          <li key={ev.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            <span className="shrink-0">{timelineIcon(ev.kind, ev.severity)}</span>
            <span className="tabular-nums text-[var(--copilot-ink-muted)]">
              {formatDateShort(ev.date)}
            </span>
            <span className="text-[var(--copilot-ink-muted)]" aria-hidden>·</span>
            <span className="font-medium text-[var(--copilot-ink)]">
              {timelineTypeLabel(ev.kind)}
            </span>
            {ev.amount != null ? (
              <>
                <span className="text-[var(--copilot-ink-muted)]" aria-hidden>·</span>
                <span className="tabular-nums font-semibold text-[var(--copilot-ink)]">
                  {formatMoney(ev.amount, ev.currency)}
                </span>
              </>
            ) : null}
            {medium ? (
              <>
                <span className="text-[var(--copilot-ink-muted)]" aria-hidden>·</span>
                <span className="text-[var(--copilot-ink-muted)]">{medium}</span>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function TimelineBlock({
  events,
  maxEvents,
  commercialOnly = false,
}: {
  events: TimelineEvent[];
  maxEvents?: number;
  commercialOnly?: boolean;
}) {
  const filtered = commercialOnly ? events.filter((e) => e.kind !== "sync") : events;
  const commercialEvents = filtered.filter((e) => e.kind !== "sync");
  const syncEvents = commercialOnly ? [] : filtered.filter((e) => e.kind === "sync");
  const limitedCommercial =
    maxEvents != null ? commercialEvents.slice(0, maxEvents) : commercialEvents;

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-[var(--copilot-ink-muted)]">
        Sin facturas ni cobros recientes para este cliente.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {limitedCommercial.length > 0 ? (
        <div>
          {!commercialOnly ? (
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
              Actividad comercial
            </p>
          ) : null}
          <TimelineEventList evts={limitedCommercial} />
        </div>
      ) : null}
      {syncEvents.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
            Actualización de datos
          </p>
          <TimelineEventList evts={syncEvents} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Contactos compactos ──────────────────────────────────────────────────────

function ContactsStrip({
  contacts,
  companyPhone,
}: {
  contacts: Client360Payload["contacts"];
  companyPhone: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const primary = contacts.find((c) => c.email) ?? contacts[0] ?? null;
  const email = primary?.email ?? null;
  const waPhone = normalizeUruguayPhoneForWhatsApp(companyPhone);

  function copyEmail(value: string) {
    navigator.clipboard?.writeText(value).catch(() => null);
    setCopied(value);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="px-5 pb-3">
      {contacts.length === 0 && !companyPhone ? (
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          Sin contactos registrados para este cliente.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-0.5 text-sm text-[var(--copilot-ink)]">
            {email ? (
              <span className="inline-flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)]" aria-hidden />
                {email}
              </span>
            ) : (
              <span className="text-[var(--copilot-ink-muted)]">Sin email cargado</span>
            )}
            {companyPhone ? (
              <span className="inline-flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)]" aria-hidden />
                {waPhone?.isValid ? waPhone.display : companyPhone}
              </span>
            ) : null}
            {primary?.full_name && contacts.length > 1 ? (
              <span className="text-xs text-[var(--copilot-ink-muted)]">
                Contacto principal: {primary.full_name}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {email ? (
              <>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
                >
                  <Mail className="h-3 w-3" aria-hidden />
                  Enviar email
                </a>
                <button
                  type="button"
                  onClick={() => copyEmail(email)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
                >
                  <Copy className="h-3 w-3" aria-hidden />
                  {copied === email ? "Copiado" : "Copiar email"}
                </button>
              </>
            ) : null}
            {waPhone?.isValid ? (
              <a
                href={waPhone.waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
              >
                <MessageCircle className="h-3 w-3" aria-hidden />
                WhatsApp
              </a>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Account statement preview types ─────────────────────────────────────────

type PreviewMovement = {
  id: string;
  date: string;
  kind: string;
  number: string;
  detail: string;
  currency: "UYU" | "USD";
  debit: number;
  credit: number;
  runningBalance: number;
};

type PreviewSummary = {
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  movementCount: number;
  hasNegativeBalance: boolean;
};

type PreviewBlock = {
  currency: "UYU" | "USD";
  previousBalance: number;
  summary: PreviewSummary;
  movements: PreviewMovement[];
};

type PreviewData = {
  companyName: string;
  from?: string;
  to?: string;
  currencies: Array<"UYU" | "USD">;
  blocks: PreviewBlock[];
};

// ─── Preview modal ────────────────────────────────────────────────────────────

function formatPreviewDate(ymd: string): string {
  if (!ymd || ymd.length < 10) return ymd;
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function formatPreviewAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  return Math.abs(n).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPreviewSignedBalance(n: number): string {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n === 0) return abs;
  return n < 0 ? `-${abs}` : abs;
}

function describeKind(kind: string): string {
  if (kind === "invoice") return "Venta (CFE)";
  if (kind === "receipt") return "Recibo";
  if (kind === "credit_note") return "Nota de Crédito";
  return kind;
}

function AccountStatementPreviewModal({
  data,
  onClose,
}: {
  data: PreviewData;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Revisar estado de cuenta"
    >
      <div className="relative w-full max-w-4xl rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
              Estado de cuenta
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--copilot-ink)]">
              {data.companyName}
            </p>
            {(data.from ?? data.to) ? (
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                {data.from ? formatPreviewDate(data.from) : "inicio"} —{" "}
                {data.to ? formatPreviewDate(data.to) : "hoy"}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="mt-0.5 rounded-lg p-1.5 text-[var(--copilot-muted)] hover:bg-[var(--copilot-soft-bg)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Currency blocks */}
        <div className="divide-y divide-[var(--copilot-border)]">
          {data.blocks.map((block) => (
            <div key={block.currency} className="px-5 py-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
                {block.currency === "UYU" ? "Pesos uruguayos (UYU)" : "Dólares (USD)"}
              </p>

              {block.movements.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--copilot-ink-muted)]">
                  Sin movimientos en el período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--copilot-border)] text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        <th className="py-1.5 pr-3 text-left">Fecha</th>
                        <th className="py-1.5 pr-3 text-left">Comprobante</th>
                        <th className="py-1.5 pr-3 text-left">Nº</th>
                        <th className="py-1.5 pr-2 text-right">Debe</th>
                        <th className="py-1.5 pr-2 text-right">Haber</th>
                        <th className="py-1.5 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Saldo anterior */}
                      {data.from ? (
                        <tr className="border-b border-[var(--copilot-border)]/40 bg-[var(--copilot-table-header-bg)] text-[var(--copilot-ink-muted)]">
                          <td className="py-1.5 pr-3">{formatPreviewDate(data.from)}</td>
                          <td className="py-1.5 pr-3 font-medium" colSpan={2}>
                            Saldo anterior
                          </td>
                          <td className="py-1.5 pr-2 text-right" />
                          <td className="py-1.5 pr-2 text-right" />
                          <td className="py-1.5 text-right font-semibold">
                            {formatPreviewSignedBalance(block.previousBalance)}
                          </td>
                        </tr>
                      ) : null}

                      {/* Movements */}
                      {block.movements.map((mv, i) => (
                        <tr
                          key={mv.id}
                          className={`border-b border-[var(--copilot-border)]/30 ${
                            i % 2 === 1 ? "bg-[var(--copilot-table-row-alt-bg)]" : ""
                          }`}
                        >
                          <td className="py-1.5 pr-3 text-[var(--copilot-ink-muted)]">
                            {formatPreviewDate(mv.date)}
                          </td>
                          <td className="py-1.5 pr-3 text-[var(--copilot-ink)]">
                            {describeKind(mv.kind)}
                          </td>
                          <td className="py-1.5 pr-3 text-[var(--copilot-ink-muted)]">
                            {mv.number}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-[var(--copilot-ink)]">
                            {mv.debit > 0 ? formatPreviewAmount(mv.debit) : ""}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-[var(--copilot-ink)]">
                            {mv.credit > 0 ? formatPreviewAmount(mv.credit) : ""}
                          </td>
                          <td
                            className={`py-1.5 text-right font-semibold ${
                              mv.runningBalance < 0
                                ? "text-[var(--copilot-danger-text)]"
                                : "text-[var(--copilot-ink)]"
                            }`}
                          >
                            {formatPreviewSignedBalance(mv.runningBalance)}
                          </td>
                        </tr>
                      ))}

                      {/* Saldo final */}
                      <tr className="border-t-2 border-[var(--copilot-border)] bg-[var(--copilot-table-header-bg)] font-semibold">
                        <td className="py-2 pr-3 text-[var(--copilot-ink-muted)]">
                          {data.to ? formatPreviewDate(data.to) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-[var(--copilot-ink)]" colSpan={2}>
                          SALDO {block.currency === "UYU" ? "$" : "U$S"}
                        </td>
                        <td className="py-2 pr-2 text-right text-[var(--copilot-ink)]">
                          {formatPreviewAmount(block.summary.totalDebit)}
                        </td>
                        <td className="py-2 pr-2 text-right text-[var(--copilot-ink)]">
                          {formatPreviewAmount(block.summary.totalCredit)}
                        </td>
                        <td
                          className={`py-2 text-right ${
                            block.summary.finalBalance < 0 ? "text-[var(--copilot-danger-text)]" : "text-[var(--copilot-ink)]"
                          }`}
                        >
                          {formatPreviewSignedBalance(
                            block.movements[block.movements.length - 1]?.runningBalance ??
                              block.previousBalance
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary strip */}
              <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-[var(--copilot-ink-muted)]">
                <span>
                  Debe total:{" "}
                  <span className="font-semibold text-[var(--copilot-ink)]">
                    {formatPreviewAmount(block.summary.totalDebit)}
                  </span>
                </span>
                <span>
                  Haber total:{" "}
                  <span className="font-semibold text-[var(--copilot-ink)]">
                    {formatPreviewAmount(block.summary.totalCredit)}
                  </span>
                </span>
                <span>
                  Saldo:{" "}
                  <span
                    className={`font-semibold ${
                      block.summary.finalBalance < 0
                        ? "text-[var(--copilot-danger-text)]"
                        : "text-[var(--copilot-ink)]"
                    }`}
                  >
                    {formatPreviewAmount(
                      block.movements[block.movements.length - 1]?.runningBalance ??
                        block.previousBalance
                    )}
                  </span>
                </span>
                <span>
                  {block.summary.movementCount} movimiento
                  {block.summary.movementCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--copilot-border)] px-5 py-3">
          <p className="text-[11px] text-[var(--copilot-ink-muted)]">
            Vista previa del estado de cuenta. El PDF descargado usa el mismo modelo y datos.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── PDF download card ────────────────────────────────────────────────────────

function AccountStatementPdfCard({ companyId, hasUyu }: { companyId: string; hasUyu: boolean }) {
  const thisYear = new Date().getFullYear();
  const [currency, setCurrency] = useState<"UYU" | "USD">(hasUyu ? "UYU" : "USD");
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(`${thisYear}-12-31`);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  function buildPdfUrl() {
    const params = new URLSearchParams({ currency, from, to });
    return `/api/copilot/clientes/${encodeURIComponent(companyId)}/account-statement.pdf?${params.toString()}`;
  }

  function buildJsonUrl() {
    const params = new URLSearchParams({ currency, from, to });
    return `/api/copilot/clientes/${encodeURIComponent(companyId)}/account-statement.json?${params.toString()}`;
  }

  async function handleDownload() {
    if (loading) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch(buildPdfUrl());
      if (!res.ok) {
        setErrorMsg("No se pudo generar el PDF. Intentá de nuevo.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estado-de-cuenta.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg("No se pudo generar el PDF. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (previewLoading) return;
    setErrorMsg(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(buildJsonUrl());
      if (!res.ok) {
        setErrorMsg("No se pudo cargar la vista previa. Intentá de nuevo.");
        return;
      }
      const json = (await res.json()) as { ok?: boolean } & PreviewData;
      if (!json.ok) {
        setErrorMsg("No se pudo cargar la vista previa. Intentá de nuevo.");
        return;
      }
      setPreviewData(json);
    } catch {
      setErrorMsg("No se pudo cargar la vista previa. Intentá de nuevo.");
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <>
      <CopilotCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">Estado de cuenta PDF</p>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
              Descargá un estado de cuenta del cliente para revisar o enviar manualmente. El PDF no se
              envía solo.
            </p>
          </div>
          <Download className="h-4 w-4 shrink-0 text-[var(--copilot-accent)] mt-0.5" aria-hidden />
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          {/* Currency */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Moneda
            </label>
            <div className="flex rounded-xl overflow-hidden border border-[var(--copilot-border)]">
              {(["UYU", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    currency === c
                      ? "bg-[var(--copilot-accent)] text-[var(--copilot-on-accent)]"
                      : "bg-[var(--copilot-card-bg)] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
                  }`}
                >
                  {c === "UYU" ? "Pesos" : "Dólares"}
                </button>
              ))}
            </div>
          </div>

          {/* From */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Desde
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-[12px] text-[var(--copilot-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--copilot-accent)]"
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Hasta
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-[12px] text-[var(--copilot-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--copilot-accent)]"
            />
          </div>

          {/* Preview button */}
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={previewLoading}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-4 py-2 text-[13px] font-semibold text-[var(--copilot-ink)] transition-colors hover:bg-[var(--copilot-panel-bg)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
          >
            {previewLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            )}
            {previewLoading ? "Cargando…" : "Revisar"}
          </button>

          {/* Download button */}
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--copilot-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden />
            )}
            {loading ? "Generando…" : "Descargar PDF"}
          </button>
        </div>

        {errorMsg ? (
          <p className="mt-2 text-[12px] text-[var(--copilot-danger-text)]">{errorMsg}</p>
        ) : null}
      </CopilotCard>

      {previewData ? (
        <AccountStatementPreviewModal
          data={previewData}
          onClose={() => setPreviewData(null)}
        />
      ) : null}
    </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function CopilotClient360View({ companyId }: { companyId: string }) {
  const { modulePermissions } = useCopilotPermissions();
  const canWrite =
    modulePermissions["clientes"] === "write" || modulePermissions["clientes"] === "admin";
  const { mode: displayMode, fxRate: displayFxRate } = useDisplayCurrency();
  const isUsd360 = displayMode === "usd_equivalent";

  const [data, setData] = useState<Client360Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Transfer aliases state ──────────────────────────────────────────────────
  const [aliases, setAliases] = useState<TransferAlias[]>([]);
  const [aliasesReady, setAliasesReady] = useState(false);
  const [aliasNewLabel, setAliasNewLabel] = useState("");
  const [aliasNewNotes, setAliasNewNotes] = useState("");
  const [addingAlias, setAddingAlias] = useState(false);
  const [savingAlias, setSavingAlias] = useState(false);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editingAliasLabel, setEditingAliasLabel] = useState("");
  const [editingAliasNotes, setEditingAliasNotes] = useState("");
  const [savingEditAlias, setSavingEditAlias] = useState(false);
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [aliasSuccess, setAliasSuccess] = useState<string | null>(null);

  const [collectionPrefill, setCollectionPrefill] = useState<import("@/lib/account-statement/build-account-statement-followup-prefill").CollectionFollowupInitialValues | null>(null);
  const [collectionPrefillKey, setCollectionPrefillKey] = useState(0);

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SectionNavId>("resumen");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_TAB_KEY);
      if (saved && SECTION_NAV_TABS.some((t) => t.id === saved)) {
        setActiveTab(saved as SectionNavId);
      }
    } catch { /* noop */ }
  }, []);

  function handleTabChange(id: SectionNavId) {
    setActiveTab(id);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "instant" });
    try { sessionStorage.setItem(SESSION_TAB_KEY, id); } catch { /* noop */ }
  }

  const handleSuggestFollowup = useCallback(
    (prefill: import("@/lib/account-statement/build-account-statement-followup-prefill").CollectionFollowupInitialValues) => {
      setCollectionPrefill(prefill);
      setCollectionPrefillKey((k) => k + 1);
      setActiveTab("cobranza");
      try { sessionStorage.setItem(SESSION_TAB_KEY, "cobranza"); } catch { /* noop */ }
    },
    []
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/copilot/client-360?companyId=${encodeURIComponent(companyId)}`,
        { credentials: "same-origin", headers: { Accept: "application/json" } }
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; payload?: Client360Payload; error?: string }
        | null;
      if (!res.ok || !body?.ok || !body.payload) {
        const msg =
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setData(body.payload);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "No se pudo cargar la ficha.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Alias handlers ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!data) return;
    setAliases(data.transferAliases ?? []);
    setAliasesReady(true);
  }, [data]);

  async function handleAddAlias() {
    const label = aliasNewLabel.trim();
    if (!label || label.length < 3) return;
    if (savingAlias) return;
    setSavingAlias(true);
    setAliasError(null);
    setAliasSuccess(null);
    try {
      const res = await fetch(
        `/api/copilot/clients/${encodeURIComponent(companyId)}/transfer-aliases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, notes: aliasNewNotes.trim() || null }),
        }
      );
      const body = (await res.json().catch(() => null)) as { ok?: boolean; alias?: TransferAlias; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setAliasError(body?.error ?? "Error al guardar.");
        return;
      }
      if (body.alias) setAliases((prev) => [...prev, body.alias!]);
      setAliasNewLabel("");
      setAliasNewNotes("");
      setAddingAlias(false);
      setAliasSuccess("Alias agregado");
      window.setTimeout(() => setAliasSuccess(null), 3000);
    } finally {
      setSavingAlias(false);
    }
  }

  async function handleSaveEditAlias(aliasId: string) {
    const label = editingAliasLabel.trim();
    if (!label || label.length < 3) return;
    if (savingEditAlias) return;
    setSavingEditAlias(true);
    setAliasError(null);
    try {
      const res = await fetch(
        `/api/copilot/clients/${encodeURIComponent(companyId)}/transfer-aliases/${encodeURIComponent(aliasId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, notes: editingAliasNotes.trim() || null }),
        }
      );
      const body = (await res.json().catch(() => null)) as { ok?: boolean; alias?: TransferAlias; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setAliasError(body?.error ?? "Error al guardar.");
        return;
      }
      if (body.alias) {
        setAliases((prev) => prev.map((a) => (a.id === aliasId ? body.alias! : a)));
      }
      setEditingAliasId(null);
    } finally {
      setSavingEditAlias(false);
    }
  }

  async function handleDeleteAlias(aliasId: string) {
    if (deletingAliasId) return;
    setDeletingAliasId(aliasId);
    setAliasError(null);
    try {
      const res = await fetch(
        `/api/copilot/clients/${encodeURIComponent(companyId)}/transfer-aliases/${encodeURIComponent(aliasId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setAliases((prev) => prev.filter((a) => a.id !== aliasId));
        setConfirmDeleteId(null);
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setAliasError(body?.error ?? "Error al eliminar.");
      }
    } finally {
      setDeletingAliasId(null);
    }
  }

  const riskLabel = useMemo((): "Bajo" | "Medio" | "Alto" => {
    const hint = data?.insights.find((i) => i.id === "riesgo_basico");
    if (!hint) return "Bajo";
    if (hint.label.includes("Alto")) return "Alto";
    if (hint.label.includes("Medio")) return "Medio";
    return "Bajo";
  }, [data]);

  const hasMixedCurrency = (data?.debt_uyu ?? 0) > 0 && (data?.debt_usd ?? 0) > 0;

  const timelineEvents = useMemo(() => {
    if (!data) return [];
    const { timelineEvents: evts } = buildClientOperationalSummary({
      saldo_pendiente: data.cuenta.saldo_pendiente_total,
      overdue_debt: data.overdue_uyu + data.overdue_usd,
      overdue_uyu: data.overdue_uyu,
      overdue_usd: data.overdue_usd,
      receipts_count: data.receipts.length,
      receipts_last_date: data.last_receipt_date,
      contacts_count: data.contacts.length,
      risk: riskLabel,
      has_mixed_currency: hasMixedCurrency,
      invoices_count: data.invoices.length,
      last_sync_at: data.last_sync_at,
      invoices: data.invoices.map((inv) => ({
        id: inv.id,
        issue_date: inv.issue_date,
        serie_numero: inv.serie_numero,
        importe: inv.importe,
        balance: Number(inv.saldo.replace(/\./g, "").replace(",", ".")) || 0,
      })),
      receipts: data.receipts.map((r) => ({
        id: r.id,
        receipt_date: r.receipt_date,
        importe: r.importe,
        medio: r.medio,
      })),
      sync_rows: data.zeta_sync_rows.map((z) => ({
        resource_flow: z.resource_flow,
        label: z.label,
        last_success_at: z.last_success_at,
      })),
    });
    return evts;
  }, [data, riskLabel, hasMixedCurrency]);

  const debtStatus = data ? debtStatusLabel(data) : null;

  const commercialEvents = timelineEvents.filter((e) => e.kind !== "sync");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.clientes"
        title="Ficha de cliente"
        description="Estado de cuenta, facturas, cobros y contactos del cliente."
      />

      {/* Breadcrumb */}
      <div className="border-b border-[var(--copilot-border)] bg-[var(--copilot-card)] px-6 py-2.5">
        <nav className="flex items-center gap-2 text-sm" aria-label="Ruta">
          <CopilotGhostLink
            href="/copilot/clientes"
            className="inline-flex items-center gap-1 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Clientes
          </CopilotGhostLink>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
          <span className="font-medium text-[var(--copilot-ink)]">
            {loading ? "Cargando…" : (data?.summary.nombre_visible ?? "Ficha")}
          </span>
        </nav>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 px-6 py-6 text-sm text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando ficha…
          </div>
        ) : null}

        {error ? (
          <div className="space-y-3 px-6 py-6">
            <div className="rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-card-bg)] px-4 py-3 text-sm text-[var(--copilot-danger-text-strong)]">
              {error}
            </div>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--copilot-accent)] hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Reintentar
            </button>
          </div>
        ) : null}

        {!loading && !error && data ? (
          <>
            {/* ── Banner: cliente inactivo ─────────────────────────────── */}
            {data.summary.is_active === false ? (
              <div className="border-b border-[var(--copilot-warning-border)] bg-[var(--copilot-card-bg)] px-6 py-3 text-sm font-medium text-[var(--copilot-warning-text-strong)]">
                Este cliente está inactivo (archivado). La ficha es de solo lectura.
              </div>
            ) : null}

            {/* ── Client header card ───────────────────────────────────── */}
            <div className="border-b border-[var(--copilot-border)] bg-[var(--copilot-card)]">
            <div className="px-5 pt-4 pb-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-accent-soft)] text-base font-bold text-[var(--copilot-accent)]">
                    {data.summary.nombre_visible.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-[var(--copilot-ink)]">
                      {data.summary.nombre_visible}
                    </h1>
                    {data.summary.razon_social &&
                      data.summary.razon_social !== data.summary.nombre_visible ? (
                      <p className="text-sm text-[var(--copilot-ink-muted)]">
                        {data.summary.razon_social}
                      </p>
                    ) : null}
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                      {data.summary.rut_documento ? (
                        <span>RUT {data.summary.rut_documento}</span>
                      ) : null}
                      {data.summary.codigo ? (
                        <span>Codigo {data.summary.codigo}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                {debtStatus ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${debtStatus.cls}`}
                  >
                    {debtStatus.label}
                  </span>
                ) : null}

                {(() => {
                  const tone = riskTone(riskLabel);
                  return (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.text} ${tone.border}`}
                    >
                      Riesgo {riskLabel}
                    </span>
                  );
                })()}

                {data.insights.map((i) =>
                  i.active && i.id === "sin_recibos_recientes" ? (
                    <span
                      key={i.id}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--copilot-warning-border)]/80 bg-[var(--copilot-tone-warning-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-warning-text-strong)]"
                    >
                      Sin cobros recientes
                    </span>
                  ) : i.active && i.id === "actividad_reciente" ? (
                    <span
                      key={i.id}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--copilot-success-border)]/80 bg-[var(--copilot-tone-positive-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-success-text-strong)]"
                    >
                      Con actividad reciente
                    </span>
                  ) : null
                )}

                {hasMixedCurrency ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                    Multi-moneda
                  </span>
                ) : null}
              </div>
            </div>

            <ContactsStrip contacts={data.contacts} companyPhone={data.summary.phone} />

            {/* KPI grid */}
            <div className="border-t border-[var(--copilot-border)]/40 px-5 py-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {isUsd360 ? (
                  <>
                    <KpiChip
                      label="Deuda UYU (est.)"
                      value={formatUsdEquivalent(convertToUsdEquivalent({ uyu: data.debt_uyu, usd: 0 }, displayFxRate))}
                      sub={`TC ${displayFxRate}`}
                      tone={data.debt_uyu > 0 ? "warning" : "neutral"}
                    />
                    <KpiChip
                      label="Deuda USD"
                      value={formatUsdEquivalent(convertToUsdEquivalent({ uyu: 0, usd: data.debt_usd }, displayFxRate))}
                      tone={data.debt_usd > 0 ? "warning" : "neutral"}
                    />
                  </>
                ) : (
                  <>
                    <KpiChip
                      label="Deuda UYU"
                      value={`$ ${data.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                      tone={data.debt_uyu > 0 ? "warning" : "neutral"}
                    />
                    <KpiChip
                      label="Deuda USD"
                      value={`U$S ${data.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                      tone={data.debt_usd > 0 ? "warning" : "neutral"}
                    />
                  </>
                )}
                <KpiChip
                  label="Facturas pendientes"
                  value={String(data.cuenta.comprobantes_count)}
                />
                <KpiChip
                  label="Ultimo cobro"
                  value={
                    data.last_receipt_date
                      ? formatRelativeDays(data.last_receipt_date)
                      : "—"
                  }
                  tone={data.last_receipt_date ? "ok" : "warning"}
                />
              </div>
            </div>
            </div>

            {/* ── Próximo paso ──────────────────────────────────────────── */}
            <div className="border-b border-[var(--copilot-border)] px-5 py-4">
              <ClientNextStepBanner
                data={data}
                onNavigateTab={() => handleTabChange("cuenta")}
                onScrollToAssistant={() => handleTabChange("cobranza")}
                onScrollToCollectionForm={() => handleTabChange("cobranza")}
                onViewAccountStatement={() => handleTabChange("cuenta")}
              />
            </div>

            {/* ── Real tab nav ───────────────────────────────────────────── */}
            <Client360TabNav activeTab={activeTab} onTabChange={handleTabChange} />

            {/* ── Tab: Resumen ───────────────────────────────────────────── */}
            {activeTab === "resumen" ? (
              <div className="space-y-4 px-5 py-4">
                <CopilotDataProvenanceStrip
                  updatedAt={data.last_sync_at}
                  periodLabel="estado actual del cliente"
                />
                <ClientAgentBlock
                  data={data}
                  onNavigateTab={(tab) => handleTabChange(tab as SectionNavId)}
                  onScrollToAssistant={() => handleTabChange("cobranza")}
                />
                <ClientPaymentBehaviorCard companyId={data.summary.company_id} />
                <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 shadow-sm">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
                    Actividad reciente
                  </p>
                  <TimelineBlock
                    events={timelineEvents}
                    maxEvents={RESUMEN_ACTIVITY_LIMIT}
                    commercialOnly
                  />
                  {commercialEvents.length > RESUMEN_ACTIVITY_LIMIT ? (
                    <button
                      type="button"
                      onClick={() => handleTabChange("cuenta")}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
                    >
                      Ver actividad completa
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ── Tab: Cobranza ──────────────────────────────────────────── */}
            {activeTab === "cobranza" ? (
              <div className="space-y-4 px-5 py-4">
                {data.summary.is_active === false ? (
                  <div className="rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-card-bg)] px-4 py-3 text-sm text-[var(--copilot-warning-text-strong)]">
                    Cliente inactivo: acciones operativas deshabilitadas.
                  </div>
                ) : (
                  <>
                    <CollectionMessageAssistant
                      companyId={data.summary.company_id}
                      clientName={data.summary.nombre_visible}
                      debtUyu={data.debt_uyu}
                      debtUsd={data.debt_usd}
                      overdueUyu={data.overdue_uyu}
                      overdueUsd={data.overdue_usd}
                      contactEmail={data.contacts.find((c) => c.email != null)?.email ?? null}
                      phone={data.summary.phone}
                    />
                    <CollectionFollowupForm
                      companyId={data.summary.company_id}
                      initialValues={collectionPrefill}
                      prefillKey={collectionPrefillKey}
                    />
                  </>
                )}
              </div>
            ) : null}

            {/* ── Tab: Estado de cuenta ──────────────────────────────────── */}
            {activeTab === "cuenta" ? (
              <div className="space-y-4 px-5 py-4">
                <AccountStatementPdfCard
                  companyId={companyId}
                  hasUyu={data.debt_uyu > 0 || data.cuenta.ultimos_movimientos.some(m => m.kind === "factura")}
                />

                <AccountStatementSendCard
                  companyId={companyId}
                  clientName={data.summary.nombre_visible ?? data.summary.razon_social}
                  email={data.contacts.find((c) => c.email)?.email ?? null}
                  phone={data.summary.phone}
                  debtUyu={data.debt_uyu}
                  debtUsd={data.debt_usd}
                  overdueUyu={data.overdue_uyu}
                  overdueUsd={data.overdue_usd}
                  onSuggestFollowup={handleSuggestFollowup}
                />

                <div>
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                    Deuda actual a cobrar del cliente
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                    Saldo pendiente al corte informado por Zeta. El atrasado ya está incluido.{isUsd360 ? " Totales convertidos a USD estimado." : " UYU y USD no se suman entre sí."}
                  </p>
                </div>

                {isUsd360 && (data.debt_uyu > 0 || data.debt_usd > 0) ? (
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Total consolidado
                    </p>
                    <p className={`mt-1 text-2xl font-bold tabular-nums ${metricValueClass} text-[var(--copilot-warning-text)]`}>
                      {formatUsdEquivalent(convertToUsdEquivalent({ uyu: data.debt_uyu, usd: data.debt_usd }, displayFxRate))}
                    </p>
                    <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">TC {displayFxRate} · Detalle por moneda abajo</p>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <CopilotCard className={warningFinancialCardClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Deuda actual a cobrar en pesos (UYU)
                      </p>
                      {data.overdue_uyu > 0 ? (
                        <TrendingDown className="h-4 w-4 text-[var(--copilot-danger-text)] shrink-0" aria-hidden />
                      ) : null}
                    </div>
                    <p className={`mt-1.5 text-2xl font-bold tabular-nums ${data.debt_uyu > 0 ? "text-[var(--copilot-warning-text)]" : "text-[var(--copilot-ink)]"}`}>
                      {`$ ${data.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                    </p>
                    {data.overdue_uyu > 0 ? (
                      <p className="mt-1 text-xs font-medium text-[var(--copilot-danger-text)]">
                        {`$ ${data.overdue_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`} atrasados
                        {data.debt_uyu > 0
                          ? ` (${Math.round((data.overdue_uyu / data.debt_uyu) * 100)}%)`
                          : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">Sin atrasos</p>
                    )}
                    {data.last_receipt_date ? (
                      <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                        Ultimo cobro: {formatDateShort(data.last_receipt_date)}
                      </p>
                    ) : null}
                  </CopilotCard>

                  <CopilotCard className={warningFinancialCardClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Deuda actual a cobrar en dólares (USD)
                      </p>
                      {data.overdue_usd > 0 ? (
                        <TrendingDown className="h-4 w-4 text-[var(--copilot-danger-text)] shrink-0" aria-hidden />
                      ) : null}
                    </div>
                    <p className={`mt-1.5 text-2xl font-bold tabular-nums ${data.debt_usd > 0 ? "text-[var(--copilot-warning-text)]" : "text-[var(--copilot-ink)]"}`}>
                      {`U$S ${data.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                    </p>
                    {data.overdue_usd > 0 ? (
                      <p className="mt-1 text-xs font-medium text-[var(--copilot-danger-text)]">
                        {`U$S ${data.overdue_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`} atrasados
                        {data.debt_usd > 0
                          ? ` (${Math.round((data.overdue_usd / data.debt_usd) * 100)}%)`
                          : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">Sin atrasos</p>
                    )}
                    {data.last_invoice_date ? (
                      <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                        Ultima factura: {formatDateShort(data.last_invoice_date)}
                      </p>
                    ) : null}
                  </CopilotCard>
                </div>

                <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                  El total pendiente incluye todas las facturas abiertas. El atrasado es la parte que ya superó su fecha de vencimiento y está incluido dentro del total pendiente.
                </p>

                <CopilotCard className={neutralFinancialCardClass}>
                  <CopilotSectionTitle
                    title="Estado de cuenta histórico"
                    subtitle="Facturas y cobros al último sync."
                  />
                  {data.cuenta.ultimos_movimientos.length === 0 ? (
                    <p className="text-sm text-[var(--copilot-ink-muted)]">
                      Sin movimientos registrados.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--copilot-border)]">
                      {data.cuenta.ultimos_movimientos.map((m, idx) => (
                        <li
                          key={`${m.kind}-${m.fecha}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {m.kind === "factura" ? (
                              <FileText className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--copilot-success-text)]" aria-hidden />
                            )}
                            <div>
                              <span className="font-medium text-[var(--copilot-ink)]">
                                {m.kind === "factura" ? "Factura" : "Cobro"}
                              </span>
                              {cleanMovementLabel(m.label) ? (
                                <span className="text-[var(--copilot-ink-muted)]"> · {cleanMovementLabel(m.label)}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="tabular-nums text-[var(--copilot-ink)]">
                            {`$ ${m.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`} ·{" "}
                            {formatDateShort(m.fecha)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CopilotCard>
              </div>
            ) : null}

            {/* ── Tab: Facturas ──────────────────────────────────────────── */}
            {activeTab === "facturas" ? (
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                    Facturas
                    {data.invoices.length > 0 ? (
                      <span className="ml-2 text-xs font-normal text-[var(--copilot-ink-muted)]">
                        ({data.invoices.length})
                      </span>
                    ) : null}
                  </p>
                </div>
                <CopilotCard className="overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="bg-[var(--copilot-table-header-bg)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          <th className="px-4 py-2.5">Fecha</th>
                          <th className="px-4 py-2.5">Comprobante</th>
                          <th className="px-4 py-2.5">Tipo</th>
                          <th className="px-4 py-2.5">Importe</th>
                          <th className="px-4 py-2.5">Saldo</th>
                          <th className="px-4 py-2.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.invoices.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-[var(--copilot-ink-muted)]">
                              Sin facturas abiertas. Si debería haber saldo, revisá el sync en Datos.
                            </td>
                          </tr>
                        ) : (
                          data.invoices.map((inv, i) => (
                            <tr
                              key={inv.id}
                              className={i % 2 === 0 ? "bg-[var(--copilot-card)]" : "bg-[var(--copilot-soft-bg)]"}
                            >
                              <td className="px-4 py-2.5">{formatDateShort(inv.issue_date)}</td>
                              <td className="px-4 py-2.5 font-medium">{cleanSerieNumero(inv.serie_numero)}</td>
                              <td className="px-4 py-2.5 text-[var(--copilot-ink-muted)]">{cleanInvoiceType(inv.tipo)}</td>
                              <td className="px-4 py-2.5 tabular-nums">
                                {`$ ${inv.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                              </td>
                              <td className="px-4 py-2.5 tabular-nums text-[var(--copilot-ink-muted)]">
                                {inv.saldo}
                              </td>
                              <td className="px-4 py-2.5">
                                <CopilotBadge tone={invoiceBadgeTone(inv.estado)}>
                                  {translateInvoiceStatus(inv.estado)}
                                </CopilotBadge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CopilotCard>
              </div>
            ) : null}

            {/* ── Tab: Cobros ────────────────────────────────────────────── */}
            {activeTab === "cobros" ? (
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                    Cobros
                    {data.receipts.length > 0 ? (
                      <span className="ml-2 text-xs font-normal text-[var(--copilot-ink-muted)]">
                        ({data.receipts.length})
                      </span>
                    ) : null}
                  </p>
                </div>
                <CopilotCard className="overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="bg-[var(--copilot-table-header-bg)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          <th className="px-4 py-2.5">Fecha</th>
                          <th className="px-4 py-2.5">Importe</th>
                          <th className="px-4 py-2.5">Medio de pago</th>
                          <th className="px-4 py-2.5">Referencia</th>
                          <th className="px-4 py-2.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.receipts.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-[var(--copilot-ink-muted)]">
                              Sin cobros en el historial. Los pagos aparecen acá al sincronizar desde Zeta.
                            </td>
                          </tr>
                        ) : (
                          data.receipts.map((r, i) => (
                            <tr
                              key={r.id}
                              className={i % 2 === 0 ? "bg-[var(--copilot-card)]" : "bg-[var(--copilot-soft-bg)]"}
                            >
                              <td className="px-4 py-2.5">{formatDateShort(r.receipt_date)}</td>
                              <td className="px-4 py-2.5 tabular-nums font-medium">
                                {`$ ${r.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                              </td>
                              <td className="px-4 py-2.5 text-[var(--copilot-ink-muted)]">
                                {r.medio ?? "—"}
                              </td>
                              <td className="px-4 py-2.5 text-[var(--copilot-ink-muted)]">
                                {r.referencia ?? "—"}
                              </td>
                              <td className="px-4 py-2.5">
                                <CopilotBadge
                                  tone={r.estado === "paid" ? "success" : "neutral"}
                                >
                                  {translateReceiptStatus(r.estado)}
                                </CopilotBadge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CopilotCard>
              </div>
            ) : null}

            {/* ── Tab: Datos ─────────────────────────────────────────────── */}
            {activeTab === "datos" ? (
              <div className="px-5 py-4">
                <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-5 shadow-sm">
                  <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
                    Información del cliente
                  </p>
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Razón social
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-[var(--copilot-ink)]">
                        {data.summary.razon_social || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Nombre
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-[var(--copilot-ink)]">
                        {data.summary.nombre_visible}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Código
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-[var(--copilot-ink)]">
                        {data.summary.codigo ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        RUT
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-[var(--copilot-ink)]">
                        {data.summary.rut_documento ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Email
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-[var(--copilot-ink)]">
                        {data.contacts.find((c) => c.email)?.email ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Teléfono
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-[var(--copilot-ink)]">
                        {data.summary.phone ?? "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            ) : null}

            {/* ── Tab: Formas de transferencia ──────────────────────────── */}
            {activeTab === "transferencias" ? (
              <div className="px-5 py-4">
                <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                        Formas de transferencia
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                        Textos, bancos o razones sociales desde donde este cliente suele pagar.
                      </p>
                    </div>
                    {canWrite && !addingAlias ? (
                      <button
                        type="button"
                        onClick={() => { setAddingAlias(true); setAliasError(null); }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)] hover:text-[var(--copilot-ink)]"
                      >
                        <Plus className="h-3 w-3" />
                        Agregar
                      </button>
                    ) : null}
                  </div>

                  {aliasError ? (
                    <p className="mb-3 text-xs text-red-500">{aliasError}</p>
                  ) : null}
                  {aliasSuccess ? (
                    <p className="mb-3 text-xs font-medium text-[var(--copilot-success-text)]">{aliasSuccess}</p>
                  ) : null}

                  {aliasesReady ? (
                    <>
                      {addingAlias ? (
                        <div className="mb-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-bg)] p-3 space-y-2">
                          <input
                            type="text"
                            autoFocus
                            value={aliasNewLabel}
                            onChange={(e) => setAliasNewLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleAddAlias();
                              if (e.key === "Escape") { setAddingAlias(false); setAliasNewLabel(""); setAliasNewNotes(""); }
                            }}
                            placeholder="Ej. DOLBY SOCIEDAD ANONIMA"
                            maxLength={300}
                            className="w-full rounded-lg border border-[var(--copilot-accent)]/40 bg-[var(--copilot-card-bg)] px-3 py-1.5 text-sm text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/30"
                          />
                          <input
                            type="text"
                            value={aliasNewNotes}
                            onChange={(e) => setAliasNewNotes(e.target.value)}
                            placeholder="Nota opcional (banco, cuenta…)"
                            maxLength={500}
                            className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void handleAddAlias()}
                              disabled={savingAlias || aliasNewLabel.trim().length < 3}
                              className="inline-flex items-center gap-1 rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-on-accent)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
                            >
                              {savingAlias ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAddingAlias(false); setAliasNewLabel(""); setAliasNewNotes(""); setAliasError(null); }}
                              className="rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {aliases.length > 0 ? (
                        <ul className="space-y-2">
                          {aliases.map((alias) => (
                            <li key={alias.id} className="rounded-xl border border-[var(--copilot-border)] px-4 py-3">
                              {editingAliasId === alias.id ? (
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingAliasLabel}
                                    onChange={(e) => setEditingAliasLabel(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void handleSaveEditAlias(alias.id);
                                      if (e.key === "Escape") setEditingAliasId(null);
                                    }}
                                    maxLength={300}
                                    className="w-full rounded-lg border border-[var(--copilot-accent)]/40 bg-[var(--copilot-card-bg)] px-3 py-1.5 text-sm text-[var(--copilot-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/30"
                                  />
                                  <input
                                    type="text"
                                    value={editingAliasNotes}
                                    onChange={(e) => setEditingAliasNotes(e.target.value)}
                                    placeholder="Nota opcional"
                                    maxLength={500}
                                    className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] focus:outline-none"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void handleSaveEditAlias(alias.id)}
                                      disabled={savingEditAlias || editingAliasLabel.trim().length < 3}
                                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-on-accent)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
                                    >
                                      {savingEditAlias ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                      Guardar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingAliasId(null)}
                                      className="rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : confirmDeleteId === alias.id ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-[var(--copilot-ink)]">Eliminar forma de transferencia</p>
                                  <p className="text-xs text-[var(--copilot-ink-muted)]">Copilot dejará de usar este texto para sugerir pagos de este cliente.</p>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteAlias(alias.id)}
                                      disabled={!!deletingAliasId}
                                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--copilot-danger-button-bg)] px-3 py-1.5 text-xs font-medium text-[var(--copilot-on-accent)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
                                    >
                                      {deletingAliasId === alias.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                      Eliminar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{alias.label}</p>
                                    {alias.notes ? (
                                      <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">{alias.notes}</p>
                                    ) : null}
                                  </div>
                                  {canWrite && data.summary.is_active !== false ? (
                                    <div className="flex shrink-0 gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingAliasId(alias.id);
                                          setEditingAliasLabel(alias.label);
                                          setEditingAliasNotes(alias.notes ?? "");
                                          setAliasError(null);
                                        }}
                                        className="rounded-lg p-1.5 text-[var(--copilot-muted)] hover:bg-[var(--copilot-soft-bg)] hover:text-[var(--copilot-accent)]"
                                        title="Editar"
                                        aria-label="Editar alias de transferencia"
                                      >
                                        <PenLine className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { setConfirmDeleteId(alias.id); setAliasError(null); }}
                                        className="rounded-lg p-1.5 text-[var(--copilot-ink-muted)] hover:bg-red-50 hover:text-red-600"
                                        title="Eliminar"
                                        aria-label="Eliminar alias de transferencia"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        !addingAlias && (
                          <div className="rounded-xl border border-dashed border-[var(--copilot-border)] px-4 py-6 text-center">
                            <p className="text-sm text-[var(--copilot-ink-muted)]">No hay formas de transferencia registradas.</p>
                            {data.transfer_method ? (
                              <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                                Valor anterior: <span className="font-medium">{data.transfer_method}</span>
                                {canWrite ? " — usá Agregar para migrarlo." : ""}
                              </p>
                            ) : canWrite ? (
                              <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                                Agregá nombres, bancos o referencias que aparezcan en los extractos.
                              </p>
                            ) : null}
                          </div>
                        )
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--copilot-ink-muted)]">Cargando…</p>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {!loading && !error && !data ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">Sin registros en esta sección.</p>
        ) : null}
      </div>
    </div>
  );
}
