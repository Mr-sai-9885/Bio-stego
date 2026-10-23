'use client';

const ALIAS_PREFIX = 'bsteg_contact_name_';

export function getContactAlias(userId: string, contactId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(`${ALIAS_PREFIX}${userId}_${contactId}`);
  } catch {
    return null;
  }
}

export function setContactAlias(userId: string, contactId: string, aliasName: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = aliasName.trim();
    if (trimmed) {
      localStorage.setItem(`${ALIAS_PREFIX}${userId}_${contactId}`, trimmed);
    } else {
      localStorage.removeItem(`${ALIAS_PREFIX}${userId}_${contactId}`);
    }
    // Dispatch a custom event so all open views update immediately
    window.dispatchEvent(new Event('contact_alias_updated'));
  } catch (e) {
    console.error('Failed to save contact alias:', e);
  }
}

export function getAllContactAliases(userId: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const result: Record<string, string> = {};
  try {
    const prefix = `${ALIAS_PREFIX}${userId}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const contactId = key.substring(prefix.length);
        const val = localStorage.getItem(key);
        if (val) {
          result[contactId] = val;
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
  return result;
}
