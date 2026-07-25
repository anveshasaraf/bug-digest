import { describe, expect, it } from 'vitest';
import { dedupe } from './dedupe';
import type { RawEvent } from '../types';

function consoleError(message: string, ts: number): RawEvent {
  return { kind: 'console', level: 'error', message, ts };
}

describe('dedupe', () => {
  it('collapses identical messages anywhere in the stream into one entry with a count', () => {
    const events: RawEvent[] = [
      consoleError('cannot read qty', 100),
      consoleError('unrelated', 150),
      consoleError('cannot read qty', 200),
      consoleError('cannot read qty', 300),
    ];

    const result = dedupe(events);

    expect(result).toHaveLength(2);
    const qty = result.find((d) => d.event.kind === 'console' && d.event.message === 'cannot read qty');
    expect(qty).toMatchObject({ count: 3, firstTs: 100, lastTs: 300 });
  });

  it('keeps distinct events separate and preserves first-occurrence order', () => {
    const events: RawEvent[] = [consoleError('b', 200), consoleError('a', 100)];
    const result = dedupe(events);
    expect(result.map((d) => ('message' in d.event ? d.event.message : null))).toEqual(['b', 'a']);
    expect(result.every((d) => d.count === 1)).toBe(true);
  });

  it('treats console.error and console.warn with the same message as distinct', () => {
    const events: RawEvent[] = [
      { kind: 'console', level: 'error', message: 'x', ts: 1 },
      { kind: 'console', level: 'warn', message: 'x', ts: 2 },
    ];
    expect(dedupe(events)).toHaveLength(2);
  });

  it('keys network events on method+url+status, ignoring duration', () => {
    const events: RawEvent[] = [
      { kind: 'network', method: 'GET', url: '/api/x', status: 500, durationMs: 12, ts: 1 },
      { kind: 'network', method: 'GET', url: '/api/x', status: 500, durationMs: 340, ts: 2 },
    ];
    const result = dedupe(events);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });

  it('keys exceptions on message+filename+lineno, ignoring colno', () => {
    const events: RawEvent[] = [
      { kind: 'exception', message: 'TypeError: x', filename: 'app.js', lineno: 10, colno: 5, ts: 1 },
      { kind: 'exception', message: 'TypeError: x', filename: 'app.js', lineno: 10, colno: 9, ts: 2 },
    ];
    const result = dedupe(events);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });
});
