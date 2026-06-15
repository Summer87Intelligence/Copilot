import type { ProtoDocument } from "@/lib/copilot-documents-data";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";

/** Tipos documentales usados en seeds / convención Copilot (fiscal). */
export const FISCAL_DOCUMENT_TYPES = {
  declaration: "dj_fiscal",
  paymentProof: "comprobante_pago_fiscal",
} as const;

/**
 * Campos mínimos de obligación para reglas documentales (evita acoplar al tipo completo).
 */
export type ObligationDocContext = {
  id: string;
  due_date: string;
  status: string;
};

export type ObligationDocumentStatus = {
  hasDeclaration: boolean;
  hasPaymentProof: boolean;
  /** Estado inferido solo con documentos + status de obligación (reglas, sin IA). */
  inferredStatus: "pending" | "filed" | "paid";
};

export type ObligationDocumentRisk = "low" | "medium" | "high";

export type FiscalAlertPriorityLevel = "critical" | "high" | "medium";

/**
 * @deprecated CLIENT-DEBT-SEMANTICS-001 Etapa D: alias a `todayYmdMontevideo`.
 */
function localTodayYmd(): string {
  return todayYmdMontevideo();
}

function normType(t: string): string {
  return t.trim().toLowerCase();
}

/**
 * ¿Existe al menos un documento de un tipo dado? Comparación case-insensitive;
 * también acepta si `document_type` contiene el substring (p. ej. `dj_fiscal_v2`).
 */
export function hasDocumentType(
  documents: readonly ProtoDocument[],
  type: string
): boolean {
  const want = normType(type);
  if (!want) return false;
  return documents.some((d) => {
    const dt = normType(d.document_type);
    return dt === want || dt.includes(want);
  });
}

function hasDeclarationDoc(documents: readonly ProtoDocument[]): boolean {
  return (
    hasDocumentType(documents, FISCAL_DOCUMENT_TYPES.declaration) ||
    hasDocumentType(documents, "declaracion")
  );
}

function hasPaymentProofDoc(documents: readonly ProtoDocument[]): boolean {
  return (
    hasDocumentType(documents, FISCAL_DOCUMENT_TYPES.paymentProof) ||
    hasDocumentType(documents, "comprobante_pago") ||
    hasDocumentType(documents, "pago_fiscal")
  );
}

/**
 * Lectura de cobertura documental sobre una obligación fiscal.
 */
export function getObligationDocumentStatus(
  obligation: ObligationDocContext,
  documents: readonly ProtoDocument[]
): ObligationDocumentStatus {
  const st = obligation.status.toLowerCase();
  const paidInSystem = st === "paid";

  const hasDeclaration = hasDeclarationDoc(documents);
  const hasPaymentProof = hasPaymentProofDoc(documents);

  let inferredStatus: ObligationDocumentStatus["inferredStatus"];
  if (paidInSystem || hasPaymentProof) {
    inferredStatus = "paid";
  } else if (hasDeclaration) {
    inferredStatus = "filed";
  } else {
    inferredStatus = "pending";
  }

  return { hasDeclaration, hasPaymentProof, inferredStatus };
}

function isOverdue(obligation: ObligationDocContext, todayYmd: string): boolean {
  const st = obligation.status.toLowerCase();
  if (st === "paid") return false;
  if (st === "overdue") return true;
  const due = obligation.due_date.slice(0, 10);
  return due < todayYmd;
}

function isNearDue(obligation: ObligationDocContext, todayYmd: string): boolean {
  const st = obligation.status.toLowerCase();
  if (st === "paid") return false;
  const due = obligation.due_date.slice(0, 10);
  if (due < todayYmd) return false;
  const t = new Date(todayYmd + "T12:00:00");
  const d = new Date(due + "T12:00:00");
  const diffDays = Math.round((d.getTime() - t.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= 7;
}

/**
 * Riesgo operativo/documental (reglas fijas, sin modelo externo).
 * - Vencida sin documentos → high
 * - Vencida con comprobante de pago → low
 * - Cercana a vencer (≤7 días) → medium
 * - Resto abierto → low
 */
export function getObligationRisk(
  obligation: ObligationDocContext,
  documents: readonly ProtoDocument[]
): ObligationDocumentRisk {
  const todayYmd = localTodayYmd();
  const st = obligation.status.toLowerCase();
  if (st === "paid") return "low";

  const paymentProof = hasPaymentProofDoc(documents);

  if (isOverdue(obligation, todayYmd)) {
    if (paymentProof) return "low";
    if (documents.length === 0) return "high";
    return "medium";
  }

  if (isNearDue(obligation, todayYmd)) {
    return "medium";
  }

  return "low";
}

/**
 * Texto corto para UI / alertas (evidencia documental).
 */
export function getDocumentEvidenceUiLine(
  obligation: ObligationDocContext,
  status: ObligationDocumentStatus
): string {
  if (status.hasPaymentProof) {
    return "Pago registrado (verificado por documento).";
  }
  if (obligation.status.toLowerCase() === "paid") {
    return "Obligación cerrada en sistema; sin comprobante documental vinculado.";
  }
  return "Sin respaldo documental.";
}

/**
 * Ajusta la prioridad de alerta fiscal usando riesgo documental, sin romper el esquema actual.
 * - Riesgo alto: sube un escalón (medium→high, high→critical).
 * - Riesgo bajo con comprobante: baja un escalón (critical→high, high→medium) si aplica.
 */
export function refineFiscalAlertPriorityWithDocuments(
  base: FiscalAlertPriorityLevel | null,
  obligation: ObligationDocContext,
  documents: readonly ProtoDocument[]
): FiscalAlertPriorityLevel | null {
  if (base == null) return null;

  const risk = getObligationRisk(obligation, documents);
  const docStatus = getObligationDocumentStatus(obligation, documents);

  let p = base;

  if (risk === "low" && docStatus.hasPaymentProof) {
    if (p === "critical") p = "high";
    else if (p === "high") p = "medium";
  }

  if (risk === "high") {
    if (p === "medium") p = "high";
    else if (p === "high") p = "critical";
  }

  return p;
}
