import { useState } from 'react';
import type { Digest } from '../../lib/types';

export function NoiseSection({ noise }: { noise: Digest['noise'] }) {
  const [expanded, setExpanded] = useState(false);
  if (noise.count === 0) return null;

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500"
      >
        <span>
          {noise.count} ignorable message{noise.count === 1 ? '' : 's'} (favicon, extension noise…)
        </span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <ul className="border-t border-neutral-200 dark:border-neutral-700 p-2 space-y-1 font-mono text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
          {noise.samples.map((sample, i) => (
            <li key={i} className="break-all">
              {sample}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
