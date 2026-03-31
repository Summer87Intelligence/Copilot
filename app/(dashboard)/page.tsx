"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RecommendedActions } from "@/components/dashboard/recommended-actions";
import type { CopilotInsight } from "@/lib/copilot-engine";
import type { TrendDirection } from "@/lib/dashboard-trends";
import type {
  DashboardScenarioName,
  DashboardSnapshot,
} from "@/lib/dashboard-data";
import type { CopilotInsightRecord } from "@/types/copilot-insight-record";
import { getCurrentAppUserContext } from "@/lib/current-user-context";
import { persistCopilotInsightsForSnapshotRecord } from "@/lib/copilot-persistence";
import {
  buildDashboardViewFromSnapshot,
  getDashboardScenarioMeta,
  getDashboardSnapshotRecordByScenario,
  getDashboardSnapshotSyncFallback,
  getLatestSnapshot,
  getPreviousDashboardSnapshotFromDB,
} from "@/lib/dashboard-service";
import {
  COPILOT_MODE_OPTIONS,
  type CopilotMode,
  getBaseCopilotMode,
  getCopilotMode,
  getCopilotModeLabel,
  isZetaSimulationActive,
  setLocalCopilotModeOverride,
} from "@/lib/copilot-mode";
import { getRecentCopilotInsights } from "@/services/copilot-insights-read-source";
import {
  insightAlert,
  insightOpportunity,
  insightRecommendation,
  messageError,
  messageSuccess,
  messageWarning,
} from "@/styles/ui";

const pageBg = "#f7f4ed";
const textPrimary = "#2c2825";

const shadowCard = "0 2px 14px rgba(44, 40, 37, 0.05)";
const shadowSoft = "0 4px 20px rgba(44, 40, 37, 0.06)";

const metricCardStyles = [
  { bg: "#e8eef6", border: "rgba(100, 120, 150, 0.12)" },
  { bg: "#e5efe8", border: "rgba(90, 120, 100, 0.12)" },
  { bg: "#f3e9e2", border: "rgba(140, 110, 95, 0.12)" },
  { bg: "#ebe7f4", border: "rgba(110, 100, 140, 0.12)" },
] as const;

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 18px",
  fontSize: "16px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: textPrimary,
};

const SCENARIO_OPTIONS: { id: DashboardScenarioName; label: string }[] = [
  { id: "risk", label: "Riesgo" },
  { id: "stable", label: "Estable" },
  { id: "growth", label: "Crecimiento" },
];

/** Debe coincidir con el título generado en `lib/copilot-engine.ts` (recurrencia). */
const COPILOT_RECURRENCE_INSIGHT_TITLE = "Problema recurrente detectado";

const copilotPriorityVisual: Record<
  CopilotInsight["priority"],
  { label: string; badgeBg: string }
> = {
  high: {
    label: "Alta",
    badgeBg: "rgba(165, 95, 95, 0.16)",
  },
  medium: {
    label: "Media",
    badgeBg: "rgba(130, 115, 75, 0.14)",
  },
  low: {
    label: "Baja",
    badgeBg: "rgba(80, 115, 95, 0.14)",
  },
};

const trendDirectionVisual: Record<
  TrendDirection,
  { arrow: string; label: string }
> = {
  up: { arrow: "↑", label: "subiendo" },
  down: { arrow: "↓", label: "bajando" },
  flat: { arrow: "→", label: "estable" },
};

const copilotTypeVisual: Record<
  CopilotInsight["type"],
  {
    label: string;
    emoji: string;
    panelBg: string;
    panelBorder: string;
    typeBadgeBg: string;
  }
> = {
  alert: {
    emoji: "🚨",
    label: "Alerta",
    panelBg: insightAlert.panelBg,
    panelBorder: insightAlert.panelBorder,
    typeBadgeBg: insightAlert.typeBadgeBg,
  },
  recommendation: {
    emoji: "✅",
    label: "Recomendación",
    panelBg: insightRecommendation.panelBg,
    panelBorder: insightRecommendation.panelBorder,
    typeBadgeBg: insightRecommendation.typeBadgeBg,
  },
  opportunity: {
    emoji: "🌱",
    label: "Oportunidad",
    panelBg: insightOpportunity.panelBg,
    panelBorder: insightOpportunity.panelBorder,
    typeBadgeBg: insightOpportunity.typeBadgeBg,
  },
};

