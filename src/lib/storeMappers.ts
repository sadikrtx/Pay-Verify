import type { DocumentData } from 'firebase/firestore';
import { parseTimestampMs } from './money';
import { isValidHexColor } from './platformLogic';
import {
  enforceEnabledRequiresSavedNumber,
  isValidLogoDataUrl,
  normalizePaymentAccounts,
  syncLegacyNumbersFromAccounts,
} from './checkoutFlow';
import { cloneDefaultLandingConfig, normalizeLandingConfig } from './landingConfig';
import {
  DEFAULT_STORE_ACCENT,
  SEEDED_PLAN_IDS,
  TRIAL_DURATION_MS,
  type AddonKind,
  type LastWebhookInfo,
  type OwnedAddonEntry,
  type PairingTokenDoc,
  type PayAccountDoc,
  type PayActivityDoc,
  type PayAddonDoc,
  type PayChangelogDoc,
  type PayCouponDoc,
  type PayDeviceDoc,
  type PayPlanDoc,
  type PayPlanFeatures,
  type PayPlatformConfig,
  type PaySessionDoc,
  type PaySettingsMain,
  type PaySmsDoc,
  type PayStoreDoc,
  type PaySubscriptionPurchaseDoc,
  type PlanStatus,
  type PlanTier,
  type StoreMemberRole,
  type SubscriptionPurchaseStatus,
  type WalletMethod,
} from '../types/payment';

export const DEFAULT_PLATFORM_CONFIG: PayPlatformConfig = {
  workerBaseUrl: '',
  migratedFromSettingsMain: false,
  migratedStoreId: null,
  trialPlanId: SEEDED_PLAN_IDS.standard,
  subscriptionStoreId: null,
  plansSeeded: false,
  brandLogoUrl: '',
  brandLogoDataUrl: '',
  supportWhatsApp: '',
  supportPhone: '',
  landing: cloneDefaultLandingConfig(),
  updatedAtMs: null,
};

export function mapPlatformConfig(d: DocumentData): PayPlatformConfig {
  const rawBrandLogoDataUrl = typeof d.brandLogoDataUrl === 'string' ? d.brandLogoDataUrl : '';
  return {
    workerBaseUrl: String(d.workerBaseUrl || ''),
    migratedFromSettingsMain: Boolean(d.migratedFromSettingsMain),
    migratedStoreId: d.migratedStoreId ? String(d.migratedStoreId) : null,
    trialPlanId:
      d.trialPlanId === undefined
        ? SEEDED_PLAN_IDS.standard
        : d.trialPlanId
          ? String(d.trialPlanId)
          : '',
    subscriptionStoreId: d.subscriptionStoreId ? String(d.subscriptionStoreId) : null,
    plansSeeded: Boolean(d.plansSeeded),
    brandLogoUrl: typeof d.brandLogoUrl === 'string' ? d.brandLogoUrl.trim() : '',
    brandLogoDataUrl: isValidLogoDataUrl(rawBrandLogoDataUrl) ? rawBrandLogoDataUrl : '',
    supportWhatsApp: typeof d.supportWhatsApp === 'string' ? d.supportWhatsApp.trim() : '',
    supportPhone: typeof d.supportPhone === 'string' ? d.supportPhone.trim() : '',
    landing: normalizeLandingConfig(d.landing),
    updatedAtMs: parseTimestampMs(d.updatedAt),
  };
}

export function mapSubscriptionPurchase(id: string, d: DocumentData): PaySubscriptionPurchaseDoc {
  const rawStatus = String(d.status || 'pending').toLowerCase();
  const status: SubscriptionPurchaseStatus = (
    ['pending', 'paid', 'failed', 'expired', 'cancelled'].includes(rawStatus)
      ? rawStatus
      : 'pending'
  ) as SubscriptionPurchaseStatus;
  const rawMethod = String(d.method || 'bkash').toLowerCase();
  const method: WalletMethod = (
    ['bkash', 'nagad', 'rocket', 'upay'].includes(rawMethod) ? rawMethod : 'bkash'
  ) as WalletMethod;

  return {
    id,
    reference: String(d.reference || id),
    planId: String(d.planId || ''),
    planName: String(d.planName || 'প্যাকেজ'),
    billingCycle: d.billingCycle === 'yearly' ? 'yearly' : 'monthly',
    amountPaisa: Math.max(0, Math.trunc(Number(d.amountPaisa ?? 0))),
    method,
    buyerName: String(d.buyerName || ''),
    buyerPhone: String(d.buyerPhone || ''),
    sessionId: d.sessionId ? String(d.sessionId) : null,
    status,
    trxId: d.trxId ? String(d.trxId) : null,
    claimedAccountId: d.claimedAccountId ? String(d.claimedAccountId) : null,
    claimedEmail: d.claimedEmail ? String(d.claimedEmail) : null,
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
    paidAtMs: parseTimestampMs(d.paidAt),
    expiresAtMs: parseTimestampMs(d.expiresAt),
    claimedAtMs: parseTimestampMs(d.claimedAt),
  };
}

