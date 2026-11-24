import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardMetrics,
  computeLast7DaysPaid,
  formatBdt,
  formatCopyAmount,
  formatCountdown,
  hasFractionalPaisa,
  normalizeBdPhone,
  takaToPaisa,
} from './money';
import type { PaySessionDoc, PaySmsDoc } from '../types/payment';

test('integer-paisa conversions and Bengali-style ৳ grouping are exact', () => {
  assert.equal(takaToPaisa('1250'), 125_000);
  assert.equal(takaToPaisa('1,25,000.37'), 12_500_037);
  assert.equal(takaToPaisa('0'), null);
  assert.equal(takaToPaisa('-10'), null);
  assert.equal(takaToPaisa('10.123'), null);

  assert.equal(formatBdt(12_500_037), '৳1,25,000.37');
  assert.equal(formatBdt(125_000), '৳1,250');
  assert.equal(formatBdt(125_000, { alwaysDecimals: true }), '৳1,250.00');
  assert.equal(formatCopyAmount(125_037), '1250.37');
  assert.equal(formatCopyAmount(125_000), '1250');
  assert.equal(hasFractionalPaisa(125_037), true);
  assert.equal(hasFractionalPaisa(125_000), false);
  assert.equal(formatCountdown(90_000), '01:30');
  assert.equal(formatCountdown(0), '00:00');
});

test('BD phone normalization validates 11-digit numbers and +88 prefix', () => {
  assert.equal(normalizeBdPhone('+8801711223344'), '01711223344');
  assert.equal(normalizeBdPhone('01819-887766'), '01819887766');
  assert.equal(normalizeBdPhone('01211223344'), null);
  assert.equal(normalizeBdPhone('12345'), null);
});

test('Overview metrics and 7-day bar chart aggregate real Firestore records accurately', () => {
  const now = new Date('2026-11-23T14:00:00').getTime();
  const yesterday = new Date('2026-11-22T12:00:00').getTime();

  const sessions: PaySessionDoc[] = [
    {
      id: 's1',
      accountId: 'acc_1',
      storeId: 'store_1',
      orderId: 'KB-1',
      method: 'bkash',
      number: '01711223344',
      amountPaisa: 100_000,
      payablePaisa: 100_005,
      status: 'paid',
      trxId: 'TRX1',
      sender: '01700000001',
      createdAtMs: now - 3600_000,
      expiresAtMs: now - 2700_000,
      paidAtMs: now - 3000_000,
      source: 'kenax',
    },
    {
      id: 's2',
      accountId: 'acc_1',
      storeId: 'store_1',
      orderId: 'KB-2',
      method: 'nagad',
      number: '01811223344',
      amountPaisa: 50_000,
      payablePaisa: 50_000,
      status: 'paid',
      trxId: 'TRX2',
      sender: '01800000001',
      createdAtMs: yesterday,
      expiresAtMs: yesterday + 900_000,
      paidAtMs: yesterday + 60_000,
      source: 'kenax',
    },
    {
      id: 's3',
      accountId: 'acc_1',
      storeId: 'store_1',
      orderId: 'KB-3',
      method: 'rocket',
      number: '01911223344',
      amountPaisa: 75_000,
      payablePaisa: 75_000,
      status: 'waiting',
      trxId: null,
      sender: null,
      createdAtMs: now - 60_000,
      expiresAtMs: now + 840_000,
      paidAtMs: null,
      source: 'manual',
    },
  ];

  const sms: PaySmsDoc[] = [
    {
      id: 'm1',
      accountId: 'acc_1',
      method: 'bkash',
      amountPaisa: 40_000,
      sender: '01799999999',
      trxId: 'UNMATCH1',
      smsTimeMs: now,
      receivedAtMs: now,
      raw: 'Tk 400 received',
      matched: false,
      matchResult: 'unmatched',
      sessionId: null,
    },
  ];

  const metrics = computeDashboardMetrics(sessions, sms, now);
  assert.equal(metrics.todayTotalPaisa, 100_005);
  assert.equal(metrics.todayMatchedCount, 1);
  assert.equal(metrics.waitingCount, 1);
  assert.equal(metrics.unmatchedSmsCount, 1);

  const days = computeLast7DaysPaid(sessions, now);
  assert.equal(days.length, 7);
  assert.equal(days[6].totalPaisa, 100_005);
  assert.equal(days[5].totalPaisa, 50_000);
  assert.equal(days[0].totalPaisa, 0);
});

test('Test sessions (isTest: true) and simulated SMS NEVER count in revenue, paid counts, or 7-day charts', () => {
  const now = new Date('2026-11-23T14:00:00').getTime();
  const sessions: PaySessionDoc[] = [
    {
      id: 'test_paid_1',
      accountId: 'acc_1',
      storeId: 'store_1',
      orderId: 'TEST-1',
      method: 'bkash',
      number: '01711223344',
      amountPaisa: 500_000,
      payablePaisa: 500_000,
      status: 'paid',
      trxId: 'SIMABC123',
      sender: '01711009988',
      createdAtMs: now - 10_000,
      expiresAtMs: now + 890_000,
      paidAtMs: now - 5_000,
      source: 'kenax',
      isTest: true,
      testType: 'simulation',
      testResult: 'verified_simulated',
      simulated: true,
      webhookFired: false,
    },
  ];
  const simSms: PaySmsDoc[] = [
    {
      id: 'sim_sms_1',
      accountId: 'acc_1',
      method: 'bkash',
      amountPaisa: 500_000,
      sender: '01711009988',
      trxId: 'SIMABC123',
      smsTimeMs: now,
      receivedAtMs: now,
      raw: 'Simulated SMS',
      matched: false,
      matchResult: 'unmatched',
      sessionId: 'test_paid_1',
      simulated: true,
    },
  ];

  const metrics = computeDashboardMetrics(sessions, simSms, now);
  assert.equal(metrics.todayTotalPaisa, 0);
  assert.equal(metrics.todayMatchedCount, 0);
  assert.equal(metrics.unmatchedSmsCount, 0);

  const days = computeLast7DaysPaid(sessions, now);
  assert.equal(days.reduce((sum, d) => sum + d.totalPaisa, 0), 0);
});

