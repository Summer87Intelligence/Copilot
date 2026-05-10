"use client";

import { useMemo, useState } from "react";

import type { DataRow } from "@/lib/copilot-data";
import {
  buildClientAccountStatement,
  describeMovementKind,
  formatStatementAmount,
  type AccountStatementByCurrency,
  type AccountStatementCurrency,
  type AccountStatementMovement,
} from "@/lib/copilot-client-account-statement";
import {
  buildClientAccountStatementByInvoice,
  describeInvoiceFocusedStatus,
  type ClientAccountStatementByInvoice,
  type InvoiceFocusedByCurrency,
  type InvoiceFocusedCurrency,
  type InvoiceFocusedRow,
  type InvoiceFocusedStatus,
  type UnmatchedReceiptRow,
} from "@/lib/copilot-client-account-statement-by-invoice";
import {
  type AfterCutoffByCurrency,
  type AfterCutoffMovement,
  type ClientAfterCutoff,
} from "@/lib/copilot-client-account-statement-after-cutoff";
import { formatYmdDisplay } from "@/lib/copilot-datos-period-filter";

type ViewMode = "current_account" | "by_invoice";

const CURRENCY_LABEL: Record<AccountStatementCurrency, string> = {
  UYU: "Pesos",
  USD: "Dólares",
};

const CURRENCY_SYMBOL: Record<AccountStatementCurrency, string> = {
  UYU: "$",
  USD: "U$S",
};

/**
 * Estado de cuenta de un cliente, separado por moneda (UYU / USD).
 *
 * Read-only: deriva todo desde las filas que el sidebar ya carga
 * (`getProtoInvoicesByCompany` + `getProtoReceiptsByCompany`). NO toca DB ni balances.
 *
 * Modos de vista:
 *  - `Cuenta corriente` (default): movimientos cronológicos (factura/recibo) con
 *    saldo acumulado. Si `finalBalance < 0`, se muestra nota neutra "Saldo a favor".
 *  - `Por factura`: usa `proto_invoices.balance_amount` como fuente autoritativa
 *    (Zeta). Recibos sincronizados se listan aparte como "sin imputación detectable".
 *
 * Props opcionales (para reproducir el formato del reporte oficial Zeta):
 *  - `clientName` / `clientCode`: encabezado del reporte (sin tocar la lista DB).
 *  - `periodLabel`: etiqueta humana del período activo (ej: "Del 01/12/2025 al
 *    17/04/2026", "Mayo 2026", "Histórico completo"). Cuando se pasa, las filas
 *    deben venir ya filtradas por el caller; este componente NO refiltrar.
 *  - `periodEndLabel`: fecha visible al pie del saldo final ("17/04/2026"). Si
 *    no se pasa, no se muestra el sufijo "al ...".
 *  - `ledgerMode`: opta por la capa financiera. Cuando es `true`, los helpers
 *    NO filtran por `is_active`, y las filas archivadas (facturas cobradas que
 *    quedaron `is_active=false`) siguen apareciendo en el estado de cuenta.
 *    Default `false` (capa operacional, comportamiento previo).
 *  - `isFullHistory`: `true` cuando no hay filtro de período activo. Determina
 *    el microcopy del header ("incluye todos los movimientos" vs "únicamente los
 *    del período"). Default `true` si no se especifica (asume el caller no está
 *    filtrando).
 *  - `cutoffFromYmd` / `cutoffToYmd`: extremos del rango activo en YYYY-MM-DD.
 *    Cuando `cutoffToYmd` está definido, el header pasa a modo "Corte histórico"
 *    y se renderiza el panel "Movimientos posteriores al corte" si `afterCutoff`
 *    trae filas posteriores.
 *  - `afterCutoff`: dataset (por moneda) con los movimientos sincronizados después
 *    del `cutoffToYmd`. Lo computa el caller usando
 *    `buildClientAfterCutoffMovements` desde el dataset ledger SIN filtrar por
 *    período. Si no se pasa, el panel queda oculto.
 *  - `onCompareWithPdf`: callback opcional para el botón "Comparar contra PDF Zeta".
 *    El sidebar lo implementa cambiando el panel a modo rango y enfocando "Desde".
 *    Se muestra sólo en estado actual (sin filtro de período).
 */
