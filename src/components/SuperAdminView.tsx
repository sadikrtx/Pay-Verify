import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  Bell,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Filter,
  Globe,
  KeyRound,
  Layers,
  LogOut,
  Megaphone,
  MessageSquarePlus,
  Receipt,
  Save,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import {
  computeLast7DaysPaid,
  formatBanglaDateTime,
  formatBdt,
} from '../lib/money';
import {
  computeSuperAdminNotifications,
  computeTodayStoreStats,
  countSessionsToday,
  evaluateAccountPlan,
} from '../lib/platformLogic';
import { formatLimitBn, resolveEffectiveAccountPlan } from '../lib/planEngine';
import type {
  MerchantSupportNoteDoc,
  PayAccountDoc,
  PaySessionDoc,
  PayStoreDoc,
  PlanStatus,
  StoreType,
} from '../types/payment';
import { SuperAdminPlansTab } from './SuperAdminPlansTab';
import { SuperAdminChangelogTab } from './SuperAdminChangelogTab';
import { SuperAdminLandingTab } from './SuperAdminLandingTab';
import { SuperAdminAppUpdatesTab } from './SuperAdminAppUpdatesTab';
import { SuperAdminStaffTab } from './SuperAdminStaffTab';
import {
  CHECKOUT_METHOD_BRANDS,
  CHECKOUT_METHODS,
  formatAccountTypeLabel,
  normalizePaymentAccounts,
  normalizePaymentActionType,
  PAYMENT_ACTION_LABELS_BN,
  resolveStoreCheckoutOptions,
} from '../lib/checkoutFlow';
import { HostedPaymentPage } from './HostedPaymentPage';
import { StoreBrandAvatar } from './PaymentMethodMarks';
import { PaymentLogo } from './PaymentLogo';

export type AdminTab =
  | 'summary'
  | 'accounts'
  | 'plans'
  | 'payments'
  | 'app_updates'
  | 'merchant_notes'
  | 'staff'
  | 'landing'
  | 'notifications'
  | 'stores'
  | 'changelog';

const ALL_ADMIN_TABS: ReadonlySet<string> = new Set([
  'summary',
  'accounts',
  'plans',
  'payments',
  'app_updates',
  'merchant_notes',
  'staff',
  'landing',
  'notifications',
  'stores',
  'changelog',
]);

function readInitialUrlArea(): AdminTab | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('area');
  if (!raw) return null;
  if (raw === 'reports') return 'summary';
  if (raw === 'merchants') return 'accounts';
  if (raw === 'purchases') return 'payments';
  if (ALL_ADMIN_TABS.has(raw)) return raw as AdminTab;
  return null;
}

