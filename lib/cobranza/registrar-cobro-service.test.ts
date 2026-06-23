import { beforeEach, describe, expect, it, vi } from "vitest";

import { cobranzaRegistrarCobroBodySchema } from "@/lib/api/schemas/cobranza-registrar-cobro-body";
import {
  COBRANZA_REGISTRAR_COBRO_SOURCE,
  COLLECTION_PAYMENT_REGISTERED_KIND,
} from "@/lib/cobranza/registrar-cobro-constants";
import {
  buildCollectionActionNotes,
  buildRegistrarCobroWarnings,
  registrarCobro,
} from "@/lib/cobranza/registrar-cobro-service";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

const mocks = vi.hoisted(() => ({
  manualCashMovementCreate: vi.fn(),
  collectionCreateAction: vi.fn(),
  ensureTreasuryAccountForMovement: vi.fn(),
  todayYmdUtc: vi.fn(() => "2026-06-22"),
}));

vi.mock("@/lib/treasury/services/manual-cash-movement-service", () => ({
  manualCashMovementCreate: mocks.manualCashMovementCreate,
}));

vi.mock("@/lib/copilot-collection-service", () => ({
  collectionCreateAction: mocks.collectionCreateAction,
}));

vi.mock("@/lib/treasury/treasury-db-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/treasury/treasury-db-helpers")>();
  return {
    ...actual,
    ensureTreasuryAccountForMovement: mocks.ensureTreasuryAccountForMovement,
    todayYmdUtc: mocks.todayYmdUtc,
  };
});

const WORKSPACE_ID = "ws-11111111-1111-1111-1111-111111111111";
const COMPANY_ID = "8fd1272a-3829-4d50-8aa8-66aced1828a0";
const CLIENT_REQUEST_ID = "req-abc-123";
const MOVEMENT_ID = "mov-22222222-2222-2222-2222-222222222222";
const ACTION_ID = "act-33333333-3333-3333-3333-333333333333";

const validBody = {
  company_id: COMPANY_ID,
  payment_date: "2026-06-22",
  amount: 15000,
  currency_code: "UYU" as const,
  bank_origin: "Santander",
  reference: "TRF-12345",
  notes: "Pago confirmado",
  affects_cashflow: true,
  client_request_id: CLIENT_REQUEST_ID,
};

function movement(overrides: Partial<ManualCashMovement> = {}): ManualCashMovement {
  return {
    id: MOVEMENT_ID,
    workspaceId: WORKSPACE_ID,
    companyId: null,
    accountId: null,
    ledgerType: "cash",
    movementType: "income",
    source: "manual",
    concept: "Cobro — Cliente Demo",
    category: "cobranza",
    amount: 15000,
    currencyCode: "UYU",
    movementDate: "2026-06-22",
    paymentMethod: "Santander",
    counterparty: "Cliente Demo",
    reference: "TRF-12345",
    notes: "Pago confirmado",
    affectsCashflow: true,
    reconciled: false,
    bankReconciliationId: null,
    status: "active",
    createdBy: null,
    createdAt: "2026-06-22T10:00:00.000Z",
    updatedAt: "2026-06-22T10:00:00.000Z",
    rawPayload: null,
    metadata: {
      kind: COLLECTION_PAYMENT_REGISTERED_KIND,
      client_request_id: CLIENT_REQUEST_ID,
    },
    ...overrides,
  };
}

function action(overrides: Partial<CollectionAction> = {}): CollectionAction {
  return {
    id: ACTION_ID,
    workspaceCompanyId: WORKSPACE_ID,
    companyId: COMPANY_ID,
    status: "contacted",
    actionType: "internal_note",
    priority: "medium",
    assignedTo: null,
    createdBy: null,
    dueDate: null,
    contactDate: "2026-06-22T12:00:00.000Z",
    nextActionDate: null,
    promiseDate: null,
    promiseAmount: null,
    promiseCurrency: null,
    notes: buildCollectionActionNotes(validBody),
    metadata: {
      kind: COLLECTION_PAYMENT_REGISTERED_KIND,
      client_request_id: CLIENT_REQUEST_ID,
      manual_cash_movement_id: MOVEMENT_ID,
    },
    isActive: true,
    archivedAt: null,
    createdAt: "2026-06-22T10:00:00.000Z",
    updatedAt: "2026-06-22T10:00:00.000Z",
    ...overrides,
  };
}

type MockState = {
  protoCompany: { id: string; name: string } | null;
  existingMovement: Record<string, unknown> | null;
  existingAction: Record<string, unknown> | null;
  fromCalls: string[];
};

function createMockSupabase(state: MockState) {
  const manualCashChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: state.existingMovement,
      error: null,
    }),
  };

  const collectionChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: state.existingAction,
      error: null,
    }),
  };

  const protoCompanyChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: state.protoCompany,
      error: null,
    }),
  };

  return {
    from: vi.fn((table: string) => {
      state.fromCalls.push(table);
      if (table === "manual_cash_movements") return manualCashChain;
      if (table === "collection_actions") return collectionChain;
      if (table === "proto_companies") return protoCompanyChain;
      throw new Error(`Unexpected table: ${table}`);
    }),
    state,
  };
}

