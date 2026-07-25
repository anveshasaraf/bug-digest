import type { RawEvent } from '../types';

/**
 * One distinct message plus how many times it occurred. `event` is the first
 * occurrence (its stack/filename/etc. represent the group); `count` is the
 * total number of raw events collapsed into it, in original stream order.
 */
export interface DedupedEvent {
  event: RawEvent;
  count: number;
  firstTs: number;
  lastTs: number;
}

/**
 * Identity key for collapsing duplicates. Two events are "the same message"
 * if this key matches, duration and (for exceptions) column number are
 * deliberately excluded since they vary run-to-run for what a human would
 * call the same error.
 */
function keyOf(event: RawEvent): string {
  switch (event.kind) {
    case 'console':
      return `console:${event.level}:${event.message}`;
    case 'exception':
      return `exception:${event.message}:${event.filename ?? ''}:${event.lineno ?? ''}`;
    case 'rejection':
      return `rejection:${event.message}`;
    case 'network':
      return `network:${event.method}:${event.url}:${event.status}`;
  }
}

/**
 * Collapses identical messages anywhere in the stream (not just consecutive
 * ones) into a single entry with an occurrence count, preserving each
 * group's first-occurrence position so downstream stages still see the
 * stream in chronological order.
 */
export function dedupe(events: RawEvent[]): DedupedEvent[] {
  const byKey = new Map<string, DedupedEvent>();

  for (const event of events) {
    const key = keyOf(event);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastTs = Math.max(existing.lastTs, event.ts);
    } else {
      byKey.set(key, { event, count: 1, firstTs: event.ts, lastTs: event.ts });
    }
  }

  return [...byKey.values()];
}
