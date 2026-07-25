function Mockup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-900 shadow-sm">
        {children}
      </div>
      <p className="text-xs text-neutral-500 text-center max-w-[220px]">{label}</p>
    </div>
  );
}

function ToolbarBadgeMockup() {
  return (
    <div className="flex gap-4">
      <div className="relative w-9 h-9 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-lg">
        🔍
        <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          2
        </span>
      </div>
      <div className="relative w-9 h-9 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-lg">
        🔍
        <span className="absolute -top-1.5 -right-1.5 bg-neutral-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          1
        </span>
      </div>
      <div className="relative w-9 h-9 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-lg">
        🔍
      </div>
    </div>
  );
}

function IncidentCardMockup() {
  return (
    <div className="w-64 border border-neutral-200 dark:border-neutral-700 rounded-md p-2.5">
      <div className="flex items-baseline gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
        <span className="text-xs font-semibold uppercase text-red-700 dark:text-red-400">Critical</span>
        <span className="text-xs text-neutral-500">just now</span>
      </div>
      <p className="text-sm font-medium mt-1">Your app couldn't reach a server at all</p>
      <p className="text-xs text-neutral-500">6 occurrences</p>
    </div>
  );
}

export function App() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 font-sans text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-950 min-h-screen">
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-semibold">Welcome to bug-digest</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400 max-w-lg mx-auto">
          It watches the console and network for the page you're testing, and turns the noise into a short,
          plain-English list of what's actually broken. Entirely on your machine.
        </p>
      </header>

      <section className="space-y-10">
        <div className="grid sm:grid-cols-2 gap-8 items-start">
          <Mockup label="The badge on the toolbar icon is a live count of open problems on the current page: red means something critical, gray means warnings only, and no number means the page is clean.">
            <ToolbarBadgeMockup />
          </Mockup>

          <Mockup label="Each row in the popup is one incident: a plain-English title, how many times it happened, and when. Click a card to expand it.">
            <IncidentCardMockup />
          </Mockup>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3 text-center">Copy for AI, in 3 steps</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-2">
              <div className="mx-auto w-10 h-10 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-semibold">
                1
              </div>
              <p className="text-sm">Click the bug-digest icon in your toolbar while on the page with a problem</p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto w-10 h-10 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-semibold">
                2
              </div>
              <p className="text-sm">Click <span className="font-medium">Copy for AI</span>: this copies the full technical digest as markdown</p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto w-10 h-10 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-semibold">
                3
              </div>
              <p className="text-sm">Paste it into Claude, ChatGPT, or Claude Code and ask it to diagnose the problem</p>
            </div>
          </div>
        </div>
      </section>

      <details className="mt-12 border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          For developers: how this actually works
        </summary>
        <div className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 space-y-2 max-w-xl">
          <p>
            Everything is deterministic: there are no LLM calls, no network requests, and no accounts anywhere in
            this extension. The "AI feature" is just that the markdown export is good input for whatever AI tool you
            already use.
          </p>
          <p>Captured events go through five pure, unit-tested pipeline stages, in order:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>
              <strong>Dedupe</strong>: collapse identical messages into one entry with a count.
            </li>
            <li>
              <strong>Noise filter</strong>: drop known-meaningless entries (favicon 404s, extension chatter), but
              keep them countable, never silently.
            </li>
            <li>
              <strong>Severity ranking</strong>: uncaught exception &gt; same-origin failed request &gt;
              console.error &gt; third-party failed request &gt; console.warn.
            </li>
            <li>
              <strong>Incident correlation</strong>: group events that happen within ~1.5s into one incident.
            </li>
            <li>
              <strong>Rule matching</strong>: match each incident against a community-editable rules table for a
              plain-English title, explanation, and fixes.
            </li>
          </ol>
          <p>
            Want to add a rule for something not covered yet? See{' '}
            <code className="bg-neutral-100 dark:bg-neutral-900 px-1 rounded">CONTRIBUTING.md</code> in the repo; a
            rule is a plain object with a match function, no engine code required.
          </p>
        </div>
      </details>

      <footer className="mt-10 text-center">
        <button
          onClick={() => window.close()}
          className="px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium"
        >
          Got it
        </button>
      </footer>
    </div>
  );
}
