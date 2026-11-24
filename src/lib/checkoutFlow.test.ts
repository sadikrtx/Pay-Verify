import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActionHeadlineBn,
  buildActionStepsBn,
  buildEmptyEnabledMap,
  buildEmptyPaymentAccounts,
  buildMerchantReturnUrl,
  buildTrxIdHintBn,
  deleteMethodNumberRow,
  enforceEnabledRequiresSavedNumber,
  formatBanglaTaka,
  formatCopyableAmount,
  getStoreInitials,
  hasSavedNumberForMethod,
  isValidLogoDataUrl,
  mapFailureReasonBn,
  normalizePaymentAccounts,
  normalizePaymentActionType,
  parseCustomInstructionLines,
  resolveSessionCheckoutOptions,
  resolveStoreCheckoutOptions,
  saveMethodNumberRow,
  syncLegacyNumbersFromAccounts,
  toggleStoreMethodEnabled,
  validateSenderPhone,
  validateStoreWalletNumber,
  validateTrxId,
} from './checkoutFlow.ts';
import { buildWorkerStoreCheckoutPayload } from '../../worker/payment-worker.js';
import type { PayStoreDoc, WorkerSessionStatusResponse } from '../types/payment.ts';

describe('checkoutFlow pure logic', () => {
  it('formats exact Bangla Taka with and without paisa and copyable numeric string', () => {
    assert.equal(formatBanglaTaka(125000), '৳১,২৫০');
    assert.equal(formatBanglaTaka(125037), '৳১,২৫০.৩৭');
    assert.equal(formatBanglaTaka(50005), '৳৫০০.০৫');
    assert.equal(formatCopyableAmount(125000), '1250');
    assert.equal(formatCopyableAmount(125037), '1250.37');
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

  it('normalizes multi-number paymentAccounts with actionType migration defaults and customInstruction', () => {
    const accounts = normalizePaymentAccounts(
      {
        bkash: [
          { number: '+8801711000001', type: 'personal', active: true },
          { number: '01711000001', type: 'agent', active: true }, // duplicate ignored
          {
            number: '01711000002',
            type: 'agent',
            actionType: 'cash_in',
            customInstruction: '  দোকানে গিয়ে ক্যাশ ইন করুন\nতারপর TrxID দিন  ',
            active: true,
          },
        ],
        nagad: [],
        rocket: [{ number: '01811000003', type: 'agent', active: true }],
      },
      { bkash: '01799999999', nagad: '01911000004', rocket: '', upay: '' }
    );

    assert.equal(accounts.bkash.length, 2);
    assert.equal(accounts.bkash[0].number, '01711000001');
    assert.equal(accounts.bkash[0].actionType, 'send_money');
    assert.equal(accounts.bkash[1].type, 'agent');
    assert.equal(accounts.bkash[1].actionType, 'cash_in');
    assert.equal(
      accounts.bkash[1].customInstruction,
      'দোকানে গিয়ে ক্যাশ ইন করুন\nতারপর TrxID দিন'
    );
    assert.equal(accounts.nagad.length, 1);
    assert.equal(accounts.nagad[0].number, '01911000004');
    assert.equal(accounts.nagad[0].actionType, 'send_money');
    assert.equal(accounts.rocket[0].type, 'agent');
    assert.equal(accounts.rocket[0].actionType, 'cash_out');

    const legacy = syncLegacyNumbersFromAccounts(accounts, '01600000000');
    assert.equal(legacy.bkash, '01711000001');
    assert.equal(legacy.nagad, '01911000004');
    assert.equal(legacy.rocket, '01811000003');
    assert.equal(legacy.upay, '');
  });

  it('produces exact Bangla headlines, distinct steps with USSD dial codes, TrxID hints, and zero fee mentions', () => {
    assert.equal(buildActionHeadlineBn('send_money', '৳৫০০'), 'এই নম্বরে ৳৫০০ সেন্ড মানি করুন');
    assert.equal(buildActionHeadlineBn('cash_in', '৳৫০০'), 'এই নম্বরে ৳৫০০ ক্যাশ ইন করুন');
    assert.equal(buildActionHeadlineBn('cash_out', '৳৫০০'), 'এই নম্বরে ৳৫০০ ক্যাশ আউট করুন');
    assert.equal(buildActionHeadlineBn('payment', '৳৫০০'), 'এই নম্বরে ৳৫০০ পেমেন্ট করুন');

    const bkashSend = buildActionStepsBn('bkash', 'send_money', '৳৫০০', '01711000001');
    const nagadCashIn = buildActionStepsBn('nagad', 'cash_in', '৳৫০০', '01811000002');
    const rocketCashOut = buildActionStepsBn('rocket', 'cash_out', '৳৫০০', '01911000003');
    const upayPayment = buildActionStepsBn('upay', 'payment', '৳৫০০', '01611000004');

    assert.ok(bkashSend.join(' ').includes('*247#'));
    assert.ok(nagadCashIn.join(' ').includes('*167#'));
    assert.ok(rocketCashOut.join(' ').includes('*322#'));
    assert.ok(upayPayment.join(' ').includes('*268#'));

    const allTexts = [
      ...bkashSend,
      ...nagadCashIn,
      ...rocketCashOut,
      ...upayPayment,
      buildTrxIdHintBn('send_money'),
      buildTrxIdHintBn('cash_in'),
      buildTrxIdHintBn('cash_out'),
      buildTrxIdHintBn('payment'),
    ].join(' ');
    assert.equal(/চার্জ|ফি|charge|fee/i.test(allTexts), false);

    assert.notEqual(bkashSend.join('|'), nagadCashIn.join('|'));
    assert.notEqual(nagadCashIn.join('|'), rocketCashOut.join('|'));
    assert.notEqual(rocketCashOut.join('|'), upayPayment.join('|'));
    assert.match(buildTrxIdHintBn('cash_in'), /এজেন্ট/);
    assert.match(buildTrxIdHintBn('cash_out'), /ক্যাশ আউটের/);
  });

  it('parses custom instruction lines and defaults missing actionType cleanly', () => {
    assert.equal(normalizePaymentActionType(undefined, 'agent'), 'cash_out');
    assert.equal(normalizePaymentActionType(undefined, 'personal'), 'send_money');
    assert.equal(normalizePaymentActionType('payment', 'personal'), 'payment');
    assert.deepEqual(parseCustomInstructionLines('  প্রথম লাইন\n\nদ্বিতীয় লাইন  '), [
      'প্রথম লাইন',
      'দ্বিতীয় লাইন',
    ]);
    assert.deepEqual(parseCustomInstructionLines('   '), []);
  });

  it('filters out disabled methods in resolveStoreCheckoutOptions and preserves actionType + customInstruction', () => {
    const store = {
      numberEnabled: { bkash: true, nagad: false, rocket: true, upay: false },
      numbers: { bkash: '01711000001', nagad: '01811000002', rocket: '01911000003', upay: '' },
      paymentAccounts: {
        bkash: [
          {
            number: '01711000001',
            type: 'personal',
            actionType: 'payment',
            customInstruction: 'মার্চেন্ট পেমেন্ট অপশন থেকে পে করুন',
            active: true,
          },
        ],
        nagad: [{ number: '01811000002', type: 'agent', active: true }],
        rocket: [{ number: '01911000003', type: 'agent', active: true }],
      },
    } as Pick<PayStoreDoc, 'numberEnabled' | 'numbers' | 'paymentAccounts'>;

    const options = resolveStoreCheckoutOptions(store);
    assert.deepEqual(
      options.map((o) => o.method),
      ['bkash', 'rocket']
    );
    assert.equal(options[0].actionType, 'payment');
    assert.equal(options[0].customInstruction, 'মার্চেন্ট পেমেন্ট অপশন থেকে পে করুন');
    assert.equal(options[1].type, 'agent');
    assert.equal(options[1].actionType, 'cash_out');
  });

  it('resolves session checkout options strictly from session payload including actionType and customInstruction', () => {
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
        bkash: { number: '01711000001', type: 'personal', actionType: 'cash_in' },
        nagad: { number: '01811000002', type: 'agent' },
        rocket: { number: '01911000003', type: 'agent' },
      },
    };
    const resolved = resolveSessionCheckoutOptions(multiSession);
    assert.deepEqual(
      resolved.map((o) => o.method),
      ['bkash', 'rocket']
    );
    assert.equal(resolved[0].actionType, 'cash_in');
    assert.equal(resolved[1].actionType, 'cash_out');
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

  it('resolves Upay when explicitly included in a Worker session payload', () => {
    const upaySession: WorkerSessionStatusResponse = {
      status: 'waiting',
      method: 'upay',
      number: '01611000004',
      payablePaisa: 50000,
      expiresAt: Date.now() + 600_000,
      trxId: null,
      storeName: 'ডেমো শপ',
      enabledMethods: ['bkash', 'nagad', 'rocket', 'upay'],
      methodNumbers: {
        bkash: { number: '01711000001', type: 'personal' },
        nagad: { number: '01811000002', type: 'agent' },
        rocket: { number: '01911000003', type: 'agent' },
        upay: { number: '01611000004', type: 'personal', actionType: 'payment' },
      },
    };
    const resolved = resolveSessionCheckoutOptions(upaySession);
    assert.deepEqual(
      resolved.map((o) => o.method),
      ['bkash', 'nagad', 'rocket', 'upay']
    );
    assert.equal(resolved[3].number, '01611000004');
    assert.equal(resolved[3].actionType, 'payment');
  });

  // ─── A7 SCENARIOS (a)–(h) ─────────────────────────────────────────────────

  it('(a) unconfigured methods initialize empty & OFF and cannot be ON with 0 saved numbers', () => {
    const emptyAccounts = buildEmptyPaymentAccounts();
    const emptyEnabled = buildEmptyEnabledMap();
    assert.deepEqual(emptyAccounts, { bkash: [], nagad: [], rocket: [], upay: [] });
    assert.deepEqual(emptyEnabled, { bkash: false, nagad: false, rocket: false, upay: false });
    assert.equal(hasSavedNumberForMethod(emptyAccounts, 'bkash'), false);

    // Even if someone passes enabled: true for a method with 0 saved numbers, invariant forces OFF
    const enforced = enforceEnabledRequiresSavedNumber(
      { bkash: true, nagad: true, rocket: true, upay: true },
      emptyAccounts
    );
    assert.deepEqual(enforced, { bkash: false, nagad: false, rocket: false, upay: false });
  });

  it('(b) saving a valid number stores normalized entry and preserves OFF toggle (no silent enable)', () => {
    const emptyAccounts = buildEmptyPaymentAccounts();
    const emptyEnabled = buildEmptyEnabledMap();

    const saved = saveMethodNumberRow({
      accounts: emptyAccounts,
      enabled: emptyEnabled,
      method: 'bkash',
      rowIndex: null,
      draft: {
        number: '+8801711-223344',
        type: 'personal',
        actionType: 'send_money',
        customInstruction: '',
        active: true,
      },
    });

    assert.equal(saved.ok, true);
    assert.equal(saved.errorBn, null);
    assert.equal(saved.savedIndex, 0);
    assert.equal(saved.accounts.bkash.length, 1);
    assert.equal(saved.accounts.bkash[0].number, '01711223344');
    // Must stay OFF until merchant explicitly turns ON
    assert.equal(saved.enabled.bkash, false);
    assert.deepEqual(syncLegacyNumbersFromAccounts(saved.accounts), {
      bkash: '01711223344',
      nagad: '',
      rocket: '',
      upay: '',
    });
  });

  it('(c) invalid or duplicate numbers return Bangla error and leave saved accounts unchanged', () => {
    const existingAccounts = {
      ...buildEmptyPaymentAccounts(),
      bkash: [{ number: '01711223344', type: 'personal' as const, actionType: 'send_money' as const, active: true }],
    };

    const invalidCheck = validateStoreWalletNumber('12345', existingAccounts.bkash, null);
    assert.equal(invalidCheck.valid, false);
    assert.match(invalidCheck.errorBn || '', /১১ ডিজিটের/);

    const failedSave = saveMethodNumberRow({
      accounts: existingAccounts,
      enabled: { bkash: true, nagad: false, rocket: false, upay: false },
      method: 'bkash',
      rowIndex: null,
      draft: { number: 'abc', type: 'personal', actionType: 'send_money', active: true },
    });
    assert.equal(failedSave.ok, false);
    assert.match(failedSave.errorBn || '', /১১ ডিজিটের/);
    assert.equal(failedSave.accounts.bkash.length, 1);
    assert.equal(failedSave.accounts.bkash[0].number, '01711223344');

    const dupSave = saveMethodNumberRow({
      accounts: existingAccounts,
      enabled: { bkash: true, nagad: false, rocket: false, upay: false },
      method: 'bkash',
      rowIndex: null,
      draft: { number: '01711223344', type: 'agent', actionType: 'cash_out', active: true },
    });
    assert.equal(dupSave.ok, false);
    assert.match(dupSave.errorBn || '', /ইতিমধ্যেই সংরক্ষিত/);
  });

  it('(d) editing an existing saved row updates only that row and preserves custom metadata', () => {
    const startAccounts = {
      ...buildEmptyPaymentAccounts(),
      bkash: [
        { number: '01711223344', type: 'personal' as const, actionType: 'send_money' as const, active: true },
        { number: '01755667788', type: 'agent' as const, actionType: 'cash_out' as const, active: true },
      ],
    };

    const edited = saveMethodNumberRow({
      accounts: startAccounts,
      enabled: { bkash: true, nagad: false, rocket: false, upay: false },
      method: 'bkash',
      rowIndex: 0,
      draft: {
        number: '01799887766',
        type: 'agent',
        actionType: 'payment',
        customInstruction: 'মার্চেন্ট পেমেন্ট ব্যবহার করুন',
        active: true,
      },
    });

    assert.equal(edited.ok, true);
    assert.equal(edited.savedIndex, 0);
    assert.equal(edited.accounts.bkash[0].number, '01799887766');
    assert.equal(edited.accounts.bkash[0].actionType, 'payment');
    assert.equal(edited.accounts.bkash[0].customInstruction, 'মার্চেন্ট পেমেন্ট ব্যবহার করুন');
    assert.equal(edited.accounts.bkash[1].number, '01755667788');
  });

  it('(e) deleting the last saved number returns method to empty state and forces OFF', () => {
    const startAccounts = {
      ...buildEmptyPaymentAccounts(),
      bkash: [{ number: '01711223344', type: 'personal' as const, actionType: 'send_money' as const, active: true }],
      nagad: [{ number: '01811223344', type: 'personal' as const, actionType: 'send_money' as const, active: true }],
    };
    const startEnabled = { bkash: true, nagad: true, rocket: false, upay: false };

    const afterDelete = deleteMethodNumberRow({
      accounts: startAccounts,
      enabled: startEnabled,
      method: 'bkash',
      rowIndex: 0,
    });

    assert.equal(afterDelete.becameEmpty, true);
    assert.equal(afterDelete.accounts.bkash.length, 0);
    assert.equal(afterDelete.enabled.bkash, false);
    assert.equal(afterDelete.enabled.nagad, true);
    assert.equal(syncLegacyNumbersFromAccounts(afterDelete.accounts).bkash, '');
  });

  it('(f)+(g)+(h) Smart toggle blocks 0-number ON, preserves numbers on OFF with inline note, and strictly excludes OFF methods from storefront & Worker payload', () => {
    // 1) Toggle blocked with 0 saved numbers
    const blocked = toggleStoreMethodEnabled({
      accounts: buildEmptyPaymentAccounts(),
      enabled: buildEmptyEnabledMap(),
      method: 'bkash',
    });
    assert.equal(blocked.changed, false);
    assert.equal(blocked.blockedReasonBn, 'আগে নম্বর সংরক্ষণ করুন');
    assert.equal(blocked.enabled.bkash, false);

    // 2) Store has both bKash and Nagad saved; bKash toggled OFF, Nagad stays ON
    const storeAccounts = {
      ...buildEmptyPaymentAccounts(),
      bkash: [{ number: '01711223344', type: 'personal' as const, actionType: 'send_money' as const, active: true }],
      nagad: [{ number: '01811223344', type: 'agent' as const, actionType: 'cash_in' as const, active: true }],
    };

    const turnedOff = toggleStoreMethodEnabled({
      accounts: storeAccounts,
      enabled: { bkash: true, nagad: true, rocket: false, upay: false },
      method: 'bkash',
    });
    assert.equal(turnedOff.changed, true);
    assert.equal(turnedOff.turnedOffWithNumbers, true);
    assert.equal(turnedOff.inlineNoteBn, 'কাস্টমাররা এই মাধ্যমটি আর দেখতে পাবেন না');
    assert.equal(turnedOff.enabled.bkash, false);
    assert.equal(turnedOff.enabled.nagad, true);
    // Saved bKash number stays preserved intact in storeAccounts
    assert.equal(storeAccounts.bkash[0].number, '01711223344');

    // 3) Storefront & Worker payload strictly show ONLY Nagad (bKash completely absent)
    const storeSnapshot = {
      numberEnabled: turnedOff.enabled,
      numbers: syncLegacyNumbersFromAccounts(storeAccounts),
      paymentAccounts: storeAccounts,
    };
    const storefrontOptions = resolveStoreCheckoutOptions(storeSnapshot);
    assert.deepEqual(
      storefrontOptions.map((o) => o.method),
      ['nagad']
    );

    const workerPayload = buildWorkerStoreCheckoutPayload(storeSnapshot) as {
      enabledMethods: string[];
      methodNumbers: Record<string, { number: string; type: string; actionType?: string } | undefined>;
    };
    assert.deepEqual(workerPayload.enabledMethods, ['nagad']);
    assert.equal(workerPayload.methodNumbers.bkash, undefined);
    assert.equal(workerPayload.methodNumbers.nagad?.number, '01811223344');
    assert.equal(workerPayload.methodNumbers.nagad?.actionType, 'cash_in');

    // 4) Session resolver NEVER falls back to legacy session.method when enabledMethods excludes it or is empty
    const strictEmptySession = resolveSessionCheckoutOptions({
      status: 'waiting',
      method: 'bkash',
      number: '01711223344',
      payablePaisa: 50000,
      expiresAt: Date.now() + 600_000,
      trxId: null,
      storeName: 'ডেমো শপ',
      enabledMethods: [],
      methodNumbers: {
        bkash: { number: '01711223344', type: 'personal' },
      },
    });
    assert.deepEqual(strictEmptySession, []);

    // 5) Turning bKash back ON restores it immediately with saved number intact
    const turnedBackOn = toggleStoreMethodEnabled({
      accounts: storeAccounts,
      enabled: turnedOff.enabled,
      method: 'bkash',
    });
    assert.equal(turnedBackOn.changed, true);
    assert.equal(turnedBackOn.enabled.bkash, true);

    const restoredOptions = resolveStoreCheckoutOptions({
      numberEnabled: turnedBackOn.enabled,
      numbers: syncLegacyNumbersFromAccounts(storeAccounts),
      paymentAccounts: storeAccounts,
    });
    assert.deepEqual(
      restoredOptions.map((o) => o.method),
      ['bkash', 'nagad']
    );
    assert.equal(restoredOptions[0].number, '01711223344');
  });
});

