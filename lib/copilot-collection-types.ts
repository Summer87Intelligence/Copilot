// ---------------------------------------------------------------------------
// Collection Operations — tipos de dominio
// Capa operativa de cobranza: NO modifica datos financieros.
// ---------------------------------------------------------------------------

export const COLLECTION_STATUSES = [
  "pending_review",
  "contacted",
  "promised_payment",
  "paid",
  "disputed",
  "escalated",
  "paused",
] as const;

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export const COLLECTION_ACTION_TYPES = [
  "call",
  "whatsapp",
  "email",
  "meeting",
  "internal_note",
  "payment_promise",
  "dispute",
  "escalation",
] as const;

export type CollectionActionType = (typeof COLLECTION_ACTION_TYPES)[number];

export const COLLECTION_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type CollectionPriority = (typeof COLLECTION_PRIORITIES)[number];

export type CollectionCurrency = "UYU" | "USD";

// ---------------------------------------------------------------------------
// Entidad principal
// ---------------------------------------------------------------------------

export type CollectionAction = {
  id: string;
  workspaceCompanyId: string;
  companyId: string;
  status: CollectionStatus;
  actionType: CollectionActionType;
  priority: CollectionPriority;
  assignedTo: string | null;
  createdBy: string | null;
  dueDate: string | null;
  contactDate: string | null;
  nextActionDate: string | null;
  promiseDate: string | null;
  promiseAmount: number | null;
  promiseCurrency: CollectionCurrency | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Input / Patch
// ---------------------------------------------------------------------------

export type CollectionActionInput = {
  companyId: string;
  status?: CollectionStatus;
  actionType: CollectionActionType;
  priority?: CollectionPriority;
  assignedTo?: string | null;
  createdBy?: string | null;
  dueDate?: string | null;
  contactDate?: string | null;
  nextActionDate?: string | null;
  promiseDate?: string | null;
  promiseAmount?: number | null;
  promiseCurrency?: CollectionCurrency | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CollectionActionPatch = Partial<Omit<CollectionActionInput, "companyId">>;

// ---------------------------------------------------------------------------
// Derivados (render-only, sin recálculo de deuda)
// ---------------------------------------------------------------------------

/** Resumen operativo de cobranza para un cliente — calculado desde sus acciones. */
export type ClientCollectionSummary = {
  companyId: string;
  /** null si no hay ninguna acción activa registrada */
  latestAction: CollectionAction | null;
  /** 'no_action' si el cliente no tiene acciones registradas */
  collectionStatus: CollectionStatus | "no_action";
  priority: CollectionPriority | null;
  nextActionDate: string | null;
  lastContactDate: string | null;
  /** true si hay una promesa de pago vencida sin status 'paid' */
  hasOverduePromise: boolean;
  /** true si el último contacto fue hace más de 30 días */
  isStale: boolean;
};

/** Timeline completo de acciones para un cliente, orden desc por created_at. */
export type ClientCollectionTimeline = {
  companyId: string;
  actions: CollectionAction[];
};

// ---------------------------------------------------------------------------
// API routes (constantes de paths)
// ---------------------------------------------------------------------------

export const COLLECTION_API = {
  create: "/api/copilot/data/collection-actions/create",
  update: (id: string) => `/api/copilot/data/collection-actions/${id}/update`,
  archive: (id: string) => `/api/copilot/data/collection-actions/${id}/archive`,
  listByCompany: (companyId: string) =>
    `/api/copilot/collection-actions?company_id=${encodeURIComponent(companyId)}`,
  list: "/api/copilot/collection-actions",
  batch: "/api/copilot/collection-actions/batch",
} as const;

// ---------------------------------------------------------------------------
// Labels UI
// ---------------------------------------------------------------------------

export const COLLECTION_STATUS_LABELS: Record<CollectionStatus | "no_action", string> = {
  no_action: "Sin acción",
  pending_review: "Pendiente revisión",
  contacted: "Contactado",
  promised_payment: "Promesa de pago",
  paid: "Pagado",
  disputed: "En disputa",
  escalated: "Escalado",
  paused: "Pausado",
};

export const COLLECTION_ACTION_TYPE_LABELS: Record<CollectionActionType, string> = {
  call: "Llamada",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Reunión",
  internal_note: "Nota interna",
  payment_promise: "Promesa de pago",
  dispute: "Disputa",
  escalation: "Escalación",
};

export const COLLECTION_PRIORITY_LABELS: Record<CollectionPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};
