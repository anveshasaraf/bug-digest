import type { RawEvent } from '../types';
import type { DedupedEvent } from './dedupe';

/**
 * Known-meaningless entries, matched against the underlying RawEvent so the
 * table stays extendable without touching the filtering logic. Each pattern
 * only tests fields our capture layer actually produces (see main-world.ts)
 *, e.g. we never get the browser's own "net::ERR_BLOCKED_BY_CLIENT" string
 * for fetch/XHR failures (both surface as a generic TypeError), so that
 * pattern matches on message text for the cases where it does show up
 * (a caught error re-logged verbatim) rather than pretending we can detect
 * every ad-blocker block.
 */
interface NoisePattern {
  id: string;
  test: (event: RawEvent) => boolean;
}

const NOISE_PATTERNS: NoisePattern[] = [
  {
    id: 'favicon-404',
    test: (e) => e.kind === 'network' && /\/favicon\.ico(\?|$)/.test(e.url),
  },
  {
    id: 'sourcemap-404',
    test: (e) => e.kind === 'network' && /\.map(\?|$)/.test(e.url),
  },
  {
    id: 'ad-blocker-blocked',
    test: (e) => 'message' in e && e.message.includes('ERR_BLOCKED_BY_CLIENT'),
  },
  {
    id: 'browser-extension-chatter',
    test: (e) =>
      ('message' in e && /Unchecked runtime\.lastError|message channel closed/i.test(e.message)) ||
      (e.kind === 'exception' && (e.filename?.startsWith('chrome-extension://') ?? false)),
  },
];

function isNoise(event: RawEvent): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(event));
}

export interface NoiseFilterResult {
  kept: DedupedEvent[];
  noise: { count: number; samples: string[] };
}

function sampleText(event: RawEvent): string {
  return event.kind === 'network' ? `${event.method} ${event.url}` : event.message;
}

/** Filtered items are counted and sampled, never dropped without a trace. */
export function filterNoise(deduped: DedupedEvent[]): NoiseFilterResult {
  const kept: DedupedEvent[] = [];
  const samples: string[] = [];
  let count = 0;

  for (const d of deduped) {
    if (isNoise(d.event)) {
      count += d.count;
      if (samples.length < 5) samples.push(sampleText(d.event));
    } else {
      kept.push(d);
    }
  }

  return { kept, noise: { count, samples } };
}
