/**
 * FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 —
 * Única fuente de verdad para el estado operativo de un movimiento en Conciliación.
 * Pure: no fetch, no side-effects. UI y APIs deben mapear evidencia acá.
 */

export type CanonicalEvidenceLoadState = "loading" | "ready" | "empty" | "error";

export type CanonicalReceiptCandidate = {
  receiptId: string;
  amount: number;
  currency: string;
  date: string | null;
  number?: string | null;
  clientId?: string | null;
};

export type CanonicalInvoiceContextKind =
  | "factura_comprobada"
  | "factura_compatible"
  | "factura_pendiente"
  | "aplicacion_no_disponible_api"
  | "sin_factura_relacionada";

export type CanonicalRecommendedAction =
  | "identificar_cliente"
  | "confirmar_con_recibo"
  | "revisar_opciones"
  | "dejar_pendiente"
  | "ver_conciliacion"
  | "ver_evidencia"
  | "ninguna";

export type CanonicalReconciliationStatus =
  | "sin_cliente"
  | "cliente_identificado"
  | "listo_para_confirmar"
  | "falta_recibo"
  | "varios_recibos"
  | "requiere_revision"
  | "conciliado_con_recibo"
  | "conciliacion_completa"
  | "duplicado"
  | "oculto"
  | "ingreso_no_comercial";

export type CanonicalReconciliationMovementView = {
  movementId: string;
  date: string;
  amount: number;
  currency: string;
  direction: "inflow" | "outflow";
  payerDisplayName: string | null;
  referenceMasked: string | null;
  clientId: string | null;
  clientName: string | null;
  receiptCandidate: CanonicalReceiptCandidate | null;
  receiptCandidatesCount: number;
  invoiceContextKind: CanonicalInvoiceContextKind;
  invoiceContextLabel: string;
  reconciliationLevel: string | null;
  status: CanonicalReconciliationStatus;
  statusLabel: string;
  recommendedAction: CanonicalRecommendedAction;
  recommendedActionLabel: string;
  isDuplicate: boolean;
  isHidden: boolean;
  loadingState: CanonicalEvidenceLoadState;
  errorState: string | null;
  warnings: string[];
  canConfirmWithReceipt: boolean;
};

const INVOICE_LABEL: Record<CanonicalInvoiceContextKind, string> = {
  factura_comprobada: "Factura comprobada",
  factura_compatible: "Factura compatible",
  factura_pendiente: "Factura pendiente",
  aplicacion_no_disponible_api:
    "Zeta no informa por API qué factura fue aplicada por este recibo.",
  sin_factura_relacionada: "Sin factura relacionada",
};

const STATUS_LABEL: Record<CanonicalReconciliationStatus, string> = {
  sin_cliente: "Sin cliente",
  cliente_identificado: "Cliente identificado",
  listo_para_confirmar: "Listo para confirmar",
  falta_recibo: "Falta recibo en Zeta",
  varios_recibos: "Varios recibos posibles",
  requiere_revision: "Requiere revisión",
  conciliado_con_recibo: "Conciliado con recibo",
  conciliacion_completa: "Conciliación completa",
  duplicado: "Duplicado",
  oculto: "Oculto",
  ingreso_no_comercial: "Ingreso no comercial",
};

const ACTION_LABEL: Record<CanonicalRecommendedAction, string> = {
  identificar_cliente: "Identificar cliente",
  confirmar_con_recibo: "Confirmar con recibo",
  revisar_opciones: "Revisar opciones",
  dejar_pendiente: "Dejar pendiente",
  ver_conciliacion: "Ver conciliación",
  ver_evidencia: "Ver evidencia",
  ninguna: "—",
};

export function invoiceContextLabel(kind: CanonicalInvoiceContextKind): string {
  return INVOICE_LABEL[kind];
}

export function deriveInvoiceContextKind(input: {
  level: string | null | undefined;
  hasCompatibleReceipt: boolean;
  hasFinancialLink: boolean;
}): CanonicalInvoiceContextKind {
  if (input.level === "full_reconciliation") return "factura_comprobada";
  if (input.level === "reconciled_with_receipt") return "aplicacion_no_disponible_api";
  if (input.hasFinancialLink && input.hasCompatibleReceipt) return "factura_compatible";
  if (input.hasCompatibleReceipt) return "factura_pendiente";
  return "sin_factura_relacionada";
}