export function mapLegacySettings(d: DocumentData): PaySettingsMain {
  const nums = (d.numbers || {}) as Record<string, unknown>;
  const en = (d.numberEnabled || {}) as Record<string, unknown>;
  return {
    ownerUid: String(d.ownerUid || ''),
    numbers: {
      bkash: String(nums.bkash || ''),
      nagad: String(nums.nagad || ''),
      rocket: String(nums.rocket || ''),
      upay: String(nums.upay || ''),
    },
    numberEnabled: {
      bkash: en.bkash !== undefined ? Boolean(en.bkash) : true,
      nagad: en.nagad !== undefined ? Boolean(en.nagad) : true,
      rocket: en.rocket !== undefined ? Boolean(en.rocket) : true,
      upay: en.upay !== undefined ? Boolean(en.upay) : true,
    },
    uniquePaisa: Boolean(d.uniquePaisa),
    sessionMinutes: Number(d.sessionMinutes ?? 15),
    storeName: String(d.storeName || 'KenaX BD'),
    deviceConnected: Boolean(d.deviceConnected),
    deviceName: String(d.deviceName || ''),
    deviceLastSeenMs: parseTimestampMs(d.deviceLastSeen),
    workerBaseUrl: String(d.workerBaseUrl || ''),
    lastWebhook:
      d.lastWebhook && typeof d.lastWebhook === 'object' ? (d.lastWebhook as LastWebhookInfo) : null,
  };
}

export function mapPlan(id: string, d: DocumentData): PayPlanDoc {
  const f = (d.features || {}) as Record<string, unknown>;
  const features: PayPlanFeatures = {
    rotation: Boolean(f.rotation),
    branding: Boolean(f.branding),
    embedded: Boolean(f.embedded),
    apiAccess: Boolean(f.apiAccess),
    woocommerce: Boolean(f.woocommerce),
    analytics: Boolean(f.analytics),
    csvExport: Boolean(f.csvExport),
    manualMatch: Boolean(f.manualMatch),
    members: Math.max(0, Math.trunc(Number(f.members ?? 0))),
  };
  const customPerks = Array.isArray(d.customPerks)
    ? d.customPerks.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  return {
    id,
    name: String(d.name || 'প্ল্যান'),
    priceMonthly:
      d.priceMonthly === null || d.priceMonthly === undefined
        ? 0
        : Math.max(0, Math.trunc(Number(d.priceMonthly))),
    priceYearly:
      d.priceYearly === null || d.priceYearly === undefined
        ? 0
        : Math.max(0, Math.trunc(Number(d.priceYearly))),
    storeLimit: Math.max(0, Math.trunc(Number(d.storeLimit ?? 0))),
    dailySessionCap: Math.max(0, Math.trunc(Number(d.dailySessionCap ?? 0))),
    deviceLimit: Math.max(0, Math.trunc(Number(d.deviceLimit ?? 0))),
    features,
    customPerks,
    visibleOnMarketing: Boolean(d.visibleOnMarketing),
    highlight: Boolean(d.highlight),
    archived: Boolean(d.archived),
    sortOrder: Math.max(0, Math.trunc(Number(d.sortOrder ?? 0))),
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
  };
}

export function mapAddon(id: string, d: DocumentData): PayAddonDoc {
  const rawKind = String(d.kind || '+store');
  const kind: AddonKind =
    rawKind === '+device' || rawKind === '+dailySessions' ? rawKind : '+store';
  return {
    id,
    name: String(d.name || 'অ্যাড-অন'),
    kind,
    amount: Math.max(1, Math.trunc(Number(d.amount ?? 1))),
    price: Math.max(0, Math.trunc(Number(d.price ?? 0))),
    active: d.active !== undefined ? Boolean(d.active) : true,
    sortOrder: Math.max(0, Math.trunc(Number(d.sortOrder ?? 0))),
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
  };
}

