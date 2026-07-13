/**
 * CLIENT-360 HEADER STATUS — estado ejecutivo del cliente para el header 360.
 *
 * Alinea el badge de estado con la guía operativa
 * (docs/product/copilot-operating-language.md §4). Función pura.
 *
 * Estados (subset permitido por la guía):
 *   - inactive → "Inactivo"           (cliente archivado)
 *   - at_risk  → "Riesgo alto"        (riesgo de cartera alto)
 *   - delayed  → "Con atraso"         (saldo atrasado > 0)
 *   - pending  → "Con saldo pendiente"(deuda abierta sin atraso)
 *   - current  → "Al día"             (sin saldo pendiente)
 *
 * No usa "vencido/vencida/deuda vencida".
 */

export type Client360HeaderStatus =
  | "inactive"
  | "at_risk"
  | "delayed"
  | "pending"
  | "current";

export const CLIENT_360_HEADER_STATUS_LABEL: Record<
  Client360HeaderStatus,
  string
> = {
  inactive: "Inactivo",
  at_risk: "Riesgo alto",
  delayed: "Con atraso",
  pending: "Con saldo pendiente",
  current: "Al día",
};

export type Client360HeaderStatusTone = "neutral" | "positive" | "warning" | "danger";

export const CLIENT_360_HEADER_STATUS_TONE: Record<
  Client360HeaderStatus,
  Client360HeaderStatusTone
> = {
  inactive: "neutral",
  at_risk: "danger",
  delayed: "danger",
  pending: "warning",
  current: "positive",
};

export type DeriveClient360HeaderStatusInput = {
  isActive: boolean;
  debtUyu: number;
  debtUsd: number;
  overdueUyu: number;
  overdueUsd: number;
  risk: "Bajo" | "Medio" | "Alto";
};

function safe(n: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function deriveClient360HeaderStatus(
  input: DeriveClient360HeaderStatusInput
): { status: Client360HeaderStatus; label: string; tone: Client360HeaderStatusTone } {
  const debt = safe(input.debtUyu) + safe(input.debtUsd);
  const overdue = safe(input.overdueUyu) + safe(input.overdueUsd);

  let status: Client360HeaderStatus;
  if (!input.isActive) {
    status = "inactive";
  } else if (input.risk === "Alto") {
    status = "at_risk";
  } else if (overdue > 0) {
    status = "delayed";
  } else if (debt > 0) {
    status = "pending";
  } else {
    status = "current";
  }

  return {
    status,
    label: CLIENT_360_HEADER_STATUS_LABEL[status],
    tone: CLIENT_360_HEADER_STATUS_TONE[status],
  };
}
