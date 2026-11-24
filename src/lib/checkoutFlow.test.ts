import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMerchantReturnUrl,
  formatBanglaTaka,
  getStoreInitials,
  isValidLogoDataUrl,
  mapFailureReasonBn,
  normalizePaymentAccounts,
  resolveSessionCheckoutOptions,
  resolveStoreCheckoutOptions,
  syncLegacyNumbersFromAccounts,
  validateSenderPhone,
  validateTrxId,
} from './checkoutFlow.ts';
import type { PayStoreDoc, WorkerSessionStatusResponse } from '../types/payment.ts';

describe('checkoutFlow pure logic', () => {
  it('formats exact Bangla Taka with and without paisa', () => {
    assert.equal(formatBanglaTaka(125000), '৳১,২৫০');
    assert.equal(formatBanglaTaka(125037), '৳১,২৫০.৩৭');
    assert.equal(formatBanglaTaka(50005), '৳৫০০.০৫');
  });

  it('validates Transaction ID cleanly and normalizes uppercase', () => {
    const ok = validateTrxId('  ab9k3m2p1q  ');
    assert.equal(ok.valid, true);
    assert.equal(ok.normalized, 'AB9K3M2P1Q');
    assert.equal(ok.errorBn, null);

    const tooShort = validateTrxId('AB12');
    assert.equal(tooShort.valid, false);
    assert.ok(tooShort.errorBn);

    const badChars = validateTrxId('TRX@12345!');
    assert.equal(badChars.valid, false);
  });

  it('validates BD sender phone numbers and rejects invalid ones', () => {
    assert.equal(validateSenderPhone('01712345678').valid, true);
    assert.equal(validateSenderPhone('+8801812345678').normalized, '01812345678');
    assert.equal(validateSenderPhone('01712-345678').normalized, '01712345678');
    assert.equal(validateSenderPhone('12345').valid, false);
    assert.equal(validateSenderPhone('').valid, false);
  });

  it('normalizes multi-number paymentAccounts with legacy fallback and deduplication', () => {
    const accounts = normalizePaymentAccounts(
      {
        bkash: [
          { number: '+8801711000001', type: 'personal', active: true },
          { number: '01711000001', type: 'agent', active: true }, // duplicate ignored
          { number: '01711000002', type: 'agent', active: true },
        ],
        nagad: [],
        rocket: [{ number: '01811000003', type: 'agent', active: true }],
      },
      { bkash: '01799999999', nagad: '01911000004', rocket: '', upay: '' }
    );

    assert.equal(accounts.bkash.length, 2);
    assert.equal(accounts.bkash[0].number, '01711000001');
    assert.equal(accounts.bkash[1].type, 'agent');
    assert.equal(accounts.nagad.length, 1);
    assert.equal(accounts.nagad[0].number, '01911000004');
    assert.equal(accounts.rocket[0].type, 'agent');

    const legacy = syncLegacyNumbersFromAccounts(accounts, '01600000000');
    assert.equal(legacy.bkash, '01711000001');
    assert.equal(legacy.nagad, '01911000004');
    assert.equal(legacy.rocket, '01811000003');
    assert.equal(legacy.upay, '01600000000');
  });

  it('filters out disabled methods in resolveStoreCheckoutOptions', () => {
    const store = {
      numberEnabled: { bkash: true, nagad: false, rocket: true, upay: false },
      numbers: { bkash: '01711000001', nagad: '01811000002', rocket: '01911000003', upay: '' },
      paymentAccounts: {
        bkash: [{ number: '01711000001', type: 'personal', active: true }],
        nagad: [{ number: '01811000002', type: 'agent', active: true }],
        rocket: [{ number: '01911000003', type: 'agent', active: true }],
      },
    } as Pick<PayStoreDoc, 'numberEnabled' | 'numbers' | 'paymentAccounts'>;

    const options = resolveStoreCheckoutOptions(store);
    assert.deepEqual(
      options.map((o) => o.method),
      ['bkash', 'rocket']
    );
    assert.equal(options[1].type, 'agent');
  });

  it('resolves session checkout options strictly from session payload without inventing methods', () => {
    const multiSession: WorkerSessionStatusResponse = {
      status: 'waiting',
      method: 'bkash',
      number: '01711000001',
      payablePaisa: 120000,
      expiresAt: Date.now() + 600_000,
      trxId: null,
      storeName: 'কেনাএক্স',
      enabledMethods: ['bkash', 'rocket'],
      methodNumbers: {
        bkash: { number: '01711000001', type: 'personal' },
        nagad: { number: '01811000002', type: 'agent' },
        rocket: { number: '01911000003', type: 'agent' },
      },
    };
    const resolved = resolveSessionCheckoutOptions(multiSession);
    assert.deepEqual(
      resolved.map((o) => o.method),
      ['bkash', 'rocket']
    );
  });

  it('builds safe merchant return URLs with status parameters and blocks javascript: URLs', () => {
    const paidUrl = buildMerchantReturnUrl('https://shop.example.com/checkout/callback?ref=1', {
      status: 'paid',
      sessionId: 'sess_100',
      orderId: 'ORD-55',
      trxId: 'TRX998877',
      method: 'bkash',
    });
    assert.ok(paidUrl);
    const parsed = new URL(paidUrl!);
    assert.equal(parsed.searchParams.get('ref'), '1');
    assert.equal(parsed.searchParams.get('status'), 'paid');
    assert.equal(parsed.searchParams.get('orderId'), 'ORD-55');
    assert.equal(parsed.searchParams.get('trxId'), 'TRX998877');

    assert.equal(
      buildMerchantReturnUrl('javascript:alert(1)', { status: 'failed', sessionId: 's1' }),
      null
    );
  });

  it('maps failure reasons to clear Bangla explanations and validates logo data URLs', () => {
    assert.match(mapFailureReasonBn('duplicate_trxid').headline, /আগেই ব্যবহার/);
    assert.match(mapFailureReasonBn('amount_mismatch').headline, /টাকার পরিমাণ/);
    assert.equal(getStoreInitials('কেনাএক্স', 'KenaX BD'), 'KB');
    assert.equal(isValidLogoDataUrl('data:image/png;base64,iVBORw0KGgo='), true);
    assert.equal(isValidLogoDataUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  });
});
