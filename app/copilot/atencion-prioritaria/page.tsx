"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { CopilotHoyReturnLink } from "@/components/copilot/copilot-hoy-return-link";
import { CopilotTaxEvidenceDrawer } from "@/components/copilot/copilot-tax-evidence-drawer";
import { CopilotCollapsiblePanel } from "@/components/copilot/copilot-collapsible-panel";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { useCopilotAlerts } from "@/components/copilot/copilot-alerts-context";
import {
  buildAttentionCaseContent,
  pickPrimaryCaseForLevel,
  type AttentionCaseContent,
} from "@/lib/copilot-attention-case";
import { mapAlertCategory, mapTaxObligationStatus, mapTaxTypeLabel } from "@/lib/copilot-format";
import type { FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import {
  getFinancialSnapshot,
  type FinancialSnapshotApiV1,
} from "@/lib/copilot-financial-engine";
import {
  snapshotCashNet,
  snapshotCoverageRatio,
  snapshotExpectedOutflowsTotal,
  snapshotLiquidityBalance,
  snapshotReceivablesRiskWeighted,
  snapshotRiskBand,
} from "@/lib/copilot-financial-snapshot-selectors";
import {
  getProtoTaxObligationById,
  type ProtoTaxObligation,
} from "@/lib/copilot-tax-data";
import { traceFromAttentionPrimary } from "@/lib/copilot-trace-meta";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";

/** Formatea montos de obligaciones fiscales (siempre UYU en Uruguay). */
function formatObligationMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return formatMoneyCurrency(n, "UYU");
}

/** Formatea agregados mixtos UYU+USD sin símbolo de moneda (no se asume UYU). */
function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

function formatRatio(r: number): string {
  if (!Number.isFinite(r) || r > 99) return "—";
  return `${r.toFixed(2)}×`;
}

const priorityLabel = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
} as const;

function obligationAmount(o: ProtoTaxObligation): number {
  return o.confirmed_amount != null && o.confirmed_amount > 0
    ? o.confirmed_amount
    : o.estimated_amount;
}

function buildPlanRecomendado(
  primary: FiscalAlertItem,
  content: AttentionCaseContent,
  snapshot: FinancialSnapshotApiV1 | null,
  obligation: ProtoTaxObligation | null
): { primero: string; despues: string; evitar: string } {
  const steps = content.planSteps;
  let primero = steps[0] ?? "";
  let despues = steps[1] ?? steps[2] ?? "";

  if (obligation && primary.type === "fiscalidad") {
    const due = new Date(obligation.due_date).toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    primero = `Confirmar monto y vencimiento de ${mapTaxTypeLabel(obligation.tax_type)} (${formatObligationMoney(obligationAmount(obligation))}) y ejecutar el pago o acreditación antes del ${due}; registrar el resultado en Datos para que baje la alerta.`;
    despues =
      steps[1] ??
      "Abrir respaldo documental y dejar evidencia alineada con lo informado a organismos.";
  } else if (primary.type === "liquidez" || primary.type === "cobertura") {
    if (snapshot) {
      primero = `Cerrar el hueco de caja: priorizar cobros con mayor probabilidad de ingreso (cobranza esperada: ${formatMoney(snapshotReceivablesRiskWeighted(snapshot))}) frente a egresos modelados (${formatMoney(snapshotExpectedOutflowsTotal(snapshot))}).`;
      despues =
        steps[1] ??
        "En Finanzas, validar qué pagos fiscales u operativos pueden moverse sin romper compromisos ya comunicados.";
    } else {
      primero =
        steps[0] ??
        "Pedir a finanzas el detalle de egresos próximos 30 días y cruzarlo con caja disponible hoy.";
      despues = steps[1] ?? "Listar facturas con mayor probabilidad de cobro y asignar responsable de seguimiento.";
    }
  } else if (primary.type === "conciliacion") {
    primero =
      steps[0] ??
      "En Datos, localizar el pago u operación que no calza con la obligación y corregir vínculo o categoría.";
    despues = steps[1] ?? "Verificar que Finanzas refleje el mismo estado que la obligación fiscal.";
  }

  if (!primero.trim()) {
    primero =
      "Asignar un responsable único y una fecha límite hoy para cerrar la lectura del caso (monto, fecha, documento).";
  }
  if (!despues.trim()) {
    despues =
      "Revisar en Finanzas el panorama de liquidez y la agenda fiscal para asegurar que no haya un segundo vencimiento en sombra.";
  }

  let evitar = "";
  if (snapshot && snapshotLiquidityBalance(snapshot) < 0) {
    evitar = `Evitar asumir gastos discrecionales o nuevos compromisos de pago hasta tener cobro concreto o acuerdo por escrito; el déficit proyectado es ${formatMoney(snapshotLiquidityBalance(snapshot))}.`;
  } else if (
    snapshot &&
    snapshotCoverageRatio(snapshot) < 1 &&
    Number.isFinite(snapshotCoverageRatio(snapshot))
  ) {
    evitar = `Evitar posponer seguimiento de cobranza “para más adelante”: con cobertura ${formatRatio(snapshotCoverageRatio(snapshot))}, un solo desvío de ingreso vuelve a poner en riesgo el cumplimiento.`;
  } else if (primary.priority === "critical") {
    evitar =
      "Evitar cerrar el caso solo “de palabra”: sin registro en Datos el semáforo seguirá en rojo y podés duplicar esfuerzo con el equipo.";
  } else {
    evitar =
      "Evitar dispersar la conversación en varios canales sin acta breve de decisión (qué se paga, cuándo y quién confirma).";
  }

  return { primero, despues, evitar };
}

