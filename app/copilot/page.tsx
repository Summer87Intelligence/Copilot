"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { CopilotTaxEvidenceDrawer } from "@/components/copilot/copilot-tax-evidence-drawer";
import { CopilotHomeQuickLinks } from "@/components/copilot/copilot-home-quick-links";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import { PeriodSelect } from "@/components/copilot/period-select";
import { CopilotDifferentiatorStrip } from "@/components/copilot/copilot-differentiator-strip";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryLink,
  CopilotSectionTitle,
  CopilotGhostLink,
} from "@/components/copilot/copilot-ui";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";
import {
  formatTaxAgendaDateShort,
  getTaxObligationAmountDisplay,
  mapTaxObligationStatus,
  mapTaxTypeLabel,
  sharedObligationPaymentStatusPillClass,
  taxPriorityToSeverity,
} from "@/lib/copilot-format";
import { getUpcomingTaxAgenda, type TaxAgendaItem } from "@/lib/copilot-tax-data";
import {
  getFinancialSnapshot,
  type FinancialSnapshot,
} from "@/lib/copilot-financial-engine";
import {
  COPILOT_EMPTY_COPY,
  isCopilotHomeExecutiveEmpty,
  totalFiscalAlerts,
} from "@/lib/copilot-empty-state";
import {
  getFiscalAlerts,
  type FiscalAlertItem,
} from "@/lib/copilot-tax-alerts";

