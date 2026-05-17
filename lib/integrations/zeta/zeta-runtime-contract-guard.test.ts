/**
 * ZETA-16: Tests for zeta-runtime-contract-guard.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runContractGuard } from "@/lib/integrations/zeta/zeta-runtime-contract-guard";

const TestSchema = z.object({
  RegistroId: z.string(),
  Monto: z.number(),
  Moneda: z.string().optional(),
});

const ENDPOINT = "RESTTestV1";
const WORKSPACE = "ws-test";

describe("runContractGuard — valid rows", () => {
  it("passes all valid rows through", () => {
    const rows = [
      { RegistroId: "R1", Monto: 100, Moneda: "USD" },
      { RegistroId: "R2", Monto: 200 },
    ];
    const result = runContractGuard(rows, TestSchema, ENDPOINT, WORKSPACE);
    expect(result.valid).toHaveLength(2);
    expect(result.quarantined).toHaveLength(0);
    expect(result.unknown_fields).toHaveLength(0);
  });
});

describe("runContractGuard — invalid rows are quarantined", () => {
  it("quarantines rows missing required fields", () => {
    const rows = [
      { RegistroId: "R1", Monto: 100 },
      { Monto: 200 }, // missing RegistroId
      { RegistroId: "R3" }, // missing Monto
    ];
    const result = runContractGuard(rows, TestSchema, ENDPOINT, WORKSPACE);
    expect(result.valid).toHaveLength(1);
    expect(result.quarantined).toHaveLength(2);
    expect(result.snapshot?.is_valid).toBe(false);
  });

  it("does not throw on empty batch", () => {
    const result = runContractGuard([], TestSchema, ENDPOINT, WORKSPACE);
    expect(result.valid).toHaveLength(0);
    expect(result.quarantined).toHaveLength(0);
    expect(result.snapshot).toBeNull();
  });
});

describe("runContractGuard — unknown field detection", () => {
  it("detects new fields not in schema", () => {
    const rows = [
      { RegistroId: "R1", Monto: 100, NuevoCampoZeta: "novedad" },
    ];
    const result = runContractGuard(rows, TestSchema, ENDPOINT, WORKSPACE);
    expect(result.unknown_fields).toContain("NuevoCampoZeta");
    expect(result.valid).toHaveLength(1); // still valid (zod strips unknown by default)
  });

  it("includes unknown fields in snapshot", () => {
    const rows = [
      { RegistroId: "R1", Monto: 100, ExtraField: "x" },
    ];
    const result = runContractGuard(rows, TestSchema, ENDPOINT, WORKSPACE);
    expect(result.snapshot?.unknown_fields).toContain("ExtraField");
    expect(result.snapshot?.endpoint).toBe(ENDPOINT);
    expect(result.snapshot?.workspace_company_id).toBe(WORKSPACE);
    expect(result.snapshot?.row_count_in_batch).toBe(1);
  });
});

describe("runContractGuard — snapshot", () => {
  it("snapshot contains all field names from batch", () => {
    const rows = [
      { RegistroId: "R1", Monto: 100, Moneda: "USD" },
    ];
    const result = runContractGuard(rows, TestSchema, ENDPOINT, WORKSPACE);
    expect(result.snapshot?.field_names).toContain("RegistroId");
    expect(result.snapshot?.field_names).toContain("Monto");
    expect(result.snapshot?.field_names).toContain("Moneda");
    expect(result.snapshot?.is_valid).toBe(true);
  });
});
