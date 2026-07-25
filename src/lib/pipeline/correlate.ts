import type { Incident } from '../types';
import type { DedupedEvent } from './dedupe';
import { severityForRank, worstRank } from './severity';

/** Deduped events this close together plausibly chain (e.g. a failed request followed by the console.error it caused). */
const CORRELATION_WINDOW_MS = 1500;

/**
 * Groups deduped events into incidents by chronological proximity: sort by
 * first occurrence, then start a new incident whenever the gap since the
 * previous event's last occurrence exceeds the correlation window. Chaining
 * is transitive — if A and B are within the window, and B and C are too,
 * all three land in one incident even if A and C alone would not have
 * qualified. This is a deliberately simple heuristic (time proximity only,
 * not kind-pair matching) traded for determinism and testability; the
 * common real-world case it targets is a failed request immediately
 * followed by the console.error it triggered.
 */
export function correlate(deduped: DedupedEvent[], pageUrl: string): Incident[] {
  const sorted = [...deduped].sort((a, b) => a.firstTs - b.firstTs);

  const clusters: DedupedEvent[][] = [];
  for (const d of sorted) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    if (current && previous && d.firstTs - previous.lastTs <= CORRELATION_WINDOW_MS) {
      current.push(d);
    } else {
      clusters.push([d]);
    }
  }

  return clusters.map((cluster) => toIncident(cluster, pageUrl));
}

function toIncident(cluster: DedupedEvent[], pageUrl: string): Incident {
  const events = cluster.map((d) => d.event);

  return {
    id: `incident-${cluster[0].firstTs}-${cluster[0].event.kind}`,
    events,
    count: cluster.reduce((sum, d) => sum + d.count, 0),
    severity: severityForRank(worstRank(events, pageUrl)),
    firstTs: Math.min(...cluster.map((d) => d.firstTs)),
    lastTs: Math.max(...cluster.map((d) => d.lastTs)),
  };
}
