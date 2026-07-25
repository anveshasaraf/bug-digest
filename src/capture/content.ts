/**
 * Isolated world. Cannot see the page's own console/fetch; its only job is
 * to validate messages posted by capture/main-world.ts and relay them to the
 * background service worker over chrome.runtime messaging.
 */
import { isMainWorldMessage, RELAY_EVENT, RELAY_PAGE_INIT } from '../lib/protocol';

window.addEventListener('message', (event: MessageEvent) => {
  // Same-window, same-origin messages only, main-world.ts posts with targetOrigin
  // set to window.location.origin, so this also rejects messages from other frames.
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const data: unknown = event.data;
  if (!isMainWorldMessage(data)) return;

  if (data.type === 'event') {
    chrome.runtime.sendMessage({ type: RELAY_EVENT, event: data.payload }).catch(() => {
      // Service worker may be asleep/unreachable (e.g. extension reloaded); drop silently.
    });
  } else {
    chrome.runtime.sendMessage({ type: RELAY_PAGE_INIT, url: data.url, ts: data.ts }).catch(() => {
      // ignore
    });
  }
});
