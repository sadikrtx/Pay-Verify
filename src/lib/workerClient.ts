import type {
  CheckoutWalletMethod,
  NumberAccountType,
  SessionStatus,
  WalletMethod,
  WorkerCreateSessionResponse,
  WorkerSessionStatusResponse,
} from '../types/payment';
import { isValidLogoDataUrl } from './checkoutFlow';
import { isSafeHttpUrl } from './crypto';
import { parseTimestampMs } from './money';
import { sanitizeRedirectUrl } from './platformLogic';

const WORKER_URL_CACHE_KEY = 'payverify_bd_worker_base_url';
const STORE_NAME_CACHE_KEY = 'payverify_bd_store_name';

export function normalizeWorkerBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!isSafeHttpUrl(trimmed)) {
    throw new Error('Worker URL অবশ্যই https:// বা http:// দিয়ে শুরু হতে হবে।');
  }
  return trimmed;
}

export function cacheWorkerConfigLocally(workerBaseUrl: string, storeName: string): void {
  try {
    if (workerBaseUrl) {
      window.localStorage.setItem(WORKER_URL_CACHE_KEY, workerBaseUrl);
    }
    if (storeName) {
      window.localStorage.setItem(STORE_NAME_CACHE_KEY, storeName);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function resolvePublicWorkerBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('worker');
    if (fromQuery && isSafeHttpUrl(fromQuery)) {
      return fromQuery.trim().replace(/\/+$/, '');
    }
    try {
      const cached = window.localStorage.getItem(WORKER_URL_CACHE_KEY);
      if (cached && isSafeHttpUrl(cached)) {
        return cached.trim().replace(/\/+$/, '');
      }
    } catch {
      // Ignore
    }
  }
  const fromEnv = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_WORKER_BASE_URL;
  if (fromEnv && isSafeHttpUrl(fromEnv)) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  return '';
}

export function resolvePublicStoreName(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('store');
    if (fromQuery && fromQuery.trim()) {
      return fromQuery.trim().slice(0, 80);
    }
    try {
      const cached = window.localStorage.getItem(STORE_NAME_CACHE_KEY);
      if (cached && cached.trim()) {
        return cached.trim().slice(0, 80);
      }
    } catch {
      // Ignore
    }
  }
  return 'PayVerify BD';
}