export function CopilotClientAccountStatement({
  invoices,
  receipts,
  clientName,
  clientCode,
  periodLabel,
  periodEndLabel,
  ledgerMode,
  isFullHistory = true,
  cutoffFromYmd,
  cutoffToYmd,
  afterCutoff,
  onCompareWithPdf,
}: {
  invoices: DataRow[];
  receipts: DataRow[];
  clientName?: string;
  clientCode?: string;
  periodLabel?: string;
  periodEndLabel?: string;
  ledgerMode?: boolean;
  isFullHistory?: boolean;
  cutoffFromYmd?: string;
  cutoffToYmd?: string;
  afterCutoff?: ClientAfterCutoff;
  onCompareWithPdf?: () => void;
}) {
  const statement = useMemo(
    () => buildClientAccountStatement({ invoices, receipts, ledgerMode }),
    [invoices, receipts, ledgerMode]
  );
  const byInvoice = useMemo(
    () => buildClientAccountStatementByInvoice({ invoices, receipts, ledgerMode }),
    [invoices, receipts, ledgerMode]
  );

  const initialCurrency = useMemo<AccountStatementCurrency>(() => {
    if (statement.uyu.summary.movementCount > 0) return "UYU";
    if (statement.usd.summary.movementCount > 0) return "USD";
    if (byInvoice.uyu.summary.invoiceCount > 0) return "UYU";
    if (byInvoice.usd.summary.invoiceCount > 0) return "USD";
    return "UYU";
  }, [statement, byInvoice]);

  const [view, setView] = useState<ViewMode>("current_account");
  const [currency, setCurrency] = useState<AccountStatementCurrency>(initialCurrency);
  const block = currency === "USD" ? statement.usd : statement.uyu;
  const invoiceBlock = currency === "USD" ? byInvoice.usd : byInvoice.uyu;

  // Saldo contable acumulado mostrado en header. Sin importar la vista, se
  // pinta el cierre de cuenta corriente: es el dato comparable contra el
  // "SALDO" del PDF Zeta. NO es la deuda operativa actual (esa la calcula la
  // vista "Por factura" usando `balance_amount` informado por Zeta).
  const headerFinalBalance = block.summary.finalBalance;

  // Modo de presentación del header:
  //  - "current"    → estado actual (sin filtro o filtro sin `to` claro)
  //  - "cutoff"     → corte histórico (rango con `to` definido)
  // Sólo "cutoff" expone el panel de movimientos posteriores y el sufijo
  // "al DD/MM/YYYY" en el header. Esto desambigua "Histórico completo" del
  // viejo wording: ahora es explícitamente "Estado actual acumulado".
  const cutoffMode: "current" | "cutoff" = cutoffToYmd ? "cutoff" : "current";
  const presentationLabel =
    cutoffMode === "cutoff"
      ? `Estado histórico al ${formatYmdDisplay(cutoffToYmd)}`
      : isFullHistory
        ? "Estado actual acumulado"
        : (periodLabel ?? "Estado actual acumulado");

  const afterCutoffBlock = afterCutoff
    ? currency === "USD"
      ? afterCutoff.usd
      : afterCutoff.uyu
    : null;
  const showAfterCutoffPanel =
    cutoffMode === "cutoff" && afterCutoffBlock != null && afterCutoffBlock.movements.length > 0;

  return (
    <section
      aria-label="Estado de cuenta del cliente"
      className="space-y-3 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3"
    >
      <ReportHeader
        currency={currency}
        clientName={clientName}
        clientCode={clientCode}
        presentationLabel={presentationLabel}
        cutoffMode={cutoffMode}
        finalBalance={headerFinalBalance}
        periodEndLabel={periodEndLabel}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <CurrencyPill currency={currency} />
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle current={view} onChange={setView} />
          <CurrencyTabs
            current={currency}
            onChange={setCurrency}
            statement={statement}
            byInvoice={byInvoice}
            view={view}
          />
        </div>
      </div>

      <ContextHint
        view={view}
        cutoffMode={cutoffMode}
        cutoffFromYmd={cutoffFromYmd}
        cutoffToYmd={cutoffToYmd}
        isFullHistory={isFullHistory}
      />

      {/*
        Recordatorio activo sólo en "Estado actual": el usuario suele comparar
        contra un PDF Zeta cerrado a una fecha y se confunde porque Copilot
        sigue acumulando movimientos. La nota + botón guían a aplicar el rango.
      */}
      {cutoffMode === "current" && isFullHistory && onCompareWithPdf ? (
        <CompareWithPdfHint onCompare={onCompareWithPdf} />
      ) : null}

      {statement.unknownCurrencyCount > 0 ? (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900"
        >
          {statement.unknownCurrencyCount} movimiento(s) descartado(s) por moneda no
          determinable. No se asume UYU por defecto.
        </p>
      ) : null}

      {view === "current_account" ? (
        <CurrentAccountView
          block={block}
          currency={currency}
          periodEndLabel={periodEndLabel}
        />
      ) : (
        <ByInvoiceView block={invoiceBlock} />
      )}

      {showAfterCutoffPanel && afterCutoffBlock ? (
        <AfterCutoffPanel
          block={afterCutoffBlock}
          cutoffToYmd={cutoffToYmd ?? ""}
          finalBalanceAtCutoff={headerFinalBalance}
        />
      ) : null}
    </section>
  );
}

/**
 * Encabezado tipo reporte Zeta con badge fuerte de modo:
 *
 *   Estado de cuenta                        [Estado actual | Corte histórico]
 *   Cliente: [código] [razón social]
 *   Período: Estado actual acumulado | Estado histórico al DD/MM/YYYY | Mes/Año
 *   Moneda:  Pesos / Dólares
 *   Saldo contable acumulado: $ 12.300 / U$S 732,00 (al DD/MM/YYYY si hay corte)
 *
 * El badge desambigua de un vistazo si el saldo se está midiendo "ahora" o
 * "a fecha de corte", evitando la confusión histórica con el PDF Zeta.
 */
