export type WalletMethod = 'bkash' | 'nagad' | 'rocket' | 'upay';
export type CheckoutWalletMethod = WalletMethod;
export type NumberAccountType = 'personal' | 'agent';
export type PaymentActionType = 'send_money' | 'cash_in' | 'cash_out' | 'payment';
export type SessionStatus = 'waiting' | 'paid' | 'expired' | 'cancelled' | 'failed';
export type SessionSource = 'kenax' | 'manual';
export type SmsMatchResult = 'matched' | 'unmatched' | 'duplicate_trxid' | 'late';
export type TestVerificationType = 'real' | 'simulation';
export type TestVerificationResult = 'pending' | 'verified' | 'verified_simulated' | 'failed';
export type TestFailureReasonCode = 'amount_mismatch' | 'expired' | 'trxid_used' | 'no_sms_yet';

export type PlanStatus = 'trial' | 'active' | 'suspended';
export type PlanTier = 'basic' | 'pro'; // Stored for legacy backward compatibility only; unused in A2
export type StoreType = 'own' | 'customer';
export type StoreMemberRole = 'co-owner' | 'manager' | 'viewer';
export type AddonKind = '+store' | '+device' | '+dailySessions';

export interface WalletNumbersMap {
  bkash: string;
  nagad: string;
  rocket: string;
  upay: string;
}

export interface WalletEnabledMap {
  bkash: boolean;
  nagad: boolean;
  rocket: boolean;
  upay: boolean;
}

export interface MethodNumberEntry {
  number: string;
  type: NumberAccountType;
  actionType?: PaymentActionType;
  customInstruction?: string;
  active: boolean;
}

export interface PaymentAccountsMap {
  bkash: MethodNumberEntry[];
  nagad: MethodNumberEntry[];
  rocket: MethodNumberEntry[];
  upay?: MethodNumberEntry[];
}

export type NormalizedPaymentAccountsMap = Record<WalletMethod, MethodNumberEntry[]>;

export interface LastWebhookInfo {
  ok?: boolean;
  status?: number | string;
  orderId?: string;
  at?: number | string | null;
  error?: string | null;
}

/** Legacy Prompt A0 singleton kept only for idempotent migration */
export interface PaySettingsMain {
  ownerUid: string;
  numbers: WalletNumbersMap;
  numberEnabled: WalletEnabledMap;
  uniquePaisa: boolean;
  sessionMinutes: number;
  storeName: string;
  deviceConnected: boolean;
  deviceName: string;
  deviceLastSeenMs: number | null;
  workerBaseUrl: string;
  lastWebhook: LastWebhookInfo | null;
}

export type HeroMediaType = 'three_step' | 'image' | 'video';

export type BenefitIconKey =
  | 'sms'
  | 'checkout'
  | 'stores'
  | 'qr'
  | 'shield'
  | 'zap'
  | 'wallet'
  | 'clock';

export interface LandingBenefitItem {
  id: string;
  icon: BenefitIconKey;
  text: string;
}

export interface LandingFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface LandingAnnouncementConfig {
  enabled: boolean;
  text: string;
  offerEndsAtMs: number | null;
}

export interface LandingHeroConfig {
  headline: string;
  supportingLine: string;
  ctaText: string;
  mediaType: HeroMediaType;
  imageUrl: string;
  imageDataUrl: string;
  videoUrl: string;
  videoPosterUrl: string;
  videoPosterDataUrl: string;
}

export interface LandingPageConfig {
  announcement: LandingAnnouncementConfig;
  hero: LandingHeroConfig;
  howItWorksSteps: [string, string, string];
  benefits: LandingBenefitItem[];
  faqs: LandingFaqItem[];
  finalCtaHeadline: string;
  finalCtaButtonText: string;
}

export interface PayPlatformConfig {
  workerBaseUrl: string;
  migratedFromSettingsMain: boolean;
  migratedStoreId: string | null;
  trialPlanId: string;
  subscriptionStoreId: string | null;
  plansSeeded: boolean;
  brandLogoUrl: string;
  brandLogoDataUrl: string;
  supportWhatsApp: string;
  supportPhone: string;
  landing: LandingPageConfig;
  updatedAtMs: number | null;
}

export type SubscriptionPurchaseStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface PaySubscriptionPurchaseDoc {
  id: string;
  reference: string;
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  amountPaisa: number;
  method: WalletMethod;
  buyerName: string;
  buyerPhone: string;
  sessionId: string | null;
  status: SubscriptionPurchaseStatus;
  trxId: string | null;
  claimedAccountId: string | null;
  claimedEmail: string | null;
  createdAtMs: number;
  paidAtMs: number | null;
  expiresAtMs: number | null;
  claimedAtMs: number | null;
}

export interface PayPlanFeatures {
  rotation: boolean;
  branding: boolean;
  embedded: boolean;
  apiAccess: boolean;
  woocommerce: boolean;
  analytics: boolean;
  csvExport: boolean;
  manualMatch: boolean;
  members: number; // e.g., 0 | 2 | 5 or any owner-chosen number
}

