export type StrategicRecommendationPriority = "critical" | "high" | "medium";

export type StrategicRecommendationCategory =
  | "cashflow"
  | "collections"
  | "operations"
  | "risk"
  | "opportunity";

export type StrategicRecommendationTimeframe = "today" | "this_week" | "next_days";

export type StrategicRecommendation = {
  id: string;
  priority: StrategicRecommendationPriority;
  category: StrategicRecommendationCategory;
  title: string;
  rationale: string;
  expectedImpact: string;
  unlocks: string;
  timeframe: StrategicRecommendationTimeframe;
  cta?: {
    label: string;
    href: string;
  };
  relatedActionIds?: string[];
  relatedNarrativeIds?: string[];
  relatedMemoryIds?: string[];
  score: number;
};

export type StrategicRecommendationsResponse = {
  recommendations: StrategicRecommendation[];
  generatedAt: string;
};
