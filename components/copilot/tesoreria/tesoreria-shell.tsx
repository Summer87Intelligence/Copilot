"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { TreasuryAdvancedToolsPanel } from "@/components/copilot/tesoreria/treasury-advanced-tools-panel";
import { TreasuryReceiptsPanel } from "@/components/copilot/tesoreria/treasury-receipts-panel";
import { TreasuryCashPanel } from "@/components/copilot/tesoreria/treasury-cash-panel";
import { TreasuryFeedbackBanner } from "@/components/copilot/tesoreria/treasury-feedback-banner";
import { TreasuryManualCashPanel } from "@/components/copilot/tesoreria/treasury-manual-cash-panel";
import { TreasuryProgramadosPanel } from "@/components/copilot/tesoreria/treasury-programados-panel";
import { TreasuryRecurringPaymentsPanel } from "@/components/copilot/tesoreria/treasury-recurring-payments-panel";
import { TreasuryObligationsPanel } from "@/components/copilot/tesoreria/treasury-obligations-panel";
import {
  TesoreriaPageHeader,
  type TesoreriaQuickAction,
} from "@/components/copilot/tesoreria/tesoreria-page-header";
import {
  TESORERIA_SECTION_ALIASES,
  TESORERIA_SECTIONS,
  TESORERIA_SECTIONS_MAIN,
  type TesoreriaSection,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import { useTreasuryWorkspace } from "@/hooks/use-treasury-workspace";

function parseTesoreriaSection(raw: string | null): TesoreriaSection | null {
  if (!raw) return null;
  const alias = TESORERIA_SECTION_ALIASES[raw];
  if (alias) return alias;
  return TESORERIA_SECTIONS.some((item) => item.id === raw)
    ? (raw as TesoreriaSection)
    : null;
}

export function TesoreriaShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionFromUrl = searchParams.get("section");
  const parsedSection = parseTesoreriaSection(sectionFromUrl) ?? "caja";
  const [section, setSection] = useState<TesoreriaSection>(parsedSection);
  const [appliedSectionFromUrl, setAppliedSectionFromUrl] = useState(sectionFromUrl);

  const [cashFormRequest, setCashFormRequest] = useState<{
    key: number;
    preset?: Partial<{
      movementType: "income" | "expense";
      mode: "now" | "scheduled";
    }>;
  } | null>(null);
  const [obligationCreateRequest, setObligationCreateRequest] = useState(0);
  const [recurringCreateRequest, setRecurringCreateRequest] = useState(0);

  if (sectionFromUrl !== appliedSectionFromUrl) {
    setAppliedSectionFromUrl(sectionFromUrl);
    const next = parseTesoreriaSection(sectionFromUrl) ?? "caja";
    if (next !== section) setSection(next);
  }

  const filters = useMemo(() => ({}), []);
  const workspace = useTreasuryWorkspace(filters);
  const asOfDate = new Date().toISOString().slice(0, 10);

  const setSectionWithUrl = useCallback(
    (next: TesoreriaSection) => {
      setSection(next);
      workspace.clearFeedback();
      window.scrollTo(0, 0);
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams, workspace]
  );

  const handleQuickAction = useCallback(
    (action: TesoreriaQuickAction) => {
      if (action === "recurring") {
        setSectionWithUrl("programados");
        setRecurringCreateRequest((n) => n + 1);
        return;
      }
      if (action === "scheduled") {
        setSectionWithUrl("programados");
        setObligationCreateRequest((n) => n + 1);
        return;
      }
      setSectionWithUrl("caja");
      setCashFormRequest({
        key: Date.now(),
        preset: {
          movementType: action,
          mode: "now",
        },
      });
    },
    [setSectionWithUrl]
  );

  useEffect(() => {
    if (!workspace.feedback) return;
    const timer = setTimeout(() => workspace.clearFeedback(), 5000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: subscribing to feedback/clearFeedback properties avoids re-running on unrelated workspace changes
  }, [workspace.feedback, workspace.clearFeedback]);

  return (
    <div className="space-y-6">
      <TesoreriaPageHeader
        workspace={workspace}
        onQuickAction={handleQuickAction}
        onRefresh={() => void workspace.refetch()}
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

      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-sm"
        aria-label="Secciones de tesorería"
      >
        {TESORERIA_SECTIONS_MAIN.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSectionWithUrl(item.id)}
              className={copilotButtonClassName({
                variant: active ? "primary" : "ghost",
                size: "sm",
                className: active ? "" : "!border-transparent",
              })}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {section === "caja" ? (
        <TreasuryCashPanel
          workspace={workspace}
          asOfDate={asOfDate}
          formRequest={cashFormRequest}
          onFormRequestHandled={() => setCashFormRequest(null)}
        />
      ) : null}

      {section === "programados" ? (
        <div className="space-y-8">
          <TreasuryObligationsPanel
            workspace={workspace}
            asOfDate={asOfDate}
            hideSummary
            openCreateRequest={obligationCreateRequest}
          />
          <TreasuryRecurringPaymentsPanel
            workspace={workspace}
            onGoToPagos={() => setSectionWithUrl("programados")}
            openCreateRequest={recurringCreateRequest}
          />
          <TreasuryProgramadosPanel workspace={workspace} asOfDate={asOfDate} historialOnly />
        </div>
      ) : null}

      {section === "movimientos" ? (
        <div className="space-y-6">
          <TreasuryManualCashPanel workspace={workspace} />
          <TreasuryAdvancedToolsPanel workspace={workspace} />
        </div>
      ) : null}

      {section === "cobranza" ? <TreasuryReceiptsPanel /> : null}
    </div>
  );
}
