import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
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
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
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
  createWorkerSession,
  normalizeWorkerBaseUrl,
} from './workerClient';
import {
  DEFAULT_PLATFORM_CONFIG,
  mapAccount,
  mapActivity,
  mapAddon,
  mapChangelog,
  mapCoupon,
  mapDevice,
  mapLegacySettings,
  mapPairingToken,
  mapPlan,
  mapPlatformConfig,
  mapSession,
  mapSms,
  mapStore,
} from './storeMappers';
import {
  DEFAULT_STORE_ACCENT,
  LEGACY_MIGRATED_STORE_ID,
  SEEDED_PLAN_IDS,
  SUPER_ADMIN_EMAIL,
  TRIAL_DURATION_MS,
  type AddonKind,
  type PairingTokenDoc,
  type PayAccountDoc,
  type PayActivityDoc,
  type PayAddonDoc,
  type PayChangelogDoc,
  type PayCouponDoc,
  type PayDeviceDoc,
  type PaymentAccountsMap,
  type PayPlanDoc,
  type PayPlanFeatures,
  type PayPlatformConfig,
  type PaySessionDoc,
  type PaySmsDoc,
  type PayStoreDoc,
  type PlanStatus,
  type StoreMemberRole,
  type StoreType,
  type WalletEnabledMap,
  type WalletMethod,
  type WalletNumbersMap,
  type WorkerCreateSessionResponse,
} from '../types/payment';
import {
  CHECKOUT_METHODS,
  isValidLogoDataUrl,
  syncLegacyNumbersFromAccounts,
} from './checkoutFlow';

const SELECTED_STORE_KEY = 'payverify_bd_selected_store_id';

