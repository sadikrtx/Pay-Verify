/**
 * PayVerify BD — Reference Cloudflare Worker Contract (Multi-Tenant + Test Verification A7)
 *
 * Public customer page calls: GET  {workerBaseUrl}/session/{sessionId}/status
 * Store / Website calls:      POST {workerBaseUrl}/session/create  (Header: x-store-key OR Authorization Bearer for dashboard test)
 * Android SMS Forwarder:      POST {workerBaseUrl}/sms/ingest      (Header: x-device-key)
 * Owner Dashboard Simulation: POST {workerBaseUrl}/sms/ingest      (Header: Authorization: Bearer <Firebase ID Token>, simulated: true)
 *
 * HARD TEST VERIFICATION SAFETY RULES (enforced on server, never just UI):
 * 1. Test sessions carry isTest = true, testType = 'real' | 'simulation', and expire fast (15 minutes).
 * 2. Test sessions NEVER count toward dailySessionCap quota, NEVER count in sales/revenue,
 *    and NEVER fire the store's production webhook (webhookFired = false, webhookUrl skipped).
 * 3. `simulated: true` in POST /sms/ingest is accepted ONLY when authenticated via
 *    (a) Firebase ID Token belonging to the store account owner, or (b) paired `x-device-key`.
 * 4. A simulated SMS (`simulated: true`) can ONLY ever verify a session where `isTest === true`.
 *    Attempting to verify a real (non-test) session via simulation returns HTTP 403 and NEVER marks it paid.
 * 5. Simulated TrxIDs carry the `SIM` prefix, are flagged `simulated: true`, and never match real sessions.
 */

const TEST_SESSION_TTL_MS = 15 * 60 * 1000;

