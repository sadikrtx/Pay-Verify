import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeviceQrPayload,
  createWorkerSession,
  fetchSessionStatus,
  normalizeWorkerBaseUrl,
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
