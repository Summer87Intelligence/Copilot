/** Tipos del módulo Mesa de ayuda (helpdesk). */

export const HELPDESK_TICKET_TYPES = [
  "suggestion",
  "bug",
  "improvement",
  "question",
  "design_change",
  "feature",
  "other",
] as const;

export type HelpdeskTicketType = (typeof HELPDESK_TICKET_TYPES)[number];

export const HELPDESK_TICKET_TYPE_LABELS: Record<HelpdeskTicketType, string> = {
  suggestion: "Sugerencia",
  bug: "Bug / Error",
  improvement: "Mejora",
  question: "Consulta",
  design_change: "Cambio de diseño",
  feature: "Nueva funcionalidad",
  other: "Otro",
};

export const HELPDESK_MODULE_KEYS = [
  "hoy",
  "dashboard",
  "finanzas",
  "cartera",
  "cobranza",
  "tesoreria",
  "clientes",
  "reportes",
  "admin",
  "manual",
  "other",
] as const;

export type HelpdeskModuleKey = (typeof HELPDESK_MODULE_KEYS)[number];

export const HELPDESK_MODULE_KEY_LABELS: Record<HelpdeskModuleKey, string> = {
  hoy: "Hoy",
  dashboard: "Dashboard",
  finanzas: "Finanzas",
  cartera: "Cartera",
  cobranza: "Cobranza",
  tesoreria: "Tesorería",
  clientes: "Clientes",
  reportes: "Reportes",
  admin: "Admin",
  manual: "Manual",
  other: "Otro",
};

/** Rutas de navegación por module_key. Solo los módulos con ruta activa. */
export const HELPDESK_MODULE_ROUTES: Partial<Record<HelpdeskModuleKey, string>> = {
  hoy: "/copilot/hoy",
  dashboard: "/copilot/dashboard",
  finanzas: "/copilot/finanzas",
  cartera: "/copilot/cartera",
  cobranza: "/copilot/cobranza",
  tesoreria: "/copilot/tesoreria",
  clientes: "/copilot/clientes",
  reportes: "/copilot/reportes",
  admin: "/copilot/admin",
  manual: "/copilot/manual",
};

/** Devuelve la ruta del módulo o null si no tiene ruta conocida (ej: "other"). */
export function getHelpdeskModuleRoute(moduleKey: HelpdeskModuleKey | null | undefined): string | null {
  if (!moduleKey) return null;
  return HELPDESK_MODULE_ROUTES[moduleKey] ?? null;
}

export const HELPDESK_PRIORITIES = ["low", "medium", "high"] as const;
export type HelpdeskPriority = (typeof HELPDESK_PRIORITIES)[number];

export const HELPDESK_PRIORITY_LABELS: Record<HelpdeskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export const HELPDESK_STATUSES = [
  "new",
  "reviewing",
  "approved",
  "planned",
  "in_progress",
  "resolved",
  "published",
  "rejected",
] as const;

export type HelpdeskStatus = (typeof HELPDESK_STATUSES)[number];

export const HELPDESK_STATUS_LABELS: Record<HelpdeskStatus, string> = {
  new: "Nuevo",
  reviewing: "En revisión",
  approved: "Aprobado",
  planned: "Planificado",
  in_progress: "En desarrollo",
  resolved: "Resuelto",
  published: "Publicado",
  rejected: "Rechazado",
};

export type HelpdeskTicket = {
  id: string;
  workspace_company_id: string;
  created_by: string;
  assigned_to: string | null;
  title: string;
  description: string;
  type: HelpdeskTicketType;
  module_key: HelpdeskModuleKey | null;
  priority: HelpdeskPriority;
  status: HelpdeskStatus;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  /** Nombre del creador (join desde app_users) */
  created_by_name?: string;
  /** Nombre del asignado (join desde app_users) */
  assigned_to_name?: string;
  /** Conteo de comentarios */
  comment_count?: number;
  /** Conteo de adjuntos */
  attachment_count?: number;
};

export type HelpdeskComment = {
  id: string;
  ticket_id: string;
  workspace_company_id: string;
  created_by: string;
  body: string;
  created_at: string;
  created_by_name?: string;
};

export type HelpdeskAttachment = {
  id: string;
  ticket_id: string;
  workspace_company_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size_bytes: number | null;
  created_at: string;
  uploaded_by_name?: string;
};

export type HelpdeskCreateTicketInput = {
  title: string;
  description: string;
  type: HelpdeskTicketType;
  module_key?: HelpdeskModuleKey | null;
  priority: HelpdeskPriority;
};

export type HelpdeskUpdateTicketInput = {
  status?: HelpdeskStatus;
  assigned_to?: string | null;
  priority?: HelpdeskPriority;
  resolution_note?: string | null;
};

export type HelpdeskCreateCommentInput = {
  body: string;
};

export function isValidTicketType(v: unknown): v is HelpdeskTicketType {
  return (
    typeof v === "string" &&
    (HELPDESK_TICKET_TYPES as readonly string[]).includes(v)
  );
}

export function isValidPriority(v: unknown): v is HelpdeskPriority {
  return (
    typeof v === "string" && (HELPDESK_PRIORITIES as readonly string[]).includes(v)
  );
}

export function isValidStatus(v: unknown): v is HelpdeskStatus {
  return (
    typeof v === "string" && (HELPDESK_STATUSES as readonly string[]).includes(v)
  );
}

export function isValidModuleKey(v: unknown): v is HelpdeskModuleKey {
  return (
    typeof v === "string" &&
    (HELPDESK_MODULE_KEYS as readonly string[]).includes(v)
  );
}
