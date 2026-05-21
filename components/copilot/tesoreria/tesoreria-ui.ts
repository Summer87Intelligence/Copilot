export const TESORERIA_FIELD_CLASS =
  "w-full rounded-xl border border-[var(--copilot-border)] bg-white/70 px-3 py-2 text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20 disabled:opacity-50";

export const TESORERIA_TABLE_CLASS =
  "w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm";

export const TESORERIA_TH_CLASS =
  "sticky top-0 z-10 border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.92)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] backdrop-blur";

export const TESORERIA_TD_CLASS =
  "border-b border-[var(--copilot-border)] px-3 py-2 align-middle text-sm text-[var(--copilot-ink)]";

export const TESORERIA_PAGE_SIZE = 10;

export type TesoreriaSection =
  | "dashboard"
  | "accounts"
  | "opening"
  | "manual"
  | "bank"
  | "obligations";

export const TESORERIA_SECTIONS: { id: TesoreriaSection; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "accounts", label: "Cuentas" },
  { id: "opening", label: "Saldos iniciales" },
  { id: "manual", label: "Caja manual" },
  { id: "bank", label: "Conciliación Santander" },
  { id: "obligations", label: "Pagos futuros" },
];
