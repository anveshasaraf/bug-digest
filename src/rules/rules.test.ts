import { describe, expect, it } from 'vitest';
import { rules } from './rules';
import { matchRules } from '../lib/pipeline/match';
import type { Incident, RawEvent } from '../lib/types';

function incidentFrom(events: RawEvent[]): Incident {
  return { id: 'test', events, count: events.length, severity: 'warning', firstTs: 0, lastTs: 0 };
}

function exc(message: string): RawEvent {
  return { kind: 'exception', message, ts: 0 };
}
function rejection(message: string): RawEvent {
  return { kind: 'rejection', message, ts: 0 };
}
function consoleError(message: string): RawEvent {
  return { kind: 'console', level: 'error', message, ts: 0 };
}
function network(status: number | null): RawEvent {
  return { kind: 'network', method: 'GET', url: '/api/x', status, durationMs: 5, ts: 0 };
}

/**
 * One canonical incident per rule, crafted so it matches ONLY that rule
 * against the real table, this both proves the rule fires on realistic
 * input and, since matchRules takes the first match, proves no earlier
 * rule shadows it.
 */
const CASES: Record<string, RawEvent[]> = {
  'connection-refused': [network(null)],
  'corb-opaque-response': [network(0)],
  'http-401-unauthorized': [network(401)],
  'http-403-forbidden': [network(403)],
  'http-404-not-found': [network(404)],
  'http-500-server-error': [network(500)],
  'http-4xx-other-client-error': [network(422)],
  'react-missing-key': [
    consoleError('Warning: Each child in a list should have a unique "key" prop. Check the render method of `Foo`.'),
  ],
  'react-hydration-mismatch': [
    consoleError("Hydration failed because the server rendered HTML didn't match the client. The tree will be regenerated."),
  ],
  'react-invalid-hook-call': [
    consoleError('Invalid hook call. Hooks can only be called inside of the body of a function component.'),
  ],
  'react-minified-error': [consoleError('Minified React error #418; visit https://react.dev/errors/418 for the full message')],
  'maximum-update-depth-exceeded': [
    exc('Uncaught Error: Maximum update depth exceeded. This can happen when a component calls setState inside useEffect.'),
  ],
  'dynamic-import-chunk-load-error': [
    exc('Uncaught TypeError: Failed to fetch dynamically imported module: http://localhost/chunk-abc.js'),
  ],
  'module-not-found': [exc('Uncaught TypeError: Failed to resolve import "./foo" from "src/index.ts". Does the file exist?')],
  'json-parse-error': [exc('Uncaught SyntaxError: Unexpected token < in JSON at position 0')],
  'localstorage-quota-exceeded': [
    exc("Uncaught DOMException: Failed to execute 'setItem' on 'Storage': Setting the value exceeded the quota."),
  ],
  'websocket-connection-failed': [consoleError("WebSocket connection to 'ws://localhost:3000/' failed: ")],
  'csp-violation': [
    consoleError('Refused to execute inline script because it violates the following Content Security Policy directive: "script-src \'self\'"'),
  ],
  'mixed-content-blocked': [
    consoleError(
      "Mixed Content: The page at 'https://example.com' was loaded over HTTPS, but requested an insecure resource 'http://example.com/img.png'. This request has been blocked.",
    ),
  ],
  'env-var-misconfigured': [exc('Uncaught ReferenceError: process is not defined')],
  'cannot-read-properties-of-undefined': [exc("Uncaught TypeError: Cannot read properties of undefined (reading 'qty')")],
  'cannot-read-properties-of-null': [exc("Uncaught TypeError: Cannot read properties of null (reading 'foo')")],
  'undefined-is-not-a-function': [exc('Uncaught TypeError: someObj.someMethod is not a function')],
  'undefined-is-not-an-object-safari': [exc("undefined is not an object (evaluating 'x.y')")],
  'range-error-stack-overflow': [exc('Uncaught RangeError: Maximum call stack size exceeded')],
  'syntax-error-in-script': [exc('Uncaught SyntaxError: Unexpected end of input')],
  'failed-to-fetch-generic': [consoleError('Failed to fetch: NetworkError when attempting to fetch resource.')],
  'unhandled-promise-rejection-generic': [rejection('Something else went wrong entirely')],
  'type-error-generic': [exc('Uncaught TypeError: assignment to constant variable')],
};

describe('rules table match precision', () => {
  it('covers every rule with a test case', () => {
    expect(Object.keys(CASES).sort()).toEqual(rules.map((r) => r.id).sort());
  });

  for (const rule of rules) {
    it(`"${rule.id}" matches its own canonical incident and no earlier rule shadows it`, () => {
      const events = CASES[rule.id];
      expect(events, `no test case defined for rule "${rule.id}"`).toBeDefined();

      const [result] = matchRules([incidentFrom(events)], rules);
      expect(result.ruleId).toBe(rule.id);
    });
  }
});

describe('rules table docs completeness', () => {
  for (const rule of rules) {
    it(`"${rule.id}" has non-empty plain and technical text, and at least one fix`, () => {
      expect(rule.titlePlain.trim().length).toBeGreaterThan(0);
      expect(rule.explainPlain.trim().length).toBeGreaterThan(0);
      expect(rule.explainTechnical.trim().length).toBeGreaterThan(0);
      expect(rule.commonFixes.length).toBeGreaterThan(0);
      expect(rule.commonFixes.every((f) => f.trim().length > 0)).toBe(true);
    });
  }

  it('has no duplicate rule ids', () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
