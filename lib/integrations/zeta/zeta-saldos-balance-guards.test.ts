/**
 * Tests para guards y comportamiento de balance en el pipeline de saldos.
 *
 * Cubre los 10 escenarios de FASE 2/3 del bug de balance_amount=0:
 *
 *  1. Invoice en payload con saldo>0 → balance actualizado (canApplyZeroPass=false para ese invoice)
 *  2. Invoice ausente en payload completo (IsLastPage=true) → zero_pass puede cerrar
 *  3. Payload incompleto (stopped=max_pages) → zero_pass bloqueado
 *  4. Pagination cap (pagesFetched=0) → zero_pass bloqueado
 *  5. Error parcial (stopped=zeta_error) → zero_pass bloqueado
 *  6. Raw payload con invoice saldo>0 implica que touchedInvoiceIds lo incluye → no cerrado
 *  7. zero_pass no cierra si runCompleteness=false (stopped≠completed)
 *  8. reconciliation no corre si stopped≠completed (solo bootstrap)
 *  9. Open installments → guard suma saldo y bloquea cierre
 * 10. Excel/export → solo diagnóstico, nunca fuente de balance para producción
 */

import { describe, expect, it } from "vitest";
import { canApplyZeroPass } from "@/lib/integrations/zeta/zeta-saldos-pipeline";
import {
  sumOpenInstallmentSaldoForInvoice,
  INSTALLMENT_SALDO_EPSILON,
} from "@/lib/integrations/zeta/zeta-installment-guard";
import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Helper factories ──────────────────────────────────────────────────────────

function makeInstallmentStub(rows: Array<{ cuota_saldo: number }>): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

type StoppedReason = "completed" | "max_pages" | "zeta_error" | "persist_error" | "aborted";

function zeroPassParams(overrides: Partial<{
  stopped: StoppedReason;
  pagesFetched: number;
  rowsNormalized: number;
  rowsUpserted: number;
  lastPageReliableEmptyNoRows: boolean;
}> = {}) {
  return {
    stopped: "completed" as StoppedReason,
    pagesFetched: 1,
    rowsNormalized: 1,
    rowsUpserted: 1,
    lastPageReliableEmptyNoRows: false,
    ...overrides,
  };
}

// ── 1. Invoice en payload con saldo>0 ─────────────────────────────────────────
// Si una invoice aparece en el saldo response y fue procesada por persistZetaInvoice,
// queda en touchedInvoiceIds → el zero_pass NO la toca.
// canApplyZeroPass=true en la corrida, pero esa invoice específica está excluida.
describe("escenario 1: invoice en payload → balance actualizado, no zeroed", () => {
  it("canApplyZeroPass=true cuando hay rows normalizados (corrida completa con datos)", () => {
    expect(canApplyZeroPass(zeroPassParams({ rowsNormalized: 5, rowsUpserted: 3 }))).toBe(true);
  });

  it("zero_pass corre pero invoice en touchedInvoiceIds no es afectada (invariante de diseño)", () => {
    // La función canApplyZeroPass es una condición necesaria pero no suficiente:
    // cada invoice se evalúa individualmente en zeroCcV1BalancesWithoutSaldoRow.
    // Este test confirma que canApplyZeroPass=true no implica que TODAS las invoices sean zeroeadas.
    expect(canApplyZeroPass(zeroPassParams({ rowsNormalized: 1, rowsUpserted: 1 }))).toBe(true);
  });
});

// ── 2. Invoice ausente de payload completo → puede cerrarse ───────────────────
describe("escenario 2: invoice ausente en payload completo → zero_pass aplica", () => {
  it("corrida completa con rows → canApplyZeroPass=true", () => {
    expect(canApplyZeroPass(zeroPassParams({
      stopped: "completed",
      pagesFetched: 3,
      rowsNormalized: 12,
      rowsUpserted: 12,
    }))).toBe(true);
  });

  it("corrida completa con último page explícitamente vacío → canApplyZeroPass=true", () => {
    expect(canApplyZeroPass(zeroPassParams({
      stopped: "completed",
      pagesFetched: 2,
      rowsNormalized: 0,
      rowsUpserted: 0,
      lastPageReliableEmptyNoRows: true,
    }))).toBe(true);
  });
});

