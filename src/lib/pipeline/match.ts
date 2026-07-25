import type { Incident } from '../types';
import type { Rule } from '../../rules/rules';

/**
 * Matches each incident against the rules table, first rule wins (table
 * order is the tie-break, so more specific rules belong earlier — see
 * CONTRIBUTING.md). A matched rule's severity overrides the heuristic one
 * from severity.ts: the rule encodes domain knowledge (e.g. a CORS failure
 * is critical regardless of whether it happened to surface as a plain
 * console.error), which should win over the generic event-kind heuristic.
 * Unmatched incidents keep their heuristic severity and get no ruleId —
 * the popup falls back to an honest generic framing for those.
 */
export function matchRules(incidents: Incident[], rules: Rule[]): Incident[] {
  return incidents.map((incident) => {
    const rule = rules.find((r) => r.match(incident));
    if (!rule) return incident;
    return { ...incident, ruleId: rule.id, severity: rule.severity };
  });
}