function ReportHeader({
  currency,
  clientName,
  clientCode,
  presentationLabel,
  cutoffMode,
  finalBalance,
  periodEndLabel,
}: {
  currency: AccountStatementCurrency;
  clientName?: string;
  clientCode?: string;
  presentationLabel: string;
  cutoffMode: "current" | "cutoff";
  finalBalance: number;
  periodEndLabel?: string;
}) {
  const clientLine = [clientCode, clientName].filter(Boolean).join(" · ");
  const balanceText = formatStatementAmount(finalBalance, currency);
  return (
    <header className="space-y-1 rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Estado de cuenta
        </p>
        <ModeBadge cutoffMode={cutoffMode} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-[auto_1fr]">
        {clientLine ? (
          <>
            <dt className="font-semibold text-[var(--copilot-ink-muted)]">Cliente</dt>
            <dd className="text-[var(--copilot-ink)]">{clientLine}</dd>
          </>
        ) : null}
        <dt className="font-semibold text-[var(--copilot-ink-muted)]">Período</dt>
        <dd className="text-[var(--copilot-ink)]">{presentationLabel}</dd>
        <dt className="font-semibold text-[var(--copilot-ink-muted)]">Moneda</dt>
        <dd className="text-[var(--copilot-ink)]">{CURRENCY_LABEL[currency]}</dd>
        <dt className="font-semibold text-[var(--copilot-ink-muted)]">
          Saldo contable acumulado
        </dt>
        <dd className="font-semibold tabular-nums text-[var(--copilot-accent)]">
          {balanceText}
          {periodEndLabel ? (
            <span className="ml-1 text-[10px] font-normal text-[var(--copilot-ink-muted)]">
              al {periodEndLabel}
            </span>
          ) : null}
        </dd>
      </dl>
    </header>
  );
}

/**
 * Badge fuerte que clarifica el modo del estado de cuenta:
 *  - "Estado actual" (slate) → saldo acumulado a hoy
 *  - "Corte histórico" (indigo) → saldo congelado a la fecha del rango
 *
 * Usamos paleta sobria (no rojo / verde) para no dar señal de bueno/malo.
 */
