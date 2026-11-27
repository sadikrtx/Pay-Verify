import {
  ADMIN_DEVICE_ALERT_MS,
  DEVICE_FRESH_WINDOW_MS,
  GRACE_DURATION_MS,
  type PayAccountDoc,
  type PayActivityDoc,
  type PayDeviceDoc,
  type PaySessionDoc,
  type PaySmsDoc,
  type PayStoreDoc,
  type StoreMemberRole,
} from '../types/payment';
import { formatCopyAmount } from './money';

export type EffectivePlanCode =
  | 'active'
  | 'grace'
  | 'trial_active'
  | 'trial_expired'
  | 'paid_expired'
  | 'suspended';

export interface EvaluatedAccountPlan {
  code: EffectivePlanCode;
  isActive: boolean;
  canCreateSessions: boolean;
  inGrace?: boolean;
  graceDaysRemaining?: number;
  labelBn: string;
  badgeTone: 'emerald' | 'teal' | 'rose' | 'amber';
  expiresAtMs: number | null;
}

/**
 * Evaluates an account's real plan state honestly.
 * Never reports a trial-expired, paid-expired, or suspended account as active.
 */
export function evaluateAccountPlan(
  account: Pick<PayAccountDoc, 'isSuperAdmin' | 'planStatus' | 'trialEndsAtMs' | 'paidUntilMs'>,
  nowMs: number
): EvaluatedAccountPlan {
  if (account.isSuperAdmin) {
    return {
      code: 'active',
      isActive: true,
      canCreateSessions: true,
      labelBn: 'সুপার অ্যাডমিন',
      badgeTone: 'emerald',
      expiresAtMs: null,
    };
  }

  if (account.planStatus === 'suspended') {
    return {
      code: 'suspended',
      isActive: false,
      canCreateSessions: false,
      labelBn: 'স্থগিত',
      badgeTone: 'rose',
      expiresAtMs: null,
    };
  }

  if (account.planStatus === 'trial') {
    if (nowMs > account.trialEndsAtMs) {
      return {
        code: 'trial_expired',
        isActive: false,
        canCreateSessions: false,
        labelBn: 'মেয়াদ শেষ',
        badgeTone: 'rose',
        expiresAtMs: account.trialEndsAtMs,
      };
    }
    return {
      code: 'trial_active',
      isActive: true,
      canCreateSessions: true,
      labelBn: 'ট্রায়াল চালু',
      badgeTone: 'teal',
      expiresAtMs: account.trialEndsAtMs,
    };
  }

  // planStatus === 'active'
  if (account.paidUntilMs !== null && nowMs > account.paidUntilMs) {
    const graceEndsAtMs = account.paidUntilMs + GRACE_DURATION_MS;
    if (nowMs <= graceEndsAtMs) {
      const daysRemaining = Math.max(
        1,
        Math.ceil((graceEndsAtMs - nowMs) / (24 * 60 * 60 * 1000))
      );
      return {
        code: 'grace',
        isActive: true,
        canCreateSessions: true,
        inGrace: true,
        graceDaysRemaining: daysRemaining,
        labelBn: `গ্রেস — আর ${daysRemaining.toLocaleString('bn-BD')} দিন`,
        badgeTone: 'amber',
        expiresAtMs: graceEndsAtMs,
      };
    }
    return {
      code: 'paid_expired',
      isActive: false,
      canCreateSessions: false,
      labelBn: 'মেয়াদ শেষ',
      badgeTone: 'rose',
      expiresAtMs: account.paidUntilMs,
    };
  }

  return {
    code: 'active',
    isActive: true,
    canCreateSessions: true,
    labelBn: 'সক্রিয়',
    badgeTone: 'emerald',
    expiresAtMs: account.paidUntilMs,
  };
}

/**
 * Plan tier store limits: trial/basic = 1 store, pro = 5 stores.
 */
export function getStoreLimitForAccount(
  account: Pick<PayAccountDoc, 'isSuperAdmin' | 'planTier' | 'planStatus'>
): number {
  if (account.isSuperAdmin) return 100;
  if (account.planTier === 'pro' && account.planStatus === 'active') return 5;
  if (account.planTier === 'pro' && account.planStatus === 'trial') return 5;
  return 1;
}

