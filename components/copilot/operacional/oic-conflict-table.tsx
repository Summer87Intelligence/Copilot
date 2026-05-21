import type { OicConflictiveInvoice } from "@/lib/operacional/types";
import { OicSeverityBadge } from "@/components/copilot/operacional/oic-severity-badge";
import { OicEmptyState } from "@/components/copilot/operacional/oic-empty-state";

const th = "border-b border-[var(--copilot-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]";
const td = "px-3 py-2 text-sm text-[var(--copilot-ink)]";

export function OicConflictTable({
  rows,
  lastAuditAt,
}: {
  rows: OicConflictiveInvoice[];
  lastAuditAt?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <OicEmptyState
        title="Sin conflictos activos"
        description={
          lastAuditAt
            ? `Última auditoría: ${new Date(lastAuditAt).toLocaleString("es-AR")} — sin facturas con saldo desalineado.`
            : "Todas las facturas tienen saldo reconciliado."
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-white/80">
      <div className="max-h-[50vh] overflow-auto">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
            <tr>
              <th className={th}>Factura</th>
              <th className={th}>Cliente</th>
              <th className={th}>Moneda</th>
              <th className={`${th} text-right`}>Saldo DB</th>
              <th className={`${th} text-right`}>Saldo Zeta</th>
              <th className={`${th} text-right`}>Diff</th>
              <th className={th}>Miss.</th>
              <th className={th}>Estado</th>
              <th className={th}>Acción sugerida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--copilot-border)]">
            {rows.map((row) => (
              <tr key={row.invoiceId} className="hover:bg-[var(--copilot-accent-soft)]/40">
                <td className={`${td} max-w-[180px] truncate font-mono text-xs`}>{row.invoiceNumber}</td>
                <td className={`${td} max-w-[140px] truncate`}>{row.clienteName}</td>
                <td className={td}>{row.currencyCode}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {row.balanceDb.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td className={`${td} text-right tabular-nums text-[var(--copilot-ink-muted)]`}>
                  {row.balanceZeta != null
                    ? row.balanceZeta.toLocaleString("es-AR", { minimumFractionDigits: 2 })
                    : "—"}
                </td>
                <td className={`${td} text-right tabular-nums font-semibold ${row.gapAmount > 0 ? "text-rose-700" : ""}`}>
                  {row.gapAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td className={`${td} tabular-nums`}>{row.missingCount}</td>
                <td className={td}>
                  <OicSeverityBadge severity={row.severity} />
                </td>
                <td className={`${td} max-w-[200px] text-xs text-[var(--copilot-ink-muted)]`}>
                  {row.suggestedAction}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
