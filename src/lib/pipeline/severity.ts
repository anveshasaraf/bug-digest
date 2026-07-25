import type { RawEvent, Severity } from '../types';

/**
 * Priority order, most to least severe (per spec):
 *   1. uncaught exception / unhandled rejection
 *   2. failed request on the app's own origin
 *   3. console.error
 *   4. failed request on a third-party origin
 *   5. console.warn
 *
 * Unhandled rejections are grouped with uncaught exceptions: both are
 * uncaught runtime errors, just delivered through a different browser
 * mechanism — treating them differently would be an arbitrary distinction.
 */
export type Rank = 1 | 2 | 3 | 4 | 5;

/**
 * Resolves against pageUrl as the base, since main-world.ts records fetch/XHR
 * URLs exactly as the page called them — a same-origin call like
 * fetch('/api/orders') is captured as the literal relative string, not an
 * absolute URL.
 */
function originOf(url: string, base: string): string | null {
  try {
    return new URL(url, base).origin;
  } catch {
    return null;
  }
}

export function rankForEvent(event: RawEvent, pageUrl: string): Rank {
  switch (event.kind) {
    case 'exception':
    case 'rejection':
      return 1;
    case 'network': {
      const pageOrigin = originOf(pageUrl, pageUrl);
      const eventOrigin = originOf(event.url, pageUrl);
      const sameOrigin = pageOrigin !== null && eventOrigin !== null && pageOrigin === eventOrigin;
      return sameOrigin ? 2 : 4;
    }
    case 'console':
      return event.level === 'error' ? 3 : 5;
  }
}

const RANK_TO_SEVERITY: Record<Rank, Severity> = {
  1: 'critical',
  2: 'critical',
  3: 'warning',
  4: 'warning',
  5: 'info',
};

export function severityForRank(rank: Rank): Severity {
  return RANK_TO_SEVERITY[rank];
}

export function severityForEvent(event: RawEvent, pageUrl: string): Severity {
  return severityForRank(rankForEvent(event, pageUrl));
}

/** The worst (numerically lowest / most severe) rank among a set of events, e.g. an incident's member events. */
export function worstRank(events: RawEvent[], pageUrl: string): Rank {
  return events.reduce<Rank>((worst, e) => {
    const r = rankForEvent(e, pageUrl);
    return r < worst ? r : worst;
  }, 5);
}
