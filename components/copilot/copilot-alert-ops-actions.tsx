"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { CopilotGhostButton, CopilotPrimaryButton, CopilotPrimaryLink } from "@/components/copilot/copilot-ui";
import {
  buildAccionesHrefFromAlert,
  buildOperationalActionHref,
  type CopilotAlertOpsAction,
} from "@/lib/copilot-alert-ops-mapper";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { FiscalAlertItem } from "@/lib/copilot-tax-alerts";

type Props = {
  primary: CopilotAlertOpsAction;
  quick: CopilotAlertOpsAction[];
  onOpenEvidence?: () => void;
  showEvidence?: boolean;
  compact?: boolean;
  followupAlert?: FiscalAlertItem;
  openOperationalActionId?: string | null;
};

async function persistFollowupFromAlert(alert: FiscalAlertItem) {
  const res = await copilotApiFetch("/api/copilot/operational-actions/from-alert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      alert_id: alert.id,
      title: alert.title,
      summary: alert.summary,
      priority: alert.priority,
      alert_type: alert.type,
      obligation_id: alert.obligationId,
      detail: alert.detail,
    }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "No se pudo crear el seguimiento.");
  }
}

function FollowupActionButton({
  action,
  alert,
  primary,
  compact,
  onDone,
}: {
  action: CopilotAlertOpsAction;
  alert: FiscalAlertItem;
  primary?: boolean;
  compact?: boolean;
  onDone: (href: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    setBusy(true);
    try {
      await persistFollowupFromAlert(alert);
      onDone(buildAccionesHrefFromAlert(alert));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el seguimiento.");
    } finally {
      setBusy(false);
    }
  };

  const className = primary
    ? compact
      ? "w-full justify-center sm:w-auto"
      : "inline-flex"
    : "rounded-lg border border-[var(--copilot-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--copilot-ink)] transition hover:bg-white";

  return (
    <div className={primary ? undefined : "inline-flex flex-col gap-1"}>
      {primary ? (
        <CopilotPrimaryButton
          type="button"
          disabled={busy}
          onClick={() => void onClick()}
          className={className}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {action.label}
        </CopilotPrimaryButton>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onClick()}
          className={`${className} inline-flex items-center gap-1.5 disabled:opacity-60`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {action.label}
        </button>
      )}
      {error ? <p className="text-[11px] text-rose-700">{error}</p> : null}
    </div>
  );
}

export function CopilotAlertOpsActions({
  primary,
  quick,
  onOpenEvidence,
  showEvidence = false,
  compact = false,
  followupAlert,
  openOperationalActionId,
}: Props) {
  const router = useRouter();
  const quickVisible = quick.filter((action) => action.id !== primary.id);

  const renderAction = (action: CopilotAlertOpsAction, isPrimary: boolean) => {
    if (action.kind === "followup" && followupAlert && openOperationalActionId) {
      return (
        <div key={action.id} className={isPrimary ? "space-y-2" : "inline-flex flex-col gap-1"}>
          <span className="inline-flex rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
            Seguimiento abierto
          </span>
          <CopilotPrimaryLink
            href={buildOperationalActionHref(openOperationalActionId)}
            className={compact ? "w-full justify-center sm:w-auto" : "inline-flex text-xs"}
          >
            Ver acción
          </CopilotPrimaryLink>
        </div>
      );
    }
    if (action.kind === "followup" && followupAlert) {
      return (
        <FollowupActionButton
          key={action.id}
          action={action}
          alert={followupAlert}
          primary={isPrimary}
          compact={compact}
          onDone={(href) => router.push(href)}
        />
      );
    }
    if (isPrimary) {
      return (
        <CopilotPrimaryLink
          key={action.id}
          href={action.href}
          className={compact ? "w-full justify-center sm:w-auto" : "inline-flex"}
        >
          {action.label}
        </CopilotPrimaryLink>
      );
    }
    return (
      <Link
        key={action.id}
        href={action.href}
        className="rounded-lg border border-[var(--copilot-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--copilot-ink)] transition hover:bg-white"
      >
        {action.label}
      </Link>
    );
  };

  return (
    <div className={compact ? "mt-3 space-y-2" : "space-y-3"}>
      {renderAction(primary, true)}
      <div className="flex flex-wrap gap-2">
        {quickVisible.map((action) => renderAction(action, false))}
        {showEvidence && onOpenEvidence ? (
          <CopilotGhostButton type="button" onClick={onOpenEvidence} className="text-xs">
            Ver respaldo fiscal
          </CopilotGhostButton>
        ) : null}
      </div>
    </div>
  );
}
