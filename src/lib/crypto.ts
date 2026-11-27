/**
 * Web Crypto helpers for device keys, store keys, webhook secret hashes,
 * email directory hashes, revocation rotation, and safe HTTP URL validation.
 */

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashEmailForDirectory(email: string): Promise<string> {
  return sha256Hex(email.trim().toLowerCase());
}

export async function generateDeviceKey(): Promise<{
  rawKey: string;
  keyHash: string;
}> {
  const randomBytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(randomBytes);
  const token = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const rawKey = `pv_dev_${token}`;
  const keyHash = await sha256Hex(rawKey);
  return { rawKey, keyHash };
}

export async function generateStoreKey(): Promise<{
  rawKey: string;
  keyHash: string;
}> {
  const randomBytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(randomBytes);
  const token = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const rawKey = `pv_live_${token}`;
  const keyHash = await sha256Hex(rawKey);
  return { rawKey, keyHash };
}

export function generatePairingTokenCode(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `PVPAIR-${hex.slice(0, 8)}-${hex.slice(8, 16)}`;
}

/**
 * Generates an unrecoverable random 64-char SHA-256 hex digest to rotate a revoked device's keyHash.
 */
export async function generateRotatedRevokedHash(): Promise<string> {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return sha256Hex(`revoked_${token}`);
}

export function generateDocId(prefix: string): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${hex}`;
}

export function generateWebhookSecret(length = 40): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsetLen = charset.length; // 62
  const maxValidByte = Math.floor(256 / charsetLen) * charsetLen; // 248 (uniform sampling)

  for (let attempt = 0; attempt < 16; attempt++) {
    let result = '';
    while (result.length < length) {
      const buf = new Uint8Array(length * 2);
      globalThis.crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length && result.length < length; i++) {
        if (buf[i] < maxValidByte) {
          result += charset[buf[i] % charsetLen];
        }
      }
    }
    if (/[A-Z]/.test(result) && /[a-z]/.test(result) && /[0-9]/.test(result)) {
      return result;
    }
  }

  // Fallback guaranteed mixed classes if 16 random draws missed a class
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => charset[b % charsetLen]).join('');
}

export function isSafeHttpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
