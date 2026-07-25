import { describe, expect, it } from 'vitest';
import { rankForEvent, severityForEvent } from './severity';
import type { RawEvent } from '../types';

const PAGE_URL = 'http://localhost:5173/dashboard';

describe('rankForEvent', () => {
  it('ranks exceptions and rejections as 1 (highest)', () => {
    const exception: RawEvent = { kind: 'exception', message: 'boom', ts: 1 };
    const rejection: RawEvent = { kind: 'rejection', message: 'boom', ts: 1 };
    expect(rankForEvent(exception, PAGE_URL)).toBe(1);
    expect(rankForEvent(rejection, PAGE_URL)).toBe(1);
  });

  it('ranks a same-origin failed request as 2, resolving relative URLs against the page', () => {
    const event: RawEvent = { kind: 'network', method: 'GET', url: '/api/orders', status: 500, durationMs: 5, ts: 1 };
    expect(rankForEvent(event, PAGE_URL)).toBe(2);
  });

  it('ranks a same-origin failed request as 2 when the URL is already absolute', () => {
    const event: RawEvent = {
      kind: 'network',
      method: 'GET',
      url: 'http://localhost:5173/api/orders',
      status: 500,
      durationMs: 5,
      ts: 1,
    };
    expect(rankForEvent(event, PAGE_URL)).toBe(2);
  });

  it('ranks console.error as 3', () => {
    const event: RawEvent = { kind: 'console', level: 'error', message: 'x', ts: 1 };
    expect(rankForEvent(event, PAGE_URL)).toBe(3);
  });

  it('ranks a cross-origin failed request as 4', () => {
    const event: RawEvent = {
      kind: 'network',
      method: 'GET',
      url: 'https://cdn.example.com/thing.js',
      status: 404,
      durationMs: 5,
      ts: 1,
    };
    expect(rankForEvent(event, PAGE_URL)).toBe(4);
  });

  it('ranks console.warn as 5 (lowest)', () => {
    const event: RawEvent = { kind: 'console', level: 'warn', message: 'x', ts: 1 };
    expect(rankForEvent(event, PAGE_URL)).toBe(5);
  });
});

describe('severityForEvent', () => {
  it('maps ranks 1-2 to critical, 3-4 to warning, 5 to info', () => {
    expect(severityForEvent({ kind: 'exception', message: 'x', ts: 1 }, PAGE_URL)).toBe('critical');
    expect(
      severityForEvent(
        { kind: 'network', method: 'GET', url: '/api/x', status: 500, durationMs: 1, ts: 1 },
        PAGE_URL,
      ),
    ).toBe('critical');
    expect(severityForEvent({ kind: 'console', level: 'error', message: 'x', ts: 1 }, PAGE_URL)).toBe('warning');
    expect(severityForEvent({ kind: 'console', level: 'warn', message: 'x', ts: 1 }, PAGE_URL)).toBe('info');
  });
});
