import { describe, expect, it } from "vitest";

import {
  SANTANDER_BALANCE_MISMATCH_FIXTURE,
  SANTANDER_EXACT_DUPLICATE_ROWS_FIXTURE,
  SANTANDER_REALWORLD_MULTIPAGE_FIXTURE,
  SANTANDER_UYU_JULY_AUSZUG_FIXTURE,
  SANTANDER_USD_JULY_AUSZUG_FIXTURE,
} from "@/lib/bank-movements/fixtures/santander-pdf-text.fixture";
import {
  buildSantanderBankStatementPreview,
  parseSantanderBankStatementText,
} from "@/lib/bank-movements/santander-pdf-parser";

/**
 * BANK-V3-APPLY-PDF-IMPORT-FIX-AND-DEMO-READY-001, sección 15 — cobertura con fixtures
 * sintéticos/anonimizados (nunca los PDF reales) de la geometría y los problemas reales
 * encontrados al reproducir el import contra los dos extractos de julio 2026.
 */
describe("Santander PDF — marcador de página real de pdf-parse (regresión del bug de import)", () => {
  const preview = buildSantanderBankStatementPreview(SANTANDER_REALWORLD_MULTIPAGE_FIXTURE);

  it("no descarta el último movimiento cuando el marcador de página cae justo antes de 'Saldo final'", () => {
    // Antes del fix: el bloque "362629 DEBITO ... TFCG DEMOCORP -113,00 96.000,00" se
    // fusionaba con "Saldo final 96.000,00" (no había fecha siguiente que cortara el
    // bloque) y era descartado por isBalanceRow al contener "saldo final" en su descripción.
    const last = preview.movements.find((m) => m.description.includes("TFCG DEMOCORP"));
    expect(last).toBeDefined();
    expect(last).toMatchObject({ direction: "outflow", debit: 113, balance: 96000 });
    expect(last!.description.toLowerCase()).not.toContain("saldo final");
  });

  it("no contamina un movimiento intermedio con el marcador de página ('-- 1 of 2 --')", () => {
    const row = preview.movements.find((m) => m.description.includes("COMERCIO DEMO"));
    expect(row).toBeDefined();
    expect(row!.description).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
    expect(row!.raw_text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
  });

  it("reconstruye fecha y referencia partidas en líneas separadas", () => {
    const row = preview.movements.find((m) => m.description.includes("COMERCIO DEMO"));
    expect(row!.date).toBe("2026-08-01");
    expect(row!.reference).toBe("618212545773");
  });

  it("detecta correctamente cuenta, moneda y período pese al encabezado partido en 3 líneas", () => {
    expect(preview.account_number).toBe("000009999999");
    expect(preview.currency_code).toBe("UYU");
    expect(preview.period_start).toBe("2026-08-01");
    expect(preview.period_end).toBe("2026-08-31");
  });

  it("valida el saldo de todo el extracto sin descartar ningún movimiento", () => {
    expect(preview.opening_balance).toBe(100000);
    expect(preview.closing_balance).toBe(96000);
    expect(preview.balance_validation).toMatchObject({
      ok: true,
      row_mismatches_count: 0,
      difference: 0,
    });
    expect(preview.movements.every((m) => m.balance_check === "ok")).toBe(true);
  });
});

describe("Santander PDF — agrupamiento principal + comisión (operation_group_key, sección 11)", () => {
  const { movements } = parseSantanderBankStatementText(SANTANDER_REALWORLD_MULTIPAGE_FIXTURE);

  function groupFor(descriptionFragment: string) {
    const row = movements.find((m) => m.description.includes(descriptionFragment));
    expect(row).toBeDefined();
    return row!;
  }

  it("agrupa ZETASOFTWARE (principal + comisión) por referencia + NRR compartidos", () => {
    const principal = groupFor("TRANSF INSTANTANEA ENVIADA");
    const comision = groupFor("COMISION TRANSF INSTANTANEA");
    expect(principal.operation_group_key).not.toBeNull();
    expect(principal.operation_group_key).toBe(comision.operation_group_key);
    expect(principal.nrr).toBe("201870170");
    expect(principal.payer_name_normalized).toBe("ZETASOFTWARE S.A.");
    expect(comision.payer_name_normalized).toBe("ZETASOFTWARE S.A.");
    // Nunca se fusionan en un solo movimiento: comisión no es otro pago del cliente.
    expect(principal.debit).toBe(3000);
    expect(comision.debit).toBe(60);
  });

  it("agrupa MICAELA NAVARRA (débito + comisión) por la misma referencia TT", () => {
    const debitRow = movements.find((m) => m.description.includes("DEBITO OPERACION EN BANCA DIGITAL 528896"));
    const comisionRow = movements.find((m) => m.description.includes("TRANSFERENCIA ENVIADA 528900"));
    expect(debitRow).toBeDefined();
    expect(comisionRow).toBeDefined();
    expect(debitRow!.operation_group_key).toBe(comisionRow!.operation_group_key);
    expect(debitRow!.payer_name_normalized).toBe("MICAELA NAVARRA");
    expect(debitRow!.debit).toBe(700);
    expect(comisionRow!.debit).toBe(2);
  });

  it("agrupa PETROVIC SOLUTIONS (crédito recibido + su propia comisión) por referencia TR", () => {
    const credito = movements.find((m) => m.credit === 400);
    const comision = movements.find((m) => m.description.includes("COMISION - PETROVIC"));
    expect(credito).toBeDefined();
    expect(comision).toBeDefined();
    expect(credito!.direction).toBe("inflow");
    expect(comision!.direction).toBe("outflow");
    expect(credito!.operation_group_key).toBe(comision!.operation_group_key);
    expect(credito!.payer_name_normalized).toContain("PETROVIC SOLUTIONS");
  });

  it("nunca agrupa por nombre o monto solamente: movimientos sin referencia quedan sin group key", () => {
    // El primer movimiento (compra con tarjeta) no comparte referencia con ningún otro,
    // así que aunque tuviera un monto coincidente con otro movimiento, no debe agruparse.
    const row = movements.find((m) => m.description.includes("COMERCIO DEMO"));
    const sameGroup = movements.filter((m) => m.operation_group_key === row!.operation_group_key);
    expect(sameGroup).toHaveLength(1);
  });
});

describe("Santander PDF — validación de saldo por fila detecta inconsistencias reales (sección 10)", () => {
  it("marca mismatch y no oculta el problema cuando saldo_anterior + movimiento != saldo_actual", () => {
    const preview = buildSantanderBankStatementPreview(SANTANDER_BALANCE_MISMATCH_FIXTURE);
    // Saldo inicial 10.000,00 - 500,00 debería dar 9.500,00, pero el extracto informa 8.000,00.
    const row = preview.movements[0]!;
    expect(row.balance_check).toBe("mismatch");
    expect(preview.balance_validation!.ok).toBe(false);
    expect(preview.balance_validation!.row_mismatches_count).toBeGreaterThan(0);
    // Nunca se "corrige" el monto para forzar el cuadre: el débito informado se preserva tal cual.
    expect(row.debit).toBe(500);
    expect(row.balance).toBe(8000);
  });
});

describe("Santander PDF — deduplicación distingue movimientos idénticos por ocurrencia (sección 13)", () => {
  it("dos filas con misma fecha/referencia/monto/descripción obtienen fingerprints distintos", () => {
    const { movements } = parseSantanderBankStatementText(SANTANDER_EXACT_DUPLICATE_ROWS_FIXTURE);
    expect(movements).toHaveLength(2);
    expect(movements[0]!.dedup_fingerprint).not.toBe(movements[1]!.dedup_fingerprint);
    expect(movements[0]!.dedup_fingerprint).toMatch(/\|0$/);
    expect(movements[1]!.dedup_fingerprint).toMatch(/\|1$/);
  });
});

describe("Santander PDF — dos extractos simultáneos (sección 14)", () => {
  it("cada extracto se parsea de forma independiente sin mezclar cuentas/monedas", () => {
    const uyu = buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    const usd = buildSantanderBankStatementPreview(SANTANDER_USD_JULY_AUSZUG_FIXTURE);
    expect(uyu.currency_code).toBe("UYU");
    expect(usd.currency_code).toBe("USD");
    expect(uyu.account_number).not.toBe(usd.account_number);
    expect(uyu.movements_count).toBeGreaterThan(0);
    expect(usd.movements_count).toBeGreaterThan(0);
  });
});
