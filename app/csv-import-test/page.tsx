"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

import { sampleCsvBalanced, sampleCsvHighRisk } from "@/mocks/csv-sample-data";
import { buildSnapshotFromCsv } from "@/services/csv-importer";
import type { DashboardSnapshot } from "@/lib/dashboard-data";
import {
  generateCopilotInsights,
  type CopilotInsight,
} from "@/lib/copilot-engine";
import { getCurrentAppUserContext } from "@/lib/current-user-context";
import { saveDashboardSnapshot } from "@/services/dashboard-snapshot-write-source";
import {
  buttonNeutral,
  buttonPrimary,
  buttonPrimaryDisabled,
  buttonSecondary,
  buttonSecondaryDisabled,
  buttonSoftSuccess,
  messageError,
  messageSuccess,
} from "@/styles/ui";

const pageBg = "#f7f4ed";
const textPrimary = "#2c2825";
const panelBg = "#f3efe7";
const panelBorder = "rgba(110, 95, 80, 0.14)";
const shadowSoft = "0 4px 18px rgba(44, 40, 37, 0.05)";
const DEMO_COMPANY_ID = "company-demo-summer87";
const SAVE_SCENARIO_OPTIONS = [
  { value: "csv-import", label: "csv-import" },
  { value: "risk", label: "risk" },
  { value: "stable", label: "stable" },
  { value: "growth", label: "growth" },
] as const;

