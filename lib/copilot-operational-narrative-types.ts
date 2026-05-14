export type OperationalNarrativeSeverity = "critical" | "high" | "medium";

export type OperationalNarrativeCategory =
  | "cashflow"
  | "collections"
  | "treasury"
  | "risk"
  | "operations";

export type OperationalNarrativeTimeframe = "today" | "this_week" | "next_days";

export type OperationalNarrative = {
  id: string;
  severity: OperationalNarrativeSeverity;
  category: OperationalNarrativeCategory;
  title: string;
  cause: string;
  impact: string;
  recommendation: string;
  timeframe?: OperationalNarrativeTimeframe;
  relatedActionIds?: string[];
  relatedFeedIds?: string[];
  cta?: {
    label: string;
    href?: string;
  };
  score: number;
};
