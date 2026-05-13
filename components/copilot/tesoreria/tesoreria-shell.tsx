"use client";

import { useCallback, useMemo, useState } from "react";

import { TesoreriaControlBar } from "@/components/copilot/tesoreria/tesoreria-control-bar";
import { TesoreriaDashboard } from "@/components/copilot/tesoreria/tesoreria-dashboard";
import { TreasuryAccountsPanel } from "@/components/copilot/tesoreria/treasury-accounts-panel";
import { TreasuryBankPanel } from "@/components/copilot/tesoreria/treasury-bank-panel";
import { TreasuryFeedbackBanner } from "@/components/copilot/tesoreria/treasury-feedback-banner";
import { TreasuryManualCashPanel } from "@/components/copilot/tesoreria/treasury-manual-cash-panel";
import { TreasuryObligationsPanel } from "@/components/copilot/tesoreria/treasury-obligations-panel";
import {
  TESORERIA_SECTIONS,
  type TesoreriaSection,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import { useTreasuryWorkspace } from "@/hooks/use-treasury-workspace";

function normalizeDateInput(value: string): string {
  return value.slice(0, 10);
}

export function TesoreriaShell() {
  const [section, setSection] = useState<TesoreriaSection>("dashboard");
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
    <div className="space-y-4">
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
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {workspace.error}
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-2" aria-label="Secciones de tesorería">
        {TESORERIA_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
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
      {section === "manual" ? <TreasuryManualCashPanel workspace={workspace} /> : null}
      {section === "bank" ? <TreasuryBankPanel workspace={workspace} /> : null}
      {section === "obligations" ? (
        <TreasuryObligationsPanel workspace={workspace} asOfDate={asOfDate} />
      ) : null}
    </div>
  );
}
