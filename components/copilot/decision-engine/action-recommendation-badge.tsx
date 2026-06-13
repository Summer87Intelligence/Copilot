"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CreditCard,
  Eye,
  MessageCircle,
  Phone,
  ShieldOff,
} from "lucide-react";
import type { ActionRecommendation, RiskAssessment } from "@/lib/decision-engine/de-types";
import {
  RECOMMENDED_ACTION_LABELS,
  RISK_LEVEL_LABELS,
  URGENCY_LEVEL_LABELS,
} from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Action icon + pill style
// ---------------------------------------------------------------------------

const ACTION_CONFIG: Record<string, { icon: React.ReactNode; pill: string }> = {
  send_reminder: {
    icon: <Bell className="h-3 w-3" />,
    pill: "bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)] border border-[var(--copilot-border)]",
  },
  manual_call: {
    icon: <Phone className="h-3 w-3" />,
    pill: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border border-[var(--copilot-danger-border)]",
  },
  escalate: {
    icon: <ArrowUpRight className="h-3 w-3" />,
    pill: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border border-[var(--copilot-danger-border)]",
  },
  payment_plan: {
    icon: <CreditCard className="h-3 w-3" />,
    pill: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border border-[var(--copilot-warning-border)]",
  },
  hold_credit: {
    icon: <ShieldOff className="h-3 w-3" />,
    pill: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border border-[var(--copilot-danger-border)]",
  },
  monitor: {
    icon: <Eye className="h-3 w-3" />,
    pill: "bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink-muted)] border border-[var(--copilot-border)]",
  },
  no_action: {
    icon: <MessageCircle className="h-3 w-3" />,
    pill: "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border border-[var(--copilot-success-border)]",
  },
};

const FALLBACK_CONFIG = {
  icon: <Eye className="h-3 w-3" />,
  pill: "bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink-muted)] border border-[var(--copilot-border)]",
};

const URGENCY_DOT: Record<string, string> = {
  critical: "bg-[var(--copilot-danger-text)]",
  high:     "bg-[var(--copilot-warning-text)]",
  medium:   "bg-[var(--copilot-warning-text)]",
  low:      "bg-[var(--copilot-success-text)]",
};

const RISK_PILL: Record<string, string> = {
  critical: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border border-[var(--copilot-danger-border)]",
  high:     "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border border-[var(--copilot-warning-border)]",
  medium:   "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border border-[var(--copilot-warning-border)]",
  low:      "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border border-[var(--copilot-success-border)]",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  recommendation?: ActionRecommendation | null;
  risk?: RiskAssessment | null;
  compact?: boolean;
};

export function ActionRecommendationBadge({ recommendation, risk, compact = false }: Props) {
  // Defensive: cache from before Phase 1B may not have these fields
  if (!recommendation) {
    if (compact) {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${FALLBACK_CONFIG.pill}`}>
          {FALLBACK_CONFIG.icon}
          <span>Revisar</span>
        </span>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${FALLBACK_CONFIG.pill}`}>
          {FALLBACK_CONFIG.icon}
          <span>Revisar</span>
        </span>
        {risk && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${RISK_PILL[risk.level] ?? ""}`}>
            <AlertTriangle className="h-3 w-3" />
            {RISK_LEVEL_LABELS[risk.level]}
          </span>
        )}
        <span className="text-xs text-[var(--copilot-text-muted)] italic">Sin recomendación calculada</span>
      </div>
    );
  }

  const cfg = ACTION_CONFIG[recommendation.action] ?? FALLBACK_CONFIG;
  const urgencyDot = URGENCY_DOT[recommendation.urgency] ?? "bg-[var(--copilot-border)]";
  const riskPill = risk ? (RISK_PILL[risk.level] ?? "bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink-muted)] border border-[var(--copilot-border)]") : null;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.pill}`}>
        {cfg.icon}
        <span>{RECOMMENDED_ACTION_LABELS[recommendation.action] ?? recommendation.action}</span>
      </span>
    );
  }

  return (
    <div className="space-y-2">
      {/* Action + urgency row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.pill}`}>
          {cfg.icon}
          <span>{RECOMMENDED_ACTION_LABELS[recommendation.action] ?? recommendation.action}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-[var(--copilot-text-muted)]">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${urgencyDot}`} />
          {URGENCY_LEVEL_LABELS[recommendation.urgency] ?? recommendation.urgency}
        </span>
        {riskPill && risk && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${riskPill}`}>
            <AlertTriangle className="h-3 w-3" />
            {RISK_LEVEL_LABELS[risk.level]}
          </span>
        )}
        <span className="text-xs text-[var(--copilot-text-muted)] tabular-nums">
          {recommendation.confidence}% confianza
        </span>
      </div>
      {/* Rationale */}
      {recommendation.rationale.length > 0 && (
        <ul className="space-y-0.5">
          {recommendation.rationale.map((r, i) => (
            <li key={i} className="text-xs text-[var(--copilot-text-secondary)] flex gap-1.5">
              <span className="text-[var(--copilot-text-muted)] shrink-0">·</span>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
