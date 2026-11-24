import { AuthSession } from '../types/ledger';

const SESSION_KEY = 'khan_enterprise_session_v1';
const HASH_SALT = 'ke_ledger_auth_v1_';

function fallbackHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return 'fb_' + combined.toString(16);
}

export async function hashPassword(rawPassword: string): Promise<string> {
  const payload = HASH_SALT + rawPassword;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const bytes = new TextEncoder().encode(payload);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const arr = Array.from(new Uint8Array(digest));
      return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fallback if subtle crypto is unavailable
  }
  return fallbackHash(payload);
}

export async function verifyPassword(
  rawPassword: string,
  expectedHash?: string
): Promise<boolean> {
  if (!expectedHash) return false;
  const computed = await hashPassword(rawPassword);
  return computed === expectedHash;
}

export function loadAuthSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (parsed && parsed.role === 'admin') {
      return { role: 'admin' };
    }
    if (parsed && parsed.role === 'company' && typeof parsed.companyId === 'string') {
      return { role: 'company', companyId: parsed.companyId };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota issues
  }
}

export function clearAuthSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore
  }
}