function ModeBadge({ cutoffMode }: { cutoffMode: "current" | "cutoff" }) {
  const cls =
    cutoffMode === "cutoff"
      ? "border-indigo-200 bg-indigo-50 text-indigo-900"
      : "border-slate-200 bg-slate-50 text-slate-700";
  const label = cutoffMode === "cutoff" ? "Corte histórico" : "Estado actual";
  return (
    <span
      aria-label={`Modo de cálculo: ${label}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

/**
 * Badge discreto que clasifica la naturaleza de la vista activa:
 *
 *  - "Lectura contable histórica" (slate) → vista Cuenta corriente.
 *    Calcula debe/haber con los movimientos sincronizados; puede diferir de
 *    la deuda operativa real si Zeta no expone cobranzas/notas/imputaciones
 *    completas en esta lectura.
 *  - "Deuda operativa actual" (emerald soft) → vista Por factura.
 *    Usa `proto_invoices.balance_amount` como fuente autoritativa de Zeta;
 *    es la lectura recomendada para analizar deuda real al día.
 *
 * Paleta sobria y consistente con el resto del componente. NO indica
 * bueno/malo, sólo desambigua de un vistazo qué representa cada lectura.
 */
function ViewModeBadge({ view }: { view: ViewMode }) {
  const isCurrent = view === "current_account";
  const cls = isCurrent
    ? "border-slate-200 bg-slate-50 text-slate-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-900";
  const label = isCurrent ? "Lectura contable histórica" : "Deuda operativa actual";
  return (
    <span
      aria-label={`Naturaleza de la vista: ${label}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

/**
 * Microcopy contextual: clarifica de un vistazo qué representa cada vista y
 * cómo afecta el período activo. Diferencia explícitamente:
 *
 *  - Cuenta corriente → lectura contable histórica/acumulada (debe/haber).
 *    Puede diferir de la deuda real por factura si Zeta no expone
 *    cobranzas, notas de crédito o imputaciones completas en esta lectura.
 *  - Por factura → deuda operativa actual según `balance_amount` Zeta.
 *    Es la lectura recomendada para analizar deuda real actual.
 *
 * Cola según contexto:
 *  - corte histórico (`cutoffMode === "cutoff"`):
 *    "Calculado únicamente con movimientos entre DD/MM/YYYY y DD/MM/YYYY."
 *    (o "hasta DD/MM/YYYY" si no hay `from`)
 *  - estado actual sin filtro:
 *    "Incluye todos los movimientos sincronizados del cliente."
 *  - filtro mes/año (sin `to` claro):
 *    "Incluye únicamente los movimientos del período seleccionado."
 */
function ContextHint({
  view,
  cutoffMode,
  cutoffFromYmd,
  cutoffToYmd,
  isFullHistory,
}: {
  view: ViewMode;
  cutoffMode: "current" | "cutoff";
  cutoffFromYmd?: string;
  cutoffToYmd?: string;
  isFullHistory: boolean;
}) {
  const description =
    view === "current_account"
      ? "Calcula debe/haber con los movimientos sincronizados disponibles. Puede diferir del saldo pendiente por factura si Zeta no expone cobranzas, notas de crédito o imputaciones completas en esta lectura."
      : "Usa el saldo pendiente informado por Zeta en cada factura. Esta es la lectura recomendada para analizar deuda real actual.";
  const tail = (() => {
    if (cutoffMode === "cutoff") {
      if (cutoffFromYmd && cutoffToYmd) {
        return `Calculado únicamente con movimientos entre ${formatYmdDisplay(
          cutoffFromYmd
        )} y ${formatYmdDisplay(cutoffToYmd)}.`;
      }
      if (cutoffToYmd) {
        return `Calculado únicamente con movimientos hasta ${formatYmdDisplay(cutoffToYmd)}.`;
      }
    }
    return isFullHistory
      ? "Incluye todos los movimientos sincronizados del cliente."
      : "Incluye únicamente los movimientos del período seleccionado.";
  })();
  return (
    <div
      role="note"
      className="space-y-1 rounded-md border border-[var(--copilot-border)] bg-white px-2.5 py-1.5"
    >
      <ViewModeBadge view={view} />
      <p className="text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
        <span className="text-[var(--copilot-ink)]">{description}</span>{" "}
        <span className="italic">{tail}</span>
      </p>
    </div>
  );
}

/**
 * Aviso + acción rápida para alinear Copilot con un PDF Zeta cerrado a una fecha.
 * Solo se muestra en modo "Estado actual" (sin filtro de período). El click
 * dispara el callback que el sidebar implementa: cambia a modo rango y enfoca
 * el input "Desde". NO hardcodea fechas.
 */
function CompareWithPdfHint({ onCompare }: { onCompare: () => void }) {
  return (
    <div
      role="note"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-indigo-200 bg-indigo-50/60 px-2.5 py-1.5 text-[11px] leading-snug text-indigo-900"
    >
      <span>
        Si estás comparando contra un PDF de Zeta, seleccioná el mismo rango de
        fechas del PDF.
      </span>
      <button
        type="button"
        onClick={onCompare}
        className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-900 transition hover:bg-indigo-100"
      >
        Comparar contra PDF Zeta
      </button>
    </div>
  );
}

/**
 * Panel colapsable con los movimientos sincronizados después del corte histórico.
 *
 * Contesta la pregunta:
 *   "¿Por qué el saldo al 17/04/2026 era U$S 732 pero ahora muestra U$S 0?"
 * mostrando A-701, A-2895, A-722 (caso real Álvarez) con su impacto neto sobre
 * el saldo. NO infiere imputaciones; solo lista lo que ocurrió después.
 */
function AfterCutoffPanel({
  block,
  cutoffToYmd,
  finalBalanceAtCutoff,
}: {
  block: AfterCutoffByCurrency;
  cutoffToYmd: string;
  finalBalanceAtCutoff: number;
}) {
  const [open, setOpen] = useState(true);
  const cur = block.currency;
  const sym = CURRENCY_SYMBOL[cur];
  const cutoffLabel = formatYmdDisplay(cutoffToYmd);
  // Saldo proyectado a hoy = saldo al corte − netImpact.
  // (netImpact = haber − debe; restarlo del saldo histórico equivale a aplicar
  //  los movimientos posteriores en orden: facturas suman y recibos restan.)
  const currentBalance = finalBalanceAtCutoff - block.netImpact;
  return (
    <section
      aria-label="Movimientos posteriores al corte"
      className="overflow-hidden rounded-lg border border-[var(--copilot-border)] bg-white"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 border-b border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2.5 py-1.5 text-left transition hover:bg-[rgba(44,40,37,0.04)]"
      >
        <span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Movimientos posteriores al corte
          </span>
          <span className="ml-2 text-[11px] text-[var(--copilot-ink-muted)]">
            ({block.movements.length} desde {cutoffLabel})
          </span>
        </span>
        <span aria-hidden="true" className="text-[11px] text-[var(--copilot-ink-muted)]">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-[var(--copilot-card)]">
                <tr>
                  <Th align="left">Fecha</Th>
                  <Th align="left">Comprobante</Th>
                  <Th align="left">Serie y Nº</Th>
                  <Th align="right">Debe</Th>
                  <Th align="right">Haber</Th>
                  <Th align="left">Impacto</Th>
                </tr>
              </thead>
              <tbody>
                {block.movements.map((m) => (
                  <AfterCutoffRow key={m.id} m={m} currency={cur} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-0.5 border-t border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2.5 py-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
            <p>
              Saldo al {cutoffLabel}:{" "}
              <span className="font-semibold tabular-nums text-[var(--copilot-ink)]">
                {formatStatementAmount(finalBalanceAtCutoff, cur)}
              </span>
              .
            </p>
            <p>
              Movimientos posteriores: Σ Debe{" "}
              <span className="tabular-nums">{formatStatementAmount(block.totalDebit, cur)}</span>{" "}
              · Σ Haber{" "}
              <span className="tabular-nums">{formatStatementAmount(block.totalCredit, cur)}</span>
              .
            </p>
            <p>
              Saldo proyectado a hoy:{" "}
              <span className="font-semibold tabular-nums text-[var(--copilot-ink)]">
                {sym} {currentBalance.toLocaleString("es-UY", { maximumFractionDigits: 2 })}
              </span>
              .
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}

function AfterCutoffRow({
  m,
  currency,
}: {
  m: AfterCutoffMovement;
  currency: AccountStatementCurrency;
}) {
  const impact =
    m.kind === "invoice"
      ? `Aumenta saldo (+${formatStatementAmount(m.debit, currency)})`
      : `Reduce saldo (−${formatStatementAmount(m.credit, currency)})`;
  return (
    <tr className="border-b border-[var(--copilot-border)] last:border-b-0">
      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-[var(--copilot-ink)]">
        {m.date}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-[var(--copilot-ink)]">
        {m.kind === "invoice" ? "Venta Crédito (CFE)" : "Recibo de Cobro"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-[var(--copilot-ink)]">
        {m.seriesNumber}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink)]">
        {formatStatementAmount(m.debit, currency, { showZero: false }) || "—"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink)]">
        {formatStatementAmount(m.credit, currency, { showZero: false }) || "—"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
        {impact}
      </td>
    </tr>
  );
}

function CurrencyPill({ currency }: { currency: AccountStatementCurrency }) {
  return (
    <span
      aria-label={`Moneda activa: ${CURRENCY_LABEL[currency]}`}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--copilot-border)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--copilot-ink-muted)]"
    >
      <span aria-hidden="true" className="font-semibold text-[var(--copilot-ink)]">
        {CURRENCY_SYMBOL[currency]}
      </span>
      <span>{CURRENCY_LABEL[currency]}</span>
    </span>
  );
}

function ViewToggle({
  current,
  onChange,
}: {
  current: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const tabs: Array<{ id: ViewMode; label: string }> = [
    { id: "current_account", label: "Cuenta corriente" },
    { id: "by_invoice", label: "Por factura" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Vista del estado de cuenta"
      className="inline-flex rounded-lg border border-[var(--copilot-border)] bg-white p-0.5 text-[11px]"
    >
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={
              active
                ? "rounded-md bg-[var(--copilot-accent-soft)] px-2.5 py-1 font-semibold text-[var(--copilot-accent)]"
                : "rounded-md px-2.5 py-1 font-medium text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function CurrencyTabs({
  current,
  onChange,
  statement,
  byInvoice,
  view,
}: {
  current: AccountStatementCurrency;
  onChange: (c: AccountStatementCurrency) => void;
  statement: { uyu: AccountStatementByCurrency; usd: AccountStatementByCurrency };
  byInvoice: ClientAccountStatementByInvoice;
  view: ViewMode;
}) {
  const tabs: Array<{ id: AccountStatementCurrency; label: string; count: number }> = [
    {
      id: "UYU",
      label: CURRENCY_LABEL.UYU,
      count:
        view === "current_account"
          ? statement.uyu.summary.movementCount
          : byInvoice.uyu.summary.invoiceCount,
    },
    {
      id: "USD",
      label: CURRENCY_LABEL.USD,
      count:
        view === "current_account"
          ? statement.usd.summary.movementCount
          : byInvoice.usd.summary.invoiceCount,
    },
  ];
  return (
    <div
      role="tablist"
      aria-label="Moneda del estado de cuenta"
      className="inline-flex rounded-lg border border-[var(--copilot-border)] bg-white p-0.5 text-xs"
    >
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={
              active
                ? "rounded-md bg-[var(--copilot-accent-soft)] px-2.5 py-1 font-semibold text-[var(--copilot-accent)]"
                : "rounded-md px-2.5 py-1 font-medium text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
            }
          >
            {t.label}
            <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-[rgba(44,40,37,0.06)] px-1 text-[10px] tabular-nums">
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vista 1 — Cuenta corriente (cronológica)
// ---------------------------------------------------------------------------

function CurrentAccountView({
  block,
  currency,
  periodEndLabel,
}: {
  block: AccountStatementByCurrency;
  currency: AccountStatementCurrency;
  periodEndLabel?: string;
}) {
  return (
    <>
      <Summary block={block} />
      {block.summary.hasNegativeBalance ? (
        <p
          role="note"
          className="rounded-md border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]"
        >
          <span className="font-semibold text-[var(--copilot-ink)]">
            Saldo a favor del cliente.
          </span>{" "}
          Puede incluir anticipos o recibos sin imputación detectable desde Zeta.
        </p>
      ) : null}

      {block.movements.length === 0 ? (
        <EmptyState currency={currency} />
      ) : (
        <>
          <MovementsTable block={block} />
          <ReportFooter block={block} periodEndLabel={periodEndLabel} />
        </>
      )}
    </>
  );
}

/**
 * Pie de reporte (parecido al PDF), exclusivo de la vista "Cuenta corriente":
 *   SALDO CONTABLE U$S al 17/04/2026 ........ 732,00
 *   SALDO CONTABLE $ ........................ 12.300
 * Si no se conoce el cierre, se omite el "al ...". El "CONTABLE" refuerza que
 * el cierre es la lectura debe-haber acumulada y NO la deuda operativa actual.
 */
function ReportFooter({
  block,
  periodEndLabel,
}: {
  block: AccountStatementByCurrency;
  periodEndLabel?: string;
}) {
  const cur = block.currency;
  const sym = CURRENCY_SYMBOL[cur];
  const balance = formatStatementAmount(block.summary.finalBalance, cur);
  return (
    <div className="flex flex-wrap items-baseline justify-end gap-2 rounded-md border border-dashed border-[var(--copilot-border)] bg-white px-3 py-2 text-[11px]">
      <span className="font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        SALDO CONTABLE {sym}
        {periodEndLabel ? (
          <span className="ml-1 font-normal normal-case text-[var(--copilot-ink-muted)]">
            al {periodEndLabel}
          </span>
        ) : null}
      </span>
      <span aria-hidden="true" className="flex-1 border-b border-dotted border-[var(--copilot-border)]" />
      <span className="font-semibold tabular-nums text-[var(--copilot-ink)]">{balance}</span>
    </div>
  );
}

function Summary({ block }: { block: AccountStatementByCurrency }) {
  const { summary, currency } = block;
  const items: Array<{ label: string; value: string; tone?: "muted" | "accent" }> = [
    { label: "Total debe", value: formatStatementAmount(summary.totalDebit, currency) },
    { label: "Total haber", value: formatStatementAmount(summary.totalCredit, currency) },
    {
      label: "Saldo contable acumulado",
      value: formatStatementAmount(summary.finalBalance, currency),
      tone: "accent",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            {it.label}
          </p>
          <p
            className={
              it.tone === "accent"
                ? "mt-0.5 text-sm font-semibold tabular-nums text-[var(--copilot-accent)]"
                : it.tone === "muted"
                  ? "mt-0.5 text-xs italic text-[var(--copilot-ink-muted)]"
                  : "mt-0.5 text-sm tabular-nums text-[var(--copilot-ink)]"
            }
          >
            {it.value}
          </p>
        </div>
      ))}
      <p className="sm:col-span-3 text-[11px] italic text-[var(--copilot-ink-muted)]">
        Saldo contable acumulado = Total debe − Total haber.
      </p>
      {!summary.hasCreditNoteSupport ? (
        <p className="sm:col-span-3 rounded-lg border border-dashed border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-[11px] italic text-[var(--copilot-ink-muted)]">
          Notas de crédito no detectadas en la metadata sincronizada; no se inventan movimientos.
        </p>
      ) : null}
    </div>
  );
}

function EmptyState({ currency }: { currency: AccountStatementCurrency }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-dashed border-[var(--copilot-border)] bg-white px-3 py-6 text-center text-xs text-[var(--copilot-ink-muted)]"
    >
      Sin movimientos en {CURRENCY_LABEL[currency].toLowerCase()} para este cliente.
    </p>
  );
}

function MovementsTable({ block }: { block: AccountStatementByCurrency }) {
  // Más reciente arriba; el `runningBalance` se calcula ASC y se preserva por movimiento.
  const visible = useMemo(() => block.movements.slice().reverse(), [block.movements]);
  const cur = block.currency;
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--copilot-border)] bg-white">
      <div className="max-h-[320px] overflow-x-auto overflow-y-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
            <tr>
              <Th align="left">Fecha</Th>
              <Th align="left">Comprobante</Th>
              <Th align="left">Serie y Nº</Th>
              <Th align="left">Moneda</Th>
              <Th align="right">Debe</Th>
              <Th align="right">Haber</Th>
              <Th align="right">Saldo</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <Row key={m.id || `${m.kind}-${m.date}-${m.number}`} m={m} currency={cur} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Comprobante (label tipo Zeta) por kind:
 *  - invoice     → "Venta Crédito (CFE)"
 *  - receipt     → "Recibo de Cobro"
 *  - credit_note → "Nota de Crédito"
 *
 * No se mezcla con `describeMovementKind` para no romper otros consumidores
 * que esperan los textos cortos ("Factura" / "Recibo").
 */
function describeDocumentTypeReport(
  m: AccountStatementMovement
): string {
  if (m.kind === "invoice") return "Venta Crédito (CFE)";
  if (m.kind === "receipt") return "Recibo de Cobro";
  return describeMovementKind(m.kind);
}

/**
 * Extrae "Serie-Número" desde el identificador persistido por el pipeline Zeta.
 *  - Facturas: `ZETA:CCV1:{empresa}:{cliente}:{serie}:{numero}` → "A-2773"
 *  - Recibos:  el `reference` ya viene como "A-587" en `proto_receipts`; el helper
 *    inspecciona `m.raw.reference` antes de caer al `m.number` crudo.
 *
 * Si no parsea, devuelve el `m.number` original o "—".
 */
function formatSeriesNumber(m: AccountStatementMovement): string {
  if (m.kind === "receipt") {
    const ref = String(m.raw?.reference ?? "").trim();
    const m1 = /^([A-Za-z])\s*[-]?\s*0*(\d+)/.exec(ref);
    if (m1) return `${m1[1].toUpperCase()}-${m1[2]}`;
  }
  const num = String(m.number ?? "").trim();
  if (!num) return "—";
  const m2 = /:([A-Za-z]+):0*(\d+)\s*$/.exec(num);
  if (m2) return `${m2[1].toUpperCase()}-${m2[2]}`;
  return num;
}

function Row({
  m,
  currency,
}: {
  m: AccountStatementMovement;
  currency: AccountStatementCurrency;
}) {
  return (
    <tr className="border-b border-[var(--copilot-border)] last:border-b-0 hover:bg-[rgba(44,40,37,0.03)]">
      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-[var(--copilot-ink)]">
        {m.date || "—"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-[var(--copilot-ink)]">
        {describeDocumentTypeReport(m)}
      </td>
      <td
        className="max-w-[140px] truncate px-2.5 py-1.5 tabular-nums text-[var(--copilot-ink)]"
        title={m.number}
      >
        {formatSeriesNumber(m)}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-[var(--copilot-ink-muted)]">
        {CURRENCY_SYMBOL[m.currency]}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink)]">
        {formatStatementAmount(m.debit, currency, { showZero: false }) || "—"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink)]">
        {formatStatementAmount(m.credit, currency, { showZero: false }) || "—"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums text-[var(--copilot-ink)]">
        {formatStatementAmount(m.runningBalance, currency)}
      </td>
    </tr>
  );
}

function Th({
  children,
  align,
  hideOnMobile,
}: {
  children: React.ReactNode;
  align: "left" | "right";
  hideOnMobile?: boolean;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-[var(--copilot-border)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] ${
        align === "right" ? "text-right" : "text-left"
      } ${hideOnMobile ? "hidden sm:table-cell" : ""}`}
    >
      {children}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Vista 2 — Por factura (autoritativa: balance_amount de Zeta)
// ---------------------------------------------------------------------------

function ByInvoiceView({ block }: { block: InvoiceFocusedByCurrency }) {
  const { summary, invoices, currency } = block;
  const allPaid =
    summary.invoiceCount > 0 &&
    summary.totalPending === 0 &&
    summary.partialCount === 0 &&
    summary.pendingCount === 0;

  return (
    <>
      <ByInvoiceSummary block={block} />

      {allPaid ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-[11px] text-emerald-900"
        >
          Sin saldo pendiente: todas las facturas en {CURRENCY_LABEL[currency].toLowerCase()}{" "}
          figuran cobradas según Zeta.
        </p>
      ) : null}

      {invoices.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-dashed border-[var(--copilot-border)] bg-white px-3 py-6 text-center text-xs text-[var(--copilot-ink-muted)]"
        >
          Sin facturas en {CURRENCY_LABEL[currency].toLowerCase()} para este cliente.
        </p>
      ) : (
        <InvoicesTable block={block} />
      )}

      <UnmatchedReceiptsPanel block={block} />
    </>
  );
}

function ByInvoiceSummary({ block }: { block: InvoiceFocusedByCurrency }) {
  const { summary, currency } = block;
  const amountItems: Array<{
    label: string;
    value: string;
    tone?: "muted" | "accent";
  }> = [
    {
      label: "Total facturado",
      value: formatStatementAmount(summary.totalInvoiced, currency),
    },
    {
      label: "Cobrado según Zeta",
      value: formatStatementAmount(summary.totalCollectedApplied, currency),
    },
    {
      label: "Pendiente según Zeta",
      value: formatStatementAmount(summary.totalPending, currency),
      tone: "accent",
    },
  ];
  // Counts por estado (cobradas / parciales / pendientes). Se calculan en el
  // helper sin inferir linking factura↔recibo: usan únicamente `balance_amount`.
  const countItems: Array<{
    label: string;
    value: number;
    tone: "paid" | "partial" | "pending";
  }> = [
    { label: "Facturas cobradas", value: summary.paidCount, tone: "paid" },
    { label: "Facturas parciales", value: summary.partialCount, tone: "partial" },
    { label: "Facturas pendientes", value: summary.pendingCount, tone: "pending" },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {amountItems.map((it) => (
          <div
            key={it.label}
            className="rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {it.label}
            </p>
            <p
              className={
                it.tone === "accent"
                  ? "mt-0.5 text-sm font-semibold tabular-nums text-[var(--copilot-accent)]"
                  : "mt-0.5 text-sm tabular-nums text-[var(--copilot-ink)]"
              }
            >
              {it.value}
            </p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {countItems.map((it) => {
          const cls =
            it.tone === "paid"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : it.tone === "partial"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-slate-50 text-slate-700";
          return (
            <div
              key={it.label}
              className={`rounded-lg border px-2.5 py-2 ${cls}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                {it.label}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{it.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvoicesTable({ block }: { block: InvoiceFocusedByCurrency }) {
  const cur = block.currency;
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--copilot-border)] bg-white">
      <div className="max-h-[280px] overflow-x-auto overflow-y-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
            <tr>
              <Th align="left">Factura</Th>
              <Th align="left" hideOnMobile>
                Fecha
              </Th>
              <Th align="right">Total</Th>
              <Th align="right" hideOnMobile>
                Cobrado
              </Th>
              <Th align="right">Pendiente</Th>
              <Th align="left">Estado</Th>
            </tr>
          </thead>
          <tbody>
            {block.invoices.map((inv) => (
              <InvoiceRow
                key={inv.id || `${inv.number}-${inv.date}`}
                row={inv}
                currency={cur}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceRow({
  row,
  currency,
}: {
  row: InvoiceFocusedRow;
  currency: InvoiceFocusedCurrency;
}) {
  return (
    <tr className="border-b border-[var(--copilot-border)] last:border-b-0 hover:bg-[rgba(44,40,37,0.03)]">
      <td
        className="max-w-[160px] truncate px-2.5 py-1.5 text-[var(--copilot-ink)]"
        title={row.number}
      >
        {row.number}
      </td>
      <td className="hidden whitespace-nowrap px-2.5 py-1.5 tabular-nums text-[var(--copilot-ink-muted)] sm:table-cell">
        {row.date || "—"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink)]">
        {formatStatementAmount(row.totalAmount, currency)}
      </td>
      <td className="hidden whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink-muted)] sm:table-cell">
        {formatStatementAmount(row.paidAmount, currency, { showZero: false }) || "—"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums text-[var(--copilot-ink)]">
        {formatStatementAmount(row.pendingAmount, currency, { showZero: false }) || "—"}
      </td>
      <td className="px-2.5 py-1.5">
        <StatusBadge status={row.status} />
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: InvoiceFocusedStatus }) {
  // Paleta sin rojo agresivo:
  //  - paid    → emerald muy suave (positivo, pero no celebratorio)
  //  - partial → amber (atención sutil)
  //  - pending → slate (informativo, deuda no urgente)
  const cls =
    status === "paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : status === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {describeInvoiceFocusedStatus(status)}
    </span>
  );
}

function UnmatchedReceiptsPanel({ block }: { block: InvoiceFocusedByCurrency }) {
  const cur = block.currency;
  if (block.unmatchedReceipts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--copilot-border)] bg-white px-2.5 py-2 text-[11px] text-[var(--copilot-ink-muted)]">
        Recibos sincronizados sin imputación detectable:{" "}
        <span className="italic">
          ninguno en {CURRENCY_LABEL[cur].toLowerCase()}.
        </span>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--copilot-border)] bg-white">
      <div className="border-b border-[var(--copilot-border)] bg-[var(--copilot-card)] px-2.5 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Recibos sincronizados sin imputación detectable
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
          {block.summary.unmatchedReceiptCount} recibo(s) ·{" "}
          {formatStatementAmount(block.summary.unmatchedReceiptAmount, cur)}.{" "}
          Estos recibos existen en Zeta, pero el endpoint actual no informa a qué factura
          fueron aplicados.
        </p>
      </div>
      <div className="max-h-[200px] overflow-x-auto overflow-y-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
            <tr>
              <Th align="left">Fecha</Th>
              <Th align="left">Recibo</Th>
              <Th align="right">Monto</Th>
              <Th align="left" hideOnMobile>
                Medio / Referencia
              </Th>
            </tr>
          </thead>
          <tbody>
            {block.unmatchedReceipts.map((r) => (
              <UnmatchedReceiptRowView
                key={r.id || `${r.number}-${r.date}`}
                row={r}
                currency={cur}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnmatchedReceiptRowView({
  row,
  currency,
}: {
  row: UnmatchedReceiptRow;
  currency: InvoiceFocusedCurrency;
}) {
  const detail = [row.paymentMethod, row.reference].filter(Boolean).join(" · ") || "—";
  return (
    <tr className="border-b border-[var(--copilot-border)] last:border-b-0 hover:bg-[rgba(44,40,37,0.03)]">
      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-[var(--copilot-ink)]">
        {row.date || "—"}
      </td>
      <td
        className="max-w-[160px] truncate px-2.5 py-1.5 text-[var(--copilot-ink)]"
        title={row.number}
      >
        {row.number}
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink)]">
        {formatStatementAmount(row.amount, currency)}
      </td>
      <td
        className="hidden max-w-[200px] truncate px-2.5 py-1.5 text-[var(--copilot-ink-muted)] sm:table-cell"
        title={detail}
      >
        {detail}
      </td>
    </tr>
  );
}
