import type { IdentificationLevel } from "@/lib/bank/canonical/bank-payer-identification";

/**
 * FASE BANK-FULL-RECONCILIATION-UI-CORRECTION-001 — tipo y labels client-safe
 * (sin `server-only`), para que componentes de cliente puedan mapear el nivel
 * que ya llega serializado desde la API sin importar el módulo de servidor.
 */
export type MovementReconciliationLevel =
  | IdentificationLevel
  | "third_party"
  | "shared_account"
  | "requires_review";

export const MOVEMENT_LEVEL_LABEL: Record<MovementReconciliationLevel, string> = {
  unidentified: "Sin identificar",
  client_identified: "Cliente identificado",
  missing_receipt: "Falta recibo en Zeta",
  reconciled_with_receipt: "Conciliado con recibo",
  full_reconciliation: "Conciliación completa",
  third_party: "Pago de tercero",
  shared_account: "Cuenta compartida",
  requires_review: "Requiere revisión",
};