export function mapCoupon(id: string, d: DocumentData): PayCouponDoc {
  return {
    id,
    code: String(d.code || id).toUpperCase(),
    percentOff: Math.min(100, Math.max(1, Math.trunc(Number(d.percentOff ?? 10)))),
    expiresAtMs: parseTimestampMs(d.expiresAt),
    maxUses: Math.max(0, Math.trunc(Number(d.maxUses ?? 0))),
    planId: d.planId ? String(d.planId) : null,
    usedCount: Math.max(0, Math.trunc(Number(d.usedCount ?? 0))),
    active: d.active !== undefined ? Boolean(d.active) : true,
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
  };
}

export function mapPairingToken(id: string, d: DocumentData): PairingTokenDoc {
  return {
    id,
    code: String(d.code || ''),
    accountId: String(d.accountId || ''),
    deviceName: typeof d.deviceName === 'string' ? d.deviceName : undefined,
    expiresAtMs: parseTimestampMs(d.expiresAt) ?? Date.now(),
    usedAtMs: parseTimestampMs(d.usedAt),
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
  };
}

export function mapChangelog(id: string, d: DocumentData): PayChangelogDoc {
  return {
    id,
    title: String(d.title || ''),
    body: String(d.body || ''),
    date: String(d.date || ''),
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
  };
}

export function mapAccount(id: string, d: DocumentData): PayAccountDoc {
  const createdMs = parseTimestampMs(d.createdAt) ?? Date.now();
  const ownedAddons: OwnedAddonEntry[] = Array.isArray(d.ownedAddons)
    ? d.ownedAddons
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
        .map((x) => {
          const rawKind = String(x.kind || '+store');
          const kind: AddonKind =
            rawKind === '+device' || rawKind === '+dailySessions' ? rawKind : '+store';
          return {
            addonId: String(x.addonId || ''),
            name: String(x.name || ''),
            kind,
            amount: Math.max(1, Math.trunc(Number(x.amount ?? 1))),
            purchasedAtMs: parseTimestampMs(x.purchasedAtMs ?? x.purchasedAt) ?? createdMs,
            expiresAtMs: parseTimestampMs(x.expiresAtMs ?? x.expiresAt),
          };
        })
    : [];

  return {
    id,
    email: String(d.email || ''),
    displayName: String(d.displayName || ''),
    isSuperAdmin: Boolean(d.isSuperAdmin),
    planStatus: (['trial', 'active', 'suspended'].includes(String(d.planStatus))
      ? String(d.planStatus)
      : 'trial') as PlanStatus,
    planTier: (d.planTier === 'pro' ? 'pro' : 'basic') as PlanTier,
    planId: d.planId ? String(d.planId) : null,
    trialEndsAtMs: parseTimestampMs(d.trialEndsAt) ?? createdMs + TRIAL_DURATION_MS,
    paidUntilMs: parseTimestampMs(d.paidUntil),
    dailySessionCap: Math.max(0, Math.trunc(Number(d.dailySessionCap ?? 200))),
    dailySessionCapOverride:
      d.dailySessionCapOverride === null || d.dailySessionCapOverride === undefined
        ? null
        : Math.max(0, Math.trunc(Number(d.dailySessionCapOverride))),
    storeLimitOverride:
      d.storeLimitOverride === null || d.storeLimitOverride === undefined
        ? null
        : Math.max(0, Math.trunc(Number(d.storeLimitOverride))),
    ownedAddons,
    lastChangelogReadAtMs: parseTimestampMs(d.lastChangelogReadAt),
    tokensRevokedAtMs: parseTimestampMs(d.tokensRevokedAt),
    createdAtMs: createdMs,
  };
}