export function canCreateAnotherStore(
  account: Pick<PayAccountDoc, 'isSuperAdmin' | 'planTier' | 'planStatus' | 'trialEndsAtMs' | 'paidUntilMs'>,
  ownedStoreCount: number,
  nowMs: number
): { allowed: boolean; limit: number; reasonBn: string | null } {
  const plan = evaluateAccountPlan(account, nowMs);
  const limit = getStoreLimitForAccount(account);
  if (!plan.isActive) {
    return {
      allowed: false,
      limit,
      reasonBn: 'আপনার অ্যাকাউন্টের মেয়াদ শেষ বা স্থগিত থাকায় নতুন স্টোর তৈরি করা যাবে না।',
    };
  }
  if (!account.isSuperAdmin && ownedStoreCount >= limit) {
    const tierName = account.planTier === 'pro' ? 'Pro' : 'Basic';
    return {
      allowed: false,
      limit,
      reasonBn: `আপনার ${tierName} প্ল্যানে সর্বোচ্চ ${limit.toLocaleString('bn-BD')}টি স্টোর তৈরি করা যায়। আরও স্টোরের জন্য প্ল্যান আপগ্রেড করুন।`,
    };
  }
  return { allowed: true, limit, reasonBn: null };
}

export type EffectiveStoreRole = 'primary-owner' | StoreMemberRole | 'super-admin' | 'none';

export interface StorePermissions {
  role: EffectiveStoreRole;
  roleLabelBn: string;
  canView: boolean;
  canEditSettings: boolean;
  canRotateStoreKey: boolean;
  canManageMembers: boolean;
  canDeleteStore: boolean;
  canCreateSession: boolean;
  canCancelSession: boolean;
  canManualConfirm: boolean;
  canManageSms: boolean;
  canConvertOrReassign: boolean;
}

/**
 * Enforces Prompt A1 shared-access RBAC:
 * - Primary owner: full control of their store
 * - co-owner: full operation EXCEPT transferring ownership, deleting store, rotating store key, or managing members
 * - manager: view sessions/SMS + manual payment confirm
 * - viewer: read-only
 * - super admin: platform-level control (convert/reassign/members/view), but NEVER edits another account's sessions/SMS
 */
export function getStorePermissions(
  store: Pick<PayStoreDoc, 'accountId' | 'memberRoles'> | null,
  account: Pick<PayAccountDoc, 'id' | 'isSuperAdmin'> | null
): StorePermissions {
  const denyAll: StorePermissions = {
    role: 'none',
    roleLabelBn: 'অনুমতি নেই',
    canView: false,
    canEditSettings: false,
    canRotateStoreKey: false,
    canManageMembers: false,
    canDeleteStore: false,
    canCreateSession: false,
    canCancelSession: false,
    canManualConfirm: false,
    canManageSms: false,
    canConvertOrReassign: false,
  };

  if (!store || !account) return denyAll;

  if (store.accountId === account.id) {
    return {
      role: 'primary-owner',
      roleLabelBn: 'মূল মালিক',
      canView: true,
      canEditSettings: true,
      canRotateStoreKey: true,
      canManageMembers: true,
      canDeleteStore: true,
      canCreateSession: true,
      canCancelSession: true,
      canManualConfirm: true,
      canManageSms: true,
      canConvertOrReassign: account.isSuperAdmin,
    };
  }

  const memberRole = store.memberRoles?.[account.id];
  if (memberRole === 'co-owner') {
    return {
      role: 'co-owner',
      roleLabelBn: 'সহ-মালিক',
      canView: true,
      canEditSettings: true,
      canRotateStoreKey: false,
      canManageMembers: false,
      canDeleteStore: false,
      canCreateSession: true,
      canCancelSession: true,
      canManualConfirm: true,
      canManageSms: false,
      canConvertOrReassign: account.isSuperAdmin,
    };
  }

  if (memberRole === 'manager') {
    return {
      role: 'manager',
      roleLabelBn: 'ম্যানেজার',
      canView: true,
      canEditSettings: false,
      canRotateStoreKey: false,
      canManageMembers: false,
      canDeleteStore: false,
      canCreateSession: false,
      canCancelSession: false,
      canManualConfirm: true,
      canManageSms: false,
      canConvertOrReassign: account.isSuperAdmin,
    };
  }

  if (memberRole === 'viewer') {
    return {
      role: 'viewer',
      roleLabelBn: 'দর্শক',
      canView: true,
      canEditSettings: false,
      canRotateStoreKey: false,
      canManageMembers: false,
      canDeleteStore: false,
      canCreateSession: false,
      canCancelSession: false,
      canManualConfirm: false,
      canManageSms: false,
      canConvertOrReassign: account.isSuperAdmin,
    };
  }

  if (account.isSuperAdmin) {
    return {
      role: 'super-admin',
      roleLabelBn: 'সুপার অ্যাডমিন',
      canView: true,
      canEditSettings: false,
      canRotateStoreKey: false,
      canManageMembers: true,
      canDeleteStore: true,
      canCreateSession: false,
      canCancelSession: false,
      canManualConfirm: false,
      canManageSms: false,
      canConvertOrReassign: true,
    };
  }

  return denyAll;
}

