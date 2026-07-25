import { describe, expect, it } from 'vitest';
import { matchRules } from './match';
import type { Rule } from '../../rules/rules';
import type { Incident } from '../types';

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'i1',
    events: [{ kind: 'console', level: 'error', message: 'CORS blocked', ts: 1 }],
    count: 1,
    severity: 'warning',
    firstTs: 1,
    lastTs: 1,
    ...overrides,
  };
}

const corsRule: Rule = {
  id: 'cors-missing-header',
  match: (inc) => inc.events.some((e) => 'message' in e && e.message.includes('CORS')),
  severity: 'critical',
  titlePlain: 'Blocked from talking to another server',
  explainPlain: 'plain',
  explainTechnical: 'technical',
  commonFixes: ['fix it'],
};

const neverMatches: Rule = {
  id: 'never',
  match: () => false,
  severity: 'info',
  titlePlain: '',
  explainPlain: '',
  explainTechnical: '',
  commonFixes: [],
};

describe('matchRules', () => {
  it('sets ruleId and overrides severity when a rule matches', () => {
    const [result] = matchRules([incident()], [corsRule]);
    expect(result.ruleId).toBe('cors-missing-header');
    expect(result.severity).toBe('critical');
  });

  it('leaves unmatched incidents with no ruleId and unchanged heuristic severity', () => {
    const [result] = matchRules([incident({ severity: 'warning' })], [neverMatches]);
    expect(result.ruleId).toBeUndefined();
    expect(result.severity).toBe('warning');
  });

  it('picks the first matching rule when multiple would match', () => {
    const secondCorsRule: Rule = { ...corsRule, id: 'cors-fallback' };
    const [result] = matchRules([incident()], [corsRule, secondCorsRule]);
    expect(result.ruleId).toBe('cors-missing-header');
  });

  it('does not mutate the input incident', () => {
    const input = incident();
    matchRules([input], [corsRule]);
    expect(input.ruleId).toBeUndefined();
  });
});
