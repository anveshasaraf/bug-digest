import { describe, expect, it } from 'vitest';
import { digestToMarkdown } from './markdown';
import type { Digest } from './types';
import type { Rule } from '../rules/rules';

const testRules: Rule[] = [
  {
    id: 'test-rule',
    match: () => false,
    severity: 'critical',
    titlePlain: 'A test problem occurred',
    explainPlain: 'plain explanation',
    explainTechnical: 'technical explanation of the mechanism',
    commonFixes: ['do this', 'or this'],
    docsUrl: 'https://example.com/docs',
  },
];

function baseDigest(overrides: Partial<Digest> = {}): Digest {
  return {
    pageUrl: 'http://localhost:5173/app',
    userAgent: 'Mozilla/5.0 test-agent',
    incidents: [],
    noise: { count: 0, samples: [] },
    generatedAt: 1700000000000,
    ...overrides,
  };
}

describe('digestToMarkdown', () => {
  it('includes page url, user agent, and generation time', () => {
    const md = digestToMarkdown(baseDigest());
    expect(md).toContain('http://localhost:5173/app');
    expect(md).toContain('Mozilla/5.0 test-agent');
    expect(md).toContain(new Date(1700000000000).toISOString());
  });

  it('reports a clean no-incidents state honestly', () => {
    const md = digestToMarkdown(baseDigest());
    expect(md).toContain('No incidents detected.');
  });

  it('round-trips every RawEvent field for a console event', () => {
    const digest = baseDigest({
      incidents: [
        {
          id: 'i1',
          events: [{ kind: 'console', level: 'error', message: 'cannot read qty', stack: 'at foo.js:12', ts: 1000 }],
          count: 3,
          severity: 'warning',
          firstTs: 1000,
          lastTs: 2000,
        },
      ],
    });
    const md = digestToMarkdown(digest);
    expect(md).toContain('cannot read qty');
    expect(md).toContain('at foo.js:12');
    expect(md).toContain('console.error');
    expect(md).toContain('3 occurrences');
    expect(md).toContain(new Date(1000).toISOString());
    expect(md).toContain(new Date(2000).toISOString());
  });

  it('round-trips every RawEvent field for a network event', () => {
    const digest = baseDigest({
      incidents: [
        {
          id: 'i1',
          events: [{ kind: 'network', method: 'POST', url: '/api/orders', status: 500, durationMs: 123.4, ts: 1000 }],
          count: 1,
          severity: 'critical',
          firstTs: 1000,
          lastTs: 1000,
        },
      ],
    });
    const md = digestToMarkdown(digest);
    expect(md).toContain('POST /api/orders');
    expect(md).toContain('500');
    expect(md).toContain('123ms');
  });

  it('represents a network error (status null) honestly, not as a fake status code', () => {
    const digest = baseDigest({
      incidents: [
        {
          id: 'i1',
          events: [{ kind: 'network', method: 'GET', url: '/api/x', status: null, durationMs: 5, ts: 1000 }],
          count: 1,
          severity: 'critical',
          firstTs: 1000,
          lastTs: 1000,
        },
      ],
    });
    const md = digestToMarkdown(digest);
    expect(md).toContain('network error');
  });

  it('round-trips exception filename/lineno/colno', () => {
    const digest = baseDigest({
      incidents: [
        {
          id: 'i1',
          events: [{ kind: 'exception', message: 'boom', filename: 'app.js', lineno: 42, colno: 7, ts: 1000 }],
          count: 1,
          severity: 'critical',
          firstTs: 1000,
          lastTs: 1000,
        },
      ],
    });
    const md = digestToMarkdown(digest);
    expect(md).toContain('boom');
    expect(md).toContain('app.js:42:7');
  });

  it('includes matched rule technical explanation, fixes, and docs link', () => {
    const digest = baseDigest({
      incidents: [
        {
          id: 'i1',
          events: [{ kind: 'console', level: 'error', message: 'x', ts: 1000 }],
          count: 1,
          severity: 'critical',
          ruleId: 'test-rule',
          firstTs: 1000,
          lastTs: 1000,
        },
      ],
    });
    const md = digestToMarkdown(digest, testRules);
    expect(md).toContain('A test problem occurred');
    expect(md).toContain('technical explanation of the mechanism');
    expect(md).toContain('do this');
    expect(md).toContain('or this');
    expect(md).toContain('https://example.com/docs');
  });

  it('gives unmatched incidents an honest generic framing instead of inventing a diagnosis', () => {
    const digest = baseDigest({
      incidents: [
        {
          id: 'i1',
          events: [{ kind: 'console', level: 'error', message: 'x', ts: 1000 }],
          count: 1,
          severity: 'warning',
          firstTs: 1000,
          lastTs: 1000,
        },
      ],
    });
    const md = digestToMarkdown(digest, testRules);
    expect(md).toContain('Uncaught error in your code, details below');
  });

  it('includes noise count and samples without hiding them', () => {
    const digest = baseDigest({ noise: { count: 23, samples: ['GET /favicon.ico', 'Unchecked runtime.lastError'] } });
    const md = digestToMarkdown(digest);
    expect(md).toContain('23');
    expect(md).toContain('GET /favicon.ico');
    expect(md).toContain('Unchecked runtime.lastError');
  });
});
