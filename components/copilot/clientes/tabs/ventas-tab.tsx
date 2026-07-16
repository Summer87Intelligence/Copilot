"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBag, Lock, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/copilot/ui/empty-state";
import { SkeletonText } from "@/components/copilot/ui/skeleton";
import { copilotCardStandardClass, copilotSectionTitleClass, copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";
import type { SalesDetailRow } from "@/lib/sales/sales-api";
import { formatUyu, formatUsd, formatQuantity, formatDateShort } from "@/components/copilot/ventas/ventas-format";

/**
 * FASE 9 — Ventas del cliente dentro de Cliente 360.
 * Consume el mismo modelo canónico vía /api/copilot/sales/details scoped al
 * cliente. Requiere acceso al módulo Ventas (si no, muestra estado bloqueado).
 */
export function VentasTab({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<SalesDetailRow[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ preset: "year", customerIds: companyId, pageSize: "200" });
      const res = await fetch(`/api/copilot/sales/details?${p.toString()}`, { cache: "no-store" });
      if (res.status === 403) {
        setState("forbidden");
        return;
      }
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState("error");
        return;
      }
      setRows(json.data as SalesDetailRow[]);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [companyId]);

  useEffect(() => {
    // Fetch-on-mount: el estado se sincroniza desde una fuente externa (API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const totals = { UYU: 0, USD: 0 };
    const appliedTotals = { UYU: 0, USD: 0 };
    const pendingTotals = { UYU: 0, USD: 0 };
    const products = new Map<string, { name: string; qty: number; uyu: number; usd: number }>();
    const docsSeen = new Set<string>();
    let firstDate: string | null = null;
    let lastDate: string | null = null;

    for (const r of rows) {
      if (r.kind === "credit_note") continue;
      const cur = r.currency === "UYU" || r.currency === "USD" ? r.currency : null;
      if (cur) totals[cur] += r.lineAmount;
      if (cur && r.isFirstLineOfDoc) {
        appliedTotals[cur] += r.docApplied;
        pendingTotals[cur] += r.docPending;
      }
      docsSeen.add(r.documentId);
      const key = r.productId ?? `d:${r.originalDescription.toLowerCase()}`;
      const name = r.productName ?? r.originalDescription;
      const acc = products.get(key) ?? { name, qty: 0, uyu: 0, usd: 0 };
      acc.qty += r.quantity;
      if (cur === "UYU") acc.uyu += r.lineAmount;
      if (cur === "USD") acc.usd += r.lineAmount;
      products.set(key, acc);
      if (!firstDate || r.date < firstDate) firstDate = r.date;
      if (!lastDate || r.date > lastDate) lastDate = r.date;
    }

    const productList = [...products.values()].sort((a, b) => b.uyu + b.usd - (a.uyu + a.usd));
    return { totals, appliedTotals, pendingTotals, productList, docsCount: docsSeen.size, firstDate, lastDate };
  }, [rows]);

  if (state === "loading") return <SkeletonText lines={5} />;
  if (state === "forbidden")
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="No tenés acceso al módulo Ventas."
        description="Pedile a un administrador que habilite Ventas para ver el detalle comercial de este cliente."
        variant="compact"
      />
    );
  if (state === "error")
    return <EmptyState icon={<TriangleAlert className="h-6 w-6" />} title="No pudimos cargar las ventas del cliente." variant="compact" />;
  if (rows.length === 0)
    return <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title="Este cliente no tiene ventas registradas en el año." variant="compact" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Comprado UYU" value={formatUyu(summary.totals.UYU)} />
        <Tile label="Comprado USD" value={formatUsd(summary.totals.USD)} />
        <Tile label="Facturas" value={String(summary.docsCount)} />
        <Tile label="Pendiente" value={`${formatUyu(summary.pendingTotals.UYU)} · ${formatUsd(summary.pendingTotals.USD)}`} small />
      </div>

      <section className={copilotCardStandardClass}>
        <h3 className={copilotSectionTitleClass}>Productos y servicios comprados</h3>
        <p className={`${copilotCaptionClass} mt-1`}>
          Primera compra {formatDateShort(summary.firstDate)} · última {formatDateShort(summary.lastDate)}. Año actual.
        </p>
        <ul className="mt-3 space-y-2">
          {summary.productList.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 border-b border-[var(--copilot-border)] pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{p.name}</p>
                <p className="text-xs text-[var(--copilot-ink-muted)]">{formatQuantity(p.qty)} unidades</p>
              </div>
              <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--copilot-ink)]">
                {p.uyu > 0 ? formatUyu(p.uyu) : ""}
                {p.uyu > 0 && p.usd > 0 ? " · " : ""}
                {p.usd > 0 ? formatUsd(p.usd) : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <a href="/copilot/ventas" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--copilot-accent)] hover:underline">
        Ver módulo Ventas completo
      </a>
    </div>
  );
}

function Tile({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--copilot-border)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums text-[var(--copilot-ink)] ${small ? "text-sm" : "text-xl"}`}>{value}</p>
    </div>
  );
}
