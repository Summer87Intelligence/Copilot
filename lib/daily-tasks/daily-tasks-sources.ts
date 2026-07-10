/**
 * Adaptadores puros: convierten las respuestas de los módulos existentes
 * (banco/conciliación, tesorería, cartera/clientes, alertas) en las entradas
 * normalizadas del generador del cuaderno. Sin fetch, sin estado — testeable.
 */
import type {
  AutoBankInput,
  AutoClient,
  AutoCurrencyAmount,
  AutoTreasuryPayment,
} from "@/lib/daily-tasks/daily-tasks-workbook";

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function ymd(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

export function addDaysYmd(base: string, days: number): string {
  const date = new Date(`${base.slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// ─── Banco / conciliación ─────────────────────────────────────────────────────

export type ReconMetaLike = {
  pending_count?: number;
  with_high_confidence?: number;
  with_medium_confidence?: number;
  without_suggestions?: number;
};

export function bankInputFromReconMeta(meta: ReconMetaLike | null | undefined): AutoBankInput {
  const pending = num(meta?.pending_count);
  const without = num(meta?.without_suggestions);
  const high = num(meta?.with_high_confidence);
  const medium = num(meta?.with_medium_confidence);
  const withSuggestion = Math.max(0, pending - without);
  const low = Math.max(0, withSuggestion - high - medium);
  return { withSuggestion, high, medium, low, pending };
}

// ─── Tesorería ────────────────────────────────────────────────────────────────

export type TreasuryPaymentLike = {
  name?: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  status?: string;
};

function isOpenPayment(status: unknown): boolean {
  return status !== "paid" && status !== "cancelled";
}

function toAutoPayment(p: TreasuryPaymentLike): AutoTreasuryPayment {
  return {
    name: (p.name ?? "").trim() || "Pago",
    amount: num(p.amount),
    currency: p.currency === "USD" ? "USD" : "UYU",
    dueDate: ymd(p.dueDate),
  };
}

export function splitTreasuryPayments(
  items: TreasuryPaymentLike[] | null | undefined,
  today: string,
  upcomingDays = 3
): { due: AutoTreasuryPayment[]; upcoming: AutoTreasuryPayment[] } {
  const list = items ?? [];
  const horizon = addDaysYmd(today, upcomingDays);
  const due: AutoTreasuryPayment[] = [];
  const upcoming: AutoTreasuryPayment[] = [];
  for (const raw of list) {
    if (!isOpenPayment(raw.status)) continue;
    const d = ymd(raw.dueDate);
    if (!d) continue;
    if (d === today) due.push(toAutoPayment(raw));
    else if (d > today && d <= horizon) upcoming.push(toAutoPayment(raw));
  }
  return { due, upcoming };
}

// ─── Cartera / clientes ───────────────────────────────────────────────────────

export type PortfolioRowLike = {
  name?: string;
  risk?: string;
  overdue_uyu?: number;
  overdue_usd?: number;
  overdue_debt?: number;
};

function rowOverdue(row: PortfolioRowLike): number {
  const uyu = num(row.overdue_uyu);
  const usd = num(row.overdue_usd);
  if (uyu > 0 || usd > 0) return uyu + usd;
  return num(row.overdue_debt);
}

export function portfolioInputs(rows: PortfolioRowLike[] | null | undefined): {
  overdueClients: AutoClient[];
  overdueByCurrency: AutoCurrencyAmount[];
  criticalClients: AutoClient[];
} {
  const list = rows ?? [];
  let uyu = 0;
  let usd = 0;
  const overdueClients: AutoClient[] = [];
  const criticalClients: AutoClient[] = [];

  for (const row of list) {
    const name = (row.name ?? "").trim();
    const overdue = rowOverdue(row);
    if (overdue > 0) {
      overdueClients.push({ name: name || "Cliente", overdue });
      uyu += num(row.overdue_uyu);
      usd += num(row.overdue_usd);
    }
    if (row.risk === "Alto") criticalClients.push({ name: name || "Cliente" });
  }

  overdueClients.sort((a, b) => (b.overdue ?? 0) - (a.overdue ?? 0));

  const overdueByCurrency: AutoCurrencyAmount[] = [];
  if (uyu > 0) overdueByCurrency.push({ currency: "UYU", amount: uyu });
  if (usd > 0) overdueByCurrency.push({ currency: "USD", amount: usd });

  return { overdueClients, overdueByCurrency, criticalClients };
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

export type NotificationLike = {
  severity?: string;
  read_at?: string | null;
};

export function alertsInput(
  notifications: NotificationLike[] | null | undefined
): { active: number; critical: number } {
  const list = notifications ?? [];
  let active = 0;
  let critical = 0;
  for (const n of list) {
    if (n.read_at) continue; // solo no leídas
    if (n.severity === "critical") {
      critical += 1;
      active += 1;
    } else if (n.severity === "warning") {
      active += 1;
    }
  }
  return { active, critical };
}
