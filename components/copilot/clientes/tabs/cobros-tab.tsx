"use client";

import { CopilotBadge, CopilotCard } from "@/components/copilot/copilot-ui";
import type { Client360ReceiptRow } from "@/lib/copilot-client-360";

import { formatDateShort, translateReceiptStatus } from "../client-360-format";

export function CobrosTab({ receipts }: { receipts: Client360ReceiptRow[] }) {
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">
          Cobros
          {receipts.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-[var(--copilot-ink-muted)]">
              ({receipts.length})
            </span>
          ) : null}
        </p>
      </div>
      <CopilotCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[var(--copilot-table-header-bg)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Importe</th>
                <th className="px-4 py-2.5">Medio de pago</th>
                <th className="px-4 py-2.5">Referencia</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-[var(--copilot-ink-muted)]">
                    Sin cobros en el historial. Los pagos aparecen acá al sincronizar desde Zeta.
                  </td>
                </tr>
              ) : (
                receipts.map((r, i) => (
                  <tr
                    key={r.id}
                    className={i % 2 === 0 ? "bg-[var(--copilot-card)]" : "bg-[var(--copilot-soft-bg)]"}
                  >
                    <td className="px-4 py-2.5">{formatDateShort(r.receipt_date)}</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium">
                      {`$ ${r.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--copilot-ink-muted)]">{r.medio ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--copilot-ink-muted)]">{r.referencia ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <CopilotBadge tone={r.estado === "paid" ? "success" : "neutral"}>
                        {translateReceiptStatus(r.estado)}
                      </CopilotBadge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CopilotCard>
    </div>
  );
}
