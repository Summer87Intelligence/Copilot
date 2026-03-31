"use client";

import type { MetricCardProps } from "@/types/dashboard";

const textPrimary = "#2c2825";
const textMuted = "#5c5650";

export function MetricCard({ title, value, style }: MetricCardProps) {
  return (
    <div style={style}>
      <p
        style={{
          margin: 0,
          fontSize: "13px",
          fontWeight: 600,
          color: textMuted,
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </p>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: "24px",
          fontWeight: 700,
          color: textPrimary,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </p>
    </div>
  );
}