function buildConsecuenciasOperativas(
  base: string,
  primary: FiscalAlertItem,
  snapshot: FinancialSnapshotApiV1 | null,
  obligation: ProtoTaxObligation | null
): string {
  const parts = [base.trim()].filter(Boolean);
  if (obligation) {
    const ymd = obligation.due_date.slice(0, 10);
    parts.push(
      `Si la fecha ${ymd} pasa sin pago acreditado ni actualización en Datos, la obligación sigue figurando como expuesta: sumás ruido con organismos, demoras en certificaciones y presión en la próxima ronda de egresos.`
    );
  }
  if (snapshot) {
    if (snapshotLiquidityBalance(snapshot) < 0) {
      parts.push(
        `En cifras: el balance proyectado negativo (${formatMoney(snapshotLiquidityBalance(snapshot))}) implica que, sin ingreso adicional, un pago imprevisto puede dejarte sin margen operativo esta ventana.`
      );
    }
    if (
      snapshotCoverageRatio(snapshot) < 1 &&
      Number.isFinite(snapshotCoverageRatio(snapshot))
    ) {
      parts.push(
        `La cobertura ${formatRatio(snapshotCoverageRatio(snapshot))} indica que caja más cobranza esperada no cubre egresos modelados: el riesgo no es abstracto, es de liquidez en días, no en meses.`
      );
    }
  }
  if (primary.priority === "critical" && primary.type === "fiscalidad" && !obligation) {
    parts.push(
      "Sin fila fiscal vinculada en el prototipo, el riesgo concreto depende de tu calendario real: tratá este aviso como bloqueante hasta cruzarlo con contaduría."
    );
  }
  return parts.join(" ");
}

function pickPrimaryCta(
  primary: FiscalAlertItem,
  snapshot: FinancialSnapshotApiV1 | null
): { label: string; href: string } {
  const coverageStress =
    snapshot != null &&
    (snapshotCoverageRatio(snapshot) < 1 ||
      snapshotLiquidityBalance(snapshot) < 0 ||
      snapshotRiskBand(snapshot) === "high" ||
      snapshotRiskBand(snapshot) === "critical");
  if (
    primary.type === "cobertura" ||
    primary.type === "liquidez" ||
    coverageStress
  ) {
    return {
      label: "Ver plan de cobertura",
      href: "/copilot/finanzasímode=cobertura&from=atencion-prioritaria#copilot-finanzas-cobertura",
    };
  }
  return {
    label: "Resolver ahora",
    href: "/copilot/finanzas#copilot-finanzas-fiscal",
  };
}

