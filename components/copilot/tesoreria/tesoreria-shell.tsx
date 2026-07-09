"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Link from "next/link";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { TreasuryReceiptsPanel } from "@/components/copilot/tesoreria/treasury-receipts-panel";
import { TreasuryFeedbackBanner } from "@/components/copilot/tesoreria/treasury-feedback-banner";
import { TreasuryManualCashPanel } from "@/components/copilot/tesoreria/treasury-manual-cash-panel";
import { TesoreriaPagosProximosTab } from "@/components/copilot/tesoreria/tesoreria-pagos-proximos-tab";
import {
  TesoreriaPageHeader,
  type TesoreriaQuickAction,
} from "@/components/copilot/tesoreria/tesoreria-page-header";
import { TesoreriaUnifiedActionForm } from "@/components/copilot/tesoreria/tesoreria-unified-action-form";
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
  const parsedSection = parseTesoreriaSection(sectionFromUrl) ?? "programados";
  const [section, setSection] = useState<TesoreriaSection>(parsedSection);
  const [appliedSectionFromUrl, setAppliedSectionFromUrl] = useState(sectionFromUrl);
  const [activeForm, setActiveForm] = useState<TesoreriaQuickAction | null>(null);

  if (sectionFromUrl !== appliedSectionFromUrl) {
    setAppliedSectionFromUrl(sectionFromUrl);
    const next = parseTesoreriaSection(sectionFromUrl) ?? "programados";
    if (next !== section) setSection(next);
  }

  const filters = useMemo(() => ({}), []);
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
    [router, pathname, searchParams, workspace]
  );

  const handleQuickAction = useCallback((action: TesoreriaQuickAction) => {
    if (action === "scheduled" || action === "recurring") {
      setSectionWithUrl("programados");
    } else {
      setSectionWithUrl("movimientos");
    }
    setActiveForm(action);
    requestAnimationFrame(() => {
      document.getElementById("tesoreria-action-form")?.scrollIntoView({ block: "nearest" });
    });
  }, [setSectionWithUrl]);

  useEffect(() => {
    if (!workspace.feedback) return;
    const timer = setTimeout(() => workspace.clearFeedback(), 5000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.feedback, workspace.clearFeedback]);

  return (
    <div className="space-y-6">
      <TesoreriaPageHeader
        workspace={workspace}
        onQuickAction={handleQuickAction}
        onRefresh={() => void workspace.refetch()}
      />

      {activeForm ? (
        <TesoreriaUnifiedActionForm
          action={activeForm}
          workspace={workspace}
          onClose={() => setActiveForm(null)}
          onSuccess={() => void workspace.refetch()}
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
        <div className="rounded-xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
          {workspace.error}
        </div>
      ) : null}

      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5 shadow-sm"
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

      {section === "programados" ? (
        <TesoreriaPagosProximosTab workspace={workspace} asOfDate={asOfDate} />
      ) : null}

      {section === "movimientos" ? (
        <div className="space-y-6">
          <TreasuryManualCashPanel workspace={workspace} />
          <section className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[rgba(248,246,242,0.5)] px-4 py-3.5">
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">
              ¿Extractos del banco?
            </p>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
              Para importar extractos y conciliar banco, usá{" "}
              <Link
                href="/copilot/movimientos-bancarios"
                className="font-semibold underline underline-offset-2"
              >
                Movimientos bancarios
              </Link>
              .
            </p>
          </section>
        </div>
      ) : null}

      {section === "cobranza" ? <TreasuryReceiptsPanel /> : null}
    </div>
  );
}
