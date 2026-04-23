"use client";

import { BookOpen, Loader2, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildBranchChipsFromIndex,
  ZetaKnowledgeFilters,
} from "@/components/knowledge/zeta-knowledge-filters";
import { ZetaKnowledgeAgent } from "@/components/knowledge/zeta-knowledge-agent";
import type { ZetaKnowledgeCrumb } from "@/components/knowledge/zeta-knowledge-breadcrumbs";
import { ZetaKnowledgeBreadcrumbs } from "@/components/knowledge/zeta-knowledge-breadcrumbs";
import { ZetaKnowledgeLayout } from "@/components/knowledge/zeta-knowledge-layout";
import type { ZetaListItem } from "@/components/knowledge/zeta-knowledge-list";
import { ZetaKnowledgeList } from "@/components/knowledge/zeta-knowledge-list";
import { ZetaKnowledgePager } from "@/components/knowledge/zeta-knowledge-pager";
import { ZetaKnowledgeSidebar } from "@/components/knowledge/zeta-knowledge-sidebar";
import { ZetaKnowledgeViewer } from "@/components/knowledge/zeta-knowledge-viewer";
import {
  buildZetaNavTree,
  filterNavTreeByBranch,
  findDocNavContext,
  formatZetaNavSegmentLabel,
  normalizeZetaBranch,
  orderDocsInSameBranchAs,
  prevNextInOrdered,
} from "@/lib/knowledge/zeta-knowledge-nav-tree";
import {
  buildZetaKnowledgeUrlQuery,
  coerceZetaBranchFilter,
  parseZetaKnowledgeUrlParams,
  pickZetaKnowledgeUrlParams,
  zetaKnowledgeUrlQueryEquals,
  type ZetaKnowledgeBranchFilter,
  type ZetaKnowledgeSearchMode,
} from "@/lib/knowledge/zeta-knowledge-url-state";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";

const RECENTS_KEY = "copilot:zeta-knowledge-recent-v1";
const RECENTS_MAX = 8;

type IndexRow = {
  source_html: string;
  output_md: string;
  url_original: string | null;
  url_final: string | null;
  title: string;
  processed_at?: string;
  error?: string | null;
  ayuda_branch?: string | null;
};

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(paths: string[]) {
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(paths.slice(0, RECENTS_MAX)));
  } catch {
    /* ignore */
  }
}

function pushRecentPath(outputMd: string) {
  const prev = readRecents().filter((p) => p !== outputMd);
  writeRecents([outputMd, ...prev]);
}

