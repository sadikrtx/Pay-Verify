import {
  GRACE_DURATION_MS,
  PAIRING_TOKEN_TTL_MS,
  SEEDED_PLAN_IDS,
  type AddonKind,
  type OwnedAddonEntry,
  type PairingTokenDoc,
  type PayAccountDoc,
  type PayActivityDoc,
  type PayCouponDoc,
  type PayPlanDoc,
  type PayPlanFeatures,
  type PayPlatformConfig,
  type PayStoreDoc,
} from '../types/payment';
import { evaluateAccountPlan } from './platformLogic';

/**
 * Exactly three default plans seeded ONCE when payPlans is empty.
 * Prices start EMPTY (0 => shown as "দাম সেট করা হয়নি") — never invent a price.
 */
export function buildSeededPlans(nowMs = Date.now()): PayPlanDoc[] {
  return [
    {
      id: SEEDED_PLAN_IDS.starter,
      name: 'স্টার্টার',
      priceMonthly: 0,
      priceYearly: 0,
      storeLimit: 1,
      dailySessionCap: 100,
      deviceLimit: 1,
      features: {
        rotation: false,
        branding: false,
        embedded: false,
        apiAccess: false,
        woocommerce: false,
        analytics: false,
        csvExport: false,
        manualMatch: true,
        members: 0,
      },
      customPerks: [],
      visibleOnMarketing: true,
      highlight: false,
      archived: false,
      sortOrder: 1,
      createdAtMs: nowMs,
    },
    {
      id: SEEDED_PLAN_IDS.standard,
      name: 'স্ট্যান্ডার্ড',
      priceMonthly: 0,
      priceYearly: 0,
      storeLimit: 3,
      dailySessionCap: 500,
      deviceLimit: 1,
      features: {
        rotation: true,
        branding: true,
        embedded: true,
        apiAccess: false,
        woocommerce: false,
        analytics: true,
        csvExport: true,
        manualMatch: true,
        members: 2,
      },
      customPerks: [],
      visibleOnMarketing: true,
      highlight: true,
      archived: false,
      sortOrder: 2,
      createdAtMs: nowMs + 1,
    },
    {
      id: SEEDED_PLAN_IDS.vip,
      name: 'ভিআইপি / মাস্টার',
      priceMonthly: 0,
      priceYearly: 0,
      storeLimit: 10,
      dailySessionCap: 2000,
      deviceLimit: 3,
      features: {
        rotation: true,
        branding: true,
        embedded: true,
        apiAccess: true,
        woocommerce: true,
        analytics: true,
        csvExport: true,
        manualMatch: true,
        members: 5,
      },
      customPerks: [],
      visibleOnMarketing: true,
      highlight: false,
      archived: false,
      sortOrder: 3,
      createdAtMs: nowMs + 2,
    },
  ];
}

export const PLAN_FEATURE_LABELS_BN: Array<{
  key: Exclude<keyof PayPlanFeatures, 'members'>;
  label: string;
}> = [
  { key: 'manualMatch', label: 'ম্যানুয়াল SMS ম্যাচ' },
  { key: 'branding', label: 'কাস্টম ব্র্যান্ডিং (লোগো ও রঙ)' },
  { key: 'rotation', label: 'স্টোর কী রোটেশন' },
  { key: 'embedded', label: 'এমবেডেড চেকআউট মোড' },
  { key: 'analytics', label: 'বিস্তারিত অ্যানালিটিক্স' },
  { key: 'csvExport', label: 'CSV রিপোর্ট এক্সপোর্ট' },
  { key: 'apiAccess', label: 'সম্পূর্ণ API অ্যাক্সেস' },
  { key: 'woocommerce', label: 'WooCommerce ইন্টিগ্রেশন' },
];

export const ADDON_KIND_LABELS_BN: Record<AddonKind, string> = {
  '+store': 'অতিরিক্ত স্টোর',
  '+device': 'অতিরিক্ত ফোন/ডিভাইস',
  '+dailySessions': 'অতিরিক্ত দৈনিক সেশন',
};

export function formatPlanPriceBn(priceBdt: number | null | undefined): string {
  if (!priceBdt || priceBdt <= 0) return 'দাম সেট করা হয়নি';
  return `৳${Math.trunc(priceBdt).toLocaleString('en-IN')}`;
}