const COPILOT_GROUP_ORDER: CopilotInsight["type"][] = [
  "alert",
  "recommendation",
  "opportunity",
];

const COPILOT_GROUP_HEADING: Record<CopilotInsight["type"], string> = {
  alert: "Riesgos detectados",
  recommendation: "Recomendaciones",
  opportunity: "Oportunidades",
};

const copilotGroupSubtitleStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: "rgba(44, 40, 37, 0.58)",
};

function bucketCopilotInsightsByType(
  insights: CopilotInsight[]
): Record<CopilotInsight["type"], CopilotInsight[]> {
  const out: Record<CopilotInsight["type"], CopilotInsight[]> = {
    alert: [],
    recommendation: [],
    opportunity: [],
  };
  for (const insight of insights) {
    out[insight.type].push(insight);
  }
  return out;
}

export default function DashboardPage() {
  const isDevBuild = process.env.NODE_ENV === "development";
  const [activeCopilotMode, setActiveCopilotMode] =
    useState<CopilotMode>(getBaseCopilotMode());
  const isSimulationMode = isZetaSimulationActive(activeCopilotMode);
  const [scenario, setScenario] = useState<DashboardScenarioName>("risk");
  const [snapshotFromDb, setSnapshotFromDb] = useState<DashboardSnapshot | null>(
    null
  );
  const [previousSnapshot, setPreviousSnapshot] =
    useState<DashboardSnapshot | null>(null);
  const [hasPersistedSnapshot, setHasPersistedSnapshot] = useState(false);
  const [snapshotPresenceKnown, setSnapshotPresenceKnown] = useState(false);
  const [copilotHistory, setCopilotHistory] = useState<CopilotInsightRecord[]>(
    []
  );
  const [copilotSavePending, setCopilotSavePending] = useState(false);
  const [copilotSaveMessage, setCopilotSaveMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    setCopilotSaveMessage(null);
    setCopilotSavePending(false);
  }, [scenario]);

  useEffect(() => {
    setActiveCopilotMode(getCopilotMode());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ctx = await getCurrentAppUserContext();
      const companyId = ctx?.companyId ?? null;

      let record = null as Awaited<
        ReturnType<typeof getDashboardSnapshotRecordByScenario>
      > | null;
      let previous: DashboardSnapshot | null = null;

      if (isSimulationMode) {
        [record, previous] = await Promise.all([
          getDashboardSnapshotRecordByScenario(scenario),
          getPreviousDashboardSnapshotFromDB(scenario),
        ]);
      } else if (companyId) {
        const latest = await getLatestSnapshot(companyId);
        if (latest) {
          record = latest;
        }
      }

      let history: CopilotInsightRecord[] = [];
      if (companyId) {
        history = await getRecentCopilotInsights(companyId);
      }

      if (!cancelled) {
        setSnapshotFromDb(record?.snapshot ?? null);
        setHasPersistedSnapshot(record?.id != null);
        setSnapshotPresenceKnown(true);
        setPreviousSnapshot(previous);
        setCopilotHistory(history);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenario, isSimulationMode]);

  const scenarioMeta = getDashboardScenarioMeta(scenario);
  const effectiveSnapshot =
    snapshotFromDb ?? getDashboardSnapshotSyncFallback(scenario);
  const {
    metrics,
    alerts,
    recommendedActions,
    executiveInsight,
    priorityOfTheDay,
    todayActions,
    estimatedImpact,
    copilotInsights,
    copilotExecutiveSummary,
    trends,
  } = buildDashboardViewFromSnapshot(
    effectiveSnapshot,
    previousSnapshot,
    copilotHistory
  );

  const safeTodayActions = Array.isArray(todayActions) ? todayActions : [];

  const copilotByType = bucketCopilotInsightsByType(copilotInsights);

  const handleSaveCopilotInsights = () => {
    void (async () => {
      setCopilotSavePending(true);
      setCopilotSaveMessage(null);
      try {
        const ctx = await getCurrentAppUserContext();
        const companyId = ctx?.companyId ?? null;
        if (!companyId) {
          setCopilotSaveMessage(
            "No hay empresa vinculada a tu cuenta. Revisá /account."
          );
          return;
        }
        const record = await getDashboardSnapshotRecordByScenario(scenario);
        const result = await persistCopilotInsightsForSnapshotRecord(
          record,
          companyId
        );
        if (result.error) {
          setCopilotSaveMessage(`Error al guardar: ${result.error.message}`);
          return;
        }
        if (!result.saved) {
          setCopilotSaveMessage(
            "No se guardó nada (sin insights para este snapshot)."
          );
          return;
        }
        setCopilotSaveMessage("Guardado correctamente.");
        setCopilotHistory(await getRecentCopilotInsights(companyId));
      } finally {
        setCopilotSavePending(false);
      }
    })();
  };

  const handleDevModeChange = (nextMode: CopilotMode) => {
    setLocalCopilotModeOverride(nextMode);
    window.location.reload();
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: pageBg,
        color: textPrimary,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
        padding: "32px 24px 56px",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      <DashboardHeader />
      <p
        style={{
          margin: "0 0 20px",
          fontSize: "14px",
          color: "rgba(44, 40, 37, 0.65)",
        }}
      >
        {isDevBuild ? (
          <span
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "11px",
              letterSpacing: "0.02em",
              color: "rgba(44, 40, 37, 0.48)",
            }}
          >
            Modo Copilot (solo desarrollo):{" "}
            <select
              aria-label="Modo Copilot de desarrollo"
              value={activeCopilotMode}
              onChange={(event) =>
                handleDevModeChange(event.target.value as CopilotMode)
              }
              style={{
                marginLeft: "6px",
                borderRadius: "8px",
                border: "1px solid rgba(44, 40, 37, 0.16)",
                background: "#faf8f5",
                color: textPrimary,
                fontSize: "11px",
                padding: "2px 8px",
                fontFamily: "inherit",
              }}
            >
              {COPILOT_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </span>
        ) : null}
        <Link
          href="/copilot-history"
          style={{ color: "rgba(90, 75, 120, 0.92)", textDecoration: "none" }}
        >
          Historial del Copilot
        </Link>
        {" · "}
        <Link
          href="/copilot-report"
          style={{ color: "rgba(90, 75, 120, 0.92)", textDecoration: "none" }}
        >
          Reporte ejecutivo
        </Link>
        {" · "}
        <Link
          href="/csv-import-test"
          style={{ color: "rgba(90, 75, 120, 0.92)", textDecoration: "none" }}
        >
          Importar datos (CSV)
        </Link>
        {isSimulationMode ? (
          <span
            style={{
              display: "block",
              marginTop: "8px",
              fontSize: "12px",
              letterSpacing: "0.02em",
              color: "rgba(44, 40, 37, 0.48)",
            }}
          >
            {getCopilotModeLabel(activeCopilotMode)}
          </span>
        ) : null}
      </p>

      {snapshotPresenceKnown && !hasPersistedSnapshot ? (
        <section style={{ marginBottom: "24px" }}>
          <div
            style={{
              backgroundColor: "#ece8f6",
              border: "1px solid rgba(102, 92, 138, 0.2)",
              borderRadius: "16px",
              padding: "16px 18px",
              boxShadow: shadowSoft,
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                fontSize: "17px",
                fontWeight: 700,
                color: textPrimary,
              }}
            >
              Empezá cargando tus datos
            </p>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "14px",
                lineHeight: 1.5,
                color: "rgba(44, 40, 37, 0.76)",
              }}
            >
              Para obtener insights del Copilot, primero importá tus datos
              financieros.
            </p>
            <Link
              href="/csv-import-test"
              style={{
                display: "inline-block",
                borderRadius: "10px",
                border: "1px solid rgba(90, 75, 120, 0.22)",
                backgroundColor: "#e4ddf0",
                color: textPrimary,
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
                padding: "8px 12px",
              }}
            >
              Importar datos (CSV)
            </Link>
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>🧪 Escenario de prueba</h2>
        <div
          style={{
            backgroundColor: "#f2efe8",
            border: "1px solid rgba(120, 100, 80, 0.12)",
            borderRadius: "16px",
            padding: "18px 20px",
            boxShadow: shadowSoft,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              opacity: isSimulationMode ? 0.56 : 1,
            }}
          >
            {SCENARIO_OPTIONS.map((opt) => {
              const isSelected = scenario === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isSimulationMode}
                  onClick={() => {
                    if (isSimulationMode) return;
                    setScenario(opt.id);
                  }}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "12px",
                    border: isSelected
                      ? "1px solid rgba(90, 75, 120, 0.32)"
                      : "1px solid rgba(44, 40, 37, 0.1)",
                    backgroundColor: isSelected ? "#e4ddf0" : "#faf8f5",
                    color: textPrimary,
                    fontSize: "14px",
                    fontWeight: isSelected ? 600 : 500,
                    cursor: isSimulationMode ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    boxShadow: isSelected ? shadowCard : "none",
                    transition: "background-color 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {isSimulationMode ? (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: "12px",
                letterSpacing: "0.01em",
                color: "rgba(44, 40, 37, 0.56)",
              }}
            >
              El escenario no es editable en modo simulación.
            </p>
          ) : null}
        </div>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>🏷️ Contexto del escenario</h2>
        <div
          style={{
            backgroundColor: "#e8ecf4",
            border: "1px solid rgba(95, 110, 150, 0.14)",
            borderRadius: "16px",
            padding: "22px 24px",
            boxShadow: shadowSoft,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "15px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "rgba(44, 40, 37, 0.55)",
            }}
          >
            {scenarioMeta.label}
          </p>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: "16px",
              lineHeight: 1.6,
              color: textPrimary,
            }}
          >
            {scenarioMeta.summary}
          </p>
          {isSimulationMode ? (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: "12px",
                letterSpacing: "0.01em",
                color: "rgba(44, 40, 37, 0.56)",
              }}
            >
              ℹ️ Este contexto proviene del modo de simulación activo y no del
              selector de escenario.
            </p>
          ) : null}
        </div>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>📉 Tendencia reciente</h2>
        <div
          style={{
            backgroundColor: "#f0ebe3",
            border: "1px solid rgba(110, 95, 75, 0.14)",
            borderRadius: "16px",
            padding: "20px 22px",
            boxShadow: shadowSoft,
          }}
        >
          {trends === null ? (
            <p
              style={{
                margin: 0,
                fontSize: "15px",
                lineHeight: 1.55,
                color: "rgba(44, 40, 37, 0.62)",
              }}
            >
              Sin comparación histórica disponible. Cuando haya un snapshot de
              referencia (período anterior), verás aquí la evolución de ventas,
              gastos y caja.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0",
              }}
            >
              {(
                [
                  { name: "Ventas", key: "salesTrend" as const },
                  { name: "Gastos", key: "expensesTrend" as const },
                  { name: "Caja", key: "cashTrend" as const },
                ] as const
              ).map((row, i, arr) => {
                const dir = trends[row.key];
                const tv = trendDirectionVisual[dir];
                return (
                  <div
                    key={row.key}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      paddingBottom:
                        i < arr.length - 1 ? "14px" : "0",
                      borderBottom:
                        i < arr.length - 1
                          ? "1px solid rgba(44, 40, 37, 0.08)"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: textPrimary,
                        minWidth: "72px",
                      }}
                    >
                      {row.name}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "15px",
                        color: "rgba(44, 40, 37, 0.75)",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          fontSize: "20px",
                          lineHeight: 1,
                          fontFamily: "ui-monospace, monospace",
                          color: textPrimary,
                        }}
                      >
                        {tv.arrow}
                      </span>
                      <span>{tv.label}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>🎯 Prioridad del día</h2>
        <div
          style={{
            backgroundColor: "#e8f0ec",
            border: "1px solid rgba(90, 130, 105, 0.14)",
            borderRadius: "16px",
            padding: "22px 24px",
            boxShadow: shadowSoft,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "17px",
              fontWeight: 600,
              lineHeight: 1.35,
              color: textPrimary,
              letterSpacing: "-0.01em",
            }}
          >
            {priorityOfTheDay.title}
          </p>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "16px",
              lineHeight: 1.6,
              color: textPrimary,
            }}
          >
            {priorityOfTheDay.description}
          </p>
        </div>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>📌 Qué hacer hoy</h2>
        <ul
          style={{
            backgroundColor: "#f2edef",
            border: "1px solid rgba(130, 100, 120, 0.12)",
            borderRadius: "16px",
            padding: "22px 24px 22px 40px",
            margin: 0,
            listStyle: "disc",
            boxShadow: shadowSoft,
          }}
        >
          {safeTodayActions.map((item, index) => (
            <li
              key={`today-action-${index}`}
              style={{
                marginBottom:
                  index < safeTodayActions.length - 1 ? "12px" : 0,
                fontSize: "15px",
                lineHeight: 1.55,
                color: textPrimary,
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>📈 Impacto estimado</h2>
        <div
          style={{
            backgroundColor: "#f0e8df",
            border: "1px solid rgba(140, 110, 90, 0.14)",
            borderRadius: "16px",
            padding: "22px 24px",
            boxShadow: shadowSoft,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "17px",
              fontWeight: 600,
              lineHeight: 1.35,
              color: textPrimary,
              letterSpacing: "-0.01em",
            }}
          >
            {estimatedImpact.title}
          </p>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "16px",
              lineHeight: 1.6,
              color: textPrimary,
            }}
          >
            {estimatedImpact.description}
          </p>
        </div>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
          <h2 style={{ ...sectionTitleStyle, margin: 0, flex: "1 1 220px" }}>
            🤖 Recomendaciones del Copilot
          </h2>
          <button
            type="button"
            onClick={handleSaveCopilotInsights}
            disabled={copilotSavePending}
            style={{
              padding: "10px 18px",
              borderRadius: "12px",
              border: "1px solid rgba(90, 75, 120, 0.28)",
              backgroundColor: copilotSavePending ? "#e0dce8" : "#e4ddf0",
              color: textPrimary,
              fontSize: "14px",
              fontWeight: 600,
              cursor: copilotSavePending ? "wait" : "pointer",
              fontFamily: "inherit",
              boxShadow: shadowCard,
              flexShrink: 0,
            }}
          >
            {copilotSavePending ? "Guardando…" : "Guardar lectura del Copilot"}
          </button>
        </div>
        {copilotSaveMessage ? (
          <p
            role="status"
            style={{
              margin: "0 0 14px",
              fontSize: "14px",
              lineHeight: 1.5,
              color:
                copilotSaveMessage.startsWith("Guardado correctamente")
                  ? messageSuccess.text
                  : copilotSaveMessage.startsWith("No hay empresa")
                    ? messageWarning.text
                    : messageError.text,
            }}
          >
            {copilotSaveMessage.startsWith("Guardado correctamente") ? (
              <>
                Guardado correctamente.{" "}
                <Link
                  href="/copilot-history"
                  style={{
                    color: "rgba(90, 75, 120, 0.95)",
                    fontWeight: 600,
                  }}
                >
                  Ver historial del Copilot
                </Link>
              </>
            ) : (
              copilotSaveMessage
            )}
          </p>
        ) : null}
        <div
          style={{
            margin: "0 0 12px",
            backgroundColor: "#f2edf8",
            border: "1px solid rgba(108, 94, 140, 0.14)",
            borderRadius: "12px",
            padding: "10px 12px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              lineHeight: 1.45,
              color: "rgba(44, 40, 37, 0.72)",
            }}
          >
            💡 El Copilot analiza tus datos financieros y te sugiere acciones
            concretas para mejorar tu negocio.
          </p>
        </div>
        <div
          style={{
            margin: "0 0 14px",
            backgroundColor: "#eee9f4",
            border: "1px solid rgba(100, 90, 130, 0.14)",
            borderRadius: "12px",
            padding: "14px 16px",
            boxShadow: shadowCard,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              color: "rgba(44, 40, 37, 0.55)",
            }}
          >
            Resumen ejecutivo del Copilot
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "14px",
              lineHeight: 1.55,
              color: "rgba(44, 40, 37, 0.82)",
            }}
          >
            {copilotExecutiveSummary}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {copilotInsights.length === 0 ? (
            <div
              style={{
                backgroundColor: "#f0eef5",
                border: "1px solid rgba(100, 90, 130, 0.12)",
                borderRadius: "16px",
                padding: "20px 22px",
                boxShadow: shadowSoft,
                fontSize: "15px",
                lineHeight: 1.55,
                color: "rgba(44, 40, 37, 0.65)",
              }}
            >
              No hay recomendaciones adicionales para los números de este
              escenario.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "22px",
              }}
            >
              {COPILOT_GROUP_ORDER.map((groupType) => {
                const items = copilotByType[groupType];
                if (items.length === 0) return null;
                return (
                  <div key={groupType}>
                    <h3 style={copilotGroupSubtitleStyle}>
                      {COPILOT_GROUP_HEADING[groupType]}
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                      }}
                    >
                      {items.map((insight, index) => {
                        const pv = copilotPriorityVisual[insight.priority];
                        const tv = copilotTypeVisual[insight.type];
                        const isHistoryDriven =
                          insight.title === COPILOT_RECURRENCE_INSIGHT_TITLE;
                        return (
                          <div
                            key={`${groupType}-${insight.title}-${index}`}
                            style={{
                              backgroundColor: tv.panelBg,
                              border: `1px solid ${tv.panelBorder}`,
                              borderRadius: "16px",
                              padding: "18px 20px",
                              boxShadow: shadowSoft,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "10px",
                                marginBottom: "12px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  gap: "8px",
                                  flex: "1 1 auto",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    letterSpacing: "0.02em",
                                    padding: "6px 11px",
                                    borderRadius: "8px",
                                    backgroundColor: tv.typeBadgeBg,
                                    color: textPrimary,
                                  }}
                                >
                                  {tv.emoji} {tv.label}
                                </span>
                                {isHistoryDriven ? (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 600,
                                      letterSpacing: "0.03em",
                                      padding: "5px 10px",
                                      borderRadius: "8px",
                                      backgroundColor:
                                        "rgba(100, 90, 140, 0.09)",
                                      border:
                                        "1px solid rgba(100, 90, 140, 0.14)",
                                      color: "rgba(44, 40, 37, 0.78)",
                                    }}
                                  >
                                    🧠 Historial reciente
                                  </span>
                                ) : null}
                              </div>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  letterSpacing: "0.06em",
                                  textTransform: "uppercase",
                                  padding: "5px 10px",
                                  borderRadius: "8px",
                                  backgroundColor: pv.badgeBg,
                                  color: textPrimary,
                                }}
                              >
                                Prioridad {pv.label}
                              </span>
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: "17px",
                                fontWeight: 600,
                                lineHeight: 1.35,
                                color: textPrimary,
                                letterSpacing: "-0.01em",
                              }}
                            >
                              {insight.title}
                            </p>
                            <p
                              style={{
                                margin: "10px 0 0",
                                fontSize: "15px",
                                lineHeight: 1.6,
                                color: textPrimary,
                              }}
                            >
                              {insight.description}
                            </p>
                            {insight.action?.trim() ? (
                              <div
                                style={{
                                  marginTop: "14px",
                                  padding: "11px 14px 12px 13px",
                                  borderRadius: "10px",
                                  borderLeft:
                                    "3px solid rgba(100, 90, 130, 0.2)",
                                  backgroundColor: "rgba(255, 255, 255, 0.42)",
                                }}
                              >
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    letterSpacing: "0.02em",
                                    color: "rgba(44, 40, 37, 0.52)",
                                  }}
                                >
                                  Siguiente acción sugerida:
                                </p>
                                <p
                                  style={{
                                    margin: "6px 0 0",
                                    fontSize: "13px",
                                    lineHeight: 1.55,
                                    color: "rgba(44, 40, 37, 0.76)",
                                  }}
                                >
                                  {insight.action.trim()}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>🧠 Insight ejecutivo</h2>
        <div
          style={{
            backgroundColor: "#ebe8f2",
            border: "1px solid rgba(100, 90, 130, 0.12)",
            borderRadius: "16px",
            padding: "22px 24px",
            boxShadow: shadowSoft,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "16px",
              lineHeight: 1.6,
              color: textPrimary,
            }}
          >
            {executiveInsight}
          </p>
        </div>
      </section>

      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionTitleStyle}>📊 Métricas clave</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "18px",
          }}
        >
          {metrics.map((item, index) => {
            const cardStyle = metricCardStyles[index];
            return (
              <MetricCard
                key={item.title}
                title={item.title}
                value={item.value}
                style={{
                  backgroundColor: cardStyle.bg,
                  border: `1px solid ${cardStyle.border}`,
                  borderRadius: "14px",
                  padding: "22px 20px",
                  boxShadow: shadowCard,
                }}
              />
            );
          })}
        </div>
      </section>

      <AlertsPanel alerts={alerts} />

      <RecommendedActions recommendedActions={recommendedActions} />
    </main>
  );
}
