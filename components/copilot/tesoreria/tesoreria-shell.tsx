"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { TesoreriaControlBar } from "@/components/copilot/tesoreria/tesoreria-control-bar";
import { TesoreriaDashboard } from "@/components/copilot/tesoreria/tesoreria-dashboard";
import { TreasuryAccountsPanel } from "@/components/copilot/tesoreria/treasury-accounts-panel";
import { TreasuryBankPanel } from "@/components/copilot/tesoreria/treasury-bank-panel";
import { TreasuryFeedbackBanner } from "@/components/copilot/tesoreria/treasury-feedback-banner";
import { TreasuryManualCashPanel } from "@/components/copilot/tesoreria/treasury-manual-cash-panel";
import { TreasuryOpeningBalancesPanel } from "@/components/copilot/tesoreria/treasury-opening-balances-panel";
import { TreasuryObligationsPanel } from "@/components/copilot/tesoreria/treasury-obligations-panel";
import {
  TESORERIA_SECTIONS,
  type TesoreriaSection,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import { useTreasuryWorkspace } from "@/hooks/use-treasury-workspace";

function normalizeDateInput(value: string): string {
  return value.slice(0, 10);
}

function parseTesoreriaSection(raw: string | null): TesoreriaSection | null {
  if (!raw) return null;
  return TESORERIA_SECTIONS.some((item) => item.id === raw)
    ? (raw as TesoreriaSection)
    : null;
}

export function TesoreriaShell() {
  const searchParams = useSearchParams();
  const [section, setSection] = useState<TesoreriaSection>(
    () => parseTesoreriaSection(searchParams.get("section")) ?? "dashboard"
  );
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

  return (
    <div className="space-y-3">
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

      <nav className="flex flex-wrap gap-1.5" aria-label="Secciones de tesorería">
        {TESORERIA_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              section === item.id
                ? "bg-[var(--copilot-accent)] text-white shadow-sm"
                : "border border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {section === "dashboard" ? (
        <TesoreriaDashboard workspace={workspace} currencyFilter={currency} asOfDate={asOfDate} />
      ) : null}
      {section === "accounts" ? <TreasuryAccountsPanel workspace={workspace} /> : null}
      {section === "opening" ? <TreasuryOpeningBalancesPanel workspace={workspace} /> : null}
      {section === "manual" ? <TreasuryManualCashPanel workspace={workspace} /> : null}
      {section === "bank" ? <TreasuryBankPanel workspace={workspace} /> : null}
      {section === "obligations" ? (
        <TreasuryObligationsPanel workspace={workspace} asOfDate={asOfDate} />
      ) : null}
    </div>
  );
}
