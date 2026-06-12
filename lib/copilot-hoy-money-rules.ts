/**
 * Reglas de dinero en /copilot/hoy — documentación y auditoría de fuentes.
 * No altera cálculos; solo describe y valida separación de métricas.
 */

import type { TodayBusinessPulse } from "@/lib/copilot-today-business-pulse";

/** Qué campo alimenta cada card del cockpit (trazabilidad para dev/ops). */
export const HOY_MONEY_FIELD_SOURCES = {
  moneyAvailable: {
    card: "Caja disponible",
    field: "currentStateBlocks[].cashAvailable",
    origin:
      "HoyCashPositionBlock.availableCash — caja/tesorería (saldo actual cargado + movimientos confirmados). Sin cartera/facturación.",
    mustNotInclude: ["pendingReceivables", "por cobrar de Cartera"],
  },
  receivables: {
    card: "Total pendiente",
    field: "currentStateBlocks[].pendingReceivables",
    origin: "Total pendiente de clientes (Cartera / portfolio pending), por moneda. El atrasado ya está incluido.",
    mustNotInclude: ["cashAvailable", "availableCash"],
  },
  payments: {
    card: "Pagos próximos",
    field: "projection30dBlocks[].scheduledPayments",
    origin: "Obligaciones de tesorería en horizonte 30 días",
  },
  afterPayments: {
    card: "Caja proyectada",
    field: "projection30dBlocks[].safeCash30d",
    formula: "caja disponible − pagos programados (sin sumar por cobrar)",
  },
  expectedCash30d: {
    card: "Caja esperada si se cobra (proyección avanzada, no cockpit principal)",
    field: "projection30dBlocks[].expectedCash30d",
    formula: "caja disponible + por cobrar − pagos programados",
  },
} as const;

/**
 * Comportamiento esperado cuando un cobro se sincroniza (Zeta/recibos → Cartera/Tesorería).
 *
 * 1. Cartera / saldo pendiente baja → Hoy «Por cobrar» baja (misma fuente).
 * 2. «Dinero disponible» sube solo si el cobro impactó caja/tesorería (recibo aplicado a posición).
 * 3. «Después de pagos» se recalcula con la nueva caja − pagos programados.
 * 4. Recibo registrado sin impacto en caja aún → no inflar «Dinero disponible» artificialmente.
 */
export const HOY_COLLECTION_SYNC_BEHAVIOR = [
  "Cartera pending ↓ ⇒ cockpit Total pendiente ↓",
  "Tesorería/caja ↑ solo con cobro en posición disponible ⇒ Dinero disponible ↑",
  "safeCash30d = caja − pagos (sin mezclar por cobrar en Dinero disponible)",
  "expectedCash30d = caja + por cobrar − pagos (escenario, no caja hoy)",
] as const;

export type HoyMoneySourcesAuditRow = {
  metric: string;
  field: string;
  uyu: number | null;
  usd: number | null;
  includesReceivablesInCash: boolean;
};

export type HoyMoneySourcesAudit = {
  ok: boolean;
  rows: HoyMoneySourcesAuditRow[];
  violations: string[];
  sources: typeof HOY_MONEY_FIELD_SOURCES;
};

function blockAmount(
  blocks: TodayBusinessPulse["currentStateBlocks"],
  currency: "UYU" | "USD",
  key: "cashAvailable" | "pendingReceivables"
): number | null {
  const b = blocks.find((x) => x.currency === currency);
  return b ? b[key] : null;
}

/**
 * Reporte de auditoría: confirma que Por cobrar no está mezclado en Dinero disponible.
 * Imprimible en consola vía `formatHoyMoneySourcesAuditReport`.
 */
