/**
 * Pure helpers for Daily Operations Queue panel (testable without DOM).
 */

import type {
  DailyOperationsQueue,
  OperationalTask,
  QueueSection,
} from "@/lib/decision-engine/de-types";
import { QUEUE_SECTION_LABELS } from "@/lib/decision-engine/de-types";

export const QUEUE_SECTION_ORDER: QueueSection[] = [
  "urgent_today",
  "high_impact",
  "this_week",
  "monitoring",
  "automated",
];

export const MAX_TASKS_PER_SECTION = 5;

export function getSectionTasks(
  queue: DailyOperationsQueue,
  section: QueueSection
): OperationalTask[] {
  return queue.sections[section] ?? [];
}

export function sliceVisibleTasks(
  tasks: OperationalTask[],
  expanded: boolean,
  limit = MAX_TASKS_PER_SECTION
): { visible: OperationalTask[]; hiddenCount: number } {
  if (expanded || tasks.length <= limit) {
    return { visible: tasks, hiddenCount: 0 };
  }
  return { visible: tasks.slice(0, limit), hiddenCount: tasks.length - limit };
}

export function isQueueEmpty(queue: DailyOperationsQueue | null | undefined): boolean {
  if (!queue) return true;
  return queue.stats.total_tasks === 0;
}

export function isCacheStale(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const exp = new Date(expiresAt);
  if (isNaN(exp.getTime())) return false;
  const remainingMs = exp.getTime() - now.getTime();
  return remainingMs > 0 && remainingMs < 15 * 60 * 1000;
}

export function operationalConfidenceScore(task: OperationalTask): number {
  return Math.max(0, Math.min(100, Math.round(task.priority_score)));
}

export function sectionLabel(section: QueueSection): string {
  return QUEUE_SECTION_LABELS[section];
}

export function allSectionsWithTasks(queue: DailyOperationsQueue): QueueSection[] {
  return QUEUE_SECTION_ORDER.filter((s) => getSectionTasks(queue, s).length > 0);
}

/** Legacy follow_up_queue UI — solo si la cola Phase 2B no está activa. */
export function shouldShowLegacyFollowUpQueue(args: {
  queueLoading: boolean;
  queueError: string | null;
  queue: DailyOperationsQueue | null;
}): boolean {
  if (args.queueLoading) return false;
  const dailyQueueActive =
    args.queueError == null && args.queue != null && !isQueueEmpty(args.queue);
  return !dailyQueueActive;
}
