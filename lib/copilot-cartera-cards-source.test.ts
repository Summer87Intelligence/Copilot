/**
 * Tests para `lib/copilot-cartera-cards-source.ts`.
 *
 * Cubre las variabilidades reales del shape entrante: array vs objeto
 * indexado, camelCase vs snake_case, numéricos como string vs number,
 * campos faltantes (derivación interna), campos negativos (clamp), códigos
 * inválidos.
 */
import { describe, it, expect } from "vitest";

import {
  buildCurrencyIndex,
  findCurrencyMetrics,
  readCurrencyMetric,
} from "./copilot-cartera-cards-source";

describe("readCurrencyMetric", () => {
  it("lee number directo de la primera clave", () => {
    expect(readCurrencyMetric({ totalInvoiced: 100 }, "totalInvoiced")).toBe(100);
  });

  it("cae al snake_case si camelCase falta", () => {
    expect(
      readCurrencyMetric({ total_invoiced: 100 }, "totalInvoiced", "total_invoiced")
    ).toBe(100);
  });

  it("parsea string numérico", () => {
    expect(readCurrencyMetric({ totalInvoiced: "8639.80" }, "totalInvoiced")).toBe(
      8639.8
    );
  });

  it("parsea string es-UY con separador miles", () => {
    expect(readCurrencyMetric({ totalInvoiced: "659.992,38" }, "totalInvoiced")).toBe(
      659992.38
    );
  });

  it("devuelve null si todas las claves faltan", () => {
    expect(readCurrencyMetric({ foo: 1 }, "totalInvoiced", "total_invoiced")).toBeNull();
  });

  it("devuelve null para record null/undefined", () => {
    expect(readCurrencyMetric(null, "totalInvoiced")).toBeNull();
    expect(readCurrencyMetric(undefined, "totalInvoiced")).toBeNull();
  });

  it("distingue '0' (campo presente con cero) de campo ausente", () => {
    expect(readCurrencyMetric({ totalInvoiced: 0 }, "totalInvoiced")).toBe(0);
    expect(readCurrencyMetric({ totalInvoiced: "0" }, "totalInvoiced")).toBe(0);
  });

  it("rechaza NaN/Infinity (vuelve null)", () => {
    expect(readCurrencyMetric({ totalInvoiced: NaN }, "totalInvoiced")).toBeNull();
    expect(readCurrencyMetric({ totalInvoiced: Infinity }, "totalInvoiced")).toBeNull();
  });
});

describe("buildCurrencyIndex — array shape (motor canónico)", () => {
  it("indexa array camelCase con todos los campos", () => {
    const idx = buildCurrencyIndex([
      {
        currencyCode: "USD",
        totalInvoiced: 8639.8,
        totalPending: 5824.22,
        totalCollected: 2815.58,
        invoiceCount: 23,
        pendingInvoiceCount: 14,
        collectionEffectiveness: 0.3258,
      },
      {
        currencyCode: "UYU",
        totalInvoiced: 659992.38,
        totalPending: 424666,
        totalCollected: 235326.38,
        invoiceCount: 35,
        pendingInvoiceCount: 23,
        collectionEffectiveness: 0.3566,
      },
    ]);

    const usd = idx.get("USD");
    expect(usd?.totalInvoiced).toBe(8639.8);
    expect(usd?.totalPending).toBe(5824.22);
    expect(usd?.totalCollected).toBe(2815.58);
    expect(usd?.invoiceCount).toBe(23);
    expect(usd?.pendingInvoiceCount).toBe(14);
    expect(usd?.collectionEffectiveness).toBeCloseTo(0.3258, 4);

    const uyu = idx.get("UYU");
    expect(uyu?.totalInvoiced).toBe(659992.38);
    expect(uyu?.totalCollected).toBe(235326.38);
    expect(uyu?.collectionEffectiveness).toBeCloseTo(0.3566, 4);
  });

  it("indexa array snake_case", () => {
    const idx = buildCurrencyIndex([
      {
        currency_code: "USD",
        total_invoiced: 1000,
        total_pending: 400,
        total_collected: 600,
        invoice_count: 5,
        pending_invoice_count: 2,
        collection_effectiveness: 0.6,
      },
    ]);
    const usd = idx.get("USD");
    expect(usd?.totalInvoiced).toBe(1000);
    expect(usd?.totalPending).toBe(400);
    expect(usd?.totalCollected).toBe(600);
    expect(usd?.invoiceCount).toBe(5);
    expect(usd?.pendingInvoiceCount).toBe(2);
    expect(usd?.collectionEffectiveness).toBeCloseTo(0.6, 4);
  });

  it("indexa array con numéricos serializados como string (numeric Postgres)", () => {
    const idx = buildCurrencyIndex([
      {
        currencyCode: "UYU",
        totalInvoiced: "659992.38",
        totalPending: "424666.00",
        totalCollected: "235326.38",
        invoiceCount: "35",
        pendingInvoiceCount: "23",
        collectionEffectiveness: "0.3566",
      },
    ]);
    const uyu = idx.get("UYU");
    expect(uyu?.totalInvoiced).toBe(659992.38);
    expect(uyu?.totalPending).toBe(424666);
    expect(uyu?.totalCollected).toBe(235326.38);
    expect(uyu?.invoiceCount).toBe(35);
    expect(uyu?.pendingInvoiceCount).toBe(23);
  });

  it("ignora códigos inválidos", () => {
    const idx = buildCurrencyIndex([
      { currencyCode: "EUR", totalInvoiced: 100, totalPending: 0 },
      { currencyCode: "USD", totalInvoiced: 200, totalPending: 50 },
    ]);
    expect(idx.has("USD")).toBe(true);
    expect(idx.size).toBe(1);
  });

  it("ignora items malformados (null, primitivo, sin código)", () => {
    const idx = buildCurrencyIndex([
      null,
      "USD",
      { totalInvoiced: 100 }, // sin currencyCode
      { currencyCode: "USD", totalInvoiced: 100, totalPending: 50 },
    ] as unknown[]);
    expect(idx.size).toBe(1);
    expect(idx.get("USD")?.totalInvoiced).toBe(100);
  });
});

