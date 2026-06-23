"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import {
  normalizeNotificationBody,
  normalizeNotificationTitle,
} from "@/lib/copilot-notifications/notification-display";

const COBRANZA_NOTIFICATION_TYPES = new Set([
  "collection_received",
  "client_debt_settled",
  "new_debtor",
  "client_overdue",
  "debt_followup_summary",
]);

function isCobranzaNotification(n: CopilotNotification): boolean {
  if (!n.type) return false;
  return (
    COBRANZA_NOTIFICATION_TYPES.has(n.type as string) ||
    n.type.startsWith("client_") ||
    n.type.startsWith("collection_")
  );
}

function resolveAlertHref(n: CopilotNotification): string | null {
  if (n.action_href) {
    if (n.type === "debt_followup_summary") {
      return "/copilot/cobranza#clientes-a-gestionar";
    }
    return n.action_href;
  }
  if (n.entity_type === "company" && n.entity_id) {
    return `/copilot/clientes/${n.entity_id}`;
  }
  return null;
}

function resolveAlertCtaLabel(n: CopilotNotification): string {
  if (n.type === "collection_received") return "Ver cliente";
  if (n.type === "client_overdue" || n.type === "new_debtor") return "Gestionar cobranza";
  if (n.type === "debt_followup_summary") return "Ver atrasados";
  if (n.type === "client_debt_settled") return "Ver cliente";
  return "Ver detalle";
}

export function CobranzaAlertsFeed({
  notifications,
  loading,
}: {
  notifications: CopilotNotification[];
  loading: boolean;
}) {
  const cobranzaAlerts = notifications.filter(isCobranzaNotification).slice(0, 10);

  return (
    <div
      id="cobranza-alertas"
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-4 shadow-sm sm:px-5"
    >
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
          Alertas de cobranza
        </h2>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Novedades recientes · máx. 10
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--copilot-ink-muted)]">Cargando alertas…</p>
      ) : cobranzaAlerts.length === 0 ? (
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          No hay alertas de cobranza recientes.
        </p>
      ) : (
        <ul className="space-y-2">
          {cobranzaAlerts.map((n) => {
            const href = resolveAlertHref(n);
            const title = normalizeNotificationTitle(n.title, n.type);
            const body = normalizeNotificationBody(n.body, n.type);
            return (
              <li
                key={n.id}
                className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-3 py-2.5"
              >
                <p className="text-sm font-medium text-[var(--copilot-ink)]">{title}</p>
                {body ? (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                    {body}
                  </p>
                ) : null}
                {href ? (
                  <Link
                    href={href}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
                  >
                    {resolveAlertCtaLabel(n)}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4">
        <Link
          href="/copilot/alertas"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          Ver todas las alertas
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
