import type { ProtoTaxObligation } from "@/lib/copilot-tax-data";

/** Un solo estado principal por obligación (jerarquía fija). */
export type PrimaryObligationState =
  | "overdue"
  | "critical"
  | "due_soon"
  | "scheduled"
  | "covered"
  | "normal";

const DUE_SOON_DAYS = 14;

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(ymd + "T12:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Prioridad de lectura ejecutiva: vencido > crítico > vence pronto > programado > cubierto > normal.
 */
export function getPrimaryObligationState(
  obligation: ProtoTaxObligation,
  todayYmd: string
): PrimaryObligationState {
  const st = String(obligation.status ?? "").toLowerCase();
  const due = obligation.due_date.slice(0, 10);
  const pri = String(obligation.priority ?? "").toLowerCase();

  if (st === "paid") return "covered";

  const isOverdue = st === "overdue" || due < todayYmd;
  if (isOverdue) return "overdue";

  const isCritical = pri === "critical" || pri === "high";
  if (isCritical) return "critical";

  const dueSoonUntil = addDaysYmd(todayYmd, DUE_SOON_DAYS);
  if (due >= todayYmd && due <= dueSoonUntil) return "due_soon";

  if (st === "scheduled") return "scheduled";

  if (st === "partial") return "covered";

  return "normal";
}

export const PRIMARY_OBLIGATION_LABEL: Record<PrimaryObligationState, string> = {
  overdue: "Vencido",
  critical: "Crítico",
  due_soon: "Vence pronto",
  scheduled: "Programado",
  covered: "Cubierto",
  normal: "Normal",
};

/** Orden para listados: más urgente primero. */
export function primaryObligationSortRank(state: PrimaryObligationState): number {
  const order: Record<PrimaryObligationState, number> = {
    overdue: 0,
    critical: 1,
    due_soon: 2,
    scheduled: 3,
    covered: 4,
    normal: 5,
  };
  return order[state];
}

export function sortObligationsForCashImpact(
  list: ProtoTaxObligation[],
  todayYmd: string
): ProtoTaxObligation[] {
  return [...list].sort((a, b) => {
    const sa = getPrimaryObligationState(a, todayYmd);
    const sb = getPrimaryObligationState(b, todayYmd);
    const ra = primaryObligationSortRank(sa);
    const rb = primaryObligationSortRank(sb);
    if (ra !== rb) return ra - rb;
    const da = a.due_date.slice(0, 10);
    const db = b.due_date.slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    const pa =
      a.confirmed_amount != null && a.confirmed_amount > 0
        ? a.confirmed_amount
        : a.estimated_amount;
    const pb =
      b.confirmed_amount != null && b.confirmed_amount > 0
        ? b.confirmed_amount
        : b.estimated_amount;
    return pb - pa;
  });
}

/** Texto secundario (no badge): aclara sin competir con el estado principal. */
export function getObligationSecondaryHint(
  obligation: ProtoTaxObligation,
  primary: PrimaryObligationState
): string | null {
  const st = String(obligation.status ?? "").toLowerCase();
  if (st === "partial" && primary !== "covered") {
    return "Pago parcial registrado";
  }
  if (
    primary === "due_soon" ||
    primary === "scheduled" ||
    primary === "normal"
  ) {
    if (String(obligation.priority ?? "").toLowerCase() === "medium") {
      return "Prioridad media en calendario";
    }
  }
  if (primary === "critical" && st !== "overdue") {
    return "Requiere decisión antes de otros egresos";
  }
  return null;
}
