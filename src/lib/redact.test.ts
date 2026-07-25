import { describe, expect, it } from 'vitest';
import { redactUrl } from './redact';

describe('redactUrl', () => {
  it('redacts known sensitive query param names', () => {
    const out = redactUrl('https://api.example.com/data?token=abc123&user=42');
    expect(out).toBe('https://api.example.com/data?token=%5Bredacted%5D&user=42');
  });

  it('redacts Authorization-style bearer/JWT-shaped values regardless of param name', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const out = redactUrl(`https://api.example.com/data?custom=${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('%5Bredacted%5D');
  });

  it('redacts long opaque-looking values under innocuous param names', () => {
    const out = redactUrl('https://api.example.com/data?k=aVeryLongOpaqueRandomToken1234567890');
    expect(out).toContain('%5Bredacted%5D');
  });

  it('leaves ordinary URLs with no sensitive params unchanged', () => {
    const url = 'https://api.example.com/data?page=2&sort=asc';
    expect(redactUrl(url)).toBe(url);
  });

  it('returns malformed URLs unchanged rather than throwing', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });

  it('is case-insensitive on sensitive param names', () => {
    const out = redactUrl('https://api.example.com/data?Authorization=secretvalue1234567890');
    expect(out).toContain('%5Bredacted%5D');
  });
});
