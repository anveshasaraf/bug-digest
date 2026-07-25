import type { Incident } from '../lib/types';

/**
 * The community-editable rules table. Contributors add entries here without
 * touching pipeline code — see CONTRIBUTING.md (Milestone 5).
 *
 * `match` is a plain predicate rather than a declarative matcher object so a
 * rule can inspect anything on the incident (message text, status, url,
 * event kinds present) without the matcher DSL needing to grow a new field
 * for every rule someone wants to add.
 */
export interface Rule {
  id: string;
  match: (incident: Incident) => boolean;
  severity: 'critical' | 'warning' | 'info';
  titlePlain: string;
  explainPlain: string;
  explainTechnical: string;
  commonFixes: string[];
  docsUrl?: string;
}

/** Seeded with ~30 rules in Milestone 3. Empty for now: matching unmatched incidents is the honest default until then. */
export const rules: Rule[] = [];
