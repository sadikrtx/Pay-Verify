import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTestHistoryEntries,
  evaluateSmsAgainstSession,
  formatTestFailureReasonBn,
  generateFreshSimTrxId,
  generateSampleWalletSms,
  getStoreEnabledMethodOptions,
  isSimulatedTrxId,
  TEST_SESSION_TTL_MS,
} from './testVerification';
import { evaluateWorkerSmsMatch } from '../../worker/payment-worker.js';
import type { PaySessionDoc, PayStoreDoc } from '../types/payment';

const NOW = new Date('2026-11-24T12:00:00Z').getTime();

function makeStore(): PayStoreDoc {
  return {
    id: 'store_1',
    accountId: 'acc_1',
    name: 'স্বপ্ন শপ',
    nameEn: 'Shopno Shop',
    type: 'customer',
    numbers: {
      bkash: '01711223344',
      nagad: '01811223344',
      rocket: '',
      upay: '01611223344',
    },
    numberEnabled: {
      bkash: true,
      nagad: true,
      rocket: false,
      upay: true,
    },
    paymentAccounts: {
      bkash: [{ number: '01711223344', type: 'personal', actionType: 'send_money', active: true }],
      nagad: [{ number: '01811223344', type: 'agent', actionType: 'cash_out', active: true }],
      rocket: [],
    },
    uniquePaisa: false,
    sessionMinutes: 15,
    storeKeyHash: 'a'.repeat(64),
    webhookUrl: 'https://shopno.example.com/webhook',
    webhookSecretSet: true,
    lastWebhook: null,
    logoUrl: '',
    accentColor: '#0F766E',
    memberRoles: {},
    memberEmails: {},
    memberUids: [],
    createdAtMs: NOW - 10_000,
  };
}

function makeTestSession(overrides: Partial<PaySessionDoc> = {}): PaySessionDoc {
  return {
    id: 'test_sess_1',
    accountId: 'acc_1',
    storeId: 'store_1',
    orderId: 'TEST-1001',
    method: 'bkash',
    number: '01711223344',
    amountPaisa: 1000,
    payablePaisa: 1000,
    status: 'waiting',
    trxId: null,
    sender: null,
    createdAtMs: NOW,
    expiresAtMs: NOW + TEST_SESSION_TTL_MS,
    paidAtMs: null,
    source: 'kenax',
    isTest: true,
    testType: 'real',
    testResult: 'pending',
    webhookFired: false,
    ...overrides,
  };
}

test('getStoreEnabledMethodOptions returns ONLY methods switched ON with valid numbers', () => {
  const opts = getStoreEnabledMethodOptions(makeStore());
  assert.deepEqual(opts, [
    { method: 'bkash', number: '01711223344' },
    { method: 'nagad', number: '01811223344' },
    { method: 'upay', number: '01611223344' },
  ]);
});

test('HARD SAFETY RULE: simulated SMS can NEVER verify a real (non-test) session', () => {
  const realSession = makeTestSession({
    id: 'real_sess_1',
    orderId: 'ORD-999',
    isTest: false,
    testType: undefined,
    testResult: undefined,
  });

  const outcome = evaluateSmsAgainstSession({
    session: realSession,
    sms: {
      method: 'bkash',
      amountPaisa: 1000,
      sender: '01711009988',
      trxId: 'SIMABC12345',
      simulated: true,
    },
    nowMs: NOW + 5000,
    webhookUrl: 'https://shopno.example.com/webhook',
  });

  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.rejectedForbidden, true);
    assert.equal(outcome.failureCode, 'simulation_on_real_session_forbidden');
    assert.equal(outcome.webhookFired, false);
  }

  // Worker pure guard parity check
  const workerRes = evaluateWorkerSmsMatch({
    session: realSession,
    sms: {
      method: 'bkash',
      amountPaisa: 1000,
      sender: '01711009988',
      trxId: 'SIMABC12345',
      simulated: true,
    },
    usedTrxIds: new Set(),
    storeWebhookUrl: 'https://shopno.example.com/webhook',
    nowMs: NOW + 5000,
  });
  assert.equal(workerRes.ok, false);
  assert.equal(workerRes.httpStatus, 403);
  assert.equal(workerRes.webhookFired, false);
});

test('TRACED SCENARIO 1: bKash real-SMS test reaches verified with webhook strictly NOT fired', () => {
  const bkashRealTest = makeTestSession({
    id: 'test_bkash_real',
    method: 'bkash',
    payablePaisa: 1000,
    isTest: true,
    testType: 'real',
  });

  const clientMatch = evaluateSmsAgainstSession({
    session: bkashRealTest,
    sms: {
      method: 'bkash',
      amountPaisa: 1000,
      sender: '01711998877',
      trxId: 'BKA9Z8Y7X6',
      simulated: false,
    },
    nowMs: NOW + 30_000,
    webhookUrl: 'https://shopno.example.com/webhook',
  });

  assert.equal(clientMatch.ok, true);
  if (clientMatch.ok) {
    assert.equal(clientMatch.status, 'paid');
    assert.equal(clientMatch.testResult, 'verified');
    assert.equal(clientMatch.simulated, false);
    assert.equal(clientMatch.webhookFired, false);
  }

  const workerMatch = evaluateWorkerSmsMatch({
    session: bkashRealTest,
    sms: {
      method: 'bkash',
      amountPaisa: 1000,
      sender: '01711998877',
      trxId: 'BKA9Z8Y7X6',
      simulated: false,
    },
    usedTrxIds: new Set(),
    storeWebhookUrl: 'https://shopno.example.com/webhook',
    nowMs: NOW + 30_000,
  });

  assert.equal(workerMatch.ok, true);
  assert.equal(workerMatch.testResult, 'verified');
  assert.equal(workerMatch.webhookFired, false);
});

