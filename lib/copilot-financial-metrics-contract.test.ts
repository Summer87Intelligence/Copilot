import { describe, expect, it } from "vitest";

import {
  CANONICAL_METRICS,
  COLLECTION_RATE_METRICS,
  COLLECTION_RATE_METRIC_ID,
  CURRENCY_INTEGRITY_RULES,
  METRIC_ALIASES,
  METRIC_ID,
  METRIC_LABEL,
  METRIC_MIXED_CURRENCY_DISCLAIMER,
  METRIC_PROHIBITED_LABELS,
  REQUIRED_NAVIGATION_CTAS,
  SYSTEM_STATE_SIGNALS,
  type MetricId,
} from "@/lib/copilot-financial-metrics-contract";

const ALL_METRIC_IDS = Object.values(METRIC_ID) as MetricId[];

describe("METRIC_ID", () => {
  it("contiene exactamente 10 métricas canónicas", () => {
    expect(ALL_METRIC_IDS).toHaveLength(10);
  });

  it("todos los IDs son únicos", () => {
    expect(new Set(ALL_METRIC_IDS).size).toBe(ALL_METRIC_IDS.length);
  });

  it("los 10 IDs canónicos están presentes", () => {
    const expected = [
      "deuda_activa",
      "deuda_vencida",
      "deuda_periodo",
      "pendiente_periodo",
      "facturado_periodo",
      "cobrado_periodo",
      "cobrado_aplicado",
      "caja_disponible",
      "caja_despues_pagos",
      "estado_global",
    ];
    for (const id of expected) {
      expect(ALL_METRIC_IDS).toContain(id);
    }
  });
});

describe("METRIC_LABEL", () => {
  it("tiene un label para cada métrica canónica", () => {
    for (const id of ALL_METRIC_IDS) {
      expect(METRIC_LABEL[id], `label faltante para ${id}`).toBeTruthy();
      expect(typeof METRIC_LABEL[id]).toBe("string");
    }
  });

  it("ningún label está vacío", () => {
    for (const [id, label] of Object.entries(METRIC_LABEL)) {
      expect(label.trim(), `label vacío para ${id}`).not.toBe("");
    }
  });
});

describe("METRIC_ALIASES", () => {
  it("tiene aliases para cada métrica canónica", () => {
    for (const id of ALL_METRIC_IDS) {
      expect(METRIC_ALIASES[id], `aliases faltantes para ${id}`).toBeDefined();
      expect(Array.isArray(METRIC_ALIASES[id])).toBe(true);
      expect(METRIC_ALIASES[id].length, `${id} debe tener al menos 1 alias`).toBeGreaterThan(0);
    }
  });

  it("el label canónico está incluido en los aliases", () => {
    for (const id of ALL_METRIC_IDS) {
      expect(
        METRIC_ALIASES[id],
        `El label canónico de ${id} debe estar en sus aliases`
      ).toContain(METRIC_LABEL[id]);
    }
  });
});

describe("METRIC_PROHIBITED_LABELS", () => {
  it("tiene al menos un label prohibido documentado", () => {
    expect(METRIC_PROHIBITED_LABELS.length).toBeGreaterThan(0);
  });

  it("ningún label prohibido coincide con un label canónico", () => {
    const canonicalLabels = Object.values(METRIC_LABEL);
    for (const prohibited of METRIC_PROHIBITED_LABELS) {
      expect(
        canonicalLabels,
        `"${prohibited}" está prohibido pero también es un label canónico — conflicto`
      ).not.toContain(prohibited);
    }
  });
});

