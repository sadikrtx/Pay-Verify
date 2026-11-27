import type {
  NumberAccountType,
  PaymentActionType,
  SessionStatus,
  TestVerificationResult,
  TestVerificationType,
  WalletMethod,
  WorkerCreateSessionResponse,
  WorkerSessionStatusResponse,
} from '../types/payment';
import {
  isValidLogoDataUrl,
  normalizePaymentActionType,
  sanitizeCustomInstruction,
} from './checkoutFlow';
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

export type AuthTokenProvider = string | ((forceRefresh?: boolean) => Promise<string>);

/**
 * Part C.3 — Authenticated fetch with single 401 token refresh + retry.
 * One expired Firebase ID token refreshes ONCE and retries seamlessly without
 * ever bouncing the logged-in user back to /login.
 */
export async function fetchWithAuthRetry(
  url: string,
  buildInit: (token: string) => RequestInit,
  tokenOrProvider: AuthTokenProvider,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const resolveToken =
    typeof tokenOrProvider === 'function'
      ? tokenOrProvider
      : async () => tokenOrProvider;

  const initialToken = await resolveToken(false);
  const firstRes = await fetchImpl(url, buildInit(initialToken));
  if (firstRes.status !== 401 || typeof tokenOrProvider !== 'function') {
    return firstRes;
  }

  let refreshedToken: string;
  try {
    refreshedToken = await resolveToken(true);
  } catch {
    return firstRes;
  }
  if (!refreshedToken) {
    return firstRes;
  }

  return fetchImpl(url, buildInit(refreshedToken));
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
        .filter(
          (m): m is WalletMethod =>
            m === 'bkash' || m === 'nagad' || m === 'rocket' || m === 'upay'
        )
    : undefined;

  let methodNumbers:
    | Partial<
        Record<
          WalletMethod,
          {
            number: string;
            type: NumberAccountType;
            actionType?: PaymentActionType;
            customInstruction?: string;
          }
        >
      >
    | undefined;
  if (data.methodNumbers && typeof data.methodNumbers === 'object') {
    const src = data.methodNumbers as Record<string, unknown>;
    const parsed: Partial<
      Record<
        WalletMethod,
        {
          number: string;
          type: NumberAccountType;
          actionType?: PaymentActionType;
          customInstruction?: string;
        }
      >
    > = {};
    for (const key of ['bkash', 'nagad', 'rocket', 'upay'] as WalletMethod[]) {
      const entry = src[key];
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const num = String(obj.number || '').trim();
        if (num) {
          const entryType: NumberAccountType = obj.type === 'agent' ? 'agent' : 'personal';
          const customInstruction = sanitizeCustomInstruction(obj.customInstruction);
          parsed[key] = {
            number: num,
            type: entryType,
            actionType: normalizePaymentActionType(obj.actionType, entryType),
            ...(customInstruction ? { customInstruction } : {}),
          };
        }
      } else if (typeof entry === 'string' && entry.trim()) {
        parsed[key] = {
          number: entry.trim(),
          type: 'personal',
          actionType: 'send_money',
        };
      }
    }
    if (Object.keys(parsed).length > 0) {
      methodNumbers = parsed;
    }
  }

  const rawLogoDataUrl = typeof data.logoDataUrl === 'string' ? data.logoDataUrl : undefined;
  const topNumberType: NumberAccountType = data.numberType === 'agent' ? 'agent' : 'personal';
  const topCustomInstruction = sanitizeCustomInstruction(data.customInstruction);

  return {
    status: String(data.status || 'waiting') as WorkerSessionStatusResponse['status'],
    method: String(data.method || 'bkash').toLowerCase() as WalletMethod,
    number: String(data.number || ''),
    numberType: topNumberType,
    actionType: normalizePaymentActionType(data.actionType, topNumberType),
    ...(topCustomInstruction ? { customInstruction: topCustomInstruction } : {}),
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
    testType:
      data.testType === 'simulation' || data.testType === 'real'
        ? (data.testType as TestVerificationType)
        : undefined,
    testResult:
      data.testResult === 'pending' ||
      data.testResult === 'verified' ||
      data.testResult === 'verified_simulated' ||
      data.testResult === 'failed'
        ? (data.testResult as TestVerificationResult)
        : undefined,
    simulated: Boolean(data.simulated),
    expectedAmountPaisa:
      typeof data.expectedAmountPaisa === 'number' ? Math.trunc(data.expectedAmountPaisa) : null,
    receivedAmountPaisa:
      typeof data.receivedAmountPaisa === 'number' ? Math.trunc(data.receivedAmountPaisa) : null,
    webhookFired: typeof data.webhookFired === 'boolean' ? data.webhookFired : undefined,
    devicePaired: typeof data.devicePaired === 'boolean' ? data.devicePaired : undefined,
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
    method: WalletMethod;
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

export interface WorkerTestSessionCreateResult {
  supported: boolean;
  session?: WorkerCreateSessionResponse;
}

/**
 * Owner Dashboard Test Session Contract: POST {workerBaseUrl}/session/create
 * Carries: { storeId, method, amountPaisa, isTest: true, testType }
 * Authenticated with Authorization: Bearer <Firebase ID Token>.
 * If Worker is not yet deployed / returns 404 or 501, returns { supported: false }.
 */
export async function createTestWorkerSession(
  workerBaseUrl: string,
  firebaseIdTokenOrProvider: AuthTokenProvider,
  payload: {
    storeId: string;
    method: WalletMethod;
    amountPaisa: number;
    testType: TestVerificationType;
  },
  fetchImpl: typeof fetch = fetch
): Promise<WorkerTestSessionCreateResult> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base || !firebaseIdTokenOrProvider) {
    return { supported: false };
  }

  try {
    const res = await fetchWithAuthRetry(
      `${base}/session/create`,
      (token) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storeId: payload.storeId,
          method: payload.method,
          amountPaisa: Math.trunc(payload.amountPaisa),
          isTest: true,
          testType: payload.testType,
        }),
      }),
      firebaseIdTokenOrProvider,
      fetchImpl
    );

    if (res.status === 404 || res.status === 405 || res.status === 501) {
      return { supported: false };
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !body.sessionId) {
      const msg = typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
      throw new Error(`টেস্ট সেশন তৈরি হয়নি: ${msg}`);
    }

    return {
      supported: true,
      session: {
        sessionId: String(body.sessionId),
        payablePaisa: Math.trunc(Number(body.payablePaisa || payload.amountPaisa)),
        number: String(body.number || ''),
        expiresAt: parseTimestampMs(body.expiresAt) ?? Date.now() + 15 * 60_000,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('টেস্ট সেশন তৈরি হয়নি:')) {
      throw err;
    }
    return { supported: false };
  }
}

