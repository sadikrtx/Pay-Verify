import {
  DEFAULT_STORE_ACCENT,
  LEGACY_MIGRATED_STORE_ID,
  SEEDED_PLAN_IDS,
  type PayAccountDoc,
  type PayPlanDoc,
  type PaySettingsMain,
} from '../types/payment';
import { buildSeededPlans } from './planEngine';

export interface LegacyMigrationStoreDraft {
  id: string;
  accountId: string;
  name: string;
  type: 'own';
  numbers: PaySettingsMain['numbers'];
  numberEnabled: PaySettingsMain['numberEnabled'];
  uniquePaisa: boolean;
  sessionMinutes: number;
  storeKeyHash: string;
  storeKeyLegacy: boolean;
  webhookUrl: string;
  webhookSecretSet: boolean;
  lastWebhook: PaySettingsMain['lastWebhook'];
  logoUrl: string;
  accentColor: string;
  memberRoles: Record<string, never>;
  memberEmails: Record<string, never>;
  memberUids: string[];
}

export interface LegacyMigrationPlan {
  createStore: LegacyMigrationStoreDraft | null;
  upsertPlatformConfig: {
    workerBaseUrl: string;
    migratedFromSettingsMain: boolean;
    migratedStoreId: string;
  } | null;
}

/**
 * Pure idempotent migration planner from legacy paySettings/main -> payStores/store_main_legacy + payPlatform/config.
 * Running this twice after migration completes returns { createStore: null, upsertPlatformConfig: null }.
 */
export function planLegacySettingsMigration(params: {
  superAdminUid: string;
  legacySettings: PaySettingsMain | null;
  migratedStoreExists: boolean;
  platformConfigAlreadyMigrated: boolean;
  existingWorkerBaseUrl: string;
}): LegacyMigrationPlan {
  const {
    superAdminUid,
    legacySettings,
    migratedStoreExists,
    platformConfigAlreadyMigrated,
    existingWorkerBaseUrl,
  } = params;

  if (!legacySettings) {
    return { createStore: null, upsertPlatformConfig: null };
  }

  const createStore: LegacyMigrationStoreDraft | null = migratedStoreExists
    ? null
    : {
        id: LEGACY_MIGRATED_STORE_ID,
        accountId: superAdminUid,
        name: legacySettings.storeName.trim() || 'KenaX BD',
        type: 'own',
        numbers: {
          bkash: legacySettings.numbers.bkash || '',
          nagad: legacySettings.numbers.nagad || '',
          rocket: legacySettings.numbers.rocket || '',
          upay: legacySettings.numbers.upay || '',
        },
        numberEnabled: {
          bkash: Boolean(legacySettings.numberEnabled.bkash),
          nagad: Boolean(legacySettings.numberEnabled.nagad),
          rocket: Boolean(legacySettings.numberEnabled.rocket),
          upay: Boolean(legacySettings.numberEnabled.upay),
        },
        uniquePaisa: Boolean(legacySettings.uniquePaisa),
        sessionMinutes: Math.min(120, Math.max(5, Math.trunc(legacySettings.sessionMinutes || 15))),
        // Legacy key stays accepted by the Cloudflare Worker without forcing rotation
        storeKeyHash: '0'.repeat(64),
        storeKeyLegacy: true,
        webhookUrl: '',
        webhookSecretSet: false,
        lastWebhook: legacySettings.lastWebhook ?? null,
        logoUrl: '',
        accentColor: DEFAULT_STORE_ACCENT,
        memberRoles: {},
        memberEmails: {},
        memberUids: [],
      };

  const upsertPlatformConfig = platformConfigAlreadyMigrated
    ? null
    : {
        workerBaseUrl: existingWorkerBaseUrl || legacySettings.workerBaseUrl || '',
        migratedFromSettingsMain: true,
        migratedStoreId: LEGACY_MIGRATED_STORE_ID,
      };

  return { createStore, upsertPlatformConfig };
}

export interface BackfillPatch {
  id: string;
  patch: Record<string, string>;
}

