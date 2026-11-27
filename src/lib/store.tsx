import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import {
  auth,
  db,
  firebaseProjectConfig,
  googleProvider,
  handleFirestoreError,
  OperationType,
  storage,
} from './firebase';
import {
  generateDocId,
  generatePairingTokenCode,
  generateRotatedRevokedHash,
  generateStoreKey,
  hashEmailForDirectory,
  isSafeHttpUrl,
  sha256Hex,
} from './crypto';
import { normalizeBdPhone } from './money';
import {
  countSessionsToday,
  evaluateAccountPlan,
  getStorePermissions,
  isValidHexColor,
  type EvaluatedAccountPlan,
  type StorePermissions,
} from './platformLogic';
import {
  buildPairingQrPayload,
  buildSeededPlans,
  canCreateStoreUnderPlan,
  canPairAnotherDevice,
  computePairingTokenExpiry,
  computePausedStoreIds,
  detectNewLoginDevice,
  getBrowserDeviceInfo,
  resolveEffectiveAccountPlan,
  type EffectiveAccountPlan,
} from './planEngine';
import {
  planA2PlanSystemMigration,
  planCollectionBackfill,
  planLegacySettingsMigration,
} from './migration';
import {
  cacheWorkerConfigLocally,
  createTestWorkerSession,
  createWorkerSession,
  normalizeWorkerBaseUrl,
  redeemSubscriptionClaimToken,
  submitSmsIngestWithSimulation,
} from './workerClient';
import {
  evaluateSmsAgainstSession,
  generateSampleWalletSms,
  getStoreEnabledMethodOptions,
  TEST_SESSION_TTL_MS,
  type GeneratedSampleWalletSms,
} from './testVerification';
import {
  DEFAULT_PLATFORM_CONFIG,
  mapAccount,
  mapActivity,
  mapAddon,
  mapAppRelease,
  mapChangelog,
  mapCoupon,
  mapDevice,
  mapLegacySettings,
  mapMerchantSupportNote,
  mapPairingToken,
  mapPlan,
  mapPlatformConfig,
  mapSession,
  mapSms,
  mapStaffMember,
  mapStaffRole,
  mapStore,
  mapSubscriptionPurchase,
} from './storeMappers';
import { pickLatestPublishedRelease, validateVersionCode } from './appReleases';
import {
  buildStarterStaffRoles,
  checkAdminPermission,
  normalizeStaffRuleMatrix,
  resolveStaffEffectiveRules,
} from './staffRoles';
import { normalizeLandingConfig } from './landingConfig';
import {
  DEFAULT_STORE_ACCENT,
  isSuperAdminEmail,
  LEGACY_MIGRATED_STORE_ID,
  SEEDED_PLAN_IDS,
  SUPER_ADMIN_EMAIL,
  TRIAL_DURATION_MS,
  type AddonKind,
  type AppReleaseDoc,
  type AppReleaseDraftInput,
  type LandingPageConfig,
  type MerchantSupportNoteDoc,
  type PairingTokenDoc,
  type PayAccountDoc,
  type PayActivityDoc,
  type PayAddonDoc,
  type PayChangelogDoc,
  type PayCouponDoc,
  type PayDeviceDoc,
  type PaymentAccountsMap,
  type NormalizedPaymentAccountsMap,
  type PayPlanDoc,
  type PayPlanFeatures,
  type PayPlatformConfig,
  type PaySessionDoc,
  type PaySmsDoc,
  type PayStoreDoc,
  type PaySubscriptionPurchaseDoc,
  type PlanStatus,
  type StaffActionKey,
  type StaffAreaKey,
  type StaffMemberDoc,
  type StaffMemberStatus,
  type StaffRoleDoc,
  type StaffRuleMatrix,
  type StoreMemberRole,
  type StoreType,
  type TestVerificationType,
  type WalletEnabledMap,
  type WalletMethod,
  type WalletNumbersMap,
  type WorkerCreateSessionResponse,
} from '../types/payment';
import {
  buildEmptyEnabledMap,
  buildEmptyPaymentAccounts,
  CHECKOUT_METHODS,
  enforceEnabledRequiresSavedNumber,
  isValidLogoDataUrl,
  normalizePaymentAccounts,
  normalizePaymentActionType,
  sanitizeCustomInstruction,
  syncLegacyNumbersFromAccounts,
} from './checkoutFlow';

const SELECTED_STORE_KEY = 'payverify_bd_selected_store_id';

export function getAutomatedTestRole(): 'superadmin' | 'merchant' | 'grace' | 'staff' | null {
  if (typeof window === 'undefined') return null;
  const val = new URLSearchParams(window.location.search).get('autostart');
  if (val === '1' || val === 'superadmin') return 'superadmin';
  if (val === 'merchant') return 'merchant';
  if (val === 'grace') return 'grace';
  if (val === 'staff') return 'staff';
  return null;
}

export interface AuthSecurityMetadata {
  creationTime: string | null;
  lastSignInTime: string | null;
  providerIds: string[];
  hasPasswordProvider: boolean;
}

export interface PlanDraftInput {
  name: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  storeLimit: number;
  dailySessionCap: number;
  deviceLimit: number;
  features: PayPlanFeatures;
  customPerks: string[];
  visibleOnMarketing: boolean;
  highlight: boolean;
  archived: boolean;
  sortOrder: number;
}

export interface AddonDraftInput {
  name: string;
  kind: AddonKind;
  amount: number;
  price: number;
  active: boolean;
  sortOrder: number;
}

export interface CouponDraftInput {
  code: string;
  percentOff: number;
  expiresAtMs: number | null;
  maxUses: number;
  planId: string | null;
  active: boolean;
}

interface PayVerifyContextValue {
  user: { uid: string; email: string; displayName: string } | null;
  authReady: boolean;
  authMetadata: AuthSecurityMetadata;
  dataLoading: boolean;
  platformConfig: PayPlatformConfig;
  account: PayAccountDoc | null;
  currentStaff: StaffMemberDoc | null;
  isAdminPortalUser: boolean;
  staffBlockedReason: string | null;
  clearStaffBlockedReason: () => void;
  canAdmin: (area: StaffAreaKey, action: StaffActionKey) => boolean;
  planEvaluation: EvaluatedAccountPlan | null;
  effectivePlan: EffectiveAccountPlan | null;
  plans: PayPlanDoc[];
  visibleMarketingPlans: PayPlanDoc[];
  addons: PayAddonDoc[];
  coupons: PayCouponDoc[];
  changelog: PayChangelogDoc[];
  hasUnreadChangelog: boolean;
  accessibleStores: PayStoreDoc[];
  ownedStores: PayStoreDoc[];
  pausedStoreIds: Set<string>;
  selectedStore: PayStoreDoc | null;
  selectedStoreId: string | null;
  selectedStorePermissions: StorePermissions;
  selectedStoreIsPaused: boolean;
  setSelectedStoreId: (storeId: string) => void;
  accountSessions: PaySessionDoc[];
  storeSessions: PaySessionDoc[];
  subscriptionReceipts: PaySessionDoc[];
  smsList: PaySmsDoc[];
  devices: PayDeviceDoc[];
  pairingTokens: PairingTokenDoc[];
  loginHistory: PayActivityDoc[];
  deviceRejectedAlerts: PayActivityDoc[];
  newDeviceLoginAlert: boolean;
  dismissNewDeviceLoginAlert: () => void;
  // Super Admin & Permitted Staff datasets
  allAccounts: PayAccountDoc[];
  allStores: PayStoreDoc[];
  allSessions: PaySessionDoc[];
  allDevices: PayDeviceDoc[];
  activityLog: PayActivityDoc[];
  subscriptionPurchases: PaySubscriptionPurchaseDoc[];
  staffRoles: StaffRoleDoc[];
  staffMembers: StaffMemberDoc[];
  merchantSupportNotes: MerchantSupportNoteDoc[];
  // Android App Releases (publishedAppRelease available to everyone; appReleases list for Super Admin / permitted staff)
  appReleases: AppReleaseDoc[];
  publishedAppRelease: AppReleaseDoc | null;
  appReleasesLoaded: boolean;
  // Auth & Security
  signInWithGoogle: (portal?: 'buyer' | 'admin') => Promise<void>;
  signInWithEmail: (
    email: string,
    password: string,
    portal?: 'buyer' | 'admin'
  ) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signUpFunnelAccount: (input: {
    email: string;
    password: string;
    displayName: string;
    mode: 'paid' | 'trial';
    purchaseId?: string;
    claimToken?: string;
  }) => Promise<{ email: string; planName: string }>;
  reauthenticateUser: (password?: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  signOutAllSessions: () => Promise<{ localSignedOut: boolean; workerRevocationPending: boolean }>;
  markChangelogRead: () => Promise<void>;
  completeStaffFirstLoginPasswordChange: (
    newPassword: string,
    currentTempPassword?: string
  ) => Promise<void>;
  // Stores
  createStore: (name: string) => Promise<{ store: PayStoreDoc; rawStoreKey: string }>;
  saveStorePaymentMethods: (
    storeId: string,
    paymentAccounts: PaymentAccountsMap,
    numberEnabled: WalletEnabledMap
  ) => Promise<void>;
  saveStoreSettings: (
    storeId: string,
    input: {
      name: string;
      numbers?: WalletNumbersMap;
      numberEnabled?: WalletEnabledMap;
      uniquePaisa: boolean;
      sessionMinutes: number;
      logoUrl: string;
      accentColor: string;
      webhookUrl: string;
      webhookSecret?: string;
    }
  ) => Promise<void>;
  savePaymentPageSettings: (
    storeId: string,
    input: {
      name: string;
      nameEn: string;
      logoUrl: string;
      logoDataUrl: string;
      numberEnabled?: WalletEnabledMap;
      paymentAccounts?: PaymentAccountsMap;
    }
  ) => Promise<void>;
  rotateStoreKey: (storeId: string) => Promise<string>;
  markStoreLiveManually: (storeId: string) => Promise<void>;
  addStoreMember: (storeId: string, email: string, role: StoreMemberRole) => Promise<void>;
  removeStoreMember: (storeId: string, memberUid: string) => Promise<void>;
  deleteStore: (storeId: string) => Promise<void>;
  // Sessions & SMS
  createManualSessionViaWorker: (input: {
    storeId: string;
    orderId: string;
    amountPaisa: number;
    method: WalletMethod;
    storeKey: string;
    successUrl?: string;
    failUrl?: string;
  }) => Promise<WorkerCreateSessionResponse>;
  createTestVerificationSession: (input: {
    storeId: string;
    method: WalletMethod;
    amountPaisa: number;
    testType: TestVerificationType;
  }) => Promise<PaySessionDoc>;
  sendSimulatedTestSms: (sessionId: string) => Promise<{
    session: PaySessionDoc;
    sampleSms: GeneratedSampleWalletSms;
    webhookFired: boolean;
  }>;
  testHistoryClearedBeforeMs: number;
  clearTestHistory: () => void;
  cancelWaitingSession: (sessionId: string) => Promise<void>;
  manualConfirmSession: (sessionId: string, note: string) => Promise<void>;
  matchUnmatchedSmsToSession: (sms: PaySmsDoc, sessionId: string) => Promise<void>;
  dismissUnmatchedSms: (smsId: string) => Promise<void>;
  // Hard Device Binding (account-scoped)
  issueSingleUsePairingToken: (
    deviceName: string
  ) => Promise<{ token: PairingTokenDoc; qrPayload: string }>;
  revokeDevice: (deviceId: string) => Promise<void>;
  // Renewal / Upgrade / Add-ons / Coupon Preview
  lookupCouponForPreview: (rawCode: string) => Promise<PayCouponDoc | null>;
  initiateSubscriptionCheckout: (input: {
    itemType: 'plan' | 'addon';
    planId?: string;
    billingCycle?: 'monthly' | 'yearly';
    addonId?: string;
    method: WalletMethod;
    couponCode?: string;
  }) => Promise<{ sessionId: string; paymentPath: string }>;
  // Super Admin & Granular Staff actions (all log payActivity with actorName + actorRoleName)
  adminSaveWorkerBaseUrl: (workerBaseUrl: string, note?: string) => Promise<void>;
  adminSavePlatformSettings: (
    input: {
      workerBaseUrl?: string;
      trialPlanId?: string;
      subscriptionStoreId?: string | null;
      brandLogoUrl?: string;
      brandLogoDataUrl?: string;
      supportWhatsApp?: string;
      supportPhone?: string;
      landing?: LandingPageConfig;
    },
    note: string
  ) => Promise<void>;
  adminUpdateAccount: (
    targetAccountId: string,
    updates: {
      planStatus?: PlanStatus;
      planId?: string | null;
      paidUntilMs?: number | null;
      dailySessionCap?: number;
      dailySessionCapOverride?: number | null;
      storeLimitOverride?: number | null;
    },
    detail: string,
    note: string
  ) => Promise<void>;
  adminDeleteMerchantAccount: (targetAccountId: string, note: string) => Promise<void>;
  adminConvertStoreType: (storeId: string, newType: StoreType, note: string) => Promise<void>;
  adminReassignStore: (
    storeId: string,
    newAccountId: string,
    newOwnerEmail: string,
    note: string
  ) => Promise<void>;
  adminSavePlan: (
    draft: PlanDraftInput,
    existingPlanId?: string,
    note?: string
  ) => Promise<PayPlanDoc>;
  adminArchivePlan: (planId: string, archived: boolean, note?: string) => Promise<void>;
  adminDeletePlan: (planId: string, note?: string) => Promise<void>;
  adminSaveAddon: (
    draft: AddonDraftInput,
    existingAddonId?: string,
    note?: string
  ) => Promise<PayAddonDoc>;
  adminSaveCoupon: (
    draft: CouponDraftInput,
    existingCouponId?: string,
    note?: string
  ) => Promise<PayCouponDoc>;
  adminSaveChangelog: (
    draft: { title: string; body: string; date: string },
    existingEntryId?: string
  ) => Promise<PayChangelogDoc>;
  adminDeleteChangelog: (entryId: string) => Promise<void>;
  adminSaveAppRelease: (
    draft: AppReleaseDraftInput,
    existingReleaseId?: string
  ) => Promise<AppReleaseDoc>;
  adminTogglePublishAppRelease: (releaseId: string, publish: boolean) => Promise<void>;
  adminDeleteAppRelease: (releaseId: string) => Promise<void>;
  recordAppReleaseDownload: (releaseId: string) => Promise<void>;
  adminVerifyOrNotePaymentSession: (
    sessionId: string,
    updates: {
      status?: 'paid' | 'failed' | 'cancelled' | 'waiting';
      trxId?: string | null;
      manualNote: string;
    }
  ) => Promise<void>;
  adminDeletePaymentSession: (sessionId: string, note?: string) => Promise<void>;
  saveMerchantSupportNote: (
    input: { merchantAccountId: string; merchantEmail: string; body: string },
    existingNoteId?: string
  ) => Promise<MerchantSupportNoteDoc>;
  deleteMerchantSupportNote: (noteId: string) => Promise<void>;
  logAdminReportExport: (reportLabelBn: string) => Promise<void>;
  // Super Admin ONLY: Staff & Custom Roles management (Parts A–E)
  adminSaveStaffRole: (
    input: { name: string; rules: StaffRuleMatrix; isStarter?: boolean },
    existingRoleId?: string
  ) => Promise<StaffRoleDoc>;
  adminDuplicateStaffRole: (roleId: string) => Promise<StaffRoleDoc>;
  adminDeleteStaffRole: (roleId: string) => Promise<void>;
  adminCreateStaffAccount: (input: {
    name: string;
    email: string;
    phone: string;
    tempPassword: string;
    roleId: string;
    hasCustomOverride: boolean;
    overrideRules: StaffRuleMatrix | null;
  }) => Promise<StaffMemberDoc>;
  adminUpdateStaffMember: (
    staffUid: string,
    input: {
      name?: string;
      phone?: string;
      roleId: string;
      hasCustomOverride: boolean;
      overrideRules: StaffRuleMatrix | null;
    }
  ) => Promise<void>;
  adminToggleStaffStatus: (staffUid: string, nextStatus: StaffMemberStatus) => Promise<void>;
  adminSendStaffPasswordReset: (staffUid: string) => Promise<void>;
  adminRemoveStaffMember: (staffUid: string) => Promise<void>;
}

const PayVerifyContext = createContext<PayVerifyContextValue | null>(null);

export const PayVerifyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const autoRole = useMemo(() => getAutomatedTestRole(), []);
  const isAutoTest = autoRole !== null;
  const loginLoggedUidRef = useRef<string | null>(null);