export function resolvePublicRedirectFallbacks(): {
  successUrl: string | null;
  failUrl: string | null;
} {
  if (typeof window === 'undefined') {
    return { successUrl: null, failUrl: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    successUrl: sanitizeRedirectUrl(params.get('successUrl')),
    failUrl: sanitizeRedirectUrl(params.get('failUrl')),
  };
}

export function buildDeviceQrPayload(workerBaseUrl: string, deviceKey: string): string {
  return JSON.stringify({
    workerBaseUrl: workerBaseUrl.trim().replace(/\/+$/, ''),
    deviceKey,
  });
}

/**
 * Public Worker Contract: GET {workerBaseUrl}/session/{sessionId}/status
 * Used ONLY by the customer payment page (never calls Firestore).
 */
export async function fetchSessionStatus(
  workerBaseUrl: string,
  sessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<WorkerSessionStatusResponse> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base) {
    throw new Error('Worker URL কনফিগার করা হয়নি।');
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
    throw new Error('সেশন আইডি সঠিক নয়।');
  }

  const res = await fetchImpl(`${base}/session/${encodeURIComponent(sessionId)}/status`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) {
    throw new Error('পেমেন্ট সেশনটি খুঁজে পাওয়া যায়নি।');
  }
  if (!res.ok) {
    throw new Error(`সার্ভার থেকে তথ্য আনা যায়নি (${res.status})।`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const expiresMs = parseTimestampMs(data.expiresAt) ?? 0;

  const rawEnabled = Array.isArray(data.enabledMethods)
    ? data.enabledMethods
        .map((m) => String(m).toLowerCase())
        .filter((m): m is CheckoutWalletMethod => m === 'bkash' || m === 'nagad' || m === 'rocket')
    : undefined;

  let methodNumbers:
    | Partial<Record<CheckoutWalletMethod, { number: string; type: NumberAccountType }>>
    | undefined;
  if (data.methodNumbers && typeof data.methodNumbers === 'object') {
    const src = data.methodNumbers as Record<string, unknown>;
    const parsed: Partial<
      Record<CheckoutWalletMethod, { number: string; type: NumberAccountType }>
    > = {};
    for (const key of ['bkash', 'nagad', 'rocket'] as CheckoutWalletMethod[]) {
      const entry = src[key];
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const num = String(obj.number || '').trim();
        if (num) {
          parsed[key] = {
            number: num,
            type: obj.type === 'agent' ? 'agent' : 'personal',
          };
        }
      } else if (typeof entry === 'string' && entry.trim()) {
        parsed[key] = { number: entry.trim(), type: 'personal' };
      }
    }
    if (Object.keys(parsed).length > 0) {
      methodNumbers = parsed;
    }
  }

  const rawLogoDataUrl = typeof data.logoDataUrl === 'string' ? data.logoDataUrl : undefined;

  return {
    status: String(data.status || 'waiting') as WorkerSessionStatusResponse['status'],
    method: String(data.method || 'bkash').toLowerCase() as WalletMethod,
    number: String(data.number || ''),
    numberType: data.numberType === 'agent' ? 'agent' : 'personal',
    payablePaisa: Math.trunc(Number(data.payablePaisa || 0)),
    expiresAt: expiresMs,
    trxId: data.trxId ? String(data.trxId) : null,
    storeName: typeof data.storeName === 'string' ? data.storeName.trim() : undefined,
    storeNameEn: typeof data.storeNameEn === 'string' ? data.storeNameEn.trim() : undefined,
    logoUrl:
      typeof data.logoUrl === 'string' ? (sanitizeRedirectUrl(data.logoUrl) ?? undefined) : undefined,
    logoDataUrl: rawLogoDataUrl && isValidLogoDataUrl(rawLogoDataUrl) ? rawLogoDataUrl : undefined,
    accentColor: typeof data.accentColor === 'string' ? data.accentColor : undefined,
    orderId: typeof data.orderId === 'string' ? data.orderId : undefined,
    amountPaisa: typeof data.amountPaisa === 'number' ? Math.trunc(data.amountPaisa) : undefined,
    uniquePaisa: typeof data.uniquePaisa === 'boolean' ? data.uniquePaisa : undefined,
    successUrl:
      typeof data.successUrl === 'string' ? sanitizeRedirectUrl(data.successUrl) : null,
    failUrl: typeof data.failUrl === 'string' ? sanitizeRedirectUrl(data.failUrl) : null,
    enabledMethods: rawEnabled,
    methodNumbers,
    failureReason: typeof data.failureReason === 'string' ? data.failureReason : null,
    isTest: Boolean(data.isTest),
  };
}

export interface SubmitVerificationResult {
  supported: boolean;
  status?: SessionStatus;
  trxId?: string | null;
  failureReason?: string | null;
}

/**
 * Public Worker Contract: POST {workerBaseUrl}/session/{sessionId}/verify
 * Submits customer's chosen method, Transaction ID, and sender phone to the Worker.
 * If the deployed Worker does not yet expose /verify (404/405/501), returns supported: false
 * so the page safely continues server-side polling without faking any result.
 */
export async function submitSessionVerification(
  workerBaseUrl: string,
  sessionId: string,
  payload: {
    method: CheckoutWalletMethod;
    trxId: string;
    sender: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<SubmitVerificationResult> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
    return { supported: false };
  }

  try {
    const res = await fetchImpl(`${base}/session/${encodeURIComponent(sessionId)}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 404 || res.status === 405 || res.status === 501) {
      return { supported: false };
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        supported: true,
        status: 'failed',
        failureReason:
          typeof body.reason === 'string'
            ? body.reason
            : typeof body.error === 'string'
              ? body.error
              : 'verification_failed',
      };
    }

    const statusStr = String(body.status || 'waiting').toLowerCase() as SessionStatus;
    return {
      supported: true,
      status: statusStr,
      trxId: body.trxId ? String(body.trxId) : payload.trxId,
      failureReason: typeof body.failureReason === 'string' ? body.failureReason : null,
    };
  } catch {
    return { supported: false };
  }
}

/**
 * Best-effort cancel notification to Worker when customer taps "বাতিল করে দোকানে ফিরুন".
 */
export async function cancelSessionPublic(
  workerBaseUrl: string,
  sessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) return;
  try {
    await fetchImpl(`${base}/session/${encodeURIComponent(sessionId)}/cancel`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
  } catch {
    // Non-blocking best-effort cancel
  }
}

/**
 * Owner/Store Worker Contract: POST {workerBaseUrl}/session/create
 * Header: x-store-key
 * Body: { orderId, amountPaisa, method, storeId?, successUrl?, failUrl? }
 */
export async function createWorkerSession(
  workerBaseUrl: string,
  storeKey: string,
  payload: {
    orderId: string;
    amountPaisa: number;
    method: WalletMethod;
    storeId?: string;
    successUrl?: string;
    failUrl?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<WorkerCreateSessionResponse> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base) {
    throw new Error('Worker Base URL এখনো কনফিগার করা হয়নি।');
  }
  const key = storeKey.trim();
  if (!key) {
    throw new Error('Store Key প্রদান করুন।');
  }
  const orderId = payload.orderId.trim();
  if (!orderId) {
    throw new Error('অর্ডার আইডি দিন।');
  }
  if (!Number.isInteger(payload.amountPaisa) || payload.amountPaisa < 100) {
    throw new Error('সঠিক টাকার পরিমাণ দিন (সর্বনিম্ন ৳1)।');
  }

  const bodyPayload: Record<string, unknown> = {
    orderId,
    amountPaisa: payload.amountPaisa,
    method: payload.method,
  };
  if (payload.storeId) {
    bodyPayload.storeId = payload.storeId;
  }
  if (payload.successUrl && payload.successUrl.trim()) {
    const safe = sanitizeRedirectUrl(payload.successUrl);
    if (!safe) throw new Error('Success URL সঠিক http:// বা https:// লিঙ্ক হতে হবে।');
    bodyPayload.successUrl = safe;
  }
  if (payload.failUrl && payload.failUrl.trim()) {
    const safe = sanitizeRedirectUrl(payload.failUrl);
    if (!safe) throw new Error('Fail URL সঠিক http:// বা https:// লিঙ্ক হতে হবে।');
    bodyPayload.failUrl = safe;
  }

  const res = await fetchImpl(`${base}/session/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-store-key': key,
    },
    body: JSON.stringify(bodyPayload),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg = typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
    throw new Error(`সেশন তৈরি হয়নি: ${errMsg}`);
  }

  return {
    sessionId: String(body.sessionId || ''),
    payablePaisa: Math.trunc(Number(body.payablePaisa || payload.amountPaisa)),
    number: String(body.number || ''),
    expiresAt: parseTimestampMs(body.expiresAt) ?? Date.now() + 15 * 60_000,
  };
}