export interface PayPlanDoc {
  id: string;
  name: string;
  priceMonthly: number | null; // BDT integer (0 or null => "দাম সেট করা হয়নি")
  priceYearly: number | null; // BDT integer (0 or null => not offered / "দাম সেট করা হয়নি")
  storeLimit: number; // 0 => আনলিমিটেড
  dailySessionCap: number; // 0 => আনলিমিটেড
  deviceLimit: number; // 0 => আনলিমিটেড
  features: PayPlanFeatures;
  customPerks: string[];
  visibleOnMarketing: boolean;
  highlight: boolean;
  archived: boolean;
  sortOrder: number;
  createdAtMs: number;
}

export interface PayAddonDoc {
  id: string;
  name: string;
  kind: AddonKind;
  amount: number;
  price: number; // BDT integer (0 => "দাম সেট করা হয়নি")
  active: boolean;
  sortOrder: number;
  createdAtMs: number;
}

export interface OwnedAddonEntry {
  addonId: string;
  name: string;
  kind: AddonKind;
  amount: number;
  purchasedAtMs: number;
  expiresAtMs: number | null;
}

export interface PayCouponDoc {
  id: string; // Uppercase code
  code: string;
  percentOff: number; // 1..100
  expiresAtMs: number | null;
  maxUses: number; // 0 => আনলিমিটেড
  planId: string | null; // Optional restriction to a specific planId
  usedCount: number;
  active: boolean;
  createdAtMs: number;
}

export interface PairingTokenDoc {
  id: string;
  code: string;
  accountId: string;
  deviceName?: string;
  expiresAtMs: number;
  usedAtMs: number | null;
  createdAtMs: number;
}

export interface PayChangelogDoc {
  id: string;
  title: string;
  body: string;
  date: string;
  createdAtMs: number;
}

export interface PayAccountDoc {
  id: string; // Firebase Auth UID
  email: string;
  displayName: string;
  isSuperAdmin: boolean;
  planStatus: PlanStatus;
  planTier: PlanTier; // Kept stored for legacy compatibility only
  planId: string | null;
  trialEndsAtMs: number;
  paidUntilMs: number | null;
  dailySessionCap: number;
  dailySessionCapOverride: number | null;
  storeLimitOverride: number | null;
  ownedAddons: OwnedAddonEntry[];
  lastChangelogReadAtMs: number | null;
  tokensRevokedAtMs: number | null;
  createdAtMs: number;
}

export interface PayStoreDoc {
  id: string;
  accountId: string; // Primary owner UID (exactly one primary owner)
  name: string;
  nameEn?: string;
  type: StoreType;
  numbers: WalletNumbersMap;
  numberEnabled: WalletEnabledMap;
  paymentAccounts?: PaymentAccountsMap;
  uniquePaisa: boolean;
  sessionMinutes: number;
  storeKeyHash: string;
  storeKeyLegacy?: boolean;
  webhookUrl: string;
  webhookSecretSet: boolean;
  lastWebhook: LastWebhookInfo | null;
  logoUrl: string;
  logoDataUrl?: string;
  accentColor: string;
  memberRoles: Record<string, StoreMemberRole>;
  memberEmails: Record<string, string>;
  memberUids: string[];
  liveConfirmedManually?: boolean;
  createdAtMs: number;
}

export interface PayActivityDoc {
  id: string;
  actorAccountId: string;
  actorEmail?: string;
  accountId?: string;
  type?: string; // 'login' | 'device_rejected' | 'plan_change' | 'coupon_redeemed' | 'admin_action' | 'branding_change'
  action: string;
  targetType:
    | 'account'
    | 'store'
    | 'platform'
    | 'plan'
    | 'addon'
    | 'coupon'
    | 'changelog'
    | 'device'
    | 'session'
    | 'app_release';
  targetId: string;
  detail: string;
  note: string;
  ip?: string | null;
  deviceInfo?: string | null;
  deviceFingerprint?: string | null;
  createdAtMs: number;
}

export interface AppReleaseDoc {
  id: string;
  versionName: string;
  versionCode: number;
  apkUrl: string;
  storagePath: string | null;
  fileSize: number; // bytes (0 if external link without size)
  releaseNotes: string;
  mandatory: boolean;
  published: boolean;
  publishedAtMs: number | null;
  downloadCount: number;
  createdAtMs: number;
  updatedAtMs: number | null;
}

export interface AppReleaseDraftInput {
  versionName: string;
  versionCode: number;
  apkUrl: string;
  storagePath?: string | null;
  fileSize: number;
  releaseNotes: string;
  mandatory: boolean;
  publishNow: boolean;
}

