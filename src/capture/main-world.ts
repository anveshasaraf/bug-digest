/**
 * Runs in the page's MAIN world (see manifest.config.ts), the only place
 * that can see the page's own console/fetch/XHR/error globals directly.
 * Every wrapped API calls straight through to the original and returns/throws
 * exactly what the original would have; this script only ever observes.
 *
 * Isolated-world content scripts can't share objects with this world, so
 * observed events cross the boundary via window.postMessage (validated on
 * the other side by capture/content.ts).
 */
import { redactUrl } from '../lib/redact';
import { MAIN_WORLD_SOURCE, type MainWorldMessage } from '../lib/protocol';
import type { RawEvent } from '../lib/types';

function post(message: MainWorldMessage): void {
  window.postMessage(message, window.location.origin);
}

function postEvent(payload: RawEvent): void {
  post({ source: MAIN_WORLD_SOURCE, type: 'event', payload });
}

post({ source: MAIN_WORLD_SOURCE, type: 'page-init', url: window.location.href, ts: Date.now() });

// ---- console.error / console.warn (pass-through) ----------------------------------

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'undefined') return 'undefined';
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function formatConsoleArgs(args: unknown[]): { message: string; stack?: string } {
  const message = args.map(stringifyArg).join(' ');
  const errorArg = args.find((a): a is Error => a instanceof Error);
  return { message, stack: errorArg?.stack };
}

(['error', 'warn'] as const).forEach((level) => {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    try {
      const { message, stack } = formatConsoleArgs(args);
      postEvent({ kind: 'console', level, message, stack, ts: Date.now() });
    } catch {
      // Never let capture break the page's own logging.
    }
  };
});

// ---- uncaught exceptions -----------------------------------------------------------
// addEventListener (not window.onerror =) so any handler the page already set keeps running.

window.addEventListener('error', (event: ErrorEvent) => {
  try {
    postEvent({
      kind: 'exception',
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      filename: event.filename || undefined,
      lineno: event.lineno || undefined,
      colno: event.colno || undefined,
      ts: Date.now(),
    });
  } catch {
    // ignore
  }
});

// ---- unhandled promise rejections ---------------------------------------------------

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  try {
    const reason = event.reason;
    const message =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : stringifyArg(reason);
    postEvent({
      kind: 'rejection',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      ts: Date.now(),
    });
  } catch {
    // ignore
  }
});

// ---- fetch ---------------------------------------------------------------------------

function methodAndUrlFromFetchArgs(input: RequestInfo | URL, init?: RequestInit): { method: string; url: string } {
  if (input instanceof Request) {
    return { method: init?.method ?? input.method, url: input.url };
  }
  return { method: init?.method ?? 'GET', url: input.toString() };
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const { method, url } = methodAndUrlFromFetchArgs(input, init);
  const start = performance.now();
  try {
    const response = await originalFetch(input, init);
    if (!response.ok) {
      postEvent({
        kind: 'network',
        method,
        url: redactUrl(url),
        status: response.status,
        durationMs: performance.now() - start,
        ts: Date.now(),
      });
    }
    return response;
  } catch (err) {
    postEvent({
      kind: 'network',
      method,
      url: redactUrl(url),
      status: null,
      durationMs: performance.now() - start,
      ts: Date.now(),
    });
    throw err;
  }
};

// ---- XMLHttpRequest --------------------------------------------------------------------

const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string; start: number }>();

const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  ...rest: unknown[]
) {
  xhrMeta.set(this, { method, url: url.toString(), start: 0 });
  // @ts-expect-error -- variadic passthrough to the native overload set
  return originalOpen.call(this, method, url, ...rest);
};

const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
  const meta = xhrMeta.get(this);
  if (meta) meta.start = performance.now();

  this.addEventListener('loadend', () => {
    const m = xhrMeta.get(this);
    if (!m) return;
    const failed = this.status === 0 || this.status >= 400;
    if (failed) {
      postEvent({
        kind: 'network',
        method: m.method,
        url: redactUrl(m.url),
        status: this.status === 0 ? null : this.status,
        durationMs: performance.now() - m.start,
        ts: Date.now(),
      });
    }
  });

  // @ts-expect-error -- variadic passthrough to the native overload set
  return originalSend.call(this, ...args);
};
