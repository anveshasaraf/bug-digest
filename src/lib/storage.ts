/** Shared chrome.storage.local access for the per-site enable/disable toggle. */

export const DISABLED_ORIGINS_KEY = 'bug-digest:disabled-origins';

export async function getDisabledOrigins(): Promise<string[]> {
  const result = await chrome.storage.local.get(DISABLED_ORIGINS_KEY);
  const value: unknown = result[DISABLED_ORIGINS_KEY];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function isOriginDisabled(origin: string): Promise<boolean> {
  const disabled = await getDisabledOrigins();
  return disabled.includes(origin);
}

export async function setOriginDisabled(origin: string, disabled: boolean): Promise<void> {
  const current = await getDisabledOrigins();
  const next = disabled ? [...new Set([...current, origin])] : current.filter((o) => o !== origin);
  await chrome.storage.local.set({ [DISABLED_ORIGINS_KEY]: next });
}