export function auditHoyMoneyFieldSources(pulse: TodayBusinessPulse): HoyMoneySourcesAudit {
  const violations: string[] = [];

  for (const currency of ["UYU", "USD"] as const) {
    const b = pulse.currentStateBlocks.find((x) => x.currency === currency);
    if (!b) continue;
    if (b.cashAvailable > 0 && b.pendingReceivables > 0 && b.cashAvailable === b.pendingReceivables) {
      violations.push(
        `${currency}: cashAvailable (${b.cashAvailable}) === pendingReceivables — revisar posible mezcla`
      );
    }
  }

  for (const proj of pulse.projection30dBlocks) {
    const cur = pulse.currentStateBlocks.find((b) => b.currency === proj.currency);
    const cash = cur?.cashAvailable ?? proj.currentCash;
    const expectedSafe = cash - proj.scheduledPayments;
    if (proj.hasConfiguredPayments && Math.abs(proj.safeCash30d - expectedSafe) > 0.01) {
      violations.push(
        `${proj.currency}: safeCash30d (${proj.safeCash30d}) ≠ caja (${cash}) − pagos (${proj.scheduledPayments})`
      );
    }
    const expectedIfCollected = cash + proj.pendingReceivables - proj.scheduledPayments;
    if (Math.abs(proj.expectedCash30d - expectedIfCollected) > 0.01) {
      violations.push(
        `${proj.currency}: expectedCash30d no coincide con caja + por cobrar − pagos`
      );
    }
    if (proj.currentCash > 0 && proj.pendingReceivables > 0 && proj.currentCash === proj.pendingReceivables) {
      violations.push(
        `${proj.currency}: currentCash en proyección igual a pendingReceivables — revisar`
      );
    }
  }

  const rows: HoyMoneySourcesAuditRow[] = [
    {
      metric: HOY_MONEY_FIELD_SOURCES.moneyAvailable.card,
      field: HOY_MONEY_FIELD_SOURCES.moneyAvailable.field,
      uyu: blockAmount(pulse.currentStateBlocks, "UYU", "cashAvailable"),
      usd: blockAmount(pulse.currentStateBlocks, "USD", "cashAvailable"),
      includesReceivablesInCash: false,
    },
    {
      metric: HOY_MONEY_FIELD_SOURCES.receivables.card,
      field: HOY_MONEY_FIELD_SOURCES.receivables.field,
      uyu: blockAmount(pulse.currentStateBlocks, "UYU", "pendingReceivables"),
      usd: blockAmount(pulse.currentStateBlocks, "USD", "pendingReceivables"),
      includesReceivablesInCash: false,
    },
    {
      metric: HOY_MONEY_FIELD_SOURCES.payments.card,
      field: HOY_MONEY_FIELD_SOURCES.payments.field,
      uyu:
        pulse.projection30dBlocks.find((b) => b.currency === "UYU")?.scheduledPayments ?? null,
      usd:
        pulse.projection30dBlocks.find((b) => b.currency === "USD")?.scheduledPayments ?? null,
      includesReceivablesInCash: false,
    },
    {
      metric: HOY_MONEY_FIELD_SOURCES.afterPayments.card,
      field: HOY_MONEY_FIELD_SOURCES.afterPayments.field,
      uyu: pulse.projection30dBlocks.find((b) => b.currency === "UYU")?.safeCash30d ?? null,
      usd: pulse.projection30dBlocks.find((b) => b.currency === "USD")?.safeCash30d ?? null,
      includesReceivablesInCash: false,
    },
  ];

  return {
    ok: violations.length === 0,
    rows,
    violations,
    sources: HOY_MONEY_FIELD_SOURCES,
  };
}

/** Texto para consola / logs de validación manual. */
export function formatHoyMoneySourcesAuditReport(audit: HoyMoneySourcesAudit): string {
  const lines = [
    "═══ Hoy — auditoría fuentes de dinero ═══",
    `OK: ${audit.ok ? "sí" : "NO"}`,
    "",
    "Métrica | Campo | UYU | USD | ¿Por cobrar en caja?",
  ];
  for (const r of audit.rows) {
    lines.push(
      `${r.metric} | ${r.field} | ${r.uyu ?? "—"} | ${r.usd ?? "—"} | ${r.includesReceivablesInCash ? "SÍ" : "no"}`
    );
  }
  if (audit.violations.length > 0) {
    lines.push("", "Violaciones:");
    for (const v of audit.violations) lines.push(`  - ${v}`);
  }
  lines.push("", "Regla: Dinero disponible ≠ Por cobrar (fuentes distintas).");
  lines.push("Después de pagos = caja − pagos (sin por cobrar).");
  return lines.join("\n");
}
