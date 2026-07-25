import { describe, expect, it } from 'vitest';
import { buildDigest } from './index';
import type { RawEvent } from '../types';

const PAGE_URL = 'http://localhost:5173/dashboard';
const USER_AGENT = 'test-agent/1.0';

/**
 * A representative event stream covering every pipeline stage at once:
 * dedupe (repeated messages), noise (favicon + extension chatter),
 * correlation (a same-origin failure immediately followed by the
 * console.error it caused), and severity ordering (four incidents that
 * must NOT come out in chronological order). Gaps between incident groups
 * are deliberately > 1500ms; gaps within a group are deliberately <= 1500ms
 *, see correlate.ts for the window this depends on.
 */
const FIXTURE_EVENTS: RawEvent[] = [
  // Incident D (cross-origin failure, warning), listed first to prove
  // output order isn't just input order.
  { kind: 'network', method: 'GET', url: 'https://cdn.example.com/thing.js', status: 404, durationMs: 8, ts: 15000 },

  // Noise: favicon 404s (duplicated) + browser-extension chatter.
  { kind: 'network', method: 'GET', url: '/favicon.ico', status: 404, durationMs: 3, ts: 100 },
  { kind: 'network', method: 'GET', url: '/favicon.ico', status: 404, durationMs: 3, ts: 150 },
  { kind: 'console', level: 'error', message: 'Unchecked runtime.lastError: some noise', ts: 200 },

  // Incident A (isolated console.warn, info), lowest severity.
  { kind: 'console', level: 'warn', message: 'Deprecated API used', ts: 0 },

  // Incident C (uncaught exception, duplicated, critical), highest severity despite firing after B.
  { kind: 'exception', message: "Cannot read properties of undefined (reading 'qty')", ts: 10000 },
  { kind: 'exception', message: "Cannot read properties of undefined (reading 'qty')", ts: 10100 },

  // Incident B: same-origin failed request immediately followed by the console.error it caused.
  { kind: 'network', method: 'GET', url: '/api/orders', status: 500, durationMs: 20, ts: 5000 },
  { kind: 'console', level: 'error', message: 'Failed to load orders', ts: 5200 },
  { kind: 'console', level: 'error', message: 'Failed to load orders', ts: 5300 },
];

describe('buildDigest', () => {
  const digest = buildDigest(FIXTURE_EVENTS, { pageUrl: PAGE_URL, userAgent: USER_AGENT, now: 999 });

  it('sets top-level digest metadata', () => {
    expect(digest.pageUrl).toBe(PAGE_URL);
    expect(digest.userAgent).toBe(USER_AGENT);
    expect(digest.generatedAt).toBe(999);
  });

  it('collapses noise into a count, sampled but never silently dropped', () => {
    expect(digest.noise.count).toBe(3); // 2 favicon + 1 extension chatter
    expect(digest.noise.samples.length).toBe(2); // 2 distinct noise groups
  });

  it('produces exactly 4 incidents', () => {
    expect(digest.incidents).toHaveLength(4);
  });

  it('correlates the failed request with the console.error it caused into one incident', () => {
    const incidentB = digest.incidents.find((i) => i.events.some((e) => e.kind === 'network' && e.url === '/api/orders'));
    expect(incidentB).toBeDefined();
    expect(incidentB!.events).toHaveLength(2); // network + deduped console.error group
    expect(incidentB!.count).toBe(3); // 1 network + 2 identical console.error occurrences
  });

  it('dedupes the repeated exception into one incident with count 2', () => {
    const incidentC = digest.incidents.find((i) => i.events.some((e) => e.kind === 'exception'));
    expect(incidentC).toBeDefined();
    expect(incidentC!.events).toHaveLength(1);
    expect(incidentC!.count).toBe(2);
  });

  it('orders incidents by severity, not chronologically', () => {
    // exception (critical, rank 1) > network+console (critical, rank 2) > cross-origin (warning) > warn (info)
    expect(digest.incidents.map((i) => i.severity)).toEqual(['critical', 'critical', 'warning', 'info']);
    expect(digest.incidents[0].events[0].kind).toBe('exception');
    expect(digest.incidents[1].events.some((e) => e.kind === 'network' && e.url === '/api/orders')).toBe(true);
    expect(digest.incidents[2].events[0].kind).toBe('network');
    expect(digest.incidents[3].events[0].kind).toBe('console');
  });

  it('preserves time-ordering of events within each incident', () => {
    const incidentB = digest.incidents.find((i) => i.count === 3)!;
    expect(incidentB.events[0].kind).toBe('network');
    expect(incidentB.events[1].kind).toBe('console');
    expect(incidentB.firstTs).toBe(5000);
    expect(incidentB.lastTs).toBe(5300);
  });
});
