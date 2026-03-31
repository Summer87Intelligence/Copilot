"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getCurrentAppUserContext } from "@/lib/current-user-context";
import { generateCopilotWeeklySummary } from "@/lib/copilot-weekly-summary";
import { getRecentCopilotInsights } from "@/services/copilot-insights-read-source";
import { messageInfo } from "@/styles/ui";
import type { CopilotInsightRecord } from "@/types/copilot-insight-record";

const pageBg = "#f7f4ed";
const textPrimary = "#2c2825";
const panelBg = "#f2efe8";
const panelBorder = "rgba(120, 100, 80, 0.12)";
const muted = "rgba(44, 40, 37, 0.6)";
const shadowSoft = "0 4px 20px rgba(44, 40, 37, 0.06)";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function CopilotHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [insights, setInsights] = useState<CopilotInsightRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await getCurrentAppUserContext();
        const cid = ctx?.companyId ?? null;
        if (!cancelled) setCompanyId(cid);
        if (cid && !cancelled) {
          const rows = await getRecentCopilotInsights(cid, 10);
          if (!cancelled) setInsights(rows);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const weeklySummary =
    insights.length > 0 ? generateCopilotWeeklySummary(insights) : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: pageBg,
        color: textPrimary,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
        padding: "32px 24px 56px",
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      <p
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
          href="/copilot-report"
          style={{ color: "rgba(90, 75, 120, 0.92)", textDecoration: "none" }}
        >
          Reporte ejecutivo
        </Link>
      </p>

      <h1
        style={{
          margin: "0 0 8px",
          fontSize: "26px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        Historial del Copilot
      </h1>
      <p
        style={{
          margin: "0 0 28px",
          fontSize: "15px",
          lineHeight: 1.5,
          color: muted,
        }}
      >
        Insights guardados para tu empresa (más recientes primero).
      </p>

      {loading ? (
        <p style={{ margin: 0, color: muted }}>Cargando…</p>
      ) : companyId === null ? (
        <section
          style={{
            backgroundColor: panelBg,
            border: `1px solid ${panelBorder}`,
            borderRadius: "16px",
            padding: "22px 24px",
            boxShadow: shadowSoft,
          }}
        >
          <p style={{ margin: 0, fontSize: "16px", lineHeight: 1.55 }}>
            No hay empresa asociada a tu sesión. Necesitás una cuenta vinculada a{" "}
            <code style={{ fontSize: "14px" }}>app_users</code> con{" "}
            <code style={{ fontSize: "14px" }}>company_id</code> para ver el
            historial persistido.
          </p>
          <p style={{ margin: "14px 0 0", fontSize: "14px" }}>
            <Link
              href="/account"
              style={{ color: "rgba(90, 75, 120, 0.95)", fontWeight: 600 }}
            >
              Revisar mi cuenta →
            </Link>
          </p>
        </section>
      ) : insights.length === 0 ? (
        <section
          style={{
            backgroundColor: messageInfo.background,
            border: `1px solid ${messageInfo.border}`,
            borderRadius: "16px",
            padding: "22px 24px",
            boxShadow: shadowSoft,
            fontSize: "15px",
            lineHeight: 1.55,
            color: messageInfo.text,
          }}
        >
          Todavía no hay insights guardados para esta empresa. Cuando ejecutes la
          persistencia del Copilot (por ejemplo desde un flujo en servidor), los
          verás listados aquí.
        </section>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {weeklySummary ? (
            <section
              style={{
                backgroundColor: "#eee9f4",
                border: "1px solid rgba(100, 90, 130, 0.14)",
                borderRadius: "16px",
                padding: "18px 20px",
                boxShadow: shadowSoft,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  color: "rgba(44, 40, 37, 0.56)",
                }}
              >
                Resumen semanal del Copilot
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "15px",
                  lineHeight: 1.55,
                  color: textPrimary,
                }}
              >
                {weeklySummary}
              </p>
            </section>
          ) : null}
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {insights.map((item) => (
              <li
                key={item.id}
                style={{
                  backgroundColor: panelBg,
                  border: `1px solid ${panelBorder}`,
                  borderRadius: "16px",
                  padding: "18px 20px",
                  boxShadow: shadowSoft,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px 12px",
                    alignItems: "baseline",
                    marginBottom: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(90, 75, 120, 0.12)",
                      color: textPrimary,
                    }}
                  >
                    {item.type}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(44, 40, 37, 0.08)",
                      color: textPrimary,
                    }}
                  >
                    {item.priority}
                  </span>
                  <span style={{ fontSize: "13px", color: muted, marginLeft: "auto" }}>
                    {formatDate(item.createdAt)}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "17px",
                    fontWeight: 600,
                    lineHeight: 1.35,
                    color: textPrimary,
                  }}
                >
                  {item.title}
                </p>
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: "15px",
                    lineHeight: 1.55,
                    color: textPrimary,
                  }}
                >
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
