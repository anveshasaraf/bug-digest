# Chrome Web Store listing: copy-paste reference

Not shipped in the extension zip; just the text/assets for the Developer Dashboard form. Screenshots and the promo tile are in this folder.

## Short description (132 char max)

```
Turns console errors and failed requests into a ranked, plain-English digest, one-click markdown export for AI. 100% local.
```
(124 characters)

## Detailed description

```
bug-digest watches the console and network for the page you're testing and turns the noise into a short, ranked, plain-English list of what's actually broken, entirely on your machine.

The problem with devtools isn't missing information, it's noise. A hundred console lines show up and three of them matter. bug-digest deterministically finds the three, explains them in plain English, collapses the other ninety-seven into an inspectable "ignorable" count, and formats the result for pasting straight into Claude, ChatGPT, or any AI assistant.

WHAT IT DOES
• Watches console.error/warn, uncaught exceptions, unhandled promise rejections, and failed network requests on the page you're viewing
• Deduplicates repeated messages into one entry with a count
• Ranks by severity, uncaught exceptions and same-origin failures first, so the worst problem leads
• Groups related events (e.g. a failed request and the console error it caused) into one incident instead of two unrelated rows
• Matches common problems (server not running, CORS, 401/403, React hydration mismatches, missing keys, and more) against a plain-English rules table with fixes
• One-click "Copy for AI" exports the full technical digest as clean markdown
• A toolbar badge shows the current tab's open-problem count at a glance

WHY IT'S DIFFERENT
Zero LLM calls. Zero network requests of any kind. Zero accounts. Zero analytics. Everything (deduplication, ranking, correlation, rule matching, the markdown export) runs as pure, open-source, unit-tested code in your browser. The only place AI enters the picture is whatever tool you paste the markdown into, which is entirely up to you.

WHO IT'S FOR
Built especially for people who are still learning to read devtools, and for anyone whose debugging loop is "copy the error, ask an AI." It's just as useful for experienced developers who want the full technical detail (stack traces, request info, event timelines) one click away.

OPEN SOURCE
MIT licensed. Source, rules table, and contribution guide: https://github.com/anveshasaraf/bug-digest
```

## Category

Developer Tools

## Single purpose description

```
Collects console errors, uncaught exceptions, and failed network requests from the tab the user is actively viewing, and presents them as a ranked, deduplicated, plain-English summary in the extension popup, with an optional one-click export formatted for pasting into an AI assistant.
```

## Permission justifications

**storage**
```
Stores a short list of origins where the user has turned the extension off, so the per-site enable/disable preference persists across browser restarts. No other data is written to storage.
```

**activeTab**
```
Used alongside the host permission to capture console and network activity only for the tab the user is actively viewing, and to take an optional screenshot when the user clicks the screenshot button in the popup.
```

**scripting**
```
Used to register the two capture scripts (which observe console/fetch/XHR/error activity) programmatically at document_start via chrome.scripting.registerContentScripts instead of declaring them in the manifest; this is required so they run synchronously before the page's own scripts, which the manifest-based content script loader in our build tooling cannot reliably guarantee.
```

**Host permission (`<all_urls>`)**
```
This is a developer tool for debugging web applications under active development, which can be running on any localhost port or any staging/preview domain; these cannot be enumerated in advance, so the capture layer must be able to attach to whatever URL the developer navigates to. The capture layer is dormant until the page it's attached to produces a console error, exception, or failed request; nothing is collected otherwise, and nothing is ever sent off the device (see the Privacy practices section / PRIVACY.md).
```

## Privacy policy URL

```
https://github.com/anveshasaraf/bug-digest/blob/master/PRIVACY.md
```

## "Data usage" disclosure tab (Developer Dashboard → Privacy practices)

The dashboard asks you to declare what user data categories the extension "collects or uses," and to check three certification boxes. Based on what this extension actually does:

- **Data categories to check:**
  - "Website content": console messages, exceptions, and stack traces are text originating from the page.
  - "User activity": Google's own example under this category is "network monitoring," which is exactly what the `network` event kind does (watching fetch/XHR for failures).
  - Everything else (PII, health, financial, authentication info, personal communications, location, web history) should stay unchecked: the `network` event never captures headers/cookies (see `src/lib/types.ts`), and the extension only holds the current tab's page in memory, cleared per tab, never a persisted browsing history.
- **Certifications:** all three should be checked truthfully:
  - Does not sell or transfer user data to third parties outside approved use cases (true, there's no transfer of any kind, nothing leaves the device)
  - Does not use or transfer user data for purposes unrelated to the item's single purpose (true)
  - Does not use or transfer user data to determine creditworthiness or for lending purposes (true)

## Files in this folder

- `screenshots/shot-1-ranked-cards.png`: main hero shot, ranked incident cards
- `screenshots/shot-2-expanded-detail.png`: expanded technical detail view
- `screenshots/shot-3-clean-state.png`: honest empty/clean state
- `screenshots/shot-4-onboarding.png`: onboarding page
- `promo-tile-440x280.png`: small promo tile
- `marquee-1400x560.png`: marquee promo tile (optional, only used if Google features the listing)

All screenshots are real captures (via Playwright against `test/fixture/index.html`), not mockups.
