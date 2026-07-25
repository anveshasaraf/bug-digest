import type { Incident, RawEvent } from '../lib/types';

/**
 * The community-editable rules table. Contributors add entries here without
 * touching pipeline code, see CONTRIBUTING.md (Milestone 5).
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

// ---- match helpers ----------------------------------------------------------------
// Rule.match only receives an Incident (not the page's URL/origin, see
// src/lib/pipeline/match.ts), so rules key off message text, event kind, and
// HTTP status rather than same-origin vs. cross-origin. A few rules below
// (csp-violation, mixed-content-blocked) are best-effort: the underlying
// browser event isn't wrapped by capture/main-world.ts yet (CSP violations
// fire a `securitypolicyviolation` DOM event; mixed-content blocks are a
// native, non-console.error DevTools message), so they only fire today if
// the page's own code happens to log a matching message. Extending the
// capture layer to close that gap is a natural follow-up, not in scope here.

function messageOf(event: RawEvent): string | null {
  return 'message' in event ? event.message : null;
}

function anyMessageMatches(incident: Incident, pattern: RegExp): boolean {
  return incident.events.some((e) => {
    const m = messageOf(e);
    return m !== null && pattern.test(m);
  });
}

function anyNetworkStatus(incident: Incident, test: (status: number | null) => boolean): boolean {
  return incident.events.some((e) => e.kind === 'network' && test(e.status));
}

function anyExceptionOrRejectionMatches(incident: Incident, pattern: RegExp): boolean {
  return incident.events.some(
    (e) => (e.kind === 'exception' || e.kind === 'rejection') && pattern.test(e.message),
  );
}

// ---- seed rules ---------------------------------------------------------------------
// Ordered most-specific first: match.ts takes the first match, so a broad
// fallback (e.g. "any TypeError") must sit below every narrower pattern it
// would otherwise shadow (e.g. "cannot read properties of undefined").

export const rules: Rule[] = [
  // -- network / HTTP -------------------------------------------------------------
  {
    id: 'connection-refused',
    match: (i) => anyNetworkStatus(i, (s) => s === null),
    severity: 'critical',
    titlePlain: "Your app couldn't reach a server at all",
    explainPlain:
      "A request never got a response, not even an error page. The single most common cause when you're working locally is that the backend or API server just isn't running yet. It can also mean a browser extension (like an ad blocker) blocked the request, or the site's security policy refused it.",
    explainTechnical:
      'fetch()/XHR rejected before an HTTP response was received (status: null): no distinguishing signal (ERR_CONNECTION_REFUSED, DNS failure, CORS preflight failure, and ad-blocker blocks all surface identically to page JS).',
    commonFixes: [
      'Start your backend/API/dev server if it isn\'t running',
      "Check the request URL and port match what your server is actually listening on",
      'If this is a cross-origin request, check the server sends the right CORS headers (Access-Control-Allow-Origin)',
      'Try disabling ad-blocker/privacy extensions to rule those out',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
  },
  {
    id: 'corb-opaque-response',
    match: (i) => anyNetworkStatus(i, (s) => s === 0),
    severity: 'warning',
    titlePlain: 'A cross-origin request was blocked from being read',
    explainPlain:
      "Your app made a request to another server, but the browser blocked it from reading the response for security reasons. This usually happens when a request is sent in a mode that doesn't expect to read the result, or the response isn't set up to be shared across origins.",
    explainTechnical:
      "fetch() resolved with an opaque response (status 0, type: 'opaque'), typical of a no-cors request, or a response missing Cross-Origin-Resource-Policy when one is required.",
    commonFixes: [
      "Remove `mode: 'no-cors'` if you actually need to read the response",
      'Ensure the server sends appropriate CORS / Cross-Origin-Resource-Policy headers',
      'Confirm you actually need this cross-origin request at all',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORP',
  },
  {
    id: 'http-401-unauthorized',
    match: (i) => anyNetworkStatus(i, (s) => s === 401),
    severity: 'critical',
    titlePlain: "You're not logged in (or your session expired)",
    explainPlain:
      "The server rejected a request because it doesn't recognize you as logged in. This is usually an expired session, a missing/expired auth token, or a request sent before login finished.",
    explainTechnical: 'Request returned HTTP 401 Unauthorized: the request lacks valid authentication credentials.',
    commonFixes: [
      'Log out and back in to refresh your session/token',
      'Check that the auth token/cookie is actually being attached to the request',
      'Check the token hasn\'t expired and your clock/timezone is correct',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401',
  },
  {
    id: 'http-403-forbidden',
    match: (i) => anyNetworkStatus(i, (s) => s === 403),
    severity: 'critical',
    titlePlain: "You're logged in, but not allowed to do this",
    explainPlain:
      "The server understood who you are but refused the request anyway: usually a permissions/role issue, an invalid API key, or a security rule (like CSRF protection) blocking it.",
    explainTechnical:
      'Request returned HTTP 403 Forbidden: authenticated (if applicable) but not authorized for this resource/action.',
    commonFixes: [
      "Check the account/role actually has permission for this action",
      'Verify any API key is valid, unrevoked, and scoped for this endpoint',
      'Check for a CSRF token requirement on the request',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403',
  },
  {
    id: 'http-404-not-found',
    match: (i) => anyNetworkStatus(i, (s) => s === 404),
    severity: 'warning',
    titlePlain: "Your app asked for something that doesn't exist",
    explainPlain:
      "A request went to a URL the server doesn't recognize. For your own API, this is almost always a typo in the route or a route that was renamed/removed. For a third-party service, the integration may have changed.",
    explainTechnical: 'Request returned HTTP 404 Not Found.',
    commonFixes: [
      'Double-check the URL/path for typos',
      "Confirm the route actually exists on the server (and hasn't been renamed)",
      'Check for a missing route parameter (e.g. an undefined id in the URL)',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404',
  },
  {
    id: 'http-500-server-error',
    match: (i) => anyNetworkStatus(i, (s) => s !== null && s >= 500 && s < 600),
    severity: 'critical',
    titlePlain: 'The server crashed while handling a request',
    explainPlain:
      "This isn't a browser problem: the server itself hit an error while trying to respond. The real error and stack trace will be in your server/backend logs, not here.",
    explainTechnical: 'Request returned an HTTP 5xx server error.',
    commonFixes: [
      'Check your backend server logs for the actual exception/stack trace',
      'Reproduce the request directly (e.g. curl/Postman) to isolate it from the frontend',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/500',
  },
  {
    id: 'http-4xx-other-client-error',
    match: (i) => anyNetworkStatus(i, (s) => s !== null && s >= 400 && s < 500),
    severity: 'warning',
    titlePlain: 'A request was rejected as invalid',
    explainPlain:
      'The server understood the request but refused it for a reason other than "not found" or "not authorized": often bad or missing data in the request.',
    explainTechnical: 'Request returned an HTTP 4xx client error not covered by a more specific rule.',
    commonFixes: [
      'Check the request body/params match what the server expects',
      "Check the server's response body for a specific error message",
    ],
  },

  // -- React ------------------------------------------------------------------------
  {
    id: 'react-missing-key',
    match: (i) => anyMessageMatches(i, /each child in a list should have a unique ["']key["']/i),
    severity: 'warning',
    titlePlain: 'A list of items is missing a required ID',
    explainPlain:
      "React renders lists faster and more reliably when it can tell items apart. You rendered a list (probably with .map()) without giving each item a unique `key` prop.",
    explainTechnical: 'React warning: each child in a list needs a unique "key" prop for its reconciliation algorithm.',
    commonFixes: [
      'Add a stable, unique `key` prop to each item (e.g. an id from your data, not the array index if the list can reorder)',
    ],
    docsUrl: 'https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key',
  },
  {
    id: 'react-hydration-mismatch',
    match: (i) =>
      anyMessageMatches(
        i,
        /hydration failed|did not match.*server.*client|text content does not match server-rendered/i,
      ),
    severity: 'critical',
    titlePlain: "The page looked different on the server than it does in your browser",
    explainPlain:
      "Your app renders on the server first, then React takes over in the browser and expects the same output. Something (like a date, random value, or browser-only check) produced different content in each place.",
    explainTechnical: 'React hydration mismatch: server-rendered markup differs from the client\'s first render.',
    commonFixes: [
      'Avoid non-deterministic values (Date.now(), Math.random(), locale-dependent formatting) in the initial render',
      "Guard browser-only code (window, localStorage) so it doesn't run during server rendering",
      'Check for invalid HTML nesting that the browser silently "fixes" differently than the server assumed',
    ],
    docsUrl: 'https://react.dev/reference/react-dom/client/hydrateRoot#handling-different-client-and-server-content',
  },
  {
    id: 'react-invalid-hook-call',
    match: (i) => anyMessageMatches(i, /invalid hook call/i),
    severity: 'critical',
    titlePlain: 'A React hook was used incorrectly',
    explainPlain:
      "A hook like useState or useEffect was called somewhere React doesn't allow: outside a component, inside a condition/loop, or from a second copy of React living in your app.",
    explainTechnical:
      "Invalid hook call: usually caused by mismatched React versions, duplicate React copies in node_modules, or calling a hook outside a function component/custom hook.",
    commonFixes: [
      'Only call hooks at the top level of a function component or another hook',
      'Check for duplicate React installs (npm ls react) and dedupe them',
    ],
    docsUrl: 'https://react.dev/warnings/invalid-hook-call-warning',
  },
  {
    id: 'react-minified-error',
    match: (i) => anyMessageMatches(i, /minified react error #\d+/i),
    severity: 'critical',
    titlePlain: 'React hit an internal error (production build)',
    explainPlain:
      'React strips full error messages out of production builds to save size, replacing them with a code and a link to look it up. This still means something went wrong; you just need to decode which error it was.',
    explainTechnical: 'Minified React error: decode the number via the URL React includes in the message.',
    commonFixes: [
      'Open the URL React prints (reactjs.org/docs/error-decoder.html?invariant=<code>) for the full message',
      'Reproduce with a development build for a readable stack trace',
    ],
  },
  {
    id: 'maximum-update-depth-exceeded',
    match: (i) => anyMessageMatches(i, /maximum update depth exceeded/i),
    severity: 'critical',
    titlePlain: 'Your app got stuck re-rendering itself in a loop',
    explainPlain:
      "Something in your code updates state every time it renders, which triggers another render, forever. Usually a state update inside a component body (instead of an effect/handler) or an effect with a dependency that changes every render.",
    explainTechnical: 'React "Maximum update depth exceeded": setState called synchronously and unconditionally during render/commit.',
    commonFixes: [
      'Move state updates out of the render body into an event handler or useEffect',
      "Check a useEffect's dependency array: a new object/array/function on every render will re-trigger it forever",
    ],
    docsUrl: 'https://react.dev/reference/react/useEffect#removing-unnecessary-object-dependencies',
  },

  // -- bundler / module loading -------------------------------------------------------
  {
    id: 'dynamic-import-chunk-load-error',
    match: (i) =>
      anyMessageMatches(i, /failed to fetch dynamically imported module|chunkloaderror|loading chunk .* failed/i),
    severity: 'warning',
    titlePlain: 'Part of the app failed to load',
    explainPlain:
      'Your app is split into pieces that load on demand, and one piece failed to download. The most common cause during development is a stale page after the dev server rebuilt; in production it can mean the deployed files changed underneath a user\'s open tab.',
    explainTechnical:
      'Dynamic import() of a code-split chunk failed to load (network error or 404 for the chunk file).',
    commonFixes: [
      'Hard-refresh the page (dev server restarts can invalidate old chunk URLs)',
      'In production, prompt users to reload when a new deploy invalidates old chunk hashes',
    ],
  },
  {
    id: 'module-not-found',
    match: (i) => anyMessageMatches(i, /failed to resolve import|cannot find module|module not found/i),
    severity: 'critical',
    titlePlain: "An import points to a module that doesn't exist",
    explainPlain:
      "Your code tries to import something (a file or a package) that the build tool can't find. Usually a typo'd path, a missing dependency install, or a file that was moved/deleted.",
    explainTechnical: "Bundler/module resolver failed to resolve an import specifier.",
    commonFixes: [
      'Check the import path for typos and correct relative depth (./ vs ../)',
      'Run your package installer to make sure the dependency is actually installed',
      "Check the file wasn't renamed or moved",
    ],
  },

  // -- data / storage -----------------------------------------------------------------
  {
    id: 'json-parse-error',
    match: (i) => anyMessageMatches(i, /unexpected token .* in json|is not valid json/i),
    severity: 'warning',
    titlePlain: "Your app expected JSON but got something else",
    explainPlain:
      "Your code tried to parse a server response as JSON, but the response wasn't valid JSON: often an HTML error page (like a 404 or 500 page) returned instead of the data you expected.",
    explainTechnical: 'JSON.parse() threw a SyntaxError: the input was not valid JSON.',
    commonFixes: [
      'Check the actual response body/status in the network request; you may be parsing an error page',
      'Confirm the endpoint URL is correct',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse',
  },
  {
    id: 'localstorage-quota-exceeded',
    match: (i) => anyMessageMatches(i, /quotaexceedederror|exceeded the quota/i),
    severity: 'warning',
    titlePlain: 'Local browser storage is full',
    explainPlain:
      "Your app tried to save data in the browser (localStorage/sessionStorage) but there wasn't room left. Browsers cap this per site, usually a few MB.",
    explainTechnical: 'A storage write threw QuotaExceededError: the storage area\'s per-origin limit was reached.',
    commonFixes: [
      'Store less data, or move large data to IndexedDB (much higher limits)',
      'Clear out old/unused keys before writing new ones',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria',
  },
  {
    id: 'websocket-connection-failed',
    match: (i) => anyMessageMatches(i, /websocket connection.*failed|websocket error|websocket.*closed/i),
    severity: 'warning',
    titlePlain: "A live connection to the server failed",
    explainPlain:
      'Your app uses a WebSocket (a persistent live connection, often for real-time updates or dev-server auto-reload) and it failed to connect or was dropped.',
    explainTechnical: "WebSocket 'error' or unexpected 'close' event, reported via the page's own logging (capture doesn't wrap WebSocket directly yet).",
    commonFixes: [
      "Confirm the server hosting the WebSocket endpoint is running and reachable",
      'Check for a protocol mismatch: ws:// mixed with an https:// page will be blocked',
    ],
  },
  {
    id: 'csp-violation',
    match: (i) => anyMessageMatches(i, /content security policy|refused to (execute|load|connect)/i),
    severity: 'warning',
    titlePlain: "The page's security policy blocked something",
    explainPlain:
      'Your site has a security policy (CSP) that lists what\'s allowed to run or load, and something (a script, a style, a connection) wasn\'t on the list, so the browser refused it.',
    explainTechnical:
      'Content-Security-Policy violation. (Capture doesn\'t yet listen for the securitypolicyviolation event directly. This fires only when the blocked resource\'s failure is also logged another way.)',
    commonFixes: [
      "Add the blocked source/origin to the appropriate CSP directive",
      "Check for inline scripts/styles if your policy disallows 'unsafe-inline'",
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP',
  },
  {
    id: 'mixed-content-blocked',
    match: (i) => anyMessageMatches(i, /mixed content|was loaded over https, but requested an insecure/i),
    severity: 'warning',
    titlePlain: 'An insecure request was blocked on a secure page',
    explainPlain:
      "Your page is loaded over HTTPS, but it tried to load something over plain HTTP. Browsers block that to stop a secure page from silently including insecure content.",
    explainTechnical: "Mixed content: an HTTPS document requested an HTTP sub-resource; the browser blocked (or upgraded) the request.",
    commonFixes: [
      'Change the resource URL to https://',
      'If you don\'t control that URL, find an HTTPS-hosted alternative',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content',
  },
  {
    id: 'env-var-misconfigured',
    match: (i) => anyMessageMatches(i, /process is not defined|import\.meta\.env.*undefined|is not defined.*env/i),
    severity: 'critical',
    titlePlain: 'A required configuration value is missing',
    explainPlain:
      "Your code expects an environment variable or config value that isn't set: often because a .env file is missing, wasn't loaded, or the variable name doesn't match what your build tool expects.",
    explainTechnical: 'Reference to an environment variable resolved to undefined (or the global itself, e.g. process, is undefined in a browser context).',
    commonFixes: [
      'Check the .env file exists and is loaded for this environment',
      "Confirm the variable name/prefix matches your bundler's convention (e.g. VITE_, NEXT_PUBLIC_)",
      'Restart the dev server after changing .env files',
    ],
  },

  // -- generic JS runtime errors (specific patterns first, broad fallbacks last) -----
  {
    id: 'cannot-read-properties-of-undefined',
    match: (i) => anyMessageMatches(i, /cannot read propert(?:y|ies) of undefined/i),
    severity: 'critical',
    titlePlain: "Your code tried to use a value before it existed",
    explainPlain:
      "Some code tried to read a property off a value that turned out to be undefined: often data that hasn't loaded yet, an API response missing a field, or a typo'd variable name.",
    explainTechnical: "TypeError: Cannot read properties of undefined (reading '<prop>').",
    commonFixes: [
      'Check the stack trace/line number for exactly which value is undefined',
      'Add a loading/guard check before using data that comes from an API or async call',
      'Verify the API actually returns the field your code expects',
    ],
  },
  {
    id: 'cannot-read-properties-of-null',
    match: (i) => anyMessageMatches(i, /cannot read propert(?:y|ies) of null/i),
    severity: 'critical',
    titlePlain: 'Your code tried to use a value that was explicitly empty',
    explainPlain:
      "Some code tried to read a property off a value that was null: often a DOM element that doesn't exist yet, or data explicitly cleared/reset before the code ran.",
    explainTechnical: "TypeError: Cannot read properties of null (reading '<prop>').",
    commonFixes: [
      "Check the code runs after the element/data actually exists (e.g. DOM ready, data loaded)",
      "Add a null check before accessing the value",
    ],
  },
  {
    id: 'undefined-is-not-a-function',
    match: (i) => anyMessageMatches(i, /is not a function/i),
    severity: 'critical',
    titlePlain: "Your code tried to call something that isn't a function",
    explainPlain:
      "Some code tried to call a value as if it were a function, but it wasn't one: often a typo'd method name, an import that resolved to the wrong thing, or a library version mismatch.",
    explainTechnical: 'TypeError: <expr> is not a function.',
    commonFixes: [
      'Check the method/function name for typos',
      'Confirm the import actually exports what you expect (default vs. named export)',
      "Check your library/package version; the API may have changed",
    ],
  },
  {
    id: 'undefined-is-not-an-object-safari',
    match: (i) => anyMessageMatches(i, /undefined is not an object/i),
    severity: 'critical',
    titlePlain: 'Your code tried to use a value before it existed',
    explainPlain:
      "Some code tried to use a value that turned out to be undefined: the same underlying problem as \"cannot read properties of undefined\", just Safari/WebKit's wording for it.",
    explainTechnical: "WebKit-style TypeError: undefined is not an object (evaluating '<expr>').",
    commonFixes: [
      'Check the stack trace/line number for exactly which value is undefined',
      'Add a guard check before using data that comes from an API or async call',
    ],
  },
  {
    id: 'range-error-stack-overflow',
    match: (i) => anyMessageMatches(i, /maximum call stack size exceeded/i),
    severity: 'critical',
    titlePlain: 'Your code called itself too many times',
    explainPlain:
      "A function ended up calling itself (directly or through a chain of other calls) over and over with no way to stop, until the browser ran out of room to keep track.",
    explainTechnical: 'RangeError: Maximum call stack size exceeded; uncontrolled recursion.',
    commonFixes: [
      'Check for a recursive function missing its base case/exit condition',
      'Check for two functions/effects that trigger each other in a loop',
    ],
  },
  {
    id: 'syntax-error-in-script',
    // Unanchored: browser-generated exception messages are typically
    // prefixed "Uncaught SyntaxError: ..." (via ErrorEvent.message), not a
    // bare "SyntaxError: ...". Only rejection messages we construct
    // ourselves (main-world.ts) omit that prefix.
    match: (i) => anyMessageMatches(i, /syntaxerror/i),
    severity: 'critical',
    titlePlain: 'A script has invalid JavaScript in it',
    explainPlain:
      "A file couldn't even be parsed as valid JavaScript: a typo like a missing bracket or quote, or code written for a newer JS version than what's running it.",
    explainTechnical: 'SyntaxError thrown while parsing/executing a script.',
    commonFixes: [
      'Check the file/line the error points to for a stray or missing bracket, quote, or comma',
      "Confirm your build target supports the syntax you're using",
    ],
  },
  {
    id: 'failed-to-fetch-generic',
    match: (i) => anyMessageMatches(i, /failed to fetch/i),
    severity: 'critical',
    titlePlain: "Your app couldn't reach a server at all",
    explainPlain:
      "Your own code caught and logged a failed network request. Same underlying issue as a server that isn't running, is unreachable, or refused the request; see the connection-refused explanation for the common causes.",
    explainTechnical: "App code logged a caught 'TypeError: Failed to fetch' (or equivalent) rather than the raw network event reaching capture directly.",
    commonFixes: [
      'Start your backend/API/dev server if it isn\'t running',
      'Check the request URL, port, and any required CORS headers',
    ],
  },
  {
    id: 'unhandled-promise-rejection-generic',
    match: (i) => i.events.some((e) => e.kind === 'rejection'),
    severity: 'critical',
    titlePlain: 'An async operation failed without being handled',
    explainPlain:
      "Something async (a Promise) failed, and nothing in your code was watching for that failure: no .catch(), no try/catch around an await. The error just surfaced in the console instead of being handled.",
    explainTechnical: 'Unhandled promise rejection: no rejection handler was attached before the promise settled.',
    commonFixes: [
      'Wrap the awaited call in try/catch, or add a .catch() to the promise chain',
      'Check the stack trace for which async call is the source',
    ],
    docsUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch',
  },
  {
    id: 'type-error-generic',
    // Unanchored for the same reason as syntax-error-in-script above.
    match: (i) => anyExceptionOrRejectionMatches(i, /typeerror/i),
    severity: 'critical',
    titlePlain: 'Your code hit an unexpected type of value',
    explainPlain:
      "Some code used a value in a way its actual type doesn't support; this is a catch-all for TypeErrors that don't match a more specific, common pattern.",
    explainTechnical: 'Uncaught TypeError not matched by a more specific rule.',
    commonFixes: ['Check the stack trace/line number for exactly which expression failed'],
  },
];
