import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planA2PlanSystemMigration,
  planCollectionBackfill,
  planLegacySettingsMigration,
} from './migration';
import { LEGACY_MIGRATED_STORE_ID, SEEDED_PLAN_IDS, type PaySettingsMain } from '../types/payment';

const legacySettings: PaySettingsMain = {
  ownerUid: 'super_uid',
  numbers: { bkash: '01711223344', nagad: '01811223344', rocket: '', upay: '' },
  numberEnabled: { bkash: true, nagad: true, rocket: false, upay: false },
  uniquePaisa: true,
  sessionMinutes: 20,
  storeName: 'KenaX BD',
  deviceConnected: false,
  deviceName: '',
  deviceLastSeenMs: null,
  workerBaseUrl: 'https://payverify.workers.dev',
  lastWebhook: { ok: true, status: 200, orderId: 'ORD-99' },
};

test('planLegacySettingsMigration migrates paySettings/main once and is strictly idempotent on second run', () => {
  const firstRun = planLegacySettingsMigration({
    superAdminUid: 'super_uid',
    legacySettings,
    migratedStoreExists: false,
    platformConfigAlreadyMigrated: false,
    existingWorkerBaseUrl: '',
  });

  assert.ok(firstRun.createStore);
  assert.equal(firstRun.createStore.id, LEGACY_MIGRATED_STORE_ID);
  assert.equal(firstRun.createStore.type, 'own');
  assert.equal(firstRun.createStore.name, 'KenaX BD');
  assert.equal(firstRun.createStore.storeKeyLegacy, true);
  assert.equal(firstRun.createStore.numbers.bkash, '01711223344');
  assert.equal(firstRun.createStore.uniquePaisa, true);
  assert.equal(firstRun.createStore.sessionMinutes, 20);
  assert.ok(firstRun.upsertPlatformConfig);
  assert.equal(firstRun.upsertPlatformConfig.workerBaseUrl, 'https://payverify.workers.dev');

  // Second run after migration completed -> zero writes / zero duplicates
  const secondRun = planLegacySettingsMigration({
    superAdminUid: 'super_uid',
    legacySettings,
    migratedStoreExists: true,
    platformConfigAlreadyMigrated: true,
    existingWorkerBaseUrl: 'https://payverify.workers.dev',
  });

  assert.equal(secondRun.createStore, null);
  assert.equal(secondRun.upsertPlatformConfig, null);
});

test('planCollectionBackfill patches only missing accountId/storeId and returns empty on second run', () => {
  const firstPatches = planCollectionBackfill({
    docs: [
      { id: 'sess_legacy_1' },
      { id: 'sess_already_done', accountId: 'super_uid', storeId: LEGACY_MIGRATED_STORE_ID },
    ],
    superAdminUid: 'super_uid',
    migratedStoreId: LEGACY_MIGRATED_STORE_ID,
    includeStoreId: true,
  });

  assert.equal(firstPatches.length, 1);
  assert.equal(firstPatches[0].id, 'sess_legacy_1');
  assert.deepEqual(firstPatches[0].patch, {
    accountId: 'super_uid',
    storeId: LEGACY_MIGRATED_STORE_ID,
  });

  const secondPatches = planCollectionBackfill({
    docs: [
      { id: 'sess_legacy_1', accountId: 'super_uid', storeId: LEGACY_MIGRATED_STORE_ID },
      { id: 'sess_already_done', accountId: 'super_uid', storeId: LEGACY_MIGRATED_STORE_ID },
    ],
    superAdminUid: 'super_uid',
    migratedStoreId: LEGACY_MIGRATED_STORE_ID,
    includeStoreId: true,
  });
  assert.equal(secondPatches.length, 0);
});

test('planA2PlanSystemMigration seeds 3 plans once and maps basic/pro/superadmin accounts idempotently', () => {
  const first = planA2PlanSystemMigration({
    existingPlans: [],
    accounts: [
      { id: 'u_super', isSuperAdmin: true, planTier: 'pro', planId: null },
      { id: 'u_pro', isSuperAdmin: false, planTier: 'pro', planId: null },
      { id: 'u_basic', isSuperAdmin: false, planTier: 'basic', planId: null },
      { id: 'u_already', isSuperAdmin: false, planTier: 'basic', planId: SEEDED_PLAN_IDS.standard },
    ],
    existingTrialPlanId: null,
  });

  assert.equal(first.seedPlans.length, 3);
  assert.equal(first.defaultTrialPlanIdToSet, SEEDED_PLAN_IDS.standard);
  assert.deepEqual(first.accountPlanPatches, [
    { accountId: 'u_super', planId: SEEDED_PLAN_IDS.vip },
    { accountId: 'u_pro', planId: SEEDED_PLAN_IDS.standard },
    { accountId: 'u_basic', planId: SEEDED_PLAN_IDS.starter },
  ]);

  // Second run when plans exist & accounts already migrated -> zero writes
  const second = planA2PlanSystemMigration({
    existingPlans: first.seedPlans,
    accounts: [
      { id: 'u_super', isSuperAdmin: true, planTier: 'pro', planId: SEEDED_PLAN_IDS.vip },
      { id: 'u_pro', isSuperAdmin: false, planTier: 'pro', planId: SEEDED_PLAN_IDS.standard },
      { id: 'u_basic', isSuperAdmin: false, planTier: 'basic', planId: SEEDED_PLAN_IDS.starter },
    ],
    existingTrialPlanId: SEEDED_PLAN_IDS.standard,
  });

  assert.equal(second.seedPlans.length, 0);
  assert.equal(second.accountPlanPatches.length, 0);
  assert.equal(second.defaultTrialPlanIdToSet, null);
});