test('TRACED SCENARIO 2: Nagad simulation test reaches verified_simulated with SIM TrxID and webhook strictly NOT fired', () => {
  const nagadSimTest = makeTestSession({
    id: 'test_nagad_sim',
    method: 'nagad',
    number: '01811223344',
    payablePaisa: 2500, // ৳25
    isTest: true,
    testType: 'simulation',
  });

  const existingTrx = new Set(['SIMOLD1234', 'NGD998877']);
  const sampleSms = generateSampleWalletSms({
    method: 'nagad',
    amountPaisa: 2500,
    receiverNumber: '01811223344',
    existingTrxIds: existingTrx,
    timestampMs: NOW + 2000,
  });

  assert.equal(sampleSms.simulated, true);
  assert.equal(sampleSms.smsSenderAddress, 'Nagad');
  assert.equal(isSimulatedTrxId(sampleSms.trxId), true);
  assert.ok(!existingTrx.has(sampleSms.trxId));
  assert.match(sampleSms.raw, /Tk 25\.00/);
  assert.ok(sampleSms.raw.includes(sampleSms.trxId));

  const clientMatch = evaluateSmsAgainstSession({
    session: nagadSimTest,
    sms: {
      method: sampleSms.method,
      amountPaisa: sampleSms.amountPaisa,
      sender: sampleSms.customerPhone,
      trxId: sampleSms.trxId,
      simulated: true,
    },
    usedTrxIds: existingTrx,
    nowMs: NOW + 3000,
    webhookUrl: 'https://shopno.example.com/webhook',
  });

  assert.equal(clientMatch.ok, true);
  if (clientMatch.ok) {
    assert.equal(clientMatch.status, 'paid');
    assert.equal(clientMatch.testResult, 'verified_simulated');
    assert.equal(clientMatch.simulated, true);
    assert.equal(clientMatch.webhookFired, false);
  }

  const workerMatch = evaluateWorkerSmsMatch({
    session: nagadSimTest,
    sms: {
      method: sampleSms.method,
      amountPaisa: sampleSms.amountPaisa,
      sender: sampleSms.customerPhone,
      trxId: sampleSms.trxId,
      simulated: true,
    },
    usedTrxIds: existingTrx,
    storeWebhookUrl: 'https://shopno.example.com/webhook',
    nowMs: NOW + 3000,
  });

  assert.equal(workerMatch.ok, true);
  assert.equal(workerMatch.testResult, 'verified_simulated');
  assert.equal(workerMatch.webhookFired, false);
});

test('Failure reasons return exact Bangla messages including amount_mismatch expected vs received, expired, trxid_used, no_sms_yet', () => {
  const mismatch = formatTestFailureReasonBn('amount_mismatch', 1000, 950);
  assert.ok(mismatch.includes('৳10'));
  assert.ok(mismatch.includes('৳9.50'));

  assert.match(formatTestFailureReasonBn('expired'), /১৫ মিনিট/);
  assert.match(formatTestFailureReasonBn('trxid_used'), /আগেই ব্যবহার/);
  assert.match(formatTestFailureReasonBn('no_sms_yet'), /ম্যাচিং SMS আসেনি/);

  // 15-minute expiry check in matcher
  const expiredTest = makeTestSession({ expiresAtMs: NOW + TEST_SESSION_TTL_MS });
  const expOutcome = evaluateSmsAgainstSession({
    session: expiredTest,
    sms: {
      method: 'bkash',
      amountPaisa: 1000,
      sender: '01711009988',
      trxId: 'SIMFRESH12',
      simulated: true,
    },
    nowMs: NOW + TEST_SESSION_TTL_MS + 1000,
  });
  assert.equal(expOutcome.ok, false);
  if (!expOutcome.ok) {
    assert.equal(expOutcome.failureCode, 'expired');
  }

  // Duplicate TrxID check in matcher
  const dupOutcome = evaluateSmsAgainstSession({
    session: expiredTest,
    sms: {
      method: 'bkash',
      amountPaisa: 1000,
      sender: '01711009988',
      trxId: 'SIMUSED999',
      simulated: true,
    },
    usedTrxIds: new Set(['SIMUSED999']),
    nowMs: NOW + 1000,
  });
  assert.equal(dupOutcome.ok, false);
  if (!dupOutcome.ok) {
    assert.equal(dupOutcome.failureCode, 'trxid_used');
  }

  // Fresh SIM TrxID collision avoidance
  const fresh = generateFreshSimTrxId(['SIMAAAAAAAA', 'SIMBBBBBBBB']);
  assert.equal(isSimulatedTrxId(fresh), true);
});

test('buildTestHistoryEntries returns at most last 10 test sessions and respects clearedBeforeMs', () => {
  const store = makeStore();
  const sessions: PaySessionDoc[] = [
    // Real session should NEVER appear in test history
    makeTestSession({
      id: 'real_ignore',
      isTest: false,
      createdAtMs: NOW + 99_000,
    }),
  ];
  for (let i = 0; i < 12; i++) {
    sessions.push(
      makeTestSession({
        id: `t_${i}`,
        orderId: `TEST-${i}`,
        createdAtMs: NOW + i * 1000,
        status: i % 2 === 0 ? 'paid' : 'waiting',
        testResult: i % 2 === 0 ? 'verified_simulated' : 'pending',
      })
    );
  }

  const last10 = buildTestHistoryEntries(sessions, [store], NOW + 20_000, 0);
  assert.equal(last10.length, 10);
  assert.equal(last10[0].sessionId, 't_11');
  assert.equal(last10[9].sessionId, 't_2');

  const cleared = buildTestHistoryEntries(sessions, [store], NOW + 20_000, NOW + 10_000);
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].sessionId, 't_11');
});