export function getAutomatedTestRole(): 'superadmin' | 'merchant' | 'grace' | null {
  if (typeof window === 'undefined') return null;
  const val = new URLSearchParams(window.location.search).get('autostart');
  if (val === '1' || val === 'superadmin') return 'superadmin';
  if (val === 'merchant') return 'merchant';
  if (val === 'grace') return 'grace';
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
  // Super Admin datasets (populated ONLY when account.isSuperAdmin === true)
  allAccounts: PayAccountDoc[];
  allStores: PayStoreDoc[];
  allSessions: PaySessionDoc[];
  allDevices: PayDeviceDoc[];
  activityLog: PayActivityDoc[];
  // Auth & Security
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  reauthenticateUser: (password?: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  signOutAllSessions: () => Promise<{ localSignedOut: boolean; workerRevocationPending: boolean }>;
  markChangelogRead: () => Promise<void>;
  // Stores
  createStore: (name: string) => Promise<{ store: PayStoreDoc; rawStoreKey: string }>;
  saveStoreSettings: (
    storeId: string,
    input: {
      name: string;
      numbers: WalletNumbersMap;
      numberEnabled: WalletEnabledMap;
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
      numberEnabled: { bkash: boolean; nagad: boolean; rocket: boolean };
      paymentAccounts: PaymentAccountsMap;
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
  // Super Admin actions (all log payActivity)
  adminSaveWorkerBaseUrl: (workerBaseUrl: string, note?: string) => Promise<void>;
  adminSavePlatformSettings: (
    input: {
      workerBaseUrl?: string;
      trialPlanId?: string;
      subscriptionStoreId?: string | null;
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

  const [account, setAccount] = useState<PayAccountDoc | null>(() => {
    if (!isAutoTest) return null;
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

  const [ownedStores, setOwnedStores] = useState<PayStoreDoc[]>([]);
  const [sharedStores, setSharedStores] = useState<PayStoreDoc[]>([]);
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

  const setSelectedStoreId = useCallback((storeId: string) => {
    setSelectedStoreIdState(storeId);
    try {
      window.localStorage.setItem(SELECTED_STORE_KEY, storeId);
    } catch {
      // Ignore
    }
  }, []);

  // Public visible marketing plans listener (works even before sign-in so /plans works)
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

  useEffect(() => {
    if (isAutoTest) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      setAuthReady(true);
      if (!u) {
        loginLoggedUidRef.current = null;
        setDataLoading(false);
        setAccount(null);
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
        setAddons([]);
        setCoupons([]);
        setChangelog([]);
      }
    });
    return unsub;
  }, [isAutoTest]);

  // Bootstrap account, run idempotent A1 + A2 migrations, record login event, and attach listeners
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
        emailLower === SUPER_ADMIN_EMAIL && fbUser.emailVerified === true;

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

      // 4. Super Admin idempotent A1 + A2 migrations
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
          const [plansSnap, accountsSnap] = await Promise.all([
            getDocs(collection(db, 'payPlans')),
            getDocs(collection(db, 'payAccounts')),
          ]);
          if (cancelled) return;

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

        unsubs.push(uAllAccounts, uAllStores, uAllSessions, uAllDevices, uActivity, uCoupons);
      }
    };

    void bootstrapAndSubscribe();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
  }, [isAutoTest, authReady, fbUser]);

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

  // Derived data
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
    if (isAutoTest && account) {
      return { uid: account.id, email: account.email, displayName: account.displayName };
    }
    if (!fbUser) return null;
    return {
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || fbUser.email || '',
    };
  }, [isAutoTest, account, fbUser]);

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
  const signInWithGoogle = useCallback(async () => {
    if (isAutoTest) return;
    await signInWithPopup(auth, googleProvider);
  }, [isAutoTest]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (isAutoTest) return;
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    [isAutoTest]
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

      const newStore: PayStoreDoc = {
        id,
        accountId: account.id,
        name,
        type: storeType,
        numbers: { bkash: '', nagad: '', rocket: '', upay: '' },
        numberEnabled: { bkash: true, nagad: true, rocket: true, upay: true },
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

  const saveStoreSettings = useCallback(
    async (
      storeId: string,
      input: {
        name: string;
        numbers: WalletNumbersMap;
        numberEnabled: WalletEnabledMap;
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

      const cleanedNumbers: WalletNumbersMap = { bkash: '', nagad: '', rocket: '', upay: '' };
      for (const key of ['bkash', 'nagad', 'rocket', 'upay'] as WalletMethod[]) {
        const raw = input.numbers[key].trim();
        if (!raw) {
          cleanedNumbers[key] = '';
        } else {
          const norm = normalizeBdPhone(raw);
          if (!norm) {
            throw new Error(`${key} নম্বরটি সঠিক ১১ ডিজিটের বাংলাদেশি নম্বর হতে হবে (01XXXXXXXXX)।`);
          }
          cleanedNumbers[key] = norm;
        }
      }

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
        numbers: cleanedNumbers,
        numberEnabled: input.numberEnabled,
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
                numbers: cleanedNumbers,
                numberEnabled: input.numberEnabled,
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
        numberEnabled: { bkash: boolean; nagad: boolean; rocket: boolean };
        paymentAccounts: PaymentAccountsMap;
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

      const cleanedAccounts: PaymentAccountsMap = { bkash: [], nagad: [], rocket: [] };
      for (const method of CHECKOUT_METHODS) {
        const rawList = Array.isArray(input.paymentAccounts[method])
          ? input.paymentAccounts[method]
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
          cleanedAccounts[method].push({
            number: norm,
            type: item.type === 'agent' ? 'agent' : 'personal',
            active: Boolean(item.active),
          });
          if (cleanedAccounts[method].length >= 10) break;
        }
      }

      const nextEnabled: WalletEnabledMap = {
        bkash: Boolean(input.numberEnabled.bkash),
        nagad: Boolean(input.numberEnabled.nagad),
        rocket: Boolean(input.numberEnabled.rocket),
        upay: Boolean(target.numberEnabled.upay),
      };
      const syncedNumbers = syncLegacyNumbersFromAccounts(cleanedAccounts, target.numbers.upay);

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

      cacheWorkerConfigLocally(nextWorker, selectedStore?.name || '');
      const actId = generateDocId('act');
      const cleanNote = note.trim().slice(0, 300) || 'প্ল্যাটফর্ম সেটিংস আপডেট';
      const detail = `Platform config updated (trialPlan=${nextTrialPlan}, subStore=${nextSubStore || 'none'})`;

      if (isAutoTest) {
        setPlatformConfig((prev) => ({
          ...prev,
          workerBaseUrl: nextWorker,
          trialPlanId: nextTrialPlan,
          subscriptionStoreId: nextSubStore,
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

  const adminSaveWorkerBaseUrl = useCallback(
    async (rawUrl: string, note = 'প্ল্যাটফর্ম Worker URL আপডেট') => {
      await adminSavePlatformSettings({ workerBaseUrl: rawUrl }, note);
    },
    [adminSavePlatformSettings]
  );

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
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
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
            actorAccountId: account.id,
            actorEmail: account.email,
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
          actorAccountId: account.id,
          actorEmail: account.email,
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
    [account, isAutoTest]
  );

  const adminConvertStoreType = useCallback(
    async (storeId: string, newType: StoreType, note: string) => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
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
            actorAccountId: account.id,
            actorEmail: account.email,
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
          actorAccountId: account.id,
          actorEmail: account.email,
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
    [account, allStores, isAutoTest]
  );

  const adminReassignStore = useCallback(
    async (storeId: string, newAccountId: string, newOwnerEmail: string, note: string) => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
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
        if (newAccountId !== account.id) {
          setOwnedStores((prev) => prev.filter((s) => s.id !== storeId));
        }
        setActivityLog((prev) => [
          {
            id: actId,
            actorAccountId: account.id,
            actorEmail: account.email,
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
          actorAccountId: account.id,
          actorEmail: account.email,
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
    [account, allStores, allAccounts, isAutoTest]
  );

  // ─── Super Admin Plan / Add-on / Coupon / Changelog CRUD ──────────────
  const adminSavePlan = useCallback(
    async (draft: PlanDraftInput, existingPlanId?: string, note?: string): Promise<PayPlanDoc> => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
      const name = draft.name.trim().slice(0, 80);
      if (!name) throw new Error('প্ল্যানের নাম লিখুন।');

      const id = existingPlanId || generateDocId('plan');
      const isEdit = Boolean(existingPlanId);
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
            actorAccountId: account.id,
            actorEmail: account.email,
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
        // If marking this plan as highlighted ("জনপ্রিয়"), unhighlight other plans
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
          actorAccountId: account.id,
          actorEmail: account.email,
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
    [account, plans, isAutoTest]
  );

  const adminArchivePlan = useCallback(
    async (planId: string, archived: boolean, note?: string) => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
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
            actorAccountId: account.id,
            actorEmail: account.email,
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
          actorAccountId: account.id,
          actorEmail: account.email,
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
    [account, plans, isAutoTest]
  );

  const adminSaveAddon = useCallback(
    async (draft: AddonDraftInput, existingAddonId?: string, note?: string): Promise<PayAddonDoc> => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
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
            actorAccountId: account.id,
            actorEmail: account.email,
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
          actorAccountId: account.id,
          actorEmail: account.email,
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
    [account, addons, isAutoTest]
  );

  const adminSaveCoupon = useCallback(
    async (
      draft: CouponDraftInput,
      existingCouponId?: string,
      note?: string
    ): Promise<PayCouponDoc> => {
      if (!account?.isSuperAdmin) throw new Error('শুধুমাত্র সুপার অ্যাডমিনের অনুমতি রয়েছে।');
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
            actorAccountId: account.id,
            actorEmail: account.email,
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
          actorAccountId: account.id,
          actorEmail: account.email,
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
    [account, coupons, isAutoTest]
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

  const dismissNewDeviceLoginAlert = useCallback(() => setNewDeviceLoginAlert(false), []);

  const value = useMemo<PayVerifyContextValue>(
    () => ({
      user: activeUser,
      authReady,
      authMetadata,
      dataLoading,
      platformConfig,
      account,
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
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      reauthenticateUser,
      signOutUser,
      signOutAllSessions,
      markChangelogRead,
      createStore,
      saveStoreSettings,
      savePaymentPageSettings,
      rotateStoreKey,
      markStoreLiveManually,
      addStoreMember,
      removeStoreMember,
      deleteStore,
      createManualSessionViaWorker,
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
      adminConvertStoreType,
      adminReassignStore,
      adminSavePlan,
      adminArchivePlan,
      adminSaveAddon,
      adminSaveCoupon,
      adminSaveChangelog,
      adminDeleteChangelog,
    }),
    [
      activeUser,
      authReady,
      authMetadata,
      dataLoading,
      platformConfig,
      account,
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
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      reauthenticateUser,
      signOutUser,
      signOutAllSessions,
      markChangelogRead,
      createStore,
      saveStoreSettings,
      savePaymentPageSettings,
      rotateStoreKey,
      markStoreLiveManually,
      addStoreMember,
      removeStoreMember,
      deleteStore,
      createManualSessionViaWorker,
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
      adminConvertStoreType,
      adminReassignStore,
      adminSavePlan,
      adminArchivePlan,
      adminSaveAddon,
      adminSaveCoupon,
      adminSaveChangelog,
      adminDeleteChangelog,
    ]
  );

  return <PayVerifyContext.Provider value={value}>{children}</PayVerifyContext.Provider>;
};

export function usePayVerify(): PayVerifyContextValue {
  const ctx = useContext(PayVerifyContext);
  if (!ctx) throw new Error('usePayVerify must be used inside PayVerifyProvider');
  return ctx;
}
