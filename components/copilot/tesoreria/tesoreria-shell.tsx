"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { TesoreriaControlBar } from "@/components/copilot/tesoreria/tesoreria-control-bar";
import { TesoreriaDashboard } from "@/components/copilot/tesoreria/tesoreria-dashboard";
import { TreasuryAccountsPanel } from "@/components/copilot/tesoreria/treasury-accounts-panel";
import { TreasuryBankPanel } from "@/components/copilot/tesoreria/treasury-bank-panel";
import { TreasuryFeedbackBanner } from "@/components/copilot/tesoreria/treasury-feedback-banner";
import { TreasuryManualCashPanel } from "@/components/copilot/tesoreria/treasury-manual-cash-panel";
import { TreasuryOpeningBalancesPanel } from "@/components/copilot/tesoreria/treasury-opening-balances-panel";
import { TreasuryRecurringPaymentsPanel } from "@/components/copilot/tesoreria/treasury-recurring-payments-panel";
import { TreasuryObligationsPanel } from "@/components/copilot/tesoreria/treasury-obligations-panel";
import {
  TESORERIA_SECTION_ALIASES,
  TESORERIA_SECTIONS,
  TESORERIA_SECTIONS_CONFIG,
  TESORERIA_SECTIONS_MAIN,
  TESORERIA_SECTIONS_WITH_CONTROL_BAR,
  type TesoreriaSection,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import { useTreasuryWorkspace } from "@/hooks/use-treasury-workspace";

function normalizeDateInput(value: string): string {
  return value.slice(0, 10);
}

function parseTesoreriaSection(raw: string | null): TesoreriaSection | null {
  if (!raw) return null;
  const alias = TESORERIA_SECTION_ALIASES[raw];
  if (alias) return alias;
  return TESORERIA_SECTIONS.some((item) => item.id === raw)
    ? (raw as TesoreriaSection)
    : null;
}

const NAV_BTN_BASE =
  "rounded-lg px-3 py-1.5 text-xs font-medium transition";
const NAV_BTN_ACTIVE =
  "bg-[var(--copilot-accent)] text-white shadow-sm";
const NAV_BTN_IDLE =
  "border border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink)] hover:bg-[rgba(44,40,37,0.04)]";
const NAV_BTN_CONFIG_IDLE =
  "border border-[var(--copilot-border)] bg-white/50 text-[var(--copilot-ink-muted)] text-[11px] hover:bg-[rgba(44,40,37,0.04)]";

export function TesoreriaShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionFromUrl = searchParams.get("section");
  const [section, setSection] = useState<TesoreriaSection>(
    () => parseTesoreriaSection(sectionFromUrl) ?? "resumen"
  );

  useEffect(() => {
    const parsed = parseTesoreriaSection(sectionFromUrl);
    if (parsed && parsed !== section) setSection(parsed);
  }, [sectionFromUrl, section]);

  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [confirmedStart, setConfirmedStart] = useState("");
  const [confirmedEnd, setConfirmedEnd] = useState("");
  const [currency, setCurrency] = useState<"all" | "UYU" | "USD">("all");

  const filters = useMemo(
    () => ({
      currencyCode: currency === "all" ? undefined : currency,
      fromDate: confirmedStart || undefined,
      toDate: confirmedEnd || undefined,
    }),
    [currency, confirmedStart, confirmedEnd]
  );

  const workspace = useTreasuryWorkspace(filters);
  const asOfDate = new Date().toISOString().slice(0, 10);

  const setSectionWithUrl = useCallback(
    (next: TesoreriaSection) => {
      setSection(next);
      workspace.clearFeedback();
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams, workspace.clearFeedback]
  );

  useEffect(() => {
    if (!workspace.feedback) return;
    const timer = setTimeout(() => workspace.clearFeedback(), 5000);
    return () => clearTimeout(timer);
  }, [workspace.feedback, workspace.clearFeedback]);

  const hasPendingChanges =
    normalizeDateInput(draftStart) !== normalizeDateInput(confirmedStart) ||
    normalizeDateInput(draftEnd) !== normalizeDateInput(confirmedEnd);

  const handleConfirmDraft = useCallback(() => {
    const nextStart = normalizeDateInput(draftStart);
    const nextEnd = normalizeDateInput(draftEnd);
    if (nextStart && nextEnd && nextStart > nextEnd) return;
    setConfirmedStart(nextStart);
    setConfirmedEnd(nextEnd);
  }, [draftStart, draftEnd]);

  const showControlBar = TESORERIA_SECTIONS_WITH_CONTROL_BAR.has(section);

  return (
    <div className="space-y-3">
      {showControlBar ? (
        <TesoreriaControlBar
          draftStart={draftStart}
          draftEnd={draftEnd}
          currency={currency}
          onDraftStartChange={setDraftStart}
          onDraftEndChange={setDraftEnd}
          onCurrencyChange={setCurrency}
          hasPendingChanges={hasPendingChanges}
          onConfirmDraft={handleConfirmDraft}
          onRefresh={() => void workspace.refetch()}
          loading={workspace.loading}
          canRefresh
        />
      ) : null}

      {workspace.feedback ? (
        <TreasuryFeedbackBanner
          tone={workspace.feedback.tone}
          message={workspace.feedback.message}
          onClose={workspace.clearFeedback}
        />
      ) : null}

      {workspace.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {workspace.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Tabs principales */}
        <nav className="flex flex-wrap gap-1.5" aria-label="Secciones de tesorería">
          {TESORERIA_SECTIONS_MAIN.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSectionWithUrl(item.id)}
              className={`${NAV_BTN_BASE} ${section === item.id ? NAV_BTN_ACTIVE : NAV_BTN_IDLE}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Separador + configuración */}
        <div
          className="flex items-center gap-1.5 border-l border-[var(--copilot-border)] pl-2"
          aria-label="Configuración"
        >
          <span className="text-[10px] uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Config
          </span>
          {TESORERIA_SECTIONS_CONFIG.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSectionWithUrl(item.id)}
              className={`${NAV_BTN_BASE} ${section === item.id ? NAV_BTN_ACTIVE : NAV_BTN_CONFIG_IDLE}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {section === "resumen" ? (
        <TesoreriaDashboard
          workspace={workspace}
          asOfDate={asOfDate}
          onGoToPagos={() => setSectionWithUrl("pagos")}
        />
      ) : null}
      {section === "accounts" ? <TreasuryAccountsPanel workspace={workspace} /> : null}
      {section === "opening" ? <TreasuryOpeningBalancesPanel workspace={workspace} /> : null}
      {section === "recurring" ? <TreasuryRecurringPaymentsPanel workspace={workspace} /> : null}
      {section === "manual" ? <TreasuryManualCashPanel workspace={workspace} /> : null}
      {section === "bank" ? <TreasuryBankPanel workspace={workspace} /> : null}
      {section === "pagos" ? (
        <TreasuryObligationsPanel workspace={workspace} asOfDate={asOfDate} />
      ) : null}
    </div>
  );
}
