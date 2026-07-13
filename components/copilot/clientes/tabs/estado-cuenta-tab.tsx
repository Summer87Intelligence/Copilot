"use client";

import { useEffect, useState } from "react";
import { Download, Eye, Loader2, TrendingDown, X } from "lucide-react";

import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { AccountStatementSendCard } from "@/components/copilot/clientes/account-statement-send-card";
import type { Client360Payload } from "@/lib/copilot-client-360";
import {
  metricValueClass,
  neutralFinancialCardClass,
  warningFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import type { CollectionFollowupInitialValues } from "@/lib/account-statement/build-account-statement-followup-prefill";
import { FileText, CheckCircle2 } from "lucide-react";

import { cleanMovementLabel, formatDateShort } from "../client-360-format";

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

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function EstadoCuentaTab({
  companyId,
  data,
  isUsd360,
  displayFxRate,
  onSuggestFollowup,
}: {
  companyId: string;
  data: Client360Payload;
  isUsd360: boolean;
  displayFxRate: number;
  onSuggestFollowup: (prefill: CollectionFollowupInitialValues) => void;
}) {
  return (
    <div className="space-y-4 px-5 py-4">
      <AccountStatementPdfCard
        companyId={companyId}
        hasUyu={data.debt_uyu > 0 || data.cuenta.ultimos_movimientos.some((m) => m.kind === "factura")}
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
        onSuggestFollowup={onSuggestFollowup}
      />

      <div>
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">
          Saldo pendiente a cobrar del cliente
        </p>
        <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
          Saldo pendiente al corte informado por Zeta. El saldo atrasado ya está incluido.
          {isUsd360 ? " Totales convertidos a USD estimado." : " UYU y USD no se suman entre sí."}
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
              Saldo pendiente en pesos (UYU)
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
              {data.debt_uyu > 0 ? ` (${Math.round((data.overdue_uyu / data.debt_uyu) * 100)}%)` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">Al día</p>
          )}
          {data.last_receipt_date ? (
            <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
              Último cobro: {formatDateShort(data.last_receipt_date)}
            </p>
          ) : null}
        </CopilotCard>

        <CopilotCard className={warningFinancialCardClass}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Saldo pendiente en dólares (USD)
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
              {data.debt_usd > 0 ? ` (${Math.round((data.overdue_usd / data.debt_usd) * 100)}%)` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">Al día</p>
          )}
          {data.last_invoice_date ? (
            <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
              Última factura: {formatDateShort(data.last_invoice_date)}
            </p>
          ) : null}
        </CopilotCard>
      </div>

      <p className="text-[11px] text-[var(--copilot-ink-muted)]">
        El total pendiente incluye todas las facturas abiertas. El saldo atrasado es la parte que ya
        superó su fecha de vencimiento y está incluido dentro del total pendiente.
      </p>

      <CopilotCard className={neutralFinancialCardClass}>
        <CopilotSectionTitle
          title="Estado de cuenta histórico"
          subtitle="Facturas y cobros al último sync."
        />
        {data.cuenta.ultimos_movimientos.length === 0 ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">Sin movimientos registrados.</p>
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
  );
}
