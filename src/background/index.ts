/**
 * Service worker: owns the per-tab ring buffer that capture/content.ts relays
 * into. One "current page" buffer plus one "previous page" buffer per tab, so
 * a refresh-loop bug stays inspectable for one navigation after it happens.
 */
import {
  GET_BUFFER,
  RELAY_EVENT,
  RELAY_PAGE_INIT,
  type RuntimeMessage,
} from '../lib/protocol';
import type { RawEvent } from '../lib/types';

const MAX_EVENTS_PER_PAGE = 200;

interface TabBuffer {
  current: RawEvent[];
  previous: RawEvent[];
  currentUrl: string;
}

const buffers = new Map<number, TabBuffer>();

function getOrCreateBuffer(tabId: number): TabBuffer {
  let buf = buffers.get(tabId);
  if (!buf) {
    buf = { current: [], previous: [], currentUrl: '' };
    buffers.set(tabId, buf);
  }
  return buf;
}

function pushEvent(tabId: number, event: RawEvent): void {
  const buf = getOrCreateBuffer(tabId);
  buf.current.push(event);
  if (buf.current.length > MAX_EVENTS_PER_PAGE) {
    buf.current.splice(0, buf.current.length - MAX_EVENTS_PER_PAGE);
  }
  console.debug('[bug-digest] event captured', tabId, event);
}

function handlePageInit(tabId: number, url: string): void {
  const buf = getOrCreateBuffer(tabId);
  buf.previous = buf.current;
  buf.current = [];
  buf.currentUrl = url;
  console.debug('[bug-digest] page-init, buffer rotated', tabId, url);
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.type === RELAY_EVENT) {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) pushEvent(tabId, message.event);
    return false;
  }

  if (message.type === RELAY_PAGE_INIT) {
    const tabId = sender.tab?.id;
    // Only the top frame's navigation should rotate the buffer; sub-frame
    // (re)loads shouldn't wipe out events collected for the page as a whole.
    if (tabId !== undefined && sender.frameId === 0) handlePageInit(tabId, message.url);
    return false;
  }

  if (message.type === GET_BUFFER) {
    const buf = buffers.get(message.tabId);
    sendResponse({
      current: buf?.current ?? [],
      previous: buf?.previous ?? [],
      currentUrl: buf?.currentUrl ?? '',
    });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  buffers.delete(tabId);
});

// Registered here (rather than declared in manifest.config.ts) so Chrome
// injects both capture scripts as genuine, synchronous document_start
// content scripts. CRXJS's manifest-declared content scripts go through an
// async dynamic-import loader that loses the race against the page's own
// document_start scripts — see scripts/build-capture.mjs for the full story.
const MAIN_WORLD_SCRIPT_ID = 'bug-digest-main-world';
const CONTENT_SCRIPT_ID = 'bug-digest-content';

async function ensureCaptureScriptsRegistered(): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [MAIN_WORLD_SCRIPT_ID, CONTENT_SCRIPT_ID],
  });
  const existingIds = new Set(existing.map((s) => s.id));

  const toRegister: chrome.scripting.RegisteredContentScript[] = [];
  if (!existingIds.has(MAIN_WORLD_SCRIPT_ID)) {
    toRegister.push({
      id: MAIN_WORLD_SCRIPT_ID,
      js: ['capture/main-world.js'],
      matches: ['<all_urls>'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
      persistAcrossSessions: true,
    });
  }
  if (!existingIds.has(CONTENT_SCRIPT_ID)) {
    toRegister.push({
      id: CONTENT_SCRIPT_ID,
      js: ['capture/content.js'],
      matches: ['<all_urls>'],
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: true,
    });
  }
  if (toRegister.length > 0) await chrome.scripting.registerContentScripts(toRegister);
}

void ensureCaptureScriptsRegistered();