/**
 * Pure idempotent backfill planner for legacy paySessions, payDevices, and paySms documents missing accountId/storeId.
 * Running a second time after backfill produces an empty array [].
 */
export function planCollectionBackfill(params: {
  docs: Array<{ id: string; accountId?: string | null; storeId?: string | null }>;
  superAdminUid: string;
  migratedStoreId: string;
  includeStoreId: boolean;
}): BackfillPatch[] {
  const patches: BackfillPatch[] = [];
  for (const d of params.docs) {
    const patch: Record<string, string> = {};
    if (!d.accountId) {
      patch.accountId = params.superAdminUid;
    }
    if (params.includeStoreId && !d.storeId) {
      patch.storeId = params.migratedStoreId;
    }
    if (Object.keys(patch).length > 0) {
      patches.push({ id: d.id, patch });
    }
  }
  return patches;
}

export interface PlanSystemMigrationPlan {
  seedPlans: PayPlanDoc[];
  accountPlanPatches: Array<{ accountId: string; planId: string }>;
  defaultTrialPlanIdToSet: string | null;
}

/**
 * Prompt A2 §1 Idempotent Migration Planner:
 * - Seeds exactly three plans ("স্টার্টার", "স্ট্যান্ডার্ড", "ভিআইপি / মাস্টার") ONLY if payPlans is empty.
 * - Maps accounts without planId:
 *   - isSuperAdmin => VIP / Master
 *   - planTier === 'pro' => স্ট্যান্ডার্ড
 *   - planTier === 'basic' => স্টার্টার
 * - Sets default trialPlanId = স্ট্যান্ডার্ড if missing in platform config.
 * Running a second time produces { seedPlans: [], accountPlanPatches: [], defaultTrialPlanIdToSet: null }.
 */
export function planA2PlanSystemMigration(params: {
  existingPlans: PayPlanDoc[];
  accounts: Array<Pick<PayAccountDoc, 'id' | 'isSuperAdmin' | 'planTier' | 'planId'>>;
  existingTrialPlanId: string | null | undefined;
  nowMs?: number;
}): PlanSystemMigrationPlan {
  const nowMs = params.nowMs ?? Date.now();
  const seedPlans = params.existingPlans.length === 0 ? buildSeededPlans(nowMs) : [];
  const effectivePlans = params.existingPlans.length > 0 ? params.existingPlans : seedPlans;

  const starterId =
    effectivePlans.find((p) => p.id === SEEDED_PLAN_IDS.starter)?.id ||
    effectivePlans.find((p) => p.name.includes('স্টার্টার'))?.id ||
    effectivePlans[0]?.id ||
    SEEDED_PLAN_IDS.starter;
  const standardId =
    effectivePlans.find((p) => p.id === SEEDED_PLAN_IDS.standard)?.id ||
    effectivePlans.find((p) => p.name.includes('স্ট্যান্ডার্ড'))?.id ||
    effectivePlans[1]?.id ||
    starterId;
  const vipId =
    effectivePlans.find((p) => p.id === SEEDED_PLAN_IDS.vip)?.id ||
    effectivePlans.find((p) => p.name.includes('ভিআইপি'))?.id ||
    effectivePlans[effectivePlans.length - 1]?.id ||
    standardId;

  const accountPlanPatches: Array<{ accountId: string; planId: string }> = [];
  for (const acc of params.accounts) {
    if (acc.planId) continue;
    let targetPlanId = starterId;
    if (acc.isSuperAdmin) {
      targetPlanId = vipId;
    } else if (acc.planTier === 'pro') {
      targetPlanId = standardId;
    }
    accountPlanPatches.push({ accountId: acc.id, planId: targetPlanId });
  }

  const defaultTrialPlanIdToSet =
    params.existingTrialPlanId && params.existingTrialPlanId.trim().length > 0
      ? null
      : standardId;

  return {
    seedPlans,
    accountPlanPatches,
    defaultTrialPlanIdToSet,
  };
}