describe("cobranzaRegistrarCobroBodySchema", () => {
  it("valida payload mínimo correcto", () => {
    const result = cobranzaRegistrarCobroBodySchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("rechaza amount <= 0", () => {
    const result = cobranzaRegistrarCobroBodySchema.safeParse({
      ...validBody,
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza fecha futura", () => {
    const result = cobranzaRegistrarCobroBodySchema.safeParse({
      ...validBody,
      payment_date: "2099-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza moneda inválida", () => {
    const result = cobranzaRegistrarCobroBodySchema.safeParse({
      ...validBody,
      currency_code: "EUR",
    });
    expect(result.success).toBe(false);
  });
});

describe("buildRegistrarCobroWarnings", () => {
  it("emite warning transferencia sin referencia", () => {
    const warnings = buildRegistrarCobroWarnings({
      bank_origin: "Santander",
      reference: undefined,
    });
    expect(warnings).toEqual([
      {
        code: "missing_reference",
        message: "Transferencia sin referencia bancaria.",
      },
    ]);
  });
});

describe("registrarCobro service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.todayYmdUtc.mockReturnValue("2026-06-22");
    mocks.ensureTreasuryAccountForMovement.mockResolvedValue({
      ok: true,
      data: null,
      message: "OK",
    });
    mocks.manualCashMovementCreate.mockResolvedValue({
      ok: true,
      data: movement(),
      message: "Movimiento manual creado.",
    });
    mocks.collectionCreateAction.mockResolvedValue({
      ok: true,
      data: action(),
      message: "Acción de cobranza registrada.",
    });
  });

  it("rechaza company_id inexistente", async () => {
    const supabase = createMockSupabase({
      protoCompany: null,
      existingMovement: null,
      existingAction: null,
      fromCalls: [],
    });

    const result = await registrarCobro(supabase as never, WORKSPACE_ID, validBody);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
    expect(mocks.manualCashMovementCreate).not.toHaveBeenCalled();
    expect(mocks.collectionCreateAction).not.toHaveBeenCalled();
  });

  it("crea manual_cash_movement income y collection_action internal_note/contacted", async () => {
    const supabase = createMockSupabase({
      protoCompany: { id: COMPANY_ID, name: "Cliente Demo" },
      existingMovement: null,
      existingAction: null,
      fromCalls: [],
    });

    const result = await registrarCobro(supabase as never, WORKSPACE_ID, validBody);

    expect(result.ok).toBe(true);
    expect(mocks.manualCashMovementCreate).toHaveBeenCalledTimes(1);
    expect(mocks.manualCashMovementCreate).toHaveBeenCalledWith(
      supabase,
      WORKSPACE_ID,
      expect.objectContaining({
        movement_type: "income",
        source: "manual",
        concept: "Cobro — Cliente Demo",
        category: "cobranza",
        counterparty: "Cliente Demo",
      })
    );

    expect(mocks.collectionCreateAction).toHaveBeenCalledTimes(1);
    expect(mocks.collectionCreateAction).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        companyId: COMPANY_ID,
        actionType: "internal_note",
        status: "contacted",
      }),
      WORKSPACE_ID
    );

    const createInput = mocks.collectionCreateAction.mock.calls[0]?.[1];
    expect(createInput.status).not.toBe("paid");
    expect(createInput.actionType).not.toBe("payment_received");
  });

  it("metadata vincula manual_cash_movement_id y client_request_id", async () => {
    const supabase = createMockSupabase({
      protoCompany: { id: COMPANY_ID, name: "Cliente Demo" },
      existingMovement: null,
      existingAction: null,
      fromCalls: [],
    });

    await registrarCobro(supabase as never, WORKSPACE_ID, validBody);

    const movementPayload = mocks.manualCashMovementCreate.mock.calls[0]?.[2];
    expect(movementPayload.metadata).toMatchObject({
      kind: COLLECTION_PAYMENT_REGISTERED_KIND,
      source: COBRANZA_REGISTRAR_COBRO_SOURCE,
      client_request_id: CLIENT_REQUEST_ID,
      proto_company_id: COMPANY_ID,
    });

    const actionInput = mocks.collectionCreateAction.mock.calls[0]?.[1];
    expect(actionInput.metadata).toMatchObject({
      kind: COLLECTION_PAYMENT_REGISTERED_KIND,
      source: COBRANZA_REGISTRAR_COBRO_SOURCE,
      client_request_id: CLIENT_REQUEST_ID,
      manual_cash_movement_id: MOVEMENT_ID,
      amount: 15000,
      currency_code: "UYU",
      payment_date: "2026-06-22",
    });
  });

  it("idempotency evita duplicados", async () => {
    const supabase = createMockSupabase({
      protoCompany: { id: COMPANY_ID, name: "Cliente Demo" },
      existingMovement: {
        id: MOVEMENT_ID,
        workspace_id: WORKSPACE_ID,
        movement_type: "income",
        ledger_type: "cash",
        source: "manual",
        concept: "Cobro — Cliente Demo",
        amount: 15000,
        currency_code: "UYU",
        movement_date: "2026-06-22",
        affects_cashflow: true,
        reconciled: false,
        status: "active",
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z",
        metadata: { client_request_id: CLIENT_REQUEST_ID },
      },
      existingAction: {
        id: ACTION_ID,
        workspace_company_id: WORKSPACE_ID,
        company_id: COMPANY_ID,
        status: "contacted",
        action_type: "internal_note",
        priority: "medium",
        is_active: true,
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z",
        metadata: { client_request_id: CLIENT_REQUEST_ID },
      },
      fromCalls: [],
    });

    const result = await registrarCobro(supabase as never, WORKSPACE_ID, validBody);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.idempotent).toBe(true);
    expect(mocks.manualCashMovementCreate).not.toHaveBeenCalled();
    expect(mocks.collectionCreateAction).not.toHaveBeenCalled();
  });

  it("incluye warning transferencia sin referencia en respuesta exitosa", async () => {
    const supabase = createMockSupabase({
      protoCompany: { id: COMPANY_ID, name: "Cliente Demo" },
      existingMovement: null,
      existingAction: null,
      fromCalls: [],
    });

    const result = await registrarCobro(supabase as never, WORKSPACE_ID, {
      ...validBody,
      reference: undefined,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([
      {
        code: "missing_reference",
        message: "Transferencia sin referencia bancaria.",
      },
    ]);
  });

  it("no usa status paid", async () => {
    const supabase = createMockSupabase({
      protoCompany: { id: COMPANY_ID, name: "Cliente Demo" },
      existingMovement: null,
      existingAction: null,
      fromCalls: [],
    });

    await registrarCobro(supabase as never, WORKSPACE_ID, validBody);

    const actionInput = mocks.collectionCreateAction.mock.calls[0]?.[1];
    expect(actionInput.status).toBe("contacted");
    expect(actionInput.status).not.toBe("paid");
  });

  it("no toca proto_invoices ni proto_receipts", async () => {
    const supabase = createMockSupabase({
      protoCompany: { id: COMPANY_ID, name: "Cliente Demo" },
      existingMovement: null,
      existingAction: null,
      fromCalls: [],
    });

    await registrarCobro(supabase as never, WORKSPACE_ID, validBody);

    expect(supabase.state.fromCalls).not.toContain("proto_invoices");
    expect(supabase.state.fromCalls).not.toContain("proto_receipts");
    expect(supabase.state.fromCalls).toEqual(
      expect.arrayContaining(["manual_cash_movements", "collection_actions", "proto_companies"])
    );
  });

  it("devuelve partial cuando falla collection_action después del movement", async () => {
    const supabase = createMockSupabase({
      protoCompany: { id: COMPANY_ID, name: "Cliente Demo" },
      existingMovement: null,
      existingAction: null,
      fromCalls: [],
    });

    mocks.collectionCreateAction.mockResolvedValue({
      ok: false,
      code: "DATABASE",
      message: "Error de base de datos.",
    });

    const result = await registrarCobro(supabase as never, WORKSPACE_ID, validBody);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.partial).toBe(true);
    expect(result.code).toBe("PARTIAL");
    expect(result.movement_id).toBe(MOVEMENT_ID);
    expect(mocks.manualCashMovementCreate).toHaveBeenCalledTimes(1);
  });

  it("reintenta evidencia si el movement ya existe por partial previo", async () => {
    const supabase = createMockSupabase({
      protoCompany: { id: COMPANY_ID, name: "Cliente Demo" },
      existingMovement: {
        id: MOVEMENT_ID,
        workspace_id: WORKSPACE_ID,
        movement_type: "income",
        ledger_type: "cash",
        source: "manual",
        concept: "Cobro — Cliente Demo",
        amount: 15000,
        currency_code: "UYU",
        movement_date: "2026-06-22",
        affects_cashflow: true,
        reconciled: false,
        status: "active",
        created_at: "2026-06-22T10:00:00.000Z",
        updated_at: "2026-06-22T10:00:00.000Z",
        metadata: { client_request_id: CLIENT_REQUEST_ID },
      },
      existingAction: null,
      fromCalls: [],
    });

    const result = await registrarCobro(supabase as never, WORKSPACE_ID, validBody);

    expect(result.ok).toBe(true);
    expect(mocks.manualCashMovementCreate).not.toHaveBeenCalled();
    expect(mocks.collectionCreateAction).toHaveBeenCalledTimes(1);
  });
});
