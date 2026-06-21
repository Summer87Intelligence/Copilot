import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";

/**
 * Returns true for cash_risk_detected notifications that were auto-resolved by
 * the consolidated-coverage recalculation (not manually read by the user).
 * Used to distinguish "stale alert" from "active risk" in the UI.
 */
export function isAutoResolvedCashRisk(n: CopilotNotification): boolean {
  return (
    n.type === "cash_risk_detected" &&
    n.read_at !== null &&
    typeof n.metadata?.auto_resolved_reason === "string"
  );
}

/** Reescribe copy legacy al mostrar (DB puede tener textos viejos). */
export function normalizeNotificationBody(
  body: string | null | undefined,
  type?: string
): string | null {
  if (!body) return null;
  let text = body.trim();
  if (!text) return null;

  text = text
    .replace(/cancel[oó]\s+su\s+saldo\s+pendiente/gi, "pagó su deuda")
    .replace(/liquid[oó]\s+su\s+saldo\s+pendiente/gi, "pagó su deuda")
    .replace(/saldo\s+pendiente\s+cancelado/gi, "deuda saldada")
    .replace(/\best[aá]\s+vencid[oa]\b/gi, (m) =>
      m.toLowerCase().includes("vencida") ? "está atrasada" : "está atrasado"
    )
    .replace(/\bvencid[oa]\b/gi, (m) =>
      m.toLowerCase().endsWith("a") ? "atrasada" : "atrasado"
    );

  if (type === "client_debt_settled" && /cancel/i.test(body)) {
    const name = text.split(/\s+/)[0] ?? "Cliente";
    return `${name} pagó su deuda.`;
  }

  return text;
}

export function normalizeNotificationTitle(
  title: string | null | undefined,
  type?: string
): string {
  const t = (title ?? "").trim();
  if (type === "client_debt_settled" && /cancel/i.test(t)) {
    return "Cliente saldó su deuda";
  }
  return t || "Notificación";
}

function displayDedupKey(n: CopilotNotification): string {
  const body = normalizeNotificationBody(n.body, n.type) ?? "";
  return [
    n.type,
    n.entity_id ?? "",
    n.currency ?? "",
    body.slice(0, 48).toLowerCase(),
  ].join("|");
}

/** Colapsa eventos visualmente iguales en el panel (no modifica DB). */
export function dedupeNotificationsForDisplay(
  notifications: readonly CopilotNotification[]
): CopilotNotification[] {
  const seen = new Set<string>();
  const out: CopilotNotification[] = [];
  for (const n of notifications) {
    const key = displayDedupKey(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