export function formatLimitBn(limit: number, unitBn = ''): string {
  if (limit === 0) return 'আনলিমিটেড';
  const formatted = Math.trunc(limit).toLocaleString('bn-BD');
  return unitBn ? `${formatted}${unitBn}` : formatted;
}

export interface EffectiveAccountPlan {
  plan: PayPlanDoc;
  isTrialPlanFallback: boolean;
  /** 0 means unlimited */
  storeLimit: number;
  /** 0 means unlimited */
  dailySessionCap: number;
  /** 0 means unlimited */
  deviceLimit: number;
  features: PayPlanFeatures;
  activeAddons: OwnedAddonEntry[];
  addonBonus: {
    stores: number;
    devices: number;
    dailySessions: number;
  };
}

/**
 * Resolves an account's LIVE limits and features from its payPlans document,
 * applying trialPlanId for trials, per-account overrides (which win), and active ownedAddons.
 */
export function resolveEffectiveAccountPlan(
  account: Pick<
    PayAccountDoc,
    | 'isSuperAdmin'
    | 'planStatus'
    | 'planId'
    | 'paidUntilMs'
    | 'dailySessionCapOverride'
    | 'storeLimitOverride'
    | 'ownedAddons'
  >,
  plans: PayPlanDoc[],
  platformConfig: Pick<PayPlatformConfig, 'trialPlanId'>,
  nowMs = Date.now()
): EffectiveAccountPlan {
  const catalog = plans.length > 0 ? plans : buildSeededPlans(nowMs);
  const byId = new Map<string, PayPlanDoc>();
  for (const p of catalog) byId.set(p.id, p);

  let resolvedPlan: PayPlanDoc | undefined;
  let isTrialPlanFallback = false;

  if (account.planStatus === 'trial' && !account.isSuperAdmin) {
    const trialId = platformConfig.trialPlanId || SEEDED_PLAN_IDS.standard;
    resolvedPlan =
      byId.get(trialId) ||
      (account.planId ? byId.get(account.planId) : undefined) ||
      byId.get(SEEDED_PLAN_IDS.standard) ||
      catalog[0];
    isTrialPlanFallback = true;
  } else {
    if (account.planId) {
      resolvedPlan = byId.get(account.planId);
    }
    if (!resolvedPlan) {
      resolvedPlan = account.isSuperAdmin
        ? byId.get(SEEDED_PLAN_IDS.vip) || catalog[catalog.length - 1]
        : byId.get(SEEDED_PLAN_IDS.starter) || catalog[0];
    }
  }

  // Filter active add-ons (valid until paidUntil + grace, or addon expiresAtMs if set)
  const effectiveAddonDeadline =
    account.paidUntilMs !== null ? account.paidUntilMs + GRACE_DURATION_MS : null;
  const activeAddons = (account.ownedAddons || []).filter((a) => {
    const exp = a.expiresAtMs ?? effectiveAddonDeadline;
    if (exp === null) return true;
    return nowMs <= exp;
  });

  const addonBonus = { stores: 0, devices: 0, dailySessions: 0 };
  for (const a of activeAddons) {
    if (a.kind === '+store') addonBonus.stores += Math.max(0, Math.trunc(a.amount));
    if (a.kind === '+device') addonBonus.devices += Math.max(0, Math.trunc(a.amount));
    if (a.kind === '+dailySessions') addonBonus.dailySessions += Math.max(0, Math.trunc(a.amount));
  }

  if (account.isSuperAdmin) {
    return {
      plan: resolvedPlan,
      isTrialPlanFallback: false,
      storeLimit: 0, // unlimited
      dailySessionCap: 0, // unlimited
      deviceLimit: 0, // unlimited
      features: {
        rotation: true,
        branding: true,
        embedded: true,
        apiAccess: true,
        woocommerce: true,
        analytics: true,
        csvExport: true,
        manualMatch: true,
        members: 100,
      },
      activeAddons,
      addonBonus,
    };
  }

  // Per-account overrides win; otherwise plan base + active add-ons (0 = unlimited stays 0)
  const baseStores =
    account.storeLimitOverride !== null && account.storeLimitOverride !== undefined
      ? account.storeLimitOverride
      : resolvedPlan.storeLimit;
  const storeLimit = baseStores === 0 ? 0 : baseStores + addonBonus.stores;

  const baseDailyCap =
    account.dailySessionCapOverride !== null && account.dailySessionCapOverride !== undefined
      ? account.dailySessionCapOverride
      : resolvedPlan.dailySessionCap;
  const dailySessionCap = baseDailyCap === 0 ? 0 : baseDailyCap + addonBonus.dailySessions;

  const baseDevices = resolvedPlan.deviceLimit;
  const deviceLimit = baseDevices === 0 ? 0 : baseDevices + addonBonus.devices;

  return {
    plan: resolvedPlan,
    isTrialPlanFallback,
    storeLimit,
    dailySessionCap,
    deviceLimit,
    features: { ...resolvedPlan.features },
    activeAddons,
    addonBonus,
  };
}

