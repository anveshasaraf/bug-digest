import { describe, expect, it } from 'vitest';
import { filterNoise } from './noise';
import { dedupe } from './dedupe';
import type { RawEvent } from '../types';

describe('filterNoise', () => {
  it('filters favicon 404s and sourcemap 404s, keeping real events', () => {
    const events: RawEvent[] = [
      { kind: 'network', method: 'GET', url: '/favicon.ico', status: 404, durationMs: 5, ts: 1 },
      { kind: 'network', method: 'GET', url: '/assets/app.js.map', status: 404, durationMs: 5, ts: 2 },
      { kind: 'network', method: 'GET', url: '/api/orders', status: 500, durationMs: 5, ts: 3 },
    ];
    const { kept, noise } = filterNoise(dedupe(events));
    expect(kept).toHaveLength(1);
    expect(kept[0].event.kind).toBe('network');
    expect(noise.count).toBe(2);
  });

  it('filters browser-extension chatter by message text', () => {
    const events: RawEvent[] = [
      { kind: 'console', level: 'error', message: 'Unchecked runtime.lastError: some extension noise', ts: 1 },
      { kind: 'console', level: 'error', message: 'real app error', ts: 2 },
    ];
    const { kept, noise } = filterNoise(dedupe(events));
    expect(kept).toHaveLength(1);
    expect(kept[0].event.kind === 'console' && kept[0].event.message).toBe('real app error');
    expect(noise.count).toBe(1);
  });

  it('filters exceptions originating from other extensions', () => {
    const events: RawEvent[] = [
      {
        kind: 'exception',
        message: 'boom',
        filename: 'chrome-extension://abcdefghijklmnop/content.js',
        lineno: 1,
        ts: 1,
      },
    ];
    const { kept, noise } = filterNoise(dedupe(events));
    expect(kept).toHaveLength(0);
    expect(noise.count).toBe(1);
  });

  it('never silently drops without counting: noise total reflects occurrences, not distinct groups', () => {
    const events: RawEvent[] = [
      { kind: 'network', method: 'GET', url: '/favicon.ico', status: 404, durationMs: 1, ts: 1 },
      { kind: 'network', method: 'GET', url: '/favicon.ico', status: 404, durationMs: 1, ts: 2 },
      { kind: 'network', method: 'GET', url: '/favicon.ico', status: 404, durationMs: 1, ts: 3 },
    ];
    const { noise } = filterNoise(dedupe(events));
    expect(noise.count).toBe(3);
  });

  it('caps samples at 5 even when more noise groups exist', () => {
    const events: RawEvent[] = Array.from({ length: 8 }, (_, i) => ({
      kind: 'console' as const,
      level: 'error' as const,
      message: `Unchecked runtime.lastError: variant ${i}`,
      ts: i,
    }));
    const { noise } = filterNoise(dedupe(events));
    expect(noise.count).toBe(8);
    expect(noise.samples).toHaveLength(5);
  });
});
