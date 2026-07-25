# Contributing

The most valuable contribution to this project is a new entry in the rules table (`src/rules/rules.ts`). It's a plain data file, you don't need to touch the pipeline, the popup, or the build to add one.

## Adding a rule

A rule is an object matching this shape:

```ts
interface Rule {
  id: string;                      // kebab-case, unique, e.g. "cors-missing-header"
  match: (incident: Incident) => boolean;
  severity: 'critical' | 'warning' | 'info';
  titlePlain: string;              // one line, zero jargon
  explainPlain: string;            // 2-3 sentences: what it means, most common cause
  explainTechnical: string;        // the precise version: header/status/mechanism involved
  commonFixes: string[];           // short, actionable
  docsUrl?: string;                // MDN or equivalent, optional
}
```

`match` receives the full `Incident` (its `events: RawEvent[]`, already deduplicated and correlated) and returns whether this rule applies. It's a plain predicate rather than a declarative matcher object on purpose, you can check anything on the incident (message text, status code, event kinds present) without waiting for a matcher DSL to grow a field for your case.

**Rule order matters.** `matchRules()` takes the *first* rule in the array whose `match` returns true. Put narrow, specific patterns before broad ones, if you're adding a fallback/catch-all, it goes near the bottom of the file.

### Where to look for the exact fields available

`RawEvent` (`src/lib/types.ts`) has four kinds, `console`, `exception`, `rejection`, `network`, each with a different field set (e.g. only `network` has `status`/`url`; only `console`/`exception`/`rejection` have `message`). The helpers at the top of `rules.ts` (`anyMessageMatches`, `anyNetworkStatus`, `anyExceptionOrRejectionMatches`) cover most cases, reuse them rather than writing a new `incident.events.some(...)` from scratch.

### Writing the copy

- `titlePlain`/`explainPlain`: write for someone who has never opened devtools. No jargon, no acronyms without expansion.
- `explainTechnical`: write for someone who has. Name the actual mechanism (the header, the status code, the API).
- `commonFixes`: short imperative bullets, most-likely-fix first.

### Testing your rule

Two test suites in `src/rules/rules.test.ts` run against *every* rule in the table:

1. **Match precision**: add your rule's id and a canonical matching `RawEvent[]` to the `CASES` map. The test runs it through the real table and asserts the result is *your* rule and no other; this catches accidental overlap with an earlier, broader rule automatically.
2. **Docs completeness**, runs unconditionally against every rule; just needs your `titlePlain`/`explainPlain`/`explainTechnical`/`commonFixes` to be non-empty.

Run `npm test` before opening a PR.

## Example PR diff

Adding a rule for a `RangeError` thrown by `Array(n)` with a negative or absurd length:

```diff
--- a/src/rules/rules.ts
+++ b/src/rules/rules.ts
@@ -  {
     id: 'range-error-stack-overflow',
     match: (i) => anyMessageMatches(i, /maximum call stack size exceeded/i),
     ...
   },
+  {
+    id: 'invalid-array-length',
+    match: (i) => anyMessageMatches(i, /invalid array length/i),
+    severity: 'critical',
+    titlePlain: 'Your code tried to create an array with an invalid size',
+    explainPlain:
+      "Something computed a number for an array's length that isn't valid, often a negative number, or a calculation that went wrong and produced something huge or NaN.",
+    explainTechnical: 'RangeError: Invalid array length, new Array(n) or Array(n) called with n not a valid non-negative integer.',
+    commonFixes: [
+      'Check the calculation feeding the array length for a negative result or NaN',
+      'Add a guard/clamp before creating the array',
+    ],
+  },
```

```diff
--- a/src/rules/rules.test.ts
+++ b/src/rules/rules.test.ts
@@ const CASES: Record<string, RawEvent[]> = {
   'range-error-stack-overflow': [exc('Uncaught RangeError: Maximum call stack size exceeded')],
+  'invalid-array-length': [exc('Uncaught RangeError: Invalid array length')],
   'syntax-error-in-script': [exc('Uncaught SyntaxError: Unexpected end of input')],
```

That's the whole PR, no other file needs to change.

## Everything else

Bug reports, capture-layer improvements (e.g. wiring up the `securitypolicyviolation` event so the CSP rule can fire on real browser-generated violations, not just app-logged ones), and UI changes are all welcome too, open an issue first for anything larger than a rule addition so we can talk through the approach.

Before submitting: `npm run lint && npm test && npm run build` should all pass clean.
