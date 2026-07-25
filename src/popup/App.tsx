import { useCallback, useEffect, useState } from 'react';
import { CLEAR_BUFFER, GET_DIGEST } from '../lib/protocol';
import type { Digest } from '../lib/types';
import { digestToMarkdown } from '../lib/markdown';
import { getDisabledOrigins, setOriginDisabled } from '../lib/storage';
import { IncidentCard } from './components/IncidentCard';
import { NoiseSection } from './components/NoiseSection';

function emptyDigest(): Digest {
  return { pageUrl: '', userAgent: '', incidents: [], noise: { count: 0, samples: [] }, generatedAt: Date.now() };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  // Playwright/automated testing can't trigger the native toolbar popup (it's
  // outside page content), so it opens this page directly as a tab, which
  // would otherwise make chrome.tabs.query({active:true}) resolve to itself
  // instead of the tab under test. This override only ever fires when the
  // popup is opened with an explicit ?tabId=, which never happens in real
  // toolbar-popup usage.
  const overrideTabId = new URLSearchParams(location.search).get('tabId');
  if (overrideTabId) return chrome.tabs.get(Number(overrideTabId));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function App() {
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [digest, setDigest] = useState<Digest>(emptyDigest());
  const [siteDisabled, setSiteDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'saved'>('idle');

  const origin = originOf(tab?.url);

  const refresh = useCallback(async () => {
    const activeTab = await getActiveTab();
    setTab(activeTab);
    const tabOrigin = originOf(activeTab?.url);

    const disabledOrigins = await getDisabledOrigins();
    setSiteDisabled(tabOrigin !== null && disabledOrigins.includes(tabOrigin));

    if (activeTab?.id !== undefined) {
      const result = (await chrome.runtime.sendMessage({ type: GET_DIGEST, tabId: activeTab.id })) as Digest;
      setDigest(result);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleToggleSite = async () => {
    if (!origin) return;
    await setOriginDisabled(origin, !siteDisabled);
    await refresh();
  };

  const handleClear = async () => {
    if (tab?.id === undefined) return;
    await chrome.runtime.sendMessage({ type: CLEAR_BUFFER, tabId: tab.id });
    await refresh();
  };

  const handleCopyForAi = async () => {
    const markdown = digestToMarkdown(digest);
    await navigator.clipboard.writeText(markdown);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus('idle'), 1500);
  };

  const handleScreenshot = async () => {
    if (tab?.windowId === undefined) return;
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `bug-digest-screenshot-${Date.now()}.png`;
    link.click();
    setScreenshotStatus('saved');
    setTimeout(() => setScreenshotStatus('idle'), 1500);
  };

  if (loading) {
    return <div className="w-[420px] p-4 text-sm text-neutral-500">Loading…</div>;
  }

  return (
    <div className="w-[420px] max-h-[600px] flex flex-col font-sans text-sm bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <header className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">bug-digest</p>
          <p className="text-xs text-neutral-500 truncate">{origin ?? tab?.url ?? '(no page)'}</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500 shrink-0">
          <input type="checkbox" checked={!siteDisabled} onChange={handleToggleSite} disabled={!origin} />
          Enabled for this site
        </label>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {siteDisabled ? (
          <p className="text-neutral-500 text-center py-6">bug-digest is disabled for this site.</p>
        ) : digest.incidents.length === 0 ? (
          <p className="text-neutral-500 text-center py-6">No problems detected on this page.</p>
        ) : (
          digest.incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)
        )}

        <NoiseSection noise={digest.noise} />
      </div>

      <footer className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex gap-2">
        <button
          onClick={handleCopyForAi}
          disabled={digest.incidents.length === 0}
          className="flex-1 px-3 py-1.5 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-medium disabled:opacity-40"
        >
          {copyStatus === 'copied' ? 'Copied!' : 'Copy for AI'}
        </button>
        <button
          onClick={handleScreenshot}
          className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-xs"
          title="Download a screenshot of this page"
        >
          {screenshotStatus === 'saved' ? 'Saved!' : '📷'}
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 text-xs"
          title="Clear captured events for this page"
        >
          Clear
        </button>
      </footer>
    </div>
  );
}
