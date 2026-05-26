import type { CollectionActionType } from "@/lib/copilot-collection-types";

export type CollectionFollowupInitialValues = {
  channel?: CollectionActionType;
  outcome?: string;
  note?: string;
};

export type FollowupPrefillInput = {
  lastAction: "copied" | "emailed" | "whatsapped";
  channel: "email" | "whatsapp";
  periodFrom: string; // YYYY-MM-DD
  periodTo: string;   // YYYY-MM-DD
  currency: "UYU" | "USD";
};

function fmtDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function buildAccountStatementFollowupPrefill(
  input: FollowupPrefillInput
): Required<CollectionFollowupInitialValues> {
  const { lastAction, channel, periodFrom, periodTo, currency } = input;
  const period = `${fmtDate(periodFrom)} al ${fmtDate(periodTo)}`;
  const verb = lastAction === "copied" ? "preparó" : "envió";
  const note = `Se ${verb} estado de cuenta del período ${period} en ${currency}.`;
  return { channel, outcome: "contacted", note };
}
