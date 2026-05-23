import { describe, expect, it } from "vitest";

import type { SyncStateSummary } from "@/lib/copilot-financial-reconciliation";
import {
  ZETA_SALDOS_SYNC_INTERVAL_HOURS,
  computeNextZetaSyncAt,
  formatHHmm,
  pickZetaSaldosSyncState,
} from "@/lib/copilot-auto-sync";

function syncState(
  resource_flow: string,
  last_success_at: string | null,
  ageHours: number | null = null
): SyncStateSummary {
  return {
    resource_flow,
    last_success_at,
    bootstrap_completed: true,
    ageHours,
    status: "ok",
  };
}

describe("ZETA_SALDOS_SYNC_INTERVAL_HOURS", () => {
  it("refleja el cron `0 */2 * * *` configurado en vercel.json", () => {
    expect(ZETA_SALDOS_SYNC_INTERVAL_HOURS).toBe(2);
  });
});

describe("pickZetaSaldosSyncState", () => {
  it("retorna null cuando no hay syncStates", () => {
    expect(pickZetaSaldosSyncState([])).toBeNull();
  });

  it("prefiere el flujo con substring 'saldo' (case-insensitive)", () => {
    const states: SyncStateSummary[] = [
      syncState("zeta_vouchers", "2026-05-11T17:00:00Z"),
      syncState("factura_cliente_saldos_pendientes", "2026-05-11T18:00:00Z"),
      syncState("zeta_contacts", "2026-05-11T19:00:00Z"),
    ];
    const picked = pickZetaSaldosSyncState(states);
    expect(picked?.resource_flow).toBe("factura_cliente_saldos_pendientes");
  });

  it("acepta el resource_flow legacy `saldos_pendientes`", () => {
    const states: SyncStateSummary[] = [
      syncState("saldos_pendientes", "2026-05-11T17:00:00Z"),
    ];
    expect(pickZetaSaldosSyncState(states)?.resource_flow).toBe(
      "saldos_pendientes"
    );
  });

  it("usa el más reciente entre múltiples flujos de saldos", () => {
    const states: SyncStateSummary[] = [
      syncState("factura_cliente_saldos_pendientes", "2026-05-11T15:00:00Z"),
      syncState("saldos_pendientes", "2026-05-11T18:00:00Z"),
    ];
    const picked = pickZetaSaldosSyncState(states);
    expect(picked?.last_success_at).toBe("2026-05-11T18:00:00Z");
  });

  it("cae al sync más reciente cuando no hay flujos de saldos", () => {
    const states: SyncStateSummary[] = [
      syncState("zeta_vouchers", "2026-05-11T17:00:00Z"),
      syncState("zeta_contacts", "2026-05-11T19:00:00Z"),
    ];
    const picked = pickZetaSaldosSyncState(states);
    expect(picked?.resource_flow).toBe("zeta_contacts");
  });

  it("ignora syncStates sin last_success_at válido", () => {
    const states: SyncStateSummary[] = [
      syncState("factura_cliente_saldos_pendientes", null),
    ];
    expect(pickZetaSaldosSyncState(states)).toBeNull();
  });
});

describe("computeNextZetaSyncAt — cada 2h en UTC", () => {
  it("a las 14:35 UTC → próxima 16:00 UTC", () => {
    const now = new Date("2026-05-11T14:35:00Z");
    const next = computeNextZetaSyncAt(now, 2);
    expect(next.toISOString()).toBe("2026-05-11T16:00:00.000Z");
  });

  it("a las 17:59 UTC → próxima 18:00 UTC", () => {
    const now = new Date("2026-05-11T17:59:59.999Z");
    const next = computeNextZetaSyncAt(now, 2);
    expect(next.toISOString()).toBe("2026-05-11T18:00:00.000Z");
  });

  it("exactamente en el múltiplo (16:00:00 UTC) → siguiente bloque 18:00 UTC", () => {
    const now = new Date("2026-05-11T16:00:00.000Z");
    const next = computeNextZetaSyncAt(now, 2);
    expect(next.toISOString()).toBe("2026-05-11T18:00:00.000Z");
  });

  it("a las 22:30 UTC → cruza medianoche → 00:00 del día siguiente UTC", () => {
    const now = new Date("2026-05-11T22:30:00Z");
    const next = computeNextZetaSyncAt(now, 2);
    expect(next.toISOString()).toBe("2026-05-12T00:00:00.000Z");
  });

  it("soporta intervalo configurable distinto a 3h", () => {
    const now = new Date("2026-05-11T05:00:00Z");
    const next = computeNextZetaSyncAt(now, 6);
    expect(next.toISOString()).toBe("2026-05-11T06:00:00.000Z");
  });

  it("rechaza intervalHours <= 0", () => {
    expect(() => computeNextZetaSyncAt(new Date(), 0)).toThrow();
    expect(() => computeNextZetaSyncAt(new Date(), -1)).toThrow();
    expect(() => computeNextZetaSyncAt(new Date(), Number.NaN)).toThrow();
  });
});

describe("formatHHmm — formato HH:mm es-UY (24h)", () => {
  it("devuelve HH:mm con dos dígitos para una fecha real", () => {
    const out = formatHHmm(new Date("2026-05-11T18:00:00Z"));
    expect(out).toMatch(/^\d{2}:\d{2}$/);
  });

  it("usa formato 24h (no incluye AM/PM)", () => {
    const out = formatHHmm(new Date("2026-05-11T23:30:00Z"));
    expect(out).not.toMatch(/AM|PM/i);
  });

  it("devuelve '—' para fechas inválidas", () => {
    expect(formatHHmm(new Date("invalid"))).toBe("—");
  });
});
