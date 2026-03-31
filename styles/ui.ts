export const semanticTokens = {
  success: {
    background: "#d9eddc",
    border: "rgba(62, 114, 78, 0.32)",
    text: "#263126",
    badgeBg: "rgba(72, 133, 95, 0.15)",
  },
  warning: {
    background: "#f3e7b9",
    border: "rgba(156, 130, 62, 0.3)",
    text: "rgba(66, 52, 20, 0.95)",
    badgeBg: "rgba(166, 137, 68, 0.16)",
  },
  danger: {
    background: "#faefef",
    border: "rgba(176, 88, 88, 0.26)",
    text: "rgba(44, 40, 37, 0.9)",
    badgeBg: "rgba(176, 88, 88, 0.16)",
  },
  neutral: {
    background: "#f1efeb",
    border: "rgba(44, 40, 37, 0.18)",
    text: "rgba(44, 40, 37, 0.9)",
    badgeBg: "rgba(44, 40, 37, 0.08)",
  },
} as const;

export const buttonPrimary = {
  background: semanticTokens.success.background,
  border: semanticTokens.success.border,
  text: semanticTokens.success.text,
} as const;

export const buttonPrimaryDisabled = {
  background: "#deeadf",
} as const;

export const buttonSecondary = {
  background: semanticTokens.warning.background,
  border: semanticTokens.warning.border,
  text: semanticTokens.warning.text,
} as const;

export const buttonSecondaryDisabled = {
  background: "#efe8cd",
} as const;

export const buttonNeutral = {
  background: semanticTokens.neutral.background,
  border: semanticTokens.neutral.border,
  text: semanticTokens.neutral.text,
} as const;

export const buttonSoftSuccess = {
  background: "#e9f4eb",
  border: "rgba(80, 132, 95, 0.28)",
  text: semanticTokens.success.text,
} as const;

export const insightAlert = {
  panelBg: semanticTokens.danger.background,
  panelBorder: semanticTokens.danger.border,
  typeBadgeBg: semanticTokens.danger.badgeBg,
} as const;

export const insightRecommendation = {
  panelBg: "#fbf6e7",
  panelBorder: "rgba(166, 137, 68, 0.26)",
  typeBadgeBg: semanticTokens.warning.badgeBg,
} as const;

export const insightOpportunity = {
  panelBg: "#edf6ef",
  panelBorder: "rgba(72, 133, 95, 0.24)",
  typeBadgeBg: semanticTokens.success.badgeBg,
} as const;

export const messageSuccess = {
  background: "rgba(90, 130, 105, 0.12)",
  border: "rgba(90, 130, 105, 0.22)",
  text: "rgba(60, 100, 75, 0.95)",
} as const;

export const messageError = {
  background: "rgba(180, 90, 90, 0.1)",
  border: "rgba(180, 90, 90, 0.22)",
  text: "rgba(150, 60, 60, 0.95)",
} as const;

export const messageWarning = {
  background: "#f8f0e4",
  border: "rgba(180, 120, 40, 0.25)",
  text: "rgba(140, 95, 50, 0.95)",
} as const;

export const messageInfo = {
  background: "#f0eef5",
  border: "rgba(100, 90, 130, 0.12)",
  text: "rgba(44, 40, 37, 0.65)",
} as const;
