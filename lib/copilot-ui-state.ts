const STORAGE_PREFIX = "copilot:ui:";

export const COPILOT_UI_STATE_KEYS = {
  rutasMoreOptionsOpen: `${STORAGE_PREFIX}rutas:more-options-open`,
  rutasOperationalFeedCompact: `${STORAGE_PREFIX}rutas:operational-feed-compact`,
  rutasCommandCenterFilter: `${STORAGE_PREFIX}rutas:command-center-filter`,
} as const;

type CopilotUiStateKey = (typeof COPILOT_UI_STATE_KEYS)[keyof typeof COPILOT_UI_STATE_KEYS];

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readCopilotUiBoolean(key: CopilotUiStateKey, fallback: boolean): boolean {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeCopilotUiBoolean(key: CopilotUiStateKey, value: boolean): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readCopilotUiString(key: CopilotUiStateKey, fallback: string): string {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeCopilotUiString(key: CopilotUiStateKey, value: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