export interface WorkerSimulatedIngestResult {
  supported: boolean;
  ok?: boolean;
  sessionId?: string;
  testResult?: TestVerificationResult;
  failureReason?: string | null;
  trxId?: string | null;
  webhookFired?: boolean;
}

/**
 * Simulated SMS Ingest Contract: POST {workerBaseUrl}/sms/ingest
 * Accepts `simulated: true` ONLY from the account owner's authenticated dashboard
 * (`Authorization: Bearer <idToken>`) or paired device (`x-device-key`).
 */
export async function submitSmsIngestWithSimulation(
  workerBaseUrl: string,
  auth: {
    firebaseIdToken?: string;
    getFirebaseIdToken?: (forceRefresh?: boolean) => Promise<string>;
    deviceKey?: string;
  },
  payload: {
    storeId: string;
    sessionId: string;
    method: WalletMethod;
    amountPaisa: number;
    sender: string;
    trxId: string;
    raw: string;
    smsTimeMs: number;
    simulated: true;
  },
  fetchImpl: typeof fetch = fetch
): Promise<WorkerSimulatedIngestResult> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base) {
    return { supported: false };
  }

  const tokenProvider: AuthTokenProvider | null =
    auth.getFirebaseIdToken ?? auth.firebaseIdToken ?? null;
  if (!tokenProvider && !auth.deviceKey) {
    throw new Error('নিরাপত্তা নীতি: সিমুলেটেড SMS পাঠাতে অনুমোদিত পরিচয় প্রয়োজন।');
  }

  try {
    const res = tokenProvider
      ? await fetchWithAuthRetry(
          `${base}/sms/ingest`,
          (token) => ({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          }),
          tokenProvider,
          fetchImpl
        )
      : await fetchImpl(`${base}/sms/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-device-key': auth.deviceKey!,
          },
          body: JSON.stringify(payload),
        });

    if (res.status === 404 || res.status === 405 || res.status === 501) {
      return { supported: false };
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return {
      supported: true,
      ok: Boolean(body.ok ?? body.matched),
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : payload.sessionId,
      testResult:
        body.testResult === 'verified_simulated' ||
        body.testResult === 'verified' ||
        body.testResult === 'failed'
          ? (body.testResult as TestVerificationResult)
          : undefined,
      failureReason: typeof body.failureReason === 'string' ? body.failureReason : null,
      trxId: typeof body.trxId === 'string' ? body.trxId : payload.trxId,
      webhookFired: Boolean(body.webhookFired),
    };
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Failed to fetch')) {
      throw err;
    }
    return { supported: false };
  }
}

// ─── Public Selling Funnel (A5) Subscription Payment & Server-Issued Claim Token ───

export interface PublicSubscriptionCheckoutResponse {
  purchaseId: string;
  reference: string;
  sessionId: string;
  payablePaisa: number;
  expiresAtMs: number;
}

/**
 * Step 3 Public Funnel Checkout: POST {workerBaseUrl}/subscription/checkout
 * Creates a PENDING subscription purchase record and a real PayVerify session
 * on the platform's SUBSCRIPTION STORE (subscriptionStoreId).
 * NEVER marks anything paid locally.
 */
export async function createPublicSubscriptionCheckout(
  workerBaseUrl: string,
  payload: {
    subscriptionStoreId: string;
    planId: string;
    billingCycle: 'monthly' | 'yearly';
    method: WalletMethod;
    buyerName: string;
    buyerPhone: string;
    returnOrigin: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<PublicSubscriptionCheckoutResponse> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base) {
    throw new Error(
      'পেমেন্ট সার্ভার (Worker URL) এখনো কনফিগার করা হয়নি। অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন।'
    );
  }
  if (!payload.subscriptionStoreId) {
    throw new Error(
      'সাবস্ক্রিপশন পেমেন্ট স্টোর এখনো নির্ধারণ করা হয়নি। অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন।'
    );
  }

  const res = await fetchImpl(`${base}/subscription/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      mode: 'public_funnel',
      itemType: 'plan',
      subscriptionStoreId: payload.subscriptionStoreId,
      planId: payload.planId,
      billingCycle: payload.billingCycle,
      method: payload.method,
      buyerName: payload.buyerName,
      buyerPhone: payload.buyerPhone,
      returnOrigin: payload.returnOrigin,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !body.sessionId) {
    const errMsg =
      typeof body.error === 'string' && body.error.trim()
        ? body.error
        : `সাবস্ক্রিপশন পেমেন্ট সেশন তৈরি করা যায়নি (HTTP ${res.status})।`;
    throw new Error(errMsg);
  }

  return {
    purchaseId: String(body.purchaseId || body.sessionId),
    reference: String(body.reference || body.orderId || body.sessionId),
    sessionId: String(body.sessionId),
    payablePaisa: Math.trunc(Number(body.payablePaisa || 0)),
    expiresAtMs: parseTimestampMs(body.expiresAt) ?? Date.now() + 15 * 60_000,
  };
}

