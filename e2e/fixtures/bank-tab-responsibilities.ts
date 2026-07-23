/**
 * Fixtures estables para E2E de Banco — sin depender de datos productivos.
 */
export const FIXTURE_UNASSIGNED_ID = "11111111-1111-4111-8111-111111111111";
export const FIXTURE_ASSOCIATED_ID = "22222222-2222-4222-8222-222222222222";
export const FIXTURE_CLIENT_ID = "33333333-3333-4333-8333-333333333333";
export const FIXTURE_CLIENT_NAME = "Alkitodo SRL Fixture";
export const FIXTURE_FULL_DESCRIPTION =
  "TRANSFERENCIA RECIBIDA 4453956LR-2607150 50885600 ALKITODO SRL LINEA-EXTRA-PARA-DETALLE-COMPLETO";

function baseMovement(overrides: Record<string, unknown>) {
  return {
    workspace_id: "040321ff-10fd-4da3-aeca-f1865f879986",
    import_id: null,
    bank_name: "Santander",
    account_label: "Santander UYU",
    movement_date: "2026-07-15",
    description: FIXTURE_FULL_DESCRIPTION,
    raw_description: FIXTURE_FULL_DESCRIPTION,
    amount: 12500.5,
    currency: "UYU",
    direction: "inflow",
    bank_reference: "4453956LR-2607150",
    status: "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata: { payer_name_raw: "ALKITODO SRL" },
    created_at: "2026-07-15T12:00:00Z",
    updated_at: "2026-07-15T12:00:00Z",
    ...overrides,
  };
}

export const FIXTURE_UNASSIGNED = baseMovement({
  id: FIXTURE_UNASSIGNED_ID,
  status: "pending",
});

export const FIXTURE_ASSOCIATED = baseMovement({
  id: FIXTURE_ASSOCIATED_ID,
  status: "matched",
  description: `${FIXTURE_FULL_DESCRIPTION} ASOCIADO`,
  raw_description: `${FIXTURE_FULL_DESCRIPTION} ASOCIADO`,
});

export function bankMovementsListPayload() {
  return {
    ok: true,
    data: [FIXTURE_UNASSIGNED, FIXTURE_ASSOCIATED],
    levels: {
      [FIXTURE_UNASSIGNED_ID]: "unidentified",
      [FIXTURE_ASSOCIATED_ID]: "client_identified",
    },
    duplicates: {},
    clients: {
      [FIXTURE_ASSOCIATED_ID]: {
        clientCompanyId: FIXTURE_CLIENT_ID,
        clientName: FIXTURE_CLIENT_NAME,
      },
    },
  };
}

export function associationPayload(movementId: string) {
  const movement =
    movementId === FIXTURE_ASSOCIATED_ID ? FIXTURE_ASSOCIATED : FIXTURE_UNASSIGNED;
  const identification =
    movementId === FIXTURE_ASSOCIATED_ID
      ? {
          id: "44444444-4444-4444-8444-444444444444",
          clientCompanyId: FIXTURE_CLIENT_ID,
          clientName: FIXTURE_CLIENT_NAME,
          status: "identified",
          confirmedAt: "2026-07-15T12:00:00Z",
          source: "identification" as const,
        }
      : null;
  return { ok: true, data: { movement, identification } };
}