describe("CANONICAL_METRICS", () => {
  it("tiene definición para cada métrica canónica", () => {
    for (const id of ALL_METRIC_IDS) {
      expect(CANONICAL_METRICS[id], `definición faltante para ${id}`).toBeDefined();
    }
  });

  it("cada definición tiene los campos requeridos", () => {
    for (const id of ALL_METRIC_IDS) {
      const def = CANONICAL_METRICS[id];
      expect(def.id, `${id}.id incorrecto`).toBe(id);
      expect(def.label, `${id}.label faltante`).toBeTruthy();
      expect(def.definition, `${id}.definition faltante`).toBeTruthy();
      expect(def.formula, `${id}.formula faltante`).toBeTruthy();
      expect(def.source, `${id}.source faltante`).toBeTruthy();
      expect(def.currency, `${id}.currency faltante`).toBeTruthy();
      expect(def.scope, `${id}.scope faltante`).toBeTruthy();
      expect(Array.isArray(def.consumers), `${id}.consumers debe ser array`).toBe(true);
      expect(def.consumers.length, `${id} debe tener al menos 1 consumer`).toBeGreaterThan(0);
    }
  });

  it("el label de cada definición coincide con METRIC_LABEL", () => {
    for (const id of ALL_METRIC_IDS) {
      expect(CANONICAL_METRICS[id].label).toBe(METRIC_LABEL[id]);
    }
  });

  it("deuda_vencida diverge de deuda_activa", () => {
    const def = CANONICAL_METRICS.deuda_vencida;
    const divergeIds = def.divergesFrom?.map((d) => d.metricId) ?? [];
    expect(divergeIds).toContain("deuda_activa");
  });

  it("deuda_activa diverge de deuda_periodo", () => {
    const def = CANONICAL_METRICS.deuda_activa;
    const divergeIds = def.divergesFrom?.map((d) => d.metricId) ?? [];
    expect(divergeIds).toContain("deuda_periodo");
  });

  it("caja_disponible scope es 'current'", () => {
    expect(CANONICAL_METRICS.caja_disponible.scope).toBe("current");
  });

  it("caja_despues_pagos scope es 'rolling_30d'", () => {
    expect(CANONICAL_METRICS.caja_despues_pagos.scope).toBe("rolling_30d");
  });

  it("estado_global source es 'derived'", () => {
    expect(CANONICAL_METRICS.estado_global.source).toBe("derived");
  });
});

describe("CURRENCY_INTEGRITY_RULES", () => {
  it("tiene al menos 4 reglas documentadas", () => {
    expect(CURRENCY_INTEGRITY_RULES.length).toBeGreaterThanOrEqual(4);
  });

  it("la regla sobre no sumar UYU+USD está presente", () => {
    const rules = CURRENCY_INTEGRITY_RULES as readonly string[];
    const hasRule = rules.some((r) => r.toLowerCase().includes("uyu") && r.toLowerCase().includes("usd"));
    expect(hasRule, "debe haber una regla que mencione UYU y USD").toBe(true);
  });
});

describe("METRIC_MIXED_CURRENCY_DISCLAIMER", () => {
  it("está definido y no está vacío", () => {
    expect(METRIC_MIXED_CURRENCY_DISCLAIMER).toBeTruthy();
    expect(typeof METRIC_MIXED_CURRENCY_DISCLAIMER).toBe("string");
  });

  it("menciona monedas separadas sin conversión implícita", () => {
    const lower = METRIC_MIXED_CURRENCY_DISCLAIMER.toLowerCase();
    expect(lower).toMatch(/uyu y usd|por separado/);
  });
});

describe("REQUIRED_NAVIGATION_CTAS", () => {
  it("tiene al menos 7 CTAs documentadas", () => {
    expect(REQUIRED_NAVIGATION_CTAS.length).toBeGreaterThanOrEqual(7);
  });

  it("las CTAs existentes tienen from, to y label", () => {
    for (const cta of REQUIRED_NAVIGATION_CTAS) {
      expect(cta.from, "CTA sin from").toBeTruthy();
      expect(cta.to, "CTA sin to").toBeTruthy();
      expect(cta.label, "CTA sin label").toBeTruthy();
      expect(typeof cta.exists).toBe("boolean");
    }
  });

  it("la CTA Hoy → Cartera existe", () => {
    const cta = REQUIRED_NAVIGATION_CTAS.find(
      (c) => c.from.includes("hoy") && c.to.includes("/copilot/cartera")
    );
    expect(cta, "CTA Hoy → Cartera debe estar registrada").toBeDefined();
    expect(cta?.exists).toBe(true);
  });

  it("la CTA Hoy → Tesorería existe", () => {
    const cta = REQUIRED_NAVIGATION_CTAS.find(
      (c) => c.from.includes("hoy") && c.to.includes("/copilot/tesoreria")
    );
    expect(cta, "CTA Hoy → Tesorería debe estar registrada").toBeDefined();
    expect(cta?.exists).toBe(true);
  });

  it("la CTA Finanzas → Tesorería está implementada", () => {
    const cta = REQUIRED_NAVIGATION_CTAS.find(
      (c) => c.from.includes("finanzas") && c.to.includes("/copilot/tesoreria")
    );
    expect(cta, "CTA Finanzas → Tesorería debe estar documentada").toBeDefined();
    expect(cta?.exists).toBe(true);
  });

  it("la CTA Alertas → Cartera filtrada está implementada", () => {
    const cta = REQUIRED_NAVIGATION_CTAS.find(
      (c) => c.from.includes("alerta") && c.to.includes("cartera")
    );
    expect(cta, "CTA Alertas → Cartera filtrada debe estar documentada").toBeDefined();
    expect(cta?.exists).toBe(true);
  });
});

