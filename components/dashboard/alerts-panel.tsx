"use client";

import type { CSSProperties } from "react";

import type { AlertsPanelProps } from "@/types/dashboard";

const textPrimary = "#2c2825";
const shadowSoft = "0 4px 20px rgba(44, 40, 37, 0.06)";

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 18px",
  fontSize: "16px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: textPrimary,
};

const sectionPanelStyle = (
  bg: string,
  borderColor: string
): CSSProperties => ({
  backgroundColor: bg,
  border: `1px solid ${borderColor}`,
  borderRadius: "16px",
  padding: "22px 24px",
  boxShadow: shadowSoft,
});

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <section style={{ marginBottom: "40px" }}>
      <h2 style={sectionTitleStyle}>🚨 Alertas</h2>
      <ul
        style={{
          ...sectionPanelStyle("#faeee8", "rgba(180, 120, 100, 0.15)"),
          margin: 0,
          padding: "22px 24px 22px 40px",
          listStyle: "disc",
        }}
      >
        {alerts.map((text) => (
          <li
            key={text}
            style={{
              marginBottom: "12px",
              fontSize: "15px",
              lineHeight: 1.55,
              color: textPrimary,
            }}
          >
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
