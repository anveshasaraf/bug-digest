# Privacy Policy

**bug-digest sends nothing anywhere. This is a design constraint, not a promise about current behavior that could quietly change: there is no server for it to talk to, no analytics SDK in the codebase, and no account system.**

## What the extension can see

To do its job, bug-digest needs to observe:

- Console `error`/`warn` calls, uncaught exceptions, and unhandled promise rejections on the page you're viewing
- The method, URL, HTTP status, and duration of **failed** network requests (status ≥ 400 or a network-level error) on that page

It never captures request or response **bodies**, and it never captures request/response **headers**, the network event only ever records method, URL, status, and duration (see `src/lib/types.ts`).

## Where that data goes

Nowhere but your own browser. Specifically:

- It's held in memory, per browser tab, in the extension's background service worker (a ring buffer of the last ~200 events for the current page, plus the previous page, cleared on tab close).
- The one thing written to disk is your per-site enable/disable preference (`chrome.storage.local`), a list of origins, nothing else.
- The popup computes everything, deduplication, noise filtering, severity ranking, incident correlation, and the markdown export, locally, from that in-memory buffer.
- The "Copy for AI" button copies text to your system clipboard. What you do with that text (e.g. paste it into an AI assistant) is up to you and outside the extension's control.
- The screenshot button saves a PNG to your Downloads folder via a browser-native file download; the image never passes through the extension's own storage or any network call.

There is no server-side component to this extension. There is nothing to send data *to*.

## URL redaction

Before a failed request's URL is ever recorded, query-string parameters that look like they carry a secret (named `token`, `api_key`, `session`, `password`, etc., or shaped like a JWT or a long opaque token regardless of name) are replaced with `[redacted]` in place, see `src/lib/redact.ts` and its tests. This happens in the page's own JavaScript context before the value ever leaves it.

## Permissions

See the [permissions table in the README](./README.md#permissions-and-why) for what each requested permission is for and why it can't be scoped narrower. In short: `storage` is the site-toggle preference; `activeTab` and the broad host permission exist because the extension has to work on arbitrary localhost ports and staging domains it can't know in advance; `scripting` registers the capture scripts.

## Changes to this policy

If this ever changes, it will be because the constraint above changed, and it will show up as a diff in a public repository, not a silent update. Check the [git history](./) for this file.
