"use client";

/** Chip de filtro por `ayuda_branch` (id vacío = todo, `__other__` = sin rama). */
export type ZetaBranchChip = {
  id: string;
  label: string;
  count: number;
};

type IndexLike = {
  ayuda_branch?: string | null;
  output_md?: string;
  error?: string | null;
};

/**
 * Etiqueta legible derivada solo del slug (sin enumerar ramas en código).
 * Caso especial mínimo: `apis` → `APIs` (sigla habitual).
 */
export function formatAyudaBranchLabel(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!s) return "—";
  if (s === "apis") return "APIs";
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Construye chips desde el índice: Todo + una chip por cada `ayuda_branch` distinta + Otros si hay filas sin rama.
 */
export function buildBranchChipsFromIndex(rows: IndexLike[]): ZetaBranchChip[] {
  const valid = rows.filter((r) => Boolean(r.output_md) && !r.error);
  const bySlug = new Map<string, number>();
  let withoutBranch = 0;

  for (const r of valid) {
    const slug = r.ayuda_branch?.trim().toLowerCase() ?? "";
    if (!slug) {
      withoutBranch += 1;
      continue;
    }
    bySlug.set(slug, (bySlug.get(slug) ?? 0) + 1);
  }

  const chips: ZetaBranchChip[] = [{ id: "", label: "Todo", count: valid.length }];

  const slugs = [...bySlug.keys()].sort((a, b) => a.localeCompare(b, "es"));
  for (const slug of slugs) {
    chips.push({
      id: slug,
      label: formatAyudaBranchLabel(slug),
      count: bySlug.get(slug) ?? 0,
    });
  }

  if (withoutBranch > 0) {
    chips.push({ id: "__other__", label: "Otros", count: withoutBranch });
  }

  return chips;
}

export function ZetaKnowledgeFilters({
  chips,
  activeId,
  onChange,
}: {
  chips: ZetaBranchChip[];
  activeId: string;
  onChange: (branchId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Rama de ayuda
      </p>
      <div className="-mx-0.5 flex flex-nowrap gap-1.5 overflow-x-auto px-0.5 pb-1 pt-0.5 [scrollbar-width:thin]">
        {chips.map((chip) => {
          const active = activeId === chip.id;
          return (
            <button
              key={chip.id === "" ? "__all__" : chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(chip.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)] ${
                active
                  ? "border-[var(--copilot-accent)] bg-[rgba(44,40,37,0.08)] text-[var(--copilot-ink)] shadow-sm"
                  : "border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink-muted)] hover:border-[var(--copilot-accent)] hover:text-[var(--copilot-ink)]"
              }`}
              title={chip.id === "" ? "Mostrar todas las ramas" : `Rama: ${chip.id || "—"}`}
            >
              <span>{chip.label}</span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  active
                    ? "bg-[rgba(44,40,37,0.12)] text-[var(--copilot-ink)]"
                    : "bg-[rgba(44,40,37,0.06)] text-[var(--copilot-ink-muted)]"
                }`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
