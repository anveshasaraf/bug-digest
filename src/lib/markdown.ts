import type { Digest, Incident, RawEvent, Severity } from './types';
import type { Rule } from '../rules/rules';
import { rules as defaultRules } from '../rules/rules';

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'CRITICAL',
  warning: 'WARNING',
  info: 'INFO',
};

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

function eventLine(event: RawEvent): string {
  switch (event.kind) {
    case 'console':
      return `- \`console.${event.level}\` @ ${iso(event.ts)}: ${event.message}`;
    case 'exception': {
      const loc = event.filename ? ` (${event.filename}:${event.lineno ?? '?'}:${event.colno ?? '?'})` : '';
      return `- Uncaught exception @ ${iso(event.ts)}${loc}: ${event.message}`;
    }
    case 'rejection':
      return `- Unhandled promise rejection @ ${iso(event.ts)}: ${event.message}`;
    case 'network':
      return `- \`${event.method} ${event.url}\` → ${event.status ?? 'network error (no response)'} (${Math.round(event.durationMs)}ms) @ ${iso(event.ts)}`;
  }
}

function eventStack(event: RawEvent): string | undefined {
  return event.kind !== 'network' ? event.stack : undefined;
}

function incidentSection(incident: Incident, index: number, rules: Rule[]): string {
  const rule = incident.ruleId ? rules.find((r) => r.id === incident.ruleId) : undefined;
  const title = rule?.titlePlain ?? 'Uncaught error in your code — details below';
  const lines: string[] = [];

  lines.push(
    `### ${index + 1}. [${SEVERITY_LABEL[incident.severity]}] ${title} (${incident.count} occurrence${incident.count === 1 ? '' : 's'}, ${iso(incident.firstTs)} – ${iso(incident.lastTs)})`,
  );
  lines.push('');

  if (rule) {
    lines.push(rule.explainTechnical);
    lines.push('');
    lines.push('**Common fixes:**');
    for (const fix of rule.commonFixes) lines.push(`- ${fix}`);
    if (rule.docsUrl) lines.push(`- Docs: ${rule.docsUrl}`);
    lines.push('');
  }

  lines.push('**Events:**');
  for (const event of incident.events) {
    lines.push(eventLine(event));
    const stack = eventStack(event);
    if (stack) lines.push('  ```\n  ' + stack.split('\n').join('\n  ') + '\n  ```');
  }

  return lines.join('\n');
}

/**
 * Serializes the full technical digest as markdown for pasting into an LLM.
 * Every RawEvent field that exists is represented verbatim somewhere in the
 * output — this is the "copy for AI" button's entire product surface, so
 * nothing gets summarized away.
 */
export function digestToMarkdown(digest: Digest, rules: Rule[] = defaultRules): string {
  const critical = digest.incidents.filter((i) => i.severity === 'critical').length;
  const warning = digest.incidents.filter((i) => i.severity === 'warning').length;
  const info = digest.incidents.filter((i) => i.severity === 'info').length;

  const lines: string[] = [];
  lines.push('# Bug Digest');
  lines.push('');
  lines.push(
    "Here is a structured error digest captured from my web app. It's already deduplicated and ranked by severity. Please diagnose the likely root cause(s) and suggest fixes, starting with the highest-severity incident.",
  );
  lines.push('');
  lines.push(`- Page: ${digest.pageUrl}`);
  lines.push(`- User agent: ${digest.userAgent}`);
  lines.push(`- Generated: ${iso(digest.generatedAt)}`);
  lines.push(`- Incidents: ${digest.incidents.length} (${critical} critical, ${warning} warning, ${info} info)`);
  lines.push(`- Filtered noise (not shown below): ${digest.noise.count} occurrence${digest.noise.count === 1 ? '' : 's'}`);
  lines.push('');

  if (digest.incidents.length === 0) {
    lines.push('No incidents detected.');
  } else {
    lines.push('## Incidents');
    lines.push('');
    digest.incidents.forEach((incident, i) => {
      lines.push(incidentSection(incident, i, rules));
      lines.push('');
    });
  }

  if (digest.noise.samples.length > 0) {
    lines.push(`## Filtered noise samples (${digest.noise.count} total occurrences)`);
    lines.push('');
    for (const sample of digest.noise.samples) lines.push(`- ${sample}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
