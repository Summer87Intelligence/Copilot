export const TESORERIA_FIELD_CLASS =
  "w-full rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2 text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]";

export const TESORERIA_TABLE_CLASS =
  "w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm";

export const TESORERIA_TH_CLASS =
  "sticky top-0 z-10 border-b border-[var(--copilot-border)] bg-[var(--copilot-table-header-bg)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] backdrop-blur";

export const TESORERIA_TD_CLASS =
  "border-b border-[var(--copilot-border)] px-3 py-2 align-middle text-sm text-[var(--copilot-ink)]";

export const TESORERIA_PAGE_SIZE = 10;

export type TesoreriaSection =
  // Nuevas tabs principales (Fase 2)
  | "caja"
  | "programados"
  | "movimientos"
  | "avanzado"
  // Secciones legacy (mantenidas para backward-compat por URL aliases)
  | "resumen"
  | "pagos"
  | "manual"
  | "recurring"
  | "bank"
  | "accounts"
  | "opening";

/** Aliases para URL params viejos → nuevas secciones. */
export const TESORERIA_SECTION_ALIASES: Record<string, TesoreriaSection> = {
  dashboard: "caja",
  resumen: "caja",
  pagos: "programados",
  "pagos-proximos": "programados",
  manual: "movimientos",
  obligations: "programados",
  santander: "movimientos",
  bank: "movimientos",
  recurring: "programados",
  accounts: "movimientos",
  opening: "caja",
  avanzado: "movimientos",
};

/** Tabs operativas principales — vista simple. */
export const TESORERIA_SECTIONS_MAIN: { id: TesoreriaSection; label: string }[] = [
  { id: "caja", label: "Caja" },
  { id: "programados", label: "Pagos próximos" },
  { id: "movimientos", label: "Movimientos" },
];

/** Secciones de configuración legacy — ya no aparecen en nav principal. */
export const TESORERIA_SECTIONS_CONFIG: { id: TesoreriaSection; label: string }[] = [];

/** Todas las secciones (para parseo de URL). */
export const TESORERIA_SECTIONS: { id: TesoreriaSection; label: string }[] = [
  ...TESORERIA_SECTIONS_MAIN,
  { id: "resumen", label: "Resumen" },
  { id: "pagos", label: "Pagos" },
  { id: "manual", label: "Caja manual" },
  { id: "recurring", label: "Recurrentes" },
  { id: "bank", label: "Conciliación" },
  { id: "accounts", label: "Cuentas" },
  { id: "opening", label: "Saldos iniciales" },
];

/** Secciones donde se muestra la barra de filtro de fecha/moneda (legacy). */
export const TESORERIA_SECTIONS_WITH_CONTROL_BAR = new Set<TesoreriaSection>([
  "pagos",
  "manual",
  "bank",
]);
