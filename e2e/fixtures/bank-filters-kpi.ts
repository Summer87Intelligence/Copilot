/**
 * Fixtures E2E — FASE BANK-FILTERS-KPI-AND-HISTORY-USABILITY-001
 * Julio/junio, entradas/salidas, asociados, pendientes, no comerciales, duplicados, UYU/USD.
 * Estado mutable en memoria para probar actualización de KPI tras asociar (sin prod).
 */

export const WS = "040321ff-10fd-4da3-aeca-f1865f879986";
export const CLIENT_SUPRASUR_ID = "55555555-5555-4555-8555-555555555555";
export const CLIENT_SUPRASUR_NAME = "Suprasur S.A.";

export const ID_PENDING_JUL = "a1111111-1111-4111-8111-111111111111";
export const ID_ASSOC_JUL = "a2222222-2222-4222-8222-222222222222";
export const ID_OUTFLOW_JUL = "a3333333-3333-4333-8333-333333333333";
export const ID_USD_JUL = "a4444444-4444-4444-8444-444444444444";
export const ID_JUN_PENDING = "a5555555-5555-4555-8555-555555555555";
export const ID_NON_COMM = "a6666666-6666-4666-8666-666666666666";
export const ID_DUP = "a7777777-7777-4777-8777-777777777777";
export const ID_HIDDEN = "a8888888-8888-4888-8888-888888888888";
export const ID_REVIEW_PENDING = "a9999999-9999-4999-8999-999999999999";

type Mov = Record<string, unknown>;

function base(overrides: Mov): Mov {
  return {
    workspace_id: WS,
    import_id: null,
    bank_name: "Santander",
    account_label: "Santander UYU",
    movement_date: "2026-07-15",
    description: "TRANSFERENCIA RECIBIDA",
    raw_description: "TRANSFERENCIA RECIBIDA",
    amount: 1000,
    currency: "UYU",
    direction: "inflow",
    bank_reference: "REF-BASE",
    status: "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata: {},
    created_at: "2026-07-15T12:00:00Z",
    updated_at: "2026-07-15T12:00:00Z",
    ...overrides,
  };
}

/** Estado mutable del mock (reset por test). */
export type FiltersKpiFixtureState = {
  levels: Record<string, string>;
  clients: Record<string, { clientCompanyId: string; clientName: string | null }>;
  statuses: Record<string, string>;
};

export function createFiltersKpiFixtureState(): FiltersKpiFixtureState {
  return {
    levels: {
      [ID_PENDING_JUL]: "unidentified",
      [ID_ASSOC_JUL]: "client_identified",
      [ID_OUTFLOW_JUL]: "unidentified",
      [ID_USD_JUL]: "unidentified",
      [ID_JUN_PENDING]: "unidentified",
      [ID_NON_COMM]: "unidentified",
      [ID_DUP]: "unidentified",
      [ID_HIDDEN]: "unidentified",
      [ID_REVIEW_PENDING]: "unidentified",
    },
    clients: {
      [ID_ASSOC_JUL]: {
        clientCompanyId: CLIENT_SUPRASUR_ID,
        clientName: CLIENT_SUPRASUR_NAME,
      },
    },
    statuses: {
      [ID_PENDING_JUL]: "pending",
      [ID_ASSOC_JUL]: "matched",
      [ID_OUTFLOW_JUL]: "pending",
      [ID_USD_JUL]: "pending",
      [ID_JUN_PENDING]: "pending",
      [ID_NON_COMM]: "ignored",
      [ID_DUP]: "pending",
      [ID_HIDDEN]: "pending",
      [ID_REVIEW_PENDING]: "needs_review",
    },
  };
}

