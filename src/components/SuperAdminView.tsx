import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  Bell,
  CheckCircle2,
  Eye,
  Globe,
  Layers,
  Save,
  Shield,
  Sparkles,
  Store,
  UserCheck,
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
  PayAccountDoc,
  PayStoreDoc,
  PlanStatus,
  StoreType,
} from '../types/payment';
import { SuperAdminPlansTab } from './SuperAdminPlansTab';
import { SuperAdminChangelogTab } from './SuperAdminChangelogTab';
import {
  CHECKOUT_METHOD_BRANDS,
  CHECKOUT_METHODS,
  formatAccountTypeLabel,
  normalizePaymentAccounts,
  resolveStoreCheckoutOptions,
} from '../lib/checkoutFlow';
import { HostedPaymentPage } from './HostedPaymentPage';
import { PaymentMethodMark, StoreBrandAvatar } from './PaymentMethodMarks';

type AdminTab = 'summary' | 'notifications' | 'plans' | 'accounts' | 'stores' | 'changelog';

export const SuperAdminView: React.FC = () => {
  const {
    account,
    platformConfig,
    plans,
    changelog,
    allAccounts,
    allStores,
    allSessions,
    allDevices,
    activityLog,
    adminSaveWorkerBaseUrl,
    adminUpdateAccount,
    adminConvertStoreType,
    adminReassignStore,
  } = usePayVerify();

  const [tab, setTab] = useState<AdminTab>('summary');
  const [highlightedAccountId, setHighlightedAccountId] = useState<string | null>(null);

  // Platform Worker URL editor
  const [workerUrl, setWorkerUrl] = useState(platformConfig.workerBaseUrl);
  const [workerSaving, setWorkerSaving] = useState(false);
  const [workerNotice, setWorkerNotice] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Account action modal (live planId + optional overrides)
  const [editAccountTarget, setEditAccountTarget] = useState<PayAccountDoc | null>(null);
  const [editPlanStatus, setEditPlanStatus] = useState<PlanStatus>('active');
  const [editPlanId, setEditPlanId] = useState<string>('');
  const [editPaidUntil, setEditPaidUntil] = useState('');
  const [editStoreOverride, setEditStoreOverride] = useState('');
  const [editDailyCapOverride, setEditDailyCapOverride] = useState('');
  const [editAccountNote, setEditAccountNote] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);

  // Store convert modal
  const [convertTarget, setConvertTarget] = useState<PayStoreDoc | null>(null);
  const [convertNote, setConvertNote] = useState('');
  const [storeBusy, setStoreBusy] = useState(false);

  // Store reassign modal
  const [reassignTarget, setReassignTarget] = useState<PayStoreDoc | null>(null);
  const [reassignOwnerId, setReassignOwnerId] = useState('');
  const [reassignNote, setReassignNote] = useState('');

  // Read-only merchant branding viewer (Super Admin can inspect, never silently edit)
  const [inspectBrandingTarget, setInspectBrandingTarget] = useState<PayStoreDoc | null>(null);
  const [adminPreviewStore, setAdminPreviewStore] = useState<PayStoreDoc | null>(null);

  const nowMs = Date.now();

  const notifications = useMemo(
    () => computeSuperAdminNotifications(allAccounts, allDevices, nowMs, activityLog),
    [allAccounts, allDevices, nowMs, activityLog]
  );

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

  if (!account?.isSuperAdmin) {
    return null;
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

  const jumpToAccount = (accountId: string) => {
    setHighlightedAccountId(accountId);
    setTab('accounts');
  };

  const tabs: Array<{
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'summary', label: 'প্ল্যাটফর্ম সারাংশ', icon: Activity },
    { id: 'notifications', label: 'বিজ্ঞপ্তি', icon: Bell, badge: notifications.length },
    { id: 'plans', label: 'প্ল্যানসমূহ', icon: Layers, badge: plans.length },
    { id: 'accounts', label: 'সব অ্যাকাউন্ট', icon: Users, badge: allAccounts.length },
    { id: 'stores', label: 'সব স্টোর', icon: Store, badge: allStores.length },
    { id: 'changelog', label: 'নতুন কি এসেছে', icon: Sparkles, badge: changelog.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">সুপার অ্যাডমিন</h1>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
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

      {globalError && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      {/* TAB 1: প্ল্যাটফর্ম সারাংশ */}
      {tab === 'summary' && (
        <div className="space-y-6">
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

          {/* Platform Worker Base URL Config */}
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

          {/* Latest 20 payActivity entries */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">সর্বশেষ অ্যাক্টিভিটি লগ (২০টি)</h2>
            </div>
            {activityLog.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                এখনো কোনো অ্যাডমিন অ্যাক্টিভিটি রেকর্ড হয়নি
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activityLog.slice(0, 20).map((entry) => (
                  <div key={entry.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{entry.detail}</div>
                      <div className="text-slate-600">নোট: {entry.note}</div>
                    </div>
                    <div className="text-slate-400 whitespace-nowrap text-right">
                      <div>{entry.actorEmail || entry.actorAccountId}</div>
                      <div>{formatBanglaDateTime(entry.createdAtMs)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: বিজ্ঞপ্তি (Feature #5) */}
      {tab === 'notifications' && (
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

      {/* TAB: প্ল্যানসমূহ (Plans + Add-ons + Coupons) */}
      {tab === 'plans' && <SuperAdminPlansTab />}

      {/* TAB: নতুন কি এসেছে (Changelog Manager) */}
      {tab === 'changelog' && <SuperAdminChangelogTab />}

      {/* TAB 3: সব অ্যাকাউন্ট */}
      {tab === 'accounts' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {allAccounts.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">কোনো অ্যাকাউন্ট নেই</div>
          ) : (
            <div className="overflow-x-auto">
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
                          <div className="font-semibold text-slate-900">{acc.displayName || '—'}</div>
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
                            <button
                              type="button"
                              onClick={() => openAccountModal(acc)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              পরিচালনা
                            </button>
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
          )}
        </div>
      )}

      {/* TAB 4: সব স্টোর */}
      {tab === 'stores' && (
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
                        <PaymentMethodMark method={method} className="w-7 h-7" />
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
                              {formatAccountTypeLabel(acc.type)} · {acc.active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
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