describe("SYSTEM_STATE_SIGNALS", () => {
  it("tiene exactamente 4 señales", () => {
    expect(SYSTEM_STATE_SIGNALS).toHaveLength(4);
  });

  it("cada señal tiene id, label, source, ctaHref y ctaLabel", () => {
    for (const signal of SYSTEM_STATE_SIGNALS) {
      expect(signal.id, "señal sin id").toBeTruthy();
      expect(signal.label, "señal sin label").toBeTruthy();
      expect(signal.source, "señal sin source").toBeTruthy();
      expect(signal.ctaHref, "señal sin ctaHref").toBeTruthy();
      expect(signal.ctaLabel, "señal sin ctaLabel").toBeTruthy();
    }
  });

  it("contiene la señal de deuda vencida", () => {
    const signal = SYSTEM_STATE_SIGNALS.find((s) => s.id === "overdue_debt");
    expect(signal).toBeDefined();
    expect(signal?.ctaHref).toContain("/copilot/cartera");
  });

  it("contiene la señal de caja después de pagos", () => {
    const signal = SYSTEM_STATE_SIGNALS.find((s) => s.id === "cash_after_payments");
    expect(signal).toBeDefined();
    expect(signal?.ctaHref).toContain("/copilot/tesoreria");
  });
});

describe("COLLECTION_RATE_METRICS", () => {
  const ALL_RATE_IDS = Object.values(COLLECTION_RATE_METRIC_ID);

  it("define las cuatro familias A/B/C/D", () => {
    expect(ALL_RATE_IDS).toHaveLength(4);
    const families = ALL_RATE_IDS.map((id) => COLLECTION_RATE_METRICS[id].family);
    expect(families).toContain("A");
    expect(families).toContain("B");
    expect(families).toContain("C");
    expect(families).toContain("D");
  });

  it("applied_collection_rate usa label canónico familia A", () => {
    expect(COLLECTION_RATE_METRICS.applied_collection_rate.label).toBe(
      "Cobranza efectiva aplicada"
    );
    expect(COLLECTION_RATE_METRICS.applied_collection_rate.family).toBe("A");
  });

  it("registered_collection_rate usa label canónico familia B", () => {
    expect(COLLECTION_RATE_METRICS.registered_collection_rate.label).toBe(
      "Cobros registrados / ventas"
    );
    expect(COLLECTION_RATE_METRICS.registered_collection_rate.family).toBe("B");
  });

  it("promise_fulfillment_rate usa label canónico familia D", () => {
    expect(COLLECTION_RATE_METRICS.promise_fulfillment_rate.label).toBe(
      "Cumplimiento de promesas"
    );
    expect(COLLECTION_RATE_METRICS.promise_fulfillment_rate.family).toBe("D");
  });

  it("debt_recovery_rate usa label canónico familia C", () => {
    expect(COLLECTION_RATE_METRICS.debt_recovery_rate.label).toBe(
      "Recuperación de deuda"
    );
    expect(COLLECTION_RATE_METRICS.debt_recovery_rate.family).toBe("C");
  });

  it("labels ambiguos están en METRIC_PROHIBITED_LABELS", () => {
    expect(METRIC_PROHIBITED_LABELS).toContain("Cobranza efectiva");
    expect(METRIC_PROHIBITED_LABELS).toContain("Efectividad de cobros");
  });
});