export interface DeviceFreshness {
  status: 'fresh' | 'stale';
  labelBn: string;
}

/**
 * Feature #2: Fresh within 30 minutes => green "সক্রিয়", older => amber/red "অনেকক্ষণ সাড়া নেই".
 */
export function evaluateDeviceFreshness(
  lastSeenAtMs: number | null,
  nowMs: number
): DeviceFreshness {
  if (lastSeenAtMs !== null && nowMs - lastSeenAtMs <= DEVICE_FRESH_WINDOW_MS) {
    return { status: 'fresh', labelBn: 'সক্রিয়' };
  }
  return { status: 'stale', labelBn: 'অনেকক্ষণ সাড়া নেই' };
}

export interface SetupChecklistStep {
  id: 'store_and_numbers' | 'download_app' | 'device' | 'test_payment' | 'live';
  labelBn: string;
  descriptionBn: string;
  actionLabelBn: string;
  done: boolean;
  targetTab: 'my_stores' | 'store_settings' | 'download_app' | 'device' | 'sessions' | 'api_docs';
}

export interface SetupChecklistState {
  steps: SetupChecklistStep[];
  completedCount: number;
  totalCount: number;
  allDone: boolean;
}

export interface SetupChecklistOptions {
  appDownloaded?: boolean;
}

function storeHasAnyEnabledNumber(store: PayStoreDoc | null): boolean {
  if (!store) return false;
  const methods = ['bkash', 'nagad', 'rocket', 'upay'] as const;
  return methods.some((m) => {
    if (!store.numberEnabled[m]) return false;
    const accList = store.paymentAccounts?.[m];
    if (Array.isArray(accList) && accList.length > 0) {
      return accList.some((entry) => entry.active && entry.number.trim().length === 11);
    }
    return store.numbers[m].trim().length === 11;
  });
}

/**
 * Prompt 33 Part B — Merchant's Own Setup Checklist (computed strictly from real Firestore state).
 * Works even when the merchant has 0 stores yet.
 * Disappears automatically once all steps are genuinely complete.
 */
