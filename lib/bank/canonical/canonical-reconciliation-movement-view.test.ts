import { describe, expect, it } from "vitest";

import {
  buildCanonicalReconciliationMovementView,
  deriveInvoiceContextKind,
  invoiceContextLabel,
  receiptLabelFromView,
  type CanonicalReceiptCandidate,
} from "@/lib/bank/canonical/canonical-reconciliation-movement-view";

/**
 * FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — única fuente de
 * verdad del estado operativo de un movimiento en Conciliación. Contrato
 * central: mientras `loadingState === "loading"` NUNCA se afirma "falta
 * recibo" ni "no hay recibo" — el mensaje es siempre neutro/"cargando".
 * `canConfirmWithReceipt` exige un `receiptCandidate.receiptId` concreto.
 */

const RECEIPT: CanonicalReceiptCandidate = {
  receiptId: "receipt-1",
  amount: 1500,
  currency: "UYU",
  date: "2026-07-01",
};

const BASE_INPUT = {
  movementId: "mov-1",
  date: "2026-07-01",
  amount: 1500,
  currency: "UYU",
  direction: "inflow" as const,
  clientId: "client-1",
  clientName: "Cliente Uno",
};

describe("buildCanonicalReconciliationMovementView — loading state honesty", () => {
  it("nunca dice 'falta recibo' ni 'sin recibo' mientras loading, incluso sin evidencia", () => {
    const view = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "loading",
      hasCompatibleReceipt: false,
      receiptCandidate: null,
    });
    expect(view.statusLabel.toLowerCase()).not.toContain("falta recibo");
    expect(view.statusLabel.toLowerCase()).not.toContain("sin recibo");
    expect(view.statusLabel).toBe("Cargando evidencia…");
    expect(view.recommendedAction).toBe("ninguna");
  });

  it("receiptLabelFromView también respeta la honestidad durante loading", () => {
    const view = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "loading",
      hasCompatibleReceipt: false,
    });
    expect(receiptLabelFromView(view)).toBe("Cargando evidencia…");
  });

  it("loading con cliente identificado no promete 'listo' ni 'falta'", () => {
    const view = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "loading",
      hasCompatibleReceipt: true,
      receiptCandidate: RECEIPT,
    });
    expect(view.status).toBe("cliente_identificado");
    expect(view.canConfirmWithReceipt).toBe(false);
  });
});

describe("buildCanonicalReconciliationMovementView — canConfirmWithReceipt", () => {
  it("requiere receiptCandidate.receiptId concreto, no alcanza con hasCompatibleReceipt", () => {
    const view = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "ready",
      hasCompatibleReceipt: true,
      receiptCandidate: null,
    });
    expect(view.canConfirmWithReceipt).toBe(false);
    expect(view.warnings.length).toBeGreaterThan(0);
  });

  it("true cuando ready + cliente + receiptCandidate con receiptId/currency/amount válidos", () => {
    const view = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "ready",
      hasCompatibleReceipt: true,
      receiptCandidate: RECEIPT,
    });
    expect(view.canConfirmWithReceipt).toBe(true);
    expect(view.status).toBe("listo_para_confirmar");
  });

  it("false si está duplicado, oculto, o sin cliente aunque haya receiptCandidate", () => {
    const duplicated = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "ready",
      isDuplicate: true,
      receiptCandidate: RECEIPT,
    });
    expect(duplicated.canConfirmWithReceipt).toBe(false);

    const hidden = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "ready",
      isHidden: true,
      receiptCandidate: RECEIPT,
    });
    expect(hidden.canConfirmWithReceipt).toBe(false);

    const noClient = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      clientId: null,
      loadingState: "ready",
      receiptCandidate: RECEIPT,
    });
    expect(noClient.canConfirmWithReceipt).toBe(false);
  });

  it("false mientras loadingState === 'error'", () => {
    const view = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "error",
      receiptCandidate: RECEIPT,
    });
    expect(view.canConfirmWithReceipt).toBe(false);
  });
});

describe("buildCanonicalReconciliationMovementView — varios recibos", () => {
  it("receiptCandidatesCount > 1 produce status 'varios_recibos'", () => {
    const view = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "ready",
      receiptCandidate: RECEIPT,
      receiptCandidatesCount: 3,
    });
    expect(view.status).toBe("varios_recibos");
    expect(view.recommendedAction).toBe("revisar_opciones");
    expect(receiptLabelFromView(view)).toBe("Varios recibos posibles");
  });
});

describe("buildCanonicalReconciliationMovementView — falta_recibo honesto solo cuando ready", () => {
  it("cliente identificado, ready, sin recibo compatible → falta_recibo", () => {
    const view = buildCanonicalReconciliationMovementView({
      ...BASE_INPUT,
      loadingState: "ready",
      hasCompatibleReceipt: false,
      receiptCandidate: null,
    });
    expect(view.status).toBe("falta_recibo");
    expect(view.statusLabel).toBe("Falta recibo en Zeta");
    expect(receiptLabelFromView(view)).toBe("Falta recibo en Zeta");
  });
});

describe("deriveInvoiceContextKind / invoiceContextLabel", () => {
  it("full_reconciliation → factura_comprobada", () => {
    expect(
      deriveInvoiceContextKind({ level: "full_reconciliation", hasCompatibleReceipt: true, hasFinancialLink: true })
    ).toBe("factura_comprobada");
  });

  it("reconciled_with_receipt → aplicacion_no_disponible_api (Zeta no informa la factura aplicada)", () => {
    const kind = deriveInvoiceContextKind({
      level: "reconciled_with_receipt",
      hasCompatibleReceipt: true,
      hasFinancialLink: true,
    });
    expect(kind).toBe("aplicacion_no_disponible_api");
    expect(invoiceContextLabel(kind)).toBe(
      "Zeta no informa por API qué factura fue aplicada por este recibo."
    );
  });

  it("link financiero + recibo compatible sin nivel especial → factura_compatible", () => {
    expect(
      deriveInvoiceContextKind({ level: null, hasCompatibleReceipt: true, hasFinancialLink: true })
    ).toBe("factura_compatible");
  });

  it("recibo compatible sin link financiero → factura_pendiente", () => {
    expect(
      deriveInvoiceContextKind({ level: null, hasCompatibleReceipt: true, hasFinancialLink: false })
    ).toBe("factura_pendiente");
  });

  it("sin recibo ni link → sin_factura_relacionada", () => {
    expect(
      deriveInvoiceContextKind({ level: null, hasCompatibleReceipt: false, hasFinancialLink: false })
    ).toBe("sin_factura_relacionada");
  });
});
