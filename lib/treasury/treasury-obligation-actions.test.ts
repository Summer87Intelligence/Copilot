import { describe, expect, it } from "vitest";

import {
  buildDueStatusLabelWithTime,
  buildMetaWithDueTime,
  buildPaymentConfirmationPayload,
  formatDueDate,
  formatDueWithTime,
  formatPaymentStatusLabel,
  getDueTime,
  getTreasuryPaymentActionsByStatus,
} from "@/lib/treasury/treasury-obligation-actions";

describe("getTreasuryPaymentActionsByStatus", () => {
  it("pendiente: puede pagar, editar, cancelar; no reprogramar", () => {
    const a = getTreasuryPaymentActionsByStatus("planned");
    expect(a.canPay).toBe(true);
    expect(a.canEdit).toBe(true);
    expect(a.canReschedule).toBe(false);
    expect(a.canCancel).toBe(true);
    expect(a.canDelete).toBe(true);
  });

  it("confirmado: puede pagar, editar, cancelar; no reprogramar", () => {
    const a = getTreasuryPaymentActionsByStatus("confirmed");
    expect(a.canPay).toBe(true);
    expect(a.canEdit).toBe(true);
    expect(a.canReschedule).toBe(false);
    expect(a.canCancel).toBe(true);
  });

  it("vencido: puede pagar, reprogramar, cancelar; no editar directamente", () => {
    const a = getTreasuryPaymentActionsByStatus("overdue");
    expect(a.canPay).toBe(true);
    expect(a.canEdit).toBe(false);
    expect(a.canReschedule).toBe(true);
    expect(a.canCancel).toBe(true);
  });

  it("pagado: no puede pagar, editar ni cancelar", () => {
    const a = getTreasuryPaymentActionsByStatus("paid");
    expect(a.canPay).toBe(false);
    expect(a.canEdit).toBe(false);
    expect(a.canReschedule).toBe(false);
    expect(a.canCancel).toBe(false);
    expect(a.canDelete).toBe(true);
  });

  it("cancelado: no puede pagar, editar ni cancelar", () => {
    const a = getTreasuryPaymentActionsByStatus("cancelled");
    expect(a.canPay).toBe(false);
    expect(a.canEdit).toBe(false);
    expect(a.canCancel).toBe(false);
    expect(a.canDelete).toBe(true);
  });
});

describe("formatPaymentStatusLabel", () => {
  it("planned → Pendiente", () => expect(formatPaymentStatusLabel("planned")).toBe("Pendiente"));
  it("confirmed → Confirmado", () => expect(formatPaymentStatusLabel("confirmed")).toBe("Confirmado"));
  it("overdue → Vencido", () => expect(formatPaymentStatusLabel("overdue")).toBe("Vencido"));
  it("paid → Pagado", () => expect(formatPaymentStatusLabel("paid")).toBe("Pagado"));
  it("cancelled → Cancelado", () => expect(formatPaymentStatusLabel("cancelled")).toBe("Cancelado"));
});

describe("buildPaymentConfirmationPayload", () => {
  it("construye payload con register_cash_movement=true", () => {
    const p = buildPaymentConfirmationPayload("id-1", 1500, true);
    expect(p.id).toBe("id-1");
    expect(p.amountFinal).toBe(1500);
    expect(p.registerCashMovement).toBe(true);
  });

  it("construye payload sin monto final", () => {
    const p = buildPaymentConfirmationPayload("id-2", undefined, false);
    expect(p.amountFinal).toBeUndefined();
    expect(p.registerCashMovement).toBe(false);
  });
});

describe("getDueTime", () => {
  it("extrae HH:MM válido de metadata", () => {
    expect(getDueTime({ metadata: { due_time: "15:00" } })).toBe("15:00");
    expect(getDueTime({ metadata: { due_time: "09:30" } })).toBe("09:30");
    expect(getDueTime({ metadata: { due_time: "23:59" } })).toBe("23:59");
  });

  it("retorna null si metadata es null o vacío", () => {
    expect(getDueTime({ metadata: null })).toBeNull();
    expect(getDueTime({ metadata: {} })).toBeNull();
    expect(getDueTime({})).toBeNull();
  });

  it("rechaza formatos inválidos", () => {
    expect(getDueTime({ metadata: { due_time: "15:0" } })).toBeNull();
    expect(getDueTime({ metadata: { due_time: "9:30" } })).toBeNull();
    expect(getDueTime({ metadata: { due_time: "15:00:00" } })).toBeNull();
    expect(getDueTime({ metadata: { due_time: 1500 } })).toBeNull();
    expect(getDueTime({ metadata: { due_time: "" } })).toBeNull();
  });

  it("preserva otros campos de metadata sin tocarlos", () => {
    const row = { metadata: { due_time: "10:00", recurring_instance_key: "tpl:2026-05-01" } };
    expect(getDueTime(row)).toBe("10:00");
  });
});

