import { useCallback, useEffect, useState } from 'react';
import { GET_BUFFER } from '../lib/protocol';
import type { RawEvent } from '../lib/types';

interface BufferResponse {
  current: RawEvent[];
  previous: RawEvent[];
  currentUrl: string;
}

const EMPTY: BufferResponse = { current: [], previous: [], currentUrl: '' };

/**
 * Milestone 1 debug view: raw ring-buffer dump so capture plumbing can be
 * verified end to end. The real ranked-digest UI lands in Milestone 4.
 */
export function App() {
  const [data, setData] = useState<BufferResponse>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        setError('No active tab.');
        return;
      }
      chrome.runtime
        .sendMessage({ type: GET_BUFFER, tabId: tab.id })
        .then((res: BufferResponse) => {
          setData(res);
          setError(null);
        })
        .catch((err: unknown) => setError(String(err)));
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="w-[420px] max-h-[600px] overflow-auto p-3 font-sans text-sm">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-base font-semibold">bug-digest (debug view)</h1>
        <button
          onClick={refresh}
          className="px-2 py-1 text-xs rounded bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <p className="text-xs text-neutral-500 mb-2 truncate">{data.currentUrl || '(no page-init seen yet)'}</p>

      <Section title={`Current page (${data.current.length})`} events={data.current} />
      <Section title={`Previous page (${data.previous.length})`} events={data.previous} />
    </div>
  );
}

function Section({ title, events }: { title: string; events: RawEvent[] }) {
  return (
    <details className="mb-2" open={events.length > 0}>
      <summary className="cursor-pointer font-medium">{title}</summary>
      {events.length === 0 ? (
        <p className="text-neutral-500 pl-2">none</p>
      ) : (
        <ul className="pl-2 space-y-1">
          {events.map((e, i) => (
            <li key={i} className="border-l-2 border-neutral-300 pl-2 dark:border-neutral-600">
              <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(e, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
