"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bell,
  BookMarked,
  Bot,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Database,
  FileDown,
  FileText,
  Info,
  Landmark,
  ListTodo,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { ManualBlockRenderer } from "@/components/copilot/manual/manual-block-renderer";
import {
  COPILOT_MANUAL_DAILY_FLOW,
  COPILOT_MANUAL_FAQ,
  COPILOT_MANUAL_FIVE_MINUTE_STEPS,
  COPILOT_MANUAL_MODULE_CARDS,
  getCopilotManualWebSections,
} from "@/lib/copilot-manual-content";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

const C = {
  card: "rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/90 shadow-sm",
  ink: "text-[var(--copilot-ink)]",
  muted: "text-[var(--copilot-ink-muted)]",
  accent: "text-[var(--copilot-accent)]",
  border: "border-[var(--copilot-border)]",
} as const;

function NavLink({
  href,
  label,
  ghost,
}: {
  href: string;
  label: string;
  ghost?: boolean;
}) {
  if (ghost) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
      >
        {label}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent)] text-[11px] font-bold text-white">
            {i + 1}
          </span>
          <span className="pt-0.5 text-sm leading-relaxed text-[var(--copilot-ink)]">
            {item}
          </span>
        </li>
      ))}
    </ol>
  );
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  copilot: <Zap className="h-4 w-4" aria-hidden />,
  navegacion: <ChevronRight className="h-4 w-4" aria-hidden />,
  hoy: <ListTodo className="h-4 w-4" aria-hidden />,
  acciones: <CheckSquare className="h-4 w-4" aria-hidden />,
  alertas: <Bell className="h-4 w-4" aria-hidden />,
  clientes: <Users className="h-4 w-4" aria-hidden />,
  cartera: <Landmark className="h-4 w-4" aria-hidden />,
  tesoreria: <Banknote className="h-4 w-4" aria-hidden />,
  finanzas: <Wallet className="h-4 w-4" aria-hidden />,
  datos: <Database className="h-4 w-4" aria-hidden />,
  agentes: <Bot className="h-4 w-4" aria-hidden />,
  reportes: <FileText className="h-4 w-4" aria-hidden />,
  operacional: <Activity className="h-4 w-4" aria-hidden />,
  estado: <AlertTriangle className="h-4 w-4" aria-hidden />,
  campana: <Bell className="h-4 w-4" aria-hidden />,
  problemas: <AlertTriangle className="h-4 w-4" aria-hidden />,
  "roles-permisos": <Users className="h-4 w-4" aria-hidden />,
  "glosario-deuda": <BookMarked className="h-4 w-4" aria-hidden />,
};

const SECTION_NAV: Record<string, Array<{ href: string; label: string; ghost?: boolean }>> = {
  navegacion: [{ href: "/copilot/hoy", label: "Ir a Hoy" }],
  hoy: [{ href: "/copilot/hoy", label: "Ir a Hoy" }],
  acciones: [{ href: "/copilot/acciones", label: "Ir a Acciones" }],
  alertas: [{ href: "/copilot/alertas", label: "Ir a Alertas", ghost: true }],
  clientes: [{ href: "/copilot/clientes", label: "Ir a Clientes" }],
  cartera: [{ href: "/copilot/cartera", label: "Ir a Cartera" }],
  tesoreria: [
    { href: "/copilot/tesoreria", label: "Ir a Tesorería" },
    { href: "/copilot/tesoreria?section=pagos", label: "Ver pagos", ghost: true },
  ],
  finanzas: [{ href: "/copilot/finanzas", label: "Ir a Finanzas" }],
  datos: [{ href: "/copilot/datos", label: "Ir a Datos" }],
  agentes: [{ href: "/copilot/agentes", label: "Ir a Agentes IA" }],
  reportes: [{ href: "/copilot/reportes", label: "Ir a Reportes" }],
  operacional: [
    { href: "/copilot/alertas", label: "Ir a Alertas" },
    { href: "/copilot/datos", label: "Ir a Datos", ghost: true },
  ],
  estado: [
    { href: "/copilot/alertas", label: "Ver Alertas", ghost: true },
    { href: "/copilot/acciones", label: "Ver Acciones", ghost: true },
  ],
  campana: [{ href: "/copilot/alertas", label: "Ver todas las alertas", ghost: true }],
  problemas: [
    { href: "/copilot/alertas", label: "Ir a Alertas", ghost: true },
    { href: "/copilot/acciones", label: "Ir a Acciones", ghost: true },
    { href: "/copilot/datos", label: "Ir a Datos", ghost: true },
  ],
};