export function buildFiltersKpiMovements(state: FiltersKpiFixtureState): Mov[] {
  const rows: Mov[] = [
    base({
      id: ID_PENDING_JUL,
      movement_date: "2026-07-10",
      description: "TRANSFERENCIA RECIBIDA ALKITODO SRL PENDIENTE",
      raw_description: "TRANSFERENCIA RECIBIDA ALKITODO SRL PENDIENTE",
      bank_reference: "REF-PEND-JUL",
      amount: 12500.5,
      status: state.statuses[ID_PENDING_JUL],
      metadata: { payer_name_raw: "ALKITODO SRL" },
    }),
    base({
      id: ID_ASSOC_JUL,
      movement_date: "2026-07-14",
      description:
        "CRÉDITO OPERACIÓN EN BANCA DIGITAL 198677 TSUPRASUR S.A./SUPRASUR S.A.",
      raw_description:
        "CRÉDITO OPERACIÓN EN BANCA DIGITAL 198677 TSUPRASUR S.A./SUPRASUR S.A.",
      bank_reference: "198677",
      amount: 610,
      currency: "USD",
      status: state.statuses[ID_ASSOC_JUL],
      metadata: { payer_name_raw: "SUPRASUR S.A." },
    }),
    base({
      id: ID_OUTFLOW_JUL,
      movement_date: "2026-07-12",
      description: "DEBITO TRANSFERENCIA SALIDA JULIO",
      direction: "outflow",
      amount: 800,
      bank_reference: "REF-OUT-JUL",
      status: state.statuses[ID_OUTFLOW_JUL],
    }),
    base({
      id: ID_USD_JUL,
      movement_date: "2026-07-20",
      description: "INGRESO USD SIN CLIENTE JULIO",
      amount: 200,
      currency: "USD",
      bank_reference: "REF-USD-JUL",
      status: state.statuses[ID_USD_JUL],
    }),
    base({
      id: ID_JUN_PENDING,
      movement_date: "2026-06-15",
      description: "TRANSFERENCIA JUNIO PENDIENTE",
      amount: 500,
      bank_reference: "REF-JUN",
      status: state.statuses[ID_JUN_PENDING],
    }),
    base({
      id: ID_NON_COMM,
      movement_date: "2026-07-08",
      description: "INGRESO NO COMERCIAL JULIO",
      amount: 50,
      bank_reference: "REF-NONCOMM",
      status: state.statuses[ID_NON_COMM],
    }),
    base({
      id: ID_DUP,
      movement_date: "2026-07-10",
      description: "TRANSFERENCIA RECIBIDA ALKITODO SRL PENDIENTE DUP",
      amount: 12500.5,
      bank_reference: "REF-PEND-JUL",
      status: state.statuses[ID_DUP],
    }),
    base({
      id: ID_HIDDEN,
      movement_date: "2026-07-11",
      description: "MOVIMIENTO OCULTO JULIO",
      amount: 10,
      bank_reference: "REF-HID",
      status: state.statuses[ID_HIDDEN],
      metadata: { ui_hidden: true },
    }),
    base({
      id: ID_REVIEW_PENDING,
      movement_date: "2026-07-18",
      description: "PENDIENTE REVISADO MANUAL",
      amount: 75,
      bank_reference: "REF-REVIEW",
      status: state.statuses[ID_REVIEW_PENDING],
    }),
  ];
  return rows;
}

export function filtersKpiListPayload(state: FiltersKpiFixtureState) {
  return {
    ok: true,
    data: buildFiltersKpiMovements(state),
    levels: { ...state.levels },
    duplicates: {
      [ID_DUP]: { canonicalMovementId: ID_PENDING_JUL },
    },
    clients: { ...state.clients },
  };
}

export function filtersKpiAssociationPayload(movementId: string, state: FiltersKpiFixtureState) {
  const movement = buildFiltersKpiMovements(state).find((m) => m.id === movementId);
  const client = state.clients[movementId];
  const identification = client
    ? {
        id: "44444444-4444-4444-8444-444444444444",
        clientCompanyId: client.clientCompanyId,
        clientName: client.clientName,
        status: "identified",
        confirmedAt: "2026-07-15T12:00:00Z",
        source: "identification" as const,
      }
    : null;
  return { ok: true, data: { movement, identification } };
}

export function filtersKpiHistoryIdentifications() {
  return {
    ok: true,
    data: [
      {
        id: "hist-1",
        eventLabel: "Cliente identificado",
        status: "identified",
        clientName: CLIENT_SUPRASUR_NAME,
        date: "2026-07-14",
        amountLabel: "USD 610",
        referenceMasked: "198677",
        actor: "daniel@example.com",
        reason: null,
        eventAt: "2026-07-15T12:00:00Z",
      },
      {
        id: "hist-2",
        eventLabel: "Cliente identificado",
        status: "identified",
        clientName: "Otro Cliente SA",
        date: "2026-06-10",
        amountLabel: "UYU 100",
        referenceMasked: "JUN-1",
        actor: "qa@example.com",
        reason: null,
        eventAt: "2026-06-11T12:00:00Z",
      },
    ],
  };
}

/**
 * Julio 2026 KPI esperados (operativos, visibles, no dup):
 * - pendingIdentification: ID_PENDING_JUL, ID_USD_JUL (=2) — needs_review is reviewed, not pending
 * - inflow: pending, assoc, usd, noncomm, review (=5) — outflow separate; hidden/dup excluded
 * - outflow: 1
 * - reviewed: assoc (matched+level), noncomm (ignored), review (needs_review) (=3)
 */
export const JULY_KPI = {
  pending: 2,
  inflow: 5,
  outflow: 1,
  reviewed: 3,
} as const;