  const [fbUser, setFbUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(isAutoTest);
  const [dataLoading, setDataLoading] = useState(!isAutoTest);

  const [platformConfig, setPlatformConfig] = useState<PayPlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  const [plans, setPlans] = useState<PayPlanDoc[]>(() => (isAutoTest ? buildSeededPlans() : []));
  const [addons, setAddons] = useState<PayAddonDoc[]>([]);
  const [coupons, setCoupons] = useState<PayCouponDoc[]>([]);
  const [changelog, setChangelog] = useState<PayChangelogDoc[]>([]);

  const [staffRoles, setStaffRoles] = useState<StaffRoleDoc[]>(() =>
    isAutoTest ? buildStarterStaffRoles() : []
  );
  const [staffMembers, setStaffMembers] = useState<StaffMemberDoc[]>(() => {
    if (!isAutoTest || autoRole !== 'staff') return [];
    const starters = buildStarterStaffRoles();
    const supportRole = starters[1] || starters[0];
    return [
      {
        id: 'staff_test_uid',
        name: 'রাফি আহমেদ',
        email: 'staff@example.com',
        phone: '01711000000',
        roleId: supportRole.id,
        roleName: supportRole.name,
        hasCustomOverride: false,
        overrideRules: null,
        effectiveRules: supportRole.rules,
        status: 'active',
        mustChangePassword: false,
        lastLoginAtMs: Date.now(),
        createdAtMs: Date.now() - 86_400_000,
        updatedAtMs: Date.now(),
      },
    ];
  });
  const [currentStaff, setCurrentStaff] = useState<StaffMemberDoc | null>(() => {
    if (!isAutoTest || autoRole !== 'staff') return null;
    const starters = buildStarterStaffRoles();
    const supportRole = starters[1] || starters[0];
    return {
      id: 'staff_test_uid',
      name: 'রাফি আহমেদ',
      email: 'staff@example.com',
      phone: '01711000000',
      roleId: supportRole.id,
      roleName: supportRole.name,
      hasCustomOverride: false,
      overrideRules: null,
      effectiveRules: supportRole.rules,
      status: 'active',
      mustChangePassword: false,
      lastLoginAtMs: Date.now(),
      createdAtMs: Date.now() - 86_400_000,
      updatedAtMs: Date.now(),
    };
  });
  const [staffBlockedReason, setStaffBlockedReason] = useState<string | null>(null);
  const [merchantSupportNotes, setMerchantSupportNotes] = useState<MerchantSupportNoteDoc[]>([]);

  const [account, setAccount] = useState<PayAccountDoc | null>(() => {
    if (!isAutoTest) return null;
    if (autoRole === 'staff') return null;
    const now = Date.now();
    if (autoRole === 'merchant') {
      return {
        id: 'merchant_test_uid',
        email: 'shop@example.com',
        displayName: 'টেস্ট মার্চেন্ট',
        isSuperAdmin: false,
        planStatus: 'active',
        planTier: 'basic',
        planId: SEEDED_PLAN_IDS.starter,
        trialEndsAtMs: now + TRIAL_DURATION_MS,
        paidUntilMs: now + 20 * 24 * 60 * 60 * 1000,
        dailySessionCap: 100,
        dailySessionCapOverride: null,
        storeLimitOverride: null,
        ownedAddons: [],
        lastChangelogReadAtMs: null,
        tokensRevokedAtMs: null,
        createdAtMs: now - 3 * 24 * 60 * 60 * 1000,
      };
    }
    if (autoRole === 'grace') {
      return {
        id: 'grace_test_uid',
        email: 'grace@example.com',
        displayName: 'গ্রেস মার্চেন্ট',
        isSuperAdmin: false,
        planStatus: 'active',
        planTier: 'basic',
        planId: SEEDED_PLAN_IDS.starter,
        trialEndsAtMs: now - 10 * 24 * 60 * 60 * 1000,
        paidUntilMs: now - 24 * 60 * 60 * 1000, // 1 day past -> 2 days grace left
        dailySessionCap: 100,
        dailySessionCapOverride: null,
        storeLimitOverride: null,
        ownedAddons: [],
        lastChangelogReadAtMs: null,
        tokensRevokedAtMs: null,
        createdAtMs: now - 40 * 24 * 60 * 60 * 1000,
      };
    }
    return {
      id: 'super_test_uid',
      email: SUPER_ADMIN_EMAIL,
      displayName: 'Sadik (মালিক)',
      isSuperAdmin: true,
      planStatus: 'active',
      planTier: 'pro',
      planId: SEEDED_PLAN_IDS.vip,
      trialEndsAtMs: now + TRIAL_DURATION_MS,
      paidUntilMs: null,
      dailySessionCap: 2000,
      dailySessionCapOverride: null,
      storeLimitOverride: null,
      ownedAddons: [],
      lastChangelogReadAtMs: null,
      tokensRevokedAtMs: null,
      createdAtMs: now,
    };
  });

  const [ownedStores, setOwnedStores] = useState<PayStoreDoc[]>(() => {
    if (!isAutoTest || !account) return [];
    return [
      {
        id: 'store_autotest_1',
        accountId: account.id,
        name: 'স্বপ্ন শপ',
        nameEn: 'Shopno Shop',
        type: 'customer',
        numbers: {
          bkash: '01711223344',
          nagad: '01811223344',
          rocket: '01911223344',
          upay: '',
        },
        numberEnabled: {
          bkash: true,
          nagad: true,
          rocket: true,
          upay: false,
        },
        paymentAccounts: {
          bkash: [{ number: '01711223344', type: 'personal', actionType: 'send_money', active: true }],
          nagad: [{ number: '01811223344', type: 'personal', actionType: 'send_money', active: true }],
          rocket: [{ number: '01911223344', type: 'agent', actionType: 'cash_out', active: true }],
          upay: [],
        },
        uniquePaisa: false,
        sessionMinutes: 15,
        storeKeyHash: 'a'.repeat(64),
        webhookUrl: 'https://shop.example.com/api/payverify-webhook',
        webhookSecretSet: false,
        lastWebhook: null,
        logoUrl: '',
        accentColor: DEFAULT_STORE_ACCENT,
        memberRoles: {},
        memberEmails: {},
        memberUids: [],
        createdAtMs: Date.now() - 86_400_000,
      },
    ];
  });
  const [sharedStores, setSharedStores] = useState<PayStoreDoc[]>([]);
  const [testHistoryClearedBeforeMs, setTestHistoryClearedBeforeMs] = useState<number>(0);
  const [selectedStoreId, setSelectedStoreIdState] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(SELECTED_STORE_KEY);
    } catch {
      return null;
    }
  });

  const [ownedSessions, setOwnedSessions] = useState<PaySessionDoc[]>([]);
  const [sharedSessions, setSharedSessions] = useState<PaySessionDoc[]>([]);
  const [subscriptionReceipts, setSubscriptionReceipts] = useState<PaySessionDoc[]>([]);
  const [smsList, setSmsList] = useState<PaySmsDoc[]>([]);
  const [devices, setDevices] = useState<PayDeviceDoc[]>([]);
  const [pairingTokens, setPairingTokens] = useState<PairingTokenDoc[]>([]);
  const [accountActivities, setAccountActivities] = useState<PayActivityDoc[]>([]);
  const [newDeviceLoginAlert, setNewDeviceLoginAlert] = useState(false);

  // Super Admin collections
  const [allAccounts, setAllAccounts] = useState<PayAccountDoc[]>(() =>
    account ? [account] : []
  );
  const [allStores, setAllStores] = useState<PayStoreDoc[]>([]);
  const [allSessions, setAllSessions] = useState<PaySessionDoc[]>([]);
  const [allDevices, setAllDevices] = useState<PayDeviceDoc[]>([]);
  const [activityLog, setActivityLog] = useState<PayActivityDoc[]>([]);
  const [subscriptionPurchases, setSubscriptionPurchases] = useState<PaySubscriptionPurchaseDoc[]>([]);
  const [appReleases, setAppReleases] = useState<AppReleaseDoc[]>([]);
  const [publishedReleasesSnapshot, setPublishedReleasesSnapshot] = useState<AppReleaseDoc[]>([]);
  const [appReleasesLoaded, setAppReleasesLoaded] = useState(isAutoTest);

  const funnelSignupInProgressRef = useRef(false);
  const adminPortalCheckingRef = useRef(false);

  const clearStaffBlockedReason = useCallback(() => setStaffBlockedReason(null), []);

  const setSelectedStoreId = useCallback((storeId: string) => {
    setSelectedStoreIdState(storeId);
    try {
      window.localStorage.setItem(SELECTED_STORE_KEY, storeId);
    } catch {
      // Ignore
    }
  }, []);

  // Public platform config listener (works even before sign-in so Steps 1-5 get live brand, support, landing & workerBaseUrl)
  useEffect(() => {
    if (isAutoTest) return;
    if (fbUser) return; // Authenticated listener below takes over
    const unsub = onSnapshot(
      doc(db, 'payPlatform', 'config'),
      (snap) => {
        if (snap.exists()) {
          const mapped = mapPlatformConfig(snap.data());
          setPlatformConfig(mapped);
          if (mapped.workerBaseUrl) {
            cacheWorkerConfigLocally(mapped.workerBaseUrl, '');
          }
        }
      },
      () => {
        // Fallback cleanly to default landing config if doc not yet created
      }
    );
    return unsub;
  }, [isAutoTest, fbUser]);

  // Public visible marketing plans listener (works even before sign-in so Step 1/2 & /pricing work)
  useEffect(() => {
    if (isAutoTest) return;
    if (fbUser) return; // Authenticated listener below takes over
    const qVisible = query(collection(db, 'payPlans'), where('visibleOnMarketing', '==', true));
    const unsub = onSnapshot(
      qVisible,
      (snap) => {
        setPlans(
          snap.docs
            .map((d) => mapPlan(d.id, d.data()))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs)
        );
      },
      () => {
        // Ignore if plans haven't been seeded yet
      }
    );
    return unsub;
  }, [isAutoTest, fbUser]);

  // Public published Android App release listener (works for logged-out visitors on /app & /download and logged-in merchants)
  useEffect(() => {
    if (isAutoTest) return;
    const qPublished = query(collection(db, 'appReleases'), where('published', '==', true));
    const unsub = onSnapshot(
      qPublished,
      (snap) => {
        setPublishedReleasesSnapshot(
          snap.docs
            .map((d) => mapAppRelease(d.id, d.data()))
            .sort((a, b) => b.versionCode - a.versionCode || b.createdAtMs - a.createdAtMs)
        );
        setAppReleasesLoaded(true);
      },
      () => {
        setAppReleasesLoaded(true);
      }
    );
    return unsub;
  }, [isAutoTest]);

  useEffect(() => {
    if (isAutoTest) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      // During Step 4 account creation or /admin super-admin verification, hold auth transition
      // so the buyer never skips Step 5 and a regular user never enters /admin.
      if (u && (funnelSignupInProgressRef.current || adminPortalCheckingRef.current)) {
        return;
      }
      setFbUser(u);
      setAuthReady(true);
      if (!u) {
        loginLoggedUidRef.current = null;
        setDataLoading(false);
        setAccount(null);
        setCurrentStaff(null);
        setOwnedStores([]);
        setSharedStores([]);
        setOwnedSessions([]);
        setSharedSessions([]);
        setSubscriptionReceipts([]);
        setSmsList([]);
        setDevices([]);
        setPairingTokens([]);
        setAccountActivities([]);
        setNewDeviceLoginAlert(false);
        setAllAccounts([]);
        setAllStores([]);
        setAllSessions([]);
        setAllDevices([]);
        setActivityLog([]);
        setSubscriptionPurchases([]);
        setStaffRoles([]);
        setStaffMembers([]);
        setMerchantSupportNotes([]);
        setAppReleases([]);
        setAddons([]);
        setCoupons([]);
        setChangelog([]);
      }
    });
    return unsub;
  }, [isAutoTest]);

  // Bootstrap account or staff profile, run idempotent migrations, record login event, and attach listeners
  useEffect(() => {
    if (isAutoTest || !authReady || !fbUser) return;
    let cancelled = false;
    let unsubs: Array<() => void> = [];
    setDataLoading(true);

    const bootstrapAndSubscribe = async () => {
      const uid = fbUser.uid;
      const emailLower = (fbUser.email || '').trim().toLowerCase();
      const displayName = (fbUser.displayName || emailLower.split('@')[0] || 'মার্চেন্ট').slice(0, 80);
      const isBootstrappedSuperAdmin =
        isSuperAdminEmail(emailLower) && fbUser.emailVerified === true;

      // 0. Check if this user is a Staff account (/staff/{uid}) before creating any merchant account
      if (!isBootstrappedSuperAdmin) {
        try {
          const staffRef = doc(db, 'staff', uid);
          const staffSnap = await getDoc(staffRef);
          if (cancelled) return;
          if (staffSnap.exists()) {
            const staffDoc = mapStaffMember(staffSnap.id, staffSnap.data());
            if (staffDoc.status === 'disabled') {
              setStaffBlockedReason(
                'আপনার স্টাফ অ্যাকাউন্টটি বর্তমানে বন্ধ আছে। সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।'
              );
              setCurrentStaff(null);
              setDataLoading(false);
              await signOut(auth).catch(() => {});
              return;
            }

            setStaffBlockedReason(null);
            setAccount(null);
            setCurrentStaff(staffDoc);
            setDataLoading(false);

            // Update lastLoginAt and write staff login audit log once per session
            if (loginLoggedUidRef.current !== uid) {
              loginLoggedUidRef.current = uid;
              try {
                await updateDoc(staffRef, {
                  lastLoginAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } catch {
                // Non-fatal
              }
              try {
                const dev = getBrowserDeviceInfo();
                const loginActId = generateDocId('login');
                await setDoc(doc(db, 'payActivity', loginActId), {
                  actorAccountId: uid,
                  actorEmail: emailLower,
                  actorName: staffDoc.name,
                  actorRoleId: staffDoc.roleId,
                  actorRoleName: staffDoc.roleName,
                  accountId: uid,
                  type: 'login',
                  action: 'staff_login',
                  targetType: 'staff',
                  targetId: uid,
                  detail: `স্টাফ লগইন: ${staffDoc.name} (${staffDoc.roleName})`,
                  note: dev.label,
                  createdAt: serverTimestamp(),
                });
              } catch {
                // Non-fatal login audit
              }
            }

            const uPlatform = onSnapshot(
              doc(db, 'payPlatform', 'config'),
              (snap) => {
                if (snap.exists()) {
                  const cfg = mapPlatformConfig(snap.data());
                  setPlatformConfig(cfg);
                }
              },
              () => {}
            );

            const uStaffSelf = onSnapshot(
              staffRef,
              (snap) => {
                if (!snap.exists()) {
                  setCurrentStaff(null);
                  setStaffBlockedReason('আপনার স্টাফ অ্যাকাউন্টের অ্যাক্সেস বাতিল করা হয়েছে।');
                  void signOut(auth).catch(() => {});
                  return;
                }
                const updatedStaff = mapStaffMember(snap.id, snap.data());
                if (updatedStaff.status === 'disabled') {
                  setCurrentStaff(null);
                  setStaffBlockedReason(
                    'আপনার স্টাফ অ্যাকাউন্টটি বন্ধ করা হয়েছে। সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।'
                  );
                  void signOut(auth).catch(() => {});
                  return;
                }
                setCurrentStaff(updatedStaff);
              },
              () => {}
            );

            unsubs = [uPlatform, uStaffSelf];
            return;
          }
        } catch {
          // Proceed to regular account flow if /staff/{uid} read fails
        }
      }

      setCurrentStaff(null);

      // 1. Ensure payAccounts/{uid} exists
      const accountRef = doc(db, 'payAccounts', uid);
      let isSuperAdminFlag = isBootstrappedSuperAdmin;
      try {
        const accSnap = await getDoc(accountRef);
        if (cancelled) return;
        if (!accSnap.exists()) {
          const trialEnd = Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS);
          await setDoc(accountRef, {
            email: emailLower,
            displayName,
            isSuperAdmin: isBootstrappedSuperAdmin,
            planStatus: isBootstrappedSuperAdmin ? 'active' : 'trial',
            planTier: isBootstrappedSuperAdmin ? 'pro' : 'basic',
            planId: isBootstrappedSuperAdmin ? SEEDED_PLAN_IDS.vip : null,
            trialEndsAt: trialEnd,
            paidUntil: null,
            dailySessionCap: 200,
            dailySessionCapOverride: null,
            storeLimitOverride: null,
            ownedAddons: [],
            lastChangelogReadAt: null,
            tokensRevokedAt: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          isSuperAdminFlag = Boolean(accSnap.data().isSuperAdmin) || isBootstrappedSuperAdmin;
        }
      } catch (err) {
        if (cancelled) return;
        handleFirestoreError(err, OperationType.WRITE, `payAccounts/${uid}`);
      }

      // 2. Upsert zero-PII payDirectory/{sha256(email)}
      if (emailLower) {
        try {
          const dirHash = await hashEmailForDirectory(emailLower);
          await setDoc(doc(db, 'payDirectory', dirHash), {
            accountId: uid,
            displayName,
          });
        } catch {
          // Non-fatal
        }
      }

      // 3. Record sign-in event in payActivity (type: 'login') once per session and check new device
      if (loginLoggedUidRef.current !== uid) {
        loginLoggedUidRef.current = uid;
        try {
          const dev = getBrowserDeviceInfo();
          const fp = (await sha256Hex(dev.fingerprintSeed)).slice(0, 32);
          const priorSnap = await getDocs(
            query(collection(db, 'payActivity'), where('accountId', '==', uid))
          );
          const priorActs = priorSnap.docs.map((d) => mapActivity(d.id, d.data()));
          if (!cancelled && detectNewLoginDevice(fp, priorActs)) {
            setNewDeviceLoginAlert(true);
          }
          const loginActId = generateDocId('login');
          await setDoc(doc(db, 'payActivity', loginActId), {
            actorAccountId: uid,
            actorEmail: emailLower,
            actorName: displayName,
            actorRoleId: isSuperAdminFlag ? 'super_admin' : null,
            actorRoleName: isSuperAdminFlag ? 'সুপার অ্যাডমিন' : null,
            accountId: uid,
            type: 'login',
            action: 'login',
            targetType: 'account',
            targetId: uid,
            detail: `সাইন ইন: ${dev.label}`,
            note: dev.label,
            ip: null,
            deviceInfo: dev.label,
            deviceFingerprint: fp,
            createdAt: serverTimestamp(),
          });
        } catch {
          // Non-fatal login audit
        }
      }

      // 4. Super Admin idempotent A1 + A2 + Starter Roles migrations
      if (isSuperAdminFlag) {
        try {
          // 4a. A1 legacy paySettings/main migration
          const [legacySnap, migratedStoreSnap, platformSnap] = await Promise.all([
            getDoc(doc(db, 'paySettings', 'main')),
            getDoc(doc(db, 'payStores', LEGACY_MIGRATED_STORE_ID)),
            getDoc(doc(db, 'payPlatform', 'config')),
          ]);
          if (cancelled) return;

          const legacySettings = legacySnap.exists() ? mapLegacySettings(legacySnap.data()) : null;
          const existingPlatform = platformSnap.exists()
            ? mapPlatformConfig(platformSnap.data())
            : DEFAULT_PLATFORM_CONFIG;

          const migrationPlan = planLegacySettingsMigration({
            superAdminUid: uid,
            legacySettings,
            migratedStoreExists: migratedStoreSnap.exists(),
            platformConfigAlreadyMigrated: existingPlatform.migratedFromSettingsMain,
            existingWorkerBaseUrl: existingPlatform.workerBaseUrl,
          });

          if (migrationPlan.createStore) {
            const s = migrationPlan.createStore;
            await setDoc(doc(db, 'payStores', s.id), {
              accountId: s.accountId,
              name: s.name,
              type: s.type,
              numbers: s.numbers,
              numberEnabled: s.numberEnabled,
              uniquePaisa: s.uniquePaisa,
              sessionMinutes: s.sessionMinutes,
              storeKeyHash: s.storeKeyHash,
              storeKeyLegacy: s.storeKeyLegacy,
              webhookUrl: s.webhookUrl,
              webhookSecretSet: s.webhookSecretSet,
              lastWebhook: s.lastWebhook,
              logoUrl: s.logoUrl,
              accentColor: s.accentColor,
              memberRoles: {},
              memberEmails: {},
              memberUids: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          if (migrationPlan.upsertPlatformConfig) {
            await setDoc(
              doc(db, 'payPlatform', 'config'),
              {
                ...migrationPlan.upsertPlatformConfig,
                trialPlanId: existingPlatform.trialPlanId || SEEDED_PLAN_IDS.standard,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          if (legacySettings || migratedStoreSnap.exists() || migrationPlan.createStore) {
            const [sessAllSnap, devAllSnap, smsAllSnap] = await Promise.all([
              getDocs(collection(db, 'paySessions')),
              getDocs(collection(db, 'payDevices')),
              getDocs(collection(db, 'paySms')),
            ]);

            const sessionPatches = planCollectionBackfill({
              docs: sessAllSnap.docs.map((d) => ({
                id: d.id,
                accountId: d.data().accountId as string | undefined,
                storeId: d.data().storeId as string | undefined,
              })),
              superAdminUid: uid,
              migratedStoreId: LEGACY_MIGRATED_STORE_ID,
              includeStoreId: true,
            });
            const devicePatches = planCollectionBackfill({
              docs: devAllSnap.docs.map((d) => ({
                id: d.id,
                accountId: d.data().accountId as string | undefined,
                storeId: d.data().storeId as string | undefined,
              })),
              superAdminUid: uid,
              migratedStoreId: LEGACY_MIGRATED_STORE_ID,
              includeStoreId: true,
            });
            const smsPatches = planCollectionBackfill({
              docs: smsAllSnap.docs.map((d) => ({
                id: d.id,
                accountId: d.data().accountId as string | undefined,
              })),
              superAdminUid: uid,
              migratedStoreId: LEGACY_MIGRATED_STORE_ID,
              includeStoreId: false,
            });

            if (sessionPatches.length + devicePatches.length + smsPatches.length > 0) {
              const batch = writeBatch(db);
              for (const p of sessionPatches.slice(0, 150)) {
                batch.update(doc(db, 'paySessions', p.id), p.patch);
              }
              for (const p of devicePatches.slice(0, 150)) {
                batch.update(doc(db, 'payDevices', p.id), p.patch);
              }
              for (const p of smsPatches.slice(0, 150)) {
                batch.update(doc(db, 'paySms', p.id), p.patch);
              }
              await batch.commit();
            }
          }

          // 4b. A2 Idempotent Plan Seeding (3 plans ONCE if payPlans empty) + Account planId Migration
          const [plansSnap, accountsSnap, rolesSnap] = await Promise.all([
            getDocs(collection(db, 'payPlans')),
            getDocs(collection(db, 'payAccounts')),
            getDocs(collection(db, 'roles')),
          ]);
          if (cancelled) return;

          // Seed the two built-in starter roles ("মডারেটর" and "সাপোর্ট স্টাফ") if /roles is empty
          if (rolesSnap.empty) {
            const starterRoles = buildStarterStaffRoles();
            const roleBatch = writeBatch(db);
            for (const sr of starterRoles) {
              roleBatch.set(doc(db, 'roles', sr.id), {
                name: sr.name,
                rules: sr.rules,
                isStarter: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
            await roleBatch.commit();
          }

          const existingPlans = plansSnap.docs.map((d) => mapPlan(d.id, d.data()));
          const existingAccounts = accountsSnap.docs.map((d) => mapAccount(d.id, d.data()));
          const a2Plan = planA2PlanSystemMigration({
            existingPlans,
            accounts: existingAccounts,
            existingTrialPlanId: platformSnap.exists()
              ? (platformSnap.data().trialPlanId as string | undefined)
              : null,
          });

          if (
            a2Plan.seedPlans.length > 0 ||
            a2Plan.accountPlanPatches.length > 0 ||
            a2Plan.defaultTrialPlanIdToSet
          ) {
            const batch = writeBatch(db);
            for (const p of a2Plan.seedPlans) {
              batch.set(doc(db, 'payPlans', p.id), {
                name: p.name,
                priceMonthly: p.priceMonthly ?? 0,
                priceYearly: p.priceYearly ?? 0,
                storeLimit: p.storeLimit,
                dailySessionCap: p.dailySessionCap,
                deviceLimit: p.deviceLimit,
                features: p.features,
                customPerks: p.customPerks,
                visibleOnMarketing: p.visibleOnMarketing,
                highlight: p.highlight,
                archived: p.archived,
                sortOrder: p.sortOrder,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
            for (const patch of a2Plan.accountPlanPatches.slice(0, 200)) {
              batch.update(doc(db, 'payAccounts', patch.accountId), {
                planId: patch.planId,
                updatedAt: serverTimestamp(),
              });
            }
            if (a2Plan.defaultTrialPlanIdToSet || a2Plan.seedPlans.length > 0) {
              batch.set(
                doc(db, 'payPlatform', 'config'),
                {
                  workerBaseUrl: existingPlatform.workerBaseUrl || '',
                  migratedFromSettingsMain: existingPlatform.migratedFromSettingsMain,
                  migratedStoreId: existingPlatform.migratedStoreId,
                  trialPlanId: a2Plan.defaultTrialPlanIdToSet || existingPlatform.trialPlanId,
                  subscriptionStoreId: existingPlatform.subscriptionStoreId,
                  plansSeeded: true,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );
            }
            await batch.commit();
          }
        } catch {
          // Non-fatal on fresh project
        }
      }

      if (cancelled) return;

      // 5. Attach real-time tenant-scoped listeners
      const uPlatform = onSnapshot(
        doc(db, 'payPlatform', 'config'),
        (snap) => {
          if (snap.exists()) {
            const cfg = mapPlatformConfig(snap.data());
            setPlatformConfig(cfg);
            cacheWorkerConfigLocally(cfg.workerBaseUrl, '');
          }
        },
        () => {}
      );

      const uAccount = onSnapshot(
        accountRef,
        (snap) => {
          if (snap.exists()) {
            setAccount(mapAccount(snap.id, snap.data()));
          }
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.GET, `payAccounts/${uid}`)
      );

      const plansQuery = isSuperAdminFlag
        ? collection(db, 'payPlans')
        : query(collection(db, 'payPlans'), where('archived', '==', false));
      const uPlans = onSnapshot(
        plansQuery,
        (snap) => {
          setPlans(
            snap.docs
              .map((d) => mapPlan(d.id, d.data()))
              .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs)
          );
        },
        () => {}
      );

      const addonsQuery = isSuperAdminFlag
        ? collection(db, 'payAddons')
        : query(collection(db, 'payAddons'), where('active', '==', true));
      const uAddons = onSnapshot(
        addonsQuery,
        (snap) => {
          setAddons(
            snap.docs
              .map((d) => mapAddon(d.id, d.data()))
              .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs)
          );
        },
        () => {}
      );

      const uChangelog = onSnapshot(
        query(collection(db, 'payChangelog'), where('createdAt', '!=', null)),
        (snap) => {
          setChangelog(
            snap.docs
              .map((d) => mapChangelog(d.id, d.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        () => {}
      );

      const uOwnedStores = onSnapshot(
        query(collection(db, 'payStores'), where('accountId', '==', uid)),
        (snap) => {
          setOwnedStores(
            snap.docs
              .map((d) => mapStore(d.id, d.data()))
              .sort((a, b) => a.createdAtMs - b.createdAtMs)
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'payStores')
      );

      const uSharedStores = onSnapshot(
        query(collection(db, 'payStores'), where('memberUids', 'array-contains', uid)),
        (snap) => {
          setSharedStores(
            snap.docs
              .map((d) => mapStore(d.id, d.data()))
              .sort((a, b) => a.createdAtMs - b.createdAtMs)
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'payStores(shared)')
      );

      const uOwnedSessions = onSnapshot(
        query(collection(db, 'paySessions'), where('accountId', '==', uid)),
        (snap) => {
          setOwnedSessions(
            snap.docs
              .map((d) => mapSession(d.id, d.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'paySessions')
      );

      const uSharedSessions = onSnapshot(
        query(collection(db, 'paySessions'), where('memberUids', 'array-contains', uid)),
        (snap) => {
          setSharedSessions(
            snap.docs
              .map((d) => mapSession(d.id, d.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'paySessions(shared)')
      );

      const uReceipts = onSnapshot(
        query(collection(db, 'paySessions'), where('subscriptionRefAccountId', '==', uid)),
        (snap) => {
          setSubscriptionReceipts(
            snap.docs
              .map((d) => mapSession(d.id, d.data()))
              .filter((s) => s.status === 'paid')
              .sort((a, b) => (b.paidAtMs ?? b.createdAtMs) - (a.paidAtMs ?? a.createdAtMs))
          );
        },
        () => {}
      );

      const uSms = onSnapshot(
        query(collection(db, 'paySms'), where('accountId', '==', uid)),
        (snap) => {
          setSmsList(
            snap.docs
              .map((d) => mapSms(d.id, d.data()))
              .sort((a, b) => b.receivedAtMs - a.receivedAtMs)
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'paySms')
      );

      const uDevices = onSnapshot(
        query(collection(db, 'payDevices'), where('accountId', '==', uid)),
        (snap) => {
          setDevices(
            snap.docs
              .map((d) => mapDevice(d.id, d.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'payDevices')
      );

      const uTokens = onSnapshot(
        query(collection(db, 'pairingTokens'), where('accountId', '==', uid)),
        (snap) => {
          setPairingTokens(
            snap.docs
              .map((d) => mapPairingToken(d.id, d.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        () => {}
      );

      const uAccountActivity = onSnapshot(
        query(collection(db, 'payActivity'), where('accountId', '==', uid)),
        (snap) => {
          setAccountActivities(
            snap.docs
              .map((d) => mapActivity(d.id, d.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        () => {}
      );

      unsubs = [
        uPlatform,
        uAccount,
        uPlans,
        uAddons,
        uChangelog,
        uOwnedStores,
        uSharedStores,
        uOwnedSessions,
        uSharedSessions,
        uReceipts,
        uSms,
        uDevices,
        uTokens,
        uAccountActivity,
      ];

      // 6. Super Admin platform-wide monitors
      if (isSuperAdminFlag) {
        const uAllAccounts = onSnapshot(
          collection(db, 'payAccounts'),
          (snap) => {
            setAllAccounts(
              snap.docs
                .map((d) => mapAccount(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'payAccounts(admin)')
        );

        const uAllStores = onSnapshot(
          collection(db, 'payStores'),
          (snap) => {
            setAllStores(
              snap.docs
                .map((d) => mapStore(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'payStores(admin)')
        );

        const uAllSessions = onSnapshot(
          collection(db, 'paySessions'),
          (snap) => {
            setAllSessions(
              snap.docs
                .map((d) => mapSession(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'paySessions(admin)')
        );

        const uAllDevices = onSnapshot(
          collection(db, 'payDevices'),
          (snap) => {
            setAllDevices(
              snap.docs
                .map((d) => mapDevice(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'payDevices(admin)')
        );

        const uActivity = onSnapshot(
          collection(db, 'payActivity'),
          (snap) => {
            setActivityLog(
              snap.docs
                .map((d) => mapActivity(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'payActivity')
        );

        const uCoupons = onSnapshot(
          collection(db, 'payCoupons'),
          (snap) => {
            setCoupons(
              snap.docs
                .map((d) => mapCoupon(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          () => {}
        );

        const uPurchases = onSnapshot(
          collection(db, 'paySubscriptionPurchases'),
          (snap) => {
            setSubscriptionPurchases(
              snap.docs
                .map((d) => mapSubscriptionPurchase(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          () => {}
        );

        const uAppReleases = onSnapshot(
          collection(db, 'appReleases'),
          (snap) => {
            setAppReleases(
              snap.docs
                .map((d) => mapAppRelease(d.id, d.data()))
                .sort((a, b) => b.versionCode - a.versionCode || b.createdAtMs - a.createdAtMs)
            );
            setAppReleasesLoaded(true);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'appReleases(admin)')
        );

        const uStaffRoles = onSnapshot(
          collection(db, 'roles'),
          (snap) => {
            setStaffRoles(
              snap.docs
                .map((d) => mapStaffRole(d.id, d.data()))
                .sort((a, b) => a.createdAtMs - b.createdAtMs)
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'roles(admin)')
        );

        const uStaffMembers = onSnapshot(
          collection(db, 'staff'),
          (snap) => {
            setStaffMembers(
              snap.docs
                .map((d) => mapStaffMember(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'staff(admin)')
        );

        const uMerchantNotes = onSnapshot(
          collection(db, 'merchantSupportNotes'),
          (snap) => {
            setMerchantSupportNotes(
              snap.docs
                .map((d) => mapMerchantSupportNote(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          () => {}
        );

        unsubs.push(
          uAllAccounts,
          uAllStores,
          uAllSessions,
          uAllDevices,
          uActivity,
          uCoupons,
          uPurchases,
          uAppReleases,
          uStaffRoles,
          uStaffMembers,
          uMerchantNotes
        );
      }
    };

    void bootstrapAndSubscribe();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
  }, [isAutoTest, authReady, fbUser]);

  // Dynamic permission-scoped listeners for active Staff Member (re-subscribes immediately if Super Admin updates their rules)
  useEffect(() => {
    if (isAutoTest || !authReady || !fbUser || !currentStaff || currentStaff.status !== 'active') {
      return;
    }
    if (account?.isSuperAdmin) return;

    const rules = currentStaff.effectiveRules;
    const unsubs: Array<() => void> = [];

    if (rules.merchants.view || rules.reports.view) {
      unsubs.push(
        onSnapshot(
          collection(db, 'payAccounts'),
          (snap) => {
            setAllAccounts(
              snap.docs
                .map((d) => mapAccount(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          () => {}
        ),
        onSnapshot(
          collection(db, 'payStores'),
          (snap) => {
            setAllStores(
              snap.docs
                .map((d) => mapStore(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          () => {}
        )
      );
    } else {
      setAllAccounts([]);
      setAllStores([]);
    }

    if (rules.payments.view || rules.reports.view) {
      unsubs.push(
        onSnapshot(
          collection(db, 'paySessions'),
          (snap) => {
            setAllSessions(
              snap.docs
                .map((d) => mapSession(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          () => {}
        )
      );
    } else {
      setAllSessions([]);
    }

    if (rules.plans.view) {
      unsubs.push(
        onSnapshot(
          collection(db, 'payPlans'),
          (snap) => {
            setPlans(
              snap.docs
                .map((d) => mapPlan(d.id, d.data()))
                .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs)
            );
          },
          () => {}
        )
      );
    }

    if (rules.app_updates.view) {
      unsubs.push(
        onSnapshot(
          collection(db, 'appReleases'),
          (snap) => {
            setAppReleases(
              snap.docs
                .map((d) => mapAppRelease(d.id, d.data()))
                .sort((a, b) => b.versionCode - a.versionCode || b.createdAtMs - a.createdAtMs)
            );
            setAppReleasesLoaded(true);
          },
          () => {}
        )
      );
    } else {
      setAppReleases([]);
    }

    if (rules.merchant_notes.view) {
      unsubs.push(
        onSnapshot(
          collection(db, 'merchantSupportNotes'),
          (snap) => {
            setMerchantSupportNotes(
              snap.docs
                .map((d) => mapMerchantSupportNote(d.id, d.data()))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            );
          },
          () => {}
        )
      );
    } else {
      setMerchantSupportNotes([]);
    }

    unsubs.push(
      onSnapshot(
        collection(db, 'payActivity'),
        (snap) => {
          setActivityLog(
            snap.docs
              .map((d) => mapActivity(d.id, d.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        () => {}
      )
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [isAutoTest, authReady, fbUser, currentStaff, account?.isSuperAdmin]);

  // If an account is on an archived plan (hidden from active plans list), fetch it directly so limits stay live
  useEffect(() => {
    if (isAutoTest || !fbUser || !account?.planId || account.isSuperAdmin) return;
    if (plans.some((p) => p.id === account.planId)) return;
    let cancelled = false;
    void getDoc(doc(db, 'payPlans', account.planId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const fetched = mapPlan(snap.id, snap.data());
        setPlans((prev) => (prev.some((p) => p.id === fetched.id) ? prev : [...prev, fetched]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAutoTest, fbUser, account, plans]);

  const canAdmin = useCallback(
    (area: StaffAreaKey, action: StaffActionKey): boolean =>
      checkAdminPermission(Boolean(account?.isSuperAdmin), currentStaff, area, action),
    [account?.isSuperAdmin, currentStaff]
  );

  const isAdminPortalUser = useMemo(
    () => Boolean(account?.isSuperAdmin || (currentStaff && currentStaff.status === 'active')),
    [account?.isSuperAdmin, currentStaff]
  );

  // Derived data
  const publishedAppRelease = useMemo(() => {
    if (account?.isSuperAdmin || canAdmin('app_updates', 'view') || isAutoTest) {
      return (
        pickLatestPublishedRelease(appReleases) ??
        pickLatestPublishedRelease(publishedReleasesSnapshot)
      );
    }
    return pickLatestPublishedRelease(publishedReleasesSnapshot);
  }, [account?.isSuperAdmin, canAdmin, isAutoTest, appReleases, publishedReleasesSnapshot]);

  const visibleMarketingPlans = useMemo(
    () =>
      plans
        .filter((p) => p.visibleOnMarketing && !p.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs),
    [plans]
  );

  const effectivePlan = useMemo(
    () =>
      account ? resolveEffectiveAccountPlan(account, plans, platformConfig, Date.now()) : null,
    [account, plans, platformConfig]
  );

  const pausedStoreIds = useMemo(
    () =>
      account && effectivePlan
        ? computePausedStoreIds(ownedStores, effectivePlan.storeLimit, account.isSuperAdmin)
        : new Set<string>(),
    [account, effectivePlan, ownedStores]
  );

  const accessibleStores = useMemo(() => {
    const map = new Map<string, PayStoreDoc>();
    for (const s of ownedStores) map.set(s.id, s);
    for (const s of sharedStores) {
      if (!map.has(s.id)) map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [ownedStores, sharedStores]);

  useEffect(() => {
    if (accessibleStores.length === 0) {
      if (selectedStoreId !== null) setSelectedStoreIdState(null);
      return;
    }
    if (!selectedStoreId || !accessibleStores.some((s) => s.id === selectedStoreId)) {
      setSelectedStoreId(accessibleStores[0].id);
    }
  }, [accessibleStores, selectedStoreId, setSelectedStoreId]);

  const selectedStore = useMemo(
    () => accessibleStores.find((s) => s.id === selectedStoreId) || accessibleStores[0] || null,
    [accessibleStores, selectedStoreId]
  );

  const selectedStoreIsPaused = useMemo(
    () => Boolean(selectedStore && pausedStoreIds.has(selectedStore.id)),
    [selectedStore, pausedStoreIds]
  );

  useEffect(() => {
    if (selectedStore) {
      cacheWorkerConfigLocally(platformConfig.workerBaseUrl, selectedStore.name);
    }
  }, [platformConfig.workerBaseUrl, selectedStore]);



  const accountSessions = useMemo(() => {
    const map = new Map<string, PaySessionDoc>();
    for (const s of ownedSessions) map.set(s.id, s);
    for (const s of sharedSessions) {
      if (!map.has(s.id)) map.set(s.id, s);
    }
    return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [ownedSessions, sharedSessions]);

  const storeSessions = useMemo(() => {
    if (!selectedStore) return [];
    return accountSessions.filter((s) => s.storeId === selectedStore.id);
  }, [accountSessions, selectedStore]);

  const activeUser = useMemo(() => {
    if (isAutoTest) {
      if (currentStaff) {
        return {
          uid: currentStaff.id,
          email: currentStaff.email,
          displayName: currentStaff.name,
        };
      }
      if (account) {
        return { uid: account.id, email: account.email, displayName: account.displayName };
      }
    }
    if (!fbUser) return null;
    return {
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: currentStaff?.name || fbUser.displayName || fbUser.email || '',
    };
  }, [isAutoTest, currentStaff, account, fbUser]);

  const authMetadata = useMemo<AuthSecurityMetadata>(() => {
    if (isAutoTest) {
      return {
        creationTime: account ? new Date(account.createdAtMs).toUTCString() : null,
        lastSignInTime: new Date().toUTCString(),
        providerIds: ['password'],
        hasPasswordProvider: true,
      };
    }
    if (!fbUser) {
      return {
        creationTime: null,
        lastSignInTime: null,
        providerIds: [],
        hasPasswordProvider: false,
      };
    }
    const providerIds = fbUser.providerData.map((p) => p.providerId).filter(Boolean);
    return {
      creationTime: fbUser.metadata.creationTime || null,
      lastSignInTime: fbUser.metadata.lastSignInTime || null,
      providerIds,
      hasPasswordProvider: providerIds.includes('password'),
    };
  }, [isAutoTest, account, fbUser]);

  const planEvaluation = useMemo(
    () => (account ? evaluateAccountPlan(account, Date.now()) : null),
    [account]
  );

  const selectedStorePermissions = useMemo(
    () => getStorePermissions(selectedStore, account),
    [selectedStore, account]
  );

  const loginHistory = useMemo(
    () => accountActivities.filter((a) => a.type === 'login'),
    [accountActivities]
  );

  const deviceRejectedAlerts = useMemo(
    () => accountActivities.filter((a) => a.type === 'device_rejected'),
    [accountActivities]
  );

  const hasUnreadChangelog = useMemo(() => {
    if (!account || changelog.length === 0) return false;
    const newestMs = changelog[0].createdAtMs;
    if (!account.lastChangelogReadAtMs) return true;
    return newestMs > account.lastChangelogReadAtMs;
  }, [account, changelog]);

  // ─── Auth & Security Mutations ─────────────────────────────────────────
  const verifyAdminPortalAuthorization = useCallback(async (signedInUser: User): Promise<void> => {
    const emailLower = (signedInUser.email || '').trim().toLowerCase();
    let authorized = isSuperAdminEmail(emailLower);
    if (!authorized) {
      try {
        const accSnap = await getDoc(doc(db, 'payAccounts', signedInUser.uid));
        if (accSnap.exists() && Boolean(accSnap.data().isSuperAdmin)) {
          authorized = true;
        }
      } catch {
        authorized = false;
      }
    }
    if (!authorized) {
      try {
        const staffSnap = await getDoc(doc(db, 'staff', signedInUser.uid));
        if (staffSnap.exists()) {
          const staffData = mapStaffMember(staffSnap.id, staffSnap.data());
          if (staffData.status === 'disabled') {
            await signOut(auth).catch(() => {});
            throw new Error(
              'আপনার স্টাফ অ্যাকাউন্টটি বর্তমানে বন্ধ আছে। সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।'
            );
          }
          authorized = true;
        }
      } catch (staffErr) {
        if (staffErr instanceof Error && staffErr.message.includes('বন্ধ আছে')) {
          throw staffErr;
        }
        authorized = false;
      }
    }
    if (!authorized) {
      await signOut(auth).catch(() => {});
      throw new Error('এই পোর্টালটি শুধু অ্যাডমিনের জন্য');
    }
  }, []);

  const signInWithGoogle = useCallback(
    async (portal: 'buyer' | 'admin' = 'buyer') => {
      if (isAutoTest) return;
      if (portal === 'admin') {
        adminPortalCheckingRef.current = true;
        try {
          const cred = await signInWithPopup(auth, googleProvider);
          await verifyAdminPortalAuthorization(cred.user);
          adminPortalCheckingRef.current = false;
          setFbUser(cred.user);
          setAuthReady(true);
        } catch (err) {
          adminPortalCheckingRef.current = false;
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('INTERNAL ASSERTION FAILED') || msg.includes('popup') || msg.includes('cancelled')) {
            throw new Error('ব্রাউজার পপআপ ব্লক করা হয়েছে বা আইফ্রেম পরিবেশে পপআপ সম্ভব নয়। অনুগ্রহ করে ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন।');
          }
          throw err;
        }
        return;
      }
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('INTERNAL ASSERTION FAILED') || msg.includes('popup') || msg.includes('cancelled')) {
          throw new Error('ব্রাউজার পপআপ ব্লক করা হয়েছে বা আইফ্রেম পরিবেশে পপআপ সম্ভব নয়। অনুগ্রহ করে ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন।');
        }
        throw err;
      }
    },
    [isAutoTest, verifyAdminPortalAuthorization]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string, portal: 'buyer' | 'admin' = 'buyer') => {
      if (isAutoTest) return;
      if (portal === 'admin') {
        adminPortalCheckingRef.current = true;
        try {
          const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
          await verifyAdminPortalAuthorization(cred.user);
          adminPortalCheckingRef.current = false;
          setFbUser(cred.user);
          setAuthReady(true);
        } catch (err) {
          adminPortalCheckingRef.current = false;
          throw err;
        }
        return;
      }
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    [isAutoTest, verifyAdminPortalAuthorization]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (isAutoTest) return;
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const cleanName = displayName.trim().slice(0, 80);
      if (cleanName) {
        await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
      }
    },
    [isAutoTest]
  );

  /**
   * Step 4 Funnel Account Creation:
   * - Paid path: creates Firebase Auth user, redeems single-use server-issued claimToken via Worker
   *   (Worker atomically activates paid plan & burns token), then signs out immediately so the buyer
   *   always completes Step 5 (/login) with their new email.
   * - Trial path: verifies trialPlanId is configured, creates Firebase Auth user & trial payAccounts/{uid},
   *   then signs out immediately so the buyer completes Step 5 (/login).
   */
  const signUpFunnelAccount = useCallback(
    async (input: {
      email: string;
      password: string;
      displayName: string;
      mode: 'paid' | 'trial';
      purchaseId?: string;
      claimToken?: string;
    }): Promise<{ email: string; planName: string }> => {
      const cleanEmail = input.email.trim().toLowerCase();
      const cleanName = (input.displayName || cleanEmail.split('@')[0] || 'মার্চেন্ট')
        .trim()
        .slice(0, 80);

      if (input.mode === 'trial') {
        const trialId = (platformConfig.trialPlanId || '').trim();
        const trialPlan = trialId ? plans.find((p) => p.id === trialId && !p.archived) : null;
        if (!trialPlan) {
          throw new Error('বর্তমানে ফ্রি ট্রায়াল চালু নেই। অনুগ্রহ করে একটি প্যাকেজ বেছে নিন।');
        }
        if (isAutoTest) {
          return { email: cleanEmail, planName: trialPlan.name };
        }

        funnelSignupInProgressRef.current = true;
        try {
          const cred = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
          try {
            if (cleanName) {
              await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
            }
            const trialEnd = Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS);
            await setDoc(doc(db, 'payAccounts', cred.user.uid), {
              email: cleanEmail,
              displayName: cleanName,
              isSuperAdmin: false,
              planStatus: 'trial',
              planTier: 'basic',
              planId: trialPlan.id,
              trialEndsAt: trialEnd,
              paidUntil: null,
              dailySessionCap: trialPlan.dailySessionCap || 200,
              dailySessionCapOverride: null,
              storeLimitOverride: null,
              ownedAddons: [],
              lastChangelogReadAt: null,
              tokensRevokedAt: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            const dirHash = await hashEmailForDirectory(cleanEmail);
            await setDoc(doc(db, 'payDirectory', dirHash), {
              accountId: cred.user.uid,
              displayName: cleanName,
            }).catch(() => {});
          } catch (setupErr) {
            await cred.user.delete().catch(() => {});
            throw setupErr;
          } finally {
            await signOut(auth).catch(() => {});
          }
          return { email: cleanEmail, planName: trialPlan.name };
        } finally {
          funnelSignupInProgressRef.current = false;
        }
      }

      // Paid path: strictly requires Worker + purchaseId + single-use server-issued claimToken
      const workerBase = normalizeWorkerBaseUrl(platformConfig.workerBaseUrl);
      if (!workerBase) {
        throw new Error('পেমেন্ট সার্ভার (Worker URL) কনফিগার করা হয়নি।');
      }
      if (!input.purchaseId || !input.claimToken) {
        throw new Error('এই লিংকটি আর ব্যবহার করা যাবে না');
      }
      if (isAutoTest) {
        return { email: cleanEmail, planName: 'প্যাকেজ' };
      }

      funnelSignupInProgressRef.current = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
        try {
          if (cleanName) {
            await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
          }
          const idToken = await cred.user.getIdToken();
          const claimed = await redeemSubscriptionClaimToken(workerBase, idToken, {
            purchaseId: input.purchaseId,
            claimToken: input.claimToken,
            displayName: cleanName,
          });
          const dirHash = await hashEmailForDirectory(cleanEmail);
          await setDoc(doc(db, 'payDirectory', dirHash), {
            accountId: cred.user.uid,
            displayName: cleanName,
          }).catch(() => {});
          return { email: cleanEmail, planName: claimed.planName };
        } catch (claimErr) {
          // If server-side claim fails (token expired/already used), delete freshly created auth user
          await cred.user.delete().catch(() => {});
          throw claimErr;
        } finally {
          // NEVER auto-login after Step 4; buyer proceeds cleanly to Step 5 (/login)
          await signOut(auth).catch(() => {});
        }
      } finally {
        funnelSignupInProgressRef.current = false;
      }
    },
    [isAutoTest, platformConfig.trialPlanId, platformConfig.workerBaseUrl, plans]
  );

  const reauthenticateUser = useCallback(
    async (password?: string) => {
      if (isAutoTest) {
        if (!password || password.trim().length < 4) {
          throw new Error('নিরাপত্তার জন্য আপনার পাসওয়ার্ড লিখুন।');
        }
        return;
      }
      if (!fbUser) throw new Error('সাইন ইন করুন।');
      const hasPassword = fbUser.providerData.some((p) => p.providerId === 'password');
      if (hasPassword) {
        if (!password || !password.trim()) {
          throw new Error('পুনরায় নিশ্চিত করতে আপনার পাসওয়ার্ড দিন।');
        }
        if (!fbUser.email) throw new Error('অ্যাকাউন্ট ইমেইল পাওয়া যায়নি।');
        const cred = EmailAuthProvider.credential(fbUser.email, password);
        await reauthenticateWithCredential(fbUser, cred);
      } else {
        await reauthenticateWithPopup(fbUser, googleProvider);
      }
    },
    [isAutoTest, fbUser]
  );

  const signOutUser = useCallback(async () => {
    if (isAutoTest) return;
    await signOut(auth);
  }, [isAutoTest]);

  const signOutAllSessions = useCallback(async () => {
    if (!account) return { localSignedOut: false, workerRevocationPending: true };
    const now = Date.now();
    if (isAutoTest) {
      setAccount((prev) => (prev ? { ...prev, tokensRevokedAtMs: now } : prev));
      return { localSignedOut: true, workerRevocationPending: true };
    }
    try {
      await updateDoc(doc(db, 'payAccounts', account.id), {
        tokensRevokedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Proceed to local signOut even if timestamp write fails
    }
    await signOut(auth);
    return { localSignedOut: true, workerRevocationPending: true };
  }, [account, isAutoTest]);

  const markChangelogRead = useCallback(async () => {
    if (!account) return;
    const now = Date.now();
    if (isAutoTest) {
      setAccount((prev) => (prev ? { ...prev, lastChangelogReadAtMs: now } : prev));
      return;
    }
    try {
      await updateDoc(doc(db, 'payAccounts', account.id), {
        lastChangelogReadAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-fatal
    }
  }, [account, isAutoTest]);

  // ─── Store Mutations ──────────────────────────────────────────────────
  const createStore = useCallback(
    async (rawName: string): Promise<{ store: PayStoreDoc; rawStoreKey: string }> => {
      if (!activeUser || !account || !effectivePlan) throw new Error('সাইন ইন করুন।');
      const name = rawName.trim().slice(0, 80);
      if (!name) throw new Error('স্টোরের নাম লিখুন।');

      const check = canCreateStoreUnderPlan(account, effectivePlan, ownedStores.length, Date.now());
      if (!check.allowed) {
        throw new Error(check.reasonBn || 'নতুন স্টোর তৈরি করা যাবে না।');
      }

      const id = generateDocId('store');
      const { rawKey, keyHash } = await generateStoreKey();
      const storeType: StoreType = account.isSuperAdmin ? 'own' : 'customer';
      const nowMs = Date.now();

      const emptyAccounts = buildEmptyPaymentAccounts();
      const emptyEnabled = buildEmptyEnabledMap();
      const newStore: PayStoreDoc = {
        id,
        accountId: account.id,
        name,
        type: storeType,
        numbers: { bkash: '', nagad: '', rocket: '', upay: '' },
        numberEnabled: emptyEnabled,
        paymentAccounts: emptyAccounts,
        uniquePaisa: false,
        sessionMinutes: 15,
        storeKeyHash: keyHash,
        storeKeyLegacy: false,
        webhookUrl: '',
        webhookSecretSet: false,
        lastWebhook: null,
        logoUrl: '',
        accentColor: DEFAULT_STORE_ACCENT,
        memberRoles: {},
        memberEmails: {},
        memberUids: [],
        createdAtMs: nowMs,
      };

      if (isAutoTest) {
        setOwnedStores((prev) => [...prev, newStore]);
        setAllStores((prev) => [newStore, ...prev]);
        setSelectedStoreId(id);
        return { store: newStore, rawStoreKey: rawKey };
      }

      try {
        await setDoc(doc(db, 'payStores', id), {
          accountId: account.id,
          name,
          type: storeType,
          numbers: newStore.numbers,
          numberEnabled: newStore.numberEnabled,
          paymentAccounts: emptyAccounts,
          uniquePaisa: false,
          sessionMinutes: 15,
          storeKeyHash: keyHash,
          storeKeyLegacy: false,
          webhookUrl: '',
          webhookSecretSet: false,
          lastWebhook: null,
          logoUrl: '',
          accentColor: DEFAULT_STORE_ACCENT,
          memberRoles: {},
          memberEmails: {},
          memberUids: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSelectedStoreId(id);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `payStores/${id}`);
      }

      return { store: newStore, rawStoreKey: rawKey };
    },
    [activeUser, account, effectivePlan, ownedStores.length, isAutoTest, setSelectedStoreId]
  );

  const saveStorePaymentMethods = useCallback(
    async (
      storeId: string,
      rawPaymentAccounts: PaymentAccountsMap,
      rawNumberEnabled: WalletEnabledMap
    ) => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      if (pausedStoreIds.has(storeId)) {
        throw new Error('এই স্টোরটি প্ল্যান লিমিটের বাইরে থাকায় পজ করা আছে — পরিবর্তন করা যাবে না।');
      }
      const target = accessibleStores.find((s) => s.id === storeId);
      const perms = getStorePermissions(target || null, account);
      if (!target || !perms.canEditSettings) {
        throw new Error('এই স্টোরের পেমেন্ট মাধ্যম পরিবর্তন করার অনুমতি আপনার নেই।');
      }

      const cleanedAccounts: NormalizedPaymentAccountsMap = normalizePaymentAccounts(rawPaymentAccounts);
      const nextEnabled = enforceEnabledRequiresSavedNumber(rawNumberEnabled, cleanedAccounts);
      const syncedNumbers = syncLegacyNumbersFromAccounts(cleanedAccounts);

      if (isAutoTest) {
        const applyLocal = (s: PayStoreDoc): PayStoreDoc =>
          s.id === storeId
            ? {
                ...s,
                paymentAccounts: cleanedAccounts,
                numbers: syncedNumbers,
                numberEnabled: nextEnabled,
              }
            : s;
        setOwnedStores((prev) => prev.map(applyLocal));
        setSharedStores((prev) => prev.map(applyLocal));
        setAllStores((prev) => prev.map(applyLocal));
        return;
      }

      try {
        await updateDoc(doc(db, 'payStores', storeId), {
          paymentAccounts: cleanedAccounts,
          numbers: syncedNumbers,
          numberEnabled: nextEnabled,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }
    },
    [activeUser, account, accessibleStores, pausedStoreIds, isAutoTest]
  );

  const saveStoreSettings = useCallback(
    async (
      storeId: string,
      input: {
        name: string;
        numbers?: WalletNumbersMap;
        numberEnabled?: WalletEnabledMap;
        uniquePaisa: boolean;
        sessionMinutes: number;
        logoUrl: string;
        accentColor: string;
        webhookUrl: string;
        webhookSecret?: string;
      }
    ) => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      if (pausedStoreIds.has(storeId)) {
        throw new Error('এই স্টোরটি প্ল্যান লিমিটের বাইরে থাকায় পজ করা আছে — পরিবর্তন করা যাবে না।');
      }
      const target = accessibleStores.find((s) => s.id === storeId);
      const perms = getStorePermissions(target || null, account);
      if (!target || !perms.canEditSettings) {
        throw new Error('এই স্টোরের সেটিংস পরিবর্তন করার অনুমতি আপনার নেই।');
      }

      const name = input.name.trim().slice(0, 80);
      if (!name) throw new Error('স্টোরের নাম লিখুন।');

      // Single source of truth: keep canonical paymentAccounts untouched unless updating store general/branding/webhook
      const canonicalAccounts = normalizePaymentAccounts(target.paymentAccounts, target.numbers);
      const syncedNumbers = syncLegacyNumbersFromAccounts(canonicalAccounts);
      const syncedEnabled = enforceEnabledRequiresSavedNumber(
        input.numberEnabled ?? target.numberEnabled,
        canonicalAccounts
      );

      const sessionMinutes = Math.min(120, Math.max(5, Math.trunc(Number(input.sessionMinutes) || 15)));
      const logoUrl = input.logoUrl.trim().slice(0, 512);
      if (logoUrl && !isSafeHttpUrl(logoUrl)) {
        throw new Error('লোগো URL অবশ্যই https:// বা http:// দিয়ে শুরু হতে হবে।');
      }
      const accentColor = isValidHexColor(input.accentColor)
        ? input.accentColor.trim()
        : DEFAULT_STORE_ACCENT;
      const webhookUrl = input.webhookUrl.trim().slice(0, 512);
      if (webhookUrl && !isSafeHttpUrl(webhookUrl)) {
        throw new Error('Webhook URL অবশ্যই https:// বা http:// দিয়ে শুরু হতে হবে।');
      }

      const newSecretTrimmed = (input.webhookSecret || '').trim();
      const patch: Record<string, unknown> = {
        name,
        paymentAccounts: canonicalAccounts,
        numbers: syncedNumbers,
        numberEnabled: syncedEnabled,
        uniquePaisa: Boolean(input.uniquePaisa),
        sessionMinutes,
        logoUrl,
        accentColor,
        webhookUrl,
      };
      if (newSecretTrimmed) {
        patch.webhookSecretHash = await sha256Hex(newSecretTrimmed);
        patch.webhookSecretSet = true;
      }

      if (isAutoTest) {
        const applyLocal = (s: PayStoreDoc): PayStoreDoc =>
          s.id === storeId
            ? {
                ...s,
                name,
                paymentAccounts: canonicalAccounts,
                numbers: syncedNumbers,
                numberEnabled: syncedEnabled,
                uniquePaisa: Boolean(input.uniquePaisa),
                sessionMinutes,
                logoUrl,
                accentColor,
                webhookUrl,
                webhookSecretSet: newSecretTrimmed ? true : s.webhookSecretSet,
              }
            : s;
        setOwnedStores((prev) => prev.map(applyLocal));
        setSharedStores((prev) => prev.map(applyLocal));
        setAllStores((prev) => prev.map(applyLocal));
        return;
      }

      try {
        await updateDoc(doc(db, 'payStores', storeId), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }
    },
    [activeUser, account, accessibleStores, pausedStoreIds, isAutoTest]
  );

  const savePaymentPageSettings = useCallback(
    async (
      storeId: string,
      input: {
        name: string;
        nameEn: string;
        logoUrl: string;
        logoDataUrl: string;
        numberEnabled?: WalletEnabledMap;
        paymentAccounts?: PaymentAccountsMap;
      }
    ) => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      if (pausedStoreIds.has(storeId)) {
        throw new Error('এই স্টোরটি প্ল্যান লিমিটের বাইরে থাকায় পজ করা আছে — পরিবর্তন করা যাবে না।');
      }
      const target = accessibleStores.find((s) => s.id === storeId);
      const perms = getStorePermissions(target || null, account);
      if (!target || !perms.canEditSettings) {
        throw new Error('এই স্টোরের পেমেন্ট পেজ সেটিংস পরিবর্তন করার অনুমতি আপনার নেই।');
      }

      const name = input.name.trim().slice(0, 80);
      if (!name) throw new Error('স্টোরের বাংলা নাম লিখুন।');
      const nameEn = input.nameEn.trim().slice(0, 80);

      const logoUrl = input.logoUrl.trim().slice(0, 512);
      if (logoUrl && !isSafeHttpUrl(logoUrl)) {
        throw new Error('লোগো URL অবশ্যই https:// বা http:// দিয়ে শুরু হতে হবে।');
      }
      const logoDataUrl = input.logoDataUrl.trim();
      if (logoDataUrl && !isValidLogoDataUrl(logoDataUrl)) {
        throw new Error('আপলোড করা লোগো ফাইলটি সঠিক নয় বা আকার অনেক বড়।');
      }

      const cleanedAccounts = buildEmptyPaymentAccounts();
      if (input.paymentAccounts) {
        for (const method of CHECKOUT_METHODS) {
          const rawList = Array.isArray(input.paymentAccounts[method])
            ? input.paymentAccounts[method]!
            : [];
          const seen = new Set<string>();
          for (const item of rawList) {
            const trimmed = (item.number || '').trim();
            if (!trimmed) continue;
            const norm = normalizeBdPhone(trimmed);
            if (!norm) {
              throw new Error(
                `${method.toUpperCase()} নম্বর "${trimmed}" সঠিক ১১ ডিজিটের বাংলাদেশি নম্বর হতে হবে (01XXXXXXXXX)।`
              );
            }
            if (seen.has(norm)) continue;
            seen.add(norm);
            const entryType = item.type === 'agent' ? 'agent' : 'personal';
            const actionType = normalizePaymentActionType(item.actionType, entryType);
            const customInstruction = sanitizeCustomInstruction(item.customInstruction);
            cleanedAccounts[method].push({
              number: norm,
              type: entryType,
              actionType,
              ...(customInstruction ? { customInstruction } : {}),
              active: Boolean(item.active),
            });
            if (cleanedAccounts[method].length >= 10) break;
          }
        }
      } else {
        const existingNorm = normalizePaymentAccounts(target.paymentAccounts, target.numbers);
        for (const method of CHECKOUT_METHODS) {
          cleanedAccounts[method] = existingNorm[method];
        }
      }

      const nextEnabled = enforceEnabledRequiresSavedNumber(
        input.numberEnabled ?? target.numberEnabled,
        cleanedAccounts
      );
      const syncedNumbers = syncLegacyNumbersFromAccounts(cleanedAccounts);

      const enabledNames = CHECKOUT_METHODS.filter(
        (m) => nextEnabled[m] && cleanedAccounts[m].some((e) => e.active)
      );
      const summaryDetail = `নাম: ${name}${nameEn ? ` (${nameEn})` : ''}; সক্রিয় মাধ্যম: ${
        enabledNames.length > 0 ? enabledNames.join(', ') : 'কোনোটিই নয়'
      }`.slice(0, 400);

      if (isAutoTest) {
        const applyLocal = (s: PayStoreDoc): PayStoreDoc =>
          s.id === storeId
            ? {
                ...s,
                name,
                nameEn,
                logoUrl,
                logoDataUrl,
                numberEnabled: nextEnabled,
                numbers: syncedNumbers,
                paymentAccounts: cleanedAccounts,
              }
            : s;
        setOwnedStores((prev) => prev.map(applyLocal));
        setSharedStores((prev) => prev.map(applyLocal));
        setAllStores((prev) => prev.map(applyLocal));
        setActivityLog((prev) => [
          {
            id: `act_brand_${Date.now()}`,
            actorAccountId: activeUser.uid,
            actorEmail: activeUser.email,
            accountId: activeUser.uid,
            type: 'branding_change',
            action: 'update_payment_page_branding',
            targetType: 'store',
            targetId: storeId,
            detail: summaryDetail,
            note: 'পেমেন্ট পেজ সেটিংস আপডেট করা হয়েছে',
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        await updateDoc(doc(db, 'payStores', storeId), {
          name,
          nameEn,
          logoUrl,
          logoDataUrl,
          numberEnabled: nextEnabled,
          numbers: syncedNumbers,
          paymentAccounts: cleanedAccounts,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }

      // Log owner-side branding change in payActivity (non-blocking if rules reject)
      try {
        const entryId = `brand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await setDoc(doc(db, 'payActivity', entryId), {
          actorAccountId: activeUser.uid,
          actorEmail: activeUser.email,
          accountId: activeUser.uid,
          type: 'branding_change',
          action: 'update_payment_page_branding',
          targetType: 'store',
          targetId: storeId,
          detail: summaryDetail,
          note: 'পেমেন্ট পেজ সেটিংস আপডেট করা হয়েছে',
          createdAt: serverTimestamp(),
        });
      } catch {
        // Non-blocking audit write
      }
    },
    [activeUser, account, accessibleStores, pausedStoreIds, isAutoTest]
  );

  const rotateStoreKey = useCallback(
    async (storeId: string): Promise<string> => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      if (pausedStoreIds.has(storeId)) {
        throw new Error('পজ করা স্টোরের কী পরিবর্তন করা যাবে না।');
      }
      const target = accessibleStores.find((s) => s.id === storeId);
      const perms = getStorePermissions(target || null, account);
      if (!target || !perms.canRotateStoreKey) {
        throw new Error('শুধুমাত্র স্টোরের মূল মালিক স্টোর কী পরিবর্তন (রোটেট) করতে পারেন।');
      }

      const { rawKey, keyHash } = await generateStoreKey();

      if (isAutoTest) {
        const applyLocal = (s: PayStoreDoc): PayStoreDoc =>
          s.id === storeId ? { ...s, storeKeyHash: keyHash, storeKeyLegacy: false } : s;
        setOwnedStores((prev) => prev.map(applyLocal));
        setAllStores((prev) => prev.map(applyLocal));
        return rawKey;
      }

      try {
        await updateDoc(doc(db, 'payStores', storeId), {
          storeKeyHash: keyHash,
          storeKeyLegacy: false,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }
      return rawKey;
    },
    [activeUser, account, accessibleStores, pausedStoreIds, isAutoTest]
  );

  const markStoreLiveManually = useCallback(
    async (storeId: string) => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      if (isAutoTest) {
        const applyLocal = (s: PayStoreDoc): PayStoreDoc =>
          s.id === storeId ? { ...s, liveConfirmedManually: true } : s;
        setOwnedStores((prev) => prev.map(applyLocal));
        setSharedStores((prev) => prev.map(applyLocal));
        setAllStores((prev) => prev.map(applyLocal));
        return;
      }
      try {
        await updateDoc(doc(db, 'payStores', storeId), {
          liveConfirmedManually: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }
    },
    [activeUser, account, isAutoTest]
  );

  const addStoreMember = useCallback(
    async (storeId: string, rawEmail: string, role: StoreMemberRole) => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      const target =
        accessibleStores.find((s) => s.id === storeId) || allStores.find((s) => s.id === storeId);
      const perms = getStorePermissions(target || null, account);
      if (!target || !perms.canManageMembers) {
        throw new Error('মেম্বার যোগ করার অনুমতি শুধুমাত্র মূল মালিক বা সুপার অ্যাডমিনের।');
      }

      if (effectivePlan && !account.isSuperAdmin) {
        const memberLimit = effectivePlan.features.members;
        const currentCount = Object.keys(target.memberRoles).length;
        if (currentCount >= memberLimit) {
          throw new Error(
            `আপনার “${effectivePlan.plan.name}” প্ল্যানে প্রতি স্টোরে সর্বোচ্চ ${memberLimit.toLocaleString('bn-BD')} জন মেম্বার যুক্ত করা যায়।`
          );
        }
      }

      const emailLower = rawEmail.trim().toLowerCase();
      if (!emailLower || !emailLower.includes('@')) {
        throw new Error('সঠিক ইমেইল ঠিকানা লিখুন।');
      }

      if (isAutoTest) {
        const memberUid = `member_${emailLower.replace(/[^a-z0-9]/g, '_').slice(0, 20)}`;
        const nextRoles = { ...target.memberRoles, [memberUid]: role };
        const nextEmails = { ...target.memberEmails, [memberUid]: emailLower };
        const nextUids = Array.from(new Set([...target.memberUids, memberUid])).slice(0, 25);
        const applyLocal = (s: PayStoreDoc): PayStoreDoc =>
          s.id === storeId
            ? { ...s, memberRoles: nextRoles, memberEmails: nextEmails, memberUids: nextUids }
            : s;
        setOwnedStores((prev) => prev.map(applyLocal));
        setAllStores((prev) => prev.map(applyLocal));
        return;
      }

      const dirHash = await hashEmailForDirectory(emailLower);
      const dirSnap = await getDoc(doc(db, 'payDirectory', dirHash));
      if (!dirSnap.exists()) {
        throw new Error('এই ইমেইলে কোনো PayVerify BD অ্যাকাউন্ট পাওয়া যায়নি। প্রথমে তাদের সাইন আপ করতে বলুন।');
      }
      const memberUid = String(dirSnap.data().accountId || '');
      if (!memberUid || memberUid === target.accountId) {
        throw new Error('মূল মালিককে আলাদা মেম্বার হিসেবে যোগ করার প্রয়োজন নেই।');
      }

      const nextRoles = { ...target.memberRoles, [memberUid]: role };
      const nextEmails = { ...target.memberEmails, [memberUid]: emailLower };
      const nextUids = Array.from(new Set([...target.memberUids, memberUid])).slice(0, 25);

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'payStores', storeId), {
          memberRoles: nextRoles,
          memberEmails: nextEmails,
          memberUids: nextUids,
          updatedAt: serverTimestamp(),
        });
        if (target.accountId === account.id) {
          const ownStoreSessions = ownedSessions.filter((s) => s.storeId === storeId).slice(0, 200);
          for (const sess of ownStoreSessions) {
            batch.update(doc(db, 'paySessions', sess.id), { memberUids: nextUids });
          }
        }
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }
    },
    [activeUser, account, effectivePlan, accessibleStores, allStores, ownedSessions, isAutoTest]
  );

  const removeStoreMember = useCallback(
    async (storeId: string, memberUid: string) => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      const target =
        accessibleStores.find((s) => s.id === storeId) || allStores.find((s) => s.id === storeId);
      const perms = getStorePermissions(target || null, account);
      if (!target || !perms.canManageMembers) {
        throw new Error('মেম্বার বাদ দেওয়ার অনুমতি আপনার নেই।');
      }

      const nextRoles = { ...target.memberRoles };
      delete nextRoles[memberUid];
      const nextEmails = { ...target.memberEmails };
      delete nextEmails[memberUid];
      const nextUids = target.memberUids.filter((id) => id !== memberUid);

      if (isAutoTest) {
        const applyLocal = (s: PayStoreDoc): PayStoreDoc =>
          s.id === storeId
            ? { ...s, memberRoles: nextRoles, memberEmails: nextEmails, memberUids: nextUids }
            : s;
        setOwnedStores((prev) => prev.map(applyLocal));
        setAllStores((prev) => prev.map(applyLocal));
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'payStores', storeId), {
          memberRoles: nextRoles,
          memberEmails: nextEmails,
          memberUids: nextUids,
          updatedAt: serverTimestamp(),
        });
        if (target.accountId === account.id) {
          const ownStoreSessions = ownedSessions.filter((s) => s.storeId === storeId).slice(0, 200);
          for (const sess of ownStoreSessions) {
            batch.update(doc(db, 'paySessions', sess.id), { memberUids: nextUids });
          }
        }
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }
    },
    [activeUser, account, accessibleStores, allStores, ownedSessions, isAutoTest]
  );

  const deleteStore = useCallback(
    async (storeId: string) => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      const target =
        accessibleStores.find((s) => s.id === storeId) || allStores.find((s) => s.id === storeId);
      const perms = getStorePermissions(target || null, account);
      if (!target || !perms.canDeleteStore) {
        throw new Error('স্টোর মুছে ফেলার অনুমতি শুধুমাত্র মূল মালিক বা সুপার অ্যাডমিনের।');
      }
      if (isAutoTest) {
        setOwnedStores((prev) => prev.filter((s) => s.id !== storeId));
        setAllStores((prev) => prev.filter((s) => s.id !== storeId));
        return;
      }
      try {
        await deleteDoc(doc(db, 'payStores', storeId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `payStores/${storeId}`);
      }
    },
    [activeUser, account, accessibleStores, allStores, isAutoTest]
  );

  // ─── Session & SMS Mutations ──────────────────────────────────────────
  const createManualSessionViaWorker = useCallback(
    async (input: {
      storeId: string;
      orderId: string;
      amountPaisa: number;
      method: WalletMethod;
      storeKey: string;
      successUrl?: string;
      failUrl?: string;
    }) => {
      if (!account || !effectivePlan) throw new Error('সাইন ইন করুন।');
      if (pausedStoreIds.has(input.storeId)) {
        throw new Error('এই স্টোরটি প্ল্যান লিমিটের বাইরে থাকায় পজ করা আছে — নতুন সেশন তৈরি করা যাবে না।');
      }
      const plan = evaluateAccountPlan(account, Date.now());
      if (!plan.canCreateSessions) {
        throw new Error('আপনার অ্যাকাউন্টের মেয়াদ শেষ বা স্থগিত থাকায় নতুন সেশন তৈরি করা যাবে না।');
      }
      const todayCount = countSessionsToday(ownedSessions, Date.now());
      const cap = effectivePlan.dailySessionCap;
      if (!account.isSuperAdmin && cap > 0 && todayCount >= cap) {
        throw new Error(
          `আজকের দৈনিক সেশন সীমা (${cap.toLocaleString('bn-BD')}) পূর্ণ হয়েছে।`
        );
      }

      return createWorkerSession(platformConfig.workerBaseUrl, input.storeKey, {
        orderId: input.orderId,
        amountPaisa: input.amountPaisa,
        method: input.method,
        storeId: input.storeId,
        successUrl: input.successUrl,
        failUrl: input.failUrl,
      });
    },
    [account, effectivePlan, pausedStoreIds, ownedSessions, platformConfig.workerBaseUrl]
  );

  const cancelWaitingSession = useCallback(
    async (sessionId: string) => {
      if (!activeUser) throw new Error('সাইন ইন করুন।');
      if (isAutoTest) {
        setOwnedSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, status: 'cancelled' } : s))
        );
        return;
      }
      try {
        await updateDoc(doc(db, 'paySessions', sessionId), { status: 'cancelled' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `paySessions/${sessionId}`);
      }
    },
    [activeUser, isAutoTest]
  );

  const manualConfirmSession = useCallback(
    async (sessionId: string, note: string) => {
      if (!activeUser) throw new Error('সাইন ইন করুন।');
      const trimmedNote = note.trim().slice(0, 200);
      if (!trimmedNote) {
        throw new Error('ম্যানুয়াল কনফার্মের জন্য নোট লেখা বাধ্যতামূলক।');
      }
      if (isAutoTest) {
        const now = Date.now();
        setOwnedSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, status: 'paid', paidAtMs: now, manual: true, manualNote: trimmedNote }
              : s
          )
        );
        return;
      }
      try {
        await updateDoc(doc(db, 'paySessions', sessionId), {
          status: 'paid',
          paidAt: serverTimestamp(),
          manual: true,
          manualNote: trimmedNote,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `paySessions/${sessionId}`);
      }
    },
    [activeUser, isAutoTest]
  );

  const matchUnmatchedSmsToSession = useCallback(
    async (sms: PaySmsDoc, sessionId: string) => {
      if (!activeUser) throw new Error('সাইন ইন করুন।');
      if (!sessionId) throw new Error('একটি অপেক্ষমাণ সেশন নির্বাচন করুন।');
      const trxId = sms.trxId.trim().toUpperCase();
      if (trxId.length < 4) throw new Error('এই SMS-এ বৈধ TrxID নেই।');

      if (isAutoTest) {
        const now = Date.now();
        setOwnedSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  status: 'paid',
                  source: 'manual',
                  manual: true,
                  trxId,
                  sender: sms.sender,
                  paidAtMs: now,
                }
              : s
          )
        );
        setSmsList((prev) =>
          prev.map((m) =>
            m.id === sms.id ? { ...m, matchResult: 'matched', matched: true, sessionId } : m
          )
        );
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'paySessions', sessionId), {
          status: 'paid',
          source: 'manual',
          manual: true,
          trxId,
          sender: sms.sender,
          paidAt: serverTimestamp(),
        });
        batch.update(doc(db, 'paySms', sms.id), {
          matchResult: 'matched',
          matched: true,
          sessionId,
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `paySms/${sms.id}`);
      }
    },
    [activeUser, isAutoTest]
  );

  const dismissUnmatchedSms = useCallback(
    async (smsId: string) => {
      if (!activeUser) throw new Error('সাইন ইন করুন।');
      if (isAutoTest) {
        setSmsList((prev) => prev.map((m) => (m.id === smsId ? { ...m, dismissed: true } : m)));
        return;
      }
      try {
        await updateDoc(doc(db, 'paySms', smsId), { dismissed: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `paySms/${smsId}`);
      }
    },
    [activeUser, isAutoTest]
  );

  useEffect(() => {
    if (!account) {
      setTestHistoryClearedBeforeMs(0);
      return;
    }
    try {
      const saved = window.localStorage.getItem(`payverify_test_history_cleared_${account.id}`);
      const parsed = saved ? Number(saved) : 0;
      setTestHistoryClearedBeforeMs(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
    } catch {
      setTestHistoryClearedBeforeMs(0);
    }
  }, [account]);

  const clearTestHistory = useCallback(() => {
    const now = Date.now();
    setTestHistoryClearedBeforeMs(now);
    if (account) {
      try {
        window.localStorage.setItem(`payverify_test_history_cleared_${account.id}`, String(now));
      } catch {
        // Ignore
      }
    }
  }, [account]);

  const createTestVerificationSession = useCallback(
    async (input: {
      storeId: string;
      method: WalletMethod;
      amountPaisa: number;
      testType: TestVerificationType;
    }): Promise<PaySessionDoc> => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      const targetStore = accessibleStores.find((s) => s.id === input.storeId);
      if (!targetStore) {
        throw new Error('স্টোরটি খুঁজে পাওয়া যায়নি।');
      }
      const perms = getStorePermissions(targetStore, account);
      if (!perms.canCreateSession && !perms.canEditSettings) {
        throw new Error('এই স্টোরে টেস্ট যাচাই চালানোর অনুমতি নেই।');
      }
      if (pausedStoreIds.has(targetStore.id)) {
        throw new Error('এই স্টোরটি প্ল্যান লিমিটের বাইরে থাকায় পজ করা আছে।');
      }

      const enabledOptions = getStoreEnabledMethodOptions(targetStore);
      const chosenOption = enabledOptions.find((o) => o.method === input.method);
      if (!chosenOption) {
        throw new Error('নির্বাচিত মাধ্যমটি এই স্টোরে চালু নেই বা বৈধ নম্বর সেট করা হয়নি।');
      }

      const amountPaisa = Math.trunc(input.amountPaisa);
      if (!Number.isInteger(amountPaisa) || amountPaisa < 100 || amountPaisa > 100_000_000) {
        throw new Error('সঠিক টাকার পরিমাণ দিন (সর্বনিম্ন ৳১)।');
      }

      // Notice: Test sessions NEVER check or deduct dailySessionCap quota,
      // expire fast (15 minutes), and NEVER fire the store's production webhook.
      const nowMs = Date.now();
      const expiresAtMs = nowMs + TEST_SESSION_TTL_MS;
      const suffix = Math.random().toString(36).toUpperCase().slice(2, 6);
      const orderId = `TEST-${suffix}-${String(nowMs).slice(-4)}`;

      let sessionId = generateDocId('test');
      let resolvedNumber = chosenOption.number;
      let resolvedPayable = amountPaisa;
      let resolvedExpiresAt = expiresAtMs;
      let persistedByWorker = false;

      if (!isAutoTest && fbUser && platformConfig.workerBaseUrl) {
        const idToken = await fbUser.getIdToken();
        const workerRes = await createTestWorkerSession(
          platformConfig.workerBaseUrl,
          idToken,
          {
            storeId: targetStore.id,
            method: input.method,
            amountPaisa,
            testType: input.testType,
          }
        );
        if (workerRes.supported && workerRes.session) {
          sessionId = workerRes.session.sessionId || sessionId;
          resolvedNumber = workerRes.session.number || resolvedNumber;
          resolvedPayable = workerRes.session.payablePaisa || amountPaisa;
          const workerExp = Number(workerRes.session.expiresAt);
          if (Number.isFinite(workerExp) && workerExp > nowMs) {
            resolvedExpiresAt = workerExp;
          }
          persistedByWorker = true;
        }
      }

      const newSession: PaySessionDoc = {
        id: sessionId,
        accountId: targetStore.accountId,
        storeId: targetStore.id,
        orderId,
        method: input.method,
        number: resolvedNumber,
        amountPaisa,
        payablePaisa: resolvedPayable,
        status: 'waiting',
        trxId: null,
        sender: null,
        createdAtMs: nowMs,
        expiresAtMs: resolvedExpiresAt,
        paidAtMs: null,
        source: 'kenax',
        manual: false,
        memberUids: targetStore.memberUids,
        isTest: true,
        testType: input.testType,
        testResult: 'pending',
        failureReason: null,
        expectedAmountPaisa: resolvedPayable,
        receivedAmountPaisa: null,
        simulated: false,
        webhookFired: false,
      };

      if (isAutoTest) {
        setOwnedSessions((prev) => [newSession, ...prev]);
        return newSession;
      }

      if (!persistedByWorker) {
        try {
          await setDoc(doc(db, 'paySessions', sessionId), {
            accountId: targetStore.accountId,
            storeId: targetStore.id,
            orderId,
            method: input.method,
            number: resolvedNumber,
            amountPaisa,
            payablePaisa: resolvedPayable,
            status: 'waiting',
            trxId: null,
            sender: null,
            createdAt: Timestamp.fromMillis(nowMs),
            expiresAt: Timestamp.fromMillis(resolvedExpiresAt),
            paidAt: null,
            source: 'kenax',
            manual: false,
            memberUids: targetStore.memberUids,
            isTest: true,
            testType: input.testType,
            testResult: 'pending',
            failureReason: null,
            expectedAmountPaisa: resolvedPayable,
            receivedAmountPaisa: null,
            simulated: false,
            webhookFired: false,
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `paySessions/${sessionId}`);
        }
      }

      return newSession;
    },
    [
      activeUser,
      account,
      accessibleStores,
      pausedStoreIds,
      isAutoTest,
      fbUser,
      platformConfig.workerBaseUrl,
    ]
  );

  const sendSimulatedTestSms = useCallback(
    async (
      sessionId: string
    ): Promise<{
      session: PaySessionDoc;
      sampleSms: GeneratedSampleWalletSms;
      webhookFired: boolean;
    }> => {
      if (!activeUser || !account) throw new Error('সাইন ইন করুন।');
      const targetSession = accountSessions.find((s) => s.id === sessionId);
      if (!targetSession) {
        throw new Error('টেস্ট সেশনটি খুঁজে পাওয়া যায়নি।');
      }
      // Hard client + server guard: simulated SMS can ONLY verify isTest === true sessions
      if (targetSession.isTest !== true) {
        throw new Error('নিরাপত্তা নীতি: সিমুলেটেড SMS কখনো আসল সেশন যাচাই করতে পারবে না।');
      }

      const targetStore = accessibleStores.find((s) => s.id === targetSession.storeId) || null;
      const usedTrxIds = new Set<string>();
      for (const s of smsList) {
        if (s.trxId) usedTrxIds.add(s.trxId.trim().toUpperCase());
      }
      for (const sess of accountSessions) {
        if (sess.trxId) usedTrxIds.add(sess.trxId.trim().toUpperCase());
      }

      const nowMs = Date.now();
      const sampleSms = generateSampleWalletSms({
        method: targetSession.method,
        amountPaisa: targetSession.payablePaisa,
        receiverNumber: targetSession.number,
        existingTrxIds: usedTrxIds,
        timestampMs: nowMs,
      });

      // Evaluate via shared server-equivalent safety rules
      const evaluation = evaluateSmsAgainstSession({
        session: targetSession,
        sms: {
          method: sampleSms.method,
          amountPaisa: sampleSms.amountPaisa,
          sender: sampleSms.customerPhone,
          trxId: sampleSms.trxId,
          simulated: true,
        },
        usedTrxIds,
        nowMs,
        webhookUrl: targetStore?.webhookUrl || '',
      });

      if (!evaluation.ok && evaluation.rejectedForbidden) {
        throw new Error(evaluation.failureReasonBn);
      }

      // Try Worker POST /sms/ingest first if workerBaseUrl is configured
      let handledByWorker = false;
      if (!isAutoTest && fbUser && platformConfig.workerBaseUrl) {
        const idToken = await fbUser.getIdToken();
        const workerRes = await submitSmsIngestWithSimulation(
          platformConfig.workerBaseUrl,
          { firebaseIdToken: idToken },
          {
            storeId: targetSession.storeId,
            sessionId: targetSession.id,
            method: sampleSms.method,
            amountPaisa: sampleSms.amountPaisa,
            sender: sampleSms.customerPhone,
            trxId: sampleSms.trxId,
            raw: sampleSms.raw,
            smsTimeMs: sampleSms.smsTimeMs,
            simulated: true,
          }
        );
        if (workerRes.supported) {
          handledByWorker = true;
          const updatedFromWorker: PaySessionDoc = {
            ...targetSession,
            status: workerRes.ok ? 'paid' : 'failed',
            trxId: workerRes.trxId ?? sampleSms.trxId,
            sender: sampleSms.customerPhone,
            paidAtMs: workerRes.ok ? nowMs : null,
            testResult: workerRes.testResult || (workerRes.ok ? 'verified_simulated' : 'failed'),
            failureReason: workerRes.failureReason || null,
            simulated: true,
            webhookFired: false, // Test sessions never fire production webhook
          };
          return {
            session: updatedFromWorker,
            sampleSms,
            webhookFired: false,
          };
        }
      }

      const smsDocId = generateDocId('simsms');
      const nextSession: PaySessionDoc = evaluation.ok
        ? {
            ...targetSession,
            status: 'paid',
            trxId: evaluation.trxId,
            sender: sampleSms.customerPhone,
            paidAtMs: evaluation.paidAtMs,
            testResult: 'verified_simulated',
            failureReason: null,
            expectedAmountPaisa: targetSession.payablePaisa,
            receivedAmountPaisa: sampleSms.amountPaisa,
            simulated: true,
            webhookFired: false,
          }
        : {
            ...targetSession,
            status: evaluation.failureCode === 'expired' ? 'expired' : 'failed',
            trxId: sampleSms.trxId,
            sender: sampleSms.customerPhone,
            testResult: 'failed',
            failureReason: evaluation.failureCode,
            expectedAmountPaisa: evaluation.expectedAmountPaisa,
            receivedAmountPaisa: evaluation.receivedAmountPaisa,
            simulated: true,
            webhookFired: false,
          };

      const nextSmsDoc: PaySmsDoc = {
        id: smsDocId,
        accountId: targetSession.accountId,
        storeId: targetSession.storeId,
        method: sampleSms.method,
        amountPaisa: sampleSms.amountPaisa,
        sender: sampleSms.customerPhone,
        trxId: sampleSms.trxId,
        smsTimeMs: sampleSms.smsTimeMs,
        receivedAtMs: nowMs,
        raw: sampleSms.raw,
        matchResult: evaluation.ok ? 'matched' : 'unmatched',
        matched: evaluation.ok,
        dismissed: false,
        sessionId: targetSession.id,
        simulated: true,
      };

      if (isAutoTest) {
        setOwnedSessions((prev) =>
          prev.map((s) => (s.id === targetSession.id ? nextSession : s))
        );
        setSmsList((prev) => [nextSmsDoc, ...prev]);
        return { session: nextSession, sampleSms, webhookFired: false };
      }

      if (!handledByWorker) {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'paySessions', targetSession.id), {
            status: nextSession.status,
            trxId: nextSession.trxId,
            sender: nextSession.sender,
            paidAt: nextSession.paidAtMs ? Timestamp.fromMillis(nextSession.paidAtMs) : null,
            testResult: nextSession.testResult,
            simulated: true,
            failureReason: nextSession.failureReason ?? null,
            expectedAmountPaisa: nextSession.expectedAmountPaisa ?? targetSession.payablePaisa,
            receivedAmountPaisa: nextSession.receivedAmountPaisa ?? sampleSms.amountPaisa,
            webhookFired: false,
          });
          batch.set(doc(db, 'paySms', smsDocId), {
            accountId: targetSession.accountId,
            storeId: targetSession.storeId,
            method: sampleSms.method,
            amountPaisa: sampleSms.amountPaisa,
            sender: sampleSms.customerPhone,
            trxId: sampleSms.trxId,
            smsTime: sampleSms.smsTimeMs,
            receivedAt: Timestamp.fromMillis(nowMs),
            raw: sampleSms.raw,
            matchResult: nextSmsDoc.matchResult,
            matched: nextSmsDoc.matched,
            dismissed: false,
            sessionId: targetSession.id,
            simulated: true,
          });
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `paySessions/${targetSession.id}`);
        }
      }

      return { session: nextSession, sampleSms, webhookFired: false };
    },
    [
      activeUser,
      account,
      accountSessions,
      accessibleStores,
      smsList,
      isAutoTest,
      fbUser,
      platformConfig.workerBaseUrl,
    ]
  );

  // ─── Hard Device Binding (Single-use 10-min pairingTokens + deviceLimit) ─
  const issueSingleUsePairingToken = useCallback(
    async (deviceName: string): Promise<{ token: PairingTokenDoc; qrPayload: string }> => {
      if (!activeUser || !account || !effectivePlan) throw new Error('সাইন ইন করুন।');
      const activeCount = devices.filter((d) => d.active).length;
      const limitCheck = canPairAnotherDevice(account, effectivePlan, activeCount, Date.now());
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.reasonBn || 'নতুন ফোন যুক্ত করা যাবে না।');
      }

      const cleanName = deviceName.trim().slice(0, 64) || 'দোকানের ফোন';
      const nowMs = Date.now();
      const expiresAtMs = computePairingTokenExpiry(nowMs);
      const code = generatePairingTokenCode();
      const id = generateDocId('pair');
      const token: PairingTokenDoc = {
        id,
        code,
        accountId: account.id,
        deviceName: cleanName,
        expiresAtMs,
        usedAtMs: null,
        createdAtMs: nowMs,
      };
      const qrPayload = buildPairingQrPayload(platformConfig.workerBaseUrl, code);

      if (isAutoTest) {
        setPairingTokens((prev) => [token, ...prev]);
        return { token, qrPayload };
      }

      try {
        await setDoc(doc(db, 'pairingTokens', id), {
          code,
          accountId: account.id,
          deviceName: cleanName,
          expiresAt: Timestamp.fromMillis(expiresAtMs),
          usedAt: null,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `pairingTokens/${id}`);
      }

      return { token, qrPayload };
    },
    [activeUser, account, effectivePlan, devices, platformConfig.workerBaseUrl, isAutoTest]
  );

  const revokeDevice = useCallback(
    async (deviceId: string) => {
      if (!activeUser) throw new Error('সাইন ইন করুন।');
      const rotatedHash = await generateRotatedRevokedHash();

      if (isAutoTest) {
        const applyLocal = (d: PayDeviceDoc) =>
          d.id === deviceId ? { ...d, active: false, keyHash: rotatedHash } : d;
        setDevices((prev) => prev.map(applyLocal));
        setAllDevices((prev) => prev.map(applyLocal));
        return;
      }

      try {
        await updateDoc(doc(db, 'payDevices', deviceId), {
          active: false,
          keyHash: rotatedHash,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payDevices/${deviceId}`);
      }
    },
    [activeUser, isAutoTest]
  );

  // ─── Coupon Preview & Server-Side Subscription / Add-on Checkout ──────
  const lookupCouponForPreview = useCallback(
    async (rawCode: string): Promise<PayCouponDoc | null> => {
      const code = rawCode.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return null;
      if (isAutoTest) {
        return coupons.find((c) => c.code === code) || null;
      }
      try {
        const snap = await getDoc(doc(db, 'payCoupons', code));
        if (!snap.exists()) return null;
        return mapCoupon(snap.id, snap.data());
      } catch {
        return null;
      }
    },
    [isAutoTest, coupons]
  );

  const initiateSubscriptionCheckout = useCallback(
    async (input: {
      itemType: 'plan' | 'addon';
      planId?: string;
      billingCycle?: 'monthly' | 'yearly';
      addonId?: string;
      method: WalletMethod;
      couponCode?: string;
    }): Promise<{ sessionId: string; paymentPath: string }> => {
      if (!account) throw new Error('সাইন ইন করুন।');
      if (input.itemType === 'plan') {
        const plan = plans.find((p) => p.id === input.planId);
        if (!plan || plan.archived) {
          throw new Error('এই প্ল্যানটি আর্কাইভ করা হয়েছে বা উপলব্ধ নয়।');
        }
        const price =
          input.billingCycle === 'yearly' ? plan.priceYearly || 0 : plan.priceMonthly || 0;
        if (price <= 0) {
          throw new Error('এই প্ল্যানের দাম এখনো সেট করা হয়নি — মালিকের সাথে যোগাযোগ করুন।');
        }
      } else {
        const addon = addons.find((a) => a.id === input.addonId && a.active);
        if (!addon || addon.price <= 0) {
          throw new Error('এই অ্যাড-অন প্যাকটির দাম এখনো সেট করা হয়নি।');
        }
      }

      const workerBase = normalizeWorkerBaseUrl(platformConfig.workerBaseUrl);
      if (!workerBase) {
        throw new Error(
          'প্ল্যাটফর্মের Cloudflare Worker URL এখনো সেট করা হয়নি। চূড়ান্ত মূল্য ও কুপন যাচাই Worker-এর মাধ্যমে সম্পন্ন হয়।'
        );
      }
      if (!platformConfig.subscriptionStoreId) {
        throw new Error(
          'সুপার অ্যাডমিন এখনো সাবস্ক্রিপশন পেমেন্ট স্টোর নির্ধারণ করেননি।'
        );
      }

      // Send checkout request to Worker so final price & coupon discount are strictly server-authoritative
      const idToken = !isAutoTest && fbUser ? await fbUser.getIdToken() : '';
      const res = await fetch(`${workerBase}/subscription/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          accountId: account.id,
          subscriptionStoreId: platformConfig.subscriptionStoreId,
          itemType: input.itemType,
          planId: input.planId || null,
          billingCycle: input.billingCycle || 'monthly',
          addonId: input.addonId || null,
          method: input.method,
          couponCode: input.couponCode ? input.couponCode.trim().toUpperCase() : null,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || !data.sessionId) {
        throw new Error(
          data.error ||
            `সাবস্ক্রিপশন চেকআউট শুরু করা যায়নি (HTTP ${res.status})। Worker-এ /subscription/checkout এন্ডপয়েন্ট সক্রিয় আছে কিনা যাচাই করুন।`
        );
      }

      const paymentPath = `/pay/${encodeURIComponent(data.sessionId)}?worker=${encodeURIComponent(workerBase)}`;
      return { sessionId: data.sessionId, paymentPath };
    },
    [account, plans, addons, platformConfig, isAutoTest, fbUser]
  );

  // ─── Super Admin Mutations (Every action writes payActivity) ───────────
  const adminSavePlatformSettings = useCallback(
    async (
      input: {
        workerBaseUrl?: string;
        trialPlanId?: string;
        subscriptionStoreId?: string | null;
        brandLogoUrl?: string;
        brandLogoDataUrl?: string;
        supportWhatsApp?: string;
        supportPhone?: string;
        landing?: LandingPageConfig;
      },
      note: string
    ) => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিন এটি পরিবর্তন করতে পারেন।');
      const nextWorker =
        input.workerBaseUrl !== undefined
          ? normalizeWorkerBaseUrl(input.workerBaseUrl).slice(0, 256)
          : platformConfig.workerBaseUrl;
      const nextTrialPlan =
        input.trialPlanId !== undefined ? input.trialPlanId : platformConfig.trialPlanId;
      const nextSubStore =
        input.subscriptionStoreId !== undefined
          ? input.subscriptionStoreId
          : platformConfig.subscriptionStoreId;

      const rawBrandUrl =
        input.brandLogoUrl !== undefined
          ? input.brandLogoUrl.trim().slice(0, 512)
          : platformConfig.brandLogoUrl;
      if (rawBrandUrl && !isSafeHttpUrl(rawBrandUrl)) {
        throw new Error('লোগো URL অবশ্যই https:// বা http:// দিয়ে শুরু হতে হবে।');
      }
      const nextBrandDataUrl =
        input.brandLogoDataUrl !== undefined
          ? input.brandLogoDataUrl && isValidLogoDataUrl(input.brandLogoDataUrl)
            ? input.brandLogoDataUrl
            : ''
          : platformConfig.brandLogoDataUrl;
      const nextWhatsApp =
        input.supportWhatsApp !== undefined
          ? input.supportWhatsApp.trim().slice(0, 32)
          : platformConfig.supportWhatsApp;
      const nextPhone =
        input.supportPhone !== undefined
          ? input.supportPhone.trim().slice(0, 32)
          : platformConfig.supportPhone;
      const nextLanding =
        input.landing !== undefined
          ? normalizeLandingConfig(input.landing)
          : platformConfig.landing;

      cacheWorkerConfigLocally(nextWorker, selectedStore?.name || '');
      const actId = generateDocId('act');
      const cleanNote = note.trim().slice(0, 300) || 'প্ল্যাটফর্ম সেটিংস আপডেট';
      const detail = `Platform config updated (trialPlan=${nextTrialPlan || 'none'}, subStore=${nextSubStore || 'none'})`;

      if (isAutoTest) {
        setPlatformConfig((prev) => ({
          ...prev,
          workerBaseUrl: nextWorker,
          trialPlanId: nextTrialPlan,
          subscriptionStoreId: nextSubStore,
          brandLogoUrl: rawBrandUrl,
          brandLogoDataUrl: nextBrandDataUrl,
          supportWhatsApp: nextWhatsApp,
          supportPhone: nextPhone,
          landing: nextLanding,
          updatedAtMs: Date.now(),
        }));
        setActivityLog((prev) => [
          {
            id: actId,
            actorAccountId: account.id,
            actorEmail: account.email,
            type: 'admin_action',
            action: 'update_platform_config',
            targetType: 'platform',
            targetId: 'config',
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.set(
          doc(db, 'payPlatform', 'config'),
          {
            workerBaseUrl: nextWorker,
            migratedFromSettingsMain: platformConfig.migratedFromSettingsMain,
            migratedStoreId: platformConfig.migratedStoreId,
            trialPlanId: nextTrialPlan,
            subscriptionStoreId: nextSubStore,
            plansSeeded: true,
            brandLogoUrl: rawBrandUrl,
            brandLogoDataUrl: nextBrandDataUrl,
            supportWhatsApp: nextWhatsApp,
            supportPhone: nextPhone,
            landing: nextLanding,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        batch.set(doc(db, 'payActivity', actId), {
          actorAccountId: account.id,
          actorEmail: account.email,
          type: 'admin_action',
          action: 'update_platform_config',
          targetType: 'platform',
          targetId: 'config',
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'payPlatform/config');
      }
    },
    [account, platformConfig, selectedStore, isAutoTest]
  );

  useEffect(() => {
    if (
      account?.isSuperAdmin &&
      platformConfig.subscriptionStoreId &&
      allStores.length > 0 &&
      !allStores.some((s) => s.id === platformConfig.subscriptionStoreId)
    ) {
      void adminSavePlatformSettings(
        { subscriptionStoreId: null },
        'নির্ধারিত সাবস্ক্রিপশন স্টোর মুছে যাওয়ায় সেটিংস স্বয়ংক্রিয়ভাবে পরিষ্কার করা হয়েছে'
      ).catch(() => {});
    }
  }, [account?.isSuperAdmin, platformConfig.subscriptionStoreId, allStores, adminSavePlatformSettings]);

  const adminSaveWorkerBaseUrl = useCallback(
    async (rawUrl: string, note = 'প্ল্যাটফর্ম Worker URL আপডেট') => {
      await adminSavePlatformSettings({ workerBaseUrl: rawUrl }, note);
    },
    [adminSavePlatformSettings]
  );

  const getAdminActorMeta = useCallback(() => {
    if (account?.isSuperAdmin) {
      return {
        actorAccountId: account.id,
        actorEmail: account.email,
        actorName: account.displayName || 'সুপার অ্যাডমিন',
        actorRoleId: 'super_admin',
        actorRoleName: 'সুপার অ্যাডমিন',
      };
    }
    if (currentStaff && currentStaff.status === 'active') {
      return {
        actorAccountId: currentStaff.id,
        actorEmail: currentStaff.email,
        actorName: currentStaff.name,
        actorRoleId: currentStaff.roleId,
        actorRoleName: currentStaff.roleName,
      };
    }
    throw new Error('অ্যাডমিন পোর্টালে এই কাজের অনুমতি আপনার নেই।');
  }, [account, currentStaff]);

  const adminUpdateAccount = useCallback(
    async (
      targetAccountId: string,
      updates: {
        planStatus?: PlanStatus;
        planId?: string | null;
        paidUntilMs?: number | null;
        dailySessionCap?: number;
        dailySessionCapOverride?: number | null;
        storeLimitOverride?: number | null;
      },
      detail: string,
      note: string
    ) => {
      if (!canAdmin('merchants', 'edit')) {
        throw new Error('মার্চেন্ট অ্যাকাউন্ট সম্পাদনার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const targetAcc = allAccounts.find((a) => a.id === targetAccountId);
      if (targetAcc?.isSuperAdmin) {
        throw new Error('সুপার অ্যাডমিনের অ্যাকাউন্ট পরিবর্তন করা যাবে না।');
      }
      const cleanNote = note.trim().slice(0, 300);
      if (!cleanNote) throw new Error('অ্যাক্টিভিটি নোট লেখা বাধ্যতামূলক।');

      const patch: Record<string, unknown> = {};
      if (updates.planStatus) patch.planStatus = updates.planStatus;
      if (updates.planId !== undefined) patch.planId = updates.planId;
      if (updates.paidUntilMs !== undefined) {
        patch.paidUntil =
          updates.paidUntilMs === null ? null : Timestamp.fromMillis(updates.paidUntilMs);
      }
      if (updates.dailySessionCap !== undefined) {
        patch.dailySessionCap = Math.min(1_000_000, Math.max(0, Math.trunc(updates.dailySessionCap)));
      }
      if (updates.dailySessionCapOverride !== undefined) {
        patch.dailySessionCapOverride =
          updates.dailySessionCapOverride === null
            ? null
            : Math.min(1_000_000, Math.max(0, Math.trunc(updates.dailySessionCapOverride)));
      }
      if (updates.storeLimitOverride !== undefined) {
        patch.storeLimitOverride =
          updates.storeLimitOverride === null
            ? null
            : Math.min(10_000, Math.max(0, Math.trunc(updates.storeLimitOverride)));
      }

      const actId = generateDocId('act');

      if (isAutoTest) {
        const applyAcc = (a: PayAccountDoc): PayAccountDoc =>
          a.id === targetAccountId
            ? {
                ...a,
                planStatus: updates.planStatus ?? a.planStatus,
                planId: updates.planId !== undefined ? updates.planId : a.planId,
                paidUntilMs:
                  updates.paidUntilMs !== undefined ? updates.paidUntilMs : a.paidUntilMs,
                dailySessionCap: updates.dailySessionCap ?? a.dailySessionCap,
                dailySessionCapOverride:
                  updates.dailySessionCapOverride !== undefined
                    ? updates.dailySessionCapOverride
                    : a.dailySessionCapOverride,
                storeLimitOverride:
                  updates.storeLimitOverride !== undefined
                    ? updates.storeLimitOverride
                    : a.storeLimitOverride,
              }
            : a;
        setAllAccounts((prev) => prev.map(applyAcc));
        setAccount((prev) => (prev ? applyAcc(prev) : prev));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            accountId: targetAccountId,
            type: 'admin_action',
            action: 'update_account',
            targetType: 'account',
            targetId: targetAccountId,
            detail: detail.slice(0, 400),
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'payAccounts', targetAccountId), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          accountId: targetAccountId,
          type: 'admin_action',
          action: 'update_account',
          targetType: 'account',
          targetId: targetAccountId,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payAccounts/${targetAccountId}`);
      }
    },
    [canAdmin, getAdminActorMeta, allAccounts, isAutoTest]
  );

  const adminDeleteMerchantAccount = useCallback(
    async (targetAccountId: string, note: string) => {
      if (!canAdmin('merchants', 'delete')) {
        throw new Error('মার্চেন্ট অ্যাকাউন্ট মোছার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const targetAcc = allAccounts.find((a) => a.id === targetAccountId);
      if (!targetAcc) throw new Error('অ্যাকাউন্টটি খুঁজে পাওয়া যায়নি।');
      if (targetAcc.isSuperAdmin) {
        throw new Error('সুপার অ্যাডমিনের অ্যাকাউন্ট মোছা যাবে না।');
      }
      const cleanNote = note.trim().slice(0, 300) || `মার্চেন্ট মুছে ফেলা হয়েছে: ${targetAcc.email}`;
      const actId = generateDocId('act');
      const detail = `মার্চেন্ট অ্যাকাউন্ট মুছে ফেলা হয়েছে: ${targetAcc.email}`;

      if (isAutoTest) {
        setAllAccounts((prev) => prev.filter((a) => a.id !== targetAccountId));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            accountId: targetAccountId,
            type: 'admin_action',
            action: 'delete_account',
            targetType: 'account',
            targetId: targetAccountId,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'payAccounts', targetAccountId));
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          accountId: targetAccountId,
          type: 'admin_action',
          action: 'delete_account',
          targetType: 'account',
          targetId: targetAccountId,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `payAccounts/${targetAccountId}`);
      }
    },
    [canAdmin, getAdminActorMeta, allAccounts, isAutoTest]
  );

  const adminConvertStoreType = useCallback(
    async (storeId: string, newType: StoreType, note: string) => {
      if (!canAdmin('merchants', 'edit')) {
        throw new Error('স্টোরের ধরন পরিবর্তনের অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const cleanNote = note.trim().slice(0, 300);
      if (!cleanNote) throw new Error('টাইপ পরিবর্তনের জন্য নোট লেখা বাধ্যতামূলক।');

      const store = allStores.find((s) => s.id === storeId);
      if (!store) throw new Error('স্টোরটি খুঁজে পাওয়া যায়নি।');
      const detail = `${store.name}: ${store.type} → ${newType}`;
      const actId = generateDocId('act');

      if (isAutoTest) {
        const applyLocal = (s: PayStoreDoc) => (s.id === storeId ? { ...s, type: newType } : s);
        setAllStores((prev) => prev.map(applyLocal));
        setOwnedStores((prev) => prev.map(applyLocal));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'convert_store_type',
            targetType: 'store',
            targetId: storeId,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'payStores', storeId), {
          type: newType,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'convert_store_type',
          targetType: 'store',
          targetId: storeId,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }
    },
    [canAdmin, getAdminActorMeta, allStores, isAutoTest]
  );

  const adminReassignStore = useCallback(
    async (storeId: string, newAccountId: string, newOwnerEmail: string, note: string) => {
      if (!canAdmin('merchants', 'edit')) {
        throw new Error('স্টোরের মালিক পরিবর্তনের অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const cleanNote = note.trim().slice(0, 300);
      if (!cleanNote) throw new Error('মালিক পরিবর্তনের জন্য নোট লেখা বাধ্যতামূলক।');
      if (!newAccountId) throw new Error('নতুন মালিক নির্বাচন করুন।');

      const store = allStores.find((s) => s.id === storeId);
      if (!store) throw new Error('স্টোরটি খুঁজে পাওয়া যায়নি।');
      const prevOwner = allAccounts.find((a) => a.id === store.accountId);
      const detail = `${store.name}: ${prevOwner?.email || store.accountId} → ${newOwnerEmail}`;
      const actId = generateDocId('act');

      if (isAutoTest) {
        setAllStores((prev) =>
          prev.map((s) => (s.id === storeId ? { ...s, accountId: newAccountId } : s))
        );
        if (account && newAccountId !== account.id) {
          setOwnedStores((prev) => prev.filter((s) => s.id !== storeId));
        }
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'reassign_store',
            targetType: 'store',
            targetId: storeId,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'payStores', storeId), {
          accountId: newAccountId,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'reassign_store',
          targetType: 'store',
          targetId: storeId,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payStores/${storeId}`);
      }
    },
    [canAdmin, getAdminActorMeta, account, allStores, allAccounts, isAutoTest]
  );

  // ─── Super Admin & Staff Plan / Add-on / Coupon / Changelog CRUD ──────
  const adminSavePlan = useCallback(
    async (draft: PlanDraftInput, existingPlanId?: string, note?: string): Promise<PayPlanDoc> => {
      const isEdit = Boolean(existingPlanId);
      if (!canAdmin('plans', isEdit ? 'edit' : 'create')) {
        throw new Error(
          isEdit
            ? 'প্ল্যান সম্পাদনা করার অনুমতি আপনার নেই।'
            : 'নতুন প্ল্যান তৈরি করার অনুমতি আপনার নেই।'
        );
      }
      const actor = getAdminActorMeta();
      const name = draft.name.trim().slice(0, 80);
      if (!name) throw new Error('প্ল্যানের নাম লিখুন।');

      const id = existingPlanId || generateDocId('plan');
      const customPerks = draft.customPerks
        .map((l) => l.trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 20);
      const cleanPlan: PayPlanDoc = {
        id,
        name,
        priceMonthly: draft.priceMonthly ? Math.max(0, Math.trunc(draft.priceMonthly)) : 0,
        priceYearly: draft.priceYearly ? Math.max(0, Math.trunc(draft.priceYearly)) : 0,
        storeLimit: Math.max(0, Math.trunc(draft.storeLimit)),
        dailySessionCap: Math.max(0, Math.trunc(draft.dailySessionCap)),
        deviceLimit: Math.max(0, Math.trunc(draft.deviceLimit)),
        features: {
          rotation: Boolean(draft.features.rotation),
          branding: Boolean(draft.features.branding),
          embedded: Boolean(draft.features.embedded),
          apiAccess: Boolean(draft.features.apiAccess),
          woocommerce: Boolean(draft.features.woocommerce),
          analytics: Boolean(draft.features.analytics),
          csvExport: Boolean(draft.features.csvExport),
          manualMatch: Boolean(draft.features.manualMatch),
          members: Math.min(100, Math.max(0, Math.trunc(draft.features.members))),
        },
        customPerks,
        visibleOnMarketing: Boolean(draft.visibleOnMarketing),
        highlight: Boolean(draft.highlight),
        archived: Boolean(draft.archived),
        sortOrder: Math.max(0, Math.trunc(draft.sortOrder)),
        createdAtMs:
          (existingPlanId ? plans.find((p) => p.id === existingPlanId)?.createdAtMs : null) ??
          Date.now(),
      };

      const actId = generateDocId('act');
      const cleanNote = (note || (isEdit ? `প্ল্যান আপডেট: ${name}` : `নতুন প্ল্যান তৈরি: ${name}`))
        .trim()
        .slice(0, 300);
      const detail = `${name} (স্টোর: ${cleanPlan.storeLimit}, ডিভাইস: ${cleanPlan.deviceLimit}, দৈনিক সেশন: ${cleanPlan.dailySessionCap})`;

      if (isAutoTest) {
        setPlans((prev) => {
          const updated = isEdit
            ? prev.map((p) => {
                if (p.id === id) return cleanPlan;
                return cleanPlan.highlight ? { ...p, highlight: false } : p;
              })
            : [
                ...(cleanPlan.highlight ? prev.map((p) => ({ ...p, highlight: false })) : prev),
                cleanPlan,
              ];
          return updated.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs);
        });
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'plan_change',
            action: isEdit ? 'update_plan' : 'create_plan',
            targetType: 'plan',
            targetId: id,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return cleanPlan;
      }

      try {
        const batch = writeBatch(db);
        if (cleanPlan.highlight) {
          for (const other of plans) {
            if (other.id !== id && other.highlight) {
              batch.update(doc(db, 'payPlans', other.id), {
                highlight: false,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
        const payload = {
          name: cleanPlan.name,
          priceMonthly: cleanPlan.priceMonthly ?? 0,
          priceYearly: cleanPlan.priceYearly ?? 0,
          storeLimit: cleanPlan.storeLimit,
          dailySessionCap: cleanPlan.dailySessionCap,
          deviceLimit: cleanPlan.deviceLimit,
          features: cleanPlan.features,
          customPerks: cleanPlan.customPerks,
          visibleOnMarketing: cleanPlan.visibleOnMarketing,
          highlight: cleanPlan.highlight,
          archived: cleanPlan.archived,
          sortOrder: cleanPlan.sortOrder,
          updatedAt: serverTimestamp(),
        };
        if (isEdit) {
          batch.update(doc(db, 'payPlans', id), payload);
        } else {
          batch.set(doc(db, 'payPlans', id), {
            ...payload,
            createdAt: serverTimestamp(),
          });
        }
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'plan_change',
          action: isEdit ? 'update_plan' : 'create_plan',
          targetType: 'plan',
          targetId: id,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `payPlans/${id}`);
      }
      return cleanPlan;
    },
    [canAdmin, getAdminActorMeta, plans, isAutoTest]
  );

  const adminArchivePlan = useCallback(
    async (planId: string, archived: boolean, note?: string) => {
      if (!canAdmin('plans', 'edit') && !canAdmin('plans', 'delete')) {
        throw new Error('প্ল্যান আর্কাইভ বা পরিবর্তন করার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const target = plans.find((p) => p.id === planId);
      if (!target) throw new Error('প্ল্যানটি পাওয়া যায়নি।');
      const actId = generateDocId('act');
      const cleanNote = (
        note || (archived ? `${target.name} আর্কাইভ করা হয়েছে` : `${target.name} পুনঃসক্রিয় করা হয়েছে`)
      )
        .trim()
        .slice(0, 300);
      const detail = `${target.name}: archived → ${archived}`;

      if (isAutoTest) {
        setPlans((prev) =>
          prev.map((p) =>
            p.id === planId
              ? { ...p, archived, visibleOnMarketing: archived ? false : p.visibleOnMarketing }
              : p
          )
        );
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'plan_change',
            action: archived ? 'archive_plan' : 'unarchive_plan',
            targetType: 'plan',
            targetId: planId,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'payPlans', planId), {
          archived,
          visibleOnMarketing: archived ? false : target.visibleOnMarketing,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'plan_change',
          action: archived ? 'archive_plan' : 'unarchive_plan',
          targetType: 'plan',
          targetId: planId,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `payPlans/${planId}`);
      }
    },
    [canAdmin, getAdminActorMeta, plans, isAutoTest]
  );

  const adminDeletePlan = useCallback(
    async (planId: string, note?: string) => {
      if (!canAdmin('plans', 'delete')) {
        throw new Error('প্ল্যান মুছে ফেলার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const target = plans.find((p) => p.id === planId);
      if (!target) throw new Error('প্ল্যানটি পাওয়া যায়নি।');
      const actId = generateDocId('act');
      const cleanNote = (note || `প্ল্যান মুছে ফেলা হয়েছে: ${target.name}`).trim().slice(0, 300);
      const detail = `প্ল্যান মুছে ফেলা হয়েছে: ${target.name}`;

      if (isAutoTest) {
        setPlans((prev) => prev.filter((p) => p.id !== planId));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'plan_change',
            action: 'delete_plan',
            targetType: 'plan',
            targetId: planId,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'payPlans', planId));
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'plan_change',
          action: 'delete_plan',
          targetType: 'plan',
          targetId: planId,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `payPlans/${planId}`);
      }
    },
    [canAdmin, getAdminActorMeta, plans, isAutoTest]
  );

  const adminSaveAddon = useCallback(
    async (draft: AddonDraftInput, existingAddonId?: string, note?: string): Promise<PayAddonDoc> => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
      const actor = getAdminActorMeta();
      const name = draft.name.trim().slice(0, 80);
      if (!name) throw new Error('অ্যাড-অন প্যাকের নাম লিখুন।');

      const id = existingAddonId || generateDocId('addon');
      const isEdit = Boolean(existingAddonId);
      const cleanAddon: PayAddonDoc = {
        id,
        name,
        kind: draft.kind,
        amount: Math.max(1, Math.trunc(draft.amount)),
        price: Math.max(0, Math.trunc(draft.price)),
        active: Boolean(draft.active),
        sortOrder: Math.max(0, Math.trunc(draft.sortOrder)),
        createdAtMs:
          (existingAddonId ? addons.find((a) => a.id === existingAddonId)?.createdAtMs : null) ??
          Date.now(),
      };
      const actId = generateDocId('act');
      const cleanNote = (note || `অ্যাড-অন সংরক্ষণ: ${name}`).trim().slice(0, 300);
      const detail = `${name} (${cleanAddon.kind} ${cleanAddon.amount}, ৳${cleanAddon.price})`;

      if (isAutoTest) {
        setAddons((prev) =>
          (isEdit ? prev.map((a) => (a.id === id ? cleanAddon : a)) : [...prev, cleanAddon]).sort(
            (a, b) => a.sortOrder - b.sortOrder
          )
        );
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: isEdit ? 'update_addon' : 'create_addon',
            targetType: 'addon',
            targetId: id,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return cleanAddon;
      }

      try {
        const batch = writeBatch(db);
        const payload = {
          name: cleanAddon.name,
          kind: cleanAddon.kind,
          amount: cleanAddon.amount,
          price: cleanAddon.price,
          active: cleanAddon.active,
          sortOrder: cleanAddon.sortOrder,
          updatedAt: serverTimestamp(),
        };
        if (isEdit) {
          batch.update(doc(db, 'payAddons', id), payload);
        } else {
          batch.set(doc(db, 'payAddons', id), { ...payload, createdAt: serverTimestamp() });
        }
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: isEdit ? 'update_addon' : 'create_addon',
          targetType: 'addon',
          targetId: id,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `payAddons/${id}`);
      }
      return cleanAddon;
    },
    [account, getAdminActorMeta, addons, isAutoTest]
  );

  const adminSaveCoupon = useCallback(
    async (
      draft: CouponDraftInput,
      existingCouponId?: string,
      note?: string
    ): Promise<PayCouponDoc> => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
      const actor = getAdminActorMeta();
      const code = draft.code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
        throw new Error('কুপন কোড ৩–৩২ অক্ষরের ইংরেজি অক্ষর, সংখ্যা, _ বা - হতে হবে।');
      }

      const id = existingCouponId || code;
      const isEdit = Boolean(existingCouponId);
      const existing = coupons.find((c) => c.id === id);
      const cleanCoupon: PayCouponDoc = {
        id,
        code: existing ? existing.code : code,
        percentOff: Math.min(100, Math.max(1, Math.trunc(draft.percentOff))),
        expiresAtMs: draft.expiresAtMs,
        maxUses: Math.max(0, Math.trunc(draft.maxUses)),
        planId: draft.planId || null,
        usedCount: existing?.usedCount ?? 0,
        active: Boolean(draft.active),
        createdAtMs: existing?.createdAtMs ?? Date.now(),
      };
      const actId = generateDocId('act');
      const cleanNote = (note || `কুপন সংরক্ষণ: ${cleanCoupon.code}`).trim().slice(0, 300);
      const detail = `${cleanCoupon.code} (${cleanCoupon.percentOff}% ছাড়)`;

      if (isAutoTest) {
        setCoupons((prev) =>
          isEdit ? prev.map((c) => (c.id === id ? cleanCoupon : c)) : [cleanCoupon, ...prev]
        );
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: isEdit ? 'update_coupon' : 'create_coupon',
            targetType: 'coupon',
            targetId: id,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return cleanCoupon;
      }

      try {
        const batch = writeBatch(db);
        const payload = {
          percentOff: cleanCoupon.percentOff,
          expiresAt:
            cleanCoupon.expiresAtMs !== null
              ? Timestamp.fromMillis(cleanCoupon.expiresAtMs)
              : null,
          maxUses: cleanCoupon.maxUses,
          planId: cleanCoupon.planId,
          usedCount: cleanCoupon.usedCount,
          active: cleanCoupon.active,
          updatedAt: serverTimestamp(),
        };
        if (isEdit) {
          batch.update(doc(db, 'payCoupons', id), payload);
        } else {
          batch.set(doc(db, 'payCoupons', id), {
            code: cleanCoupon.code,
            ...payload,
            createdAt: serverTimestamp(),
          });
        }
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: isEdit ? 'update_coupon' : 'create_coupon',
          targetType: 'coupon',
          targetId: id,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `payCoupons/${id}`);
      }
      return cleanCoupon;
    },
    [account, getAdminActorMeta, coupons, isAutoTest]
  );

  const adminSaveChangelog = useCallback(
    async (
      draft: { title: string; body: string; date: string },
      existingEntryId?: string
    ): Promise<PayChangelogDoc> => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
      const title = draft.title.trim().slice(0, 120);
      const body = draft.body.trim().slice(0, 600);
      const date = draft.date.trim().slice(0, 40);
      if (!title || !body || !date) {
        throw new Error('শিরোনাম, বিবরণ এবং তারিখ পূরণ করুন।');
      }
      const id = existingEntryId || generateDocId('chg');
      const isEdit = Boolean(existingEntryId);
      const entry: PayChangelogDoc = {
        id,
        title,
        body,
        date,
        createdAtMs:
          (existingEntryId ? changelog.find((c) => c.id === existingEntryId)?.createdAtMs : null) ??
          Date.now(),
      };

      if (isAutoTest) {
        setChangelog((prev) =>
          (isEdit ? prev.map((c) => (c.id === id ? entry : c)) : [entry, ...prev]).sort(
            (a, b) => b.createdAtMs - a.createdAtMs
          )
        );
        return entry;
      }

      try {
        if (isEdit) {
          await updateDoc(doc(db, 'payChangelog', id), {
            title,
            body,
            date,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'payChangelog', id), {
            title,
            body,
            date,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `payChangelog/${id}`);
      }
      return entry;
    },
    [account, changelog, isAutoTest]
  );

  const adminDeleteChangelog = useCallback(
    async (entryId: string) => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
      if (isAutoTest) {
        setChangelog((prev) => prev.filter((c) => c.id !== entryId));
        return;
      }
      try {
        await deleteDoc(doc(db, 'payChangelog', entryId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `payChangelog/${entryId}`);
      }
    },
    [account, isAutoTest]
  );

  const adminSaveAppRelease = useCallback(
    async (draft: AppReleaseDraftInput, existingReleaseId?: string): Promise<AppReleaseDoc> => {
      const isEdit = Boolean(existingReleaseId);
      if (!canAdmin('app_updates', isEdit ? 'edit' : 'create')) {
        throw new Error(
          isEdit
            ? 'APK ভার্সন সম্পাদনা করার অনুমতি আপনার নেই।'
            : 'নতুন APK ভার্সন আপলোড করার অনুমতি আপনার নেই।'
        );
      }
      if (draft.publishNow && !canAdmin('app_updates', 'edit')) {
        throw new Error('APK ভার্সন পাবলিশ করার অনুমতি আপনার নেই (সম্পাদনা সুইচ প্রয়োজন)।');
      }
      const actor = getAdminActorMeta();
      const versionName = draft.versionName.trim().slice(0, 40);
      if (!versionName) {
        throw new Error('ভার্সন নাম লিখুন (যেমন: 1.2.0)।');
      }
      const versionCode = Math.trunc(Number(draft.versionCode));
      const codeCheck = validateVersionCode(versionCode, appReleases, existingReleaseId);
      if (!codeCheck.valid) {
        throw new Error(codeCheck.errorBn || 'সঠিক ভার্সন কোড দিন।');
      }
      const apkUrl = draft.apkUrl.trim().slice(0, 2000);
      if (!apkUrl) {
        throw new Error('APK ফাইল আপলোড করুন অথবা ডাউনলোড লিংক দিন।');
      }
      const storagePath =
        typeof draft.storagePath === 'string' && draft.storagePath.trim()
          ? draft.storagePath.trim().slice(0, 400)
          : null;
      const fileSize = Math.max(0, Math.trunc(Number(draft.fileSize || 0)));
      const releaseNotes = (draft.releaseNotes || '').trim().slice(0, 4000);
      const mandatory = Boolean(draft.mandatory);
      const published = Boolean(draft.publishNow);

      const id = existingReleaseId || generateDocId('apk');
      const existing = existingReleaseId
        ? appReleases.find((r) => r.id === existingReleaseId)
        : undefined;
      const nowMs = Date.now();
      const publishedAtMs = published ? existing?.publishedAtMs ?? nowMs : null;

      const savedRelease: AppReleaseDoc = {
        id,
        versionName,
        versionCode,
        apkUrl,
        storagePath,
        fileSize,
        releaseNotes,
        mandatory,
        published,
        publishedAtMs,
        downloadCount: existing?.downloadCount ?? 0,
        createdAtMs: existing?.createdAtMs ?? nowMs,
        updatedAtMs: nowMs,
      };

      const actId = generateDocId('act');
      const actAction = published
        ? 'publish_app_release'
        : isEdit
          ? 'update_app_release'
          : 'create_app_release';
      const detail = `Android App v${versionName} (কোড ${versionCode}) — ${
        published ? 'পাবলিশড' : 'খসড়া'
      }`;

      if (isAutoTest) {
        setAppReleases((prev) => {
          const withoutCurrent = prev.filter((r) => r.id !== id);
          const demoted = published
            ? withoutCurrent.map((r) =>
                r.published ? { ...r, published: false, updatedAtMs: nowMs } : r
              )
            : withoutCurrent;
          return [savedRelease, ...demoted].sort(
            (a, b) => b.versionCode - a.versionCode || b.createdAtMs - a.createdAtMs
          );
        });
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: actAction,
            targetType: 'app_release',
            targetId: id,
            detail,
            note: detail,
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return savedRelease;
      }

      try {
        const batch = writeBatch(db);
        if (published) {
          for (const other of appReleases) {
            if (other.id !== id && other.published) {
              batch.update(doc(db, 'appReleases', other.id), {
                published: false,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }

        const payload = {
          versionName: savedRelease.versionName,
          versionCode: savedRelease.versionCode,
          apkUrl: savedRelease.apkUrl,
          storagePath: savedRelease.storagePath,
          fileSize: savedRelease.fileSize,
          releaseNotes: savedRelease.releaseNotes,
          mandatory: savedRelease.mandatory,
          published: savedRelease.published,
          publishedAt: savedRelease.published
            ? existing?.publishedAtMs
              ? Timestamp.fromMillis(existing.publishedAtMs)
              : serverTimestamp()
            : null,
          downloadCount: savedRelease.downloadCount,
          updatedAt: serverTimestamp(),
        };

        if (isEdit) {
          batch.update(doc(db, 'appReleases', id), payload);
        } else {
          batch.set(doc(db, 'appReleases', id), {
            ...payload,
            createdAt: serverTimestamp(),
          });
        }

        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: actAction,
          targetType: 'app_release',
          targetId: id,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });

        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `appReleases/${id}`);
      }

      return savedRelease;
    },
    [canAdmin, getAdminActorMeta, appReleases, isAutoTest]
  );

  const adminTogglePublishAppRelease = useCallback(
    async (releaseId: string, publish: boolean) => {
      if (!canAdmin('app_updates', 'edit')) {
        throw new Error('APK ভার্সন পাবলিশ বা আনপাবলিশ করার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const target = appReleases.find((r) => r.id === releaseId);
      if (!target) {
        throw new Error('ভার্সন খুঁজে পাওয়া যায়নি।');
      }
      const nowMs = Date.now();
      const actId = generateDocId('act');
      const detail = `Android App v${target.versionName} (কোড ${target.versionCode}) — ${
        publish ? 'পাবলিশ করা হয়েছে' : 'আনপাবলিশ করা হয়েছে'
      }`;

      if (isAutoTest) {
        setAppReleases((prev) =>
          prev.map((r) => {
            if (r.id === releaseId) {
              return {
                ...r,
                published: publish,
                publishedAtMs: publish ? nowMs : null,
                updatedAtMs: nowMs,
              };
            }
            if (publish && r.published) {
              return { ...r, published: false, updatedAtMs: nowMs };
            }
            return r;
          })
        );
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: publish ? 'publish_app_release' : 'unpublish_app_release',
            targetType: 'app_release',
            targetId: releaseId,
            detail,
            note: detail,
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        if (publish) {
          for (const other of appReleases) {
            if (other.id !== releaseId && other.published) {
              batch.update(doc(db, 'appReleases', other.id), {
                published: false,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
        batch.update(doc(db, 'appReleases', releaseId), {
          published: publish,
          publishedAt: publish ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: publish ? 'publish_app_release' : 'unpublish_app_release',
          targetType: 'app_release',
          targetId: releaseId,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `appReleases/${releaseId}`);
      }
    },
    [canAdmin, getAdminActorMeta, appReleases, isAutoTest]
  );

  const adminDeleteAppRelease = useCallback(
    async (releaseId: string) => {
      if (!canAdmin('app_updates', 'delete')) {
        throw new Error('APK ভার্সন ডিলিট করার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const target = appReleases.find((r) => r.id === releaseId);
      const actId = generateDocId('act');
      const detail = target
        ? `Android App v${target.versionName} (কোড ${target.versionCode}) ডিলিট করা হয়েছে`
        : `Android App ভার্সন ডিলিট (${releaseId})`;

      if (isAutoTest) {
        setAppReleases((prev) => prev.filter((r) => r.id !== releaseId));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'delete_app_release',
            targetType: 'app_release',
            targetId: releaseId,
            detail,
            note: detail,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }
      if (target?.storagePath) {
        try {
          await deleteObject(storageRef(storage, target.storagePath));
        } catch {
          // Ignore if Storage object was already deleted or stored via local fallback
        }
      }
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'appReleases', releaseId));
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'delete_app_release',
          targetType: 'app_release',
          targetId: releaseId,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `appReleases/${releaseId}`);
      }
    },
    [canAdmin, getAdminActorMeta, appReleases, isAutoTest]
  );

  const recordAppReleaseDownload = useCallback(
    async (releaseId: string) => {
      const target =
        appReleases.find((r) => r.id === releaseId) ||
        publishedReleasesSnapshot.find((r) => r.id === releaseId) ||
        (publishedAppRelease?.id === releaseId ? publishedAppRelease : null);

      const nextCount = (target?.downloadCount ?? 0) + 1;

      if (isAutoTest) {
        setAppReleases((prev) =>
          prev.map((r) => (r.id === releaseId ? { ...r, downloadCount: r.downloadCount + 1 } : r))
        );
        setPublishedReleasesSnapshot((prev) =>
          prev.map((r) => (r.id === releaseId ? { ...r, downloadCount: r.downloadCount + 1 } : r))
        );
        return;
      }

      try {
        await updateDoc(doc(db, 'appReleases', releaseId), {
          downloadCount: nextCount,
        });
      } catch {
        // Non-fatal counter increment on public download
      }
    },
    [appReleases, publishedReleasesSnapshot, publishedAppRelease, isAutoTest]
  );

  // ─── Admin / Staff Payment Verification & Note Mutations (Area: payments) ──
  const adminVerifyOrNotePaymentSession = useCallback(
    async (
      sessionId: string,
      updates: {
        status?: 'paid' | 'failed' | 'cancelled' | 'waiting';
        trxId?: string | null;
        manualNote: string;
      }
    ) => {
      if (!canAdmin('payments', 'edit')) {
        throw new Error('পেমেন্ট ও লেনদেন যাচাই বা নোট সম্পাদনার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const target = allSessions.find((s) => s.id === sessionId);
      if (!target) throw new Error('পেমেন্ট সেশনটি খুঁজে পাওয়া যায়নি।');
      const cleanNote = updates.manualNote.trim().slice(0, 300);
      if (!cleanNote) throw new Error('যাচাই বা মন্তব্যের জন্য নোট লিখুন।');

      const nextStatus = updates.status || target.status;
      const nextTrxId =
        updates.trxId !== undefined
          ? updates.trxId
            ? updates.trxId.trim().slice(0, 64)
            : null
          : target.trxId;
      const nowMs = Date.now();
      const actId = generateDocId('act');
      const detail = `পেমেন্ট সেশন (${target.orderId}): ${target.status} → ${nextStatus}`;

      if (isAutoTest) {
        setAllSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  status: nextStatus,
                  trxId: nextTrxId,
                  manual: true,
                  manualNote: cleanNote,
                  paidAtMs: nextStatus === 'paid' ? s.paidAtMs ?? nowMs : s.paidAtMs,
                }
              : s
          )
        );
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            accountId: target.accountId,
            type: 'admin_action',
            action: 'verify_payment_session',
            targetType: 'session',
            targetId: sessionId,
            detail,
            note: cleanNote,
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        const patch: Record<string, unknown> = {
          status: nextStatus,
          trxId: nextTrxId,
          manual: true,
          manualNote: cleanNote,
          updatedAt: serverTimestamp(),
        };
        if (nextStatus === 'paid' && !target.paidAtMs) {
          patch.paidAt = serverTimestamp();
        }
        batch.update(doc(db, 'paySessions', sessionId), patch);
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          accountId: target.accountId,
          type: 'admin_action',
          action: 'verify_payment_session',
          targetType: 'session',
          targetId: sessionId,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `paySessions/${sessionId}`);
      }
    },
    [canAdmin, getAdminActorMeta, allSessions, isAutoTest]
  );

  const adminDeletePaymentSession = useCallback(
    async (sessionId: string, note?: string) => {
      if (!canAdmin('payments', 'delete')) {
        throw new Error('পেমেন্ট রেকর্ড মুছে ফেলার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const target = allSessions.find((s) => s.id === sessionId);
      const actId = generateDocId('act');
      const cleanNote = (note || `পেমেন্ট সেশন মুছে ফেলা হয়েছে (${target?.orderId || sessionId})`)
        .trim()
        .slice(0, 300);
      const detail = `পেমেন্ট সেশন মোছা হয়েছে: ${target?.orderId || sessionId}`;

      if (isAutoTest) {
        setAllSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            accountId: target?.accountId,
            type: 'admin_action',
            action: 'delete_payment_session',
            targetType: 'session',
            targetId: sessionId,
            detail,
            note: cleanNote,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'paySessions', sessionId));
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          accountId: target?.accountId || null,
          type: 'admin_action',
          action: 'delete_payment_session',
          targetType: 'session',
          targetId: sessionId,
          detail: detail.slice(0, 400),
          note: cleanNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `paySessions/${sessionId}`);
      }
    },
    [canAdmin, getAdminActorMeta, allSessions, isAutoTest]
  );

  // ─── Admin / Staff Merchant Support Notes CRUD (Area: merchant_notes) ─────
  const saveMerchantSupportNote = useCallback(
    async (
      input: { merchantAccountId: string; merchantEmail: string; body: string },
      existingNoteId?: string
    ): Promise<MerchantSupportNoteDoc> => {
      const isEdit = Boolean(existingNoteId);
      if (!canAdmin('merchant_notes', isEdit ? 'edit' : 'create')) {
        throw new Error(
          isEdit
            ? 'মার্চেন্ট নোট সম্পাদনার অনুমতি আপনার নেই।'
            : 'মার্চেন্ট নোট যোগ করার অনুমতি আপনার নেই।'
        );
      }
      const actor = getAdminActorMeta();
      const body = input.body.trim().slice(0, 2000);
      if (!body) throw new Error('নোট বা মন্তব্য লিখুন।');
      const merchantAccountId = input.merchantAccountId.trim().slice(0, 128);
      if (!merchantAccountId) throw new Error('মার্চেন্ট নির্বাচন করুন।');
      const merchantEmail = input.merchantEmail.trim().slice(0, 160);

      const id = existingNoteId || generateDocId('note');
      const existing = existingNoteId
        ? merchantSupportNotes.find((n) => n.id === existingNoteId)
        : undefined;
      const nowMs = Date.now();

      const savedNote: MerchantSupportNoteDoc = {
        id,
        merchantAccountId,
        merchantEmail,
        body,
        authorUid: existing?.authorUid || actor.actorAccountId,
        authorName: existing?.authorName || actor.actorName,
        authorEmail: existing?.authorEmail || actor.actorEmail,
        authorRoleName: existing?.authorRoleName || actor.actorRoleName,
        createdAtMs: existing?.createdAtMs ?? nowMs,
        updatedAtMs: nowMs,
      };

      const actId = generateDocId('act');
      const detail = `মার্চেন্ট নোট (${merchantEmail || merchantAccountId}): ${body.slice(0, 100)}`;

      if (isAutoTest) {
        setMerchantSupportNotes((prev) =>
          isEdit ? prev.map((n) => (n.id === id ? savedNote : n)) : [savedNote, ...prev]
        );
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            accountId: merchantAccountId,
            type: 'admin_action',
            action: isEdit ? 'update_merchant_note' : 'create_merchant_note',
            targetType: 'merchant_note',
            targetId: id,
            detail,
            note: body.slice(0, 300),
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return savedNote;
      }

      try {
        const batch = writeBatch(db);
        const payload = {
          merchantAccountId: savedNote.merchantAccountId,
          merchantEmail: savedNote.merchantEmail,
          body: savedNote.body,
          authorUid: savedNote.authorUid,
          authorName: savedNote.authorName,
          authorEmail: savedNote.authorEmail,
          authorRoleName: savedNote.authorRoleName,
          updatedAt: serverTimestamp(),
        };
        if (isEdit) {
          batch.update(doc(db, 'merchantSupportNotes', id), payload);
        } else {
          batch.set(doc(db, 'merchantSupportNotes', id), {
            ...payload,
            createdAt: serverTimestamp(),
          });
        }
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          accountId: merchantAccountId,
          type: 'admin_action',
          action: isEdit ? 'update_merchant_note' : 'create_merchant_note',
          targetType: 'merchant_note',
          targetId: id,
          detail: detail.slice(0, 400),
          note: body.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `merchantSupportNotes/${id}`);
      }

      return savedNote;
    },
    [canAdmin, getAdminActorMeta, merchantSupportNotes, isAutoTest]
  );

  const deleteMerchantSupportNote = useCallback(
    async (noteId: string) => {
      if (!canAdmin('merchant_notes', 'delete')) {
        throw new Error('মার্চেন্ট নোট মোছার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const target = merchantSupportNotes.find((n) => n.id === noteId);
      const actId = generateDocId('act');
      const detail = `মার্চেন্ট নোট মুছে ফেলা হয়েছে (${target?.merchantEmail || noteId})`;

      if (isAutoTest) {
        setMerchantSupportNotes((prev) => prev.filter((n) => n.id !== noteId));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            accountId: target?.merchantAccountId,
            type: 'admin_action',
            action: 'delete_merchant_note',
            targetType: 'merchant_note',
            targetId: noteId,
            detail,
            note: detail,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'merchantSupportNotes', noteId));
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          accountId: target?.merchantAccountId || null,
          type: 'admin_action',
          action: 'delete_merchant_note',
          targetType: 'merchant_note',
          targetId: noteId,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `merchantSupportNotes/${noteId}`);
      }
    },
    [canAdmin, getAdminActorMeta, merchantSupportNotes, isAutoTest]
  );

  const logAdminReportExport = useCallback(
    async (reportLabelBn: string) => {
      if (!canAdmin('reports', 'export')) {
        throw new Error('রিপোর্ট এক্সপোর্ট করার অনুমতি আপনার নেই।');
      }
      const actor = getAdminActorMeta();
      const actId = generateDocId('act');
      const detail = `রিপোর্ট এক্সপোর্ট: ${reportLabelBn}`.slice(0, 400);

      if (isAutoTest) {
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'export_report',
            targetType: 'platform',
            targetId: 'reports',
            detail,
            note: detail,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        await setDoc(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'export_report',
          targetType: 'platform',
          targetId: 'reports',
          detail,
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
      } catch {
        // Non-fatal export audit
      }
    },
    [canAdmin, getAdminActorMeta, isAutoTest]
  );

  // ─── Part D.4: Staff First-Login Forced Password Change ─────────────────
  const completeStaffFirstLoginPasswordChange = useCallback(
    async (newPassword: string, currentTempPassword?: string) => {
      if (!currentStaff) {
        throw new Error('স্টাফ অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।');
      }
      const cleanNew = newPassword.trim();
      if (cleanNew.length < 6) {
        throw new Error('নতুন পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।');
      }

      const nowMs = Date.now();
      const actId = generateDocId('act');
      const detail = `প্রথম লগইনে পাসওয়ার্ড পরিবর্তন সম্পন্ন: ${currentStaff.name}`;

      if (isAutoTest) {
        setCurrentStaff((prev) =>
          prev ? { ...prev, mustChangePassword: false, updatedAtMs: nowMs } : prev
        );
        setStaffMembers((prev) =>
          prev.map((s) =>
            s.id === currentStaff.id
              ? { ...s, mustChangePassword: false, updatedAtMs: nowMs }
              : s
          )
        );
        setActivityLog((prev) => [
          {
            id: actId,
            actorAccountId: currentStaff.id,
            actorEmail: currentStaff.email,
            actorName: currentStaff.name,
            actorRoleId: currentStaff.roleId,
            actorRoleName: currentStaff.roleName,
            type: 'admin_action',
            action: 'staff_password_changed',
            targetType: 'staff',
            targetId: currentStaff.id,
            detail,
            note: detail,
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return;
      }

      if (!fbUser) throw new Error('সাইন ইন সেশন পাওয়া যায়নি। আবার লগইন করুন।');

      try {
        await updatePassword(fbUser, cleanNew);
      } catch (err) {
        if (currentTempPassword && fbUser.email) {
          const cred = EmailAuthProvider.credential(fbUser.email, currentTempPassword);
          await reauthenticateWithCredential(fbUser, cred);
          await updatePassword(fbUser, cleanNew);
        } else {
          throw err;
        }
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'staff', currentStaff.id), {
          mustChangePassword: false,
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          actorAccountId: currentStaff.id,
          actorEmail: currentStaff.email,
          actorName: currentStaff.name,
          actorRoleId: currentStaff.roleId,
          actorRoleName: currentStaff.roleName,
          type: 'admin_action',
          action: 'staff_password_changed',
          targetType: 'staff',
          targetId: currentStaff.id,
          detail,
          note: detail,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `staff/${currentStaff.id}`);
      }
    },
    [currentStaff, fbUser, isAutoTest]
  );

  // ─── Part B, C, D, E: Super Admin ONLY Staff & Custom Roles Management ──
  const adminSaveStaffRole = useCallback(
    async (
      input: { name: string; rules: StaffRuleMatrix; isStarter?: boolean },
      existingRoleId?: string
    ): Promise<StaffRoleDoc> => {
      if (!account?.isSuperAdmin) {
        throw new Error('শুধুমাত্র সুপার অ্যাডমিন রোল তৈরি বা পরিবর্তন করতে পারেন।');
      }
      const cleanName = input.name.trim().slice(0, 80);
      if (!cleanName) throw new Error('রোলের নাম লিখুন (যেমন: হিসাবরক্ষক, সাপোর্ট লিড)।');

      const duplicateByName = staffRoles.find(
        (r) =>
          r.id !== existingRoleId &&
          r.name.trim().toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicateByName) {
        throw new Error(`"${cleanName}" নামে ইতিমধ্যে একটি রোল রয়েছে।`);
      }

      const cleanRules = normalizeStaffRuleMatrix(input.rules);
      const id = existingRoleId || generateDocId('role');
      const isEdit = Boolean(existingRoleId);
      const existing = existingRoleId ? staffRoles.find((r) => r.id === existingRoleId) : undefined;
      const nowMs = Date.now();

      const savedRole: StaffRoleDoc = {
        id,
        name: cleanName,
        rules: cleanRules,
        isStarter: existing?.isStarter ?? Boolean(input.isStarter),
        createdAtMs: existing?.createdAtMs ?? nowMs,
        updatedAtMs: nowMs,
      };

      const affectedStaff = isEdit ? staffMembers.filter((s) => s.roleId === id) : [];
      const actId = generateDocId('act');
      const detail = isEdit
        ? `রোল আপডেট: ${cleanName} (${affectedStaff.length} জন স্টাফের নিয়ম সিঙ্ক হয়েছে)`
        : `নতুন রোল তৈরি: ${cleanName}`;
      const actor = getAdminActorMeta();

      if (isAutoTest) {
        setStaffRoles((prev) =>
          isEdit ? prev.map((r) => (r.id === id ? savedRole : r)) : [...prev, savedRole]
        );
        if (isEdit && affectedStaff.length > 0) {
          setStaffMembers((prev) =>
            prev.map((s) => {
              if (s.roleId !== id) return s;
              const nextEffective = resolveStaffEffectiveRules(
                cleanRules,
                s.hasCustomOverride,
                s.overrideRules
              );
              return {
                ...s,
                roleName: cleanName,
                effectiveRules: nextEffective,
                updatedAtMs: nowMs,
              };
            })
          );
        }
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: isEdit ? 'update_staff_role' : 'create_staff_role',
            targetType: 'role',
            targetId: id,
            detail,
            note: detail,
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return savedRole;
      }

      try {
        const batch = writeBatch(db);
        const rolePayload = {
          name: savedRole.name,
          rules: savedRole.rules,
          isStarter: Boolean(savedRole.isStarter),
          updatedAt: serverTimestamp(),
        };
        if (isEdit) {
          batch.update(doc(db, 'roles', id), rolePayload);
        } else {
          batch.set(doc(db, 'roles', id), {
            ...rolePayload,
            createdAt: serverTimestamp(),
          });
        }

        // Part B.3: Changing a role's rules applies immediately to every staff member on that role
        if (isEdit) {
          for (const member of affectedStaff) {
            const nextEffective = resolveStaffEffectiveRules(
              cleanRules,
              member.hasCustomOverride,
              member.overrideRules
            );
            batch.update(doc(db, 'staff', member.id), {
              roleName: cleanName,
              effectiveRules: nextEffective,
              updatedAt: serverTimestamp(),
            });
          }
        }

        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: isEdit ? 'update_staff_role' : 'create_staff_role',
          targetType: 'role',
          targetId: id,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `roles/${id}`);
      }

      return savedRole;
    },
    [account, staffRoles, staffMembers, getAdminActorMeta, isAutoTest]
  );

  const adminDuplicateStaffRole = useCallback(
    async (roleId: string): Promise<StaffRoleDoc> => {
      if (!account?.isSuperAdmin) {
        throw new Error('শুধুমাত্র সুপার অ্যাডমিন রোল ডুপ্লিকেট করতে পারেন।');
      }
      const source = staffRoles.find((r) => r.id === roleId);
      if (!source) throw new Error('রোলটি খুঁজে পাওয়া যায়নি।');
      let copyName = `${source.name} (কপি)`;
      let counter = 2;
      while (
        staffRoles.some((r) => r.name.trim().toLowerCase() === copyName.toLowerCase())
      ) {
        copyName = `${source.name} (কপি ${counter})`;
        counter += 1;
      }
      return adminSaveStaffRole({
        name: copyName.slice(0, 80),
        rules: source.rules,
        isStarter: false,
      });
    },
    [account, staffRoles, adminSaveStaffRole]
  );

  const adminDeleteStaffRole = useCallback(
    async (roleId: string) => {
      if (!account?.isSuperAdmin) {
        throw new Error('শুধুমাত্র সুপার অ্যাডমিন রোল মুছে ফেলতে পারেন।');
      }
      const target = staffRoles.find((r) => r.id === roleId);
      if (!target) throw new Error('রোলটি খুঁজে পাওয়া যায়নি।');

      // Part B.1: Deletion is allowed ONLY when no staff is assigned to it
      const assignedStaff = staffMembers.filter((s) => s.roleId === roleId);
      if (assignedStaff.length > 0) {
        throw new Error(
          `এই রোলে ${assignedStaff.length.toLocaleString('bn-BD')} জন স্টাফ নিযুক্ত আছেন। রোলটি মুছে ফেলার আগে তাদের অন্য রোলে স্থানান্তর করুন।`
        );
      }

      const actor = getAdminActorMeta();
      const actId = generateDocId('act');
      const detail = `রোল মুছে ফেলা হয়েছে: ${target.name}`;

      if (isAutoTest) {
        setStaffRoles((prev) => prev.filter((r) => r.id !== roleId));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'delete_staff_role',
            targetType: 'role',
            targetId: roleId,
            detail,
            note: detail,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'roles', roleId));
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'delete_staff_role',
          targetType: 'role',
          targetId: roleId,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `roles/${roleId}`);
      }
    },
    [account, staffRoles, staffMembers, getAdminActorMeta, isAutoTest]
  );

  const adminCreateStaffAccount = useCallback(
    async (input: {
      name: string;
      email: string;
      phone: string;
      tempPassword: string;
      roleId: string;
      hasCustomOverride: boolean;
      overrideRules: StaffRuleMatrix | null;
    }): Promise<StaffMemberDoc> => {
      if (!account?.isSuperAdmin) {
        throw new Error('শুধুমাত্র সুপার অ্যাডমিন নতুন স্টাফ অ্যাকাউন্ট তৈরি করতে পারেন।');
      }

      const cleanName = input.name.trim().slice(0, 80);
      if (!cleanName) throw new Error('স্টাফের নাম লিখুন।');
      const cleanEmail = input.email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length > 160) {
        throw new Error('সঠিক ইমেইল ঠিকানা লিখুন।');
      }
      if (isSuperAdminEmail(cleanEmail)) {
        throw new Error('সুপার অ্যাডমিনের ইমেইল দিয়ে স্টাফ অ্যাকাউন্ট তৈরি করা যাবে না।');
      }
      if (staffMembers.some((s) => s.email.toLowerCase() === cleanEmail)) {
        throw new Error('এই ইমেইল দিয়ে ইতিমধ্যে একজন স্টাফ অ্যাকাউন্ট রয়েছে।');
      }
      const cleanPhone = input.phone.trim().slice(0, 32);
      if (!cleanPhone) throw new Error('স্টাফের ফোন নম্বর লিখুন।');
      const tempPassword = input.tempPassword;
      if (!tempPassword || tempPassword.length < 6) {
        throw new Error('অস্থায়ী পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।');
      }

      const role = staffRoles.find((r) => r.id === input.roleId);
      if (!role) throw new Error('একটি বৈধ রোল নির্বাচন করুন।');

      const hasCustomOverride = Boolean(input.hasCustomOverride && input.overrideRules);
      const overrideRules =
        hasCustomOverride && input.overrideRules
          ? normalizeStaffRuleMatrix(input.overrideRules)
          : null;
      const effectiveRules = resolveStaffEffectiveRules(
        role.rules,
        hasCustomOverride,
        overrideRules
      );

      const nowMs = Date.now();
      const actor = getAdminActorMeta();
      const actId = generateDocId('act');
      const detail = `নতুন স্টাফ যোগ করা হয়েছে: ${cleanName} (${cleanEmail}) — রোল: ${role.name}${
        hasCustomOverride ? ' [কাস্টম নিয়ম]' : ''
      }`;

      if (isAutoTest) {
        const fakeUid = generateDocId('staff_uid');
        const createdStaff: StaffMemberDoc = {
          id: fakeUid,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          roleId: role.id,
          roleName: role.name,
          hasCustomOverride,
          overrideRules,
          effectiveRules,
          status: 'active',
          mustChangePassword: true,
          lastLoginAtMs: null,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        };
        setStaffMembers((prev) => [createdStaff, ...prev]);
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'create_staff_account',
            targetType: 'staff',
            targetId: fakeUid,
            detail,
            note: detail,
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return createdStaff;
      }

      // Part D.3: Create Firebase Auth account on an isolated secondary Firebase App
      // so the Super Admin's active session is NEVER logged out or disturbed.
      const secondaryAppName = `StaffProvisioner_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const secondaryApp = initializeApp(firebaseProjectConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);
      let newStaffUid = '';

      try {
        const cred = await createUserWithEmailAndPassword(
          secondaryAuth,
          cleanEmail,
          tempPassword
        );
        newStaffUid = cred.user.uid;
        await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
        await signOut(secondaryAuth).catch(() => {});
      } catch (authErr) {
        const code = (authErr as { code?: string })?.code || '';
        if (code === 'auth/email-already-in-use') {
          throw new Error('এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। অন্য ইমেইল ব্যবহার করুন।');
        }
        if (code === 'auth/invalid-email') {
          throw new Error('ইমেইল ঠিকানাটি সঠিক নয়।');
        }
        if (code === 'auth/weak-password') {
          throw new Error('অস্থায়ী পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।');
        }
        throw new Error(
          authErr instanceof Error ? authErr.message : 'স্টাফ অ্যাকাউন্ট তৈরি করা যায়নি।'
        );
      } finally {
        await deleteApp(secondaryApp).catch(() => {});
      }

      const createdStaff: StaffMemberDoc = {
        id: newStaffUid,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        roleId: role.id,
        roleName: role.name,
        hasCustomOverride,
        overrideRules,
        effectiveRules,
        status: 'active',
        mustChangePassword: true,
        lastLoginAtMs: null,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      };

      // Note: Plain-text temporary password is NEVER stored in Firestore (Part G)
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'staff', newStaffUid), {
          name: createdStaff.name,
          email: createdStaff.email,
          phone: createdStaff.phone,
          roleId: createdStaff.roleId,
          roleName: createdStaff.roleName,
          hasCustomOverride: createdStaff.hasCustomOverride,
          overrideRules: createdStaff.overrideRules,
          effectiveRules: createdStaff.effectiveRules,
          status: 'active',
          mustChangePassword: true,
          lastLoginAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'create_staff_account',
          targetType: 'staff',
          targetId: newStaffUid,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `staff/${newStaffUid}`);
      }

      return createdStaff;
    },
    [account, staffMembers, staffRoles, getAdminActorMeta, isAutoTest]
  );

  const adminUpdateStaffMember = useCallback(
    async (
      staffUid: string,
      input: {
        name?: string;
        phone?: string;
        roleId: string;
        hasCustomOverride: boolean;
        overrideRules: StaffRuleMatrix | null;
      }
    ) => {
      if (!account?.isSuperAdmin) {
        throw new Error('শুধুমাত্র সুপার অ্যাডমিন স্টাফের রোল বা নিয়ম পরিবর্তন করতে পারেন।');
      }
      const target = staffMembers.find((s) => s.id === staffUid);
      if (!target) throw new Error('স্টাফ অ্যাকাউন্টটি খুঁজে পাওয়া যায়নি।');
      const role = staffRoles.find((r) => r.id === input.roleId);
      if (!role) throw new Error('একটি বৈধ রোল নির্বাচন করুন।');

      const cleanName = input.name !== undefined ? input.name.trim().slice(0, 80) : target.name;
      if (!cleanName) throw new Error('স্টাফের নাম লিখুন।');
      const cleanPhone =
        input.phone !== undefined ? input.phone.trim().slice(0, 32) : target.phone;

      const hasCustomOverride = Boolean(input.hasCustomOverride && input.overrideRules);
      const overrideRules =
        hasCustomOverride && input.overrideRules
          ? normalizeStaffRuleMatrix(input.overrideRules)
          : null;
      const effectiveRules = resolveStaffEffectiveRules(
        role.rules,
        hasCustomOverride,
        overrideRules
      );

      const nowMs = Date.now();
      const actor = getAdminActorMeta();
      const actId = generateDocId('act');
      const detail = `স্টাফ আপডেট: ${cleanName} (${target.email}) — রোল: ${role.name}${
        hasCustomOverride ? ' [কাস্টম নিয়ম]' : ''
      }`;

      if (isAutoTest) {
        setStaffMembers((prev) =>
          prev.map((s) =>
            s.id === staffUid
              ? {
                  ...s,
                  name: cleanName,
                  phone: cleanPhone,
                  roleId: role.id,
                  roleName: role.name,
                  hasCustomOverride,
                  overrideRules,
                  effectiveRules,
                  updatedAtMs: nowMs,
                }
              : s
          )
        );
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'update_staff_member',
            targetType: 'staff',
            targetId: staffUid,
            detail,
            note: detail,
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'staff', staffUid), {
          name: cleanName,
          phone: cleanPhone,
          roleId: role.id,
          roleName: role.name,
          hasCustomOverride,
          overrideRules,
          effectiveRules,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'update_staff_member',
          targetType: 'staff',
          targetId: staffUid,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `staff/${staffUid}`);
      }
    },
    [account, staffMembers, staffRoles, getAdminActorMeta, isAutoTest]
  );

  const adminToggleStaffStatus = useCallback(
    async (staffUid: string, nextStatus: StaffMemberStatus) => {
      if (!account?.isSuperAdmin) {
        throw new Error('শুধুমাত্র সুপার অ্যাডমিন স্টাফ অ্যাকাউন্ট সক্রিয় বা বন্ধ করতে পারেন।');
      }
      const target = staffMembers.find((s) => s.id === staffUid);
      if (!target) throw new Error('স্টাফ অ্যাকাউন্টটি খুঁজে পাওয়া যায়নি।');

      const nowMs = Date.now();
      const actor = getAdminActorMeta();
      const actId = generateDocId('act');
      const detail = `স্টাফ অ্যাকাউন্ট ${nextStatus === 'active' ? 'সক্রিয়' : 'বন্ধ'} করা হয়েছে: ${target.name} (${target.email})`;

      if (isAutoTest) {
        setStaffMembers((prev) =>
          prev.map((s) =>
            s.id === staffUid ? { ...s, status: nextStatus, updatedAtMs: nowMs } : s
          )
        );
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: nextStatus === 'active' ? 'activate_staff' : 'disable_staff',
            targetType: 'staff',
            targetId: staffUid,
            detail,
            note: detail,
            createdAtMs: nowMs,
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'staff', staffUid), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: nextStatus === 'active' ? 'activate_staff' : 'disable_staff',
          targetType: 'staff',
          targetId: staffUid,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `staff/${staffUid}`);
      }
    },
    [account, staffMembers, getAdminActorMeta, isAutoTest]
  );

  const adminSendStaffPasswordReset = useCallback(
    async (staffUid: string) => {
      if (!account?.isSuperAdmin) {
        throw new Error('শুধুমাত্র সুপার অ্যাডমিন স্টাফের পাসওয়ার্ড রিসেট ইমেইল পাঠাতে পারেন।');
      }
      const target = staffMembers.find((s) => s.id === staffUid);
      if (!target) throw new Error('স্টাফ অ্যাকাউন্টটি খুঁজে পাওয়া যায়নি।');

      const actor = getAdminActorMeta();
      const actId = generateDocId('act');
      const detail = `স্টাফ পাসওয়ার্ড রিসেট ইমেইল পাঠানো হয়েছে: ${target.name} (${target.email})`;

      if (isAutoTest) {
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'reset_staff_password_email',
            targetType: 'staff',
            targetId: staffUid,
            detail,
            note: detail,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      await sendPasswordResetEmail(auth, target.email);
      try {
        await setDoc(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'reset_staff_password_email',
          targetType: 'staff',
          targetId: staffUid,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
      } catch {
        // Non-fatal audit write
      }
    },
    [account, staffMembers, getAdminActorMeta, isAutoTest]
  );

  const adminRemoveStaffMember = useCallback(
    async (staffUid: string) => {
      if (!account?.isSuperAdmin) {
        throw new Error('শুধুমাত্র সুপার অ্যাডমিন স্টাফ অ্যাকাউন্ট মুছে ফেলতে পারেন।');
      }
      const target = staffMembers.find((s) => s.id === staffUid);
      if (!target) throw new Error('স্টাফ অ্যাকাউন্টটি খুঁজে পাওয়া যায়নি।');

      const actor = getAdminActorMeta();
      const actId = generateDocId('act');
      const detail = `স্টাফ অ্যাকাউন্ট মুছে ফেলা হয়েছে: ${target.name} (${target.email}) — পূর্বের অ্যাক্টিভিটি লগ অক্ষুণ্ণ রয়েছে`;

      if (isAutoTest) {
        setStaffMembers((prev) => prev.filter((s) => s.id !== staffUid));
        setActivityLog((prev) => [
          {
            id: actId,
            ...actor,
            type: 'admin_action',
            action: 'remove_staff_member',
            targetType: 'staff',
            targetId: staffUid,
            detail,
            note: detail,
            createdAtMs: Date.now(),
          },
          ...prev,
        ]);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'staff', staffUid));
        batch.set(doc(db, 'payActivity', actId), {
          ...actor,
          type: 'admin_action',
          action: 'remove_staff_member',
          targetType: 'staff',
          targetId: staffUid,
          detail: detail.slice(0, 400),
          note: detail.slice(0, 300),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `staff/${staffUid}`);
      }
    },
    [account, staffMembers, getAdminActorMeta, isAutoTest]
  );

  const dismissNewDeviceLoginAlert = useCallback(() => setNewDeviceLoginAlert(false), []);

  const value = useMemo<PayVerifyContextValue>(
    () => ({
      user: activeUser,
      authReady,
      authMetadata,
      dataLoading,
      platformConfig,
      account,
      currentStaff,
      isAdminPortalUser,
      staffBlockedReason,
      clearStaffBlockedReason,
      canAdmin,
      planEvaluation,
      effectivePlan,
      plans,
      visibleMarketingPlans,
      addons,
      coupons,
      changelog,
      hasUnreadChangelog,
      accessibleStores,
      ownedStores,
      pausedStoreIds,
      selectedStore,
      selectedStoreId: selectedStore?.id ?? null,
      selectedStorePermissions,
      selectedStoreIsPaused,
      setSelectedStoreId,
      accountSessions,
      storeSessions,
      subscriptionReceipts,
      smsList,
      devices,
      pairingTokens,
      loginHistory,
      deviceRejectedAlerts,
      newDeviceLoginAlert,
      dismissNewDeviceLoginAlert,
      allAccounts,
      allStores,
      allSessions,
      allDevices,
      activityLog,
      subscriptionPurchases,
      staffRoles,
      staffMembers,
      merchantSupportNotes,
      appReleases,
      publishedAppRelease,
      appReleasesLoaded,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signUpFunnelAccount,
      reauthenticateUser,
      signOutUser,
      signOutAllSessions,
      markChangelogRead,
      completeStaffFirstLoginPasswordChange,
      createStore,
      saveStorePaymentMethods,
      saveStoreSettings,
      savePaymentPageSettings,
      rotateStoreKey,
      markStoreLiveManually,
      addStoreMember,
      removeStoreMember,
      deleteStore,
      createManualSessionViaWorker,
      createTestVerificationSession,
      sendSimulatedTestSms,
      testHistoryClearedBeforeMs,
      clearTestHistory,
      cancelWaitingSession,
      manualConfirmSession,
      matchUnmatchedSmsToSession,
      dismissUnmatchedSms,
      issueSingleUsePairingToken,
      revokeDevice,
      lookupCouponForPreview,
      initiateSubscriptionCheckout,
      adminSaveWorkerBaseUrl,
      adminSavePlatformSettings,
      adminUpdateAccount,
      adminDeleteMerchantAccount,
      adminConvertStoreType,
      adminReassignStore,
      adminSavePlan,
      adminArchivePlan,
      adminDeletePlan,
      adminSaveAddon,
      adminSaveCoupon,
      adminSaveChangelog,
      adminDeleteChangelog,
      adminSaveAppRelease,
      adminTogglePublishAppRelease,
      adminDeleteAppRelease,
      recordAppReleaseDownload,
      adminVerifyOrNotePaymentSession,
      adminDeletePaymentSession,
      saveMerchantSupportNote,
      deleteMerchantSupportNote,
      logAdminReportExport,
      adminSaveStaffRole,
      adminDuplicateStaffRole,
      adminDeleteStaffRole,
      adminCreateStaffAccount,
      adminUpdateStaffMember,
      adminToggleStaffStatus,
      adminSendStaffPasswordReset,
      adminRemoveStaffMember,
    }),
    [
      activeUser,
      authReady,
      authMetadata,
      dataLoading,
      platformConfig,
      account,
      currentStaff,
      isAdminPortalUser,
      staffBlockedReason,
      clearStaffBlockedReason,
      canAdmin,
      planEvaluation,
      effectivePlan,
      plans,
      visibleMarketingPlans,
      addons,
      coupons,
      changelog,
      hasUnreadChangelog,
      accessibleStores,
      ownedStores,
      pausedStoreIds,
      selectedStore,
      selectedStorePermissions,
      selectedStoreIsPaused,
      setSelectedStoreId,
      accountSessions,
      storeSessions,
      subscriptionReceipts,
      smsList,
      devices,
      pairingTokens,
      loginHistory,
      deviceRejectedAlerts,
      newDeviceLoginAlert,
      dismissNewDeviceLoginAlert,
      allAccounts,
      allStores,
      allSessions,
      allDevices,
      activityLog,
      subscriptionPurchases,
      staffRoles,
      staffMembers,
      merchantSupportNotes,
      appReleases,
      publishedAppRelease,
      appReleasesLoaded,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signUpFunnelAccount,
      reauthenticateUser,
      signOutUser,
      signOutAllSessions,
      markChangelogRead,
      completeStaffFirstLoginPasswordChange,
      createStore,
      saveStorePaymentMethods,
      saveStoreSettings,
      savePaymentPageSettings,
      rotateStoreKey,
      markStoreLiveManually,
      addStoreMember,
      removeStoreMember,
      deleteStore,
      createManualSessionViaWorker,
      createTestVerificationSession,
      sendSimulatedTestSms,
      testHistoryClearedBeforeMs,
      clearTestHistory,
      cancelWaitingSession,
      manualConfirmSession,
      matchUnmatchedSmsToSession,
      dismissUnmatchedSms,
      issueSingleUsePairingToken,
      revokeDevice,
      lookupCouponForPreview,
      initiateSubscriptionCheckout,
      adminSaveWorkerBaseUrl,
      adminSavePlatformSettings,
      adminUpdateAccount,
      adminDeleteMerchantAccount,
      adminConvertStoreType,
      adminReassignStore,
      adminSavePlan,
      adminArchivePlan,
      adminDeletePlan,
      adminSaveAddon,
      adminSaveCoupon,
      adminSaveChangelog,
      adminDeleteChangelog,
      adminSaveAppRelease,
      adminTogglePublishAppRelease,
      adminDeleteAppRelease,
      recordAppReleaseDownload,
      adminVerifyOrNotePaymentSession,
      adminDeletePaymentSession,
      saveMerchantSupportNote,
      deleteMerchantSupportNote,
      logAdminReportExport,
      adminSaveStaffRole,
      adminDuplicateStaffRole,
      adminDeleteStaffRole,
      adminCreateStaffAccount,
      adminUpdateStaffMember,
      adminToggleStaffStatus,
      adminSendStaffPasswordReset,
      adminRemoveStaffMember,
    ]
  );

  return <PayVerifyContext.Provider value={value}>{children}</PayVerifyContext.Provider>;
};

export function usePayVerify(): PayVerifyContextValue {
  const ctx = useContext(PayVerifyContext);
  if (!ctx) throw new Error('usePayVerify must be used inside PayVerifyProvider');
  return ctx;
}
