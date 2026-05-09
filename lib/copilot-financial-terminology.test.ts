import { describe, expect, it } from "vitest";

import {
  agingDisplayLabel,
  AGING_DISPLAY_LABELS,
  CURRENCY_DISPLAY_LABELS,
  CURRENCY_SHORT_LABELS,
  currencyDisplayLabel,
  DATA_SOURCES,
  FT,
  PERIOD_SCOPES,
  PROVENANCE_CARTERA_OPERATIONAL,
  PROVENANCE_CARTERA_ZETA,
  PROVENANCE_HOME_DASHBOARD,
  RECORD_SCOPES,
} from "@/lib/copilot-financial-terminology";

describe("FT — vocabulario canónico", () => {
  it("contiene los términos esenciales", () => {
    expect(FT.facturado).toBe("Facturado");
    expect(FT.cobrado).toBe("Cobrado");
    expect(FT.pendiente).toBe("Pendiente");
    expect(FT.efectividadCobranza).toBe("Efectividad de cobranza");
    expect(FT.aging).toBe("Aging");
    expect(FT.periodoOperativo).toBe("Período operativo");
    expect(FT.historialCompleto).toBe("Historial completo");
    expect(FT.topDeudores).toBe("Top deudores");
    expect(FT.clientesConDeuda).toBe("Clientes con deuda");
  });

  it("todos los valores son strings no vacíos", () => {
    for (const [key, value] of Object.entries(FT)) {
      expect(typeof value, `FT.${key}`).toBe("string");
      expect(value.trim().length, `FT.${key} must not be empty`).toBeGreaterThan(0);
    }
  });
});

describe("AGING_DISPLAY_LABELS — formatos unificados", () => {
  it("formato underscore y hyphen producen el mismo label", () => {
    expect(AGING_DISPLAY_LABELS["0_30"]).toBe(AGING_DISPLAY_LABELS["0-30"]);
    expect(AGING_DISPLAY_LABELS["31_60"]).toBe(AGING_DISPLAY_LABELS["31-60"]);
    expect(AGING_DISPLAY_LABELS["61_90"]).toBe(AGING_DISPLAY_LABELS["61-90"]);
    expect(AGING_DISPLAY_LABELS["90_plus"]).toBe(AGING_DISPLAY_LABELS["90+"]);
  });

  it("usa guión largo (–) no guión corto (-) en rangos", () => {
    expect(AGING_DISPLAY_LABELS["0_30"]).toContain("–");
    expect(AGING_DISPLAY_LABELS["31_60"]).toContain("–");
  });

  it("todos los labels contienen 'días'", () => {
    for (const [key, value] of Object.entries(AGING_DISPLAY_LABELS)) {
      expect(value, `AGING_DISPLAY_LABELS["${key}"]`).toMatch(/días/);
    }
  });
});

describe("agingDisplayLabel helper", () => {
  it("resuelve formato underscore", () => {
    expect(agingDisplayLabel("0_30")).toBe("0–30 días");
    expect(agingDisplayLabel("90_plus")).toBe("+90 días");
  });

  it("resuelve formato hyphen", () => {
    expect(agingDisplayLabel("31-60")).toBe("31–60 días");
    expect(agingDisplayLabel("90+")).toBe("+90 días");
  });

  it("devuelve el input original si no hay match", () => {
    expect(agingDisplayLabel("unknown")).toBe("unknown");
  });
});

describe("CURRENCY_DISPLAY_LABELS / currencyDisplayLabel", () => {
  it("tiene etiquetas para UYU y USD", () => {
    expect(CURRENCY_DISPLAY_LABELS["UYU"]).toBe("Pesos uruguayos");
    expect(CURRENCY_DISPLAY_LABELS["USD"]).toBe("Dólares");
  });

  it("CURRENCY_SHORT_LABELS tiene etiquetas cortas", () => {
    expect(CURRENCY_SHORT_LABELS["UYU"]).toBe("Pesos");
    expect(CURRENCY_SHORT_LABELS["USD"]).toBe("Dólares");
  });

  it("currencyDisplayLabel fallback al código si no existe", () => {
    expect(currencyDisplayLabel("UYU")).toBe("Pesos uruguayos");
    expect(currencyDisplayLabel("EUR")).toBe("EUR");
  });
});