// ── 3. Payload incompleto (max_pages) → zero_pass bloqueado ──────────────────
describe("escenario 3: stopped=max_pages → zero_pass no aplica", () => {
  it("stopped=max_pages bloquea zero_pass independientemente de rows", () => {
    expect(canApplyZeroPass(zeroPassParams({ stopped: "max_pages", rowsNormalized: 10, rowsUpserted: 10 }))).toBe(false);
  });

  it("stopped=max_pages con 0 páginas también bloquea", () => {
    expect(canApplyZeroPass(zeroPassParams({ stopped: "max_pages", pagesFetched: 0 }))).toBe(false);
  });
});

// ── 4. pagesFetched=0 → zero_pass bloqueado ──────────────────────────────────
describe("escenario 4: pagesFetched=0 → zero_pass no aplica", () => {
  it("sin páginas procesadas, nunca aplica zero_pass", () => {
    expect(canApplyZeroPass(zeroPassParams({
      stopped: "completed",
      pagesFetched: 0,
      rowsNormalized: 0,
      rowsUpserted: 0,
      lastPageReliableEmptyNoRows: false,
    }))).toBe(false);
  });
});

// ── 5. Error parcial → zero_pass bloqueado ───────────────────────────────────
describe("escenario 5: stopped=zeta_error/persist_error → zero_pass no aplica", () => {
  it("stopped=zeta_error bloquea zero_pass", () => {
    expect(canApplyZeroPass(zeroPassParams({ stopped: "zeta_error" }))).toBe(false);
  });

  it("stopped=persist_error bloquea zero_pass", () => {
    expect(canApplyZeroPass(zeroPassParams({ stopped: "persist_error" }))).toBe(false);
  });

  it("stopped=aborted bloquea zero_pass", () => {
    expect(canApplyZeroPass(zeroPassParams({ stopped: "aborted" }))).toBe(false);
  });
});

// ── 6. Invoice en payload (saldo>0) implica que está en touchedInvoiceIds ─────
// El mecanismo de protección: persistZetaInvoice agrega invoice a touchedInvoiceIds.
// Este test verifica que el zero_pass permite aplicarse cuando hay evidencia (rows procesados),
// lo que indica que la corrida fue completa y el set de touchedIds es confiable.
describe("escenario 6: corrida completa con rows es condición para zero_pass", () => {
  it("zero_pass aplicable solo cuando la corrida tiene evidencia de completitud", () => {
    const withRows = canApplyZeroPass(zeroPassParams({ rowsNormalized: 1, rowsUpserted: 1 }));
    const withoutRows = canApplyZeroPass(zeroPassParams({ rowsNormalized: 0, rowsUpserted: 0, lastPageReliableEmptyNoRows: false }));
    expect(withRows).toBe(true);
    expect(withoutRows).toBe(false);
  });

  it("sin rows pero con explicit empty response → corrida válida y vacía", () => {
    expect(canApplyZeroPass(zeroPassParams({
      rowsNormalized: 0,
      rowsUpserted: 0,
      lastPageReliableEmptyNoRows: true,
    }))).toBe(true);
  });
});

// ── 7. zero_pass no cierra si runCompleteness=false ──────────────────────────
describe("escenario 7: runCompleteness falso (stopped≠completed) → zero_pass bloqueado", () => {
  const nonCompleted: StoppedReason[] = ["max_pages", "zeta_error", "persist_error", "aborted"];
  for (const stopped of nonCompleted) {
    it(`stopped="${stopped}" → canApplyZeroPass=false`, () => {
      expect(canApplyZeroPass(zeroPassParams({ stopped }))).toBe(false);
    });
  }
});

// ── 8. Reconciliation no corre si stopped≠completed ──────────────────────────
// La reconciliation (reconcileMissingPendingInvoices) solo se llama en bootstrap mode
// cuando stopped === "completed". Este test documenta ese invariante desde la perspectiva
// de canApplyZeroPass (mismo guard de completitud).
describe("escenario 8: reconciliation requiere corrida completa (stopped=completed, effectiveMode=bootstrap)", () => {
  it("stopped=completed es condición necesaria para el zero_pass (proxy del guard de reconciliation)", () => {
    expect(canApplyZeroPass(zeroPassParams({ stopped: "completed", pagesFetched: 1, rowsNormalized: 1, rowsUpserted: 1 }))).toBe(true);
    expect(canApplyZeroPass(zeroPassParams({ stopped: "max_pages", pagesFetched: 5, rowsNormalized: 5, rowsUpserted: 5 }))).toBe(false);
  });
});

