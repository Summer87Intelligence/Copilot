import type * as React from "react";

export interface Metric {
  title: string;
  value: string;
}

export interface AlertsPanelProps {
  alerts: string[];
}

export interface RecommendedActionsProps {
  recommendedActions: string[];
}

export interface MetricCardProps {
  title: string;
  value: string;
  style?: React.CSSProperties;
}