export function mapStore(id: string, d: DocumentData): PayStoreDoc {
  const nums = (d.numbers || {}) as Record<string, unknown>;
  const en = (d.numberEnabled || {}) as Record<string, unknown>;
  const rawRoles = (d.memberRoles || {}) as Record<string, unknown>;
  const memberRoles: Record<string, StoreMemberRole> = {};
  for (const [k, v] of Object.entries(rawRoles)) {
    if (v === 'co-owner' || v === 'manager' || v === 'viewer') {
      memberRoles[k] = v;
    }
  }
  const rawEmails = (d.memberEmails || {}) as Record<string, unknown>;
  const memberEmails: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawEmails)) {
    if (typeof v === 'string') memberEmails[k] = v;
  }
  const memberUids = Array.isArray(d.memberUids)
    ? d.memberUids.map((x) => String(x)).filter(Boolean)
    : Object.keys(memberRoles);

  const legacyNumbers = {
    bkash: String(nums.bkash || ''),
    nagad: String(nums.nagad || ''),
    rocket: String(nums.rocket || ''),
    upay: String(nums.upay || ''),
  };
  const paymentAccounts = normalizePaymentAccounts(
    d.paymentAccounts && typeof d.paymentAccounts === 'object'
      ? (d.paymentAccounts as Record<string, never>)
      : undefined,
    legacyNumbers
  );
  const syncedNumbers = syncLegacyNumbersFromAccounts(paymentAccounts);
  const rawEnabled = {
    bkash: en.bkash !== undefined ? Boolean(en.bkash) : paymentAccounts.bkash.length > 0,
    nagad: en.nagad !== undefined ? Boolean(en.nagad) : paymentAccounts.nagad.length > 0,
    rocket: en.rocket !== undefined ? Boolean(en.rocket) : paymentAccounts.rocket.length > 0,
    upay: en.upay !== undefined ? Boolean(en.upay) : paymentAccounts.upay.length > 0,
  };
  const numberEnabled = enforceEnabledRequiresSavedNumber(rawEnabled, paymentAccounts);
  const rawLogoDataUrl = typeof d.logoDataUrl === 'string' ? d.logoDataUrl : '';

  return {
    id,
    accountId: String(d.accountId || ''),
    name: String(d.name || 'স্টোর'),
    nameEn: typeof d.nameEn === 'string' ? d.nameEn.trim() : '',
    type: d.type === 'own' ? 'own' : 'customer',
    numbers: syncedNumbers,
    numberEnabled,
    paymentAccounts,
    uniquePaisa: Boolean(d.uniquePaisa),
    sessionMinutes: Math.min(120, Math.max(5, Math.trunc(Number(d.sessionMinutes ?? 15)))),
    storeKeyHash: String(d.storeKeyHash || ''),
    storeKeyLegacy: Boolean(d.storeKeyLegacy),
    webhookUrl: String(d.webhookUrl || ''),
    webhookSecretSet: Boolean(d.webhookSecretSet),
    lastWebhook:
      d.lastWebhook && typeof d.lastWebhook === 'object' ? (d.lastWebhook as LastWebhookInfo) : null,
    logoUrl: String(d.logoUrl || ''),
    logoDataUrl: isValidLogoDataUrl(rawLogoDataUrl) ? rawLogoDataUrl : '',
    accentColor:
      typeof d.accentColor === 'string' && isValidHexColor(d.accentColor)
        ? d.accentColor
        : DEFAULT_STORE_ACCENT,
    memberRoles,
    memberEmails,
    memberUids,
    liveConfirmedManually: Boolean(d.liveConfirmedManually),
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
  };
}

