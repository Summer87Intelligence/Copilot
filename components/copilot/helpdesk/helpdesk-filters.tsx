"use client";

import {
  HELPDESK_STATUSES,
  HELPDESK_STATUS_LABELS,
  HELPDESK_PRIORITIES,
  HELPDESK_PRIORITY_LABELS,
  HELPDESK_TICKET_TYPES,
  HELPDESK_TICKET_TYPE_LABELS,
  HELPDESK_MODULE_KEYS,
  HELPDESK_MODULE_KEY_LABELS,
  type HelpdeskStatus,
  type HelpdeskPriority,
  type HelpdeskTicketType,
  type HelpdeskModuleKey,
} from "@/lib/helpdesk-types";

export type HelpdeskFiltersState = {
  status: HelpdeskStatus | "all";
  priority: HelpdeskPriority | "all";
  type: HelpdeskTicketType | "all";
  module_key: HelpdeskModuleKey | "all";
};

type Props = {
  filters: HelpdeskFiltersState;
  isAdmin: boolean;
  onChange: (f: HelpdeskFiltersState) => void;
};

const selectClass =
  "rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-1.5 text-sm text-[var(--copilot-text)] focus:outline-none focus:ring-2 focus:ring-blue-500";

export function HelpdeskFilters({ filters, isAdmin, onChange }: Props) {
  const set = <K extends keyof HelpdeskFiltersState>(key: K, value: HelpdeskFiltersState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap gap-2">
      <select
        className={selectClass}
        value={filters.status}
        onChange={(e) => set("status", e.target.value as HelpdeskFiltersState["status"])}
        aria-label="Filtrar por estado"
      >
        <option value="all">Todos los estados</option>
        {HELPDESK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {HELPDESK_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {isAdmin && (
        <>
          <select
            className={selectClass}
            value={filters.priority}
            onChange={(e) => set("priority", e.target.value as HelpdeskFiltersState["priority"])}
            aria-label="Filtrar por prioridad"
          >
            <option value="all">Todas las prioridades</option>
            {HELPDESK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {HELPDESK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>

          <select
            className={selectClass}
            value={filters.type}
            onChange={(e) => set("type", e.target.value as HelpdeskFiltersState["type"])}
            aria-label="Filtrar por tipo"
          >
            <option value="all">Todos los tipos</option>
            {HELPDESK_TICKET_TYPES.map((t) => (
              <option key={t} value={t}>
                {HELPDESK_TICKET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          <select
            className={selectClass}
            value={filters.module_key}
            onChange={(e) => set("module_key", e.target.value as HelpdeskFiltersState["module_key"])}
            aria-label="Filtrar por módulo"
          >
            <option value="all">Todos los módulos</option>
            {HELPDESK_MODULE_KEYS.map((m) => (
              <option key={m} value={m}>
                {HELPDESK_MODULE_KEY_LABELS[m]}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
