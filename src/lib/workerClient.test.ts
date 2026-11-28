import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeviceQrPayload,
  createWorkerSession,
  fetchPublicSubscriptionStatus,
  fetchSessionStatus,
  normalizeWorkerBaseUrl,
  recoverSubscriptionPurchase,
  submitSessionVerification,
} from './workerClient';
import { generateDeviceKey, generateRotatedRevokedHash, sha256Hex } from './crypto';

test('normalizeWorkerBaseUrl strips trailing slashes and blocks unsafe schemes', () => {
  assert.equal(
    normalizeWorkerBaseUrl('https://payverify.workers.dev///'),
    'https://payverify.workers.dev'
  );
  assert.throws(() => normalizeWorkerBaseUrl('javascript:alert(1)'));
});

test('fetchSessionStatus calls GET {workerBaseUrl}/session/{sessionId}/status cleanly', async () => {
  let calledUrl = '';
  const mockFetch = (async (url: string | URL | Request) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify({
        status: 'waiting',
        method: 'bkash',
        number: '01711223344',
        payablePaisa: 125_037,
        expiresAt: 1_760_000_900_000,
        trxId: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const status = await fetchSessionStatus('https://w.example.com/', 'ps_abc123', mockFetch);
  assert.equal(calledUrl, 'https://w.example.com/session/ps_abc123/status');
  assert.equal(status.status, 'waiting');
  assert.equal(status.method, 'bkash');
  assert.equal(status.payablePaisa, 125_037);
  assert.equal(status.trxId, null);
});

test('createWorkerSession sends x-store-key header and exact integer amountPaisa', async () => {
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: Record<string, unknown> = {};

  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(
      JSON.stringify({
        sessionId: 'ps_new99',
        payablePaisa: 50_003,
        number: '01819887766',
        expiresAt: 1_760_000_900_000,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const res = await createWorkerSession(
    'https://w.example.com',
    'secret_store_key_123',
    { orderId: 'KB-77', amountPaisa: 50_000, method: 'nagad' },
    mockFetch
  );

  assert.equal(capturedHeaders['x-store-key'], 'secret_store_key_123');
  assert.equal(capturedBody.orderId, 'KB-77');
  assert.equal(capturedBody.amountPaisa, 50_000);
  assert.equal(capturedBody.method, 'nagad');
  assert.equal(res.sessionId, 'ps_new99');
  assert.equal(res.payablePaisa, 50_003);
});

test('device key generation, QR payload, and revocation rotation produce valid 64-char SHA-256 digests', async () => {
  const { rawKey, keyHash } = await generateDeviceKey();
  assert.equal(keyHash.length, 64);
  assert.equal(await sha256Hex(rawKey), keyHash);

  const rotated = await generateRotatedRevokedHash();
  assert.equal(rotated.length, 64);
  assert.notEqual(rotated, keyHash);

  const qr = JSON.parse(buildDeviceQrPayload('https://w.example.com/', rawKey));
  assert.deepEqual(qr, { workerBaseUrl: 'https://w.example.com', deviceKey: rawKey });
});

test('submitSessionVerification preserves failureReason on both 200 and non-2xx responses', async () => {
  const mockFetch200 = (async () =>
    new Response(JSON.stringify({ status: 'failed', failureReason: 'trxid_used' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  const res200 = await submitSessionVerification(
    'https://w.example.com',
    'ps_123',
    { method: 'bkash', trxId: 'USED123456', sender: '01711223344' },
    mockFetch200
  );
  assert.equal(res200.supported, true);
  assert.equal(res200.status, 'failed');
  assert.equal(res200.failureReason, 'trxid_used');

  const mockFetch409 = (async () =>
    new Response(JSON.stringify({ status: 'failed', failureReason: 'trxid_used' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  const res409 = await submitSessionVerification(
    'https://w.example.com',
    'ps_123',
    { method: 'bkash', trxId: 'USED123456', sender: '01711223344' },
    mockFetch409
  );
  assert.equal(res409.supported, true);
  assert.equal(res409.status, 'failed');
  assert.equal(res409.failureReason, 'trxid_used');
});

test('fetchPublicSubscriptionStatus preserves failureReason and optional expected/received amounts', async () => {
  const mockFetchUsed = (async () =>
    new Response(JSON.stringify({ status: 'failed', failureReason: 'trxid_used' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  const used = await fetchPublicSubscriptionStatus(
    'https://w.example.com',
    'pur_1',
    'ps_1',
    mockFetchUsed
  );
  assert.equal(used.status, 'failed');
  assert.equal(used.failureReason, 'trxid_used');

  const mockFetchMismatch = (async () =>
    new Response(
      JSON.stringify({
        status: 'failed',
        failureReason: 'amount_mismatch',
        expectedAmountPaisa: 99_900,
        receivedAmountPaisa: 50_000,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  const mismatch = await fetchPublicSubscriptionStatus(
    'https://w.example.com',
    'pur_2',
    'ps_2',
    mockFetchMismatch
  );
  assert.equal(mismatch.status, 'failed');
  assert.equal(mismatch.failureReason, 'amount_mismatch');
  assert.equal(mismatch.expectedAmountPaisa, 99_900);
  assert.equal(mismatch.receivedAmountPaisa, 50_000);
});

test('recoverSubscriptionPurchase posts normalized { phone, trxId } to /subscription/recover and returns claim context', async () => {
  let calledUrl = '';
  let capturedBody: Record<string, unknown> = {};
  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calledUrl = String(url);
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(
      JSON.stringify({
        ok: true,
        purchaseId: 'pur_rec_101',
        claimToken: 'tok_rotated_claim_9876543210',
        planName: 'স্ট্যান্ডার্ড',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const res = await recoverSubscriptionPurchase(
    'https://w.example.com/',
    { phone: '+880 1712-345678', trxId: '  bka89m4k2p  ' },
    mockFetch
  );

  assert.equal(calledUrl, 'https://w.example.com/subscription/recover');
  assert.deepEqual(capturedBody, { phone: '01712345678', trxId: 'BKA89M4K2P' });
  assert.deepEqual(res, {
    ok: true,
    purchaseId: 'pur_rec_101',
    claimToken: 'tok_rotated_claim_9876543210',
    planName: 'স্ট্যান্ডার্ড',
  });
});

test('recoverSubscriptionPurchase converts Bangla digits and collapses any failure into not_found', async () => {
  let capturedBody: Record<string, unknown> = {};
  const mockNotFound = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const resNotFound = await recoverSubscriptionPurchase(
    'https://w.example.com',
    { phone: '০১৭১২৩৪৫৬৭৮', trxId: 'OLDTRX123' },
    mockNotFound
  );
  assert.deepEqual(capturedBody, { phone: '01712345678', trxId: 'OLDTRX123' });
  assert.deepEqual(resNotFound, { ok: false, error: 'not_found' });

  const resEmpty = await recoverSubscriptionPurchase(
    'https://w.example.com',
    { phone: '', trxId: 'ABC123' },
    mockNotFound
  );
  assert.deepEqual(resEmpty, { ok: false, error: 'not_found' });
});
