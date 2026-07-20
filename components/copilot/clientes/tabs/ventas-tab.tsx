"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBag, Lock, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/copilot/ui/empty-state";
import { SkeletonText } from "@/components/copilot/ui/skeleton";
import { copilotCardStandardClass, copilotSectionTitleClass, copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";
import type { SalesDetailRow } from "@/lib/sales/sales-api";
import type { SalespersonRow } from "@/lib/sales/sales-salesperson-repository";
import { formatUyu, formatUsd, formatDateShort } from "@/components/copilot/ventas/ventas-format";
import { SellerSelect } from "@/components/copilot/ventas/seller-select";

/**
 * FASE 9 — Ventas del cliente dentro de Cliente 360.
 * Consume el mismo modelo canónico vía /api/copilot/sales/details scoped al
 * cliente. Requiere acceso al módulo Ventas (si no, muestra estado bloqueado).
 */
export function VentasTab({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<SalesDetailRow[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "error">("loading");
  const [people, setPeople] = useState<SalespersonRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/copilot/sales/salespersons", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && res.ok && json.ok) setPeople((json.data as SalespersonRow[]).filter((p) => p.active));
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    // Ventas netas = ventas emitidas − notas de crédito (las NC del cliente se restan).
    const net = { UYU: 0, USD: 0 };
    const creditNotes = { UYU: 0, USD: 0 };
    const appliedTotals = { UYU: 0, USD: 0 };
    const pendingTotals = { UYU: 0, USD: 0 };
    const products = new Map<string, { name: string; qty: number; uyu: number; usd: number }>();
    const docsSeen = new Set<string>();
    let firstDate: string | null = null;
    let lastDate: string | null = null;
    let salespersonName: string | null = null;
    const invoices: {
      documentId: string;
      date: string;
      documentNumber: string | null;
      documentType: string;
      kind: "sale" | "credit_note";
      currency: string;
      amount: number;
      sellerId: string | null;
      sellerName: string | null;
    }[] = [];

    for (const r of rows) {
      const cur = r.currency === "UYU" || r.currency === "USD" ? r.currency : null;
      if (salespersonName == null && r.salespersonName) salespersonName = r.salespersonName;
      if (r.isFirstLineOfDoc) {
        invoices.push({
          documentId: r.documentId,
          date: r.date,
          documentNumber: r.documentNumber,
          documentType: r.documentType,
          kind: r.kind,
          currency: r.currency,
          amount: r.docTotal,
          sellerId: r.sellerId,
          sellerName: r.sellerName,
        });
      }

      if (r.kind === "credit_note") {
        if (cur) {
          net[cur] -= r.lineAmount;
          creditNotes[cur] += r.lineAmount;
        }
        continue;
      }

      if (cur) net[cur] += r.lineAmount;
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
    invoices.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return {
      net,
      creditNotes,
      appliedTotals,
      pendingTotals,
      productList,
      docsCount: docsSeen.size,
      firstDate,
      lastDate,
      salespersonName,
      invoices,
    };
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
      <div
        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--copilot-border)] px-3 py-2"
        title="Persona responsable del seguimiento y la relación con este cliente."
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Ejecutivo del cliente
        </span>
        <span className="text-sm font-semibold text-[var(--copilot-ink)]">
          {summary.salespersonName ?? "Sin ejecutivo"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Ventas netas UYU" value={formatUyu(summary.net.UYU)} />
        <Tile label="Ventas netas USD" value={formatUsd(summary.net.USD)} />
        <Tile label="Facturas" value={String(summary.docsCount)} />
        <Tile label="Servicios" value={String(summary.productList.length)} />
      </div>

      <section className={copilotCardStandardClass}>
        <h3 className={copilotSectionTitleClass}>Servicios contratados</h3>
        <p className={`${copilotCaptionClass} mt-1`}>
          Primera compra {formatDateShort(summary.firstDate)} · última {formatDateShort(summary.lastDate)}. Año actual.
          {summary.creditNotes.UYU > 0.005 || summary.creditNotes.USD > 0.005
            ? ` Notas de crédito descontadas: ${formatUyu(summary.creditNotes.UYU)} · ${formatUsd(summary.creditNotes.USD)}.`
            : ""}
        </p>
        <ul className="mt-3 space-y-2">
          {summary.productList.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 border-b border-[var(--copilot-border)] pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{p.name}</p>
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {formatUyu(p.uyu)}
                  {p.uyu > 0 && p.usd > 0 ? " · " : ""}
                  {p.usd > 0 ? formatUsd(p.usd) : p.uyu === 0 && p.usd === 0 ? "—" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={copilotCardStandardClass}>
        <h3 className={copilotSectionTitleClass}>Facturas y vendedor asignado</h3>
        <p className={`${copilotCaptionClass} mt-1`} title="Persona que realizó esta venta.">
          El vendedor es quien realizó cada operación puntual — distinto del ejecutivo del cliente. Las notas de
          crédito no admiten asignación.
        </p>
        <ul className="mt-3 space-y-2">
          {summary.invoices.map((inv) => (
            <li
              key={inv.documentId}
              className="flex items-center justify-between gap-3 border-b border-[var(--copilot-border)] pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">
                  {formatDateShort(inv.date)} · {inv.documentType} {inv.documentNumber ?? ""}
                </p>
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {inv.currency === "USD" ? formatUsd(inv.amount) : formatUyu(inv.amount)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs text-[var(--copilot-ink-muted)]">Vendedor:</span>
                <SellerSelect
                  documentId={inv.documentId}
                  sellerId={inv.sellerId}
                  sellerName={inv.sellerName}
                  kind={inv.kind}
                  people={people}
                  onAssigned={() => void load()}
                />
              </div>
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
