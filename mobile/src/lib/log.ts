import { IS_DEV } from "./config";

export type TimelineEvent =
  | "session.start"
  | "session.connected"
  | "session.disconnected"
  | "user.turn"
  | "agent.response"
  | "tool.direct_visual"
  | "fal.request.start"
  | "fal.request.result"
  | "fal.request.stale"
  | "fal.request.error"
  | "preload.complete"
  | "video.visible"
  | "visual.clear";

export interface TimelineEntry {
  at: number;
  event: TimelineEvent;
  epoch?: number;
  detail?: string;
  /** ms since the direct_visual call that owns this epoch. */
  sinceToolCallMs?: number;
}

const MAX_ENTRIES = 120;
const entries: TimelineEntry[] = [];
const listeners = new Set<(all: readonly TimelineEntry[]) => void>();

/** When each epoch's tool call fired, so every later event can report perceived latency. */
const epochStartedAt = new Map<number, number>();

export function markEpochStart(epoch: number): void {
  epochStartedAt.set(epoch, Date.now());
  // The map only ever needs the recent tail.
  if (epochStartedAt.size > 32) {
    const oldest = Math.min(...epochStartedAt.keys());
    epochStartedAt.delete(oldest);
  }
}

export function timeline(event: TimelineEvent, epoch?: number, detail?: string): void {
  const at = Date.now();
  const startedAt = epoch !== undefined ? epochStartedAt.get(epoch) : undefined;
  const entry: TimelineEntry = {
    at,
    event,
    ...(epoch !== undefined ? { epoch } : {}),
    ...(detail !== undefined ? { detail } : {}),
    ...(startedAt !== undefined ? { sinceToolCallMs: at - startedAt } : {}),
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  if (IS_DEV) {
    const since = entry.sinceToolCallMs !== undefined ? ` +${entry.sinceToolCallMs}ms` : "";
    const ep = epoch !== undefined ? ` [e${epoch}]` : "";
    console.log(`[sunshine]${ep} ${event}${since}${detail ? ` — ${detail}` : ""}`);
  }

  for (const listener of listeners) listener(entries);
}

export function subscribeTimeline(listener: (all: readonly TimelineEntry[]) => void): () => void {
  listeners.add(listener);
  listener(entries);
  return () => listeners.delete(listener);
}

export function getTimeline(): readonly TimelineEntry[] {
  return entries;
}
