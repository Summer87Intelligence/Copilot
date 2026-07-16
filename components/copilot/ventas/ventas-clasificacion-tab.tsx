"use client";

import { useCallback, useEffect, useState } from "react";
import { Tag, Plus, CheckCircle2, Ban, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/copilot/ui/empty-state";
import { SkeletonText } from "@/components/copilot/ui/skeleton";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { copilotCardStandardClass, copilotSectionTitleClass, copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { SalesCatalogItem, SalesCatalogView } from "@/lib/sales/canonical/catalog-types";
import type { UnclassifiedConceptRow } from "@/lib/sales/canonical/types";
import { formatUyu, formatUsd, formatDateShort } from "@/components/copilot/ventas/ventas-format";

export function VentasClasificacionTab({
  overview,
  onChanged,
}: {
  overview: SalesOverview | null;
  onChanged: () => void;
}) {
  const [catalog, setCatalog] = useState<SalesCatalogView | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  const [newProductName, setNewProductName] = useState("");

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch("/api/copilot/sales/catalog", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.ok) setCatalog(json.data as SalesCatalogView);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const items = catalog?.items.filter((i) => i.active) ?? [];

  const classify = useCallback(
    async (concept: UnclassifiedConceptRow, catalogItemId: string) => {
      setBusyKey(concept.key);
      setMessage(null);
      try {
        const res = await fetch("/api/copilot/sales/classifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalDescription: concept.originalDescription,
            originalCode: concept.originalCode,
            catalogItemId,
            status: "classified",
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setMessage({ tone: "danger", text: json?.message ?? "No se pudo clasificar." });
          return;
        }
        setMessage({ tone: "positive", text: "Concepto clasificado." });
        onChanged();
      } catch {
        setMessage({ tone: "danger", text: "No se pudo clasificar." });
      } finally {
        setBusyKey(null);
      }
    },
    [onChanged]
  );

  const ignore = useCallback(
    async (concept: UnclassifiedConceptRow) => {
      setBusyKey(concept.key);
      setMessage(null);
      try {
        const res = await fetch("/api/copilot/sales/classifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalDescription: concept.originalDescription,
            originalCode: concept.originalCode,
            status: "ignored",
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setMessage({ tone: "danger", text: json?.message ?? "No se pudo ignorar." });
          return;
        }
        setMessage({ tone: "positive", text: "Concepto marcado como ignorado." });
        onChanged();
      } finally {
        setBusyKey(null);
      }
    },
    [onChanged]
  );

  const createAndAssign = useCallback(
    async (concept: UnclassifiedConceptRow, name: string) => {
      if (!name.trim()) return;
      setBusyKey(concept.key);
      setMessage(null);
      try {
        const create = await fetch("/api/copilot/sales/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "item", name: name.trim(), type: "service", createSelfAlias: true }),
        });
        const created = await create.json();
        if (!create.ok || !created.ok) {
          setMessage({ tone: "danger", text: created?.message ?? "No se pudo crear el producto." });
          return;
        }
        const itemId = String((created.data as { id?: string })?.id ?? "");
        if (itemId) {
          await classify(concept, itemId);
          await loadCatalog();
        }
      } finally {
        setBusyKey(null);
      }
    },
    [classify, loadCatalog]
  );

  const createProduct = useCallback(async () => {
    if (!newProductName.trim()) return;
    setMessage(null);
    const res = await fetch("/api/copilot/sales/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "item", name: newProductName.trim(), type: "service", createSelfAlias: true }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setMessage({ tone: "danger", text: json?.message ?? "No se pudo crear el producto." });
      return;
    }
    setNewProductName("");
    setMessage({ tone: "positive", text: "Producto creado." });
    await loadCatalog();
    onChanged();
  }, [newProductName, loadCatalog, onChanged]);

  const unclassified = overview?.unclassified ?? [];

  return (
    <div className="space-y-4">
      {message ? (
        <div className={`${copilotCardStandardClass} flex items-center gap-2 text-sm`} role="status" aria-live="polite">
          {message.tone === "positive" ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--copilot-success-text-strong)]" aria-hidden />
          ) : (
            <Ban className="h-4 w-4 text-[var(--copilot-danger-text-strong)]" aria-hidden />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}

      <section className={copilotCardStandardClass}>
        <h2 className={`${copilotSectionTitleClass} flex items-center gap-2`}>
          <Tag className="h-4 w-4" aria-hidden />
          Clasificación pendiente
        </h2>
        <p className={`${copilotCaptionClass} mt-1`}>
          Ordenado por impacto. Asigná un producto existente, creá uno nuevo, o marcá el concepto como no clasificable.
          El texto original de Zeta nunca se modifica.
        </p>

        <div className="mt-3 space-y-3">
          {unclassified.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="No hay conceptos sin clasificar en el período." variant="compact" />
          ) : (
            unclassified.map((c) => (
              <UnclassifiedRow
                key={c.key}
                concept={c}
                items={items}
                busy={busyKey === c.key}
                onClassify={(itemId) => classify(c, itemId)}
                onIgnore={() => ignore(c)}
                onCreate={(name) => createAndAssign(c, name)}
              />
            ))
          )}
        </div>
      </section>

      <section className={copilotCardStandardClass}>
        <h2 className={`${copilotSectionTitleClass} flex items-center gap-2`}>
          <Plus className="h-4 w-4" aria-hidden />
          Catálogo de productos / servicios
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            type="text"
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            placeholder="Nuevo producto o servicio…"
            aria-label="Nombre del nuevo producto"
            className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
          />
          <button
            type="button"
            onClick={createProduct}
            disabled={!newProductName.trim()}
            className="h-9 rounded-lg bg-[var(--copilot-accent)] px-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Crear
          </button>
        </div>

        <div className="mt-3">
          {catalogLoading ? (
            <SkeletonText lines={3} />
          ) : items.length === 0 ? (
            <p className={copilotCaptionClass}>Todavía no hay productos en el catálogo.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {items.map((i) => (
                <li key={i.id}>
                  <StatusBadge tone="neutral">{i.name}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function UnclassifiedRow({
  concept,
  items,
  busy,
  onClassify,
  onIgnore,
  onCreate,
}: {
  concept: UnclassifiedConceptRow;
  items: SalesCatalogItem[];
  busy: boolean;
  onClassify: (itemId: string) => void;
  onIgnore: () => void;
  onCreate: (name: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(concept.originalDescription);

  return (
    <div className="rounded-lg border border-[var(--copilot-border)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[var(--copilot-ink)]">{concept.originalDescription}</p>
          <p className="text-xs text-[var(--copilot-ink-muted)]">
            {concept.originalCode ? `Código ${concept.originalCode} · ` : ""}
            {concept.occurrences} apariciones · {concept.customerCount} clientes ·{" "}
            {formatDateShort(concept.firstSeen)}–{formatDateShort(concept.lastSeen)}
          </p>
        </div>
        <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--copilot-ink)]">
          {formatUyu(concept.totalByCurrency.UYU)} · {formatUsd(concept.totalByCurrency.USD)}
        </span>
      </div>

      {concept.suggestedProductName ? (
        <button
          type="button"
          disabled={busy || !concept.suggestedProductId}
          onClick={() => concept.suggestedProductId && onClassify(concept.suggestedProductId)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline disabled:opacity-40"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Sugerencia: asignar a “{concept.suggestedProductName}”
        </button>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!creating ? (
          <>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Asignar producto"
              className="h-8 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2 text-xs text-[var(--copilot-ink)]"
            >
              <option value="">Asignar a…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selected}
              onClick={() => selected && onClassify(selected)}
              className="h-8 rounded-lg border border-[var(--copilot-border-strong)] px-2.5 text-xs font-semibold text-[var(--copilot-ink)] disabled:opacity-40"
            >
              Asignar
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="h-8 rounded-lg border border-[var(--copilot-border-strong)] px-2.5 text-xs font-semibold text-[var(--copilot-ink)]"
            >
              Crear producto
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onIgnore}
              className="h-8 rounded-lg px-2.5 text-xs font-semibold text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-danger-text-strong)] disabled:opacity-40"
            >
              Ignorar
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Nombre del producto"
              className="h-8 min-w-[180px] rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2 text-xs text-[var(--copilot-ink)]"
            />
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => onCreate(name)}
              className="h-8 rounded-lg bg-[var(--copilot-accent)] px-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Crear y asignar
            </button>
            <button type="button" onClick={() => setCreating(false)} className="h-8 rounded-lg px-2.5 text-xs font-semibold text-[var(--copilot-ink-muted)]">
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
