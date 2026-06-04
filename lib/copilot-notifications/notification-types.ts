export const NOTIFICATION_TYPES = [
  "collection_received",
  "new_debtor",
  "client_overdue",
  "debt_followup_summary",
  "treasury_payment_due",
  "treasury_payment_overdue",
  "sync_changes_detected",
  "cash_risk_detected",
  "sync_failed",
  "copilot_action_suggested",
  "notification_digest",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationSeverity = "info" | "warning" | "critical";

export type CopilotNotification = {
  id: string;
  workspace_company_id: string;
  type: NotificationType | string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  amount: number | null;
  currency: string | null;
  action_href: string | null;
  dedup_key: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type CreateNotificationInput = {
  type: NotificationType | string;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  action_href?: string | null;
  dedup_key?: string | null;
  metadata?: Record<string, unknown>;
};

export type NotificationListResponse = {
  ok: boolean;
  notifications: CopilotNotification[];
  unreadCount: number;
};