const MODULE_ICON_MAP: Record<string, React.ReactNode> = {
  Hoy: <ListTodo className="h-5 w-5" />,
  Acciones: <CheckSquare className="h-5 w-5" />,
  Alertas: <Bell className="h-5 w-5" />,
  Clientes: <Users className="h-5 w-5" />,
  Cartera: <Landmark className="h-5 w-5" />,
  Tesorería: <Banknote className="h-5 w-5" />,
  "Panorama financiero": <Wallet className="h-5 w-5" />,
  Datos: <Database className="h-5 w-5" />,
  "Agentes IA": <Bot className="h-5 w-5" />,
  "Estado del sistema": <Activity className="h-5 w-5" />,
};

const DAILY_FLOW_COLORS = [
  "bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-success-text-strong)]",
  "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  "bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)]",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
  "bg-teal-100 text-teal-800",
  "bg-indigo-100 text-indigo-800",
  "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-danger-text-strong)]",
];

type Section = {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
};

function Accordion({
  sections,
  openIds,
  onToggle,
}: {
  sections: Section[];
  openIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {sections.map((s) => {
        const open = openIds.has(s.id);
        return (
          <div
            key={s.id}
            className={`overflow-hidden rounded-2xl border ${C.border} bg-[var(--copilot-card-bg)]/90`}
          >
            <button
              type="button"
              onClick={() => onToggle(s.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[var(--copilot-soft-bg)]/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(31,107,74,0.08)] text-[var(--copilot-accent)]">
                  {s.icon}
                </span>
                <span className="text-[15px] font-semibold text-[var(--copilot-ink)]">
                  {s.title}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {open && (
              <div className={`space-y-4 border-t ${C.border}/60 px-5 py-5`}>
                {s.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FaqBlock() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {COPILOT_MANUAL_FAQ.map((item, i) => (
        <div
          key={i}
          className={`overflow-hidden rounded-2xl border ${C.border} bg-[var(--copilot-card-bg)]/90`}
        >
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[var(--copilot-soft-bg)]/60"
          >
            <span className="text-sm font-semibold text-[var(--copilot-ink)]">
              {item.q}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {open === i && (
            <div
              className={`border-t ${C.border}/60 px-5 py-4 text-sm leading-relaxed text-[var(--copilot-ink-muted)]`}
            >
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ManualPage() {
  const { modulePermissions } = useCopilotPermissions();
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const sections = useMemo<Section[]>(() => {
    return getCopilotManualWebSections().map((s) => {
      const nav = SECTION_NAV[s.id];
      return {
        id: s.id,
        icon: SECTION_ICONS[s.id] ?? <Info className="h-4 w-4" aria-hidden />,
        title: s.title,
        content: (
          <>
            <ManualBlockRenderer blocks={s.blocks} />
            {nav?.length ? (
              <div className="flex flex-wrap gap-3">
                {nav.map((link) => (
                  <NavLink
                    key={link.href + link.label}
                    href={link.href}
                    label={link.label}
                    ghost={link.ghost}
                  />
                ))}
              </div>
            ) : null}
          </>
        ),
      };
    });
  }, []);

  const dailyFlow =
    COPILOT_MANUAL_DAILY_FLOW.length > 0
      ? COPILOT_MANUAL_DAILY_FLOW
      : [
          { step: 1, label: "Hoy", description: "Mirá caja, pagos y principales deudores.", href: "/copilot/hoy" },
          { step: 2, label: "Estado", description: "Verificá si hay algo urgente en el semáforo.", href: "/copilot/hoy" },
          { step: 3, label: "Acciones", description: "Ejecutá las acciones críticas primero.", href: "/copilot/acciones" },
          { step: 4, label: "Alertas", description: "Revisá novedades del negocio.", href: "/copilot/alertas" },
          { step: 5, label: "Clientes / Cartera", description: "Gestioná cobros atrasados.", href: "/copilot/cartera" },
          { step: 6, label: "Tesorería", description: "Confirmá pagos próximos.", href: "/copilot/tesoreria" },
          { step: 7, label: "Finanzas", description: "Revisá la mirada general si cambiaron cosas.", href: "/copilot/finanzas" },
          { step: 8, label: "Alertas / Datos", description: "Solo si algo parece desactualizado.", href: "/copilot/alertas" },
        ];

  function toggleSection(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (modulePermissions["manual"] === "none") return <AccessDeniedCard />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
                <BookMarked className="h-3 w-3" aria-hidden />
                Guía para usuarios
              </span>
            </div>
            <h1 className="text-xl font-bold text-[var(--copilot-ink)]">Manual de uso</h1>
            <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
              Guía simple para entender qué está pasando en tu negocio y qué hacer después.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <NavLink href="/copilot/hoy" label="Empezar por Hoy" />
            </div>
          </div>
          <a
            href="/api/copilot/manual.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--copilot-ink)] shadow-sm transition hover:bg-[rgba(31,107,74,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
          >
            <FileDown className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
            Descargar PDF
          </a>
        </div>
      </div>

      <div className="space-y-8 px-6 py-6">
        <section>
          <div className={`${C.card} p-6`}>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--copilot-accent)] text-[11px] font-bold text-white">
                ✦
              </span>
              <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                Copilot en 5 minutos
              </h2>
            </div>
            <Steps items={COPILOT_MANUAL_FIVE_MINUTE_STEPS} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Módulos del sistema
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {COPILOT_MANUAL_MODULE_CARDS.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                className={`${C.card} flex flex-col items-center gap-2 p-3 text-center transition hover:shadow-md`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.color}`}
                >
                  {MODULE_ICON_MAP[m.label] ?? <Info className="h-5 w-5" />}
                </span>
                <span className="text-[12px] font-semibold text-[var(--copilot-ink)]">
                  {m.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Guía detallada por módulo
          </h2>
          <Accordion sections={sections} openIds={openIds} onToggle={toggleSection} />
        </section>

        <section>
          <div className={`${C.card} p-6`}>
            <h2 className="mb-1 text-base font-semibold text-[var(--copilot-ink)]">
              Flujo recomendado del día
            </h2>
            <p className="mb-5 text-sm text-[var(--copilot-ink-muted)]">
              Si solo tenés 10 minutos, hacé esto en orden.
            </p>
            <div className="space-y-3">
              {dailyFlow.map((row, i) => (
                <Link
                  key={row.step}
                  href={row.href}
                  className={`flex items-center gap-4 rounded-xl border ${C.border} bg-[var(--copilot-card-bg)]/60 px-4 py-3 transition hover:bg-[var(--copilot-panel-bg)] hover:shadow-sm`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${DAILY_FLOW_COLORS[i] ?? "bg-[var(--copilot-soft-bg)] text-[var(--copilot-text)]"}`}
                  >
                    {row.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                      {row.label}
                    </p>
                    <p className="text-xs text-[var(--copilot-ink-muted)]">{row.description}</p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Preguntas frecuentes
          </h2>
          <FaqBlock />
        </section>

        <div className={`${C.card} flex items-center justify-between gap-4 p-5`}>
          <div>
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">¿Listo para empezar?</p>
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              Empezá por Hoy — la pantalla principal del negocio.
            </p>
          </div>
          <NavLink href="/copilot/hoy" label="Ir a Hoy" />
        </div>
      </div>
    </div>
  );
}
