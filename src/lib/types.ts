/** Shared data model for the capture -> pipeline -> UI flow. */

export type RawEvent =
  | { kind: 'console'; level: 'error' | 'warn'; message: string; stack?: string; ts: number }
  | { kind: 'exception'; message: string; stack?: string; filename?: string; lineno?: number; colno?: number; ts: number }
  | { kind: 'rejection'; message: string; stack?: string; ts: number }
  | { kind: 'network'; method: string; url: string; status: number | null; durationMs: number; ts: number };

export type Severity = 'critical' | 'warning' | 'info';

export interface Incident {
  id: string;
  events: RawEvent[];
  count: number;
  severity: Severity;
  ruleId?: string;
  firstTs: number;
  lastTs: number;
}

export interface Digest {
  pageUrl: string;
  userAgent: string;
  incidents: Incident[];
  noise: { count: number; samples: string[] };
  generatedAt: number;
}
