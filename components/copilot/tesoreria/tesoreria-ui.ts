export const TESORERIA_FIELD_CLASS =
  "w-full rounded-xl border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]";

/** Selects y filtros — fondo sólido y borde visible. */
export const TESORERIA_SELECT_CLASS =
  "w-full rounded-xl border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-3 py-2 text-sm font-medium text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

export const TESORERIA_TABLE_CLASS =
  "w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm";

export const TESORERIA_TH_CLASS =
  "sticky top-0 z-10 border-b border-[var(--copilot-border)] bg-[var(--copilot-table-header-bg)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] backdrop-blur";

export const TESORERIA_TD_CLASS =
  "border-b border-[var(--copilot-border)] px-3 py-1.5 align-middle text-sm text-[var(--copilot-ink)]";

/** Filtros tipo pill — tabs y chips de tesorería. */
export const TESORERIA_FILTER_CHIP_ACTIVE =
  "bg-[var(--copilot-accent)] text-[var(--copilot-on-accent)] shadow-sm";
export const TESORERIA_FILTER_CHIP_IDLE =
  "border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] text-[var(--copilot-ink)] shadow-sm hover:border-[var(--copilot-accent)]/40 hover:bg-[var(--copilot-accent-soft)]";

export const TESORERIA_PAGE_SIZE = 15;

/** Labels unificados — formularios Pagos próximos / recurrentes. */
export const TESORERIA_FORM_LABEL_CLASS =
  "mb-1 block text-sm font-medium text-[var(--copilot-ink)]";

export const TESORERIA_PAYMENT_FIELD = {
  concepto: "Concepto",
  categoria: "Categoría",
  moneda: "Moneda",
  monto: "Monto",
  vencimiento: "Vencimiento",
} as const;

export type TesoreriaSection =
  // Nuevas tabs principales (Fase 2)
  | "caja"
  | "programados"
  | "movimientos"
  | "cobranza"
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
  { id: "cobranza", label: "Cobranza del mes" },
];

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
