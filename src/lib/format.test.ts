import { describe, expect, it } from 'vitest';
import { relativeTime } from './format';

describe('relativeTime', () => {
  const now = 1_700_000_000_000;

  it('shows "just now" for sub-second gaps', () => {
    expect(relativeTime(now - 500, now)).toBe('just now');
  });

  it('shows seconds under a minute', () => {
    expect(relativeTime(now - 45_000, now)).toBe('45s ago');
  });

  it('shows minutes under an hour', () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago');
  });

  it('shows hours under a day', () => {
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
  });

  it('shows days beyond that', () => {
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});