describe("formatDueDate", () => {
  it("formatea YYYY-MM-DD como DD/MM/YYYY", () => {
    expect(formatDueDate("2026-05-22")).toBe("22/05/2026");
    expect(formatDueDate("2026-01-01")).toBe("01/01/2026");
    expect(formatDueDate("2025-12-31")).toBe("31/12/2025");
  });

  it("retorna el input sin cambios si no tiene el formato esperado", () => {
    expect(formatDueDate("invalid")).toBe("invalid");
  });
});

describe("formatDueWithTime", () => {
  it("muestra solo fecha si no hay hora", () => {
    expect(formatDueWithTime("2026-05-22")).toBe("22/05/2026");
    expect(formatDueWithTime("2026-05-22", null)).toBe("22/05/2026");
    expect(formatDueWithTime("2026-05-22", undefined)).toBe("22/05/2026");
  });

  it("muestra fecha + hora separados por ·", () => {
    expect(formatDueWithTime("2026-05-22", "15:00")).toBe("22/05/2026 · 15:00");
    expect(formatDueWithTime("2026-05-22", "09:30")).toBe("22/05/2026 · 09:30");
  });
});

describe("buildMetaWithDueTime", () => {
  it("agrega due_time a metadata vacía", () => {
    const result = buildMetaWithDueTime(null, "15:00");
    expect(result).toEqual({ due_time: "15:00" });
  });

  it("merges con metadata existente sin pisar otros campos", () => {
    const existing = { recurring_instance_key: "tpl:2026-05-01", other: 42 };
    const result = buildMetaWithDueTime(existing, "10:30");
    expect(result).toEqual({ recurring_instance_key: "tpl:2026-05-01", other: 42, due_time: "10:30" });
  });

  it("elimina due_time cuando se pasa null", () => {
    const existing = { due_time: "15:00", recurring_instance_key: "tpl:2026-05-01" };
    const result = buildMetaWithDueTime(existing, null);
    expect(result).toEqual({ recurring_instance_key: "tpl:2026-05-01" });
    expect(result).not.toHaveProperty("due_time");
  });

  it("retorna null si metadata queda vacía al limpiar due_time", () => {
    const existing = { due_time: "15:00" };
    expect(buildMetaWithDueTime(existing, null)).toBeNull();
    expect(buildMetaWithDueTime(null, null)).toBeNull();
  });

  it("retorna null si dueTime es string vacío (tratado como null por el caller)", () => {
    expect(buildMetaWithDueTime(null, null)).toBeNull();
  });
});

describe("buildDueStatusLabelWithTime", () => {
  const TODAY = "2026-05-22";

  it("pagado → Pagado independiente de hora", () => {
    expect(buildDueStatusLabelWithTime("paid", TODAY, TODAY, "15:00", "10:00")).toBe("Pagado");
  });

  it("cancelado → Cancelado independiente de hora", () => {
    expect(buildDueStatusLabelWithTime("cancelled", TODAY, TODAY, "15:00", "10:00")).toBe("Cancelado");
  });

  it("vence hoy con hora futura → Vence hoy · HH:MM", () => {
    expect(buildDueStatusLabelWithTime("planned", TODAY, TODAY, "15:00", "14:30")).toBe("Vence hoy · 15:00");
    expect(buildDueStatusLabelWithTime("planned", TODAY, TODAY, "23:59", "10:00")).toBe("Vence hoy · 23:59");
  });

  it("vence hoy con hora ya pasada → Vencido hoy · HH:MM", () => {
    expect(buildDueStatusLabelWithTime("planned", TODAY, TODAY, "14:00", "14:30")).toBe("Vencido hoy · 14:00");
    expect(buildDueStatusLabelWithTime("planned", TODAY, TODAY, "14:30", "14:30")).toBe("Vencido hoy · 14:30");
  });

  it("vence hoy pero sin hora → usa label normal del estado", () => {
    expect(buildDueStatusLabelWithTime("planned", TODAY, TODAY, null, "14:30")).toBe("Pendiente");
    expect(buildDueStatusLabelWithTime("overdue", TODAY, TODAY, null, "14:30")).toBe("Vencido");
  });

  it("fecha distinta de hoy → usa label normal del estado", () => {
    expect(buildDueStatusLabelWithTime("planned", "2026-06-01", TODAY, "15:00", "14:30")).toBe("Pendiente");
    expect(buildDueStatusLabelWithTime("overdue", "2026-05-10", TODAY, "08:00", "14:30")).toBe("Vencido");
  });
});