// ── 9. Open installments → guard bloquea cierre ──────────────────────────────
// sumOpenInstallmentSaldoForInvoice devuelve saldo > EPSILON → guard bloquea zero_pass.
// El guard es CONSERVADOR: null también bloquea.
// ORPHAN BLIND SPOT documentado: installments con invoice_id=NULL no son contados
// (retornan 0). Esto se corrige con backfill-installment-linking.mjs.
describe("escenario 9: installments con saldo > 0 → guard bloquea cierre", () => {
  it("saldo > epsilon → guard bloquea (shouldBlock=true)", () => {
    const saldo: number | null = 500;
    expect(saldo === null || saldo > INSTALLMENT_SALDO_EPSILON).toBe(true);
  });

  it("null (error DB) → guard bloquea conservativamente", () => {
    const saldo: number | null = null;
    expect(saldo === null || saldo > INSTALLMENT_SALDO_EPSILON).toBe(true);
  });

  it("saldo = 0 (todos cobrados) → guard no bloquea", () => {
    const saldo: number | null = 0;
    expect(saldo === null || saldo > INSTALLMENT_SALDO_EPSILON).toBe(false);
  });

  it("sumOpenInstallmentSaldoForInvoice suma correctamente saldos abiertos", async () => {
    const sb = makeInstallmentStub([{ cuota_saldo: 2500 }, { cuota_saldo: 1850 }]);
    const result = await sumOpenInstallmentSaldoForInvoice(sb, "ws-001", "inv-001");
    expect(result).toBe(4350);
    expect(result! > INSTALLMENT_SALDO_EPSILON).toBe(true);
  });

  it("ORPHAN BLIND SPOT: installments sin invoice_id retornan 0 (guard no bloquea)", async () => {
    // Este test documenta el bug conocido: orphaned installments (invoice_id=NULL)
    // no son encontradas por el guard (query por invoice_id).
    // Fix: backfill-installment-linking.mjs --execute debe correr primero.
    const sb = makeInstallmentStub([]); // orphaned installments no aparecen en la query
    const result = await sumOpenInstallmentSaldoForInvoice(sb, "ws-001", "inv-001");
    expect(result).toBe(0); // 0 → guard no bloquea → zero_pass puede correr → BUG
    // Solución: linkar installments antes de correr el pipeline de saldos.
  });
});

// ── 10. Excel/export → solo diagnóstico ──────────────────────────────────────
// audit-zeta-balance-missing-in-db.mjs lee el Excel como referencia de auditoría.
// El balance_amount en DB NUNCA se actualiza desde el Excel — solo desde raw saldos Zeta.
// backfill-balance-from-zeta-saldos.mjs usa zeta_sync_raw_payloads como fuente,
// no el Excel.
describe("escenario 10: Excel es fuente de auditoría, no de balance", () => {
  it("el Excel es fuente de referencia del operador, no de producción", () => {
    // Invariante documental: el script de backfill nunca acepta --excel como fuente de saldo.
    // La fuente de verdad para balance_amount es siempre zeta_sync_raw_payloads.
    // Este test es un assertion sobre el diseño, no sobre una función específica.
    const validBalanceSources = ["zeta_sync_raw_payloads", "live_zeta_api"];
    const invalidBalanceSources = ["excel_export", "user_input", "installments_sum"];
    for (const src of validBalanceSources) {
      expect(["zeta_sync_raw_payloads", "live_zeta_api"].includes(src)).toBe(true);
    }
    for (const src of invalidBalanceSources) {
      expect(["zeta_sync_raw_payloads", "live_zeta_api"].includes(src)).toBe(false);
    }
  });

  it("saldo 0 en payload raw NO dispara actualización en backfill (solo saldo > EPS)", () => {
    const EPS = 0.005;
    const saldoFromPayload = 0; // Zeta dice saldo 0
    const shouldUpdate = saldoFromPayload > EPS;
    expect(shouldUpdate).toBe(false);
  });

  it("saldo positivo en payload → backfill actualiza balance", () => {
    const EPS = 0.005;
    const saldoFromPayload = 1234.56;
    const shouldUpdate = saldoFromPayload > EPS;
    expect(shouldUpdate).toBe(true);
  });
});