/**
 * DOWNGRADE RULE:
 * If an account has more owned stores than its effective storeLimit (>0),
 * the extra newest stores become PAUSED (read-only, no new sessions, never deleted/hidden).
 * Raising the limit automatically unpauses them.
 */
export function computePausedStoreIds(
  ownedStores: Pick<PayStoreDoc, 'id' | 'createdAtMs'>[],
  effectiveStoreLimit: number,
  isSuperAdmin: boolean
): Set<string> {
  const paused = new Set<string>();
  if (isSuperAdmin || effectiveStoreLimit <= 0) return paused;
  if (ownedStores.length <= effectiveStoreLimit) return paused;

  const sorted = [...ownedStores].sort((a, b) => a.createdAtMs - b.createdAtMs);
  for (let i = effectiveStoreLimit; i < sorted.length; i += 1) {
    paused.add(sorted[i].id);
  }
  return paused;
}

export function canCreateStoreUnderPlan(
  account: Pick<
    PayAccountDoc,
    'isSuperAdmin' | 'planStatus' | 'trialEndsAtMs' | 'paidUntilMs'
  >,
  effectivePlan: Pick<EffectiveAccountPlan, 'plan' | 'storeLimit'>,
  ownedStoreCount: number,
  nowMs: number
): { allowed: boolean; limit: number; planName: string; reasonBn: string | null } {
  const evalPlan = evaluateAccountPlan(account, nowMs);
  const limit = effectivePlan.storeLimit;
  const planName = effectivePlan.plan.name;

  if (!evalPlan.isActive) {
    return {
      allowed: false,
      limit,
      planName,
      reasonBn: 'আপনার অ্যাকাউন্টের মেয়াদ শেষ বা স্থগিত থাকায় নতুন স্টোর তৈরি করা যাবে না।',
    };
  }
  if (!account.isSuperAdmin && limit > 0 && ownedStoreCount >= limit) {
    return {
      allowed: false,
      limit,
      planName,
      reasonBn: `আপনার “${planName}” প্ল্যানে সর্বোচ্চ ${limit.toLocaleString('bn-BD')}টি স্টোর তৈরি করা যায়। আরও স্টোরের জন্য প্ল্যান আপগ্রেড বা অ্যাড-অন নিন।`,
    };
  }
  return { allowed: true, limit, planName, reasonBn: null };
}

export function canPairAnotherDevice(
  account: Pick<
    PayAccountDoc,
    'isSuperAdmin' | 'planStatus' | 'trialEndsAtMs' | 'paidUntilMs'
  >,
  effectivePlan: Pick<EffectiveAccountPlan, 'plan' | 'deviceLimit'>,
  activeDeviceCount: number,
  nowMs: number
): { allowed: boolean; limit: number; planName: string; reasonBn: string | null } {
  const evalPlan = evaluateAccountPlan(account, nowMs);
  const limit = effectivePlan.deviceLimit;
  const planName = effectivePlan.plan.name;

  if (!evalPlan.isActive) {
    return {
      allowed: false,
      limit,
      planName,
      reasonBn: 'অ্যাকাউন্ট সক্রিয় না থাকায় নতুন ফোন সংযোগ করা যাবে না।',
    };
  }
  if (!account.isSuperAdmin && limit > 0 && activeDeviceCount >= limit) {
    return {
      allowed: false,
      limit,
      planName,
      reasonBn: `আপনার “${planName}” প্ল্যানে সর্বোচ্চ ${limit.toLocaleString('bn-BD')}টি ফোন যুক্ত করা যায়। নতুন ফোন যুক্ত করতে আগে পুরনো একটি ডিভাইস সরিয়ে ফেলুন।`,
    };
  }
  return { allowed: true, limit, planName, reasonBn: null };
}

