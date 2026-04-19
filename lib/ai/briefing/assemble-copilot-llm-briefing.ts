/**
 * AI-01 — Ensamblado de briefing LLM desde datos internos normalizados (tenant-scoped).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  COPILOT_LLM_BRIEFING_FRAMING_ES,
  type AssembleCopilotLlmBriefingInput,
  type CopilotBriefingFact,
  type CopilotBriefingPipelineAction,
  type CopilotBriefingSignal,
  type CopilotBriefingSourceRef,
  type CopilotLlmBriefingOutput,
  type CopilotLlmBriefingTrace,
} from "@/lib/ai/briefing/types";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { getFinancialSnapshot, type FinancialSnapshot } from "@/lib/copilot-financial-engine";
import { computeCopilotRealInsights, type CopilotRealInsight } from "@/lib/copilot-real-insights";
import { getFiscalAlerts, type FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import {
  selectActionsOrdered,
  selectInitiativeCompanyNamesByIds,
  selectOutcomesByActionIds,
} from "@/lib/data/engine-repository";

const ACTION_BRIEF_LIMIT = 20;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function snapshotFacts(s: FinancialSnapshot): CopilotBriefingFact[] {
  return [
    { key: "caja_disponible", value: String(s.available_cash) },
    { key: "cobranza_esperada", value: String(s.expected_inflows) },
    { key: "egresos_esperados", value: String(s.expected_outflows) },
    { key: "balance_proyectado", value: String(s.projected_balance) },
    { key: "ratio_cobertura", value: String(s.coverage_ratio) },
    { key: "riesgo", value: s.risk_level },
  ];
}

function insightSignals(insights: CopilotRealInsight[]): CopilotBriefingSignal[] {
  return insights.slice(0, 12).map((i) => ({
    label: i.type.replace(/_/g, " "),
    detail: clip(`${i.company_name}: ${i.message}`, 220),
    tier: "risk" as const,
  }));
}

function alertSignals(alerts: FiscalAlertItem[]): CopilotBriefingSignal[] {
  return alerts.slice(0, 10).map((a) => ({
    label: `${a.priority} · ${a.type}`,
    detail: clip(a.summary, 200),
    tier: a.priority === "critical" || a.priority === "high" ? ("risk" as const) : ("watch" as const),
  }));
}

export async function assembleCopilotLlmBriefing(
  supabase: SupabaseClient,
  input: AssembleCopilotLlmBriefingInput
): Promise<CopilotLlmBriefingOutput> {
  const assembledAtIso = new Date().toISOString();
  const sources: CopilotBriefingSourceRef[] = [];
  const missingData: string[] = [];
  const cautelas: string[] = [
    "Los montos provienen del motor financiero y tablas proto; no sustituyen asesoramiento contable.",
    "Las alertas fiscales pueden no reflejar documentación aún no cargada en proto_documents.",
  ];

  let snapshot: FinancialSnapshot | null = null;
  try {
    snapshot = await getFinancialSnapshot(supabase, input.tenantCompanyId);
    sources.push({
      id: "financial_snapshot",
      label: "Motor financiero (proto normalizado)",
      asOfIso: assembledAtIso,
      coverage: "partial",
      detail: "Snapshot derivado de recibos, pagos, facturas y obligaciones fiscales en ventana del motor.",
    });
  } catch {
    missingData.push("No se pudo calcular el snapshot financiero.");
  }

  let portfolioRows = 0;
  try {
    const load = await getClientPortfolio(supabase, input.tenantCompanyId);
    portfolioRows = load.rows?.length ?? 0;
    sources.push({
      id: "client_portfolio",
      label: "Cartera proto (clientes / facturas agregadas)",
      asOfIso: assembledAtIso,
      coverage: portfolioRows > 0 ? "partial" : "insufficient",
      detail: `${portfolioRows} filas visibles en cartera para el tenant.`,
    });
    if (portfolioRows === 0) {
      missingData.push("Cartera sin filas visibles (puede ser base vacía o sin permisos de lectura).");
    }
  } catch {
    missingData.push("Cartera de clientes no disponible en este ensamblado.");
  }

  let insights: CopilotRealInsight[] = [];
  try {
    insights = await computeCopilotRealInsights(supabase, input.tenantCompanyId);
    sources.push({
      id: "real_insights",
      label: "Insights reales (reglas motor)",
      asOfIso: assembledAtIso,
      coverage: insights.length > 0 ? "partial" : "insufficient",
      detail: `${insights.length} lecturas activas según umbrales actuales.`,
    });
  } catch {
    missingData.push("No se pudieron calcular insights reales.");
  }

  let alerts: FiscalAlertItem[] = [];
  try {
    alerts = await getFiscalAlerts(supabase);
    sources.push({
      id: "fiscal_alerts",
      label: "Alertas fiscales / liquidez (motor interno)",
      asOfIso: assembledAtIso,
      coverage: alerts.length > 0 ? "partial" : "insufficient",
      detail: `${alerts.length} alertas materializadas.`,
    });
  } catch {
    missingData.push("Alertas fiscales no disponibles en este ensamblado.");
  }

  const actionBriefs: CopilotBriefingPipelineAction[] = [];
  try {
    const { data: actRows, error: actErr } = await selectActionsOrdered(
      supabase,
      ACTION_BRIEF_LIMIT
    );
    if (actErr) {
      missingData.push("No se pudieron leer acciones recientes del motor.");
    } else {
      const list = actRows ?? [];
      const initiativeIds = [...new Set(list.map((r) => String(r.initiative_id)))];
      const companyByInitiative = new Map<string, string | null>();
      if (initiativeIds.length > 0) {
        const { data: inits } = await selectInitiativeCompanyNamesByIds(
          supabase,
          initiativeIds
        );
        for (const i of inits ?? []) {
          companyByInitiative.set(
            String(i.id),
            i.company_name != null ? String(i.company_name) : null
          );
        }
      }
      const actionIds = list.map((r) => String(r.id));
      const outcomeByAction = new Map<string, string>();
      if (actionIds.length > 0) {
        const { data: outs } = await selectOutcomesByActionIds(supabase, actionIds);
        for (const o of outs ?? []) {
          const row = o as Record<string, unknown>;
          outcomeByAction.set(String(row.action_id), String(row.outcome_type));
        }
      }
      for (const r of list) {
        const row = r as Record<string, unknown>;
        const iid = String(row.initiative_id);
        const expected =
          row.expected_result != null ? String(row.expected_result) : null;
        actionBriefs.push({
          company: companyByInitiative.get(iid)?.trim() || "Empresa",
          action_type: String(row.action_type),
          channel: String(row.channel),
          execution_status: String(row.execution_status),
          outcome_type: outcomeByAction.get(String(row.id)) ?? null,
          expected_excerpt: expected ? clip(expected, 140) : null,
        });
      }
      sources.push({
        id: "actions_engine",
        label: "Acciones del pipeline (últimas filas)",
        asOfIso: assembledAtIso,
        coverage: actionBriefs.length > 0 ? "partial" : "insufficient",
        detail: `Hasta ${ACTION_BRIEF_LIMIT} acciones recientes; sin payloads crudos.`,
      });
    }
  } catch {
    missingData.push("Acciones recientes no disponibles.");
  }

  const facts: CopilotBriefingFact[] = [
    { key: "tenant_company_id", value: input.tenantCompanyId },
    { key: "operador", value: input.operatorLabel },
    { key: "rol_operador", value: input.operatorRole },
    { key: "filas_cartera_visibles", value: String(portfolioRows) },
  ];
  if (snapshot) {
    facts.push(...snapshotFacts(snapshot));
  }

  const signals: CopilotBriefingSignal[] = [
    ...insightSignals(insights),
    ...alertSignals(alerts),
  ];

  const recommendedFocus: string[] = [];
  if (insights.some((i) => i.type === "desbalance_caja")) {
    recommendedFocus.push("Revisar desbalance de caja y egresos próximos antes de nuevos compromisos.");
  }
  if (alerts.some((a) => a.priority === "critical")) {
    recommendedFocus.push("Priorizar alertas críticas fiscales o de liquidez listadas.");
  }
  if (insights.some((i) => i.type === "deuda_vencida" || i.type === "obl_fiscal_vencida")) {
    recommendedFocus.push("Abordar deuda u obligaciones vencidas con plan de cobro o pago.");
  }
  if (recommendedFocus.length === 0 && insights.length === 0 && alerts.length === 0) {
    recommendedFocus.push(
      "Cargar datos operativos (facturas, obligaciones, caja) antes de priorizar acciones automáticas."
    );
  }

  const hasSnapshot = snapshot != null;
  const hasAnySignal =
    insights.length > 0 ||
    alerts.length > 0 ||
    portfolioRows > 0 ||
    actionBriefs.length > 0;

  const coverage: "partial" | "insufficient" =
    hasSnapshot && hasAnySignal ? "partial" : "insufficient";

  const summary =
    coverage === "insufficient"
      ? "No hay datos suficientes para un briefing operativo confiable: faltan señales consolidadas (cartera, snapshot, insights o alertas)."
      : "Briefing operativo parcial: se combinan snapshot financiero, cartera visible, insights, alertas y acciones recientes con cobertura acotada; revisar faltantes antes de decisiones finas.";

  const trace: CopilotLlmBriefingTrace = {
    assembledAtIso,
    tenantCompanyId: input.tenantCompanyId,
    sources,
    missingData,
    cautelas,
  };

  return {
    summary,
    facts,
    signals,
    recommendedFocus,
    missingData,
    trace,
    coverage,
    recentPipelineActions: actionBriefs,
    llmInstructions: COPILOT_LLM_BRIEFING_FRAMING_ES,
  };
}
