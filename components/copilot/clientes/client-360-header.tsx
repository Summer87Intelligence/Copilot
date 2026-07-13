"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";

import { ClientNextStepBanner } from "@/components/copilot/clientes/client-next-step-banner";
import type { Client360Payload } from "@/lib/copilot-client-360";
import { deriveClient360HeaderStatus } from "@/lib/copilot/client-360-header-status";
import { normalizeUruguayPhoneForWhatsApp } from "@/lib/phone/normalize-phone-for-whatsapp";
import {
  metricValueClass,
  subtleLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";

import { formatRelativeDays } from "./client-360-format";

type HeaderStatusTone = "neutral" | "positive" | "warning" | "danger";

const STATUS_BADGE_CLASS: Record<HeaderStatusTone, string> = {
  positive:
    "border-[var(--copilot-success-border)]/80 bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
  warning:
    "border-[var(--copilot-warning-border)]/80 bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  danger:
    "border-[var(--copilot-danger-border)]/80 bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  neutral: "border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink)]",
};

function riskTone(r: string) {
  if (r.includes("Alto"))
    return "border-[var(--copilot-danger-border)] bg-[var(--copilot-badge-danger-bg)]/80 text-[var(--copilot-danger-text-strong)]";
  if (r.includes("Medio"))
    return "border-[var(--copilot-warning-border)] bg-[var(--copilot-badge-warning-bg)]/80 text-[var(--copilot-warning-text-strong)]";
  return "border-[var(--copilot-success-border)] bg-[var(--copilot-badge-success-bg)]/70 text-[var(--copilot-success-text-strong)]";
}

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
      <span className={subtleLabelClass}>{label}</span>
      <span className={`text-[17px] leading-tight ${metricValueClass} ${tones[tone]}`}>{value}</span>
      {sub ? <span className="text-[11px] text-[var(--copilot-ink-muted)]">{sub}</span> : null}
    </div>
  );
}

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

export function Client360Header({
  data,
  riskLabel,
  hasMixedCurrency,
  onNavigateTab,
}: {
  data: Client360Payload;
  riskLabel: "Bajo" | "Medio" | "Alto";
  hasMixedCurrency: boolean;
  onNavigateTab: (tab: string) => void;
}) {
  const { mode: displayMode, fxRate: displayFxRate } = useDisplayCurrency();
  const isUsd360 = displayMode === "usd_equivalent";

  const headerStatus = deriveClient360HeaderStatus({
    isActive: data.summary.is_active !== false,
    debtUyu: data.debt_uyu,
    debtUsd: data.debt_usd,
    overdueUyu: data.overdue_uyu,
    overdueUsd: data.overdue_usd,
    risk: riskLabel,
  });

  return (
    <>
      {data.summary.is_active === false ? (
        <div className="border-b border-[var(--copilot-warning-border)] bg-[var(--copilot-card-bg)] px-6 py-3 text-sm font-medium text-[var(--copilot-warning-text-strong)]">
          Este cliente está inactivo (archivado). La ficha es de solo lectura.
        </div>
      ) : null}

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
                  <p className="text-sm text-[var(--copilot-ink-muted)]">{data.summary.razon_social}</p>
                ) : null}
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                  {data.summary.rut_documento ? <span>RUT {data.summary.rut_documento}</span> : null}
                  {data.summary.codigo ? <span>Código {data.summary.codigo}</span> : null}
                </div>
              </div>
            </div>
          </div>

          {/* Status badges */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE_CLASS[headerStatus.tone]}`}
            >
              {headerStatus.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${riskTone(riskLabel)}`}
            >
              Riesgo {riskLabel}
            </span>
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

        {/* Executive KPI grid */}
        <div className="border-t border-[var(--copilot-border)]/40 px-5 py-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {isUsd360 ? (
              <>
                <KpiChip
                  label="Saldo pendiente (est. USD)"
                  value={formatUsdEquivalent(
                    convertToUsdEquivalent({ uyu: data.debt_uyu, usd: data.debt_usd }, displayFxRate)
                  )}
                  sub={`TC ${displayFxRate}`}
                  tone={data.debt_uyu + data.debt_usd > 0 ? "warning" : "neutral"}
                />
                <KpiChip
                  label="Saldo atrasado (est. USD)"
                  value={formatUsdEquivalent(
                    convertToUsdEquivalent(
                      { uyu: data.overdue_uyu, usd: data.overdue_usd },
                      displayFxRate
                    )
                  )}
                  tone={data.overdue_uyu + data.overdue_usd > 0 ? "danger" : "neutral"}
                />
              </>
            ) : (
              <>
                <KpiChip
                  label="Saldo pendiente UYU"
                  value={`$ ${data.debt_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                  tone={data.debt_uyu > 0 ? "warning" : "neutral"}
                />
                <KpiChip
                  label="Saldo pendiente USD"
                  value={`U$S ${data.debt_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                  tone={data.debt_usd > 0 ? "warning" : "neutral"}
                />
                <KpiChip
                  label="Saldo atrasado UYU"
                  value={`$ ${data.overdue_uyu.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                  tone={data.overdue_uyu > 0 ? "danger" : "neutral"}
                />
                <KpiChip
                  label="Saldo atrasado USD"
                  value={`U$S ${data.overdue_usd.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                  tone={data.overdue_usd > 0 ? "danger" : "neutral"}
                />
              </>
            )}
            <KpiChip
              label="Facturas con atraso"
              value={String(data.overdue_invoice_count)}
              tone={data.overdue_invoice_count > 0 ? "danger" : "neutral"}
            />
            <KpiChip
              label="Último cobro"
              value={data.last_receipt_date ? formatRelativeDays(data.last_receipt_date) : "—"}
              tone={data.last_receipt_date ? "ok" : "warning"}
            />
          </div>
        </div>
      </div>

      {/* Próximo paso */}
      <div className="border-b border-[var(--copilot-border)] px-5 py-4">
        <ClientNextStepBanner
          data={data}
          onNavigateTab={onNavigateTab}
          onScrollToAssistant={() => onNavigateTab("cobranza")}
          onScrollToCollectionForm={() => onNavigateTab("cobranza")}
          onViewAccountStatement={() => onNavigateTab("cuenta")}
        />
      </div>
    </>
  );
}