describe("buildCurrencyIndex — object shape (compat futuro)", () => {
  it("indexa objeto { USD: {...}, UYU: {...} } sin currencyCode por bucket", () => {
    const idx = buildCurrencyIndex({
      USD: {
        totalInvoiced: 8639.8,
        totalPending: 5824.22,
        totalCollected: 2815.58,
        invoiceCount: 23,
        pendingInvoiceCount: 14,
        collectionEffectiveness: 0.3258,
      },
      UYU: {
        totalInvoiced: 659992.38,
        totalPending: 424666,
        totalCollected: 235326.38,
        invoiceCount: 35,
        pendingInvoiceCount: 23,
        collectionEffectiveness: 0.3566,
      },
    });

    expect(idx.get("USD")?.totalInvoiced).toBe(8639.8);
    expect(idx.get("UYU")?.totalInvoiced).toBe(659992.38);
  });

  it("indexa objeto con claves en lowercase ({ usd: {...} })", () => {
    const idx = buildCurrencyIndex({
      usd: { totalInvoiced: 100, totalPending: 50 },
      uyu: { totalInvoiced: 200, totalPending: 80 },
    });
    expect(idx.get("USD")?.totalInvoiced).toBe(100);
    expect(idx.get("UYU")?.totalInvoiced).toBe(200);
  });

  it("indexa objeto con snake_case dentro de cada bucket", () => {
    const idx = buildCurrencyIndex({
      USD: {
        total_invoiced: 1000,
        total_pending: 400,
        total_collected: 600,
        invoice_count: 5,
        pending_invoice_count: 2,
        collection_effectiveness: 0.6,
      },
    });
    const usd = idx.get("USD");
    expect(usd?.totalInvoiced).toBe(1000);
    expect(usd?.totalCollected).toBe(600);
  });
});

describe("buildCurrencyIndex — derivaciones internas", () => {
  it("deriva totalCollected si está ausente desde invoiced − pending del MISMO bucket", () => {
    const idx = buildCurrencyIndex([
      {
        currencyCode: "USD",
        totalInvoiced: 1000,
        totalPending: 400,
        // sin totalCollected
      },
    ]);
    expect(idx.get("USD")?.totalCollected).toBe(600);
  });

  it("totalCollected clampea a >=0 incluso si pending > invoiced (caso patológico)", () => {
    const idx = buildCurrencyIndex([
      {
        currencyCode: "USD",
        totalInvoiced: 100,
        totalPending: 200,
        // sin totalCollected
      },
    ]);
    expect(idx.get("USD")?.totalCollected).toBeGreaterThanOrEqual(0);
  });

  it("deriva collectionEffectiveness si está ausente desde collected/invoiced", () => {
    const idx = buildCurrencyIndex([
      {
        currencyCode: "USD",
        totalInvoiced: 1000,
        totalPending: 400,
        totalCollected: 600,
        // sin collectionEffectiveness
      },
    ]);
    expect(idx.get("USD")?.collectionEffectiveness).toBeCloseTo(0.6, 4);
  });

  it("collectionEffectiveness es null cuando totalInvoiced=0", () => {
    const idx = buildCurrencyIndex([
      {
        currencyCode: "USD",
        totalInvoiced: 0,
        totalPending: 0,
      },
    ]);
    expect(idx.get("USD")?.collectionEffectiveness).toBeNull();
  });

  it("collectionEffectiveness se clampea a [0..1]", () => {
    const idx = buildCurrencyIndex([
      {
        currencyCode: "USD",
        totalInvoiced: 1000,
        totalPending: 0,
        collectionEffectiveness: 1.5, // valor inválido
      },
    ]);
    expect(idx.get("USD")?.collectionEffectiveness).toBe(1);
  });

  it("invoiceCount y pendingInvoiceCount se redondean y clampean a >=0", () => {
    const idx = buildCurrencyIndex([
      {
        currencyCode: "USD",
        totalInvoiced: 100,
        invoiceCount: 23.7,
        pendingInvoiceCount: -2,
      },
    ]);
    expect(idx.get("USD")?.invoiceCount).toBe(23);
    expect(idx.get("USD")?.pendingInvoiceCount).toBe(0);
  });
});