export function isPairingTokenUsable(
  token: Pick<PairingTokenDoc, 'expiresAtMs' | 'usedAtMs'>,
  nowMs: number
): boolean {
  if (token.usedAtMs !== null) return false;
  return nowMs <= token.expiresAtMs;
}

export function computePairingTokenExpiry(nowMs = Date.now()): number {
  return nowMs + PAIRING_TOKEN_TTL_MS;
}

export function buildPairingQrPayload(workerBaseUrl: string, tokenCode: string): string {
  const base = workerBaseUrl.trim().replace(/\/+$/, '');
  return JSON.stringify({
    v: 2,
    type: 'payverify_pair_token',
    workerBaseUrl: base,
    token: tokenCode,
  });
}

export interface CouponPreviewResult {
  valid: boolean;
  discountBdt: number;
  previewFinalBdt: number;
  messageBn: string;
}

/**
 * Client-side preview ONLY — the final price is ALWAYS computed & enforced server-side by the Worker.
 */
export function previewCouponDiscount(
  basePriceBdt: number,
  coupon: PayCouponDoc | null,
  targetPlanId: string | null,
  nowMs: number
): CouponPreviewResult {
  if (!coupon || !coupon.active) {
    return {
      valid: false,
      discountBdt: 0,
      previewFinalBdt: basePriceBdt,
      messageBn: 'কুপন কোডটি সঠিক নয় বা নিষ্ক্রিয় আছে।',
    };
  }
  if (coupon.expiresAtMs !== null && nowMs > coupon.expiresAtMs) {
    return {
      valid: false,
      discountBdt: 0,
      previewFinalBdt: basePriceBdt,
      messageBn: 'এই কুপন কোডের মেয়াদ শেষ হয়ে গেছে।',
    };
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return {
      valid: false,
      discountBdt: 0,
      previewFinalBdt: basePriceBdt,
      messageBn: 'এই কুপন কোডের সর্বোচ্চ ব্যবহার সীমা শেষ।',
    };
  }
  if (coupon.planId && targetPlanId && coupon.planId !== targetPlanId) {
    return {
      valid: false,
      discountBdt: 0,
      previewFinalBdt: basePriceBdt,
      messageBn: 'এই কুপনটি নির্বাচিত প্ল্যানের জন্য প্রযোজ্য নয়।',
    };
  }
  const discountBdt = Math.floor((basePriceBdt * coupon.percentOff) / 100);
  const previewFinalBdt = Math.max(0, basePriceBdt - discountBdt);
  return {
    valid: true,
    discountBdt,
    previewFinalBdt,
    messageBn: `${coupon.code} প্রিভিউ: ${coupon.percentOff}% ছাড় (৳${discountBdt.toLocaleString('en-IN')} সাশ্রয়) — চূড়ান্ত মূল্য সার্ভার যাচাই করবে।`,
  };
}

/**
 * Returns true if the current login fingerprint is new compared to prior recorded logins.
 */
export function detectNewLoginDevice(
  currentFingerprint: string,
  loginActivities: Pick<PayActivityDoc, 'type' | 'deviceFingerprint'>[]
): boolean {
  if (!currentFingerprint) return false;
  const previousLogins = loginActivities.filter(
    (a) => a.type === 'login' && Boolean(a.deviceFingerprint)
  );
  if (previousLogins.length === 0) return false;
  return !previousLogins.some((a) => a.deviceFingerprint === currentFingerprint);
}

/**
 * Builds a clean, human-readable browser/OS label without exposing sensitive tokens.
 */
export function getBrowserDeviceInfo(): { label: string; fingerprintSeed: string } {
  if (typeof navigator === 'undefined') {
    return { label: 'অজানা ব্রাউজার', fingerprintSeed: 'unknown' };
  }
  const ua = navigator.userAgent || '';
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'Desktop';
  if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  const platform = (navigator.platform || os).slice(0, 40);
  const lang = (navigator.language || 'bn').slice(0, 16);
  return {
    label: `${browser} (${os})`,
    fingerprintSeed: `${browser}|${os}|${platform}|${lang}`,
  };
}
