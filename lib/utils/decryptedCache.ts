'use client';

const DECRYPTED_PREFIX = 'bsteg_decrypted_msg_';

export function getDecryptedMessage(userId: string, messageId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return (
      localStorage.getItem(`${DECRYPTED_PREFIX}${userId}_${messageId}`) ||
      sessionStorage.getItem(`${DECRYPTED_PREFIX}${userId}_${messageId}`)
    );
  } catch {
    return null;
  }
}

export function setDecryptedMessage(userId: string, messageId: string, text: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${DECRYPTED_PREFIX}${userId}_${messageId}`, text);
    sessionStorage.setItem(`${DECRYPTED_PREFIX}${userId}_${messageId}`, text);
    window.dispatchEvent(new Event('bsteg_decrypted_updated'));
  } catch (e) {
    console.error('Failed to cache decrypted message:', e);
  }
}

export function getAllDecryptedMessages(userId: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const result: Record<string, string> = {};
  try {
    const prefix = `${DECRYPTED_PREFIX}${userId}_`;

    // Read from localStorage (persistent chat storage)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const msgId = key.substring(prefix.length);
        const val = localStorage.getItem(key);
        if (val) {
          result[msgId] = val;
        }
      }
    }

    // Also read from sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const msgId = key.substring(prefix.length);
        if (!result[msgId]) {
          const val = sessionStorage.getItem(key);
          if (val) {
            result[msgId] = val;
          }
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
  return result;
}

