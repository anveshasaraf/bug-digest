import type { Digest, RawEvent, Severity } from '../types';
import type { Rule } from '../../rules/rules';
import { rules as defaultRules } from '../../rules/rules';
import { dedupe } from './dedupe';
import { filterNoise } from './noise';
import { correlate } from './correlate';
import { matchRules } from './match';
import { worstRank } from './severity';

export interface BuildDigestOptions {
  pageUrl: string;
  userAgent: string;
  rules?: Rule[];
  /** Injectable for deterministic tests; defaults to Date.now(). */
  now?: number;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Composes the five pipeline stages (dedupe -> noise filter -> correlate,
 * which applies severity ranking per-event -> rule matching) into the final
 * ranked Digest. Final ordering: severity first, then the finer-grained
 * event-kind rank as a tie-break within a severity (e.g. an uncaught
 * exception ranks above a same-origin network failure even though both are
 * "critical"), then chronological order for full determinism.
 */
export function buildDigest(events: RawEvent[], options: BuildDigestOptions): Digest {
  const { pageUrl, userAgent, rules = defaultRules, now = Date.now() } = options;

  const deduped = dedupe(events);
  const { kept, noise } = filterNoise(deduped);
  const correlated = correlate(kept, pageUrl);
  const matched = matchRules(correlated, rules);

  const incidents = [...matched].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    const rankDiff = worstRank(a.events, pageUrl) - worstRank(b.events, pageUrl);
    if (rankDiff !== 0) return rankDiff;
    return a.firstTs - b.firstTs;
  });

  return { pageUrl, userAgent, incidents, noise, generatedAt: now };
}