export interface PublicSubscriptionStatusResponse {
  status: 'pending' | 'waiting' | 'paid' | 'failed' | 'expired' | 'cancelled';
  trxId: string | null;
  claimToken: string | null;
  planId: string | null;
  planName: string | null;
  failureReason: string | null;
}

/**
 * Polls the Worker for server-verified subscription purchase status.
 * A single-use claimToken is ONLY ever returned by the Worker after the
 * owner's Android app forwards the matching SMS and the Worker verifies it.
 */
export async function fetchPublicSubscriptionStatus(
  workerBaseUrl: string,
  purchaseId: string,
  sessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PublicSubscriptionStatusResponse> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base) {
    throw new Error('Worker URL কনফিগার করা হয়নি।');
  }
  const safePurchaseId = encodeURIComponent(purchaseId);
  const res = await fetchImpl(
    `${base}/subscription/purchase/${safePurchaseId}/status?sessionId=${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }
  );
  if (!res.ok) {
    throw new Error(`পেমেন্ট স্ট্যাটাস যাচাই করা যায়নি (HTTP ${res.status})।`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const rawStatus = String(body.status || 'pending').toLowerCase();
  const status = (
    ['pending', 'waiting', 'paid', 'failed', 'expired', 'cancelled'].includes(rawStatus)
      ? rawStatus
      : 'pending'
  ) as PublicSubscriptionStatusResponse['status'];

  return {
    status,
    trxId: typeof body.trxId === 'string' && body.trxId ? body.trxId : null,
    claimToken:
      status === 'paid' && typeof body.claimToken === 'string' && body.claimToken.length >= 12
        ? body.claimToken
        : null,
    planId: typeof body.planId === 'string' ? body.planId : null,
    planName: typeof body.planName === 'string' ? body.planName : null,
    failureReason: typeof body.failureReason === 'string' ? body.failureReason : null,
  };
}

export interface ValidateClaimTokenResponse {
  valid: boolean;
  planId?: string;
  planName?: string;
  buyerName?: string;
  billingCycle?: 'monthly' | 'yearly';
  reason?: string;
}

/**
 * Step 4 Pre-Check: GET {workerBaseUrl}/subscription/claim/validate
 * Confirms the single-use server-issued claimToken belongs to a paid, unclaimed,
 * unexpired purchase. Never trusts client URL params alone.
 */
export async function validateSubscriptionClaimToken(
  workerBaseUrl: string,
  purchaseId: string,
  claimToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<ValidateClaimTokenResponse> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base) {
    return { valid: false, reason: 'worker_not_configured' };
  }
  try {
    const res = await fetchImpl(
      `${base}/subscription/claim/validate?purchaseId=${encodeURIComponent(purchaseId)}&token=${encodeURIComponent(claimToken)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !body.valid) {
      return {
        valid: false,
        reason: typeof body.reason === 'string' ? body.reason : 'invalid_or_used',
      };
    }
    return {
      valid: true,
      planId: typeof body.planId === 'string' ? body.planId : undefined,
      planName: typeof body.planName === 'string' ? body.planName : undefined,
      buyerName: typeof body.buyerName === 'string' ? body.buyerName : undefined,
      billingCycle: body.billingCycle === 'yearly' ? 'yearly' : 'monthly',
    };
  } catch {
    return { valid: false, reason: 'network_error' };
  }
}

