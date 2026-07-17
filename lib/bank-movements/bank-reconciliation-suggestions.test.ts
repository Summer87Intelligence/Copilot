import { describe, it, expect } from "vitest";

import {
  scoreReconciliationCandidate,
  buildCandidateSuggestionsForMovement,
  type ReconciliationCandidate,
} from "@/lib/bank-movements/bank-reconciliation-suggestions";

type MovementLike = Parameters<typeof scoreReconciliationCandidate>[0];

function movement(overrides: Partial<MovementLike> = {}): MovementLike {
  return {
    id: "m1",
    movement_date: "2026-07-05",
    description: "Transferencia recibida ACME SA",
    amount: 1000,
    currency: "UYU",
    direction: "inflow",
    metadata: null,
    ...overrides,
  } as MovementLike;
}

function candidate(overrides: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate {
  return {
    targetType: "receipt",
    targetId: "r1",
    title: "Recibo ACME SA 00123",
    description: "Cobro factura ACME",
    reference: "ACME",
    amount: 1000,
    currency: "UYU",
    date: "2026-07-05",
    direction: "inflow",
    ...overrides,
  };
}

describe("scoreReconciliationCandidate", () => {
  it("propone recibo con monto exacto, misma fecha y texto → alta confianza", () => {
    const s = scoreReconciliationCandidate(movement(), candidate(), 1000);
    expect(s).not.toBeNull();
    expect(s!.confidence).toBe("high");
    expect(s!.suggestedApplyAmount).toBe(1000);
    expect(s!.targetType).toBe("receipt");
  });

  it("nunca cruza monedas", () => {
    expect(scoreReconciliationCandidate(movement({ currency: "USD" }), candidate({ currency: "UYU" }), 1000)).toBeNull();
  });

  it("nunca cruza dirección", () => {
    expect(scoreReconciliationCandidate(movement({ direction: "outflow" }), candidate({ direction: "inflow" }), 1000)).toBeNull();
  });

  it("no sugiere si no queda remanente", () => {
    expect(scoreReconciliationCandidate(movement(), candidate(), 0)).toBeNull();
  });

  it("limita el importe sugerido al remanente (conciliación parcial)", () => {
    const s = scoreReconciliationCandidate(movement(), candidate({ amount: 1000 }), 400);
    expect(s).not.toBeNull();
    expect(s!.suggestedApplyAmount).toBe(400);
  });

  it("descarta cuando monto/fecha no entran en tolerancia", () => {
    expect(scoreReconciliationCandidate(movement({ amount: 1000 }), candidate({ amount: 5, date: "2026-01-01" }), 1000)).toBeNull();
  });
});

describe("buildCandidateSuggestionsForMovement", () => {
  it("ordena por score y admite múltiples tipos de destino", () => {
    const candidates: ReconciliationCandidate[] = [
      candidate({ targetType: "receipt", targetId: "r1", amount: 1000, date: "2026-07-05" }),
      candidate({ targetType: "planned_cash_obligation", targetId: "o1", title: "Otro", reference: "XYZ", amount: 1000, date: "2026-07-12" }),
    ];
    const out = buildCandidateSuggestionsForMovement(movement(), candidates, 1000);
    expect(out.length).toBe(2);
    expect(out[0]!.score).toBeGreaterThanOrEqual(out[1]!.score);
    expect(out[0]!.targetId).toBe("r1");
  });
});
