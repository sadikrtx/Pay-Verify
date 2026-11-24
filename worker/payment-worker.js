/**
 * PayVerify BD — Reference Cloudflare Worker Contract (Prompt A1 Multi-Tenant aligned)
 *
 * Matching and SMS ingestion run inside this separate Cloudflare Worker, never in the web app.
 * Public customer page calls: GET  {workerBaseUrl}/session/{sessionId}/status
 * Store / Website calls:      POST {workerBaseUrl}/session/create  (Header: x-store-key)
 * Android SMS Forwarder:      POST {workerBaseUrl}/sms/ingest      (Header: x-device-key)
 *
 * Multi-tenant Firestore Collections:
 * - payPlatform/config
 * - payAccounts/{accountId}
 * - payStores/{storeId}
 * - payActivity/{entryId}
 * - paySessions/{sessionId}  (carries accountId, storeId, successUrl?, failUrl?)
 * - paySms/{smsId}           (carries accountId, matched, matchResult)
 * - usedTrxIds/{trxId}       (strictly Worker-only; zero client access)
 * - payDevices/{deviceId}    (carries accountId, lastSeenAt updated on every contact)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-store-key, x-device-key',
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
    // Returns: { status, method, number, payablePaisa, expiresAt, trxId, storeName, logoUrl, accentColor, successUrl, failUrl }
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

    // Store session creation endpoint (accepts legacy store key or per-store SHA-256 keyHash)
    if (request.method === 'POST' && url.pathname === '/session/create') {
      const storeKey = request.headers.get('x-store-key') || '';
      if (!storeKey) {
        return json({ error: 'Missing x-store-key header' }, 401);
      }
      return json(
        { error: 'Deploy full matching Worker to create tenant-scoped paySessions documents.' },
        501
      );
    }

    return json({ error: 'Not found' }, 404);
  },
};
