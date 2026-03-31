"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

import { getCurrentAppUserContext } from "@/lib/current-user-context";
import {
  buildDashboardViewFromSnapshot,
  getDashboardScenarioMeta,
  getDashboardSnapshotByScenario,
  getDashboardSnapshotSyncFallback,
  getPreviousDashboardSnapshotFromDB,
  type DashboardScenarioName,
} from "@/lib/dashboard-service";
import { generateCopilotWeeklySummary } from "@/lib/copilot-weekly-summary";
import { getRecentCopilotInsights } from "@/services/copilot-insights-read-source";
import type { DashboardSnapshot } from "@/lib/dashboard-data";
import type { CopilotInsightRecord } from "@/types/copilot-insight-record";

const scenario: DashboardScenarioName = "risk";

const pageBg = "#f7f4ed";
const textPrimary = "#2c2825";
const muted = "rgba(44, 40, 37, 0.62)";
const panelBg = "#f3efe7";
const panelBorder = "rgba(110, 95, 80, 0.14)";
const shadowSoft = "0 4px 18px rgba(44, 40, 37, 0.05)";

function sectionCardStyle(): CSSProperties {
  return {
    backgroundColor: panelBg,
    border: `1px solid ${panelBorder}`,
    borderRadius: "14px",
    padding: "18px 20px",
    boxShadow: shadowSoft,
  };
}

const printStyles = `
@media print {
  @page {
    margin: 14mm 16mm;
  }
  .copilot-report-no-print {
    display: none !important;
  }
  main.copilot-report {
    background: #fff !important;
    color: #111 !important;
    padding: 0 !important;
    min-height: auto !important;
  }
  .copilot-report-root {
    max-width: 100% !important;
  }
  .copilot-report-section {
    box-shadow: none !important;
    background: #fff !important;
    border: 1px solid #bbb !important;
    border-radius: 2px !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .copilot-report-insight {
    background: #fff !important;
    border-color: #ccc !important;
    box-shadow: none !important;
  }
  .copilot-report-muted {
    color: #333 !important;
  }
  .copilot-report h1,
  .copilot-report h2 {
    color: #000 !important;
  }
  .copilot-report a {
    color: inherit !important;
    text-decoration: none !important;
  }
}
`;

