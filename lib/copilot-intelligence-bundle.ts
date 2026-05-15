import { buildExecutiveBriefing } from "@/lib/copilot-executive-briefing";
import { buildOperationalIntelligence } from "@/lib/copilot-operational-intelligence";
import { buildCommandCenterQueue } from "@/lib/copilot-command-center-queue";
import type {
  CopilotIntelligenceBundle,
  IntelligenceBundleInput,
} from "@/lib/copilot-intelligence-bundle-types";
import type { CommandCenterFilter } from "@/lib/copilot-command-center-types";

const SLOW_BUNDLE_MS = 1500;

const ALL_FILTERS: CommandCenterFilter[] = [
  "all",
  "critical",
  "blocked",
  "overdue",
  "mine",
  "unassigned",
  "recurring",
];

/**
 * Assembles a full CopilotIntelligenceBundle from pre-built inputs.
 *
 * Assumes: snapshot, workflows, events and governance were all fetched exactly once
 * by the caller (API route). This function only does CPU-bound derivation.
 */
export function buildCopilotIntelligenceBundle(
  input: IntelligenceBundleInput
): CopilotIntelligenceBundle {
  const {
    now,
    snapshot,
    workflows,
    operationalAutomation,
    events,
    governance,
    health,
    currentUser,
    timingMs,
    warnings,
  } = input;

  const sharedBriefingInput = {
    now,
    workflows,
    operationalEvents: events,
    memorySignals: snapshot.memory,
    operationalAutomation,
    governance,
    snapshotHealth: snapshot.health,
  };

  const t0 = Date.now();
  const executiveBriefing = buildExecutiveBriefing(sharedBriefingInput);
  timingMs.briefing = Date.now() - t0;

  const t1 = Date.now();
  const operationalIntelligence = buildOperationalIntelligence(sharedBriefingInput);
  timingMs.intelligence = Date.now() - t1;

  const t2 = Date.now();
  const queue = buildCommandCenterQueue({
    workflows,
    feedItems: snapshot.feed.items,
    memorySignals: snapshot.memory,
    events,
    currentUser,
    automation: operationalAutomation ?? undefined,
  });
  timingMs.commandCenter = Date.now() - t2;

  // Total excluding the pre-built input timings (snapshot, workflows, events)
  // so consumers can see the full picture by summing all keys.
  timingMs.derivations = (timingMs.briefing ?? 0) + (timingMs.intelligence ?? 0) + (timingMs.commandCenter ?? 0);

  const totalMs =
    (timingMs.snapshot ?? 0) +
    (timingMs.actions ?? 0) +
    (timingMs.events ?? 0) +
    (timingMs.workflows ?? 0) +
    timingMs.derivations;
  timingMs.total = totalMs;

  if (totalMs > SLOW_BUNDLE_MS) {
    warnings.push(`Bundle lento: ${totalMs}ms (umbral: ${SLOW_BUNDLE_MS}ms).`);
  }

  return {
    generatedAt: now.toISOString(),
    snapshot,
    workflows,
    operationalAutomation,
    events,
    governance,
    health,
    executiveBriefing,
    operationalIntelligence,
    commandCenter: {
      items: queue.items,
      filters: ALL_FILTERS,
    },
    warnings,
    timingMs,
  };
}
