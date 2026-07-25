/**
 * Service worker: owns the per-tab ring buffer that capture/content.ts relays
 * into, the digest computed from it, and the toolbar badge. One "current
 * page" buffer plus one "previous page" buffer per tab, so a refresh-loop
 * bug stays inspectable for one navigation after it happens.
 */
import {
  CLEAR_BUFFER,
  GET_DIGEST,
  RELAY_EVENT,
  RELAY_PAGE_INIT,
  type RuntimeMessage,
} from '../lib/protocol';
import type { Digest, RawEvent } from '../lib/types';
import { buildDigest } from '../lib/pipeline';
import { isOriginDisabled, DISABLED_ORIGINS_KEY } from '../lib/storage';

const MAX_EVENTS_PER_PAGE = 200;
const BADGE_CRITICAL_COLOR = '#dc2626';
const BADGE_NEUTRAL_COLOR = '#6b7280';

interface TabBuffer {
  current: RawEvent[];
  previous: RawEvent[];
  currentUrl: string;
  digest: Digest;
}

const buffers = new Map<number, TabBuffer>();

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function emptyDigest(pageUrl: string): Digest {
  return { pageUrl, userAgent: navigator.userAgent, incidents: [], noise: { count: 0, samples: [] }, generatedAt: Date.now() };
}

function getOrCreateBuffer(tabId: number): TabBuffer {
  let buf = buffers.get(tabId);
  if (!buf) {
    buf = { current: [], previous: [], currentUrl: '', digest: emptyDigest('') };
    buffers.set(tabId, buf);
  }
  return buf;
}

async function setBadge(tabId: number, digest: Digest): Promise<void> {
  const total = digest.incidents.length;
  if (total === 0) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  const hasCritical = digest.incidents.some((i) => i.severity === 'critical');
  await chrome.action.setBadgeText({ tabId, text: String(total) });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: hasCritical ? BADGE_CRITICAL_COLOR : BADGE_NEUTRAL_COLOR });
}

async function recomputeDigestAndBadge(tabId: number, buf: TabBuffer): Promise<void> {
  const origin = safeOrigin(buf.currentUrl);
  const disabled = origin !== null && (await isOriginDisabled(origin));
  buf.digest = disabled ? emptyDigest(buf.currentUrl) : buildDigest(buf.current, { pageUrl: buf.currentUrl, userAgent: navigator.userAgent });
  await setBadge(tabId, buf.digest);
}

async function handleRelayEvent(tabId: number, tabUrl: string, event: RawEvent): Promise<void> {
  const origin = safeOrigin(tabUrl);
  if (origin !== null && (await isOriginDisabled(origin))) return;

  const buf = getOrCreateBuffer(tabId);
  buf.current.push(event);
  if (buf.current.length > MAX_EVENTS_PER_PAGE) {
    buf.current.splice(0, buf.current.length - MAX_EVENTS_PER_PAGE);
  }
  await recomputeDigestAndBadge(tabId, buf);
}

async function handlePageInit(tabId: number, url: string): Promise<void> {
  const buf = getOrCreateBuffer(tabId);
  buf.previous = buf.current;
  buf.current = [];
  buf.currentUrl = url;
  await recomputeDigestAndBadge(tabId, buf);
}

async function handleClearBuffer(tabId: number): Promise<void> {
  const buf = getOrCreateBuffer(tabId);
  buf.current = [];
  buf.previous = [];
  await recomputeDigestAndBadge(tabId, buf);
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.type === RELAY_EVENT) {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url;
    if (tabId !== undefined && tabUrl !== undefined) void handleRelayEvent(tabId, tabUrl, message.event);
    return false;
  }

  if (message.type === RELAY_PAGE_INIT) {
    const tabId = sender.tab?.id;
    // Only the top frame's navigation should rotate the buffer; sub-frame
    // (re)loads shouldn't wipe out events collected for the page as a whole.
    if (tabId !== undefined && sender.frameId === 0) void handlePageInit(tabId, message.url);
    return false;
  }

  if (message.type === GET_DIGEST) {
    const buf = buffers.get(message.tabId);
    sendResponse(buf?.digest ?? emptyDigest(''));
    return false;
  }

  if (message.type === CLEAR_BUFFER) {
    void handleClearBuffer(message.tabId).then(() => sendResponse());
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  buffers.delete(tabId);
});

// Re-evaluate every open tab's digest/badge when the disabled-origins list
// changes, so toggling a site off from the popup clears its badge immediately.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(DISABLED_ORIGINS_KEY in changes)) return;
  for (const [tabId, buf] of buffers) {
    void recomputeDigestAndBadge(tabId, buf);
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
  }
});

// Registered here (rather than declared in manifest.config.ts) so Chrome
// injects both capture scripts as genuine, synchronous document_start
// content scripts. CRXJS's manifest-declared content scripts go through an
// async dynamic-import loader that loses the race against the page's own
// document_start scripts, see scripts/build-capture.mjs for the full story.
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
