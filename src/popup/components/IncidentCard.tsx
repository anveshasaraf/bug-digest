import { useState } from 'react';
import type { Incident, RawEvent, Severity } from '../../lib/types';
import { relativeTime } from '../../lib/format';
import { rules } from '../../rules/rules';

const SEVERITY_STYLES: Record<Severity, { label: string; dot: string; text: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
  warning: { label: 'Warning', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  info: { label: 'Info', dot: 'bg-neutral-400', text: 'text-neutral-600 dark:text-neutral-400' },
};

function eventSummary(event: RawEvent): string {
  switch (event.kind) {
    case 'console':
      return `console.${event.level}: ${event.message}`;
    case 'exception':
      return `Uncaught exception: ${event.message}`;
    case 'rejection':
      return `Unhandled rejection: ${event.message}`;
    case 'network':
      return `${event.method} ${event.url} → ${event.status ?? 'network error'}`;
  }
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false);
  const rule = incident.ruleId ? rules.find((r) => r.id === incident.ruleId) : undefined;
  const style = SEVERITY_STYLES[incident.severity];
  const title = rule?.titlePlain ?? 'Uncaught error in your code';

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-2.5 flex items-start gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <span className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${style.dot}`} aria-hidden />
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline gap-2">
            <span className={`text-xs font-semibold uppercase ${style.text}`}>{style.label}</span>
            <span className="text-xs text-neutral-500">{relativeTime(incident.lastTs)}</span>
          </span>
          <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{title}</span>
          <span className="block text-xs text-neutral-500">
            {incident.count} occurrence{incident.count === 1 ? '' : 's'}
          </span>
        </span>
        <span className="text-neutral-400 text-xs mt-1">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-2.5 space-y-3 bg-neutral-50 dark:bg-neutral-900 text-xs">
          {rule ? (
            <div>
              <p className="text-neutral-700 dark:text-neutral-300">{rule.explainPlain}</p>
              <p className="mt-1.5 text-neutral-500 font-mono">{rule.explainTechnical}</p>
              {rule.commonFixes.length > 0 && (
                <ul className="mt-1.5 list-disc list-inside text-neutral-600 dark:text-neutral-400">
                  {rule.commonFixes.map((fix) => (
                    <li key={fix}>{fix}</li>
                  ))}
                </ul>
              )}
              {rule.docsUrl && (
                <a
                  href={rule.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block text-blue-600 dark:text-blue-400 underline"
                >
                  Docs ↗
                </a>
              )}
            </div>
          ) : (
            <p className="text-neutral-500 italic">No matching rule: showing raw detail below.</p>
          )}

          <div>
            <p className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Event timeline ({incident.events.length})
            </p>
            <ul className="space-y-1.5">
              {incident.events.map((event, i) => (
                <li key={i} className="border-l-2 border-neutral-300 dark:border-neutral-600 pl-2">
                  <p className="font-mono break-all">{eventSummary(event)}</p>
                  {event.kind === 'exception' && event.filename && (
                    <p className="text-neutral-500">
                      {event.filename}:{event.lineno ?? '?'}:{event.colno ?? '?'}
                    </p>
                  )}
                  {event.kind === 'network' && (
                    <p className="text-neutral-500">{Math.round(event.durationMs)}ms</p>
                  )}
                  {'stack' in event && event.stack && (
                    <pre className="mt-1 whitespace-pre-wrap break-all text-neutral-500 bg-neutral-100 dark:bg-neutral-800 p-1 rounded">
                      {event.stack}
                    </pre>
                  )}
                  <p className="text-neutral-400">{new Date(event.ts).toLocaleTimeString()}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