export function mapSession(id: string, d: DocumentData): PaySessionDoc {
  return {
    id,
    accountId: String(d.accountId || ''),
    storeId: String(d.storeId || ''),
    orderId: String(d.orderId || ''),
    method: String(d.method || 'bkash').toLowerCase() as WalletMethod,
    number: String(d.number || ''),
    amountPaisa: Math.trunc(Number(d.amountPaisa || 0)),
    payablePaisa: Math.trunc(Number(d.payablePaisa || 0)),
    status: String(d.status || 'waiting') as PaySessionDoc['status'],
    trxId: d.trxId ? String(d.trxId) : null,
    sender: d.sender ? String(d.sender) : null,
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
    expiresAtMs: parseTimestampMs(d.expiresAt) ?? Date.now(),
    paidAtMs: parseTimestampMs(d.paidAt),
    source: d.source === 'manual' ? 'manual' : 'kenax',
    manual: Boolean(d.manual),
    manualNote: typeof d.manualNote === 'string' ? d.manualNote : undefined,
    successUrl: typeof d.successUrl === 'string' ? d.successUrl : undefined,
    failUrl: typeof d.failUrl === 'string' ? d.failUrl : undefined,
    memberUids: Array.isArray(d.memberUids) ? d.memberUids.map(String) : undefined,
    isTest: Boolean(d.isTest),
    testType:
      d.testType === 'simulation' || d.testType === 'real' ? d.testType : undefined,
    testResult:
      d.testResult === 'pending' ||
      d.testResult === 'verified' ||
      d.testResult === 'verified_simulated' ||
      d.testResult === 'failed'
        ? d.testResult
        : undefined,
    failureReason: typeof d.failureReason === 'string' ? d.failureReason : null,
    expectedAmountPaisa:
      typeof d.expectedAmountPaisa === 'number' ? Math.trunc(d.expectedAmountPaisa) : null,
    receivedAmountPaisa:
      typeof d.receivedAmountPaisa === 'number' ? Math.trunc(d.receivedAmountPaisa) : null,
    simulated: Boolean(d.simulated),
    webhookFired: typeof d.webhookFired === 'boolean' ? d.webhookFired : undefined,
    subscriptionRefAccountId: d.subscriptionRefAccountId
      ? String(d.subscriptionRefAccountId)
      : null,
    subscriptionItemName: d.subscriptionItemName ? String(d.subscriptionItemName) : null,
    subscriptionItemType:
      d.subscriptionItemType === 'plan' || d.subscriptionItemType === 'addon'
        ? d.subscriptionItemType
        : null,
    subscriptionResultingPaidUntilMs: parseTimestampMs(d.subscriptionResultingPaidUntil),
    couponCode: d.couponCode ? String(d.couponCode) : null,
  };
}

export function mapSms(id: string, d: DocumentData): PaySmsDoc {
  const matchResult = String(d.matchResult || 'unmatched') as PaySmsDoc['matchResult'];
  const matched = d.matched !== undefined ? Boolean(d.matched) : matchResult === 'matched';
  return {
    id,
    accountId: String(d.accountId || ''),
    storeId: d.storeId ? String(d.storeId) : null,
    method: String(d.method || 'bkash').toLowerCase() as WalletMethod,
    amountPaisa: Math.trunc(Number(d.amountPaisa || 0)),
    sender: String(d.sender || ''),
    trxId: String(d.trxId || ''),
    smsTimeMs: parseTimestampMs(d.smsTime),
    receivedAtMs: parseTimestampMs(d.receivedAt) ?? Date.now(),
    raw: String(d.raw || ''),
    matchResult,
    matched,
    dismissed: Boolean(d.dismissed),
    sessionId: d.sessionId ? String(d.sessionId) : null,
    simulated: Boolean(d.simulated),
  };
}

export function mapDevice(id: string, d: DocumentData): PayDeviceDoc {
  return {
    id,
    accountId: String(d.accountId || ''),
    storeId: d.storeId ? String(d.storeId) : null,
    name: String(d.name || ''),
    model: d.model ? String(d.model) : null,
    installId: d.installId ? String(d.installId) : null,
    keyHash: String(d.keyHash || ''),
    pairedAtMs: parseTimestampMs(d.pairedAt) ?? parseTimestampMs(d.createdAt),
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
    lastSeenAtMs: parseTimestampMs(d.lastSeenAt) ?? parseTimestampMs(d.lastSeen),
    active: Boolean(d.active),
  };
}

const VALID_ACTIVITY_TARGETS = [
  'account',
  'store',
  'platform',
  'plan',
  'addon',
  'coupon',
  'changelog',
  'device',
  'session',
] as const;

export function mapActivity(id: string, d: DocumentData): PayActivityDoc {
  const rawTarget = String(d.targetType || 'platform');
  const targetType = (VALID_ACTIVITY_TARGETS as readonly string[]).includes(rawTarget)
    ? (rawTarget as PayActivityDoc['targetType'])
    : 'platform';

  return {
    id,
    actorAccountId: String(d.actorAccountId || ''),
    actorEmail: typeof d.actorEmail === 'string' ? d.actorEmail : undefined,
    accountId: typeof d.accountId === 'string' ? d.accountId : undefined,
    type: typeof d.type === 'string' ? d.type : undefined,
    action: String(d.action || ''),
    targetType,
    targetId: String(d.targetId || ''),
    detail: String(d.detail || ''),
    note: String(d.note || ''),
    ip: d.ip ? String(d.ip) : null,
    deviceInfo: d.deviceInfo ? String(d.deviceInfo) : null,
    deviceFingerprint: d.deviceFingerprint ? String(d.deviceFingerprint) : null,
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
  };
}