export function ZetaKnowledgePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchSig = searchParams.toString();
  const lastWrittenPickRef = useRef<string | null>(null);

  const [indexRows, setIndexRows] = useState<IndexRow[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);

  const [query, setQuery] = useState(() => parseZetaKnowledgeUrlParams(searchParams).q);
  const [debouncedQuery, setDebouncedQuery] = useState(() => parseZetaKnowledgeUrlParams(searchParams).q);
  const [mode, setMode] = useState<ZetaKnowledgeSearchMode>(() => parseZetaKnowledgeUrlParams(searchParams).mode);
  const [branchFilter, setBranchFilter] = useState<ZetaKnowledgeBranchFilter>(() =>
    coerceZetaBranchFilter(parseZetaKnowledgeUrlParams(searchParams).branchRaw, [])
  );

  const [searchHits, setSearchHits] = useState<ZetaListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRequestId = useRef(0);

  const [expandedNavKeys, setExpandedNavKeys] = useState<Set<string>>(() => new Set());

  const [activePath, setActivePath] = useState<string | null>(
    () => parseZetaKnowledgeUrlParams(searchParams).doc
  );
  const [docTitle, setDocTitle] = useState<string | null>(null);
  const [urlOriginal, setUrlOriginal] = useState<string | null>(null);
  const [urlFinal, setUrlFinal] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 320);
    return () => window.clearTimeout(t);
  }, [query]);

  /** URL externa (compartir, refresh, atrás/adelante): hidratar estado sin pisar nuestro `router.replace`. */
  useEffect(() => {
    const incomingPick = pickZetaKnowledgeUrlParams(searchParams).toString();
    if (lastWrittenPickRef.current !== null && incomingPick === lastWrittenPickRef.current) {
      lastWrittenPickRef.current = null;
      return;
    }
    const p = parseZetaKnowledgeUrlParams(searchParams);
    setQuery(p.q);
    setDebouncedQuery(p.q);
    setMode(p.mode);
    setActivePath(p.doc);
    setBranchFilter(coerceZetaBranchFilter(p.branchRaw, indexRows));
  }, [searchSig, searchParams]);

  /** Revalidar rama cuando llega el índice (sin depender solo de cambios de URL). */
  useEffect(() => {
    if (docsLoading || !indexRows.length) return;
    setBranchFilter((b) => coerceZetaBranchFilter(b, indexRows));
  }, [docsLoading, indexRows]);

  /** Quitar documento activo si ya no existe en el índice. */
  useEffect(() => {
    if (docsLoading || !indexRows.length || !activePath) return;
    if (!indexRows.some((r) => r.output_md === activePath && !r.error)) setActivePath(null);
  }, [docsLoading, indexRows, activePath]);

  /** Sincronizar estado → URL (replace, sin historial basura). */
  useEffect(() => {
    const built = buildZetaKnowledgeUrlQuery({
      branch: branchFilter,
      doc: activePath,
      q: debouncedQuery,
      mode,
    });
    if (zetaKnowledgeUrlQueryEquals(searchParams, built)) return;
    const norm = pickZetaKnowledgeUrlParams(new URLSearchParams(built)).toString();
    lastWrittenPickRef.current = norm;
    const href = built ? `${pathname}?${built}` : pathname;
    router.replace(href, { scroll: false });
  }, [branchFilter, activePath, debouncedQuery, mode, pathname, router, searchSig]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDocsLoading(true);
      setDocsError(null);
      try {
        const res = await fetch("/api/knowledge/zeta/docs", { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          count?: number;
          items?: IndexRow[];
          message?: string;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.message ?? "No se pudo cargar el índice.");
        }
        if (cancelled) return;
        setIndexRows(Array.isArray(json.items) ? json.items : []);
        setDocCount(typeof json.count === "number" ? json.count : 0);
      } catch (e) {
        if (!cancelled) {
          setDocsError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (debouncedQuery.length === 0) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }

    const reqId = ++searchRequestId.current;
    setSearchLoading(true);

    let cancelled = false;
    async function runSearch() {
      try {
        const sp = new URLSearchParams();
        sp.set("q", debouncedQuery);
        sp.set("mode", mode);
        if (branchFilter && branchFilter !== "__other__") {
          sp.set("folder", branchFilter);
        }
        const res = await fetch(`/api/knowledge/zeta/search?${sp.toString()}`, {
          credentials: "include",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          hits?: ZetaListItem[];
          message?: string;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.message ?? "Error en búsqueda.");
        }
        let hits = Array.isArray(json.hits) ? json.hits : [];
        if (branchFilter === "__other__") {
          hits = hits.filter((h) => !String(h.ayuda_branch ?? "").trim());
        }
        if (!cancelled && reqId === searchRequestId.current) {
          setSearchHits(hits);
        }
      } catch {
        if (!cancelled && reqId === searchRequestId.current) {
          setSearchHits([]);
        }
      } finally {
        if (!cancelled && reqId === searchRequestId.current) {
          setSearchLoading(false);
        }
      }
    }
    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode, branchFilter]);

  const branchChips = useMemo(() => buildBranchChipsFromIndex(indexRows), [indexRows]);

  const activeBranchLabel = useMemo(() => {
    const chip = branchChips.find((c) => c.id === branchFilter);
    return chip?.label ?? "Todo";
  }, [branchChips, branchFilter]);

  const browseCount = useMemo(() => {
    const rows = indexRows.filter((r) => r.output_md && !r.error);
    let list = rows;
    if (branchFilter === "__other__") {
      list = rows.filter((r) => !r.ayuda_branch?.trim());
    } else if (branchFilter) {
      const bf = branchFilter.toLowerCase();
      list = rows.filter((r) => (r.ayuda_branch?.trim().toLowerCase() ?? "") === bf);
    }
    return list.length;
  }, [indexRows, branchFilter]);

  const treeBranchesFull = useMemo(() => buildZetaNavTree(indexRows), [indexRows]);

  const treeBranchesFiltered = useMemo(
    () => filterNavTreeByBranch(treeBranchesFull, branchFilter),
    [treeBranchesFull, branchFilter]
  );

  useEffect(() => {
    if (!treeBranchesFull.length) return;
    setExpandedNavKeys((prev) => {
      const n = new Set(prev);
      if (branchFilter && branchFilter !== "__other__") {
        const hit = treeBranchesFull.find((b) => b.slug.toLowerCase() === branchFilter.toLowerCase());
        if (hit) n.add(hit.key);
      } else if (branchFilter === "__other__") {
        const o = treeBranchesFull.find((b) => b.slug === "__other__");
        if (o) n.add(o.key);
      } else {
        for (const b of treeBranchesFull) n.add(b.key);
      }
      return n;
    });
  }, [treeBranchesFull, branchFilter]);

  useEffect(() => {
    if (!activePath) return;
    const ctx = findDocNavContext(treeBranchesFull, activePath);
    if (!ctx) return;
    setExpandedNavKeys((prev) => {
      const next = new Set(prev);
      for (const k of ctx.expandKeys) next.add(k);
      return next;
    });
  }, [activePath, treeBranchesFull]);

  const handleToggleNavKey = useCallback((key: string) => {
    setExpandedNavKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const orderedInBranch = useMemo(
    () => orderDocsInSameBranchAs(indexRows, activePath),
    [indexRows, activePath]
  );

  const { prev: prevMd, next: nextMd } = useMemo(
    () => prevNextInOrdered(orderedInBranch, activePath),
    [orderedInBranch, activePath]
  );

  const breadcrumbItems = useMemo((): ZetaKnowledgeCrumb[] => {
    const base: ZetaKnowledgeCrumb[] = [{ label: "Biblioteca Zeta" }];
    if (!activePath) return base;
    const title =
      docTitle || indexRows.find((r) => r.output_md === activePath)?.title || "Documento";
    const ctx = findDocNavContext(treeBranchesFull, activePath);
    if (ctx?.trailLabels.length) {
      return [...base, ...ctx.trailLabels.map((l) => ({ label: l })), { label: title }];
    }
    const row = indexRows.find((r) => r.output_md === activePath);
    if (row) {
      const b = normalizeZetaBranch(row);
      const bl = b === "__other__" ? "Otros" : formatZetaNavSegmentLabel(b);
      return [...base, { label: bl }, { label: title }];
    }
    return [...base, { label: title }];
  }, [activePath, docTitle, indexRows, treeBranchesFull]);

  const loadDoc = useCallback(async (outputMd: string) => {
    setDocLoading(true);
    setDocError(null);
    setMarkdown(null);
    setDocTitle(null);
    setUrlOriginal(null);
    setUrlFinal(null);
    try {
      const res = await fetch(`/api/knowledge/zeta/doc?path=${encodeURIComponent(outputMd)}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        title?: string | null;
        url_original?: string | null;
        url_final?: string | null;
        markdown?: string;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? "No se pudo abrir el documento.");
      }
      setDocTitle(json.title ?? null);
      setUrlOriginal(json.url_original ?? null);
      setUrlFinal(json.url_final ?? null);
      setMarkdown(json.markdown ?? "");
    } catch (e) {
      setDocError(e instanceof Error ? e.message : String(e));
    } finally {
      setDocLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activePath) return;
    void loadDoc(activePath);
  }, [activePath, loadDoc]);

  function handleSelect(outputMd: string) {
    pushRecentPath(outputMd);
    setRecents(readRecents());
    setActivePath(outputMd);
  }

  const recentItems = useMemo(() => {
    const map = new Map(indexRows.map((r) => [r.output_md, r]));
    return recents
      .map((p) => map.get(p))
      .filter(Boolean)
      .slice(0, 5) as IndexRow[];
  }, [recents, indexRows]);

  const flushSearchNow = useCallback(() => {
    setDebouncedQuery(query.trim());
  }, [query]);

  const header = (
    <div className="flex flex-col gap-4 border-b border-[var(--copilot-border)] pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgba(44,40,37,0.06)]">
            <BookOpen className="h-6 w-6 text-[var(--copilot-accent)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--copilot-ink)]">
              Biblioteca Zeta
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
              Documentación de ayuda convertida a markdown local (`docs/zeta/markdown/`). Solo lectura: buscá,
              explorá por rama, abrí documentos y consultá el asistente por recuperación textual, sin servicios
              externos.
            </p>
          </div>
        </div>
        <CopilotBadge tone="neutral">{docsLoading ? "…" : `${docCount} documentos`}</CopilotBadge>
      </div>
    </div>
  );

  const toolbarCard = (
    <CopilotCard className="flex flex-col gap-4">
      <CopilotSectionTitle
        title="Buscar y filtrar"
        subtitle="El panel izquierdo lista la jerarquía por rama; acá combinás rama y búsqueda en título o contenido."
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              aria-label="Buscar ahora"
              title="Buscar ahora"
              onClick={() => flushSearchNow()}
              className="absolute left-1.5 top-1/2 z-[1] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--copilot-ink-muted)] transition hover:bg-[rgba(44,40,37,0.07)] hover:text-[var(--copilot-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
            >
              <Search className="h-4 w-4 shrink-0" />
            </button>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  flushSearchNow();
                }
              }}
              placeholder="Buscar por título o contenido…"
              aria-describedby="zeta-search-hint"
              className="w-full rounded-xl border border-[var(--copilot-border)] bg-white py-2.5 pl-11 pr-3 text-sm text-[var(--copilot-ink)] outline-none placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)]"
            />
          </div>
          <CopilotPrimaryButton
            type="button"
            onClick={() => flushSearchNow()}
            className="inline-flex shrink-0 items-center gap-2 sm:min-w-[7.5rem]"
          >
            <Search className="h-4 w-4 sm:hidden" />
            Buscar
          </CopilotPrimaryButton>
        </div>
        <p id="zeta-search-hint" className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          La búsqueda se actualiza sola mientras escribís (pausa breve). Para ejecutar en el acto usá{" "}
          <span className="font-semibold text-[var(--copilot-ink)]">Buscar</span>, la{" "}
          <span className="font-semibold text-[var(--copilot-ink)]">lupa</span> o{" "}
          <kbd className="rounded border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.05)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--copilot-ink)]">
            Enter
          </kbd>
          . El filtro de rama se mantiene al buscar; el árbol lateral sigue visible.
        </p>

        {!docsLoading && branchChips.length > 0 ? (
          <ZetaKnowledgeFilters chips={branchChips} activeId={branchFilter} onChange={setBranchFilter} />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all" as const, label: "Todo" },
            { id: "title" as const, label: "Título" },
            { id: "content" as const, label: "Contenido" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              mode === m.id
                ? "border-[var(--copilot-accent)] bg-[rgba(44,40,37,0.06)] text-[var(--copilot-ink)]"
                : "border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink-muted)] hover:border-[var(--copilot-accent)]"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {recentItems.length ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Recientes
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {recentItems.map((r) => (
              <CopilotGhostButton
                key={r.output_md}
                type="button"
                className="max-w-full truncate px-2 py-1 text-xs font-normal"
                onClick={() => handleSelect(r.output_md)}
              >
                {r.title}
              </CopilotGhostButton>
            ))}
          </div>
        </div>
      ) : null}

      {docsError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{docsError}</p>
      ) : null}

      {docError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{docError}</p>
      ) : null}

      <div className="flex items-start justify-between gap-2 border-t border-[var(--copilot-border)] pt-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--copilot-ink)]">
            {debouncedQuery.length > 0
              ? searchLoading
                ? "Buscando…"
                : `${searchHits.length} resultado${searchHits.length === 1 ? "" : "s"}`
              : `${browseCount} documento${browseCount === 1 ? "" : "s"} en vista`}
          </p>
          {!docsLoading && !searchLoading ? (
            <p className="mt-0.5 truncate text-xs text-[var(--copilot-ink-muted)]">
              Rama: {activeBranchLabel}
              {debouncedQuery.length > 0 ? ` · “${debouncedQuery}”` : null}
            </p>
          ) : null}
          {debouncedQuery.length > 0 && searchLoading ? (
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">Rama: {activeBranchLabel}</p>
          ) : null}
        </div>
        {searchLoading && debouncedQuery.length > 0 ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--copilot-ink-muted)]" />
        ) : null}
      </div>

      {debouncedQuery.length > 0 ? (
        docsLoading ? (
          <div className="flex flex-col items-center gap-2 py-10 text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm">Cargando biblioteca…</p>
          </div>
        ) : searchLoading ? (
          <div className="flex flex-col items-center gap-2 py-14 text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm">Buscando en la biblioteca…</p>
          </div>
        ) : (
          <ZetaKnowledgeList items={searchHits} activePath={activePath} onSelect={handleSelect} />
        )
      ) : null}
    </CopilotCard>
  );

  const sidebarEmpty =
    branchFilter && !treeBranchesFiltered.length
      ? "No hay entradas en el índice para esta rama con la jerarquía actual."
      : undefined;

  return (
    <ZetaKnowledgeLayout header={header}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row xl:gap-6">
        <aside className="order-2 flex min-h-0 w-full max-h-[min(40vh,22rem)] shrink-0 flex-col xl:order-1 xl:max-h-none xl:w-[min(20rem,32vw)] xl:shrink-0">
          <ZetaKnowledgeSidebar
            branches={treeBranchesFiltered}
            expandedKeys={expandedNavKeys}
            onToggleKey={handleToggleNavKey}
            activePath={activePath}
            onSelectDoc={handleSelect}
            loading={docsLoading}
            emptyHint={sidebarEmpty}
          />
        </aside>

        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col gap-4 xl:order-2">
          {toolbarCard}

          <div className="flex min-w-0 flex-col gap-2">
            <ZetaKnowledgeBreadcrumbs items={breadcrumbItems} />
            <ZetaKnowledgePager
              prevDisabled={!prevMd || docLoading}
              nextDisabled={!nextMd || docLoading}
              onPrev={() => prevMd && handleSelect(prevMd)}
              onNext={() => nextMd && handleSelect(nextMd)}
            />
          </div>

          <ZetaKnowledgeViewer
            title={docTitle}
            urlOriginal={urlOriginal}
            urlFinal={urlFinal}
            markdown={markdown}
            loading={docLoading}
          />

          <ZetaKnowledgeAgent onOpenDoc={(p) => handleSelect(p)} />
        </div>
      </div>
    </ZetaKnowledgeLayout>
  );
}