function daysFromToday(ymd: string): number {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const d = new Date(ymd + "T12:00:00");
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

function isAgendaOverdue(o: TaxAgendaItem): boolean {
  const diff = daysFromToday(o.due_date.slice(0, 10));
  return diff < 0 && o.status.toLowerCase() !== "paid";
}

function isAgendaCritical(o: TaxAgendaItem): boolean {
  return o.priority.toLowerCase() === "critical";
}

function isAgendaUrgent(o: TaxAgendaItem): boolean {
  if (isAgendaCritical(o)) return true;
  const diff = daysFromToday(o.due_date.slice(0, 10));
  if (isAgendaOverdue(o)) return true;
  return diff >= 0 && diff <= 3;
}

function urgentBadgeLabel(o: TaxAgendaItem): string {
  const diff = daysFromToday(o.due_date.slice(0, 10));
  if (diff < 0) return "A regularizar";
  if (diff <= 3) return "Vence pronto";
  if (o.priority.toLowerCase() === "critical") return "Crítico";
  return "Atención";
}

function formatMoneyHome(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function formatCoverageHome(r: number): string {
  if (!Number.isFinite(r) || r > 100) return "—";
  return `${r.toFixed(2)}×`;
}

export default function CopilotHomePage() {
  const [period, setPeriod] = useState("mar-2026");
  const [taxAgenda, setTaxAgenda] = useState<TaxAgendaItem[]>([]);
  const [taxAgendaLoading, setTaxAgendaLoading] = useState(true);
  const [taxAgendaError, setTaxAgendaError] = useState<string | null>(null);
  const [taxDrawerObligationId, setTaxDrawerObligationId] = useState<string | null>(
    null
  );
  const [financialSnapshot, setFinancialSnapshot] = useState<FinancialSnapshot | null>(
    null
  );
  const [financialLoading, setFinancialLoading] = useState(true);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [fiscalAlerts, setFiscalAlerts] = useState<FiscalAlertItem[]>([]);
  const [fiscalLoading, setFiscalLoading] = useState(true);

  const fiscalCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0 };
    for (const a of fiscalAlerts) {
      c[a.priority] += 1;
    }
    return c;
  }, [fiscalAlerts]);

  const fiscalSorted = useMemo(
    () =>
      [...fiscalAlerts].sort((a, b) => {
        const order: Record<FiscalAlertItem["priority"], number> = {
          critical: 0,
          high: 1,
          medium: 2,
        };
        const d = order[a.priority] - order[b.priority];
        if (d !== 0) return d;
        return a.id.localeCompare(b.id);
      }),
    [fiscalAlerts]
  );
  const featuredFiscal = fiscalSorted[0];

  const executiveEmpty = useMemo(
    () =>
      isCopilotHomeExecutiveEmpty({
        taxAgendaLength: taxAgenda.length,
        fiscalCounts,
        snapshot: financialSnapshot,
        financialLoading,
        taxLoading: taxAgendaLoading,
        fiscalLoading,
      }),
    [
      taxAgenda.length,
      fiscalCounts,
      financialSnapshot,
      financialLoading,
      taxAgendaLoading,
      fiscalLoading,
    ]
  );

  const agendaGroups = useMemo(() => {
    const estaSemana: TaxAgendaItem[] = [];
    const proximos15: TaxAgendaItem[] = [];
    const masAdelante: TaxAgendaItem[] = [];
    for (const o of taxAgenda) {
      const diff = daysFromToday(o.due_date.slice(0, 10));
      if (diff < 0 || (diff >= 0 && diff <= 6)) estaSemana.push(o);
      else if (diff >= 7 && diff <= 21) proximos15.push(o);
      else masAdelante.push(o);
    }
    return { estaSemana, proximos15, masAdelante };
  }, [taxAgenda]);

  const agendaHasRows =
    agendaGroups.estaSemana.length +
      agendaGroups.proximos15.length +
      agendaGroups.masAdelante.length >
    0;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setTaxAgendaLoading(true);
      try {
        const rows = await getUpcomingTaxAgenda();
        if (!cancelled) {
          setTaxAgenda(rows);
          setTaxAgendaError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setTaxAgenda([]);
          setTaxAgendaError(
            e instanceof Error ? e.message : "No se cargó la agenda fiscal."
          );
        }
      } finally {
        if (!cancelled) setTaxAgendaLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setFinancialLoading(true);
      try {
        const snap = await getFinancialSnapshot();
        if (!cancelled) {
          setFinancialSnapshot(snap);
          setFinancialError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setFinancialSnapshot(null);
          setFinancialError(
            e instanceof Error ? e.message : "No se cargó el snapshot financiero."
          );
        }
      } finally {
        if (!cancelled) setFinancialLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFiscalLoading(true);
    const run = async () => {
      try {
        const list = await getFiscalAlerts();
        if (!cancelled) {
          setFiscalAlerts(list);
        }
      } catch {
        if (!cancelled) {
          setFiscalAlerts([]);
        }
      } finally {
        if (!cancelled) {
          setFiscalLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        eyebrow="Summer87 Copilot"
        title="Inicio"
        description="Punto de entrada del módulo: lectura sobre datos reales (`proto_*`), alertas fiscales y acceso al motor de oportunidades — sin cifras de demostración cuando la base está vacía."
        readingKey={
          <CopilotReadingKey
            lines={[
              "Acá empieza todo.",
              "Entiendo el sistema.",
              "Sé por dónde avanzar.",
            ]}
          />
        }
        right={
          <CopilotPrimaryLink href="/copilot/gestion-ia" className="gap-2 whitespace-nowrap">
            Ir a Gestión IA
          </CopilotPrimaryLink>
        }
      />

      <div className="flex-1 space-y-10 overflow-auto px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--copilot-border)] pb-6">
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            Vista del panel ejecutivo · período analizado
          </p>
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>

        <CopilotHomeQuickLinks />

        {executiveEmpty ? (
          <CopilotEmptyPanel
            title={COPILOT_EMPTY_COPY.homeBanner.title}
            paragraphs={COPILOT_EMPTY_COPY.homeBanner.paragraphs}
            example={COPILOT_EMPTY_COPY.homeBanner.ctaHint}
            importance="Importante: vaciar tablas es válido en prototipo; el Copilot no rellena huecos con historias simuladas."
          />
        ) : null}

        <section>
          <CopilotCard className="border-[rgba(31,107,74,0.14)] bg-[rgba(31,107,74,0.025)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CopilotSectionTitle
                title="Liquidez y cobertura"
                subtitle="Misma base que Finanzas y alertas fiscales: proto recibos, pagos, facturas y obligaciones."
                action={
                  <Link
                    href="/copilot/finanzas"
                    className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
                  >
                    Ver en Finanzas
                  </Link>
                }
              />
              {financialSnapshot && !financialLoading ? (
                <CopilotSeverityBadge severity={financialSnapshot.risk_level} />
              ) : null}
            </div>
            <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
              Basado en flujo real de ingresos, egresos y obligaciones fiscales.
            </p>
            {financialLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Cargando panorama financiero…
              </div>
            ) : null}
            {financialError ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                {financialError}
              </div>
            ) : null}
            {!financialLoading && !financialError && financialSnapshot ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Caja disponible
                  </p>
                  <p className="mt-2 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                    {formatMoneyHome(financialSnapshot.available_cash)}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Cobertura
                  </p>
                  <p className="mt-2 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                    {formatCoverageHome(financialSnapshot.coverage_ratio)}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Balance proyectado
                  </p>
                  <p className="mt-2 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                    {formatMoneyHome(financialSnapshot.projected_balance)}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Egresos esperados
                  </p>
                  <p className="mt-2 text-lg font-semibold tabular-nums text-red-600">
                    {formatMoneyHome(financialSnapshot.expected_outflows)}
                  </p>
                </div>
              </div>
            ) : null}
          </CopilotCard>
        </section>

        <section>
          <CopilotCard className="border-[rgba(31,107,74,0.15)] bg-[rgba(31,107,74,0.03)]">
            <CopilotSectionTitle
              title="Próximos vencimientos"
              subtitle="Mes actual + primeros 15 días del próximo · cobertura con probabilidad de cobro por factura"
              action={
                <Link
                  href="/copilot/finanzas"
                  className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Ver en Finanzas
                </Link>
              }
            />
            {taxAgendaLoading ? (
              <p className="py-8 text-sm text-[var(--copilot-ink-muted)]">
                Cargando agenda fiscal…
              </p>
            ) : null}
            {taxAgendaError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                {taxAgendaError} · Si aún no migraste las tablas proto, ejecutá el SQL de
                capa fiscal en Supabase.
              </div>
            ) : null}
            {!taxAgendaLoading && !taxAgendaError && !agendaHasRows ? (
              <div className="space-y-3 py-6 text-sm text-[var(--copilot-ink-muted)]">
                <p>
                  No hay obligaciones fiscales en esta ventana: o no cargaste vencimientos
                  en `proto_tax_obligations`, o ninguna cae en el horizonte que usa el
                  Copilot.
                </p>
                <p>
                  Ejemplo: una obligación IVA con fecha de vencimiento en los próximos
                  días aparece acá con su cobertura respecto de cobros esperados. Revisá
                  también{" "}
                  <Link
                    href="/copilot/finanzas"
                    className="font-semibold text-[var(--copilot-accent)] hover:underline"
                  >
                    Finanzas
                  </Link>{" "}
                  o el calendario contable.
                </p>
              </div>
            ) : null}
            {!taxAgendaLoading && !taxAgendaError && agendaHasRows ? (
              <div className="space-y-8">
                {[
                  {
                    key: "week",
                    label: "Esta semana",
                    hint: "Vencidas abiertas y vencimientos en los próximos 7 días.",
                    rows: agendaGroups.estaSemana,
                  },
                  {
                    key: "15",
                    label: "Próximos 15 días",
                    hint: "Del día 8 al 21 respecto de hoy (dentro del horizonte cargado).",
                    rows: agendaGroups.proximos15,
                  },
                  {
                    key: "later",
                    label: "Más adelante",
                    hint: "Resto de la ventana hasta el 15 del mes siguiente.",
                    rows: agendaGroups.masAdelante,
                  },
                ]
                  .filter((g) => g.rows.length > 0)
                  .map((g) => (
                    <div key={g.key}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink)]">
                        {g.label}
                      </p>
                      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{g.hint}</p>
                      <ul className="mt-3 space-y-2">
                        {g.rows.map((o) => {
                          const urgent = isAgendaUrgent(o);
                          const overdue = isAgendaOverdue(o);
                          const critical = isAgendaCritical(o);
                          const openDrawer = o.id === taxDrawerObligationId;
                          const amount = getTaxObligationAmountDisplay(
                            o.estimated_amount,
                            o.confirmed_amount
                          );
                          const compactLine = [
                            formatTaxAgendaDateShort(o.due_date),
                            mapTaxTypeLabel(o.tax_type),
                            o.period_label,
                            amount.text,
                          ].join(" · ");
                          return (
                            <li
                              key={o.id}
                              className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                                overdue
                                  ? "border-rose-300/90 bg-rose-50/70 ring-1 ring-rose-200/70"
                                  : critical
                                    ? "border-amber-200/95 bg-amber-50/45 ring-1 ring-amber-200/50"
                                    : urgent
                                      ? "border-rose-200/90 bg-rose-50/50 ring-1 ring-rose-200/60"
                                      : "border-[var(--copilot-border)] bg-white/85"
                              } ${openDrawer ? "ring-2 ring-[rgba(31,107,74,0.22)]" : ""}`}
                            >
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <CopilotSeverityBadge
                                    severity={taxPriorityToSeverity(o.priority)}
                                  />
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                      o.coverage_status === "critical"
                                        ? "bg-rose-100 text-rose-900"
                                        : o.coverage_status === "risk"
                                          ? "bg-amber-100 text-amber-950"
                                          : "bg-emerald-100/90 text-emerald-900"
                                    }`}
                                  >
                                    {o.coverage_status === "critical"
                                      ? "Crítico"
                                      : o.coverage_status === "risk"
                                        ? "Riesgo"
                                        : "Cubierto"}
                                  </span>
                                  {urgent ? (
                                    <span className="rounded-full bg-rose-100/90 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
                                      {urgentBadgeLabel(o)}
                                    </span>
                                  ) : null}
                                  {overdue ? (
                                    <span className="rounded-full bg-rose-200/80 px-2 py-0.5 text-[11px] font-semibold text-rose-950">
                                      Vencida
                                    </span>
                                  ) : null}
                                  <span
                                    className={sharedObligationPaymentStatusPillClass(o.status)}
                                  >
                                    {mapTaxObligationStatus(o.status)}
                                  </span>
                                </div>
                                <p className="font-medium leading-snug text-[var(--copilot-ink)]">
                                  {compactLine}
                                </p>
                                <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                                  {o.coverage_explanation}
                                </p>
                                {amount.source === "estimado" ? (
                                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                                    Monto estimado · confirmá el valor en respaldo o Finanzas
                                  </p>
                                ) : (
                                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                                    Monto confirmado
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                                <CopilotGhostButton
                                  type="button"
                                  className="px-3 py-2 text-xs"
                                  onClick={() => setTaxDrawerObligationId(o.id)}
                                >
                                  Ver respaldo
                                </CopilotGhostButton>
                                <CopilotGhostLink
                                  href="/copilot/finanzas"
                                  className="px-3 py-2 text-xs"
                                >
                                  Abrir en Finanzas
                                </CopilotGhostLink>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
              </div>
            ) : null}
          </CopilotCard>
        </section>

        <CopilotDifferentiatorStrip />

        <section>
          <CopilotSectionTitle
            title="Alertas principales"
            subtitle={
              totalFiscalAlerts(fiscalCounts) > 0
                ? "Conteo solo desde alertas fiscales reales (obligaciones y caja). Sin datos de demostración."
                : "Cuando no hay señales, los contadores quedan en cero."
            }
            action={
              <Link
                href="/copilot/alertas"
                className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
              >
                Ver todas
              </Link>
            }
          />
          {totalFiscalAlerts(fiscalCounts) > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-4 text-center">
                  <p className="text-2xl font-semibold text-rose-900">
                    {fiscalCounts.critical}
                  </p>
                  <p className="text-xs font-medium text-rose-800/90">Críticas</p>
                </div>
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-4 text-center">
                  <p className="text-2xl font-semibold text-amber-900">
                    {fiscalCounts.high}
                  </p>
                  <p className="text-xs font-medium text-amber-900/90">Altas</p>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 p-4 text-center">
                  <p className="text-2xl font-semibold text-slate-800">
                    {fiscalCounts.medium}
                  </p>
                  <p className="text-xs font-medium text-slate-700">Medias</p>
                </div>
              </div>
              {featuredFiscal ? (
                <div className="mt-5 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Destacada (fiscal)
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">
                    {featuredFiscal.title}
                  </p>
                  <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                    {featuredFiscal.summary}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <CopilotEmptyPanel
              title={COPILOT_EMPTY_COPY.homeAlertsWhenEmpty.panelTitle}
              paragraphs={COPILOT_EMPTY_COPY.homeAlertsWhenEmpty.paragraphs}
              example={COPILOT_EMPTY_COPY.homeAlertsWhenEmpty.example}
            />
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <CopilotCard>
            <CopilotSectionTitle
              title="Operación y datos"
              subtitle="Sin lista inventada: enlaces a donde se cargan decisiones y tareas reales."
              action={
                <Link
                  href="/copilot/acciones"
                  className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Ir a acciones
                </Link>
              }
            />
            <ul className="space-y-3 text-sm text-[var(--copilot-ink-muted)]">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                <span>
                  Altas y tablas `proto_*` en{" "}
                  <Link
                    href="/copilot/datos"
                    className="font-semibold text-[var(--copilot-accent)] hover:underline"
                  >
                    Datos
                  </Link>
                  .
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                <span>
                  Iniciativas y decisiones en{" "}
                  <Link
                    href="/copilot/gestion-ia"
                    className="font-semibold text-[var(--copilot-accent)] hover:underline"
                  >
                    Gestión IA
                  </Link>
                  .
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                <span>
                  Caja y obligaciones en{" "}
                  <Link
                    href="/copilot/finanzas"
                    className="font-semibold text-[var(--copilot-accent)] hover:underline"
                  >
                    Finanzas
                  </Link>
                  .
                </span>
              </li>
            </ul>
            <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
              Las tareas priorizadas aparecen cuando existan iniciativas o reglas conectadas a
              tus datos — no mostramos pasos genéricos como si fueran el estado de tu
              negocio.
            </p>
          </CopilotCard>

          <CopilotCard>
            <CopilotSectionTitle
              title="Escenarios"
              subtitle="La comparación estructurada requiere motor enlazado a tus datos."
              action={
                <Link
                  href="/copilot/escenarios"
                  className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Abrir escenarios
                </Link>
              }
            />
            <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
              Quitamos las cifras de demostración. En base vacía o sin simulación conectada,
              la pantalla de escenarios explica qué falta en lugar de mostrar narrativa
              ficticia.
            </p>
          </CopilotCard>
        </section>
      </div>

      <CopilotTaxEvidenceDrawer
        obligationId={taxDrawerObligationId}
        isOpen={taxDrawerObligationId != null}
        onClose={() => setTaxDrawerObligationId(null)}
      />
    </div>
  );
}
