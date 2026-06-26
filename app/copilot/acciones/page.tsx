"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { ActionCard } from "@/components/copilot/acciones/action-card";
import { CopilotActionsEvidenceDrawer } from "@/components/copilot/copilot-actions-evidence-drawer";
import { CopilotOperationalActionsPanel } from "@/components/copilot/copilot-operational-actions-panel";
import { CopilotOperationalEmptyState } from "@/components/copilot/copilot-operational-empty-state";
import { CopilotPremiumEmptyState } from "@/components/copilot/copilot-premium-empty-state";
import { CopilotSkeletonKpiRow } from "@/components/copilot/copilot-loading-skeleton";
import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotGhostLink,
  CopilotPrimaryButton,
  CopilotSectionTitle,
  copilotPageMainClass,
} from "@/components/copilot/copilot-ui";
import type { ActionListItem } from "@/lib/ai/action-types";
import {
  mapActionChannel,
  mapActionTypeLabel,
  mapExecutionStatus,
  mapOutcomeTypeLabelEs,
} from "@/lib/copilot-format";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  formatActionProvenanceLabel,
  parseCopilotActionProvenance,
  provenanceBadgeTone,
} from "@/lib/copilot-alert-ops-mapper";
import { traceFromActionRow } from "@/lib/copilot-trace-meta";
import type { OutcomeTypeValue } from "@/lib/ai/outcome-types";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import {
  buildActionsFromNotifications,
  buildActionsFromPortfolioRows,
  mergePrioritizedActions,
  type CopilotAction,
  type CopilotActionPriority,
  type CopilotActionType,
} from "@/lib/copilot-actions/build-actions";
import {
  enrichActionsWithCollectionFollowups,
  groupCollectionActionsByCompany,
} from "@/lib/copilot-actions/enrich-actions";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import { CollectionAgendaSection } from "@/components/copilot/acciones/collection-agenda-section";
import { CopilotKpiCard } from "@/components/copilot/ui/copilot-kpi-card";
import {
  buildCollectionAgenda,
  type CollectionAgenda,
  type AgendaClientInfo,
} from "@/lib/collection/build-collection-agenda";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

// ── Pipeline helpers ──────────────────────────────────────────────────────────

function statusTone(
  status: string
): "neutral" | "warning" | "danger" | "success" {
  const s = status.toLowerCase();
  if (s === "pending") return "neutral";
  if (s === "executed") return "success";
  if (s === "failed") return "danger";
  return "neutral";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}


// ── Bandeja filter types ──────────────────────────────────────────────────────

type BandejaFilter = "all" | "collection" | "treasury" | "system" | CopilotActionPriority;

const FILTER_LABELS: { id: BandejaFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "critical", label: "Críticas" },
  { id: "collection", label: "Cobranza" },
  { id: "treasury", label: "Tesorería" },
  { id: "system", label: "Sistema" },
];

function matchesFilter(action: CopilotAction, filter: BandejaFilter): boolean {
  if (filter === "all") return true;
  if (filter === "critical" || filter === "high" || filter === "medium" || filter === "low") {
    return action.priority === filter;
  }
  return action.type === (filter as CopilotActionType);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CopilotAccionesPage() {
  const { modulePermissions } = useCopilotPermissions();
  if (modulePermissions["acciones"] === "none") return <AccessDeniedCard />;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-20 text-sm text-[var(--copilot-ink-muted)]">
          Cargando bandeja…
        </div>
      }
    >
      <CopilotAccionesPageContent />
    </Suspense>
  );
}