export function computeSetupChecklist(
  store: PayStoreDoc | null,
  devices: PayDeviceDoc[],
  storeSessions: PaySessionDoc[],
  options: SetupChecklistOptions = {}
): SetupChecklistState {
  const hasPairedDevice = devices.some((d) => d.active);
  const hasStoreAndNumber = storeHasAnyEnabledNumber(store);
  const hasDownloadedApp = Boolean(options.appDownloaded) || hasPairedDevice;
  const hasConfirmedSession = storeSessions.some(
    (s) =>
      s.status === 'paid' ||
      s.testResult === 'verified' ||
      s.testResult === 'verified_simulated'
  );
  const hasLiveSession = Boolean(
    store?.liveConfirmedManually ||
      storeSessions.some((s) => !s.isTest && s.status === 'paid' && s.source === 'kenax')
  );

  const steps: SetupChecklistStep[] = [
    {
      id: 'store_and_numbers',
      labelBn: 'স্টোর তৈরি ও নিজের নম্বর সেভ',
      descriptionBn: 'স্টোর তৈরি করে নিজের bKash/Nagad/Rocket/Upay নম্বর সেভ ও চালু করুন',
      actionLabelBn: store ? 'নম্বর সেট করুন' : 'স্টোর তৈরি করুন',
      done: hasStoreAndNumber,
      targetTab: store ? 'store_settings' : 'my_stores',
    },
    {
      id: 'download_app',
      labelBn: 'Android অ্যাপ ডাউনলোড',
      descriptionBn: 'আপনার নিজের ফোনে PayVerify Android অ্যাপ ইনস্টল করুন',
      actionLabelBn: 'অ্যাপ ডাউনলোড করুন',
      done: hasDownloadedApp,
      targetTab: 'download_app',
    },
    {
      id: 'device',
      labelBn: 'নিজের ফোন পেয়ার করুন',
      descriptionBn: 'এককালীন QR দিয়ে আপনার অ্যাকাউন্টে নিজের ফোন সংযুক্ত করুন',
      actionLabelBn: 'ফোন পেয়ার করুন',
      done: hasPairedDevice,
      targetTab: 'device',
    },
    {
      id: 'test_payment',
      labelBn: 'টেস্ট পেমেন্ট',
      descriptionBn: 'আপনার স্টোরে একটি টেস্ট পেমেন্ট যাচাই করে নিশ্চিত হোন',
      actionLabelBn: 'টেস্ট যাচাই',
      done: hasConfirmedSession,
      targetTab: 'sessions',
    },
    {
      id: 'live',
      labelBn: 'লাইভ',
      descriptionBn: 'স্টোর লাইভ করুন ও আসল অর্ডার গ্রহণ শুরু করুন',
      actionLabelBn: 'ইন্টিগ্রেশন দেখুন',
      done: hasLiveSession,
      targetTab: 'api_docs',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  return {
    steps,
    completedCount,
    totalCount: steps.length,
    allDone: completedCount === steps.length,
  };
}

export interface SuperAdminNotification {
  id: string;
  accountId: string;
  accountEmail: string;
  kind: 'new_signup' | 'trial_ending' | 'paid_expired' | 'device_offline' | 'device_rejected';
  severity: 'info' | 'warning' | 'danger';
  messageBn: string;
  timestampMs: number;
}

/**
 * Feature #5 + A2 §2: Computed in-app Super Admin notifications from real Firestore data.
 */
export function computeSuperAdminNotifications(
  accounts: PayAccountDoc[],
  devices: PayDeviceDoc[],
  nowMs: number,
  activityLog: PayActivityDoc[] = []
): SuperAdminNotification[] {
  const notifications: SuperAdminNotification[] = [];
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

  const accountById = new Map<string, PayAccountDoc>();
  for (const a of accounts) accountById.set(a.id, a);

  for (const acc of accounts) {
    if (acc.isSuperAdmin) continue;

    // 1. New account signed up in the last 7 days
    if (nowMs - acc.createdAtMs <= sevenDaysMs) {
      notifications.push({
        id: `new_${acc.id}`,
        accountId: acc.id,
        accountEmail: acc.email,
        kind: 'new_signup',
        severity: 'info',
        messageBn: `নতুন অ্যাকাউন্ট যোগ হয়েছে: ${acc.email}`,
        timestampMs: acc.createdAtMs,
      });
    }

    // 2. Trial ends within 2 days (or already ended while status still 'trial')
    if (acc.planStatus === 'trial') {
      const remaining = acc.trialEndsAtMs - nowMs;
      if (remaining <= twoDaysMs) {
        notifications.push({
          id: `trial_${acc.id}`,
          accountId: acc.id,
          accountEmail: acc.email,
          kind: 'trial_ending',
          severity: remaining <= 0 ? 'danger' : 'warning',
          messageBn:
            remaining <= 0
              ? `${acc.email}-এর ট্রায়াল মেয়াদ শেষ হয়েছে`
              : `${acc.email}-এর ট্রায়াল ২ দিনের মধ্যে শেষ হবে`,
          timestampMs: acc.trialEndsAtMs,
        });
      }
    }

    // 3. paidUntil passed while still marked 'active' (grace or expired)
    if (acc.planStatus === 'active' && acc.paidUntilMs !== null && nowMs > acc.paidUntilMs) {
      const evalP = evaluateAccountPlan(acc, nowMs);
      notifications.push({
        id: `paid_exp_${acc.id}`,
        accountId: acc.id,
        accountEmail: acc.email,
        kind: 'paid_expired',
        severity: evalP.inGrace ? 'warning' : 'danger',
        messageBn: evalP.inGrace
          ? `${acc.email}-এর পেইড মেয়াদ শেষ (${evalP.labelBn})`
          : `${acc.email}-এর পেইড মেয়াদ শেষ হয়ে গেছে (স্ট্যাটাস এখনো সক্রিয়)`,
        timestampMs: acc.paidUntilMs,
      });
    }

    // 4. Active account whose paired device has had no contact for > 6 hours
    const plan = evaluateAccountPlan(acc, nowMs);
    if (plan.isActive) {
      const accDevices = devices.filter((d) => d.accountId === acc.id && d.active);
      if (accDevices.length > 0) {
        const latestContact = accDevices.reduce<number | null>((latest, d) => {
          const ts = d.lastSeenAtMs ?? d.createdAtMs;
          if (latest === null || ts > latest) return ts;
          return latest;
        }, null);
        if (latestContact !== null && nowMs - latestContact > ADMIN_DEVICE_ALERT_MS) {
          notifications.push({
            id: `offline_${acc.id}`,
            accountId: acc.id,
            accountEmail: acc.email,
            kind: 'device_offline',
            severity: 'warning',
            messageBn: `${acc.email}-এর যুক্ত ফোন ৬ ঘণ্টার বেশি সময় ধরে সাড়া দিচ্ছে না`,
            timestampMs: latestContact,
          });
        }
      }
    }
  }

  // 5. Server-reported rejected device attempts (payActivity type === 'device_rejected')
  for (const act of activityLog) {
    if (act.type !== 'device_rejected') continue;
    const accId = act.accountId || act.targetId;
    const acc = accountById.get(accId);
    notifications.push({
      id: `dev_rej_${act.id}`,
      accountId: accId,
      accountEmail: acc?.email || act.actorEmail || accId,
      kind: 'device_rejected',
      severity: 'danger',
      messageBn: `অস্বীকৃত ডিভাইস প্রচেষ্টা (${acc?.email || accId}): ${act.detail || act.note}`,
      timestampMs: act.createdAtMs,
    });
  }

  return notifications.sort((a, b) => b.timestampMs - a.timestampMs);
}

export function isSmsUnmatchedForInbox(sms: PaySmsDoc): boolean {
  if (sms.dismissed || sms.simulated) return false;
  return !sms.matched || sms.matchResult === 'unmatched';
}

export function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color.trim());
}