function money(value: number): string {
  return `$${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function sectionCardStyle(): CSSProperties {
  return {
    backgroundColor: panelBg,
    border: `1px solid ${panelBorder}`,
    borderRadius: "14px",
    padding: "18px 20px",
    boxShadow: shadowSoft,
  };
}

export default function CsvImportTestPage() {
  const [csvText, setCsvText] = useState(sampleCsvBalanced);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [insights, setInsights] = useState<CopilotInsight[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [saveScenario, setSaveScenario] =
    useState<(typeof SAVE_SCENARIO_OPTIONS)[number]["value"]>("csv-import");

  const handleProcessCsv = async () => {
    setLoading(true);
    setError(null);
    setSaveError(null);
    setSaveMessage(null);
    try {
      // Async boundary simple para reflejar estado de carga aunque el parser sea sync.
      await Promise.resolve();
      const next = buildSnapshotFromCsv(csvText, DEMO_COMPANY_ID);
      const nextInsights = generateCopilotInsights(next);
      setSnapshot(next);
      setInsights(nextInsights);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setError(message);
      setSnapshot(null);
      setInsights([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!snapshot) {
      setSaveError("Primero procesá un CSV para generar el snapshot.");
      setSaveMessage(null);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const ctx = await getCurrentAppUserContext();
      const companyId = ctx?.companyId ?? null;

      if (!companyId) {
        setSaveError(
          "No se encontró companyId en tu sesión. Revisá la vinculación en /account.",
        );
        return;
      }

      const result = await saveDashboardSnapshot(snapshot, companyId, saveScenario);
      if (!result.success || result.error) {
        setSaveError(result.error?.message ?? "No se pudo guardar el snapshot.");
        return;
      }

      setSaveMessage(
        result.id
          ? `Snapshot guardado correctamente (id: ${result.id}).`
          : "Snapshot guardado correctamente.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCsvExample = async () => {
    try {
      await navigator.clipboard.writeText(sampleCsvBalanced);
      setCopyMessage("Ejemplo copiado al portapapeles.");
    } catch {
      setCopyMessage("No se pudo copiar automáticamente. Copialo manualmente.");
    }
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
        maxWidth: "1000px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: "28px", fontWeight: 700 }}>
        CSV Import Test
      </h1>
      <p
        style={{
          margin: "0 0 20px",
          fontSize: "14px",
          color: "rgba(44, 40, 37, 0.65)",
        }}
      >
        Herramienta interna para probar CSV → Snapshot sin tocar dashboard ni DB.
      </p>

      <section style={{ ...sectionCardStyle(), marginBottom: "20px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "12px",
          }}
        >
          <button
            type="button"
            onClick={() => setCsvText(sampleCsvBalanced)}
            style={{
              borderRadius: "10px",
              border: `1px solid ${buttonSoftSuccess.border}`,
              background: buttonSoftSuccess.background,
              color: buttonSoftSuccess.text,
              padding: "8px 12px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Probar con datos
          </button>
          <button
            type="button"
            onClick={() => setCsvText(sampleCsvHighRisk)}
            style={{
              borderRadius: "10px",
              border: "1px solid rgba(44, 40, 37, 0.12)",
              background: "#faf8f5",
              color: textPrimary,
              padding: "8px 12px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Cargar sample alto riesgo
          </button>
        </div>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "13px",
            color: "rgba(44, 40, 37, 0.7)",
          }}
        >
          Pegá tu CSV o usá este ejemplo como referencia:
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => void handleCopyCsvExample()}
            style={{
              borderRadius: "10px",
              border: `1px solid ${buttonNeutral.border}`,
              background: buttonNeutral.background,
              color: buttonNeutral.text,
              padding: "7px 11px",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Copiar ejemplo de CSV
          </button>
          {copyMessage ? (
            <span style={{ fontSize: "12px", color: "rgba(44, 40, 37, 0.62)" }}>
              {copyMessage}
            </span>
          ) : null}
        </div>
        <pre
          style={{
            margin: "0 0 12px",
            maxHeight: "180px",
            overflow: "auto",
            borderRadius: "10px",
            border: "1px solid rgba(44, 40, 37, 0.14)",
            padding: "10px 12px",
            background: "#fffaf2",
            color: "rgba(44, 40, 37, 0.88)",
            fontSize: "12px",
            lineHeight: 1.45,
          }}
        >
          <code>{sampleCsvBalanced}</code>
        </pre>

        <textarea
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: "320px",
            borderRadius: "12px",
            border: "1px solid rgba(44, 40, 37, 0.16)",
            padding: "12px",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: "13px",
            background: "#fffdf9",
            color: textPrimary,
            resize: "vertical",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "12px",
          }}
        >
          <button
            type="button"
            onClick={() => void handleProcessCsv()}
            disabled={loading}
            style={{
              borderRadius: "10px",
              border: `1px solid ${buttonPrimary.border}`,
              background: loading
                ? buttonPrimaryDisabled.background
                : buttonPrimary.background,
              color: buttonPrimary.text,
              padding: "9px 14px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Procesando..." : "Procesar CSV"}
          </button>
          <span style={{ fontSize: "12px", color: "rgba(44, 40, 37, 0.56)" }}>
            companyId: {DEMO_COMPANY_ID}
          </span>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "rgba(44, 40, 37, 0.62)",
            }}
          >
            scenario:
            <select
              value={saveScenario}
              onChange={(event) =>
                setSaveScenario(
                  event.target.value as (typeof SAVE_SCENARIO_OPTIONS)[number]["value"],
                )
              }
              disabled={saving}
              style={{
                borderRadius: "8px",
                border: "1px solid rgba(44, 40, 37, 0.16)",
                background: "#faf8f5",
                color: textPrimary,
                fontSize: "12px",
                padding: "4px 8px",
                fontFamily: "inherit",
              }}
            >
              {SAVE_SCENARIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleSaveSnapshot()}
            disabled={loading || saving || snapshot == null}
            style={{
              borderRadius: "10px",
              border: `1px solid ${buttonSecondary.border}`,
              background:
                loading || saving || snapshot == null
                  ? buttonSecondaryDisabled.background
                  : buttonSecondary.background,
              color: buttonSecondary.text,
              padding: "9px 14px",
              fontSize: "14px",
              fontWeight: 600,
              cursor:
                loading || saving || snapshot == null ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Guardando..." : "Guardar snapshot"}
          </button>
        </div>

        {error ? (
          <p
            style={{
              margin: "12px 0 0",
              color: messageError.text,
              fontSize: "13px",
            }}
          >
            Error: {error}
          </p>
        ) : null}
        {saveError ? (
          <p
            style={{
              margin: "8px 0 0",
              color: messageError.text,
              fontSize: "13px",
            }}
          >
            Error al guardar: {saveError}
          </p>
        ) : null}
        {saveMessage ? (
          <p
            style={{
              margin: "8px 0 0",
              color: messageSuccess.text,
              fontSize: "13px",
            }}
          >
            {saveMessage}
          </p>
        ) : null}
      </section>

      <section style={sectionCardStyle()}>
        <h2 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 700 }}>
          Snapshot result
        </h2>
        {snapshot == null ? (
          <p style={{ margin: 0, fontSize: "14px", color: "rgba(44, 40, 37, 0.62)" }}>
            Procesá un CSV para visualizar KPIs.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "10px",
            }}
          >
            {[
              { label: "Caja disponible", value: money(snapshot.cashAvailable) },
              { label: "Ventas del mes", value: money(snapshot.monthlySales) },
              { label: "Gastos del mes", value: money(snapshot.monthlyExpenses) },
              {
                label: "Cobranzas pendientes",
                value: money(snapshot.pendingCollections),
              },
              { label: "Riesgo de caja", value: `${snapshot.cashRiskDays} días` },
            ].map((kpi) => (
              <article
                key={kpi.label}
                style={{
                  border: "1px solid rgba(44, 40, 37, 0.1)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  background: "#faf8f5",
                }}
              >
                <p
                  style={{
                    margin: "0 0 4px",
                    fontSize: "12px",
                    letterSpacing: "0.02em",
                    color: "rgba(44, 40, 37, 0.58)",
                  }}
                >
                  {kpi.label}
                </p>
                <p style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>
                  {kpi.value}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ ...sectionCardStyle(), marginTop: "20px" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 700 }}>
          Insights del Copilot
        </h2>
        {snapshot == null ? (
          <p style={{ margin: 0, fontSize: "14px", color: "rgba(44, 40, 37, 0.62)" }}>
            Procesá un CSV para generar insights.
          </p>
        ) : insights.length === 0 ? (
          <p style={{ margin: 0, fontSize: "14px", color: "rgba(44, 40, 37, 0.62)" }}>
            No se generaron insights para este CSV.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {insights.map((insight, idx) => (
              <article
                key={`${insight.type}-${insight.priority}-${insight.title}-${idx}`}
                style={{
                  border: "1px solid rgba(44, 40, 37, 0.1)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  background: "#faf8f5",
                }}
              >
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: "12px",
                    letterSpacing: "0.02em",
                    color: "rgba(44, 40, 37, 0.58)",
                    textTransform: "uppercase",
                  }}
                >
                  {insight.type} · prioridad {insight.priority}
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 700 }}>
                  {insight.title}
                </p>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.5 }}>
                  {insight.description}
                </p>
                {insight.action ? (
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "13px",
                      color: "rgba(44, 40, 37, 0.76)",
                    }}
                  >
                    <strong>Acción sugerida:</strong> {insight.action}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

