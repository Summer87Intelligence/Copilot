"use client";

const textPrimary = "#2c2825";
const textMuted = "#5c5650";

export function DashboardHeader() {
  return (
    <header
      style={{
        marginBottom: "40px",
        paddingBottom: "28px",
        borderBottom: "1px solid rgba(44, 40, 37, 0.08)",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(26px, 4vw, 32px)",
          fontWeight: 700,
          lineHeight: 1.2,
          color: textPrimary,
          letterSpacing: "-0.02em",
        }}
      >
        Summer87 Copilot
      </h1>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: "16px",
          color: textMuted,
          fontWeight: 500,
        }}
      >
        Panel ejecutivo
      </p>
    </header>
  );
}
