"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { WorkbookTaskCard } from "@/components/copilot/daily-tasks/workbook-task-card";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { EmptyState as DsEmptyState } from "@/components/copilot/ui/empty-state";
import { SkeletonMetricGrid, SkeletonText } from "@/components/copilot/ui/skeleton";
import {
  COPILOT_GRID_GAP,
  COPILOT_PAGE_GAP,
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotInputClass,
  copilotMetricLabelClass,
  copilotMetricValueClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { MODULE_KEYS, type ModuleKey } from "@/lib/auth/module-permissions";
import {
  DAILY_TASK_PRIORITY_LABELS,
  type DailyTask,
  type DailyTaskPriority,
} from "@/lib/daily-tasks/daily-tasks-types";
import {
  addDaysYmd,
  alertsInput,
  bankInputFromReconMeta,
  portfolioInputs,
  splitTreasuryPayments,
} from "@/lib/daily-tasks/daily-tasks-sources";
import {
  applyInteractions,
  buildWorkbook,
  generateAutomaticTasks,
  type AutoInteraction,
  type AutomaticTaskInput,
  type WorkbookCard,
} from "@/lib/daily-tasks/daily-tasks-workbook";

const MODULE_LABELS: Record<string, string> = {
  hoy: "Hoy",
  clientes: "Clientes",
  cartera: "Cartera",
  cobranza: "Cobranza",
  tesoreria: "Tesorería",
  finanzas: "Finanzas",
  bank_movements: "Banco",
  manual: "General",
};

const MANUAL_MODULE_CHOICES: ModuleKey[] = [
  "cobranza",
  "clientes",
  "cartera",
  "tesoreria",
  "bank_movements",
  "manual",
];

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function readable(level: string | undefined): boolean {
  return level === "read" || level === "write" || level === "admin";
}

type FormState = {
  id: string | null;
  title: string;
  description: string;
  module_key: ModuleKey;
  priority: DailyTaskPriority;
  due_date: string;
};

function emptyForm(): FormState {
  return {
    id: null,
    title: "",
    description: "",
    module_key: "manual",
    priority: "medium",
    due_date: todayYmd(),
  };
}

function formFromCard(card: WorkbookCard): FormState {
  const t = card.manual;
  return {
    id: card.id,
    title: t?.title ?? card.title,
    description: t?.description ?? "",
    module_key: (MODULE_KEYS as readonly string[]).includes(card.moduleKey)
      ? (card.moduleKey as ModuleKey)
      : "manual",
    priority: card.priority,
    due_date: t?.due_date ? t.due_date.slice(0, 10) : "",
  };
}

type Feedback = { tone: "ok" | "error"; message: string } | null;

export function DailyTasksPageClient() {
  const { modulePermissions } = useCopilotPermissions();

  const today = useMemo(() => todayYmd(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [manualTasks, setManualTasks] = useState<DailyTask[]>([]);
  const [interactions, setInteractions] = useState<AutoInteraction[]>([]);
  const [autoInput, setAutoInput] = useState<AutomaticTaskInput>({ today });
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const horizon = addDaysYmd(today, 3);

    const [tasksRes, reconRes, treasuryRes, hubRes, notifRes] = await Promise.allSettled([
      copilotApiFetch("/api/copilot/daily-tasks"),
      copilotApiFetch("/api/copilot/bank-movements/reconciliation?status=pending"),
      copilotApiFetch(
        `/api/copilot/treasury/scheduled-payments?include_summary=1&horizon_end_date=${horizon}`
      ),
      copilotApiFetch("/api/copilot/rutas-hub"),
      copilotApiFetch("/api/copilot/notifications?limit=50"),
    ]);

    // ── Tareas manuales + interacciones automáticas (misma tabla) ──────────────
    let tasksOk = false;
    if (tasksRes.status === "fulfilled") {
      const json = (await tasksRes.value.json().catch(() => null)) as
        | { ok?: boolean; data?: DailyTask[] }
        | null;
      if (json?.ok) {
        tasksOk = true;
        const rows = json.data ?? [];
        setManualTasks(rows.filter((r) => r.source_type !== "auto"));
        setInteractions(
          rows
            .filter((r) => r.source_type === "auto" && r.task_key)
            .map((r) => ({
              task_key: r.task_key as string,
              status: r.status,
              snoozed_until: r.snoozed_until,
              completed_at: r.completed_at,
              due_date: r.due_date,
            }))
        );
      }
    }
    if (!tasksOk) {
      setManualTasks([]);
      setInteractions([]);
    }

    const next: AutomaticTaskInput = { today };

    // ── Banco / conciliación ───────────────────────────────────────────────────
    if (reconRes.status === "fulfilled") {
      const json = (await reconRes.value.json().catch(() => null)) as
        | { ok?: boolean; data?: { meta?: Parameters<typeof bankInputFromReconMeta>[0] } }
        | null;
      if (json?.ok && json.data?.meta) next.bank = bankInputFromReconMeta(json.data.meta);
    }

    // ── Tesorería ──────────────────────────────────────────────────────────────
    if (treasuryRes.status === "fulfilled") {
      const json = (await treasuryRes.value.json().catch(() => null)) as
        | { ok?: boolean; data?: { items?: unknown } }
        | { items?: unknown }
        | null;
      const items = extractTreasuryItems(json);
      const { due, upcoming } = splitTreasuryPayments(items, today, 3);
      if (due.length > 0) next.treasuryDueToday = due;
      if (upcoming.length > 0) next.treasuryUpcoming = upcoming;
    }

    // ── Cartera / clientes (portfolio del hub) ─────────────────────────────────
    if (hubRes.status === "fulfilled") {
      const json = (await hubRes.value.json().catch(() => null)) as Record<string, unknown> | null;
      const rows = extractPortfolioRows(json);
      const { overdueClients, overdueByCurrency, criticalClients } = portfolioInputs(rows);
      if (overdueClients.length > 0) {
        next.overdueClients = overdueClients;
        next.overdueByCurrency = overdueByCurrency;
      }
      if (criticalClients.length > 0) next.criticalClients = criticalClients;
    }

    // ── Alertas ────────────────────────────────────────────────────────────────
    if (notifRes.status === "fulfilled") {
      const json = (await notifRes.value.json().catch(() => null)) as
        | { notifications?: Parameters<typeof alertsInput>[0] }
        | null;
      const alerts = alertsInput(json?.notifications);
      if (alerts.active > 0) next.alerts = alerts;
    }

    setAutoInput(next);

    // Solo error duro si ni siquiera la fuente primaria respondió.
    if (!tasksOk && tasksRes.status === "rejected") setError(true);
    setLoading(false);
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // ── Ensamblado del cuaderno (tiempo real) ────────────────────────────────────
  const { sections, counters } = useMemo(() => {
    const hasPerms = Object.keys(modulePermissions).length > 0;
    const generated = generateAutomaticTasks(autoInput).filter(
      (t) => !hasPerms || readable(modulePermissions[t.moduleKey])
    );
    const buckets = applyInteractions(generated, interactions, today);
    return buildWorkbook({
      today,
      autoActive: buckets.active,
      autoCompletedToday: buckets.completedToday,
      autoPostponed: buckets.postponed,
      manualTasks,
    });
  }, [autoInput, interactions, manualTasks, modulePermissions, today]);

  const summaryCards = [
    { label: "Urgentes", value: counters.urgent },
    { label: "Importantes", value: counters.important },
    { label: "Para hoy", value: counters.today },
    { label: "Completadas", value: counters.completed },
  ];

  // ── Persistencia de interacciones ────────────────────────────────────────────
  const postInteraction = useCallback(
    async (card: WorkbookCard, action: "complete" | "reopen" | "ignore_today" | "snooze") => {
      setBusyId(card.id);
      try {
        const body: Record<string, unknown> = {
          task_key: card.taskKey,
          action,
          module_key: card.moduleKey,
          title: card.title,
          origin: card.origin,
        };
        if (action === "snooze") body.snoozed_until = addDaysYmd(today, 1);
        const res = await copilotApiFetch("/api/copilot/daily-tasks/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          setFeedback({ tone: "error", message: json?.error ?? "No se pudo guardar la acción." });
          return;
        }
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load, today]
  );

  const patchManual = useCallback(
    async (card: WorkbookCard, patch: Record<string, unknown>, okMsg: string) => {
      setBusyId(card.id);
      try {
        const res = await copilotApiFetch(`/api/copilot/daily-tasks/${card.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          setFeedback({ tone: "error", message: json?.error ?? "No se pudo actualizar." });
          return;
        }
        setFeedback({ tone: "ok", message: okMsg });
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const onComplete = useCallback(
    (card: WorkbookCard) => {
      if (card.kind === "auto") void postInteraction(card, "complete");
      else void patchManual(card, { status: "done" }, "Tarea completada.");
    },
    [postInteraction, patchManual]
  );

  const onReopen = useCallback(
    (card: WorkbookCard) => {
      if (card.kind === "auto") void postInteraction(card, "reopen");
      else void patchManual(card, { status: "pending" }, "Tarea reabierta.");
    },
    [postInteraction, patchManual]
  );

  const onSecondary = useCallback(
    (card: WorkbookCard) => {
      if (card.kind === "auto") {
        // "Ignorar por hoy" o "Posponer" según la tarea.
        const action = card.secondaryLabel === "Posponer" ? "snooze" : "ignore_today";
        void postInteraction(card, action);
      } else {
        void patchManual(card, { status: "postponed" }, "Tarea pospuesta.");
      }
    },
    [postInteraction, patchManual]
  );

  const onDelete = useCallback(
    async (card: WorkbookCard) => {
      if (!window.confirm("¿Eliminar esta tarea?")) return;
      setBusyId(card.id);
      try {
        const res = await copilotApiFetch(`/api/copilot/daily-tasks/${card.id}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          setFeedback({ tone: "error", message: json?.error ?? "No se pudo eliminar." });
          return;
        }
        setFeedback({ tone: "ok", message: "Tarea eliminada." });
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const submitForm = useCallback(async () => {
    if (!form) return;
    if (!form.title.trim()) {
      setFeedback({ tone: "error", message: "Escribí qué hay que hacer." });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        module_key: form.module_key,
        priority: form.priority,
        due_date: form.due_date || null,
      };
      const res = await copilotApiFetch(
        form.id ? `/api/copilot/daily-tasks/${form.id}` : "/api/copilot/daily-tasks",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setFeedback({ tone: "error", message: json?.error ?? "No se pudo guardar la tarea." });
        return;
      }
      setForm(null);
      setFeedback({ tone: "ok", message: form.id ? "Tarea actualizada." : "Tarea creada." });
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [form, load]);

  const cardHandlers = {
    onComplete,
    onReopen,
    onSecondary,
    onEdit: (card: WorkbookCard) => setForm(formFromCard(card)),
    onDelete,
  };

  const hasAnything =
    sections.urgent.length +
      sections.today.length +
      sections.manual.length +
      sections.completedToday.length +
      sections.postponed.length >
    0;

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        title="Mi cuaderno de trabajo"
        description="Tus tareas, seguimientos y acciones sugeridas para hoy."
        right={
          <button
            type="button"
            onClick={() => setForm(form ? null : emptyForm())}
            className={copilotButtonClassName({ variant: "primary", size: "sm" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Nueva tarea
          </button>
        }
      />

      {feedback ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            feedback.tone === "ok"
              ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
              : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className={`grid grid-cols-2 lg:grid-cols-4 ${COPILOT_GRID_GAP}`}>
        {summaryCards.map((card) => (
          <div key={card.label} className={copilotCardStandardClass}>
            <p className={copilotMetricLabelClass}>{card.label}</p>
            <p className={copilotMetricValueClass}>{loading ? "…" : card.value}</p>
          </div>
        ))}
      </div>

      {form ? (
        <TaskForm
          form={form}
          submitting={submitting}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSubmit={submitForm}
        />
      ) : null}

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <div role="status" aria-label="Cargando el cuaderno de trabajo" className="space-y-4">
          <SkeletonMetricGrid count={4} />
          <section className={copilotCardStandardClass}>
            <SkeletonText lines={4} />
          </section>
          <span className="sr-only">Cargando el cuaderno de trabajo…</span>
        </div>
      ) : !hasAnything ? (
        <DailyTasksEmptyState />
      ) : (
        <div className="flex flex-col gap-5">
          <Section
            title="Para resolver primero"
            hint="Lo más urgente de hoy."
            cards={sections.urgent}
            handlers={cardHandlers}
            busyId={busyId}
          />
          <Section
            title="También para hoy"
            cards={sections.today}
            handlers={cardHandlers}
            busyId={busyId}
          />
          <Section
            title="Pendientes"
            hint="Tareas que creaste."
            cards={sections.manual}
            handlers={cardHandlers}
            busyId={busyId}
          />
          <CollapsibleSection
            title={`Completadas hoy (${sections.completedToday.length})`}
            cards={sections.completedToday}
            handlers={cardHandlers}
            busyId={busyId}
          />
          <CollapsibleSection
            title={`Pospuestas (${sections.postponed.length})`}
            cards={sections.postponed}
            handlers={cardHandlers}
            busyId={busyId}
          />
        </div>
      )}
    </div>
  );
}

type CardHandlers = {
  onComplete: (c: WorkbookCard) => void;
  onReopen: (c: WorkbookCard) => void;
  onSecondary: (c: WorkbookCard) => void;
  onEdit: (c: WorkbookCard) => void;
  onDelete: (c: WorkbookCard) => void;
};

function Section({
  title,
  hint,
  cards,
  handlers,
  busyId,
}: {
  title: string;
  hint?: string;
  cards: WorkbookCard[];
  handlers: CardHandlers;
  busyId: string | null;
}) {
  if (cards.length === 0) return null;
  return (
    <section>
      <div className="mb-2">
        <h2 className={copilotSectionTitleClass}>{title}</h2>
        {hint ? <p className={copilotCaptionClass}>{hint}</p> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <WorkbookTaskCard
            key={`${card.kind}:${card.id}`}
            card={card}
            busy={busyId === card.id}
            onComplete={handlers.onComplete}
            onReopen={handlers.onReopen}
            onSecondary={handlers.onSecondary}
            onEdit={handlers.onEdit}
            onDelete={handlers.onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function CollapsibleSection(props: {
  title: string;
  cards: WorkbookCard[];
  handlers: CardHandlers;
  busyId: string | null;
}) {
  const { title, cards } = props;
  if (cards.length === 0) return null;
  return (
    <details className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-3">
      <summary className={`cursor-pointer ${copilotSectionTitleClass}`}>{title}</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <WorkbookTaskCard
            key={`${card.kind}:${card.id}`}
            card={card}
            busy={props.busyId === card.id}
            onComplete={props.handlers.onComplete}
            onReopen={props.handlers.onReopen}
            onSecondary={props.handlers.onSecondary}
            onEdit={props.handlers.onEdit}
            onDelete={props.handlers.onDelete}
          />
        ))}
      </div>
    </details>
  );
}

function DailyTasksEmptyState() {
  return (
    <DsEmptyState
      title="Todo al día"
      description="No hay acciones urgentes para hoy."
      action={
        <div className="flex flex-wrap justify-center gap-2">
        <QuickLink href="/copilot/movimientos-bancarios" label="Ver Banco" />
        <QuickLink href="/copilot/tesoreria" label="Ver Tesorería" />
        <QuickLink href="/copilot/cartera" label="Ver Cartera" />
      </div>
      }
    />
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
      {label}
    </a>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <DsEmptyState
      title="No pudimos cargar el cuaderno de trabajo"
      description="Reintentá la carga para recuperar tus tareas y acciones sugeridas."
      action={
        <button
          type="button"
          onClick={onRetry}
          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
        >
          Reintentar
        </button>
      }
    />
  );
}

function TaskForm({
  form,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  submitting: boolean;
  onChange: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">
          {form.id ? "Editar tarea" : "Nueva tarea"}
        </h3>
        <button type="button" onClick={onCancel} aria-label="Cerrar" className="text-[var(--copilot-muted)]">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">¿Qué hay que hacer?</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            className={copilotInputClass}
            maxLength={200}
            placeholder="Ej.: Llamar al proveedor por la factura"
            required
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Detalle (opcional)</span>
          <textarea
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className={copilotInputClass}
            rows={2}
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Área</span>
          <select
            value={form.module_key}
            onChange={(e) => onChange({ ...form, module_key: e.target.value as ModuleKey })}
            className={copilotInputClass}
          >
            {MANUAL_MODULE_CHOICES.map((k) => (
              <option key={k} value={k}>
                {MODULE_LABELS[k] ?? k}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Prioridad</span>
          <select
            value={form.priority}
            onChange={(e) => onChange({ ...form, priority: e.target.value as DailyTaskPriority })}
            className={copilotInputClass}
          >
            <option value="high">{DAILY_TASK_PRIORITY_LABELS.high}</option>
            <option value="medium">{DAILY_TASK_PRIORITY_LABELS.medium}</option>
            <option value="low">{DAILY_TASK_PRIORITY_LABELS.low}</option>
          </select>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">¿Para cuándo?</span>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => onChange({ ...form, due_date: e.target.value })}
            className={copilotInputClass}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
        >
          {submitting ? "Guardando…" : form.id ? "Guardar" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

// ─── Extractores defensivos de payloads ───────────────────────────────────────

function extractTreasuryItems(json: unknown): Parameters<typeof splitTreasuryPayments>[0] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const data = (root.data as Record<string, unknown> | undefined) ?? root;
  const items = data.items ?? data.payments ?? data.scheduled;
  return Array.isArray(items) ? (items as Parameters<typeof splitTreasuryPayments>[0]) : [];
}

function extractPortfolioRows(json: unknown): Parameters<typeof portfolioInputs>[0] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const portfolio = root.portfolio as Record<string, unknown> | undefined;
  const rows = portfolio?.rows;
  return Array.isArray(rows) ? (rows as Parameters<typeof portfolioInputs>[0]) : [];
}