export function buildCanonicalReconciliationMovementView(input: {
  movementId: string;
  date: string;
  amount: number;
  currency: string;
  direction?: "inflow" | "outflow";
  payerDisplayName?: string | null;
  referenceMasked?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  receiptCandidate?: CanonicalReceiptCandidate | null;
  receiptCandidatesCount?: number;
  level?: string | null;
  hasCompatibleReceipt?: boolean;
  hasFinancialLink?: boolean;
  isDuplicate?: boolean;
  isHidden?: boolean;
  loadingState?: CanonicalEvidenceLoadState;
  errorState?: string | null;
  evidenceAmbiguous?: boolean;
  warnings?: string[];
}): CanonicalReconciliationMovementView {
  const loadingState = input.loadingState ?? "ready";
  const isDuplicate = Boolean(input.isDuplicate);
  const isHidden = Boolean(input.isHidden);
  const clientId = input.clientId ?? null;
  const receiptCandidatesCount = input.receiptCandidatesCount ?? (input.receiptCandidate ? 1 : 0);
  const hasCompatibleReceipt =
    Boolean(input.hasCompatibleReceipt) || Boolean(input.receiptCandidate) || receiptCandidatesCount > 0;
  const hasFinancialLink = Boolean(input.hasFinancialLink);
  const level = input.level ?? null;

  const invoiceContextKind = deriveInvoiceContextKind({
    level,
    hasCompatibleReceipt,
    hasFinancialLink,
  });

  let status: CanonicalReconciliationStatus;
  if (loadingState === "loading") {
    status = clientId ? "cliente_identificado" : "sin_cliente";
  } else if (isHidden) {
    status = "oculto";
  } else if (isDuplicate) {
    status = "duplicado";
  } else if (input.direction === "outflow") {
    status = "ingreso_no_comercial";
  } else if (level === "full_reconciliation") {
    status = "conciliacion_completa";
  } else if (level === "reconciled_with_receipt" || hasFinancialLink) {
    status = "conciliado_con_recibo";
  } else if (input.evidenceAmbiguous) {
    status = "requiere_revision";
  } else if (!clientId) {
    status = "sin_cliente";
  } else if (receiptCandidatesCount > 1) {
    status = "varios_recibos";
  } else if (hasCompatibleReceipt && input.receiptCandidate?.receiptId) {
    status = "listo_para_confirmar";
  } else if (hasCompatibleReceipt && loadingState === "ready") {
    // Compatible a nivel cluster pero aún sin receipt_id concreto en evidencia canónica.
    status = "listo_para_confirmar";
  } else if (clientId) {
    status = hasCompatibleReceipt ? "listo_para_confirmar" : "falta_recibo";
  } else {
    status = "sin_cliente";
  }

  // Durante loading no afirmar falta/listo de recibo en la acción.
  let recommendedAction: CanonicalRecommendedAction;
  if (loadingState === "loading") {
    recommendedAction = "ninguna";
  } else if (status === "duplicado") {
    recommendedAction = "ver_evidencia";
  } else if (status === "conciliado_con_recibo" || status === "conciliacion_completa") {
    recommendedAction = "ver_conciliacion";
  } else if (status === "sin_cliente" || status === "requiere_revision") {
    recommendedAction = "identificar_cliente";
  } else if (status === "varios_recibos") {
    recommendedAction = "revisar_opciones";
  } else if (status === "listo_para_confirmar") {
    recommendedAction = "confirmar_con_recibo";
  } else if (status === "falta_recibo") {
    recommendedAction = "dejar_pendiente";
  } else {
    recommendedAction = "ninguna";
  }

  const canConfirmWithReceipt =
    loadingState === "ready" &&
    !isDuplicate &&
    !isHidden &&
    Boolean(clientId) &&
    Boolean(input.receiptCandidate?.receiptId) &&
    Boolean(input.receiptCandidate?.currency) &&
    Number.isFinite(input.receiptCandidate?.amount);

  const warnings = [...(input.warnings ?? [])];
  if (loadingState === "ready" && hasCompatibleReceipt && !input.receiptCandidate?.receiptId) {
    warnings.push("Hay compatibilidad de recibo, pero falta el receipt_id concreto para confirmar.");
  }

  const statusLabel =
    loadingState === "loading"
      ? "Cargando evidencia…"
      : loadingState === "error"
        ? "Error al cargar evidencia"
        : STATUS_LABEL[status];

  return {
    movementId: input.movementId,
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    direction: input.direction ?? "inflow",
    payerDisplayName: input.payerDisplayName ?? null,
    referenceMasked: input.referenceMasked ?? null,
    clientId,
    clientName: input.clientName ?? null,
    receiptCandidate: input.receiptCandidate ?? null,
    receiptCandidatesCount,
    invoiceContextKind,
    invoiceContextLabel: INVOICE_LABEL[invoiceContextKind],
    reconciliationLevel: level,
    status,
    statusLabel,
    recommendedAction,
    recommendedActionLabel: ACTION_LABEL[recommendedAction],
    isDuplicate,
    isHidden,
    loadingState,
    errorState: input.errorState ?? null,
    warnings,
    canConfirmWithReceipt,
  };
}

export function receiptLabelFromView(view: CanonicalReconciliationMovementView): string {
  if (view.loadingState === "loading") return "Cargando evidencia…";
  if (view.loadingState === "error") return "Error al cargar recibo";
  if (view.receiptCandidatesCount > 1) return "Varios recibos posibles";
  if (view.receiptCandidate?.receiptId || view.status === "listo_para_confirmar") {
    return "Recibo encontrado";
  }
  if (view.status === "falta_recibo") return "Falta recibo en Zeta";
  return "Sin recibo";
}