/**
 * Step 4 Account Activation: POST {workerBaseUrl}/subscription/claim
 * Authenticated with the newly created user's Firebase ID token.
 * The Worker atomically verifies the single-use claimToken, activates the
 * purchased plan on payAccounts/{uid}, attaches the purchase record, and burns
 * the token so it can never be reused.
 */
export async function redeemSubscriptionClaimToken(
  workerBaseUrl: string,
  firebaseIdTokenOrProvider: AuthTokenProvider,
  payload: {
    purchaseId: string;
    claimToken: string;
    displayName?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<{ planName: string }> {
  const base = normalizeWorkerBaseUrl(workerBaseUrl);
  if (!base) {
    throw new Error('পেমেন্ট সার্ভার (Worker URL) কনফিগার করা হয়নি।');
  }
  const res = await fetchWithAuthRetry(
    `${base}/subscription/claim`,
    (token) => ({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }),
    firebaseIdTokenOrProvider,
    fetchImpl
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !body.ok) {
    const msg =
      typeof body.error === 'string' && body.error.trim()
        ? body.error
        : 'এই লিংকটি আর ব্যবহার করা যাবে না।';
    throw new Error(msg);
  }
  return {
    planName: typeof body.planName === 'string' ? body.planName : 'প্যাকেজ',
  };
}

