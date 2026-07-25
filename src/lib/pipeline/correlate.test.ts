import { describe, expect, it } from 'vitest';
import { correlate } from './correlate';
import { dedupe } from './dedupe';
import type { RawEvent } from '../types';

const PAGE_URL = 'http://localhost:5173/';

describe('correlate', () => {
  it('merges a failed request and a subsequent console.error within the window into one incident', () => {
    const events: RawEvent[] = [
      { kind: 'network', method: 'GET', url: '/api/orders', status: 500, durationMs: 20, ts: 1000 },
      { kind: 'console', level: 'error', message: 'Failed to load orders', ts: 1200 },
    ];
    const incidents = correlate(dedupe(events), PAGE_URL);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].events).toHaveLength(2);
    expect(incidents[0].count).toBe(2);
    expect(incidents[0].severity).toBe('critical'); // same-origin network failure outranks console.error
  });

  it('keeps events further apart than the correlation window as separate incidents', () => {
    const events: RawEvent[] = [
      { kind: 'console', level: 'warn', message: 'early warning', ts: 0 },
      { kind: 'exception', message: 'late boom', ts: 5000 },
    ];
    const incidents = correlate(dedupe(events), PAGE_URL);
    expect(incidents).toHaveLength(2);
  });

  it('chains transitively across a run of closely-spaced events', () => {
    const events: RawEvent[] = [
      { kind: 'console', level: 'warn', message: 'a', ts: 0 },
      { kind: 'console', level: 'warn', message: 'b', ts: 1400 },
      { kind: 'console', level: 'warn', message: 'c', ts: 2800 },
    ];
    // a->b gap 1400 (within window), b->c gap 1400 (within window), but a->c gap is 2800 (outside window alone)
    const incidents = correlate(dedupe(events), PAGE_URL);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].events).toHaveLength(3);
  });

  it('produces incidents ordered by time and preserves time-ordering of events within an incident', () => {
    const events: RawEvent[] = [
      { kind: 'console', level: 'warn', message: 'b', ts: 200 },
      { kind: 'console', level: 'error', message: 'a', ts: 100 },
    ];
    const incidents = correlate(dedupe(events), PAGE_URL);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].events.map((e) => 'message' in e && e.message)).toEqual(['a', 'b']);
  });

  it('sets incident severity to the worst (most severe) among its member events', () => {
    const events: RawEvent[] = [
      { kind: 'console', level: 'warn', message: 'noise-ish', ts: 0 },
      { kind: 'exception', message: 'real problem', ts: 500 },
    ];
    const incidents = correlate(dedupe(events), PAGE_URL);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].severity).toBe('critical');
  });
});
