"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionStep } from "@/components/copilot/decision-step";
import { RutasFlowBackLink } from "@/components/copilot/rutas-flow-back-link";
import { formatMoneyRutas } from "@/lib/copilot-rutas-hub";
import { normalizedCollectionProbability } from "@/lib/copilot-financial-primitives";
import { getProtoInvoices, type DataRow } from "@/lib/copilot-data";
import { fetchClientPortfolioLoad } from "@/lib/copilot-client-portfolio-fetch";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import {
  getFinancialSnapshot,
  type FinancialSnapshotApiV1,
} from "@/lib/copilot-financial-engine";
import { snapshotCashNet } from "@/lib/copilot-financial-snapshot-selectors";
import { getUpcomingTaxAgenda, type TaxAgendaItem } from "@/lib/copilot-tax-data";
import { getFiscalAlerts, type FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import {
  formatTaxAgendaDateShort,
  getTaxObligationAmountDisplay,
  mapTaxTypeLabel,
} from "@/lib/copilot-format";

const HORIZON_DAYS = 30;
const TOTAL_STEPS = 4;

function daysFromToday(ymd: string): number {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const d = new Date(ymd.slice(0, 10) + "T12:00:00");
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

function isUnpaidObligation(o: TaxAgendaItem): boolean {
  return String(o.status ?? "").toLowerCase() !== "paid";
}

function obligationNumericAmount(o: TaxAgendaItem): number {
  if (o.confirmed_amount != null && o.confirmed_amount > 0) {
    return o.confirmed_amount;
  }
  return Math.max(0, o.estimated_amount);
}

function obligationsInWindow(agenda: TaxAgendaItem[]): TaxAgendaItem[] {
  return agenda.filter((o) => {
    if (!isUnpaidObligation(o)) return false;
    const diff = daysFromToday(o.due_date);
    return diff >= 0 && diff <= HORIZON_DAYS;
  });
}

function sumDueAmount(rows: TaxAgendaItem[]): number {
  let t = 0;
  for (const o of rows) {
    t += obligationNumericAmount(o);
  }
  return t;
}

type Urgency = "critical" | "warning" | "ok";

function obligationUrgency(o: TaxAgendaItem): Urgency {
  const diff = daysFromToday(o.due_date);
  if (diff < 0) return "critical";
  if (o.coverage_status === "critical") return "critical";
  if (diff <= 7 || o.coverage_status === "risk") return "warning";
  return "ok";
}

function urgencyLabel(u: Urgency): string {
  if (u === "critical") return "Crítico";
  if (u === "warning") return "Atención";
  return "Controlado";
}

function urgencyPillClass(u: Urgency): string {
  if (u === "critical") return "bg-rose-100 text-rose-900 ring-rose-200/80";
  if (u === "warning") return "bg-amber-100 text-amber-950 ring-amber-200/80";
  return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
}

function numRow(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

type ClientAgg = {
  companyId: string;
  name: string;
  collectable: number;
  probDisplay: number;
};

function buildClientCollectable(
  invoices: DataRow[],
  portfolio: ClientPortfolioLoad | null
): { total: ClientAgg[]; sumCollectable: number } {
  const byCompany = new Map<string, { collectable: number; probSum: number; n: number }>();
  const nameById = new Map<string, string>();
  if (portfolio?.rows) {
    for (const r of portfolio.rows) {
      nameById.set(r.company_id, r.name);
    }
  }

  for (const inv of invoices) {
    const balance = numRow(inv.balance_amount);
    if (balance <= 0) continue;
    const prob = normalizedCollectionProbability(inv.collection_probability);
    const expected = balance * prob;
    if (expected <= 0) continue;
    const cid = String(inv.company_id ?? "");
    if (!cid) continue;
    const cur = byCompany.get(cid) ?? { collectable: 0, probSum: 0, n: 0 };
    cur.collectable += expected;
    cur.probSum += prob;
    cur.n += 1;
    byCompany.set(cid, cur);
  }

  const list: ClientAgg[] = [];
  for (const [companyId, v] of byCompany) {
    list.push({
      companyId,
      name: nameById.get(companyId) ?? "Cliente",
      collectable: v.collectable,
      probDisplay: v.n > 0 ? Math.round((v.probSum / v.n) * 100) : 0,
    });
  }
  list.sort((a, b) => b.collectable - a.collectable);
  const sumCollectable = list.reduce((s, x) => s + x.collectable, 0);
  return { total: list, sumCollectable };
}

export default function RutaCajaPage() {
  const [step, setStep] = useState(1);
  const [snapshot, setSnapshot] = useState<FinancialSnapshotApiV1 | null>(null);
  const [agenda, setAgenda] = useState<TaxAgendaItem[]>([]);
  const [fiscalAlerts, setFiscalAlerts] = useState<FiscalAlertItem[]>([]);
  const [portfolio, setPortfolio] = useState<ClientPortfolioLoad | null>(null);
  const [invoices, setInvoices] = useState<DataRow[]>([]);
  const [loadedAt, setLoadedAt] = useState<string>("");
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, a, f, p, inv] = await Promise.all([
        getFinancialSnapshot(),
        getUpcomingTaxAgenda(),
        getFiscalAlerts(),
        fetchClientPortfolioLoad().catch(() => null),
        getProtoInvoices("active").catch(() => []),
      ]);
      setSnapshot(s);
      setAgenda(a);
      setFiscalAlerts(f);
      setPortfolio(p);
      setInvoices(inv);
      setLoadedAt(
        new Date().toLocaleString("es-AR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
      setLoadError(false);
    } catch {
      setSnapshot(null);
      setAgenda([]);
      setFiscalAlerts([]);
      setPortfolio(null);
      setInvoices([]);
      setLoadedAt("");
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const windowObs = useMemo(() => obligationsInWindow(agenda), [agenda]);
  const dueAmount = useMemo(() => sumDueAmount(windowObs), [windowObs]);
  const cash = snapshot != null ? snapshotCashNet(snapshot) : 0;
  const gap = dueAmount - cash;
  const hasGap = gap > 0;
  const sortedList = useMemo(() => {
    return [...windowObs].sort(
      (a, b) =>
        new Date(a.due_date.slice(0, 10)).getTime() -
        new Date(b.due_date.slice(0, 10)).getTime()
    );
  }, [windowObs]);
  const topFive = sortedList.slice(0, 5);

  const { total: clientAgg, sumCollectable } = useMemo(
    () => buildClientCollectable(invoices, portfolio),
    [invoices, portfolio]
  );
  const topClients = clientAgg.slice(0, 5);

  const coveragePct =
    dueAmount > 0 ? Math.min(100, Math.round((sumCollectable / dueAmount) * 100)) : 0;

  const traceBase = [
    "Basado en facturas, pagos y obligaciones registradas.",
    loadedAt ? `Actualizado ${loadedAt}.` : "Actualizado al cargar esta pantalla.",
  ];

  const firstCriticalAlert = fiscalAlerts.find((a) => a.priority === "critical");

  const step4Bullets = useMemo(() => {
    const lines: string[] = [];
    const c1 = clientAgg[0]?.name;
    const c2 = clientAgg[1]?.name;
    if (c1) {
      lines.push(`Contactar a ${c1}${c2 ? ` y ${c2}` : ""} para cerrar cobranzas pendientes.`);
    }
    const ob = topFive[0];
    if (ob) {
      const amt = getTaxObligationAmountDisplay(ob.estimated_amount, ob.confirmed_amount);
      lines.push(
        `Priorizar obligación ${mapTaxTypeLabel(ob.tax_type)} (${ob.period_label}) · ${amt.text}.`
      );
    }
    if (firstCriticalAlert) {
      lines.push(`Revisar alerta: ${firstCriticalAlert.title}.`);
    }
    if (lines.length === 0) {
      lines.push("Registrá en Acciones el próximo movimiento que quieras concretar hoy.");
    }
    return lines.slice(0, 4);
  }, [clientAgg, topFive, firstCriticalAlert]);

  const impactStep4Amount = Math.max(dueAmount, hasGap ? gap : 0, sumCollectable);

  const step1Headline =
    snapshot != null
      ? `Tenés ${formatMoneyRutas(cash)} disponibles para los próximos ${HORIZON_DAYS} días`
      : "Todavía no podemos mostrar tu caja con certeza";

  const step1Subtitle =
    snapshot != null
      ? `Tenés compromisos por ${formatMoneyRutas(dueAmount)} en ese período.`
      : "Faltan datos de ingresos, egresos u obligaciones para calcular el período.";

  const step1Result =
    snapshot == null
      ? {
          text: "Sin lectura completa: cargá facturas y pagos en Datos para activar este flujo.",
          variant: "warning" as const,
        }
      : dueAmount <= 0
        ? {
            text: "No registramos compromisos impositivos pendientes en esta ventana.",
            variant: "success" as const,
          }
        : hasGap
          ? {
              text: `Te faltan ${formatMoneyRutas(gap)} para cubrir tus pagos del período.`,
              variant: "critical" as const,
            }
          : {
              text: "Estás cubierto para ese período.",
              variant: "success" as const,
            };

  const step1Risk =
    snapshot != null && dueAmount > 0
      ? {
          text: hasGap
            ? "Riesgo: podés quedar sin liquidez antes de cumplir todos los compromisos."
            : "Riesgo acotado: tu caja alcanza para los compromisos registrados en la ventana.",
          variant: hasGap ? ("critical" as const) : ("success" as const),
        }
      : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RutasFlowBackLink />
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="¿Estoy bien de caja?"
        description="Cuatro pasos. Una lectura por pantalla. Un solo botón verde para avanzar."
      />
      <div className="flex-1 overflow-auto px-6 py-8">
        {step === 1 ? (
          <DecisionStep
            stepIndex={1}
            totalSteps={TOTAL_STEPS}
            title="Situación de caja"
            headline={step1Headline}
            subtitle={step1Subtitle}
            risk={step1Risk}
            result={step1Result}
            trace={loadError ? ["No se pudieron cargar todos los datos. Reintentá o revisá Datos.", ...traceBase] : traceBase}
            durationHint="~30 seg"
            ctaLabel="Ver próximos vencimientos"
            onNext={() => setStep(2)}
          />
        ) : null}

        {step === 2 ? (
          <DecisionStep
            stepIndex={2}
            totalSteps={TOTAL_STEPS}
            title="Vencimientos"
            headline={`Tenés ${windowObs.length} compromiso${windowObs.length === 1 ? "" : "s"} en los próximos ${HORIZON_DAYS} días`}
            subtitle={
              topFive.length === 0
                ? "No hay obligaciones impositivas pendientes en esta ventana."
                : "Estos son los próximos pagos registrados (impuestos y cargas fiscales)."
            }
            dataList={
              topFive.length > 0 ? (
                <ul className="space-y-3">
                  {topFive.map((o) => {
                    const amt = getTaxObligationAmountDisplay(
                      o.estimated_amount,
                      o.confirmed_amount
                    );
                    const u = obligationUrgency(o);
                    return (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-[var(--copilot-ink-muted)]">
                            {formatTaxAgendaDateShort(o.due_date)}
                          </p>
                          <p className="font-semibold text-[var(--copilot-ink)]">
                            Impuesto · {mapTaxTypeLabel(o.tax_type)}
                          </p>
                          <p className="text-sm font-medium tabular-nums text-[var(--copilot-ink)]">
                            {amt.text}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${urgencyPillClass(u)}`}
                        >
                          {urgencyLabel(u)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null
            }
            risk={
              dueAmount > 0
                ? {
                    text: hasGap
                      ? "Con tu caja actual no podés cubrir todos estos pagos."
                      : "Podés cubrir estos pagos con tu caja actual.",
                    variant: hasGap ? "critical" : "success",
                  }
                : undefined
            }
            trace={traceBase}
            durationHint="~1 min"
            ctaLabel="Ver cómo cubrirlo"
            onNext={() => setStep(3)}
          />
        ) : null}

        {step === 3 ? (
          <DecisionStep
            stepIndex={3}
            totalSteps={TOTAL_STEPS}
            title="Cobranza disponible"
            headline={
              sumCollectable > 0
                ? `Podés cobrar hasta ${formatMoneyRutas(sumCollectable)} en el corto plazo`
                : "Hoy no registramos cobranzas esperadas con saldo abierto"
            }
            subtitle={
              topClients.length > 0
                ? "Saldo pendiente ponderado por probabilidad de cobro (facturas activas)."
                : "No hay facturas con saldo y probabilidad cargada para estimar cobros."
            }
            dataList={
              topClients.length > 0 ? (
                <ul className="space-y-2">
                  {topClients.map((c) => (
                    <li
                      key={c.companyId}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2"
                    >
                      <span className="font-medium text-[var(--copilot-ink)]">{c.name}</span>
                      <span className="text-sm tabular-nums text-[var(--copilot-ink)]">
                        {formatMoneyRutas(c.collectable)} · {c.probDisplay}% prob.
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null
            }
            recommendation={
              clientAgg.length >= 2
                ? `Deberías priorizar cobrar a ${clientAgg[0].name} y ${clientAgg[1].name}.`
                : clientAgg.length === 1
                  ? `Deberías priorizar cobrar a ${clientAgg[0].name}.`
                  : undefined
            }
            result={
              dueAmount > 0 && sumCollectable > 0
                ? {
                    text: `Si cobrás esto, cubrís el ${coveragePct}% de tus pagos del período.`,
                    variant: coveragePct >= 100 ? "success" : coveragePct >= 50 ? "warning" : "critical",
                  }
                : dueAmount > 0
                  ? {
                      text: "Sin cobranzas esperadas cargadas, el hueco lo tenés que cubrir con caja u otras fuentes.",
                      variant: "warning",
                    }
                  : {
                      text: "Sin compromisos en ventana, enfocate en mantener caja y cobranzas al día.",
                      variant: "success",
                    }
            }
            risk={
              sumCollectable > 0 && hasGap
                ? {
                    text: "Riesgo: si esas cobranzas demoran, el faltante de caja se agranda.",
                    variant: "warning",
                  }
                : undefined
            }
            trace={traceBase}
            durationHint="~1 min"
            ctaLabel="Accionar cobranza"
            onNext={() => setStep(4)}
          />
        ) : null}

        {step === 4 ? (
          <DecisionStep
            stepIndex={4}
            totalSteps={TOTAL_STEPS}
            title="Acción"
            headline="Estas son las acciones recomendadas hoy"
            dataList={
              <ul className="list-none space-y-3">
                {step4Bullets.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85 px-4 py-3 text-sm font-medium leading-snug text-[var(--copilot-ink)]"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent-soft)] text-xs font-bold text-[var(--copilot-accent)]">
                      {i + 1}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            }
            impact={
              impactStep4Amount > 0
                ? `Estas acciones impactan ${formatMoneyRutas(impactStep4Amount)} en los próximos ${HORIZON_DAYS} días.`
                : `Estas acciones ordenan cobros, pagos y obligaciones en los próximos ${HORIZON_DAYS} días.`
            }
            trace={traceBase}
            durationHint="~1 min"
            ctaLabel="Ir a ejecutar acciones"
            nextHref="/copilot/acciones"
          />
        ) : null}
      </div>
    </div>
  );
}