/**
 * Validates redirect URLs (successUrl / failUrl) strictly to prevent open-redirect javascript:/data: XSS.
 */
export function sanitizeRedirectUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function escapeCsvCell(value: string): string {
  // Prevent CSV formula injection (=, +, -, @, tab, CR)
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

/**
 * Generates a UTF-8 CSV export of paid sessions within [fromDate, toDate] (YYYY-MM-DD local dates).
 */
export function generatePaidSessionsCsv(
  sessions: PaySessionDoc[],
  fromDate: string,
  toDate: string
): { csv: string; rowCount: number } {
  const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
  const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.MAX_SAFE_INTEGER;

  const matching = sessions.filter((s) => {
    if (s.isTest || s.status !== 'paid') return false;
    const paidMs = s.paidAtMs ?? s.createdAtMs;
    return paidMs >= fromMs && paidMs <= toMs;
  });

  const headers = [
    'Session ID',
    'Order ID',
    'Wallet',
    'Receiving Number',
    'Amount (BDT)',
    'Payable (BDT)',
    'TrxID',
    'Sender',
    'Source',
    'Paid At (ISO)',
  ];

  const rows = matching.map((s) => [
    s.id,
    s.orderId,
    s.method,
    s.number,
    formatCopyAmount(s.amountPaisa),
    formatCopyAmount(s.payablePaisa),
    s.trxId || '',
    s.sender || '',
    s.source,
    new Date(s.paidAtMs ?? s.createdAtMs).toISOString(),
  ]);

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map((cell) => escapeCsvCell(String(cell))).join(',')),
  ];

  return {
    csv: `\uFEFF${lines.join('\r\n')}`,
    rowCount: matching.length,
  };
}

export function countSessionsToday(sessions: PaySessionDoc[], nowMs: number): number {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;
  let count = 0;
  for (const s of sessions) {
    if (s.isTest) continue;
    if (s.createdAtMs >= startMs && s.createdAtMs < endMs) {
      count += 1;
    }
  }
  return count;
}

export function computeTodayStoreStats(
  sessions: PaySessionDoc[],
  nowMs: number
): { sessionsToday: number; paidTodayPaisa: number; paidTodayCount: number } {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;
  let sessionsToday = 0;
  let paidTodayPaisa = 0;
  let paidTodayCount = 0;

  for (const s of sessions) {
    if (s.isTest) continue;
    if (s.createdAtMs >= startMs && s.createdAtMs < endMs) {
      sessionsToday += 1;
    }
    if (s.status === 'paid') {
      const paidMs = s.paidAtMs ?? s.createdAtMs;
      if (paidMs >= startMs && paidMs < endMs) {
        paidTodayPaisa += s.payablePaisa;
        paidTodayCount += 1;
      }
    }
  }
  return { sessionsToday, paidTodayPaisa, paidTodayCount };
}