export const SuperAdminView: React.FC = () => {
  const {
    account,
    currentStaff,
    isAdminPortalUser,
    canAdmin,
    staffRoles,
    staffMembers,
    merchantSupportNotes,
    platformConfig,
    plans,
    changelog,
    appReleases,
    allAccounts,
    allStores,
    allSessions,
    allDevices,
    activityLog,
    subscriptionPurchases,
    signOutUser,
    completeStaffFirstLoginPasswordChange,
    adminSaveWorkerBaseUrl,
    adminUpdateAccount,
    adminDeleteMerchantAccount,
    adminConvertStoreType,
    adminReassignStore,
    adminVerifyOrNotePaymentSession,
    adminDeletePaymentSession,
    saveMerchantSupportNote,
    deleteMerchantSupportNote,
    logAdminReportExport,
  } = usePayVerify();

  const isSuperAdmin = Boolean(account?.isSuperAdmin);

  // Determine which tabs this actor (Super Admin or Staff Member) is permitted to view
  const isTabPermitted = useMemo(() => {
    return (t: AdminTab): boolean => {
      if (isSuperAdmin) return true;
      switch (t) {
        case 'summary':
          return canAdmin('reports', 'view');
        case 'accounts':
          return canAdmin('merchants', 'view');
        case 'plans':
          return canAdmin('plans', 'view');
        case 'payments':
          return canAdmin('payments', 'view');
        case 'app_updates':
          return canAdmin('app_updates', 'view');
        case 'merchant_notes':
          return canAdmin('merchant_notes', 'view');
        case 'staff':
        case 'landing':
        case 'notifications':
        case 'stores':
        case 'changelog':
          return false;
        default:
          return false;
      }
    };
  }, [isSuperAdmin, canAdmin]);

  const nowMs = Date.now();

  const notifications = useMemo(
    () => computeSuperAdminNotifications(allAccounts, allDevices, nowMs, activityLog),
    [allAccounts, allDevices, nowMs, activityLog]
  );

  const visibleTabs = useMemo(() => {
    const all: Array<{
      id: AdminTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badge?: number;
    }> = [
      { id: 'summary', label: 'রিপোর্ট ও সারসংক্ষেপ', icon: Activity },
      { id: 'accounts', label: 'মার্চেন্ট', icon: Users, badge: allAccounts.length },
      { id: 'plans', label: 'প্ল্যান', icon: Layers, badge: plans.length },
      {
        id: 'payments',
        label: 'পেমেন্ট ও লেনদেন',
        icon: Receipt,
        badge: allSessions.length + subscriptionPurchases.length,
      },
      {
        id: 'app_updates',
        label: 'Android App আপডেট',
        icon: Smartphone,
        badge: appReleases.length,
      },
      {
        id: 'merchant_notes',
        label: 'মার্চেন্ট নোট / সাপোর্ট মন্তব্য',
        icon: MessageSquarePlus,
        badge: merchantSupportNotes.length,
      },
    ];

    if (isSuperAdmin) {
      all.push(
        { id: 'staff', label: 'স্টাফ', icon: UserCog, badge: staffMembers.length },
        { id: 'landing', label: 'ল্যান্ডিং পেজ / বিজ্ঞাপন', icon: Megaphone },
        { id: 'notifications', label: 'বিজ্ঞপ্তি', icon: Bell, badge: notifications.length },
        { id: 'stores', label: 'সব স্টোর', icon: Store, badge: allStores.length },
        { id: 'changelog', label: 'নতুন কি এসেছে', icon: Sparkles, badge: changelog.length }
      );
    }

    return all.filter((item) => isTabPermitted(item.id));
  }, [
    isSuperAdmin,
    isTabPermitted,
    allAccounts.length,
    plans.length,
    allSessions.length,
    subscriptionPurchases.length,
    appReleases.length,
    merchantSupportNotes.length,
    staffMembers.length,
    notifications.length,
    allStores.length,
    changelog.length,
  ]);

  const [tab, setTab] = useState<AdminTab>(() => {
    const fromUrl = readInitialUrlArea();
    if (fromUrl) return fromUrl;
    return 'summary';
  });

  // Auto-select first permitted tab if no URL ?area= was explicitly requested and current tab is forbidden
  useEffect(() => {
    const fromUrl = readInitialUrlArea();
    if (!fromUrl && !isTabPermitted(tab) && visibleTabs.length > 0) {
      setTab(visibleTabs[0].id);
    }
  }, [isTabPermitted, tab, visibleTabs]);

  const selectAdminTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('area', nextTab);
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  };

  const [highlightedAccountId, setHighlightedAccountId] = useState<string | null>(null);

  // Forced First-Login Password Change State (Part D.4)
  const [firstLoginCurrentPass, setFirstLoginCurrentPass] = useState('');
  const [firstLoginNewPass, setFirstLoginNewPass] = useState('');
  const [firstLoginConfirmPass, setFirstLoginConfirmPass] = useState('');
  const [firstLoginBusy, setFirstLoginBusy] = useState(false);
  const [firstLoginError, setFirstLoginError] = useState<string | null>(null);

  // Platform Worker URL editor (Super Admin ONLY — Hard Rule)
  const [workerUrl, setWorkerUrl] = useState(platformConfig.workerBaseUrl);
  const [workerSaving, setWorkerSaving] = useState(false);
  const [workerNotice, setWorkerNotice] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Activity Log Filters (Part H: Super Admin can filter by staff member and by role)
  const [activityStaffFilter, setActivityStaffFilter] = useState<string>('all');
  const [activityRoleFilter, setActivityRoleFilter] = useState<string>('all');

  // Account action modal (live planId + optional overrides)
  const [editAccountTarget, setEditAccountTarget] = useState<PayAccountDoc | null>(null);
  const [editPlanStatus, setEditPlanStatus] = useState<PlanStatus>('active');
  const [editPlanId, setEditPlanId] = useState<string>('');
  const [editPaidUntil, setEditPaidUntil] = useState('');
  const [editStoreOverride, setEditStoreOverride] = useState('');
  const [editDailyCapOverride, setEditDailyCapOverride] = useState('');
  const [editAccountNote, setEditAccountNote] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);

  // Delete merchant modal
  const [deleteMerchantTarget, setDeleteMerchantTarget] = useState<PayAccountDoc | null>(null);
  const [deleteMerchantNote, setDeleteMerchantNote] = useState('');
  const [deleteMerchantBusy, setDeleteMerchantBusy] = useState(false);

  // Store convert modal
  const [convertTarget, setConvertTarget] = useState<PayStoreDoc | null>(null);
  const [convertNote, setConvertNote] = useState('');
  const [storeBusy, setStoreBusy] = useState(false);

  // Store reassign modal
  const [reassignTarget, setReassignTarget] = useState<PayStoreDoc | null>(null);
  const [reassignOwnerId, setReassignOwnerId] = useState('');
  const [reassignNote, setReassignNote] = useState('');

  // Read-only merchant branding viewer
  const [inspectBrandingTarget, setInspectBrandingTarget] = useState<PayStoreDoc | null>(null);
  const [adminPreviewStore, setAdminPreviewStore] = useState<PayStoreDoc | null>(null);

  // Payments & Transactions state (Part C.3)
  const [paymentsSubView, setPaymentsSubView] = useState<'sessions' | 'subscriptions'>('sessions');
  const [verifySessionTarget, setVerifySessionTarget] = useState<PaySessionDoc | null>(null);
  const [verifySessionStatus, setVerifySessionStatus] = useState<
    'paid' | 'waiting' | 'cancelled' | 'failed'
  >('paid');
  const [verifySessionTrxId, setVerifySessionTrxId] = useState('');
  const [verifySessionNote, setVerifySessionNote] = useState('');
  const [verifySessionBusy, setVerifySessionBusy] = useState(false);

  // Merchant Support Notes state (Part C.6)
  const [noteMerchantFilter, setNoteMerchantFilter] = useState<string>('all');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteAccountId, setNoteAccountId] = useState<string>('');
  const [noteContent, setNoteContent] = useState<string>('');
  const [noteSaving, setNoteSaving] = useState(false);

  const platformToday = useMemo(() => {
    const start = new Date(nowMs);
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const endMs = startMs + 24 * 60 * 60 * 1000;
    const stats = computeTodayStoreStats(allSessions, nowMs);
    const newAccountsToday = allAccounts.filter(
      (a) => a.createdAtMs >= startMs && a.createdAtMs < endMs
    ).length;
    return {
      ...stats,
      newAccountsToday,
    };
  }, [allSessions, allAccounts, nowMs]);

  const platform7Days = useMemo(
    () => computeLast7DaysPaid(allSessions, nowMs),
    [allSessions, nowMs]
  );

  const maxDailyPaisa = useMemo(
    () => platform7Days.reduce((m, b) => (b.totalPaisa > m ? b.totalPaisa : m), 0),
    [platform7Days]
  );

  const total7DayPaisa = useMemo(
    () => platform7Days.reduce((s, b) => s + b.totalPaisa, 0),
    [platform7Days]
  );

  const accountById = useMemo(() => {
    const map = new Map<string, PayAccountDoc>();
    for (const a of allAccounts) map.set(a.id, a);
    return map;
  }, [allAccounts]);

  const storeById = useMemo(() => {
    const map = new Map<string, PayStoreDoc>();
    for (const s of allStores) map.set(s.id, s);
    return map;
  }, [allStores]);

  const filteredActivityLog = useMemo(() => {
    return activityLog.filter((entry) => {
      if (activityStaffFilter !== 'all' && entry.actorAccountId !== activityStaffFilter) {
        return false;
      }
      if (activityRoleFilter !== 'all') {
        if (
          entry.actorRoleId !== activityRoleFilter &&
          entry.actorRoleName !== activityRoleFilter
        ) {
          return false;
        }
      }
      return true;
    });
  }, [activityLog, activityStaffFilter, activityRoleFilter]);

  const filteredMerchantNotes = useMemo(() => {
    if (noteMerchantFilter === 'all') return merchantSupportNotes;
    return merchantSupportNotes.filter((n) => n.merchantAccountId === noteMerchantFilter);
  }, [merchantSupportNotes, noteMerchantFilter]);

  if (!isAdminPortalUser) {
    return null;
  }

  // ─── PART D.4: FORCED FIRST-LOGIN PASSWORD CHANGE FOR STAFF ───
  if (!isSuperAdmin && currentStaff?.mustChangePassword) {
    const handleFirstLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setFirstLoginError(null);
      if (firstLoginNewPass.trim().length < 6) {
        setFirstLoginError('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
        return;
      }
      if (firstLoginNewPass !== firstLoginConfirmPass) {
        setFirstLoginError('নতুন পাসওয়ার্ড ও নিশ্চিতকরণ পাসওয়ার্ড মেলেনি।');
        return;
      }
      setFirstLoginBusy(true);
      try {
        await completeStaffFirstLoginPasswordChange(firstLoginNewPass, firstLoginCurrentPass);
      } catch (err) {
        setFirstLoginError(
          err instanceof Error ? err.message : 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে।'
        );
      } finally {
        setFirstLoginBusy(false);
      }
    };

    return (
      <div
        className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5 my-8"
        data-testid="staff-forced-password-change-card"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">নতুন পাসওয়ার্ড সেট করুন</h1>
            <p className="text-xs text-slate-500">
              প্রথমবার লগইনের পর নিরাপত্তার জন্য আপনার নিজস্ব পাসওয়ার্ড সেট করা বাধ্যতামূলক।
            </p>
          </div>
        </div>

        {firstLoginError && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{firstLoginError}</span>
          </div>
        )}

        <form onSubmit={handleFirstLoginSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              বর্তমান (অস্থায়ী) পাসওয়ার্ড
            </label>
            <input
              type="password"
              required
              data-testid="first-login-current-password"
              value={firstLoginCurrentPass}
              onChange={(e) => setFirstLoginCurrentPass(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)
            </label>
            <input
              type="password"
              required
              minLength={6}
              data-testid="first-login-new-password"
              value={firstLoginNewPass}
              onChange={(e) => setFirstLoginNewPass(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              নতুন পাসওয়ার্ড নিশ্চিত করুন
            </label>
            <input
              type="password"
              required
              minLength={6}
              data-testid="first-login-confirm-password"
              value={firstLoginConfirmPass}
              onChange={(e) => setFirstLoginConfirmPass(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              লগআউট
            </button>
            <button
              type="submit"
              data-testid="first-login-submit-btn"
              disabled={firstLoginBusy}
              className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50"
            >
              {firstLoginBusy ? 'সংরক্ষণ হচ্ছে...' : 'পাসওয়ার্ড সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const openAccountModal = (acc: PayAccountDoc) => {
    const eff = resolveEffectiveAccountPlan(acc, plans, platformConfig, nowMs);
    setEditAccountTarget(acc);
    setEditPlanStatus(acc.planStatus);
    setEditPlanId(acc.planId || eff.plan.id);
    setEditPaidUntil(
      acc.paidUntilMs ? new Date(acc.paidUntilMs).toISOString().slice(0, 10) : ''
    );
    setEditStoreOverride(
      acc.storeLimitOverride !== null && acc.storeLimitOverride !== undefined
        ? String(acc.storeLimitOverride)
        : ''
    );
    setEditDailyCapOverride(
      acc.dailySessionCapOverride !== null && acc.dailySessionCapOverride !== undefined
        ? String(acc.dailySessionCapOverride)
        : ''
    );
    setEditAccountNote('');
    setGlobalError(null);
  };

  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setWorkerNotice(null);
    setWorkerSaving(true);
    try {
      await adminSaveWorkerBaseUrl(workerUrl, 'প্ল্যাটফর্ম Worker Base URL আপডেট');
      setWorkerNotice('প্ল্যাটফর্ম Worker Base URL সংরক্ষিত হয়েছে।');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setWorkerSaving(false);
    }
  };

  const handleExportReportsCsv = async () => {
    setGlobalError(null);
    setGlobalSuccess(null);
    try {
      const headers = ['তারিখ', 'মোট পরিশোধিত (টাকা)'];
      const rows = platform7Days.map((b) => [
        b.dateKey,
        (b.totalPaisa / 100).toFixed(2),
      ]);
      const csvContent =
        '\uFEFF' +
        [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payverify-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      await logAdminReportExport('৭ দিনের প্ল্যাটফর্ম পেমেন্ট রিপোর্ট সিএসভি এক্সপোর্ট');
      setGlobalSuccess('রিপোর্ট সিএসভি এক্সপোর্ট সম্পন্ন হয়েছে।');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'এক্সপোর্ট ব্যর্থ হয়েছে।');
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAccountTarget) return;
    setGlobalError(null);
    setAccountBusy(true);
    try {
      const paidUntilMs = editPaidUntil
        ? new Date(`${editPaidUntil}T23:59:59`).getTime()
        : null;
      const storeLimitOverride =
        editStoreOverride.trim() === '' ? null : Math.max(0, Number(editStoreOverride) || 0);
      const dailySessionCapOverride =
        editDailyCapOverride.trim() === ''
          ? null
          : Math.max(0, Number(editDailyCapOverride) || 0);
      const chosenPlanName = plans.find((p) => p.id === editPlanId)?.name || editPlanId;
      const detail = `${editAccountTarget.email}: স্ট্যাটাস ${editAccountTarget.planStatus}→${editPlanStatus}, প্ল্যান ${chosenPlanName}`;
      await adminUpdateAccount(
        editAccountTarget.id,
        {
          planStatus: editPlanStatus,
          planId: editPlanId || null,
          paidUntilMs,
          storeLimitOverride,
          dailySessionCapOverride,
        },
        detail,
        editAccountNote
      );
      setEditAccountTarget(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'অ্যাকাউন্ট আপডেট ব্যর্থ হয়েছে।');
    } finally {
      setAccountBusy(false);
    }
  };

  const handleConfirmDeleteMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteMerchantTarget) return;
    setGlobalError(null);
    setDeleteMerchantBusy(true);
    try {
      await adminDeleteMerchantAccount(deleteMerchantTarget.id, deleteMerchantNote);
      setDeleteMerchantTarget(null);
      setDeleteMerchantNote('');
      setGlobalSuccess('মার্চেন্ট অ্যাকাউন্ট মুছে ফেলা হয়েছে।');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'মার্চেন্ট মুছে ফেলা যায়নি।');
    } finally {
      setDeleteMerchantBusy(false);
    }
  };

  const handleConfirmConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertTarget) return;
    setGlobalError(null);
    setStoreBusy(true);
    try {
      const nextType: StoreType = convertTarget.type === 'own' ? 'customer' : 'own';
      await adminConvertStoreType(convertTarget.id, nextType, convertNote);
      setConvertTarget(null);
      setConvertNote('');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'স্টোর টাইপ পরিবর্তন ব্যর্থ হয়েছে।');
    } finally {
      setStoreBusy(false);
    }
  };

  const handleConfirmReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignTarget || !reassignOwnerId) return;
    setGlobalError(null);
    setStoreBusy(true);
    try {
      const newOwner = accountById.get(reassignOwnerId);
      await adminReassignStore(
        reassignTarget.id,
        reassignOwnerId,
        newOwner?.email || reassignOwnerId,
        reassignNote
      );
      setReassignTarget(null);
      setReassignOwnerId('');
      setReassignNote('');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'মালিক পরিবর্তন ব্যর্থ হয়েছে।');
    } finally {
      setStoreBusy(false);
    }
  };

  const handleVerifySessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifySessionTarget) return;
    setGlobalError(null);
    setVerifySessionBusy(true);
    try {
      await adminVerifyOrNotePaymentSession(verifySessionTarget.id, {
        status: verifySessionStatus,
        trxId: verifySessionTrxId.trim() || null,
        manualNote: verifySessionNote,
      });
      setVerifySessionTarget(null);
      setGlobalSuccess('পেমেন্ট সেশন আপডেট করা হয়েছে।');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'পেমেন্ট সেশন আপডেট ব্যর্থ হয়েছে।');
    } finally {
      setVerifySessionBusy(false);
    }
  };

  const handleDeletePaymentSessionClick = async (session: PaySessionDoc) => {
    setGlobalError(null);
    try {
      await adminDeletePaymentSession(session.id, `অর্ডার ${session.orderId} মুছে ফেলা হয়েছে`);
      setGlobalSuccess(`পেমেন্ট সেশন (${session.orderId}) মুছে ফেলা হয়েছে।`);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'পেমেন্ট সেশন মুছে ফেলা যায়নি।');
    }
  };

  const handleSaveSupportNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setNoteSaving(true);
    try {
      const targetAcc = accountById.get(noteAccountId);
      await saveMerchantSupportNote(
        {
          merchantAccountId: noteAccountId,
          merchantEmail: targetAcc?.email || noteAccountId,
          body: noteContent.trim(),
        },
        editingNoteId || undefined
      );
      setEditingNoteId(null);
      setNoteContent('');
      setGlobalSuccess(editingNoteId ? 'মার্চেন্ট নোট আপডেট হয়েছে।' : 'নতুন মার্চেন্ট নোট সংরক্ষিত হয়েছে।');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'নোট সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setNoteSaving(false);
    }
  };

  const startEditSupportNote = (n: MerchantSupportNoteDoc) => {
    setEditingNoteId(n.id);
    setNoteAccountId(n.merchantAccountId);
    setNoteContent(n.body);
  };

  const handleDeleteSupportNoteClick = async (noteId: string) => {
    setGlobalError(null);
    try {
      await deleteMerchantSupportNote(noteId);
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
        setNoteContent('');
      }
      setGlobalSuccess('মার্চেন্ট নোট মুছে ফেলা হয়েছে।');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'নোট মুছে ফেলা যায়নি।');
    }
  };

  const jumpToAccount = (accountId: string) => {
    setHighlightedAccountId(accountId);
    selectAdminTab('accounts');
  };

  const currentTabPermitted = isTabPermitted(tab);

  return (
    <div className="space-y-6">
      {/* Top Admin Header — Shows Staff Member's Own Name & Role (Part F.4) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {isSuperAdmin ? 'সুপার অ্যাডমিন' : 'অ্যাডমিন প্যানেল'}
            </h1>
            {currentStaff && !isSuperAdmin && (
              <div
                className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 mt-0.5"
                data-testid="staff-header-identity"
              >
                <span className="font-bold text-slate-900">{currentStaff.name}</span>
                <span>·</span>
                <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-bold">
                  {currentStaff.roleName}
                </span>
                {currentStaff.hasCustomOverride && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold">
                    কাস্টম নিয়ম
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {!isSuperAdmin && currentStaff && (
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            লগআউট
          </button>
        )}
      </div>

      {/* Sub-navigation Tabs — Only shows areas the user has at least View on (Part F.1) */}
      <div className="flex items-center gap-2 flex-wrap">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`super-admin-tab-${t.id}`}
              onClick={() => selectAdminTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {typeof t.badge === 'number' && t.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {t.badge.toLocaleString('bn-BD')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isSuperAdmin && !platformConfig.subscriptionStoreId && (
        <div
          className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs"
          data-testid="sub-store-missing-banner"
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div>
              <div className="text-sm font-bold text-amber-900">
                সাবস্ক্রিপশন পেমেন্ট স্টোর নির্ধারণ করা হয়নি — plan বিক্রি বন্ধ আছে
              </div>
              <div className="text-xs text-amber-700">
                গ্রাহকরা এখন প্ল্যান কিনতে পারছেন না। অনুগ্রহ করে অবিলম্বে একটি পেমেন্ট স্টোর সিলেক্ট করুন।
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => selectAdminTab('plans')}
            className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 shrink-0"
          >
            স্টোর নির্ধারণ করুন
          </button>
        </div>
      )}

      {globalError && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      {globalSuccess && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{globalSuccess}</span>
        </div>
      )}

      {/* ─── PART F.3: FORBIDDEN AREA PAGE ("অনুমতি নেই") WHEN ACCESSED BY DIRECT URL ─── */}
      {!currentTabPermitted && (
        <div
          className="bg-white rounded-2xl border border-rose-200 p-8 text-center space-y-4 shadow-xs"
          data-testid="staff-forbidden-area-view"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">অনুমতি নেই</h2>
            <p className="text-xs text-slate-600">
              আপনার রোলে এই সেকশনটি দেখার বা পরিচালনা করার অনুমতি দেওয়া হয়নি।
            </p>
          </div>
          {visibleTabs.length > 0 && (
            <button
              type="button"
              onClick={() => selectAdminTab(visibleTabs[0].id)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700"
            >
              অনুমোদিত সেকশনে ফিরুন ({visibleTabs[0].label})
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: রিপোর্ট ও সারসংক্ষেপ (reports)
         ═══════════════════════════════════════════════════════════════════ */}
      {currentTabPermitted && tab === 'summary' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">রিপোর্ট ও সারসংক্ষেপ</h2>
            {canAdmin('reports', 'export') && (
              <button
                type="button"
                data-testid="admin-reports-export-btn"
                onClick={() => void handleExportReportsCsv()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                সিএসভি এক্সপোর্ট
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="text-xs font-medium text-slate-500">আজকের মোট সেশন</div>
              <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
                {platformToday.sessionsToday.toLocaleString('bn-BD')}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="text-xs font-medium text-slate-500">আজকের মোট পরিশোধিত</div>
              <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
                {formatBdt(platformToday.paidTodayPaisa)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="text-xs font-medium text-slate-500">আজ নতুন অ্যাকাউন্ট</div>
              <div className="mt-2 text-2xl font-bold text-indigo-700 tabular-nums">
                {platformToday.newAccountsToday.toLocaleString('bn-BD')}
              </div>
            </div>
          </div>

          {/* 7-Day Platform Bar Chart */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-5">
              <h2 className="text-base font-bold text-slate-900">প্ল্যাটফর্মের গত ৭ দিনের পেমেন্ট</h2>
              <span className="text-sm font-semibold text-teal-700 tabular-nums">
                মোট: {formatBdt(total7DayPaisa)}
              </span>
            </div>

            {total7DayPaisa === 0 ? (
              <div className="h-40 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
                গত ৭ দিনে কোনো প্ল্যাটফর্ম পেমেন্ট রেকর্ড হয়নি
              </div>
            ) : (
              <div className="h-48 flex items-end justify-between gap-2 sm:gap-4 pt-6">
                {platform7Days.map((b) => {
                  const ratio = maxDailyPaisa > 0 ? b.totalPaisa / maxDailyPaisa : 0;
                  const hPct = b.totalPaisa > 0 ? Math.max(10, Math.round(ratio * 100)) : 3;
                  return (
                    <div
                      key={b.dateKey}
                      className="flex-1 flex flex-col items-center gap-2 min-w-0 h-full justify-end"
                    >
                      <div className="text-[11px] font-semibold text-slate-600 tabular-nums truncate max-w-full">
                        {b.totalPaisa > 0 ? formatBdt(b.totalPaisa) : '৳0'}
                      </div>
                      <div className="w-full max-w-[44px] h-28 bg-slate-100 rounded-lg flex items-end overflow-hidden">
                        <div
                          className={`w-full rounded-t-lg ${
                            b.totalPaisa > 0 ? 'bg-indigo-500' : 'bg-slate-200'
                          }`}
                          style={{ height: `${hPct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-full">
                        {b.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Platform Worker Base URL Config — HARD RULE: SUPER ADMIN ONLY */}
          {isSuperAdmin && (
            <form
              onSubmit={handleSaveWorker}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">প্ল্যাটফর্ম Worker Base URL</h2>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="url"
                  value={workerUrl}
                  onChange={(e) => setWorkerUrl(e.target.value)}
                  placeholder="https://payverify-worker.your-subdomain.workers.dev"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="submit"
                  disabled={workerSaving}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {workerSaving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                </button>
              </div>
              {workerNotice && (
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  {workerNotice}
                </div>
              )}
            </form>
          )}

          {/* PART H — Activity Log with Staff Member & Role Filtering */}
          <div
            className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
            data-testid="admin-activity-log-card"
          >
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">অ্যাক্টিভিটি লগ</h2>

              {isSuperAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Filter className="w-3.5 h-3.5" />
                    <span>ফিল্টার:</span>
                  </div>
                  <select
                    aria-label="স্টাফ অনুযায়ী ফিল্টার"
                    data-testid="activity-filter-staff"
                    value={activityStaffFilter}
                    onChange={(e) => setActivityStaffFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700"
                  >
                    <option value="all">সব স্টাফ / অ্যাডমিন</option>
                    {staffMembers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.email})
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="রোল অনুযায়ী ফিল্টার"
                    data-testid="activity-filter-role"
                    value={activityRoleFilter}
                    onChange={(e) => setActivityRoleFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700"
                  >
                    <option value="all">সব রোল</option>
                    <option value="super_admin">সুপার অ্যাডমিন</option>
                    {staffRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {filteredActivityLog.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                কোনো অ্যাক্টিভিটি লগ পাওয়া যায়নি
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredActivityLog.slice(0, 40).map((entry) => (
                  <div
                    key={entry.id}
                    className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900">{entry.detail}</div>
                      <div className="text-slate-600">নোট: {entry.note}</div>
                    </div>
                    <div className="text-slate-500 whitespace-nowrap sm:text-right space-y-0.5">
                      <div className="flex items-center sm:justify-end gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800">
                          {entry.actorName || entry.actorEmail || entry.actorAccountId}
                        </span>
                        {entry.actorRoleName && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700">
                            {entry.actorRoleName}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {formatBanglaDateTime(entry.createdAtMs)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: স্টাফ (PART A — SUPER ADMIN ONLY)
         ═══════════════════════════════════════════════════════════════════ */}
      {isSuperAdmin && tab === 'staff' && <SuperAdminStaffTab />}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: বিজ্ঞপ্তি (Super Admin only)
         ═══════════════════════════════════════════════════════════════════ */}
      {isSuperAdmin && tab === 'notifications' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {notifications.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-2">
              <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">বর্তমানে কোনো নতুন বিজ্ঞপ্তি নেই</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => jumpToAccount(n.accountId)}
                  className="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        n.severity === 'danger'
                          ? 'bg-rose-500'
                          : n.severity === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-teal-500'
                      }`}
                    />
                    <span className="text-sm font-medium text-slate-900">{n.messageBn}</span>
                  </div>
                  <span className="text-xs font-semibold text-teal-700">অ্যাকাউন্ট দেখুন →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: ল্যান্ডিং পেজ / বিজ্ঞাপন (Super Admin only) */}
      {isSuperAdmin && tab === 'landing' && <SuperAdminLandingTab />}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: পেমেন্ট ও লেনদেন (payments — Part C.3)
         ═══════════════════════════════════════════════════════════════════ */}
      {currentTabPermitted && tab === 'payments' && (
        <div className="space-y-4" data-testid="super-admin-payments-tab">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaymentsSubView('sessions')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  paymentsSubView === 'sessions'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                পেমেন্ট সেশন ({allSessions.length.toLocaleString('bn-BD')})
              </button>
              <button
                type="button"
                onClick={() => setPaymentsSubView('subscriptions')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  paymentsSubView === 'subscriptions'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                সাবস্ক্রিপশন ক্রয় ({subscriptionPurchases.length.toLocaleString('bn-BD')})
              </button>
            </div>
          </div>

          {paymentsSubView === 'sessions' ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              {allSessions.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  এখনো কোনো পেমেন্ট সেশন নেই
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold text-slate-600">
                          <th className="py-3 px-4">অর্ডার ও স্টোর</th>
                          <th className="py-3 px-4">পরিমাণ</th>
                          <th className="py-3 px-4">মাধ্যম ও TrxID</th>
                          <th className="py-3 px-4">অবস্থা</th>
                          <th className="py-3 px-4">সময়</th>
                          <th className="py-3 px-4 text-right">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {allSessions.slice(0, 60).map((s) => {
                          const canEditPay = canAdmin('payments', 'edit');
                          const canDelPay = canAdmin('payments', 'delete');
                          const storeName = storeById.get(s.storeId)?.name || s.storeId;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/60">
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900">{s.orderId}</div>
                                <div className="text-slate-500">{storeName}</div>
                              </td>
                              <td className="py-3.5 px-4 font-bold text-teal-800 tabular-nums">
                                {formatBdt(s.payablePaisa)}
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-1.5">
                                  <PaymentLogo method={s.method} size="sm" />
                                </div>
                                <div className="font-mono text-slate-600 mt-0.5">
                                  {s.trxId ? `TrxID: ${s.trxId}` : '—'}
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex px-2.5 py-0.5 rounded-md border font-bold ${
                                    s.status === 'paid'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : s.status === 'waiting'
                                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {s.status === 'paid'
                                    ? 'পেইড'
                                    : s.status === 'waiting'
                                      ? 'অপেক্ষমাণ'
                                      : s.status === 'expired'
                                        ? 'মেয়াদোত্তীর্ণ'
                                        : s.status === 'cancelled'
                                          ? 'বাতিল'
                                          : 'ব্যর্থ'}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                                {formatBanglaDateTime(s.createdAtMs)}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  {canEditPay && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setVerifySessionTarget(s);
                                        setVerifySessionStatus(
                                          s.status === 'expired' ? 'failed' : s.status
                                        );
                                        setVerifySessionTrxId(s.trxId || '');
                                        setVerifySessionNote(s.manualNote || '');
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
                                    >
                                      ম্যানুয়াল যাচাই / নোট
                                    </button>
                                  )}
                                  {canDelPay && (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeletePaymentSessionClick(s)}
                                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100"
                                    >
                                      মুছুন
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {allSessions.slice(0, 40).map((s) => {
                      const canEditPay = canAdmin('payments', 'edit');
                      const canDelPay = canAdmin('payments', 'delete');
                      const storeName = storeById.get(s.storeId)?.name || s.storeId;
                      return (
                        <div key={s.id} className="p-4 space-y-2.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-slate-900 text-sm">{s.orderId}</div>
                              <div className="text-slate-500">{storeName}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-teal-800 text-sm tabular-nums">
                                {formatBdt(s.payablePaisa)}
                              </div>
                              <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700">
                                {s.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-slate-500">
                            <span className="font-mono">{s.trxId || 'TrxID নেই'}</span>
                            <span>{formatBanglaDateTime(s.createdAtMs)}</span>
                          </div>
                          {(canEditPay || canDelPay) && (
                            <div className="flex items-center gap-2 pt-1">
                              {canEditPay && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVerifySessionTarget(s);
                                    setVerifySessionStatus(
                                      s.status === 'expired' ? 'failed' : s.status
                                    );
                                    setVerifySessionTrxId(s.trxId || '');
                                    setVerifySessionNote(s.manualNote || '');
                                  }}
                                  className="flex-1 py-2 rounded-xl bg-slate-900 text-white font-bold"
                                >
                                  ম্যানুয়াল যাচাই / নোট
                                </button>
                              )}
                              {canDelPay && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeletePaymentSessionClick(s)}
                                  className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold"
                                >
                                  মুছুন
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
              data-testid="super-admin-purchases-tab"
            >
              {subscriptionPurchases.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  এখনো কোনো পাবলিক সাবস্ক্রিপশন ক্রয় রেকর্ড নেই
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                        <th className="py-3 px-4">ক্রেতা ও মোবাইল</th>
                        <th className="py-3 px-4">প্যাকেজ ও পরিমাণ</th>
                        <th className="py-3 px-4">মাধ্যম ও TrxID</th>
                        <th className="py-3 px-4">অবস্থা</th>
                        <th className="py-3 px-4">অ্যাকাউন্ট ও সময়</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {subscriptionPurchases.map((p) => {
                        const statusBadge =
                          p.status === 'paid'
                            ? {
                                label: 'পেইড (যাচাইকৃত)',
                                cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                              }
                            : p.status === 'pending'
                              ? {
                                  label: 'পেন্ডিং',
                                  cls: 'bg-amber-50 text-amber-900 border-amber-200',
                                }
                              : p.status === 'expired'
                                ? {
                                    label: 'মেয়াদোত্তীর্ণ',
                                    cls: 'bg-slate-100 text-slate-600 border-slate-200',
                                  }
                                : p.status === 'cancelled'
                                  ? {
                                      label: 'বাতিল',
                                      cls: 'bg-slate-100 text-slate-600 border-slate-200',
                                    }
                                  : {
                                      label: 'ব্যর্থ',
                                      cls: 'bg-rose-50 text-rose-800 border-rose-200',
                                    };
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/60">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{p.buyerName || '—'}</div>
                              <div className="font-mono text-slate-500 mt-0.5">
                                {p.buyerPhone || '—'}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">
                                {p.planName} ({p.billingCycle === 'yearly' ? 'বাৎসরিক' : 'মাসিক'})
                              </div>
                              <div className="font-semibold text-teal-800 tabular-nums mt-0.5">
                                {formatBdt(p.amountPaisa)}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <PaymentLogo method={p.method} size="sm" />
                              </div>
                              <div className="font-mono text-slate-600 mt-1">
                                {p.trxId ? `TrxID: ${p.trxId}` : `Ref: ${p.reference}`}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex px-2.5 py-1 rounded-md border font-semibold ${statusBadge.cls}`}
                              >
                                {statusBadge.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">
                              <div className="font-mono text-slate-800">
                                {p.claimedEmail ||
                                  (p.claimedAccountId
                                    ? p.claimedAccountId
                                    : 'এখনো অ্যাকাউন্ট তৈরি হয়নি')}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {formatBanglaDateTime(p.createdAtMs)}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: প্ল্যান (plans) */}
      {currentTabPermitted && tab === 'plans' && <SuperAdminPlansTab />}

      {/* TAB: Android App আপডেট (app_updates) */}
      {currentTabPermitted && tab === 'app_updates' && <SuperAdminAppUpdatesTab />}

      {/* TAB: নতুন কি এসেছে (Super Admin only) */}
      {isSuperAdmin && tab === 'changelog' && <SuperAdminChangelogTab />}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: মার্চেন্ট নোট / সাপোর্ট মন্তব্য (merchant_notes — Part C.6)
         ═══════════════════════════════════════════════════════════════════ */}
      {currentTabPermitted && tab === 'merchant_notes' && (
        <div className="space-y-5" data-testid="super-admin-merchant-notes-tab">
          {(editingNoteId
            ? canAdmin('merchant_notes', 'edit')
            : canAdmin('merchant_notes', 'create')) && (
            <form
              onSubmit={handleSaveSupportNoteSubmit}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {editingNoteId ? 'মার্চেন্ট নোট সম্পাদনা' : 'নতুন মার্চেন্ট নোট / সাপোর্ট মন্তব্য'}
                </h2>
                {editingNoteId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNoteId(null);
                      setNoteContent('');
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800"
                  >
                    বাতিল
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    মার্চেন্ট নির্বাচন করুন
                  </label>
                  <select
                    required
                    data-testid="merchant-note-account-select"
                    value={noteAccountId}
                    onChange={(e) => setNoteAccountId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    <option value="">নির্বাচন করুন</option>
                    {allAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.email} ({a.displayName || '—'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    সাপোর্ট মন্তব্য / নোট
                  </label>
                  <textarea
                    required
                    rows={2}
                    data-testid="merchant-note-content-input"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="মার্চেন্টের সমস্যা, কল সারাংশ বা ফলো-আপ নোট লিখুন"
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  data-testid="save-merchant-note-btn"
                  disabled={noteSaving}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50"
                >
                  {noteSaving
                    ? 'সংরক্ষণ হচ্ছে...'
                    : editingNoteId
                      ? 'নোট আপডেট করুন'
                      : 'নোট যোগ করুন'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-bold text-slate-900">সব মার্চেন্ট নোট</h3>
              <select
                value={noteMerchantFilter}
                onChange={(e) => setNoteMerchantFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
              >
                <option value="all">সব মার্চেন্ট</option>
                {allAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            </div>

            {filteredMerchantNotes.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                এখনো কোনো মার্চেন্ট নোট বা সাপোর্ট মন্তব্য নেই
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredMerchantNotes.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-teal-800">
                          {n.merchantEmail || n.merchantAccountId}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-slate-700">{n.authorName}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-bold text-slate-600">
                          {n.authorRoleName}
                        </span>
                        <span className="text-slate-400">
                          {formatBanglaDateTime(n.updatedAtMs)}
                        </span>
                      </div>
                      <p className="text-slate-800 whitespace-pre-wrap">{n.body}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canAdmin('merchant_notes', 'edit') && (
                        <button
                          type="button"
                          onClick={() => startEditSupportNote(n)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          সম্পাদনা
                        </button>
                      )}
                      {canAdmin('merchant_notes', 'delete') && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteSupportNoteClick(n.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          মুছুন
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: মার্চেন্ট (accounts — Part C.1)
         ═══════════════════════════════════════════════════════════════════ */}
      {currentTabPermitted && tab === 'accounts' && (
        <div
          className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
          data-testid="super-admin-merchants-tab"
        >
          {allAccounts.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">কোনো অ্যাকাউন্ট নেই</div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">অ্যাকাউন্ট</th>
                      <th className="py-3 px-4">প্ল্যান ও অবস্থা</th>
                      <th className="py-3 px-4">ট্রায়াল / পেইড মেয়াদ</th>
                      <th className="py-3 px-4">স্টোর</th>
                      <th className="py-3 px-4">আজকের সেশন</th>
                      <th className="py-3 px-4">যোগদান</th>
                      <th className="py-3 px-4 text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {allAccounts.map((acc) => {
                      const evalPlan = evaluateAccountPlan(acc, nowMs);
                      const effPlan = resolveEffectiveAccountPlan(acc, plans, platformConfig, nowMs);
                      const accStoresCount = allStores.filter((s) => s.accountId === acc.id).length;
                      const accSessionsToday = countSessionsToday(
                        allSessions.filter((s) => s.accountId === acc.id),
                        nowMs
                      );
                      const highlighted = highlightedAccountId === acc.id;
                      const canEditMerchant = canAdmin('merchants', 'edit');
                      const canDeleteMerchant = canAdmin('merchants', 'delete');

                      const chipClass =
                        evalPlan.badgeTone === 'emerald'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : evalPlan.badgeTone === 'teal'
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : evalPlan.badgeTone === 'amber'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200';

                      return (
                        <tr
                          key={acc.id}
                          className={highlighted ? 'bg-teal-50/60' : 'hover:bg-slate-50/60'}
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">
                              {acc.displayName || '—'}
                            </div>
                            <div className="text-xs font-mono text-slate-500">{acc.email}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${chipClass}`}
                              >
                                {evalPlan.labelBn}
                              </span>
                              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                {effPlan.plan.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            <div>ট্রায়াল: {formatBanglaDateTime(acc.trialEndsAtMs)}</div>
                            <div>
                              পেইড:{' '}
                              {acc.paidUntilMs ? formatBanglaDateTime(acc.paidUntilMs) : 'সেট নেই'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-semibold text-slate-800 tabular-nums">
                            {accStoresCount.toLocaleString('bn-BD')} /{' '}
                            {formatLimitBn(effPlan.storeLimit)}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-mono text-slate-800 tabular-nums">
                            {accSessionsToday.toLocaleString('bn-BD')} /{' '}
                            {formatLimitBn(effPlan.dailySessionCap)}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                            {formatBanglaDateTime(acc.createdAtMs)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {!acc.isSuperAdmin ? (
                              <div className="inline-flex items-center gap-1.5">
                                {canEditMerchant && (
                                  <button
                                    type="button"
                                    onClick={() => openAccountModal(acc)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    পরিচালনা
                                  </button>
                                )}
                                {canDeleteMerchant && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteMerchantTarget(acc);
                                      setDeleteMerchantNote('');
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    মুছুন
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">সুপার অ্যাডমিন</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {allAccounts.map((acc) => {
                  const evalPlan = evaluateAccountPlan(acc, nowMs);
                  const effPlan = resolveEffectiveAccountPlan(acc, plans, platformConfig, nowMs);
                  const canEditMerchant = canAdmin('merchants', 'edit');
                  const canDeleteMerchant = canAdmin('merchants', 'delete');
                  return (
                    <div key={acc.id} className="p-4 space-y-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">
                            {acc.displayName || '—'}
                          </div>
                          <div className="font-mono text-slate-500 truncate">{acc.email}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-800 shrink-0">
                          {effPlan.plan.name} · {evalPlan.labelBn}
                        </span>
                      </div>
                      {!acc.isSuperAdmin && (canEditMerchant || canDeleteMerchant) && (
                        <div className="flex items-center gap-2 pt-1">
                          {canEditMerchant && (
                            <button
                              type="button"
                              onClick={() => openAccountModal(acc)}
                              className="flex-1 py-2 rounded-xl bg-slate-900 text-white font-bold"
                            >
                              পরিচালনা
                            </button>
                          )}
                          {canDeleteMerchant && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteMerchantTarget(acc);
                                setDeleteMerchantNote('');
                              }}
                              className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold"
                            >
                              মুছুন
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: সব স্টোর (Super Admin only) */}
      {isSuperAdmin && tab === 'stores' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {allStores.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">কোনো স্টোর নেই</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">স্টোরের নাম</th>
                    <th className="py-3 px-4">মালিক</th>
                    <th className="py-3 px-4">ধরন</th>
                    <th className="py-3 px-4">আজকের সেশন</th>
                    <th className="py-3 px-4">আজকের পেমেন্ট</th>
                    <th className="py-3 px-4 text-right">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {allStores.map((st) => {
                    const owner = accountById.get(st.accountId);
                    const stStats = computeTodayStoreStats(
                      allSessions.filter((s) => s.storeId === st.id),
                      nowMs
                    );
                    return (
                      <tr key={st.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">{st.name}</td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                          {owner?.email || st.accountId}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                              st.type === 'own'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {st.type === 'own' ? 'নিজের' : 'কাস্টমার'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 tabular-nums">
                          {stStats.sessionsToday.toLocaleString('bn-BD')}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-emerald-700 tabular-nums">
                          {formatBdt(stStats.paidTodayPaisa)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectBrandingTarget(st)}
                              data-testid={`admin-view-branding-${st.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              ব্র্যান্ডিং
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConvertTarget(st);
                                setConvertNote('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              ধরন বদলান
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReassignTarget(st);
                                setReassignOwnerId(st.accountId);
                                setReassignNote('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              মালিক বদলান
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Manual Verify / Note Payment Session (Part C.3) */}
      {verifySessionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">পেমেন্ট সেশন যাচাই ও নোট</h2>
              <button
                type="button"
                onClick={() => setVerifySessionTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-900">অর্ডার: {verifySessionTarget.orderId}</div>
              <div className="text-slate-600">
                স্টোর: {storeById.get(verifySessionTarget.storeId)?.name || verifySessionTarget.storeId} · পরিমাণ:{' '}
                {formatBdt(verifySessionTarget.payablePaisa)}
              </div>
            </div>

            <form onSubmit={handleVerifySessionSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">অবস্থা</label>
                <select
                  value={verifySessionStatus}
                  onChange={(e) =>
                    setVerifySessionStatus(
                      e.target.value as 'paid' | 'waiting' | 'cancelled' | 'failed'
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="paid">পেইড (Paid)</option>
                  <option value="waiting">অপেক্ষমাণ (Waiting)</option>
                  <option value="cancelled">বাতিল (Cancelled)</option>
                  <option value="failed">ব্যর্থ (Failed)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  TrxID (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  value={verifySessionTrxId}
                  onChange={(e) => setVerifySessionTrxId(e.target.value)}
                  placeholder="যেমন: BKA1234567"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  যাচাই নোট (বাধ্যতামূলক)
                </label>
                <textarea
                  required
                  rows={2}
                  value={verifySessionNote}
                  onChange={(e) => setVerifySessionNote(e.target.value)}
                  placeholder="যাচাইয়ের কারণ বা মন্তব্য লিখুন"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVerifySessionTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={verifySessionBusy}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50"
                >
                  {verifySessionBusy ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Merchant Account */}
      {deleteMerchantTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">মার্চেন্ট অ্যাকাউন্ট মুছবেন?</h2>
              <button
                type="button"
                onClick={() => setDeleteMerchantTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
              মার্চেন্ট: <strong className="font-mono">{deleteMerchantTarget.email}</strong>
            </div>
            <form onSubmit={handleConfirmDeleteMerchant} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  মোছার কারণ / নোট (বাধ্যতামূলক)
                </label>
                <textarea
                  required
                  rows={2}
                  value={deleteMerchantNote}
                  onChange={(e) => setDeleteMerchantNote(e.target.value)}
                  placeholder="কেন এই মার্চেন্ট মুছে ফেলা হচ্ছে তা লিখুন"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteMerchantTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={deleteMerchantBusy}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
                >
                  {deleteMerchantBusy ? 'মুছে ফেলা হচ্ছে...' : 'মার্চেন্ট মুছুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Account (Activate/Suspend, Paid Until, Tier, Daily Cap + Mandatory Note) */}
      {editAccountTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">অ্যাকাউন্ট পরিচালনা</h2>
              <button
                type="button"
                onClick={() => setEditAccountTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700">
              {editAccountTarget.email}
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    প্ল্যান স্ট্যাটাস
                  </label>
                  <select
                    value={editPlanStatus}
                    onChange={(e) => setEditPlanStatus(e.target.value as PlanStatus)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="active">সক্রিয় করুন (Active)</option>
                    <option value="trial">ট্রায়াল (Trial)</option>
                    <option value="suspended">স্থগিত করুন (Suspended)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    প্ল্যান নির্বাচন করুন
                  </label>
                  <select
                    value={editPlanId}
                    onChange={(e) => setEditPlanId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.archived ? ' (আর্কাইভ)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  পেইড মেয়াদ (Paid Until)
                </label>
                <input
                  type="date"
                  value={editPaidUntil}
                  onChange={(e) => setEditPaidUntil(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    স্টোর সীমা ওভাররাইড (খালি = প্ল্যান ডিফল্ট, ০ = আনলিমিটেড)
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="প্ল্যান ডিফল্ট"
                    value={editStoreOverride}
                    onChange={(e) => setEditStoreOverride(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    দৈনিক সেশন ওভাররাইড (খালি = প্ল্যান ডিফল্ট, ০ = আনলিমিটেড)
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="প্ল্যান ডিফল্ট"
                    value={editDailyCapOverride}
                    onChange={(e) => setEditDailyCapOverride(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  নিশ্চিতকরণ নোট (বাধ্যতামূলক)
                </label>
                <textarea
                  required
                  rows={2}
                  maxLength={300}
                  value={editAccountNote}
                  onChange={(e) => setEditAccountNote(e.target.value)}
                  placeholder="যেমন: ১ মাসের সাবস্ক্রিপশন ফি পাওয়া গেছে"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditAccountTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={accountBusy}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                >
                  {accountBusy ? 'সংরক্ষণ হচ্ছে...' : 'নিশ্চিত করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Convert Store Type (own <-> customer) */}
      {convertTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">স্টোরের ধরন পরিবর্তন</h2>
              <button
                type="button"
                onClick={() => setConvertTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <strong>{convertTarget.name}</strong>:{' '}
              {convertTarget.type === 'own' ? 'নিজের → কাস্টমার' : 'কাস্টমার → নিজের'}
              <div className="text-slate-500 mt-1">
                পূর্বের সব সেশন ও SMS ইতিহাস এই স্টোরের সাথেই অক্ষুণ্ণ থাকবে।
              </div>
            </div>
            <form onSubmit={handleConfirmConvert} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  বাংলা নোট (বাধ্যতামূলক)
                </label>
                <textarea
                  required
                  rows={2}
                  maxLength={300}
                  value={convertNote}
                  onChange={(e) => setConvertNote(e.target.value)}
                  placeholder="পরিবর্তনের কারণ লিখুন"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConvertTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={storeBusy}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {storeBusy ? 'পরিবর্তন হচ্ছে...' : 'পরিবর্তন নিশ্চিত করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reassign Store Owner */}
      {reassignTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">স্টোরের মালিক বদলান</h2>
              <button
                type="button"
                onClick={() => setReassignTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
              স্টোর: <strong>{reassignTarget.name}</strong>
              <div className="text-slate-500 mt-1">
                পূর্বের সব সেশন ও SMS ইতিহাস এই স্টোরের সাথেই থাকবে, মুছে ফেলা হবে না।
              </div>
            </div>
            <form onSubmit={handleConfirmReassign} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  নতুন মালিক নির্বাচন করুন
                </label>
                <select
                  required
                  value={reassignOwnerId}
                  onChange={(e) => setReassignOwnerId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {allAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email} ({a.displayName || '—'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  বাংলা নোট (বাধ্যতামূলক)
                </label>
                <textarea
                  required
                  rows={2}
                  maxLength={300}
                  value={reassignNote}
                  onChange={(e) => setReassignNote(e.target.value)}
                  placeholder="মালিক পরিবর্তনের কারণ লিখুন"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReassignTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={storeBusy}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {storeBusy ? 'হস্তান্তর হচ্ছে...' : 'মালিকানা পরিবর্তন করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Read-Only Merchant Branding Viewer (No Silent Edits) */}
      {inspectBrandingTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4"
          data-testid="admin-branding-modal"
        >
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">মার্চেন্ট ব্র্যান্ডিং (শুধু দেখা)</h2>
              <button
                type="button"
                onClick={() => setInspectBrandingTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <StoreBrandAvatar
                name={inspectBrandingTarget.name}
                nameEn={inspectBrandingTarget.nameEn}
                logoUrl={inspectBrandingTarget.logoUrl}
                logoDataUrl={inspectBrandingTarget.logoDataUrl}
                size="md"
              />
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900 truncate">
                  {inspectBrandingTarget.name}
                </div>
                {inspectBrandingTarget.nameEn && (
                  <div className="text-xs text-slate-500 truncate">
                    {inspectBrandingTarget.nameEn}
                  </div>
                )}
                <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                  {inspectBrandingTarget.id}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-bold text-slate-700">পেমেন্ট মাধ্যম ও নম্বরসমূহ</div>
              {CHECKOUT_METHODS.map((method) => {
                const brand = CHECKOUT_METHOD_BRANDS[method];
                const isOn = inspectBrandingTarget.numberEnabled[method];
                const accounts = normalizePaymentAccounts(
                  inspectBrandingTarget.paymentAccounts,
                  inspectBrandingTarget.numbers
                )[method];
                return (
                  <div
                    key={method}
                    className="p-3 rounded-xl border border-slate-200 bg-white space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PaymentLogo method={method} size="sm" />
                        <span
                          className="text-sm font-bold"
                          style={{ color: brand.primaryHex }}
                        >
                          {brand.name}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          isOn ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {isOn ? 'চালু' : 'বন্ধ'}
                      </span>
                    </div>
                    {accounts.length === 0 ? (
                      <div className="text-xs text-slate-400">কোনো নম্বর যুক্ত নেই</div>
                    ) : (
                      <div className="space-y-1">
                        {accounts.map((acc, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs font-mono text-slate-700"
                          >
                            <span>{acc.number}</span>
                            <span className="font-sans text-[11px] font-semibold text-slate-500">
                              {formatAccountTypeLabel(acc.type)} ·{' '}
                              {
                                PAYMENT_ACTION_LABELS_BN[
                                  normalizePaymentActionType(acc.actionType, acc.type)
                                ]
                              }{' '}
                              · {acc.active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              সুপার অ্যাডমিন শুধুমাত্র মার্চেন্টের ব্র্যান্ডিং দেখতে পারেন — নীরবে কোনো পরিবর্তন করা যায় না।
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInspectBrandingTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
              >
                বন্ধ করুন
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = inspectBrandingTarget;
                  setInspectBrandingTarget(null);
                  setAdminPreviewStore(target);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
              >
                <Eye className="w-4 h-4" />
                প্রিভিউ দেখুন (TEST)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe TEST Preview for Super Admin Inspection */}
      {adminPreviewStore && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <HostedPaymentPage
            sessionId={`admin-preview-${adminPreviewStore.id}`}
            previewConfig={{
              storeName: adminPreviewStore.name,
              storeNameEn: adminPreviewStore.nameEn,
              logoUrl: adminPreviewStore.logoUrl,
              logoDataUrl: adminPreviewStore.logoDataUrl,
              orderId: 'TEST-ADMIN-VIEW',
              payablePaisa: 125000,
              sessionMinutes: adminPreviewStore.sessionMinutes || 15,
              methods: resolveStoreCheckoutOptions(adminPreviewStore),
              onClosePreview: () => setAdminPreviewStore(null),
            }}
          />
        </div>
      )}
    </div>
  );
};