export function decodeJwtPayloadUnsafe(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = atob(pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(String(input || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizePhoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('880')) return `0${digits.slice(3)}`;
  if (digits.length === 10 && digits.startsWith('1')) return `0${digits}`;
  return digits;
}

/**
 * Pure matching & hard safety rule guard shared across Worker handlers.
 * Enforces strict multi-tenant isolation:
 *  - A session belongs to 1 store -> 1 merchant (accountId) -> that merchant's paired active device ONLY.
 *  - Merchant B's device / SMS / numbers can NEVER verify Merchant A's session.
 *  - Revoked or inactive devices are strictly rejected.
 */
export function evaluateWorkerSmsMatch({
  session,
  sms,
  device = null,
  usedTrxIds,
  storeWebhookUrl,
  nowMs = Date.now(),
}) {
  const isSimulated = Boolean(sms.simulated);
  const trxId = String(sms.trxId || '').trim().toUpperCase();

  // HARD TENANT ISOLATION RULE 1: Revoked or inactive device can NEVER verify any session
  if (device && device.active === false) {
    return {
      ok: false,
      httpStatus: 403,
      failureCode: 'device_revoked',
      failureReason: 'সংযুক্ত ডিভাইসটি বাতিল বা নিষ্ক্রিয় করা হয়েছে।',
      webhookFired: false,
    };
  }

  // HARD TENANT ISOLATION RULE 2: Device owner must strictly match session merchant accountId
  if (
    device &&
    device.accountId &&
    session.accountId &&
    String(device.accountId) !== String(session.accountId)
  ) {
    return {
      ok: false,
      httpStatus: 403,
      failureCode: 'tenant_mismatch',
      failureReason: 'অন্য মার্চেন্টের অ্যাপ দিয়ে এই স্টোরের পেমেন্ট যাচাই করা নিষিদ্ধ।',
      webhookFired: false,
    };
  }

  // HARD TENANT ISOLATION RULE 3: SMS accountId (when present) must strictly match session accountId
  if (
    sms.accountId &&
    session.accountId &&
    String(sms.accountId) !== String(session.accountId)
  ) {
    return {
      ok: false,
      httpStatus: 403,
      failureCode: 'tenant_mismatch',
      failureReason: 'অন্য মার্চেন্টের অ্যাকাউন্টের SMS দিয়ে এই পেমেন্ট যাচাই করা নিষিদ্ধ।',
      webhookFired: false,
    };
  }

  // HARD TENANT ISOLATION RULE 4: If SMS carries a storeId, it must match the session storeId
  if (sms.storeId && session.storeId && String(sms.storeId) !== String(session.storeId)) {
    return {
      ok: false,
      httpStatus: 403,
      failureCode: 'store_mismatch',
      failureReason: 'ভিন্ন স্টোরের SMS দিয়ে এই সেশন যাচাই করা যাবে না।',
      webhookFired: false,
    };
  }

  // HARD TENANT ISOLATION RULE 5: If SMS includes receiverNumber, it must match the session's store receiving number
  if (sms.receiverNumber && session.number) {
    const smsRecv = normalizePhoneDigits(sms.receiverNumber);
    const sessNum = normalizePhoneDigits(session.number);
    if (smsRecv && sessNum && smsRecv !== sessNum) {
      return {
        ok: false,
        httpStatus: 403,
        failureCode: 'receiver_number_mismatch',
        failureReason: 'ভিন্ন রিসিভিং নম্বরে আসা SMS দিয়ে এই সেশন যাচাই করা যাবে না।',
        webhookFired: false,
      };
    }
  }

  // HARD RULE: Simulation can NEVER verify a real (non-test) session
  if (isSimulated && session.isTest !== true) {
    return {
      ok: false,
      httpStatus: 403,
      failureCode: 'simulation_on_real_session_forbidden',
      failureReason: 'সিমুলেটেড SMS দিয়ে আসল সেশন যাচাই করা নিষিদ্ধ।',
      webhookFired: false,
    };
  }

  // HARD RULE: Simulated TrxIDs must never collide with real TrxIDs
  if (isSimulated && !/^SIM[A-Z0-9_-]{4,60}$/.test(trxId)) {
    return {
      ok: false,
      httpStatus: 400,
      failureCode: 'invalid_simulated_trxid',
      failureReason: 'সিমুলেটেড TrxID অবশ্যই SIM উপসর্গযুক্ত হতে হবে।',
      webhookFired: false,
    };
  }

  if (usedTrxIds && usedTrxIds.has(trxId)) {
    return {
      ok: false,
      httpStatus: 409,
      failureCode: 'trxid_used',
      failureReason: 'trxid_used',
      webhookFired: false,
    };
  }

  if (session.status === 'expired' || nowMs > session.expiresAtMs) {
    return {
      ok: false,
      httpStatus: 410,
      failureCode: 'expired',
      failureReason: 'expired',
      webhookFired: false,
    };
  }

  if (sms.method !== session.method) {
    return {
      ok: false,
      httpStatus: 422,
      failureCode: 'no_sms_yet',
      failureReason: 'no_sms_yet',
      webhookFired: false,
    };
  }

  if (Math.trunc(Number(sms.amountPaisa)) !== Math.trunc(Number(session.payablePaisa))) {
    return {
      ok: false,
      httpStatus: 422,
      failureCode: 'amount_mismatch',
      failureReason: 'amount_mismatch',
      expectedAmountPaisa: session.payablePaisa,
      receivedAmountPaisa: Math.trunc(Number(sms.amountPaisa)),
      webhookFired: false,
    };
  }

  // HARD RULE: Test sessions NEVER fire production webhooks
  const shouldFireWebhook = session.isTest === true ? false : Boolean(storeWebhookUrl);
  const testResult =
    session.isTest === true ? (isSimulated ? 'verified_simulated' : 'verified') : undefined;

  return {
    ok: true,
    httpStatus: 200,
    status: 'paid',
    testResult,
    simulated: isSimulated,
    trxId,
    paidAtMs: nowMs,
    webhookFired: shouldFireWebhook,
  };
}

const WORKER_WALLET_METHODS = ['bkash', 'nagad', 'rocket', 'upay'];

/**
 * Pure store checkout payload builder shared by Worker GET /session/{id}/status.
 * Strictly enforces store.numberEnabled[method] === true AND at least one active saved number
 * in canonical store.paymentAccounts (with legacy fallback only when array missing).
 */
export function buildWorkerStoreCheckoutPayload(store) {
  const numberEnabled = (store && store.numberEnabled) || {};
  const paymentAccounts = (store && store.paymentAccounts) || {};
  const legacyNumbers = (store && store.numbers) || {};

  const enabledMethods = [];
  const methodNumbers = {};

  for (const method of WORKER_WALLET_METHODS) {
    if (numberEnabled[method] !== true) continue;
    const rawList = Array.isArray(paymentAccounts[method]) ? paymentAccounts[method] : null;
    let chosen = null;

    if (rawList) {
      const activeEntries = rawList.filter(
        (entry) => entry && entry.active !== false && String(entry.number || '').trim().length > 0
      );
      if (activeEntries.length > 0) {
        const first = activeEntries[0];
        const type = first.type === 'agent' ? 'agent' : 'personal';
        chosen = {
          number: String(first.number).trim(),
          type,
          actionType:
            first.actionType || (type === 'agent' ? 'cash_out' : 'send_money'),
          ...(first.customInstruction ? { customInstruction: String(first.customInstruction) } : {}),
          accountCount: activeEntries.length,
        };
      }
    } else if (String(legacyNumbers[method] || '').trim()) {
      chosen = {
        number: String(legacyNumbers[method]).trim(),
        type: 'personal',
        actionType: 'send_money',
        accountCount: 1,
      };
    }

    if (chosen) {
      enabledMethods.push(method);
      methodNumbers[method] = chosen;
    }
  }

  return { enabledMethods, methodNumbers };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-store-key, x-device-key',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'payverify-bd-multi-tenant-worker' });
    }

    // Public status endpoint used by /pay/:sessionId (polled every 3s)
    // Computes enabledMethods & methodNumbers via buildWorkerStoreCheckoutPayload(store)
    // so OFF methods are completely excluded from the customer storefront response.
    // Returns: { status, method, number, payablePaisa, expiresAt, trxId, storeName, enabledMethods, methodNumbers, isTest, testType, testResult, simulated, failureReason, webhookFired, ... }
    const statusMatch = url.pathname.match(/^\/session\/([a-zA-Z0-9_-]{1,128})\/status$/);
    if (request.method === 'GET' && statusMatch) {
      return json(
        {
          error: 'Configure Firestore Service Account credentials in Worker env to serve live multi-tenant paySessions.',
          sessionId: statusMatch[1],
        },
        501
      );
    }

    // Session creation endpoint:
    // - Production sessions require x-store-key and obey dailySessionCap.
    // - Test sessions (isTest: true, testType: 'real' | 'simulation') accept Authorization: Bearer <idToken> or x-store-key,
    //   use 15-minute expiry (TEST_SESSION_TTL_MS), and NEVER consume plan dailySessionCap quota.
    if (request.method === 'POST' && url.pathname === '/session/create') {
      const storeKey = request.headers.get('x-store-key') || '';
      const authHeader = request.headers.get('Authorization') || '';
      const body = await request.json().catch(() => ({}));
      const isTest = Boolean(body.isTest);

      if (isTest) {
        if (!storeKey && !authHeader.startsWith('Bearer ')) {
          return json({ error: 'Unauthorized test session creation' }, 401);
        }
        return json(
          {
            error: 'Deploy full matching Worker with Firestore Service Account to persist test sessions server-side.',
            contract: {
              storeId: body.storeId,
              method: body.method,
              amountPaisa: body.amountPaisa,
              isTest: true,
              testType: body.testType === 'simulation' ? 'simulation' : 'real',
              ttlMs: TEST_SESSION_TTL_MS,
              consumesQuota: false,
              webhookSuppressed: true,
            },
          },
          501
        );
      }

      if (!storeKey) {
        return json({ error: 'Missing x-store-key header' }, 401);
      }
      return json(
        { error: 'Deploy full matching Worker to create tenant-scoped paySessions documents.' },
        501
      );
    }

    // SMS ingest endpoint (Android forwarder OR authenticated owner simulation)
    if (request.method === 'POST' && url.pathname === '/sms/ingest') {
      const deviceKey = request.headers.get('x-device-key') || '';
      const authHeader = request.headers.get('Authorization') || '';
      const body = await request.json().catch(() => ({}));
      const isSimulated = Boolean(body.simulated);

      if (isSimulated) {
        // Hard Rule: simulated: true accepted ONLY from authenticated owner or paired device
        if (!deviceKey && !authHeader.startsWith('Bearer ')) {
          return json({ error: 'Simulated SMS requires owner auth or paired x-device-key' }, 401);
        }
        // When deployed with Firestore REST access, Worker fetches paySessions/{sessionId},
        // checks account ownership, enforces session.isTest === true via evaluateWorkerSmsMatch(),
        // skips store.webhookUrl, records paySms (simulated: true), and sets testResult = 'verified_simulated'.
        return json(
          { error: 'Deploy full matching Worker with Firestore Service Account to process simulated ingest server-side.' },
          501
        );
      }

      if (!deviceKey) {
        return json({ error: 'Missing x-device-key header' }, 401);
      }
      return json(
        { error: 'Deploy full matching Worker to ingest real device SMS into paySms.' },
        501
      );
    }

    return json({ error: 'Not found' }, 404);
  },
};
