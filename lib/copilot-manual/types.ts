export type CopilotManualBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "callout"; variant: "tip" | "warning" | "info"; text: string }
  | { type: "subsection"; title: string; blocks: CopilotManualBlock[] }
  | { type: "glossary"; entries: Array<{ term: string; definition: string }> }
  | {
      type: "roles";
      entries: Array<{ role: string; label: string; description: string }>;
    }
  | {
      type: "status";
      entries: Array<{
        level: "ok" | "warning" | "critical";
        title: string;
        description: string;
      }>;
    };

export type CopilotManualSection = {
  id: string;
  title: string;
  tocTitle?: string;
  includeInToc: boolean;
  blocks: CopilotManualBlock[];
};