export interface PaySessionDoc {
  id: string;
  accountId: string;
  storeId: string;
  orderId: string;
  method: WalletMethod;
  number: string;
  amountPaisa: number;
  payablePaisa: number;
  status: SessionStatus;
  trxId: string | null;
  sender: string | null;
  createdAtMs: number;
  expiresAtMs: number;
  paidAtMs: number | null;
  source: SessionSource;
  manual?: boolean;
  manualNote?: string;
  successUrl?: string;
  failUrl?: string;
  memberUids?: string[];
  // Test verification metadata (A7)
  isTest?: boolean;
  testType?: TestVerificationType;
  testResult?: TestVerificationResult;
  failureReason?: string | null;
  expectedAmountPaisa?: number | null;
  receivedAmountPaisa?: number | null;
  simulated?: boolean;
  webhookFired?: boolean;
  // Subscription / Add-on receipt metadata (written on subscription store sessions)
  subscriptionRefAccountId?: string | null;
  subscriptionItemName?: string | null;
  subscriptionItemType?: 'plan' | 'addon' | null;
  subscriptionResultingPaidUntilMs?: number | null;
  couponCode?: string | null;
}

export interface PaySmsDoc {
  id: string;
  accountId: string;
  storeId?: string | null;
  method: WalletMethod;
  amountPaisa: number;
  sender: string;
  trxId: string;
  smsTimeMs: number | null;
  receivedAtMs: number;
  raw: string;
  matchResult: SmsMatchResult;
  matched: boolean;
  dismissed?: boolean;
  sessionId: string | null;
  simulated?: boolean;
}

export interface PayDeviceDoc {
  id: string;
  accountId: string;
  storeId?: string | null;
  name: string;
  model?: string | null;
  installId?: string | null;
  keyHash: string;
  pairedAtMs?: number | null;
  createdAtMs: number;
  lastSeenAtMs: number | null;
  active: boolean;
}

export interface WorkerSessionStatusResponse {
  status: SessionStatus;
  method: WalletMethod;
  number: string;
  numberType?: NumberAccountType;
  actionType?: PaymentActionType;
  customInstruction?: string;
  payablePaisa: number;
  expiresAt: number | string;
  trxId: string | null;
  storeName?: string;
  storeNameEn?: string;
  logoUrl?: string;
  logoDataUrl?: string;
  accentColor?: string;
  orderId?: string;
  amountPaisa?: number;
  uniquePaisa?: boolean;
  successUrl?: string | null;
  failUrl?: string | null;
  enabledMethods?: WalletMethod[];
  methodNumbers?: Partial<
    Record<
      WalletMethod,
      {
        number: string;
        type: NumberAccountType;
        actionType?: PaymentActionType;
        customInstruction?: string;
      }
    >
  >;
  failureReason?: string | null;
  isTest?: boolean;
  testType?: TestVerificationType;
  testResult?: TestVerificationResult;
  simulated?: boolean;
  expectedAmountPaisa?: number | null;
  receivedAmountPaisa?: number | null;
  webhookFired?: boolean;
}

export interface WorkerCreateSessionResponse {
  sessionId: string;
  payablePaisa: number;
  number: string;
  expiresAt: number | string;
}

export const WALLET_METHODS: WalletMethod[] = ['bkash', 'nagad', 'rocket', 'upay'];

export const WALLET_META: Record<
  WalletMethod,
  {
    name: string;
    color: string;
    softBg: string;
    borderColor: string;
    shortMark: string;
    dialCode: string;
  }
> = {
  bkash: {
    name: 'bKash',
    color: '#E2136E',
    softBg: '#FDF2F8',
    borderColor: '#FBCFE8',
    shortMark: 'bK',
    dialCode: '*247#',
  },
  nagad: {
    name: 'Nagad',
    color: '#E85D04',
    softBg: '#FFF7ED',
    borderColor: '#FED7AA',
    shortMark: 'NG',
    dialCode: '*167#',
  },
  rocket: {
    name: 'Rocket',
    color: '#892B91',
    softBg: '#FAF5FF',
    borderColor: '#E9D5FF',
    shortMark: 'RK',
    dialCode: '*322#',
  },
  upay: {
    name: 'Upay',
    color: '#005BAC',
    softBg: '#EFF6FF',
    borderColor: '#BFDBFE',
    shortMark: 'UP',
    dialCode: '*268#',
  },
};

export const DEFAULT_STORE_ACCENT = '#0F766E';
export const SUPER_ADMIN_EMAIL = 'ayshamukta00@gmail.com';
export const SUPER_ADMIN_EMAILS: readonly string[] = [
  'ayshamukta00@gmail.com',
  'sadikrtx3060@gmail.com',
];

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
export const LEGACY_MIGRATED_STORE_ID = 'store_main_legacy';
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const GRACE_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3-day grace after paidUntil
export const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes single-use token
export const DEVICE_FRESH_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
export const ADMIN_DEVICE_ALERT_MS = 6 * 60 * 60 * 1000; // 6 hours

export const SEEDED_PLAN_IDS = {
  starter: 'plan_starter',
  standard: 'plan_standard',
  vip: 'plan_vip_master',
} as const;