describe("DATA_SOURCES — fuentes de datos", () => {
  const expectedIds = ["zeta_api", "dataset_api", "analytics", "reconciliation", "manual"] as const;

  it("contiene todas las fuentes requeridas", () => {
    for (const id of expectedIds) {
      expect(DATA_SOURCES[id], `DATA_SOURCES["${id}"]`).toBeDefined();
    }
  });

  it("cada fuente tiene label, description y badgeClass no vacíos", () => {
    for (const [id, meta] of Object.entries(DATA_SOURCES)) {
      expect(meta.label.trim().length, `${id}.label`).toBeGreaterThan(0);
      expect(meta.description.trim().length, `${id}.description`).toBeGreaterThan(0);
      expect(meta.badgeClass.trim().length, `${id}.badgeClass`).toBeGreaterThan(0);
    }
  });

  it("id de cada fuente coincide con su clave en el record", () => {
    for (const [key, meta] of Object.entries(DATA_SOURCES)) {
      expect(meta.id).toBe(key);
    }
  });
});

describe("PERIOD_SCOPES", () => {
  it("operational_2026 usa label corto '2026+'", () => {
    expect(PERIOD_SCOPES.operational_2026.label).toBe("2026+");
  });

  it("cada scope tiene label, description y badgeClass", () => {
    for (const [id, meta] of Object.entries(PERIOD_SCOPES)) {
      expect(meta.label.trim().length, `${id}.label`).toBeGreaterThan(0);
      expect(meta.description.trim().length, `${id}.description`).toBeGreaterThan(0);
    }
  });

  it("id de cada scope coincide con su clave", () => {
    for (const [key, meta] of Object.entries(PERIOD_SCOPES)) {
      expect(meta.id).toBe(key);
    }
  });
});

describe("RECORD_SCOPES", () => {
  it("tiene los tres alcances requeridos", () => {
    expect(RECORD_SCOPES.active_only).toBeDefined();
    expect(RECORD_SCOPES.all_records).toBeDefined();
    expect(RECORD_SCOPES.reconciled).toBeDefined();
  });

  it("id coincide con clave", () => {
    for (const [key, meta] of Object.entries(RECORD_SCOPES)) {
      expect(meta.id).toBe(key);
    }
  });
});

describe("PROVENANCE_* — configuraciones pre-definidas", () => {
  it("PROVENANCE_HOME_DASHBOARD usa dataset_api + operational_2026 + all_records", () => {
    expect(PROVENANCE_HOME_DASHBOARD.source).toBe("dataset_api");
    expect(PROVENANCE_HOME_DASHBOARD.period).toBe("operational_2026");
    expect(PROVENANCE_HOME_DASHBOARD.scope).toBe("all_records");
    expect(PROVENANCE_HOME_DASHBOARD.note).toBeTruthy();
  });

  it("PROVENANCE_CARTERA_OPERATIONAL usa reconciliation + operational_2026 + reconciled", () => {
    expect(PROVENANCE_CARTERA_OPERATIONAL.source).toBe("reconciliation");
    expect(PROVENANCE_CARTERA_OPERATIONAL.period).toBe("operational_2026");
    expect(PROVENANCE_CARTERA_OPERATIONAL.scope).toBe("reconciled");
  });

  it("PROVENANCE_CARTERA_ZETA usa zeta_api + operational_2026 + active_only", () => {
    expect(PROVENANCE_CARTERA_ZETA.source).toBe("zeta_api");
    expect(PROVENANCE_CARTERA_ZETA.period).toBe("operational_2026");
    expect(PROVENANCE_CARTERA_ZETA.scope).toBe("active_only");
  });

  it("todas las fuentes referenciadas por provenances son válidas en DATA_SOURCES", () => {
    const provenances = [
      PROVENANCE_HOME_DASHBOARD,
      PROVENANCE_CARTERA_OPERATIONAL,
      PROVENANCE_CARTERA_ZETA,
    ];
    for (const p of provenances) {
      expect(DATA_SOURCES[p.source], `source "${p.source}" debe existir en DATA_SOURCES`).toBeDefined();
      expect(PERIOD_SCOPES[p.period], `period "${p.period}" debe existir en PERIOD_SCOPES`).toBeDefined();
      expect(RECORD_SCOPES[p.scope], `scope "${p.scope}" debe existir en RECORD_SCOPES`).toBeDefined();
    }
  });
});
