"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { CopilotTaxEvidenceDrawer } from "@/components/copilot/copilot-tax-evidence-drawer";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
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
  type FinancialSnapshot,
} from "@/lib/copilot-financial-engine";
import {
  getProtoTaxObligationById,
  type ProtoTaxObligation,
} from "@/lib/copilot-tax-data";

function formatMoney(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
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
  snapshot: FinancialSnapshot | null,
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
    primero = `Confirmar monto y vencimiento de ${mapTaxTypeLabel(obligation.tax_type)} (${formatMoney(obligationAmount(obligation))}) y ejecutar el pago o acreditación antes del ${due}; registrar el resultado en Datos para que baje la alerta.`;
    despues =
      steps[1] ??
      "Abrir respaldo documental y dejar evidencia alineada con lo informado a organismos.";
  } else if (primary.type === "liquidez" || primary.type === "cobertura") {
    if (snapshot) {
      primero = `Cerrar el hueco de caja: priorizar cobros con mayor probabilidad de ingreso (cobranza esperada del motor: ${formatMoney(snapshot.expected_inflows)}) frente a egresos modelados (${formatMoney(snapshot.expected_outflows)}).`;
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
  if (snapshot && snapshot.projected_balance < 0) {
    evitar = `Evitar asumir gastos discrecionales o nuevos compromisos de pago hasta tener cobro concreto o acuerdo por escrito; el déficit proyectado es ${formatMoney(snapshot.projected_balance)}.`;
  } else if (snapshot && snapshot.coverage_ratio < 1 && Number.isFinite(snapshot.coverage_ratio)) {
    evitar = `Evitar posponer seguimiento de cobranza “para más adelante”: con cobertura ${formatRatio(snapshot.coverage_ratio)}, un solo desvío de ingreso vuelve a poner en riesgo el cumplimiento.`;
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
  snapshot: FinancialSnapshot | null,
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
    if (snapshot.projected_balance < 0) {
      parts.push(
        `En cifras: el balance proyectado negativo (${formatMoney(snapshot.projected_balance)}) implica que, sin ingreso adicional, un pago imprevisto puede dejarte sin margen operativo esta ventana.`
      );
    }
    if (snapshot.coverage_ratio < 1 && Number.isFinite(snapshot.coverage_ratio)) {
      parts.push(
        `La cobertura ${formatRatio(snapshot.coverage_ratio)} indica que caja más cobranza esperada no cubre egresos modelados: el riesgo no es abstracto, es de liquidez en días, no en meses.`
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
  snapshot: FinancialSnapshot | null
): { label: string; href: string } {
  const coverageStress =
    snapshot != null &&
    (snapshot.coverage_ratio < 1 ||
      snapshot.projected_balance < 0 ||
      snapshot.risk_level === "high" ||
      snapshot.risk_level === "critical");
  if (
    primary.type === "cobertura" ||
    primary.type === "liquidez" ||
    coverageStress
  ) {
    return {
      label: "Ver plan de cobertura",
      href: "/copilot/finanzas?mode=cobertura&from=atencion-prioritaria#copilot-finanzas-cobertura",
    };
  }
  return {
    label: "Resolver situación ahora",
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
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [obligation, setObligation] = useState<ProtoTaxObligation | null>(null);
  const [obligationLoading, setObligationLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const primary = useMemo(
    () => pickPrimaryCaseForLevel(allAlerts, attentionLevel),
    [allAlerts, attentionLevel]
  );
  const content = useMemo(
    () => (primary ? buildAttentionCaseContent(primary) : null),
    [primary]
  );

  useEffect(() => {
    let cancelled = false;
    setSnapshotLoading(true);
    setSnapshotError(null);
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
    if (!id) {
      setObligation(null);
      return;
    }
    let cancelled = false;
    setObligationLoading(true);
    void getProtoTaxObligationById(id)
      .then((o) => {
        if (!cancelled) setObligation(o);
      })
      .catch(() => {
        if (!cancelled) setObligation(null);
      })
      .finally(() => {
        if (!cancelled) setObligationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [primary?.obligationId]);

  const alertasHref =
    primary?.priority === "critical"
      ? "/copilot/alertas?priority=critical"
      : primary?.priority === "high"
        ? "/copilot/alertas?priority=high"
        : "/copilot/alertas";

  const planRecomendado = useMemo(() => {
    if (!primary || !content) return null;
    return buildPlanRecomendado(primary, content, snapshot, obligation);
  }, [primary, content, snapshot, obligation]);

  const consecuenciasOperativas = useMemo(() => {
    if (!primary || !content) return "";
    return buildConsecuenciasOperativas(
      content.consecuencias,
      primary,
      snapshot,
      obligation
    );
  }, [primary, content, snapshot, obligation]);

  const primaryCta = useMemo(() => {
    if (!primary) return { label: "", href: "" };
    return pickPrimaryCta(primary, snapshot);
  }, [primary, snapshot]);

  const comoSeResuelve = useMemo(() => {
    if (!primary) return [];
    const lines: string[] = [];
    if (obligation) {
      lines.push(
        `Registrar el pago o la exención aplicable para ${mapTaxTypeLabel(obligation.tax_type)} (${obligation.period_label}) y actualizar el estado en Datos revierte la señal fiscal en cadena: alertas, Finanzas y semáforo.`
      );
    } else if (primary.type === "fiscalidad") {
      lines.push(
        "Enlazar la operación real (pago, DDJJ o plan de facilidades) con la obligación correcta en Datos: sin ese vínculo, el motor sigue leyendo riesgo."
      );
    }
    if (snapshot && snapshot.expected_inflows > 0) {
      lines.push(
        `Cobros que alivian la situación: acelerar ingresos ya ponderados en el motor (${formatMoney(snapshot.expected_inflows)} de cobranza esperada) reduce presión sobre caja sin depender de ventas nuevas.`
      );
    } else if (snapshot) {
      lines.push(
        "No hay cobranza esperada modelada en facturas abiertas: conviene cargar o actualizar probabilidades de cobro en Datos para que el asistente pueda sugerir palancas concretas."
      );
    }
    if (snapshot && snapshot.expected_outflows > 0) {
      lines.push(
        `Pagos que suelen postergarse sin romper compliance: operativos discrecionales y proveedores con contrato flexible — no impuestos ya vencidos ni salarios, salvo acuerdo formal. Egresos modelados: ${formatMoney(snapshot.expected_outflows)}.`
      );
    }
    lines.push(
      primary.priority === "critical"
        ? "Si actuás hoy, ganás tiempo para documentar y distribuís el costo de coordinación antes de que el vencimiento comprima al equipo."
        : "Si actuás hoy, evitás que esta alerta suba de prioridad por acumulación con otras del mismo período."
    );
    return lines;
  }, [primary, snapshot, obligation]);

  const oportunidades = useMemo(() => {
    type Opp = { titulo: string; texto: string };
    const items: Opp[] = [];
    if (!snapshot && !obligation) {
      return { items: [] as Opp[], tieneBase: false };
    }
    if (snapshot && snapshot.expected_inflows > 0) {
      items.push({
        titulo: "Cobros",
        texto: `Perseguir facturas con saldo y probabilidad de cobro ya cargada puede ingresar hasta ${formatMoney(snapshot.expected_inflows)} según el modelo actual.`,
      });
    }
    if (snapshot && snapshot.expected_outflows > 0) {
      items.push({
        titulo: "Pagos",
        texto: `Reordenar la cola de egresos (${formatMoney(snapshot.expected_outflows)} modelados) negociando plazos no fiscales suele liberar caja para lo que no admite demora.`,
      });
    }
    if (snapshot && snapshot.coverage_ratio >= 1 && snapshot.coverage_ratio < 1.15) {
      items.push({
        titulo: "Riesgo",
        texto:
          "El colchón es estrecho: confirmar un solo cobro grande o evitar un egreso evitable reduce la probabilidad de caer bajo 1,00× de cobertura.",
      });
    }
    if (obligation && obligation.status !== "paid") {
      items.push({
        titulo: "Fiscal",
        texto: `Cerrar ${mapTaxTypeLabel(obligation.tax_type)} elimina un egreso explícito del radar y baja el ruido en alertas vinculadas.`,
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
  }, [snapshot, obligation]);

  const fechaLimite = obligation
    ? new Date(obligation.due_date).toLocaleDateString("es-UY", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : primary?.type === "fiscalidad"
      ? "Ver detalle en la obligación (Finanzas o respaldo)."
      : "Según calendario de egresos del motor financiero (30 días fiscales + pagos operativos futuros).";

  const montoComprometido =
    obligation != null
      ? formatMoney(obligationAmount(obligation))
      : snapshot
        ? formatMoney(snapshot.expected_outflows)
        : "—";

  const deficitOMargen = snapshot
    ? snapshot.projected_balance < 0
      ? `Déficit proyectado: ${formatMoney(snapshot.projected_balance)}`
      : `Margen proyectado: ${formatMoney(snapshot.projected_balance)}`
    : "—";

  const pageLoading = alertsLoading;

  const secondaryLinkClass =
    "text-sm font-medium text-[var(--copilot-ink-muted)] underline decoration-[var(--copilot-border)] underline-offset-4 transition hover:text-[var(--copilot-ink)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Atención prioritaria"
        description="Diagnóstico, decisión y primer movimiento: un solo foco con plan ordenado y un camino claro a Finanzas y Datos."
        readingKey={
          <CopilotReadingKey
            lines={[
              "Entiendo qué está en juego.",
              "Sé qué hacer primero y qué posponer.",
              "Tengo una acción principal y accesos rápidos.",
            ]}
          />
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        {pageLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando caso prioritario…
          </div>
        ) : !primary || !content || !planRecomendado ? (
          <CopilotCard className="border-emerald-200/70 bg-emerald-50/35">
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
                  ? "border-rose-300/90 bg-gradient-to-br from-rose-50/90 via-white to-white shadow-md ring-1 ring-rose-200/60"
                  : "border-amber-200/90 bg-gradient-to-br from-amber-50/80 via-white to-white shadow-md ring-1 ring-amber-200/50"
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
                    <CopilotBadge tone="neutral">
                      {mapAlertCategory(primary.type)}
                    </CopilotBadge>
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--copilot-ink)] sm:text-2xl">
                    {primary.title}
                  </h2>
                  <p className="max-w-3xl text-sm font-medium leading-relaxed text-[var(--copilot-ink-muted)]">
                    Por qué importa ahora: {primary.summary}
                  </p>
                </div>
              </div>
            </CopilotCard>

            <CopilotCard className="border-[rgba(31,107,74,0.22)] bg-[rgba(31,107,74,0.05)]">
              <CopilotSectionTitle
                title="Plan recomendado"
                subtitle="Tres movimientos en orden: primero desbloquear, después validar, evitar errores caros mientras tanto."
              />
              <ol className="mt-2 space-y-4">
                <li className="flex gap-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--copilot-accent)] text-xs font-bold text-white">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--copilot-ink)]">
                      Resolver primero
                    </p>
                    <p className="mt-1 text-[var(--copilot-ink-muted)]">
                      {planRecomendado.primero}
                    </p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--copilot-border)] bg-white/90 text-xs font-bold text-[var(--copilot-ink)]">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--copilot-ink)]">
                      Revisar después
                    </p>
                    <p className="mt-1 text-[var(--copilot-ink-muted)]">
                      {planRecomendado.despues}
                    </p>
                  </div>
                </li>
                <li className="flex gap-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200/90 bg-amber-50/80 text-xs font-bold text-amber-950">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--copilot-ink)]">
                      Evitar mientras tanto
                    </p>
                    <p className="mt-1 text-[var(--copilot-ink-muted)]">
                      {planRecomendado.evitar}
                    </p>
                  </div>
                </li>
              </ol>
            </CopilotCard>

            <CopilotCard className="border-[var(--copilot-border)] bg-white/90">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Acción principal
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                    Un solo siguiente paso ejecutivo. El resto son atajos para profundizar sin
                    dispersar la decisión.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-4">
                <CopilotPrimaryLink href={primaryCta.href} className="w-full justify-center sm:w-auto">
                  {primaryCta.label}
                </CopilotPrimaryLink>
                <nav
                  className="flex flex-col gap-2 border-t border-[var(--copilot-border)] pt-4 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2"
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
              </div>
            </CopilotCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <CopilotCard>
                <CopilotSectionTitle
                  title="Qué está pasando"
                  subtitle="Lectura directa, sin tecnicismos innecesarios."
                />
                <p className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {content.queEstaPasando}
                </p>
              </CopilotCard>

              <CopilotCard className="border-rose-100/80 bg-rose-50/25">
                <CopilotSectionTitle
                  title="Si no se actúa"
                  subtitle="Consecuencias concretas en tiempo de negocio, no advertencias genéricas."
                />
                <p className="mt-3 text-sm leading-relaxed text-rose-950/90">
                  {consecuenciasOperativas}
                </p>
              </CopilotCard>
            </div>

            <CopilotCard>
              <CopilotSectionTitle
                title="Datos clave"
                subtitle="Misma base numérica que Finanzas y alertas (proto_* + motor)."
              />
              {snapshotLoading ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Cargando cifras…
                </p>
              ) : snapshotError ? (
                <p className="mt-3 text-sm text-amber-800">{snapshotError}</p>
              ) : snapshot ? (
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Caja disponible (referencia)
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {formatMoney(snapshot.available_cash)}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Egresos esperados (motor)
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {formatMoney(snapshot.expected_outflows)}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3">
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
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Fecha límite / horizonte
                    </dt>
                    <dd className="mt-1 text-sm font-medium capitalize text-[var(--copilot-ink)]">
                      {fechaLimite}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Déficit o margen proyectado
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {deficitOMargen}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Cobertura (caja + cobranza / egresos)
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {formatRatio(snapshot.coverage_ratio)}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {obligation ? (
                <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
                  Obligación: {mapTaxTypeLabel(obligation.tax_type)} ·{" "}
                  {obligation.period_label} · Estado{" "}
                  {mapTaxObligationStatus(obligation.status)}
                </p>
              ) : null}
            </CopilotCard>

            <CopilotCard className="border-slate-200/80 bg-slate-50/40">
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
                  oportunidades automáticas. Actualizá Datos o abrí Finanzas: en cuanto el motor
                  tenga saldos y fechas consistentes, aparecerán sugerencias medibles acá.
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

            <CopilotCard className="border-dashed border-[var(--copilot-border)] bg-white/50">
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