describe("buildCurrencyIndex — inputs degenerados", () => {
  it("null/undefined → Map vacío", () => {
    expect(buildCurrencyIndex(null).size).toBe(0);
    expect(buildCurrencyIndex(undefined).size).toBe(0);
  });

  it("primitivos → Map vacío", () => {
    expect(buildCurrencyIndex("USD").size).toBe(0);
    expect(buildCurrencyIndex(42).size).toBe(0);
  });

  it("array vacío → Map vacío", () => {
    expect(buildCurrencyIndex([]).size).toBe(0);
  });

  it("objeto vacío → Map vacío", () => {
    expect(buildCurrencyIndex({}).size).toBe(0);
  });
});

describe("findCurrencyMetrics", () => {
  it("retorna el bucket normalizado del array", () => {
    const r = {
      currencies: [
        { currencyCode: "USD", totalInvoiced: 100, totalPending: 30 },
      ],
    };
    const m = findCurrencyMetrics(r, "USD");
    expect(m?.totalInvoiced).toBe(100);
    expect(m?.totalCollected).toBe(70);
  });

  it("retorna null si la moneda no aparece", () => {
    const r = {
      currencies: [{ currencyCode: "UYU", totalInvoiced: 100 }],
    };
    expect(findCurrencyMetrics(r, "USD")).toBeNull();
  });

  it("retorna null si currencies es undefined", () => {
    expect(findCurrencyMetrics({ currencies: undefined }, "USD")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test de contrato: shape exacto del log report_debug observado en producción
// ---------------------------------------------------------------------------
describe("regresión: replica el shape exacto que el motor envió al cliente (2026-05-11 21:21:25)", () => {
  it("USD y UYU se normalizan a los valores observados en server logs", () => {
    // Captura literal del log [report_debug] del server para el rango
    // 2026-05-01 → 2026-05-11, workspace 040321ff-…
    const currencies = [
      {
        currencyCode: "USD",
        totalInvoiced: 8639.8,
        totalPending: 5824.22,
        totalCollected: 2815.58,
        invoiceCount: 23,
        pendingInvoiceCount: 14,
        collectionEffectiveness: 0.3258848584457974,
      },
      {
        currencyCode: "UYU",
        totalInvoiced: 659992.38,
        totalPending: 424666,
        totalCollected: 235326.38,
        invoiceCount: 35,
        pendingInvoiceCount: 23,
        collectionEffectiveness: 0.35655923785059457,
      },
    ];

    const idx = buildCurrencyIndex(currencies);
    const usd = idx.get("USD");
    const uyu = idx.get("UYU");

    // USD
    expect(usd?.totalInvoiced).toBe(8639.8);
    expect(usd?.totalPending).toBe(5824.22);
    expect(usd?.totalCollected).toBe(2815.58);
    expect(usd?.invoiceCount).toBe(23);
    expect(usd?.pendingInvoiceCount).toBe(14);
    expect(usd?.collectionEffectiveness).toBeCloseTo(0.3259, 4);

    // UYU
    expect(uyu?.totalInvoiced).toBe(659992.38);
    expect(uyu?.totalPending).toBe(424666);
    expect(uyu?.totalCollected).toBe(235326.38);
    expect(uyu?.invoiceCount).toBe(35);
    expect(uyu?.pendingInvoiceCount).toBe(23);
    expect(uyu?.collectionEffectiveness).toBeCloseTo(0.3566, 4);
  });
});
