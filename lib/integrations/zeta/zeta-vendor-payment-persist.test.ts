import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProtoPaymentInput } from "@/lib/copilot-proto-crud-types";
import {
  findActiveZetaVendorPaymentIdByNumber,
  persistZetaVendorPaymentRow,
} from "@/lib/integrations/zeta/zeta-vendor-payment-persist";

const protoCreatePayment = vi.fn();
const protoUpdatePayment = vi.fn();

vi.mock("@/lib/copilot-proto-crud-service", () => ({
  protoCreatePayment: (...args: unknown[]) => protoCreatePayment(...args),
  protoUpdatePayment: (...args: unknown[]) => protoUpdatePayment(...args),
}));

const widA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const widB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const zetaInput: ProtoPaymentInput = {
  company_id: null,
  payment_number: "ZETA:PAG:9101",
  payment_date: "2026-01-15",
  amount: 100,
  category: "Pago a proveedor",
  vendor_name: "Proveedor",
  status: "paid",
  reference: "A-1",
  notes: null,
  obligation_id: null,
  currency_code: "UYU",
  source: "zeta",
  zeta_metadata: { zeta_registro_id: "9101" },
};

const manualInput: ProtoPaymentInput = {
  ...zetaInput,
  payment_number: "OP-2026-0101",
  source: "manual",
};

function createSupabaseLookupStub(
  maybeSingleResults: Array<{ data: { id: string } | null; error: null }>
) {
  let call = 0;
  const maybeSingle = vi.fn().mockImplementation(async () => {
    const row = maybeSingleResults[call] ?? maybeSingleResults.at(-1)!;
    call += 1;
    return row;
  });
  const eqIsActive = vi.fn().mockReturnValue({ maybeSingle });
  const eqPayment = vi.fn().mockReturnValue({ eq: eqIsActive });
  const eqWorkspace = vi.fn().mockReturnValue({ eq: eqPayment });
  const select = vi.fn().mockReturnValue({ eq: eqWorkspace });
  const from = vi.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as Parameters<typeof persistZetaVendorPaymentRow>[0],
    maybeSingle,
    eqWorkspace,
    eqPayment,
    eqIsActive,
  };
}

describe("persistZetaVendorPaymentRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("actualiza cuando ya existe pago activo con el mismo payment_number", async () => {
    const { client } = createSupabaseLookupStub([{ data: { id: "pay-existing" }, error: null }]);
    protoUpdatePayment.mockResolvedValue({ ok: true, data: {}, message: "ok" });

    const result = await persistZetaVendorPaymentRow(client, widA, zetaInput);

    expect(result).toEqual({ ok: true, action: "updated" });
    expect(protoCreatePayment).not.toHaveBeenCalled();
    expect(protoUpdatePayment).toHaveBeenCalledOnce();
  });

  it("inserta cuando no existe fila previa", async () => {
    const { client } = createSupabaseLookupStub([{ data: null, error: null }]);
    protoCreatePayment.mockResolvedValue({ ok: true, data: { id: "new" }, message: "ok" });

    const result = await persistZetaVendorPaymentRow(client, widA, zetaInput);

    expect(result).toEqual({ ok: true, action: "inserted" });
    expect(protoCreatePayment).toHaveBeenCalledOnce();
    expect(protoUpdatePayment).not.toHaveBeenCalled();
  });

  it("recupera carrera: create falla, re-lookup encuentra fila, update exitoso", async () => {
    const { client, maybeSingle } = createSupabaseLookupStub([
      { data: null, error: null },
      { data: { id: "pay-raced" }, error: null },
    ]);
    protoCreatePayment.mockResolvedValue({
      ok: false,
      code: "DATABASE",
      message: "db",
    });
    protoUpdatePayment.mockResolvedValue({ ok: true, data: {}, message: "ok" });

    const result = await persistZetaVendorPaymentRow(client, widA, zetaInput);

    expect(result).toEqual({ ok: true, action: "updated_after_unique_race" });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(protoUpdatePayment).toHaveBeenCalledOnce();
  });

  it("falla si create falla y no aparece fila concurrente", async () => {
    const { client } = createSupabaseLookupStub([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    protoCreatePayment.mockResolvedValue({
      ok: false,
      code: "DATABASE",
      message: "db",
    });

    const result = await persistZetaVendorPaymentRow(client, widA, zetaInput);

    expect(result).toEqual({ ok: false, reason: "create_failed" });
  });

  it("permite mismo payment_number en otro workspace (aislamiento tenant)", async () => {
    const stubA = createSupabaseLookupStub([{ data: { id: "only-a" }, error: null }]);
    const stubB = createSupabaseLookupStub([{ data: null, error: null }]);
    protoUpdatePayment.mockResolvedValue({ ok: true, data: {}, message: "ok" });
    protoCreatePayment.mockResolvedValue({ ok: true, data: { id: "b-new" }, message: "ok" });

    const rA = await persistZetaVendorPaymentRow(stubA.client, widA, zetaInput);
    const rB = await persistZetaVendorPaymentRow(stubB.client, widB, zetaInput);

    expect(rA).toEqual({ ok: true, action: "updated" });
    expect(rB).toEqual({ ok: true, action: "inserted" });
    expect(stubB.eqWorkspace).toHaveBeenCalledWith("workspace_company_id", widB);
  });

  it("pago manual OP-* no usa prefijo ZETA:PAG (contrato mapper; DB partial index no aplica)", () => {
    expect(manualInput.payment_number.startsWith("ZETA:PAG:")).toBe(false);
    expect(zetaInput.payment_number.startsWith("ZETA:PAG:")).toBe(true);
  });
});

describe("findActiveZetaVendorPaymentIdByNumber", () => {
  it("filtra por workspace y payment_number en query activa", async () => {
    const { client, eqWorkspace, eqPayment, eqIsActive } = createSupabaseLookupStub([
      { data: { id: "pay-1" }, error: null },
    ]);

    const id = await findActiveZetaVendorPaymentIdByNumber(
      client,
      widA,
      "ZETA:PAG:99"
    );

    expect(id).toBe("pay-1");
    expect(eqWorkspace).toHaveBeenCalledWith("workspace_company_id", widA);
    expect(eqPayment).toHaveBeenCalledWith("payment_number", "ZETA:PAG:99");
    expect(eqIsActive).toHaveBeenCalledWith("is_active", true);
  });
});
