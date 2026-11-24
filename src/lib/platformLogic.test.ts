import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCreateAnotherStore,
  computeSetupChecklist,
  computeSuperAdminNotifications,
  computeTodayStoreStats,
  countSessionsToday,
  evaluateAccountPlan,
  evaluateDeviceFreshness,
  generatePaidSessionsCsv,
  getStorePermissions,
  sanitizeRedirectUrl,
} from './platformLogic';
import type { PayAccountDoc, PayDeviceDoc, PaySessionDoc, PayStoreDoc } from '../types/payment';

const NOW = new Date('2026-11-24T12:00:00Z').getTime();

function makeAccount(overrides: Partial<PayAccountDoc> = {}): PayAccountDoc {
  return {
    id: 'acc_1',
    email: 'merchant@example.com',
    displayName: 'Merchant One',
    isSuperAdmin: false,
    planStatus: 'trial',
    planTier: 'basic',
    planId: null,
    trialEndsAtMs: NOW + 5 * 24 * 60 * 60 * 1000,
    paidUntilMs: null,
    dailySessionCap: 200,
    dailySessionCapOverride: null,
    storeLimitOverride: null,
    ownedAddons: [],
    lastChangelogReadAtMs: null,
    tokensRevokedAtMs: null,
    createdAtMs: NOW - 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function makeStore(overrides: Partial<PayStoreDoc> = {}): PayStoreDoc {
  return {
    id: 'store_1',
    accountId: 'acc_1',
    name: 'Test Shop',
    type: 'customer',
    numbers: { bkash: '01711223344', nagad: '', rocket: '', upay: '' },
    numberEnabled: { bkash: true, nagad: false, rocket: false, upay: false },
    uniquePaisa: false,
    sessionMinutes: 15,
    storeKeyHash: 'a'.repeat(64),
    webhookUrl: '',
    webhookSecretSet: false,
    lastWebhook: null,
    logoUrl: '',
    accentColor: '#0F766E',
    memberRoles: {},
    memberEmails: {},
    memberUids: [],
    createdAtMs: NOW - 10_000,
    ...overrides,
  };
}

test('evaluateAccountPlan never marks expired trial, post-grace expired paidUntil, or suspended accounts as active', () => {
  const activeTrial = evaluateAccountPlan(makeAccount(), NOW);
  assert.equal(activeTrial.isActive, true);
  assert.equal(activeTrial.labelBn, 'ট্রায়াল চালু');

  const expiredTrial = evaluateAccountPlan(
    makeAccount({ trialEndsAtMs: NOW - 1000 }),
    NOW
  );
  assert.equal(expiredTrial.isActive, false);
  assert.equal(expiredTrial.canCreateSessions, false);
  assert.equal(expiredTrial.labelBn, 'মেয়াদ শেষ');

  const expiredPaid = evaluateAccountPlan(
    makeAccount({ planStatus: 'active', paidUntilMs: NOW - 4 * 24 * 60 * 60 * 1000 }),
    NOW
  );
  assert.equal(expiredPaid.isActive, false);
  assert.equal(expiredPaid.labelBn, 'মেয়াদ শেষ');

  const suspended = evaluateAccountPlan(
    makeAccount({ planStatus: 'suspended' }),
    NOW
  );
  assert.equal(suspended.isActive, false);
  assert.equal(suspended.labelBn, 'স্থগিত');
});

test('canCreateAnotherStore enforces Basic=1 and Pro=5 limits with Bangla messaging', () => {
  const basicAcc = makeAccount({ planTier: 'basic', planStatus: 'active' });
  assert.equal(canCreateAnotherStore(basicAcc, 0, NOW).allowed, true);
  const blockedBasic = canCreateAnotherStore(basicAcc, 1, NOW);
  assert.equal(blockedBasic.allowed, false);
  assert.equal(blockedBasic.limit, 1);
  assert.match(blockedBasic.reasonBn || '', /১টি স্টোর/);

  const proAcc = makeAccount({ planTier: 'pro', planStatus: 'active' });
  assert.equal(canCreateAnotherStore(proAcc, 4, NOW).allowed, true);
  const blockedPro = canCreateAnotherStore(proAcc, 5, NOW);
  assert.equal(blockedPro.allowed, false);
  assert.equal(blockedPro.limit, 5);
  assert.match(blockedPro.reasonBn || '', /৫টি স্টোর/);
});

test('getStorePermissions strictly enforces primary-owner, co-owner, manager, viewer, and super-admin boundaries', () => {
  const store = makeStore({
    accountId: 'owner_uid',
    memberRoles: {
      co_uid: 'co-owner',
      mgr_uid: 'manager',
      view_uid: 'viewer',
    },
  });

  const ownerP = getStorePermissions(store, { id: 'owner_uid', isSuperAdmin: false });
  assert.equal(ownerP.canRotateStoreKey, true);
  assert.equal(ownerP.canDeleteStore, true);
  assert.equal(ownerP.canManageMembers, true);

  const coP = getStorePermissions(store, { id: 'co_uid', isSuperAdmin: false });
  assert.equal(coP.canEditSettings, true);
  assert.equal(coP.canCreateSession, true);
  assert.equal(coP.canRotateStoreKey, false);
  assert.equal(coP.canDeleteStore, false);
  assert.equal(coP.canManageMembers, false);

  const mgrP = getStorePermissions(store, { id: 'mgr_uid', isSuperAdmin: false });
  assert.equal(mgrP.canView, true);
  assert.equal(mgrP.canManualConfirm, true);
  assert.equal(mgrP.canEditSettings, false);
  assert.equal(mgrP.canCancelSession, false);

  const viewerP = getStorePermissions(store, { id: 'view_uid', isSuperAdmin: false });
  assert.equal(viewerP.canView, true);
  assert.equal(viewerP.canManualConfirm, false);
  assert.equal(viewerP.canEditSettings, false);

  // Super admin on someone else's store: platform control yes, edit sessions/SMS NO
  const adminP = getStorePermissions(store, { id: 'super_uid', isSuperAdmin: true });
  assert.equal(adminP.canConvertOrReassign, true);
  assert.equal(adminP.canManualConfirm, false);
  assert.equal(adminP.canCreateSession, false);
});

test('evaluateDeviceFreshness uses 30-minute threshold', () => {
  assert.equal(evaluateDeviceFreshness(NOW - 10 * 60_000, NOW).status, 'fresh');
  assert.equal(evaluateDeviceFreshness(NOW - 31 * 60_000, NOW).status, 'stale');
  assert.equal(evaluateDeviceFreshness(null, NOW).status, 'stale');
});

test('computeSetupChecklist hides card once all 4 real steps are complete', () => {
  const store = makeStore();
  const device: PayDeviceDoc = {
    id: 'dev_1',
    accountId: 'acc_1',
    name: 'Phone',
    keyHash: 'b'.repeat(64),
    createdAtMs: NOW,
    lastSeenAtMs: NOW,
    active: true,
  };
  const paidSession: PaySessionDoc = {
    id: 'sess_1',
    accountId: 'acc_1',
    storeId: 'store_1',
    orderId: 'ORD-1',
    method: 'bkash',
    number: '01711223344',
    amountPaisa: 50000,
    payablePaisa: 50000,
    status: 'paid',
    trxId: 'TX1234',
    sender: '01811111111',
    createdAtMs: NOW,
    expiresAtMs: NOW + 60_000,
    paidAtMs: NOW,
    source: 'kenax',
  };

  const incomplete = computeSetupChecklist(store, [], []);
  assert.equal(incomplete.allDone, false);
  assert.equal(incomplete.completedCount, 1); // numbers set only

  const complete = computeSetupChecklist(store, [device], [paidSession]);
  assert.equal(complete.allDone, true);
  assert.equal(complete.completedCount, 4);
});

test('computeSuperAdminNotifications surfaces new signups, expiring trials, expired paidUntil, and 6h offline devices', () => {
  const accounts: PayAccountDoc[] = [
    makeAccount({
      id: 'acc_trial_soon',
      email: 'soon@example.com',
      planStatus: 'trial',
      trialEndsAtMs: NOW + 24 * 60 * 60 * 1000, // within 2 days
      createdAtMs: NOW - 2 * 24 * 60 * 60 * 1000, // within 7 days
    }),
    makeAccount({
      id: 'acc_active_offline',
      email: 'offline@example.com',
      planStatus: 'active',
      paidUntilMs: NOW + 20 * 24 * 60 * 60 * 1000,
      createdAtMs: NOW - 20 * 24 * 60 * 60 * 1000,
    }),
  ];
  const devices: PayDeviceDoc[] = [
    {
      id: 'dev_old',
      accountId: 'acc_active_offline',
      name: 'Shop Phone',
      keyHash: 'c'.repeat(64),
      createdAtMs: NOW - 10 * 60 * 60 * 1000,
      lastSeenAtMs: NOW - 7 * 60 * 60 * 1000, // > 6h offline
      active: true,
    },
  ];

  const notifs = computeSuperAdminNotifications(accounts, devices, NOW);
  assert.ok(notifs.some((n) => n.kind === 'new_signup' && n.accountId === 'acc_trial_soon'));
  assert.ok(notifs.some((n) => n.kind === 'trial_ending' && n.accountId === 'acc_trial_soon'));
  assert.ok(notifs.some((n) => n.kind === 'device_offline' && n.accountId === 'acc_active_offline'));
});

test('sanitizeRedirectUrl blocks javascript: and data: while allowing http/https', () => {
  assert.equal(sanitizeRedirectUrl('https://kenax.bd/thank-you?o=1'), 'https://kenax.bd/thank-you?o=1');
  assert.equal(sanitizeRedirectUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeRedirectUrl('data:text/html,<script>1</script>'), null);
});

test('generatePaidSessionsCsv filters paid sessions by date range and neutralizes formula injection', () => {
  const sessions: PaySessionDoc[] = [
    {
      id: 's1',
      accountId: 'acc_1',
      storeId: 'store_1',
      orderId: '=CMD()',
      method: 'bkash',
      number: '01711223344',
      amountPaisa: 125050,
      payablePaisa: 125050,
      status: 'paid',
      trxId: 'TX999',
      sender: '01900000000',
      createdAtMs: new Date('2026-11-20T10:00:00').getTime(),
      expiresAtMs: new Date('2026-11-20T10:15:00').getTime(),
      paidAtMs: new Date('2026-11-20T10:02:00').getTime(),
      source: 'kenax',
    },
    {
      id: 's2',
      accountId: 'acc_1',
      storeId: 'store_1',
      orderId: 'ORD-2',
      method: 'nagad',
      number: '01811223344',
      amountPaisa: 50000,
      payablePaisa: 50000,
      status: 'waiting',
      trxId: null,
      sender: null,
      createdAtMs: new Date('2026-11-20T11:00:00').getTime(),
      expiresAtMs: new Date('2026-11-20T11:15:00').getTime(),
      paidAtMs: null,
      source: 'manual',
    },
  ];

  const { csv, rowCount } = generatePaidSessionsCsv(sessions, '2026-11-01', '2026-11-30');
  assert.equal(rowCount, 1);
  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes('1250.50'));
  assert.ok(!csv.includes('ORD-2'));
});

test('Test sessions (isTest: true) NEVER count in daily plan quota, store sales totals, or CSV exports', () => {
  const testPaid: PaySessionDoc = {
    id: 't_quota_1',
    accountId: 'acc_1',
    storeId: 'store_1',
    orderId: 'TEST-Q1',
    method: 'nagad',
    number: '01811223344',
    amountPaisa: 250_000,
    payablePaisa: 250_000,
    status: 'paid',
    trxId: 'SIMQUOTA1',
    sender: '01811009988',
    createdAtMs: NOW - 10_000,
    expiresAtMs: NOW + 890_000,
    paidAtMs: NOW - 5_000,
    source: 'kenax',
    isTest: true,
    testType: 'simulation',
    testResult: 'verified_simulated',
    simulated: true,
    webhookFired: false,
  };

  assert.equal(countSessionsToday([testPaid], NOW), 0);
  const stats = computeTodayStoreStats([testPaid], NOW);
  assert.equal(stats.sessionsToday, 0);
  assert.equal(stats.paidTodayCount, 0);
  assert.equal(stats.paidTodayPaisa, 0);

  const { rowCount } = generatePaidSessionsCsv([testPaid], '2026-11-01', '2026-11-30');
  assert.equal(rowCount, 0);
});

