import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import type { DataRow } from "@/lib/copilot-data";

function rowNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isOpenInvoiceRow(row: DataRow): boolean {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid" || st === "cancelled") return false;
  return rowNum(row.balance_amount) > 0;
}

export function InvoiceOperationalCallout({ row }: { row: DataRow }) {
  const open = isOpenInvoiceRow(row);
  return (
    <div
      className={
        open
          ? "rounded-xl border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)]/90 px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]"
          : "rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-3 py-2 text-xs text-[var(--copilot-ink)]"
      }
    >
      <p className="font-semibold">
        {open ? FINANCIAL_UX_COPY.invoiceOpenTitle : FINANCIAL_UX_COPY.sourceInfoTitle}
      </p>
      <p className={open ? "mt-1" : "mt-1 text-[var(--copilot-ink-muted)]"}>
        {open ? FINANCIAL_UX_COPY.invoiceOpenBody : FINANCIAL_UX_COPY.sourceInfoBody}
      </p>
    </div>
  );
}