function CopilotAccionesPageContent() {
  const searchParams = useSearchParams();
  const provenance = useMemo(
    () => parseCopilotActionProvenance(searchParams),
    [searchParams]
  );
  const provenanceLabel = useMemo(
    () => formatActionProvenanceLabel(provenance),
    [provenance]
  );
  const provenanceSourceLabel =
    provenance.source === "alert"
      ? "Alerta"
      : provenance.source === "insight"
        ? "Insight"
        : provenance.source === "recommendation"
          ? "Recomendación"
          : null;

  // ── Tab state (URL-synced) ───────────────────────────────────────────────────
  const router = useRouter();
  type InboxTab = "acciones" | "agenda" | "alertas";
  const tabParam = searchParams.get("tab");
  const activeTab: InboxTab =
    tabParam === "agenda" ? "agenda" : tabParam === "alertas" ? "alertas" : "acciones";

  function setTab(tab: InboxTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "acciones") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(`/copilot/acciones${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  // ── Bandeja state ───────────────────────────────────────────────────────────
  const [bandejaActions, setBandejaActions] = useState<CopilotAction[]>([]);
  const [bandejaLoading, setBandejaLoading] = useState(true);
  const [bandejaFilter, setBandejaFilter] = useState<BandejaFilter>("all");
  const [bandejaSearch, setBandejaSearch] = useState("");
  const [agenda, setAgenda] = useState<CollectionAgenda | null>(null);
  const [inboxNotifications, setInboxNotifications] = useState<CopilotNotification[]>([]);

  const loadBandeja = useCallback(async () => {
    setBandejaLoading(true);
    try {
      const [notifRes, portfolioResult, collectionRes] = await Promise.allSettled([
        copilotApiFetch("/api/copilot/notifications?limit=100"),
        fetchClientPortfolioLoad(),
        copilotApiFetch("/api/copilot/collection-actions"),
      ]);

      let notifications: CopilotNotification[] = [];
      if (notifRes.status === "fulfilled") {
        const json = (await notifRes.value.json().catch(() => null)) as {
          ok?: boolean;
          notifications?: CopilotNotification[];
        } | null;
        notifications = json?.notifications ?? [];
        setInboxNotifications(notifications);
      } else {
        setInboxNotifications([]);
      }

      let portfolioRows: ClientPortfolioLoad["rows"] = [];
      if (portfolioResult.status === "fulfilled") {
        portfolioRows = portfolioResult.value.rows;
      }

      let collectionByCompanyId = new Map<string, CollectionAction[]>();
      let allCollectionActions: CollectionAction[] = [];
      if (collectionRes.status === "fulfilled") {
        const json = (await collectionRes.value.json().catch(() => null)) as {
          ok?: boolean;
          actions?: CollectionAction[];
        } | null;
        if (json?.actions?.length) {
          allCollectionActions = json.actions;
          collectionByCompanyId = groupCollectionActionsByCompany(json.actions);
        }
      }

      const fromNotifications = buildActionsFromNotifications(notifications);
      const coveredIds = new Set(
        fromNotifications.map((a) => a.entityId).filter(Boolean) as string[]
      );
      const fromPortfolio = buildActionsFromPortfolioRows(portfolioRows, coveredIds);
      const merged = mergePrioritizedActions(fromNotifications, fromPortfolio);
      const enriched = enrichActionsWithCollectionFollowups(merged, collectionByCompanyId);
      setBandejaActions(enriched);

      // Build agenda from raw collection actions + portfolio client info
      const agendaClients: AgendaClientInfo[] = portfolioRows.map((r) => ({
        companyId: r.company_id,
        name: r.name,
        debtUyu: r.debt_uyu,
        debtUsd: r.debt_usd,
        overdueUyu: r.overdue_uyu,
        overdueUsd: r.overdue_usd,
      }));
      setAgenda(
        buildCollectionAgenda({ actions: allCollectionActions, clients: agendaClients })
      );
    } finally {
      setBandejaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBandeja();
  }, [loadBandeja]);

  const filteredBandeja = useMemo(() => {
    const q = bandejaSearch.trim().toLocaleLowerCase("es");
    return bandejaActions
      .filter((a) => matchesFilter(a, bandejaFilter))
      .filter((a) => {
        if (!q) return true;
        const haystack = [a.title, a.reason, a.entityId].filter(Boolean).join(" ").toLocaleLowerCase("es");
        return haystack.includes(q);
      });
  }, [bandejaActions, bandejaFilter, bandejaSearch]);

  const filteredAgenda: CollectionAgenda | null = useMemo(() => {
    if (!agenda) return null;
    const q = bandejaSearch.trim().toLocaleLowerCase("es");
    if (!q) return agenda;
    const matches = (it: { clientName: string; note?: string }) => {
      const fields = [it.clientName, it.note]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es");
      return fields.includes(q);
    };
    return {
      ...agenda,
      overdueFollowups: agenda.overdueFollowups.filter(matches),
      dueTodayFollowups: agenda.dueTodayFollowups.filter(matches),
      upcomingFollowups: agenda.upcomingFollowups.filter(matches),
      overduePromises: agenda.overduePromises.filter(matches),
      upcomingPromises: agenda.upcomingPromises.filter(matches),
      recentContacts: agenda.recentContacts.filter(matches),
    };
  }, [agenda, bandejaSearch]);

  const filteredInboxNotifications = useMemo(() => {
    const q = bandejaSearch.trim().toLocaleLowerCase("es");
    if (!q) return inboxNotifications;
    return inboxNotifications.filter((n) => {
      const hay = [n.title, n.body, n.entity_id].filter(Boolean).join(" ").toLocaleLowerCase("es");
      return hay.includes(q);
    });
  }, [inboxNotifications, bandejaSearch]);

  const bandejaMetrics = useMemo(() => {
    const critical = bandejaActions.filter((a) => a.priority === "critical").length;
    const collection = bandejaActions.filter((a) => a.type === "collection").length;
    const treasury = bandejaActions.filter((a) => a.type === "treasury").length;
    return { total: bandejaActions.length, critical, collection, treasury };
  }, [bandejaActions]);

  // ── Pipeline state ──────────────────────────────────────────────────────────
  const [actions, setActions] = useState<ActionListItem[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineExpanded, setPipelineExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null);
  const [saleExpandId, setSaleExpandId] = useState<string | null>(null);
  const [saleAmount, setSaleAmount] = useState("");
  const [evidenceAction, setEvidenceAction] = useState<ActionListItem | null>(null);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [loopDrafts, setLoopDrafts] = useState<
    Record<string, { assignee: string; expected: string; before: string }>
  >({});
  const [outcomeDrafts, setOutcomeDrafts] = useState<
    Record<string, { notes: string; after: string }>
  >({});
  const [savingLoopId, setSavingLoopId] = useState<string | null>(null);
  const [loopSaveSuccessId, setLoopSaveSuccessId] = useState<string | null>(null);
  const [expandedTrackingId, setExpandedTrackingId] = useState<string | null>(null);

  const openEvidenceDrawer = useCallback((a: ActionListItem) => {
    setSaleExpandId(null);
    setSaleAmount("");
    setIsEvidenceOpen(true);
    setEvidenceAction(a);
  }, []);

  const toggleSaleExpand = useCallback((a: ActionListItem) => {
    if (saleExpandId === a.id) {
      setSaleExpandId(null);
      setSaleAmount("");
      return;
    }
    setIsEvidenceOpen(false);
    setEvidenceAction(null);
    setSaleExpandId(a.id);
    setSaleAmount("");
  }, [saleExpandId]);

  const closeEvidenceDrawer = useCallback(() => {
    setIsEvidenceOpen(false);
    setEvidenceAction(null);
  }, []);

  const fetchPipelineActions = useCallback(async (opts?: { soft?: boolean }) => {
    setError(null);
    if (!opts?.soft) setPipelineLoading(true);
    try {
      const res = await copilotApiFetch("/api/copilot/actions?limit=120");
      const json = (await res.json()) as {
        actions?: ActionListItem[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "No se pudieron cargar las acciones.");
        setActions([]);
        return;
      }
      setActions(json.actions ?? []);
    } catch {
      setError("Error de red al cargar acciones.");
      setActions([]);
    } finally {
      if (!opts?.soft) setPipelineLoading(false);
    }
  }, []);

  // Load pipeline lazily when section is expanded
  useEffect(() => {
    if (pipelineExpanded && actions.length === 0) {
      void fetchPipelineActions();
    }
  }, [pipelineExpanded, actions.length, fetchPipelineActions]);

  useEffect(() => {
    setLoopDrafts((prev) => {
      const next = { ...prev };
      for (const a of actions) {
        next[a.id] = {
          assignee: a.assignee_name ?? "",
          expected: a.expected_result ?? "",
          before: a.before_note ?? "",
        };
      }
      return next;
    });
    setOutcomeDrafts((prev) => {
      const next = { ...prev };
      for (const a of actions) {
        if (!next[a.id]) next[a.id] = { notes: "", after: "" };
      }
      for (const k of Object.keys(next)) {
        if (!actions.some((a) => a.id === k)) delete next[k];
      }
      return next;
    });
  }, [actions]);

  useEffect(() => {
    setEvidenceAction((prev) => {
      if (!prev) return prev;
      const next = actions.find((x) => x.id === prev.id);
      return next ?? prev;
    });
  }, [actions]);

  const handleGenerate = async () => {
    setError(null);
    setLastResult(null);
    setGenerating(true);
    try {
      const res = await copilotApiFetch("/api/copilot/actions/generate", {
        method: "POST",
      });
      const json = (await res.json()) as {
        processed?: number;
        actionsCreated?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "No se pudieron generar acciones.");
        return;
      }
      const p = json.processed ?? 0;
      const c = json.actionsCreated ?? 0;
      setLastResult(`Procesadas: ${p}. Acciones creadas: ${c}.`);
      await fetchPipelineActions();
    } catch {
      setError("Error de red al generar acciones.");
    } finally {
      setGenerating(false);
    }
  };

  const saveActionLoop = async (a: ActionListItem) => {
    const d = loopDrafts[a.id];
    if (!d) return;
    setError(null);
    setSavingLoopId(a.id);
    try {
      const res = await copilotApiFetch(`/api/copilot/actions/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignee_name: d.assignee.trim() === "" ? null : d.assignee.trim(),
          expected_result: d.expected.trim() === "" ? null : d.expected.trim(),
          before_note: d.before.trim() === "" ? null : d.before.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo guardar el seguimiento.");
        return;
      }
      await fetchPipelineActions({ soft: true });
      setLoopSaveSuccessId(a.id);
      window.setTimeout(() => setLoopSaveSuccessId(null), 3000);
    } catch {
      setError("Error de red al guardar seguimiento.");
    } finally {
      setSavingLoopId(null);
    }
  };

  const submitOutcome = async (
    a: ActionListItem,
    outcomeType: OutcomeTypeValue,
    revenueAmount?: number | null
  ) => {
    setError(null);
    setSubmittingActionId(a.id);
    const draft = outcomeDrafts[a.id] ?? { notes: "", after: "" };
    try {
      const res = await copilotApiFetch("/api/copilot/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_id: a.id,
          initiative_id: a.initiative_id,
          outcome_type: outcomeType,
          revenue_amount:
            outcomeType === "sale" ? revenueAmount ?? 0 : null,
          notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
          after_note: draft.after.trim() === "" ? null : draft.after.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string; outcome?: unknown };
      if (!res.ok) {
        setError(json.error ?? "No se pudo registrar el resultado.");
        return;
      }
      setSaleExpandId(null);
      setSaleAmount("");
      setOutcomeDrafts((p) => ({ ...p, [a.id]: { notes: "", after: "" } }));
      await fetchPipelineActions({ soft: true });
    } catch {
      setError("Error de red al registrar resultado.");
    } finally {
      setSubmittingActionId(null);
    }
  };

  const onQuickClick = (a: ActionListItem, kind: OutcomeTypeValue) => {
    if (kind === "sale") {
      toggleSaleExpand(a);
      return;
    }
    setIsEvidenceOpen(false);
    setEvidenceAction(null);
    setSaleExpandId(null);
    setSaleAmount("");
    void submitOutcome(a, kind);
  };

  const onConfirmSale = (a: ActionListItem) => {
    const raw = saleAmount.replace(",", ".").trim();
    const n = parseFloat(raw);
    const amount = Number.isFinite(n) ? n : 0;
    void submitOutcome(a, "sale", amount);
  };

  const actionMetrics = useMemo(() => {
    const pending = actions.filter(
      (action) => action.execution_status.toLowerCase() === "pending"
    ).length;
    const tracking = actions.filter(
      (action) =>
        Boolean(action.assignee_name?.trim()) ||
        Boolean(action.expected_result?.trim())
    ).length;
    const today = new Date().toDateString();
    const resolvedToday = actions.filter((action) => {
      if (action.execution_status.toLowerCase() !== "executed") return false;
      try {
        return new Date(action.updated_at).toDateString() === today;
      } catch {
        return false;
      }
    }).length;
    return { pending, tracking, resolvedToday, total: actions.length };
  }, [actions]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.acciones"
        title="Acciones"
        description="Prioridad del día y tareas concretas."
      />

      <div className={copilotPageMainClass}>
        {/* ── Módulo integrado en Cobranza ──────────────────────────────── */}
        <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                Agenda y acciones integradas en Cobranza
              </p>
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                La agenda de cobros, seguimiento de clientes y cobranza operativa se gestionan desde Cobranza.
              </p>
            </div>
            <Link
              href="/copilot/cobranza"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              Ir a Cobranza
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>

        {provenanceLabel ? (
          <CopilotCard className="border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85">
            <div className="flex flex-wrap items-start gap-3">
              {provenanceSourceLabel ? (
                <CopilotBadge tone={provenanceBadgeTone(provenance.priority)}>
                  {provenanceSourceLabel}
                </CopilotBadge>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                  {provenanceLabel}
                </p>
                {provenance.obligationId ? (
                  <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                    Obligación asociada: {provenance.obligationId}
                  </p>
                ) : null}
              </div>
            </div>
          </CopilotCard>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-4 py-3 text-sm text-[var(--copilot-danger-text-strong)]"
          >
            {error}
          </div>
        ) : null}

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="flex gap-1 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-1">
          {(
            [
              { id: "acciones" as const, label: "Prioridades", hint: "Qué resolver" },
              { id: "agenda" as const, label: "Agenda", hint: "A quién seguir" },
              { id: "alertas" as const, label: "Novedades", hint: "Qué pasó" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`flex-1 rounded-lg px-2 py-2 text-center transition ${
                activeTab === tab.id
                  ? "bg-[var(--copilot-accent)] text-white shadow-sm"
                  : "text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
              }`}
            >
              <span className="block text-xs font-semibold">{tab.label}</span>
              <span
                className={`block text-[10px] font-normal ${
                  activeTab === tab.id ? "text-white/85" : "text-[var(--copilot-ink-muted)]"
                }`}
              >
                {tab.hint}
              </span>
            </button>
          ))}
        </div>

        {activeTab === "agenda" ? (
          <CollectionAgendaSection agenda={filteredAgenda} loading={bandejaLoading} />
        ) : null}

        {activeTab === "alertas" ? (
          <CopilotCard>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
                Alertas del sistema
              </h2>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Qué pasó en el negocio. Para resolver tareas concretas, usá Prioridades.
              </p>
            </div>
            {bandejaLoading ? (
              <p className="text-sm text-[var(--copilot-ink-muted)]">Cargando alertas…</p>
            ) : filteredInboxNotifications.length === 0 ? (
              <p className="text-sm text-[var(--copilot-ink-muted)]">
                {bandejaSearch ? "Sin alertas que coincidan con la búsqueda." : "No hay alertas recientes en esta carga."}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredInboxNotifications.slice(0, 8).map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-[var(--copilot-ink)]">{n.title}</p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--copilot-ink-muted)]">
                        {n.body}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <Link
                href="/copilot/alertas"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
              >
                Ver todas las alertas
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </CopilotCard>
        ) : null}

        {/* ── PRIMARY: Bandeja operativa ─────────────────────────────────── */}
        {activeTab === "acciones" ? (<>
        <CopilotCard>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
                Prioridades pendientes
              </h2>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Qué resolver ahora · ordenadas por prioridad
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadBandeja()}
              disabled={bandejaLoading}
              className="text-xs font-medium text-[var(--copilot-accent)] hover:underline disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
            >
              {bandejaLoading ? "Actualizando…" : "Actualizar"}
            </button>
          </div>

          {/* Summary cards */}
          {!bandejaLoading && bandejaMetrics.total > 0 ? (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CopilotKpiCard size="mini" eyebrow="Total" value={String(bandejaMetrics.total)} />
              <CopilotKpiCard size="mini" eyebrow="Críticas" value={String(bandejaMetrics.critical)} tone={bandejaMetrics.critical > 0 ? "danger" : "neutral"} />
              <CopilotKpiCard size="mini" eyebrow="Cobranza" value={String(bandejaMetrics.collection)} />
              <CopilotKpiCard size="mini" eyebrow="Tesorería" value={String(bandejaMetrics.treasury)} />
            </div>
          ) : null}

          {/* Filter pills + búsqueda compacta (filtra Prioridades, Agenda y Novedades) */}
          {!bandejaLoading && bandejaMetrics.total > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {FILTER_LABELS.map((f) => {
                const active = bandejaFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setBandejaFilter(f.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                        : "bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
              <input
                type="search"
                value={bandejaSearch}
                onChange={(e) => setBandejaSearch(e.target.value)}
                placeholder="Buscar cliente, empresa o concepto…"
                aria-label="Buscar en acciones, agenda y novedades"
                className="h-8 w-full min-w-0 rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 text-xs text-[var(--copilot-ink)] placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:outline-none sm:ml-auto sm:h-7 sm:max-w-xs sm:flex-none"
              />
            </div>
          ) : null}

          {bandejaLoading ? (
            <CopilotSkeletonKpiRow count={3} className="py-1" />
          ) : bandejaActions.length === 0 ? (
            <CopilotPremiumEmptyState
              title="Sin prioridades pendientes"
              why="No hay clientes, pagos ni alertas que requieran acción inmediata en este momento."
              whatToDo="Revisá Hoy para la lectura del día o ampliá filtros si esperás ver tareas."
              whatHappens="Cuando haya deuda atrasada, pagos próximos o alertas activas, aparecerán acá ordenadas por urgencia."
              cta={{ label: "Ir a Hoy", href: "/copilot/hoy" }}
            />
          ) : filteredBandeja.length === 0 ? (
            <CopilotPremiumEmptyState
              title="Nada coincide con este filtro"
              why={`Hay ${bandejaActions.length} acciones, pero ninguna entra en «${FILTER_LABELS.find((f) => f.id === bandejaFilter)?.label ?? bandejaFilter}».`}
              whatToDo="Probá el filtro «Todas» o cambiá la categoría."
              whatHappens="Las acciones filtradas se listan con qué pasó, qué riesgo tiene y qué hacer ahora."
            />
          ) : (
            <>
            {bandejaFilter !== "all" || filteredBandeja.length < bandejaActions.length ? (
              <p className="mb-2 text-[11px] text-[var(--copilot-ink-muted)]">
                Mostrando {filteredBandeja.length} de {bandejaActions.length} acciones
              </p>
            ) : null}
            <ul className="space-y-2.5">
              {filteredBandeja.map((action) => (
                <li key={action.id}>
                  <ActionCard action={action} />
                </li>
              ))}
            </ul>
            </>
          )}
        </CopilotCard>

        {/* ── SECONDARY: CopilotOperationalActionsPanel ─────────────────── */}
        <CopilotOperationalActionsPanel
          provenance={provenance}
          highlightActionId={provenance.operationalActionId}
          onError={setError}
        />

        {/* ── TERTIARY: Pipeline de decisiones (collapsible) ─────────────── */}
        <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)]">
          <button
            type="button"
            onClick={() => {
              setPipelineExpanded((v) => {
                const next = !v;
                if (next) {
                  closeEvidenceDrawer();
                  setSaleExpandId(null);
                  setSaleAmount("");
                }
                return next;
              });
            }}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                Historial de gestiones
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Qué pasó, qué riesgo tiene y qué registrar como resultado
              </p>
            </div>
            {pipelineExpanded ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]" aria-hidden />
            )}
          </button>

          {pipelineExpanded ? (
            <div className="border-t border-[var(--copilot-border)] px-4 pb-4 pt-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {lastResult ? (
                  <p className="text-sm text-[var(--copilot-ink-muted)]">{lastResult}</p>
                ) : (
                  <span />
                )}
                <CopilotPrimaryButton
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating || pipelineLoading}
                  className="inline-flex items-center gap-2"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Buscar sugerencias
                </CopilotPrimaryButton>
              </div>

              <CopilotSectionTitle
                title="Acciones de seguimiento"
                subtitle="Orden: más recientes primero. Resultado: una vez por acción."
              />

              {pipelineLoading ? (
                <CopilotSkeletonKpiRow count={4} className="py-1" />
              ) : actions.length === 0 ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="space-y-3 lg:col-span-2">
                    <CopilotOperationalEmptyState
                      title="Seguimiento activo"
                      status="Sin acciones pendientes en esta carga"
                      statusTone="info"
                      metrics={[
                        { label: "Pendientes", value: actionMetrics.pending },
                        { label: "Seguimiento", value: actionMetrics.tracking },
                        { label: "Resueltas hoy", value: actionMetrics.resolvedToday },
                        { label: "Total", value: actionMetrics.total },
                      ]}
                      footnote="Usá «Buscar sugerencias» o abrí alertas para registrar qué pasó y qué hiciste."
                    />
                    <CopilotPrimaryButton
                      type="button"
                      onClick={() => void handleGenerate()}
                      disabled={generating}
                      className="inline-flex items-center gap-2"
                    >
                      {generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : null}
                      Buscar sugerencias
                    </CopilotPrimaryButton>
                  </div>
                  <CopilotCard className="h-fit border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Siguientes pasos
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      <li>
                        <CopilotGhostLink href="/copilot/alertas" className="w-full justify-start px-0 py-1 text-xs font-semibold">
                          Revisar alertas
                        </CopilotGhostLink>
                      </li>
                      <li>
                        <CopilotGhostLink href="/copilot/clientes" className="w-full justify-start px-0 py-1 text-xs font-semibold">
                          Abrir clientes
                        </CopilotGhostLink>
                      </li>
                      <li>
                        <CopilotGhostLink href="/copilot/tesoreria" className="w-full justify-start px-0 py-1 text-xs font-semibold">
                          Revisar tesorería
                        </CopilotGhostLink>
                      </li>
                    </ul>
                  </CopilotCard>
                </div>
              ) : (
                <ul className="space-y-3">
                  {actions.map((a) => {
                    const pending = a.execution_status.toLowerCase() === "pending";
                    const busy = submittingActionId === a.id;
                    const evidenceActive =
                      isEvidenceOpen && evidenceAction?.id === a.id;
                    return (
                      <li
                        key={a.id}
                        className={`rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85 px-3.5 py-3 shadow-sm ${
                          evidenceActive
                            ? "ring-2 ring-[rgba(31,107,74,0.22)]"
                            : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <CopilotInteractiveText
                              icon="panel"
                              layout="block"
                              className="font-semibold"
                              onClick={() => openEvidenceDrawer(a)}
                            >
                              {a.company_name ?? "Empresa (sin dato)"}
                            </CopilotInteractiveText>
                            <p className="mt-1 text-xs uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                              {mapActionTypeLabel(a.action_type)} ·{" "}
                              {mapActionChannel(a.channel)}
                            </p>
                            {evidenceActive ? (
                              <span className="mt-2 inline-block rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
                                Respaldo abierto
                              </span>
                            ) : null}
                            <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                              {a.action_payload?.suggested_message ?? "—"}
                            </p>
                            <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                              {formatDate(a.created_at)}
                            </p>
                            <CopilotTraceMeta
                              trace={traceFromActionRow(a)}
                              variant="embed"
                              dense
                              className="!pt-2"
                            />
                            <div className="mt-3">
                              <CopilotGhostButton
                                type="button"
                                className="text-xs"
                                onClick={() => openEvidenceDrawer(a)}
                              >
                                Ver respaldo
                              </CopilotGhostButton>
                            </div>
                          </div>
                          <CopilotBadge tone={statusTone(a.execution_status)}>
                            {mapExecutionStatus(a.execution_status)}
                          </CopilotBadge>
                        </div>

                        {(() => {
                          const ld = loopDrafts[a.id] ?? {
                            assignee: "",
                            expected: "",
                            before: "",
                          };
                          const isExpanded =
                            expandedTrackingId === a.id || loopSaveSuccessId === a.id;
                          const hasDraft = Boolean(
                            ld.assignee.trim() || ld.expected.trim() || ld.before.trim()
                          );
                          return (
                            <div className="mt-4">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTrackingId((prev) =>
                                    prev === a.id ? null : a.id
                                  )
                                }
                                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] transition-colors hover:text-[var(--copilot-ink)]"
                              >
                                <ChevronDown
                                  className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  aria-hidden
                                />
                                Seguimiento
                                {hasDraft ? (
                                  <span
                                    className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--copilot-accent)]"
                                    aria-label="Con datos"
                                  />
                                ) : null}
                              </button>
                              {isExpanded ? (
                                <div className="mt-2 rounded-xl border border-[var(--copilot-border)]/90 bg-[var(--copilot-panel-bg)] px-3 py-3">
                                  <div className="space-y-3">
                                    <label className="block">
                                      <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                                        Responsable
                                      </span>
                                      <input
                                        type="text"
                                        className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                                        placeholder="Nombre o rol"
                                        value={ld.assignee}
                                        onChange={(e) =>
                                          setLoopDrafts((p) => ({
                                            ...p,
                                            [a.id]: { ...ld, assignee: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                                        Resultado esperado
                                      </span>
                                      <textarea
                                        rows={2}
                                        className="mt-1 w-full resize-y rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                                        placeholder="Qué debería pasar si la acción sale bien"
                                        value={ld.expected}
                                        onChange={(e) =>
                                          setLoopDrafts((p) => ({
                                            ...p,
                                            [a.id]: { ...ld, expected: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                                        Antes (contexto o lectura)
                                      </span>
                                      <textarea
                                        rows={2}
                                        className="mt-1 w-full resize-y rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                                        placeholder="Situación o métrica antes de ejecutar"
                                        value={ld.before}
                                        onChange={(e) =>
                                          setLoopDrafts((p) => ({
                                            ...p,
                                            [a.id]: { ...ld, before: e.target.value },
                                          }))
                                        }
                                      />
                                    </label>
                                  </div>
                                  <div className="mt-3 flex items-center justify-end gap-3">
                                    <CopilotGhostButton
                                      type="button"
                                      disabled={savingLoopId === a.id}
                                      onClick={() => void saveActionLoop(a)}
                                      className="inline-flex items-center gap-2 text-xs"
                                    >
                                      {savingLoopId === a.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                      ) : null}
                                      Guardar seguimiento
                                    </CopilotGhostButton>
                                    {loopSaveSuccessId === a.id ? (
                                      <span className="text-xs font-medium text-[var(--copilot-success-text)]">
                                        Seguimiento guardado
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {pending ? (
                          <div className="mt-4 border-t border-[var(--copilot-border)] pt-4">
                            <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--copilot-ink-muted)]">
                              Registrar resultado
                              {busy ? (
                                <span className="inline-flex items-center gap-1.5 font-normal text-[var(--copilot-ink)]">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                  Registrando…
                                </span>
                              ) : null}
                            </p>
                            <div className="mb-3 space-y-2">
                              <label className="block">
                                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                                  Notas del resultado (opcional)
                                </span>
                                <textarea
                                  rows={2}
                                  className="mt-1 w-full resize-y rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm"
                                  placeholder="Qué pasó en la práctica"
                                  value={(outcomeDrafts[a.id] ?? { notes: "", after: "" }).notes}
                                  onChange={(e) =>
                                    setOutcomeDrafts((p) => ({
                                      ...p,
                                      [a.id]: {
                                        ...(p[a.id] ?? { notes: "", after: "" }),
                                        notes: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                                  Después / impacto (opcional)
                                </span>
                                <textarea
                                  rows={2}
                                  className="mt-1 w-full resize-y rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm"
                                  placeholder="Lectura breve después de la interacción"
                                  value={(outcomeDrafts[a.id] ?? { notes: "", after: "" }).after}
                                  onChange={(e) =>
                                    setOutcomeDrafts((p) => ({
                                      ...p,
                                      [a.id]: {
                                        ...(p[a.id] ?? { notes: "", after: "" }),
                                        after: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <CopilotGhostButton
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() => onQuickClick(a, "no_response")}
                              >
                                Sin respuesta
                              </CopilotGhostButton>
                              <CopilotGhostButton
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() => onQuickClick(a, "response")}
                              >
                                Respondió
                              </CopilotGhostButton>
                              <CopilotGhostButton
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() => onQuickClick(a, "meeting")}
                              >
                                Reunión
                              </CopilotGhostButton>
                              <CopilotGhostButton
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() => onQuickClick(a, "sale")}
                                className={
                                  saleExpandId === a.id
                                    ? "border-[var(--copilot-accent)] bg-[var(--copilot-tone-positive-bg)]/50"
                                    : ""
                                }
                              >
                                Venta
                              </CopilotGhostButton>
                            </div>

                            {saleExpandId === a.id ? (
                              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-3">
                                <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                                  <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                                    Monto (venta)
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={saleAmount}
                                    onChange={(e) => setSaleAmount(e.target.value)}
                                    className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        onConfirmSale(a);
                                      }
                                    }}
                                  />
                                </label>
                                <CopilotPrimaryButton
                                  type="button"
                                  disabled={busy}
                                  onClick={() => onConfirmSale(a)}
                                  className="shrink-0 px-4 py-2 text-xs"
                                >
                                  {busy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Registrar venta"
                                  )}
                                </CopilotPrimaryButton>
                                <CopilotGhostButton
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setSaleExpandId(null);
                                    setSaleAmount("");
                                  }}
                                  className="shrink-0 px-3 py-2 text-xs"
                                >
                                  Cancelar
                                </CopilotGhostButton>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3 border-t border-[var(--copilot-border)] pt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                              Registrar resultado
                            </p>
                            {a.outcome ? (
                              <div className="space-y-2 text-sm text-[var(--copilot-ink)]">
                                <p>
                                  <span className="font-medium text-[var(--copilot-ink-muted)]">
                                    Tipo registrado:{" "}
                                  </span>
                                  {mapOutcomeTypeLabelEs(a.outcome.outcome_type)}
                                </p>
                                <p>
                                  <span className="font-medium text-[var(--copilot-ink-muted)]">
                                    Esperado:{" "}
                                  </span>
                                  {a.expected_result?.trim()
                                    ? a.expected_result
                                    : "Sin texto de esperado cargado."}
                                </p>
                                <p>
                                  <span className="font-medium text-[var(--copilot-ink-muted)]">
                                    Real / notas:{" "}
                                  </span>
                                  {a.outcome.notes?.trim()
                                    ? a.outcome.notes
                                    : "Sin notas en el resultado."}
                                </p>
                                {a.outcome.outcome_type === "sale" &&
                                a.outcome.revenue_amount != null ? (
                                  <p>
                                    <span className="font-medium text-[var(--copilot-ink-muted)]">
                                      Monto venta:{" "}
                                    </span>
                                    {a.outcome.revenue_amount.toLocaleString("es-AR", {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2,
                                    })}
                                  </p>
                                ) : null}
                                {a.outcome.after_note?.trim() ? (
                                  <p>
                                    <span className="font-medium text-[var(--copilot-ink-muted)]">
                                      Después (registrado):{" "}
                                    </span>
                                    {a.outcome.after_note}
                                  </p>
                                ) : null}
                                {a.before_note?.trim() || a.outcome.after_note?.trim() ? (
                                  <p className="rounded-lg bg-[rgba(31,107,74,0.06)] px-3 py-2 text-xs leading-relaxed text-[var(--copilot-ink)]">
                                    <span className="font-semibold">Antes: </span>
                                    {a.before_note?.trim() || "—"}
                                    <span className="mx-1.5 text-[var(--copilot-ink-muted)]">·</span>
                                    <span className="font-semibold">Después: </span>
                                    {a.outcome.after_note?.trim() ||
                                      a.outcome.notes?.trim() ||
                                      "—"}
                                  </p>
                                ) : null}
                                <p className="text-xs text-[var(--copilot-ink-muted)]">
                                  Resultado registrado: {formatDate(a.outcome.created_at)}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--copilot-warning-text-strong)]/90">
                                Estado {mapExecutionStatus(a.execution_status)} sin fila de
                                resultado en esta carga. Volvé a listar o revisá permisos.
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        </>
        ) : null}
      </div>

      <CopilotActionsEvidenceDrawer
        action={evidenceAction}
        isOpen={isEvidenceOpen && evidenceAction != null}
        onClose={closeEvidenceDrawer}
      />
    </div>
  );
}