function CopilotAtencionPrioritariaPageContent() {
  const searchParams = useSearchParams();
  const attentionLevel = useMemo(() => {
    const raw = searchParams.get("level");
    if (raw === "critical" || raw === "high") return raw;
    return null;
  }, [searchParams]);

  const { items: allAlerts, loading: alertsLoading } = useCopilotAlerts();
  const [snapshot, setSnapshot] = useState<FinancialSnapshotApiV1 | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [obligation, setObligation] = useState<ProtoTaxObligation | null>(null);
  const [obligationLoading, setObligationLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const primary = useMemo(
    () => pickPrimaryCaseForLevel(allAlerts, attentionLevel),
    [allAlerts, attentionLevel]
  );
  const attentionAssembledAt = useMemo(() => {
    if (!primary) return null;
    if (alertsLoading || snapshotLoading) return null;
    if (primary.obligationId && obligationLoading) return null;
    return new Date().toISOString();
  }, [primary, alertsLoading, snapshotLoading, obligationLoading]);

  const content = useMemo(
    () => (primary ? buildAttentionCaseContent(primary) : null),
    [primary]
  );

  useEffect(() => {
    let cancelled = false;
    void getFinancialSnapshot()
      .then((s) => {
        if (!cancelled) {
          setSnapshot(s);
          setSnapshotError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSnapshot(null);
          setSnapshotError(
            e instanceof Error ? e.message : "No se cargó el panorama financiero."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = primary?.obligationId;
    if (!id) return;
    let cancelled = false;
    void (async () => {
      setObligationLoading(true);
      try {
        const o = await getProtoTaxObligationById(id);
        if (!cancelled) setObligation(o);
      } catch {
        if (!cancelled) setObligation(null);
      } finally {
        if (!cancelled) setObligationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primary?.obligationId]);

  const effectiveObligation = primary?.obligationId ? obligation : null;

  const alertasHref =
    primary?.priority === "critical"
      ? "/copilot/alertasípriority=critical"
      : primary?.priority === "high"
        ? "/copilot/alertasípriority=high"
        : "/copilot/alertas";

  const planRecomendado = useMemo(() => {
    if (!primary || !content) return null;
    return buildPlanRecomendado(primary, content, snapshot, effectiveObligation);
  }, [primary, content, snapshot, effectiveObligation]);

  const consecuenciasOperativas = useMemo(() => {
    if (!primary || !content) return "";
    return buildConsecuenciasOperativas(
      content.consecuencias,
      primary,
      snapshot,
      effectiveObligation
    );
  }, [primary, content, snapshot, effectiveObligation]);

  const primaryCta = useMemo(() => {
    if (!primary) return { label: "", href: "" };
    return pickPrimaryCta(primary, snapshot);
  }, [primary, snapshot]);

  const comoSeResuelve = useMemo(() => {
    if (!primary) return [];
    const lines: string[] = [];
    if (effectiveObligation) {
      lines.push(
        `Registrar el pago o la exención aplicable para ${mapTaxTypeLabel(effectiveObligation.tax_type)} (${effectiveObligation.period_label}) y actualizar el estado en Datos revierte la señal fiscal en cadena: alertas, Finanzas y semáforo.`
      );
    } else if (primary.type === "fiscalidad") {
      lines.push(
        "Enlazar la operación real (pago, DDJJ o plan de facilidades) con la obligación correcta en Datos: sin ese vínculo, la alerta fiscal sigue activa."
      );
    }
    if (snapshot && snapshotReceivablesRiskWeighted(snapshot) > 0) {
      lines.push(
        `Cobros que alivian la situación: acelerar ingresos ya ponderados (${formatMoney(snapshotReceivablesRiskWeighted(snapshot))} de cobranza esperada) reduce presión sobre caja sin depender de ventas nuevas.`
      );
    } else if (snapshot) {
      lines.push(
        "No hay cobranza esperada modelada en facturas abiertas: conviene cargar o actualizar probabilidades de cobro en Datos para que el asistente pueda sugerir palancas concretas."
      );
    }
    if (snapshot && snapshotExpectedOutflowsTotal(snapshot) > 0) {
      lines.push(
        `Pagos que suelen postergarse sin romper compliance: operativos discrecionales y proveedores con contrato flexible — no impuestos ya atrasados ni salarios, salvo acuerdo formal. Egresos modelados: ${formatMoney(snapshotExpectedOutflowsTotal(snapshot))}.`
      );
    }
    lines.push(
      primary.priority === "critical"
        ? "Si actuás hoy, ganás tiempo para documentar y distribuís el costo de coordinación antes de que el vencimiento comprima al equipo."
        : "Si actuás hoy, evitás que esta alerta suba de prioridad por acumulación con otras del mismo período."
    );
    return lines;
  }, [primary, snapshot, effectiveObligation]);

  const oportunidades = useMemo(() => {
    type Opp = { titulo: string; texto: string };
    const items: Opp[] = [];
    if (!snapshot && !effectiveObligation) {
      return { items: [] as Opp[], tieneBase: false };
    }
    if (snapshot && snapshotReceivablesRiskWeighted(snapshot) > 0) {
      items.push({
        titulo: "Cobros",
        texto: `Perseguir facturas con saldo y probabilidad de cobro ya cargada puede ingresar hasta ${formatMoney(snapshotReceivablesRiskWeighted(snapshot))} según el modelo actual.`,
      });
    }
    if (snapshot && snapshotExpectedOutflowsTotal(snapshot) > 0) {
      items.push({
        titulo: "Pagos",
        texto: `Reordenar la cola de egresos (${formatMoney(snapshotExpectedOutflowsTotal(snapshot))} modelados) negociando plazos no fiscales suele liberar caja para lo que no admite demora.`,
      });
    }
    if (
      snapshot &&
      snapshotCoverageRatio(snapshot) >= 1 &&
      snapshotCoverageRatio(snapshot) < 1.15
    ) {
      items.push({
        titulo: "Riesgo",
        texto:
          "El colchón es estrecho: confirmar un solo cobro grande o evitar un egreso evitable reduce la probabilidad de caer bajo 1,00× de cobertura.",
      });
    }
    if (effectiveObligation && effectiveObligation.status !== "paid") {
      items.push({
        titulo: "Fiscal",
        texto: `Cerrar ${mapTaxTypeLabel(effectiveObligation.tax_type)} elimina un egreso explícito del radar y baja el ruido en alertas vinculadas.`,
      });
    }
    if (items.length === 0 && snapshot) {
      items.push({
        titulo: "Datos",
        texto:
          "Hay snapshot financiero pero pocas palancas automáticas: actualizá facturas, pagos y obligaciones en Datos para que aparezcan oportunidades medibles.",
      });
    }
    const tieneBase = items.length > 0;
    return { items: items.slice(0, 4), tieneBase };
  }, [snapshot, effectiveObligation]);

  const fechaLimite = effectiveObligation
    ? new Date(effectiveObligation.due_date).toLocaleDateString("es-UY", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : primary?.type === "fiscalidad"
      ? "Ver detalle en la obligación (Finanzas o respaldo)."
      : "Según calendario de egresos (30 días fiscales + pagos operativos futuros).";

  const montoComprometido =
    effectiveObligation != null
      ? formatMoney(obligationAmount(effectiveObligation))
      : snapshot
        ? formatMoney(snapshotExpectedOutflowsTotal(snapshot))
        : "—";

  const deficitOMargen = snapshot
    ? snapshotLiquidityBalance(snapshot) < 0
      ? `Déficit proyectado: ${formatMoney(snapshotLiquidityBalance(snapshot))}`
      : `Margen proyectado: ${formatMoney(snapshotLiquidityBalance(snapshot))}`
    : "—";

  const pageLoading = alertsLoading;

  const secondaryLinkClass =
    "text-sm font-medium text-[var(--copilot-ink-muted)] underline decoration-[var(--copilot-border)] underline-offset-4 transition hover:text-[var(--copilot-ink)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.atencion-prioritaria"
        title="Detalle de atención prioritaria"
        description="Profundidad del caso crítico o alto. El centro operativo del día está en Hoy."
        right={<CopilotHoyReturnLink />}
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        {pageLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando caso prioritario…
          </div>
        ) : !primary || !content || !planRecomendado ? (
          <CopilotCard className="border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)]/35">
            <CopilotSectionTitle
              title="Sin situaciones críticas ni altas pendientes"
              subtitle="El semáforo te lleva acá solo cuando hay alertas de prioridad crítica o alta."
            />
            <p className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
              No hay filas en esa categoría ahora mismo. Podés revisar el listado
              completo, Finanzas o Datos para mantener la base al día.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <CopilotGhostLink href="/copilot/alertas" className="font-semibold">
                Ver todas las alertas
              </CopilotGhostLink>
              <CopilotGhostLink href="/copilot/finanzas" className="font-semibold">
                Abrir Finanzas
              </CopilotGhostLink>
              <CopilotGhostLink href="/copilot/datos" className="font-semibold">
                Ir a Datos
              </CopilotGhostLink>
            </div>
          </CopilotCard>
        ) : (
          <>
            <CopilotCard
              className={
                primary.priority === "critical"
                  ? "border-[var(--copilot-danger-border)]/90 bg-gradient-to-br from-rose-50/90 via-white to-white shadow-md ring-1 ring-rose-200/60"
                  : "border-[var(--copilot-warning-border)]/90 bg-gradient-to-br from-amber-50/80 via-white to-white shadow-md ring-1 ring-amber-200/50"
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CopilotBadge
                      tone={primary.priority === "critical" ? "danger" : "warning"}
                    >
                      {priorityLabel[primary.priority]}
                    </CopilotBadge>
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    {mapAlertCategory(primary.type)}
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--copilot-ink)] sm:text-2xl">
                    {primary.title}
                  </h2>
                  <p className="max-w-3xl text-sm font-medium leading-relaxed text-[var(--copilot-ink-muted)]">
                    Impacto: {primary.summary}
                  </p>
                  <p className="text-sm text-[var(--copilot-ink)]">
                    <span className="font-semibold">Plazo: </span>
                    <span className="capitalize">{fechaLimite}</span>
                    {" · "}
                    <span className="font-semibold">Monto en foco: </span>
                    {montoComprometido}
                  </p>
                  {attentionAssembledAt ? (
                    <CopilotTraceMeta
                      trace={traceFromAttentionPrimary({
                        assembledAtIso: attentionAssembledAt,
                        hasSnapshot: snapshot != null,
                        hasObligationRow: effectiveObligation != null,
                        alertType: primary.type,
                      })}
                      variant="embed"
                      dense
                    />
                  ) : null}
                </div>
              </div>
            </CopilotCard>

            <div className="scroll-mt-32 pt-1">
              <CopilotPrimaryLink
                href={primaryCta.href}
                className="w-full justify-center shadow-sm sm:inline-flex sm:w-auto"
              >
                {primaryCta.label}
              </CopilotPrimaryLink>
            </div>

            <CopilotCard className="border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/90">
              <CopilotSectionTitle
                title="Contexto mínimo"
                subtitle="Atajos para informar la decisión — no sustituyen el paso principal de arriba."
              />
              <nav
                className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2"
                aria-label="Accesos secundarios"
              >
                <Link
                  href="/copilot/finanzas#copilot-finanzas-cobranza"
                  className={secondaryLinkClass}
                >
                  Ver cobranzas pendientes
                </Link>
                <Link
                  href="/copilot/finanzas#copilot-finanzas-fiscal"
                  className={secondaryLinkClass}
                >
                  Ver pagos próximos
                </Link>
                <Link href="/copilot/finanzas" className={secondaryLinkClass}>
                  Ir a Finanzas
                </Link>
                {primary.obligationId ? (
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className={`${secondaryLinkClass} cursor-pointer text-left`}
                  >
                    Ver respaldo / documentos
                  </button>
                ) : (
                  <Link href="/copilot/datos" className={secondaryLinkClass}>
                    Ver respaldo / documentos
                  </Link>
                )}
              </nav>
            </CopilotCard>

            <CopilotCollapsiblePanel
              title="Plan recomendado (paso a paso)"
              defaultOpen={false}
            >
              <ol className="space-y-4 text-sm leading-relaxed text-[var(--copilot-ink)]">
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--copilot-accent)] text-xs font-bold text-white">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--copilot-ink)]">Resolver primero</p>
                    <p className="mt-1 text-[var(--copilot-ink-muted)]">
                      {planRecomendado.primero}
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/90 text-xs font-bold text-[var(--copilot-ink)]">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--copilot-ink)]">Revisar después</p>
                    <p className="mt-1 text-[var(--copilot-ink-muted)]">
                      {planRecomendado.despues}
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--copilot-warning-border)]/90 bg-[var(--copilot-tone-warning-bg)] text-xs font-bold text-[var(--copilot-warning-text-strong)]">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--copilot-ink)]">Evitar mientras tanto</p>
                    <p className="mt-1 text-[var(--copilot-ink-muted)]">
                      {planRecomendado.evitar}
                    </p>
                  </div>
                </li>
              </ol>
            </CopilotCollapsiblePanel>

            <CopilotCollapsiblePanel title="Qué está pasando y riesgo si no actuás" defaultOpen={false}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Qué está pasando
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                    {content.queEstaPasando}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--copilot-danger-border)]/80 bg-[var(--copilot-card-bg)]/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Si no se actúa
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-danger-text-strong)]">
                    {consecuenciasOperativas}
                  </p>
                </div>
              </div>
            </CopilotCollapsiblePanel>

            <CopilotCollapsiblePanel title="Datos clave y tablero" defaultOpen={false}>
            <CopilotCard className="border-0 bg-transparent p-0 shadow-none ring-0">
              <CopilotSectionTitle
                title="Datos clave"
                subtitle="Misma base numérica que Finanzas y alertas."
              />
              {snapshotLoading ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Cargando cifras…
                </p>
              ) : snapshotError ? (
                <p className="mt-3 text-sm text-[var(--copilot-warning-text-strong)]">{snapshotError}</p>
              ) : snapshot ? (
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Caja disponible Santander (referencia)
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {formatMoney(snapshotCashNet(snapshot))}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Egresos esperados
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {formatMoney(snapshotExpectedOutflowsTotal(snapshot))}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Monto comprometido / foco
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {montoComprometido}
                      {obligationLoading ? (
                        <Loader2
                          className="ml-2 inline h-4 w-4 animate-spin align-middle"
                          aria-hidden
                        />
                      ) : null}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Fecha límite / horizonte
                    </dt>
                    <dd className="mt-1 text-sm font-medium capitalize text-[var(--copilot-ink)]">
                      {fechaLimite}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Déficit o margen proyectado
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {deficitOMargen}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Cobertura (caja + cobranza / egresos)
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {formatRatio(snapshotCoverageRatio(snapshot))}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {snapshot?.by_currency && snapshot.meta.currency === "mixed" ? (
                <div className="mt-3 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Desglose por moneda
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums text-[var(--copilot-ink-muted)]">
                    {(["UYU", "USD"] as const).map((cur) => {
                      const t = snapshot.by_currency![cur];
                      if (!t) return null;
                      return (
                        <span key={cur}>
                          <span className="font-semibold text-[var(--copilot-ink)]">{cur}</span>{" "}
                          pendiente {t.pending?.toLocaleString("es-AR", { maximumFractionDigits: 0 }) ?? "—"}
                          {t.overdue && t.overdue > 0
                            ? ` · atrasado ${t.overdue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
                            : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : snapshot && (snapshot.meta.currency === "unspecified" || snapshot.meta.currency === "mixed") ? (
                <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
                  Montos multi-moneda (UYU + USD) — desglose pendiente.
                </p>
              ) : null}
              {effectiveObligation ? (
                <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
                  Obligación: {mapTaxTypeLabel(effectiveObligation.tax_type)} ·{" "}
                  {effectiveObligation.period_label} · Estado{" "}
                  {mapTaxObligationStatus(effectiveObligation.status)}
                </p>
              ) : null}
            </CopilotCard>
            </CopilotCollapsiblePanel>

            <CopilotCollapsiblePanel title="Cómo se resuelve (detalle)" defaultOpen={false}>
            <CopilotCard className="border-[var(--copilot-border)]/80 bg-[var(--copilot-soft-bg)]/40">
              <CopilotSectionTitle
                title="Cómo se resuelve"
                subtitle="Lectura de asesor: qué tiene que ocurrir para que el semáforo baje de verdad."
              />
              <ul className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
                {comoSeResuelve.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="mt-0.5 font-semibold text-[var(--copilot-accent)]"
                      aria-hidden
                    >
                      →
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CopilotCard>
            </CopilotCollapsiblePanel>

            <CopilotCollapsiblePanel title="Oportunidades y enlaces" defaultOpen={false}>
            <CopilotCard>
              <CopilotSectionTitle
                title="Oportunidades"
                subtitle="Palancas visibles con la base actual — si faltan datos, lo decimos."
              />
              {oportunidades.tieneBase ? (
                <ul className="mt-3 space-y-4">
                  {oportunidades.items.map((row, i) => (
                    <li key={i}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                        {row.titulo}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                        {row.texto}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                  Todavía no hay suficiente detalle en facturas, pagos y obligaciones para listar
                  oportunidades automáticas. Actualizá Datos o abrí Finanzas: con saldos y fechas consistentes, aparecerán sugerencias medibles acá.
                </p>
              )}
              <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
                <CopilotGhostLink href={alertasHref} className="font-semibold text-[var(--copilot-ink)]">
                  Ver alertas relacionadas
                </CopilotGhostLink>
                {" · "}
                <CopilotGhostLink href="/copilot/datos" className="font-semibold text-[var(--copilot-ink)]">
                  Ir a Datos
                </CopilotGhostLink>
              </p>
            </CopilotCard>
            </CopilotCollapsiblePanel>

            <CopilotCollapsiblePanel title="Cómo usar esta pantalla (capacitación)" defaultOpen={false}>
            <CopilotCard className="border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50">
              <CopilotSectionTitle
                title="Cómo usar esta pantalla"
                subtitle="Capacitación express — pensada para decisiones bajo presión."
              />
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                <li>
                  <span className="font-semibold text-[var(--copilot-ink)]">1.</span>{" "}
                  Ejecutá el paso 1 del plan o el botón principal antes de abrir debates largos.
                </li>
                <li>
                  <span className="font-semibold text-[var(--copilot-ink)]">2.</span>{" "}
                  Usá los accesos secundarios solo para informar la decisión, no para posponerla.
                </li>
                <li>
                  <span className="font-semibold text-[var(--copilot-ink)]">3.</span>{" "}
                  Registrá en Datos lo resuelto: sin eso, la crisis vuelve a aparecer mañana en el
                  mismo lugar.
                </li>
              </ul>
            </CopilotCard>
            </CopilotCollapsiblePanel>
          </>
        )}
      </div>

      {primary?.obligationId ? (
        <CopilotTaxEvidenceDrawer
          obligationId={primary.obligationId}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default function CopilotAtencionPrioritariaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-20 text-sm text-[var(--copilot-ink-muted)]">
          Cargando atención prioritaria…
        </div>
      }
    >
      <CopilotAtencionPrioritariaPageContent />
    </Suspense>
  );
}
