import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSeededPlans,
  canCreateStoreUnderPlan,
  canPairAnotherDevice,
  computePausedStoreIds,
  detectNewLoginDevice,
  formatLimitBn,
  formatPlanPriceBn,
  isPairingTokenUsable,
  previewCouponDiscount,
  resolveEffectiveAccountPlan,
} from './planEngine';
import { evaluateAccountPlan } from './platformLogic';
import { GRACE_DURATION_MS, PAIRING_TOKEN_TTL_MS, SEEDED_PLAN_IDS, type PayAccountDoc, type PayCouponDoc } from '../types/payment';

const NOW = new Date('2026-11-24T10:00:00Z').getTime();

function makeAccount(overrides: Partial<PayAccountDoc> = {}): PayAccountDoc {
  return {
    id: 'acc_1',
    email: 'merchant@example.com',
    displayName: 'Merchant',
    isSuperAdmin: false,
    planStatus: 'active',
    planTier: 'basic',
    planId: SEEDED_PLAN_IDS.starter,
    trialEndsAtMs: NOW + 5 * 24 * 60 * 60 * 1000,
    paidUntilMs: NOW + 30 * 24 * 60 * 60 * 1000,
    dailySessionCap: 100,
    dailySessionCapOverride: null,
    storeLimitOverride: null,
    ownedAddons: [],
    lastChangelogReadAtMs: null,
    tokensRevokedAtMs: null,
    createdAtMs: NOW - 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

test('seeded plans have exact limits, empty prices, and 0 = আনলিমিটেড formatting', () => {
  const plans = buildSeededPlans(NOW);
  assert.equal(plans.length, 3);
  assert.equal(plans[0].name, 'স্টার্টার');
  assert.equal(plans[0].storeLimit, 1);
  assert.equal(plans[0].deviceLimit, 1);
  assert.equal(plans[0].dailySessionCap, 100);
  assert.equal(plans[0].features.manualMatch, true);
  assert.equal(plans[0].features.branding, false);
  assert.equal(plans[0].priceMonthly, 0);
  assert.equal(formatPlanPriceBn(plans[0].priceMonthly), 'দাম সেট করা হয়নি');

  assert.equal(plans[1].name, 'স্ট্যান্ডার্ড');
  assert.equal(plans[1].storeLimit, 3);
  assert.equal(plans[1].features.members, 2);
  assert.equal(plans[1].features.apiAccess, false);

  assert.equal(plans[2].name, 'ভিআইপি / মাস্টার');
  assert.equal(plans[2].storeLimit, 10);
  assert.equal(plans[2].deviceLimit, 3);
  assert.equal(plans[2].dailySessionCap, 2000);
  assert.equal(plans[2].features.woocommerce, true);
  assert.equal(plans[2].features.members, 5);

  assert.equal(formatLimitBn(0, 'টি'), 'আনলিমিটেড');
  assert.equal(formatLimitBn(5, 'টি'), '৫টি');
});

test('resolveEffectiveAccountPlan resolves live plan, trialPlanId fallback, overrides, and active add-ons', () => {
  const plans = buildSeededPlans(NOW);
  const cfg = { trialPlanId: SEEDED_PLAN_IDS.standard };

  // Trial account resolves from platform trialPlanId (স্ট্যান্ডার্ড: 3 stores, 500 cap)
  const trialAcc = makeAccount({ planStatus: 'trial', planId: null, paidUntilMs: null });
  const trialEff = resolveEffectiveAccountPlan(trialAcc, plans, cfg, NOW);
  assert.equal(trialEff.plan.id, SEEDED_PLAN_IDS.standard);
  assert.equal(trialEff.storeLimit, 3);
  assert.equal(trialEff.dailySessionCap, 500);

  // Per-account overrides win + active add-ons add on top
  const upgradedAcc = makeAccount({
    planId: SEEDED_PLAN_IDS.starter,
    storeLimitOverride: 4,
    dailySessionCapOverride: 750,
    ownedAddons: [
      {
        addonId: 'ad1',
        name: '+২ স্টোর',
        kind: '+store',
        amount: 2,
        purchasedAtMs: NOW - 1000,
        expiresAtMs: NOW + 10_000,
      },
      {
        addonId: 'ad2',
        name: '+১ ফোন',
        kind: '+device',
        amount: 1,
        purchasedAtMs: NOW - 1000,
        expiresAtMs: NOW + 10_000,
      },
      {
        addonId: 'ad_expired',
        name: 'মেয়াদোত্তীর্ণ',
        kind: '+store',
        amount: 5,
        purchasedAtMs: NOW - 50_000,
        expiresAtMs: NOW - 1000,
      },
    ],
  });
  const eff = resolveEffectiveAccountPlan(upgradedAcc, plans, cfg, NOW);
  assert.equal(eff.storeLimit, 6); // 4 override + 2 active addon (expired ignored)
  assert.equal(eff.deviceLimit, 2); // 1 plan + 1 active addon
  assert.equal(eff.dailySessionCap, 750);
});

test('3-day grace period keeps account active with warning, then expires after 3 days', () => {
  const inGraceAcc = makeAccount({
    planStatus: 'active',
    paidUntilMs: NOW - 24 * 60 * 60 * 1000, // 1 day past paidUntil -> 2 days grace left
  });
  const graceEval = evaluateAccountPlan(inGraceAcc, NOW);
  assert.equal(graceEval.code, 'grace');
  assert.equal(graceEval.isActive, true);
  assert.equal(graceEval.canCreateSessions, true);
  assert.equal(graceEval.graceDaysRemaining, 2);
  assert.match(graceEval.labelBn, /গ্রেস — আর ২ দিন/);

  const afterGraceAcc = makeAccount({
    planStatus: 'active',
    paidUntilMs: NOW - GRACE_DURATION_MS - 1000,
  });
  const expiredEval = evaluateAccountPlan(afterGraceAcc, NOW);
  assert.equal(expiredEval.code, 'paid_expired');
  assert.equal(expiredEval.isActive, false);
  assert.equal(expiredEval.canCreateSessions, false);
  assert.equal(expiredEval.labelBn, 'মেয়াদ শেষ');
});

test('downgrade pauses extra stores above limit and automatically unpauses when limit rises', () => {
  const stores = [
    { id: 's1', createdAtMs: 100 },
    { id: 's2', createdAtMs: 200 },
    { id: 's3', createdAtMs: 300 },
  ];
  const pausedAt1 = computePausedStoreIds(stores, 1, false);
  assert.equal(pausedAt1.has('s1'), false);
  assert.equal(pausedAt1.has('s2'), true);
  assert.equal(pausedAt1.has('s3'), true);

  const unpausedAt3 = computePausedStoreIds(stores, 3, false);
  assert.equal(unpausedAt3.size, 0);

  const unlimited = computePausedStoreIds(stores, 0, false);
  assert.equal(unlimited.size, 0);
});

test('store creation & device pairing limits block with Bangla message naming plan & limit', () => {
  const plans = buildSeededPlans(NOW);
  const acc = makeAccount({ planId: SEEDED_PLAN_IDS.starter });
  const eff = resolveEffectiveAccountPlan(acc, plans, { trialPlanId: SEEDED_PLAN_IDS.standard }, NOW);

  const storeBlocked = canCreateStoreUnderPlan(acc, eff, 1, NOW);
  assert.equal(storeBlocked.allowed, false);
  assert.match(storeBlocked.reasonBn || '', /স্টার্টার/);
  assert.match(storeBlocked.reasonBn || '', /১টি স্টোর/);

  const devBlocked = canPairAnotherDevice(acc, eff, 1, NOW);
  assert.equal(devBlocked.allowed, false);
  assert.match(devBlocked.reasonBn || '', /স্টার্টার/);
  assert.match(devBlocked.reasonBn || '', /১টি ফোন/);
});

test('single-use 10-minute pairing tokens expire and cannot be reused once usedAt is set', () => {
  assert.equal(isPairingTokenUsable({ expiresAtMs: NOW + PAIRING_TOKEN_TTL_MS, usedAtMs: null }, NOW), true);
  assert.equal(isPairingTokenUsable({ expiresAtMs: NOW - 1, usedAtMs: null }, NOW), false);
  assert.equal(isPairingTokenUsable({ expiresAtMs: NOW + 60_000, usedAtMs: NOW - 10 }, NOW), false);
});

test('coupon preview checks expiry, maxUses, plan restriction, and computes preview discount', () => {
  const coupon: PayCouponDoc = {
    id: 'SAVE20',
    code: 'SAVE20',
    percentOff: 20,
    expiresAtMs: NOW + 10_000,
    maxUses: 10,
    planId: SEEDED_PLAN_IDS.standard,
    usedCount: 2,
    active: true,
    createdAtMs: NOW - 1000,
  };
  const ok = previewCouponDiscount(1000, coupon, SEEDED_PLAN_IDS.standard, NOW);
  assert.equal(ok.valid, true);
  assert.equal(ok.discountBdt, 200);
  assert.equal(ok.previewFinalBdt, 800);

  const wrongPlan = previewCouponDiscount(1000, coupon, SEEDED_PLAN_IDS.starter, NOW);
  assert.equal(wrongPlan.valid, false);

  const expired = previewCouponDiscount(1000, { ...coupon, expiresAtMs: NOW - 1 }, SEEDED_PLAN_IDS.standard, NOW);
  assert.equal(expired.valid, false);
});

test('detectNewLoginDevice raises alert only when prior logins exist on different fingerprints', () => {
  assert.equal(detectNewLoginDevice('fp_1', []), false);
  assert.equal(detectNewLoginDevice('fp_1', [{ type: 'login', deviceFingerprint: 'fp_1' }]), false);
  assert.equal(detectNewLoginDevice('fp_2', [{ type: 'login', deviceFingerprint: 'fp_1' }]), true);
});