export default function CopilotReportPage() {
  const [loading, setLoading] = useState(true);
  const [snapshotFromDb, setSnapshotFromDb] = useState<DashboardSnapshot | null>(
    null
  );
  const [previousSnapshot, setPreviousSnapshot] =
    useState<DashboardSnapshot | null>(null);
  const [copilotHistory, setCopilotHistory] = useState<CopilotInsightRecord[]>(
    []
  );
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [next, previous, ctx] = await Promise.all([
          getDashboardSnapshotByScenario(scenario),
          getPreviousDashboardSnapshotFromDB(scenario),
          getCurrentAppUserContext(),
        ]);
        const cid = ctx?.companyId ?? null;
        let history: CopilotInsightRecord[] = [];
        if (cid) {
          history = await getRecentCopilotInsights(cid);
        }

        if (!cancelled) {
          setSnapshotFromDb(next);
          setPreviousSnapshot(previous);
          setCompanyId(cid);
          setCopilotHistory(history);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveSnapshot = snapshotFromDb ?? getDashboardSnapshotSyncFallback(scenario);
  const scenarioMeta = getDashboardScenarioMeta(scenario);
  const view = buildDashboardViewFromSnapshot(
    effectiveSnapshot,
    previousSnapshot,
    copilotHistory
  );
  const weeklySummary =
    copilotHistory.length > 0 ? generateCopilotWeeklySummary(copilotHistory) : null;

  return (
    <main
      className="copilot-report"
      style={{
        minHeight: "100vh",
        backgroundColor: pageBg,
        color: textPrimary,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
        padding: "32px 24px 56px",
      }}
    >
      <style>{printStyles}</style>
      <div className="copilot-report-root" style={{ maxWidth: "840px", margin: "0 auto" }}>
        <p
          className="copilot-report-no-print"
          style={{
            margin: "0 0 20px",
            fontSize: "14px",
            color: "rgba(44, 40, 37, 0.65)",
          }}
        >
          <Link
            href="/"
            style={{ color: "rgba(90, 75, 120, 0.92)", textDecoration: "none" }}
          >
            Dashboard
          </Link>
          {" · "}
          <Link
            href="/copilot-history"
            style={{ color: "rgba(90, 75, 120, 0.92)", textDecoration: "none" }}
          >
            Historial del Copilot
          </Link>
        </p>

        <div
          className="copilot-report-no-print"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            margin: "0 0 16px",
          }}
        >
          <button
            type="button"
            onClick={() => window.print()}
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              border: "1px solid rgba(90, 75, 120, 0.28)",
              backgroundColor: loading ? "#e8e4ee" : "#e4ddf0",
              color: textPrimary,
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              fontFamily: "inherit",
              boxShadow: "0 2px 10px rgba(44, 40, 37, 0.05)",
            }}
          >
            Imprimir / Guardar PDF
          </button>
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: "30px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Reporte ejecutivo del Copilot
        </h1>
        <p
          className="copilot-report-muted"
          style={{
            margin: "10px 0 28px",
            fontSize: "15px",
            lineHeight: 1.55,
            color: muted,
          }}
        >
          Lectura ejecutiva preparada para revisión interna, compartir o futura
          exportación. Escenario base: {scenarioMeta.label}.
        </p>

        {loading ? (
          <p style={{ margin: 0, color: muted }}>Cargando reporte…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <section className="copilot-report-section" style={sectionCardStyle()}>
              <h2 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.02em" }}>
                Contexto del escenario
              </h2>
              <p style={{ margin: "10px 0 0", fontSize: "15px", lineHeight: 1.6 }}>
                {scenarioMeta.summary}
              </p>
            </section>

            <section className="copilot-report-section" style={sectionCardStyle()}>
              <h2 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.02em" }}>
                Prioridad del día
              </h2>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: "18px",
                  fontWeight: 600,
                  lineHeight: 1.35,
                }}
              >
                {view.priorityOfTheDay.title}
              </p>
              <p style={{ margin: "10px 0 0", fontSize: "15px", lineHeight: 1.6 }}>
                {view.priorityOfTheDay.description}
              </p>
            </section>

            <section className="copilot-report-section" style={sectionCardStyle()}>
              <h2 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.02em" }}>
                Qué hacer hoy
              </h2>
              <ul
                style={{
                  margin: "10px 0 0",
                  paddingLeft: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {view.todayActions.map((item, idx) => (
                  <li key={`today-${idx}`} style={{ fontSize: "15px", lineHeight: 1.55 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="copilot-report-section" style={sectionCardStyle()}>
              <h2 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.02em" }}>
                Impacto estimado
              </h2>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: "17px",
                  fontWeight: 600,
                  lineHeight: 1.35,
                }}
              >
                {view.estimatedImpact.title}
              </p>
              <p style={{ margin: "10px 0 0", fontSize: "15px", lineHeight: 1.6 }}>
                {view.estimatedImpact.description}
              </p>
            </section>

            <section className="copilot-report-section" style={sectionCardStyle()}>
              <h2 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.02em" }}>
                Resumen ejecutivo del Copilot
              </h2>
              <p style={{ margin: "10px 0 0", fontSize: "15px", lineHeight: 1.6 }}>
                {view.copilotExecutiveSummary}
              </p>
            </section>

            <section className="copilot-report-section" style={sectionCardStyle()}>
              <h2 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.02em" }}>
                Recomendaciones del Copilot
              </h2>
              {view.copilotInsights.length === 0 ? (
                <p
                  className="copilot-report-muted"
                  style={{ margin: "10px 0 0", fontSize: "15px", color: muted }}
                >
                  No hay recomendaciones para este escenario.
                </p>
              ) : (
                <div
                  style={{
                    marginTop: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {view.copilotInsights.map((insight, index) => (
                    <article
                      className="copilot-report-insight"
                      key={`${insight.title}-${index}`}
                      style={{
                        border: "1px solid rgba(44, 40, 37, 0.1)",
                        borderRadius: "12px",
                        padding: "12px 14px",
                        backgroundColor: "rgba(255, 255, 255, 0.45)",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: "12px",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: "rgba(44, 40, 37, 0.66)",
                        }}
                      >
                        {insight.type} · prioridad {insight.priority}
                      </p>
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: "16px",
                          fontWeight: 600,
                          lineHeight: 1.35,
                        }}
                      >
                        {insight.title}
                      </p>
                      <p style={{ margin: "8px 0 0", fontSize: "14px", lineHeight: 1.55 }}>
                        {insight.description}
                      </p>
                      {insight.action?.trim() ? (
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: "13px",
                            lineHeight: 1.5,
                            color: "rgba(44, 40, 37, 0.75)",
                          }}
                        >
                          <strong>Siguiente acción sugerida:</strong> {insight.action}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="copilot-report-section" style={sectionCardStyle()}>
              <h2 style={{ margin: 0, fontSize: "14px", letterSpacing: "0.02em" }}>
                Resumen semanal del Copilot
              </h2>
              {companyId === null ? (
                <p
                  className="copilot-report-muted"
                  style={{ margin: "10px 0 0", fontSize: "15px", color: muted }}
                >
                  Sin empresa vinculada, no hay historial para resumen semanal.
                </p>
              ) : weeklySummary ? (
                <p style={{ margin: "10px 0 0", fontSize: "15px", lineHeight: 1.6 }}>
                  {weeklySummary}
                </p>
              ) : (
                <p
                  className="copilot-report-muted"
                  style={{ margin: "10px 0 0", fontSize: "15px", color: muted }}
                >
                  Aún no hay historial suficiente para construir el resumen semanal.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
