import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  History,
  Layers,
  LogOut,
  Monitor,
  PackagePlus,
  Printer,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Tag,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatBanglaDateTime, formatBdt } from '../lib/money';
import { countSessionsToday, generatePaidSessionsCsv } from '../lib/platformLogic';
import {
  ADDON_KIND_LABELS_BN,
  formatLimitBn,
  formatPlanPriceBn,
  previewCouponDiscount,
  type CouponPreviewResult,
} from '../lib/planEngine';
import {
  WALLET_META,
  WALLET_METHODS,
  type PaySessionDoc,
  type WalletMethod,
} from '../types/payment';
import { ReauthModal } from './ReauthModal';

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function thirtyDaysAgoIsoDate(): string {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface AccountViewProps {
  onOpenPlanComparison?: () => void;
}

export const AccountView: React.FC<AccountViewProps> = ({ onOpenPlanComparison }) => {
  const {
    account,
    planEvaluation,
    effectivePlan,
    plans,
    addons,
    ownedStores,
    devices,
    selectedStore,
    storeSessions,
    accountSessions,
    subscriptionReceipts,
    loginHistory,
    authMetadata,
    newDeviceLoginAlert,
    dismissNewDeviceLoginAlert,
    lookupCouponForPreview,
    initiateSubscriptionCheckout,
    signOutUser,
    signOutAllSessions,
  } = usePayVerify();

  // CSV Export
  const [fromDate, setFromDate] = useState(thirtyDaysAgoIsoDate);
  const [toDate, setToDate] = useState(todayIsoDate);
  const [exportNote, setExportNote] = useState<string | null>(null);

  // Renewal / Upgrade / Add-on Checkout Modal
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<'plan' | 'addon'>('plan');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedAddonId, setSelectedAddonId] = useState('');
  const [payMethod, setPayMethod] = useState<WalletMethod>('bkash');
  const [couponInput, setCouponInput] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponPreview, setCouponPreview] = useState<CouponPreviewResult | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<{
    sessionId: string;
    paymentPath: string;
  } | null>(null);
  const [reauthForCheckout, setReauthForCheckout] = useState(false);

  // Printable Receipt Modal
  const [receiptTarget, setReceiptTarget] = useState<PaySessionDoc | null>(null);

  // Sign out all sessions state
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [revokeNotice, setRevokeNotice] = useState<string | null>(null);

  const nowMs = Date.now();
  const sessionsToday = useMemo(
    () => countSessionsToday(accountSessions, nowMs),
    [accountSessions, nowMs]
  );

  const activeDevicesCount = useMemo(() => devices.filter((d) => d.active).length, [devices]);
  const nonArchivedPlans = useMemo(() => plans.filter((p) => !p.archived), [plans]);
  const activeAddonsCatalog = useMemo(() => addons.filter((a) => a.active), [addons]);

  if (!account || !planEvaluation || !effectivePlan) return null;

  const capUnlimited = effectivePlan.dailySessionCap === 0;
  const capPct = capUnlimited
    ? 0
    : Math.min(100, Math.round((sessionsToday / effectivePlan.dailySessionCap) * 100));

  const badgeColors: Record<typeof planEvaluation.badgeTone, string> = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    teal: 'bg-teal-50 text-teal-800 border-teal-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
  };

  const openCheckoutModal = (mode: 'plan' | 'addon') => {
    setCheckoutMode(mode);
    setSelectedPlanId(effectivePlan.plan.id || nonArchivedPlans[0]?.id || '');
    setSelectedAddonId(activeAddonsCatalog[0]?.id || '');
    setBillingCycle('monthly');
    setCouponInput('');
    setCouponPreview(null);
    setCheckoutError(null);
    setCheckoutResult(null);
    setCheckoutOpen(true);
  };

  const chosenPlan = nonArchivedPlans.find((p) => p.id === selectedPlanId) || nonArchivedPlans[0];
  const chosenAddon =
    activeAddonsCatalog.find((a) => a.id === selectedAddonId) || activeAddonsCatalog[0];

  const baseCheckoutPrice =
    checkoutMode === 'plan'
      ? billingCycle === 'yearly' && chosenPlan?.priceYearly && chosenPlan.priceYearly > 0
        ? chosenPlan.priceYearly
        : chosenPlan?.priceMonthly ?? 0
      : chosenAddon?.price ?? 0;

  const handleCheckCoupon = async () => {
    setCouponPreview(null);
    if (!couponInput.trim()) return;
    setCouponChecking(true);
    try {
      const coupon = await lookupCouponForPreview(couponInput);
      const res = previewCouponDiscount(
        baseCheckoutPrice,
        coupon,
        checkoutMode === 'plan' ? chosenPlan?.id || null : null,
        Date.now()
      );
      setCouponPreview(res);
    } catch {
      setCouponPreview({
        valid: false,
        discountBdt: 0,
        previewFinalBdt: baseCheckoutPrice,
        messageBn: 'কুপন যাচাই করা যায়নি।',
      });
    } finally {
      setCouponChecking(false);
    }
  };

  const executeCheckoutAfterReauth = async () => {
    setReauthForCheckout(false);
    setCheckoutError(null);
    setCheckoutBusy(true);
    try {
      const res = await initiateSubscriptionCheckout({
        itemType: checkoutMode,
        planId: checkoutMode === 'plan' ? chosenPlan?.id : undefined,
        billingCycle: checkoutMode === 'plan' ? billingCycle : undefined,
        addonId: checkoutMode === 'addon' ? chosenAddon?.id : undefined,
        method: payMethod,
        couponCode: couponInput.trim() || undefined,
      });
      setCheckoutResult(res);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'চেকআউট শুরু করা যায়নি।');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleExportCsv = () => {
    setExportNote(null);
    if (!account.isSuperAdmin && !effectivePlan.features.csvExport) {
      setExportNote(
        `আপনার বর্তমান “${effectivePlan.plan.name}” প্ল্যানে CSV এক্সপোর্ট সুবিধা নেই।`
      );
      return;
    }
    const { csv, rowCount } = generatePaidSessionsCsv(storeSessions, fromDate, toDate);
    if (rowCount === 0) {
      setExportNote('নির্বাচিত তারিখের মধ্যে কোনো পরিশোধিত সেশন পাওয়া যায়নি।');
      return;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (selectedStore?.name || 'store').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `payverify_${slug}_${fromDate}_to_${toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportNote(`${rowCount.toLocaleString('bn-BD')}টি পরিশোধিত পেমেন্ট CSV ডাউনলোড হয়েছে।`);
  };

  const handleSignOutAll = async () => {
    setRevokingSessions(true);
    setRevokeNotice(null);
    try {
      const res = await signOutAllSessions();
      if (res.localSignedOut) {
        setRevokeNotice(
          'এই ডিভাইস থেকে সাইন আউট এবং সেশন বাতিলের সময় রেকর্ড করা হয়েছে। অন্যান্য ডিভাইসের সম্পূর্ণ রিফ্রেশ-টোকেন বাতিল Worker/Admin SDK সক্রিয় হলে কার্যকর হবে।'
        );
      }
    } finally {
      setRevokingSessions(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="account-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">অ্যাকাউন্ট</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {onOpenPlanComparison && (
            <button
              type="button"
              onClick={onOpenPlanComparison}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Layers className="w-3.5 h-3.5 text-teal-700" />
              প্ল্যান তুলনা দেখুন
            </button>
          )}
          <button
            type="button"
            onClick={() => openCheckoutModal('plan')}
            data-testid="open-upgrade-modal-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
          >
            <CreditCard className="w-3.5 h-3.5" />
            নবায়ন / আপগ্রেড করুন
          </button>
          {activeAddonsCatalog.length > 0 && (
            <button
              type="button"
              onClick={() => openCheckoutModal('addon')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              অ্যাড-অন কিনুন
            </button>
          )}
        </div>
      </div>

      {/* Live Plan Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <div className="text-base font-bold text-slate-900">
                {account.displayName || account.email}
              </div>
              <div className="text-xs font-mono text-slate-500">{account.email}</div>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-lg text-xs font-bold border ${badgeColors[planEvaluation.badgeTone]}`}
          >
            {planEvaluation.labelBn}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-slate-500">বর্তমান প্ল্যান</div>
            <div className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5 flex-wrap">
              <span>{effectivePlan.plan.name}</span>
              {effectivePlan.isTrialPlanFallback && (
                <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px]">
                  ট্রায়াল
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {formatPlanPriceBn(effectivePlan.plan.priceMonthly)}
              {effectivePlan.plan.priceMonthly && effectivePlan.plan.priceMonthly > 0 ? ' / মাস' : ''}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-slate-500">স্টোর ও ডিভাইস সীমা</div>
            <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
              স্টোর: {ownedStores.length.toLocaleString('bn-BD')} /{' '}
              {formatLimitBn(effectivePlan.storeLimit)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
              ডিভাইস: {activeDevicesCount.toLocaleString('bn-BD')} /{' '}
              {formatLimitBn(effectivePlan.deviceLimit)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-slate-500">ট্রায়াল মেয়াদ</div>
            <div className="text-sm font-semibold text-slate-900 mt-1">
              {formatBanglaDateTime(account.trialEndsAtMs)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-slate-500">পেইড মেয়াদ (Paid Until)</div>
            <div className="text-sm font-semibold text-slate-900 mt-1">
              {account.paidUntilMs ? formatBanglaDateTime(account.paidUntilMs) : 'সেট করা নেই'}
            </div>
          </div>
        </div>

        {/* Active Owned Add-ons */}
        {effectivePlan.activeAddons.length > 0 && (
          <div className="pt-1 space-y-2">
            <div className="text-xs font-semibold text-slate-700">সক্রিয় অ্যাড-অন প্যাক</div>
            <div className="flex flex-wrap gap-2">
              {effectivePlan.activeAddons.map((addon, idx) => (
                <span
                  key={`${addon.addonId}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-800"
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  {addon.name} ({ADDON_KIND_LABELS_BN[addon.kind]} +{addon.amount.toLocaleString('bn-BD')})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Daily Session Usage vs Effective Cap */}
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">আজকের সেশন ব্যবহার</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {sessionsToday.toLocaleString('bn-BD')} /{' '}
              {capUnlimited ? 'আনলিমিটেড' : effectivePlan.dailySessionCap.toLocaleString('bn-BD')}
            </span>
          </div>
          {!capUnlimited && (
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capPct >= 90 ? 'bg-rose-500' : 'bg-teal-600'
                }`}
                style={{ width: `${capPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Subscription Payment History & Printable Receipts */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-teal-700" />
          <h2 className="text-base font-bold text-slate-900">সাবস্ক্রিপশন পেমেন্ট ইতিহাস ও রসিদ</h2>
        </div>

        {subscriptionReceipts.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs text-slate-400">
            এখনো কোনো নিশ্চিত সাবস্ক্রিপশন বা অ্যাড-অন পেমেন্ট রেকর্ড হয়নি
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">তারিখ</th>
                  <th className="py-3 px-5">প্ল্যান / অ্যাড-অন</th>
                  <th className="py-3 px-5">পরিমাণ</th>
                  <th className="py-3 px-5">TrxID</th>
                  <th className="py-3 px-5">পেইড মেয়াদ</th>
                  <th className="py-3 px-5 text-right">রসিদ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {subscriptionReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-5 text-slate-600">
                      {formatBanglaDateTime(r.paidAtMs ?? r.createdAtMs)}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-slate-900">
                      {r.subscriptionItemName || r.orderId}
                    </td>
                    <td className="py-3.5 px-5 font-bold text-emerald-700 tabular-nums">
                      {formatBdt(r.amountPaisa)}
                    </td>
                    <td className="py-3.5 px-5 font-mono text-slate-700">{r.trxId || '—'}</td>
                    <td className="py-3.5 px-5 text-slate-600">
                      {r.subscriptionResultingPaidUntilMs
                        ? formatBanglaDateTime(r.subscriptionResultingPaidUntilMs)
                        : '—'}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => setReceiptTarget(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        রসিদ দেখুন
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Login & Session Security */}
      <div
        className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5"
        data-testid="login-security-section"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-700" />
            <h2 className="text-base font-bold text-slate-900">লগইন ও সেশন নিরাপত্তা</h2>
          </div>
          <button
            type="button"
            disabled={revokingSessions}
            onClick={() => void handleSignOutAll()}
            data-testid="signout-all-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            {revokingSessions ? 'লগআউট হচ্ছে...' : 'সব জায়গা থেকে লগআউট করুন'}
          </button>
        </div>

        {newDeviceLoginAlert && (
          <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                নতুন ডিভাইস বা ব্রাউজার থেকে সাইন ইন শনাক্ত হয়েছে। এটি আপনি না হলে এখনই “সব জায়গা থেকে লগআউট করুন” চাপুন এবং পাসওয়ার্ড বদলান।
              </span>
            </div>
            <button
              type="button"
              onClick={dismissNewDeviceLoginAlert}
              className="text-amber-800 hover:text-amber-950 shrink-0"
              aria-label="বিজ্ঞপ্তি সরান"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {revokeNotice && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
            {revokeNotice}
          </div>
        )}

        {/* Active Sessions & Firebase Auth Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-slate-500">বর্তমান সক্রিয় সেশন</div>
            <div className="font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-emerald-600" />
              <span>এই ব্রাউজার (সক্রিয়)</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-slate-500">সর্বশেষ সাইন ইন</div>
            <div className="font-semibold text-slate-900 mt-1">
              {authMetadata.lastSignInTime
                ? formatBanglaDateTime(Date.parse(authMetadata.lastSignInTime))
                : '—'}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="text-slate-500">সর্বশেষ সব সেশন বাতিল</div>
            <div className="font-semibold text-slate-900 mt-1">
              {account.tokensRevokedAtMs ? formatBanglaDateTime(account.tokensRevokedAtMs) : 'কখনো নয়'}
            </div>
          </div>
        </div>

        {/* Login History Table */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700">সাম্প্রতিক লগইন ইতিহাস</div>
          {loginHistory.length === 0 ? (
            <div className="text-xs text-slate-400 py-3">
              এখনো কোনো অতিরিক্ত লগইন ইতিহাস রেকর্ড হয়নি
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {loginHistory.slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs bg-white"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-800">
                      {entry.deviceInfo || entry.detail}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      IP: {entry.ip || 'ব্রাউজার থেকে অপ্রাপ্য'}
                    </div>
                  </div>
                  <span className="text-slate-500">{formatBanglaDateTime(entry.createdAtMs)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CSV Export of Selected Store's Paid Sessions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-700" />
          <h2 className="text-base font-bold text-slate-900">
            পরিশোধিত পেমেন্ট CSV এক্সপোর্ট {selectedStore ? `(${selectedStore.name})` : ''}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">শুরুর তারিখ</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">শেষ তারিখ</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            type="button"
            disabled={!selectedStore}
            onClick={handleExportCsv}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            CSV ডাউনলোড
          </button>
        </div>

        {exportNote && (
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
            {exportNote}
          </div>
        )}
      </div>

      {/* Sign Out */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm font-semibold text-slate-800">অ্যাকাউন্ট থেকে বের হতে চান?</div>
        <button
          type="button"
          onClick={() => void signOutUser()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          সাইন আউট
        </button>
      </div>

      {/* Renewal / Upgrade / Add-on Checkout Modal */}
      {checkoutOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          data-testid="subscription-checkout-modal"
        >
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {checkoutMode === 'plan' ? 'প্ল্যান নবায়ন / আপগ্রেড' : 'অ্যাড-অন প্যাক কিনুন'}
              </h2>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeAddonsCatalog.length > 0 && (
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutMode('plan');
                    setCouponPreview(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-semibold ${
                    checkoutMode === 'plan'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  প্ল্যান নবায়ন/আপগ্রেড
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutMode('addon');
                    setCouponPreview(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-semibold ${
                    checkoutMode === 'addon'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  অ্যাড-অন প্যাক
                </button>
              </div>
            )}

            {checkoutResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1.5">
                  <div className="font-bold text-sm text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    পেমেন্ট সেশন তৈরি হয়েছে
                  </div>
                  <div className="font-mono">Session ID: {checkoutResult.sessionId}</div>
                  <div>পেমেন্ট সম্পন্ন হলে সাথে সাথেই আপনার প্ল্যান ও নতুন মেয়াদ কার্যকর হবে।</div>
                </div>
                <a
                  href={checkoutResult.paymentPath}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
                >
                  <ExternalLink className="w-4 h-4" />
                  পেমেন্ট পেজে যান
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                {checkoutMode === 'plan' ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        প্ল্যান নির্বাচন করুন
                      </label>
                      <select
                        value={selectedPlanId}
                        onChange={(e) => {
                          setSelectedPlanId(e.target.value);
                          setCouponPreview(null);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                      >
                        {nonArchivedPlans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — মাসিক: {formatPlanPriceBn(p.priceMonthly)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {chosenPlan &&
                      chosenPlan.priceYearly !== null &&
                      chosenPlan.priceYearly > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBillingCycle('monthly');
                              setCouponPreview(null);
                            }}
                            className={`p-3 rounded-xl border text-left text-xs ${
                              billingCycle === 'monthly'
                                ? 'border-teal-500 bg-teal-50 text-teal-900'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <div className="font-bold">মাসিক</div>
                            <div className="mt-0.5 tabular-nums">
                              {formatPlanPriceBn(chosenPlan.priceMonthly)}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBillingCycle('yearly');
                              setCouponPreview(null);
                            }}
                            className={`p-3 rounded-xl border text-left text-xs ${
                              billingCycle === 'yearly'
                                ? 'border-teal-500 bg-teal-50 text-teal-900'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <div className="font-bold">বাৎসরিক</div>
                            <div className="mt-0.5 tabular-nums">
                              {formatPlanPriceBn(chosenPlan.priceYearly)}
                            </div>
                          </button>
                        </div>
                      )}
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      অ্যাড-অন প্যাক নির্বাচন করুন
                    </label>
                    <select
                      value={selectedAddonId}
                      onChange={(e) => {
                        setSelectedAddonId(e.target.value);
                        setCouponPreview(null);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      {activeAddonsCatalog.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({ADDON_KIND_LABELS_BN[a.kind]} +
                          {a.amount.toLocaleString('bn-BD')}) — {formatPlanPriceBn(a.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Wallet Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    পেমেন্ট মাধ্যম
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {WALLET_METHODS.map((m) => {
                      const meta = WALLET_META[m];
                      const active = payMethod === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPayMethod(m)}
                          className="py-2 px-3 rounded-xl border text-xs font-semibold flex items-center gap-2"
                          style={{
                            borderColor: active ? meta.color : '#E2E8F0',
                            backgroundColor: active ? meta.softBg : '#FFFFFF',
                            color: active ? meta.color : '#334155',
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: meta.color }}
                          />
                          {meta.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Coupon Code (client preview only; final price computed server-side) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    কুপন কোড (ঐচ্ছিক)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value.toUpperCase());
                        setCouponPreview(null);
                      }}
                      placeholder="যেমন: SAVE20"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs uppercase"
                    />
                    <button
                      type="button"
                      disabled={couponChecking || !couponInput.trim()}
                      onClick={() => void handleCheckCoupon()}
                      className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      {couponChecking ? 'যাচাই...' : 'যাচাই করুন'}
                    </button>
                  </div>
                  {couponPreview && (
                    <div
                      className={`p-2.5 rounded-xl text-xs border ${
                        couponPreview.valid
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}
                    >
                      {couponPreview.messageBn}
                    </div>
                  )}
                </div>

                {/* Price Summary */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">তালিকা মূল্য</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatPlanPriceBn(baseCheckoutPrice)}
                    </span>
                  </div>
                  {couponPreview?.valid && (
                    <div className="flex items-center justify-between text-emerald-700 font-semibold">
                      <span>কুপন প্রিভিউ আনুমানিক মূল্য</span>
                      <span className="tabular-nums">
                        {formatPlanPriceBn(couponPreview.previewFinalBdt)}
                      </span>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 pt-1">
                    চূড়ান্ত মূল্য ও কুপন যাচাই সার্ভার (Worker) থেকে নির্ধারিত হবে।
                  </div>
                </div>

                {checkoutError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{checkoutError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                  >
                    বাতিল
                  </button>
                  <button
                    type="button"
                    disabled={checkoutBusy || baseCheckoutPrice <= 0}
                    onClick={() => setReauthForCheckout(true)}
                    className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                  >
                    {checkoutBusy ? 'শুরু হচ্ছে...' : 'পেমেন্ট শুরু করুন'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {receiptTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">পেমেন্ট রসিদ</h2>
              <button
                type="button"
                onClick={() => setReceiptTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 print:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-sm text-slate-900">PayVerify BD</span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                  পরিশোধিত
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">অ্যাকাউন্ট</span>
                <span className="font-mono text-slate-900">{account.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">বিবরণ</span>
                <span className="font-semibold text-slate-900">
                  {receiptTarget.subscriptionItemName || receiptTarget.orderId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">তারিখ</span>
                <span className="text-slate-900">
                  {formatBanglaDateTime(receiptTarget.paidAtMs ?? receiptTarget.createdAtMs)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">পরিমাণ</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatBdt(receiptTarget.amountPaisa)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">TrxID</span>
                <span className="font-mono text-slate-900">{receiptTarget.trxId || '—'}</span>
              </div>
              {receiptTarget.subscriptionResultingPaidUntilMs && (
                <div className="flex justify-between">
                  <span className="text-slate-500">নতুন পেইড মেয়াদ</span>
                  <span className="font-semibold text-emerald-700">
                    {formatBanglaDateTime(receiptTarget.subscriptionResultingPaidUntilMs)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => setReceiptTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                বন্ধ করুন
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                <Printer className="w-3.5 h-3.5" />
                প্রিন্ট / PDF সংরক্ষণ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password / Google Re-auth before Plan / Add-on Checkout */}
      <ReauthModal
        open={reauthForCheckout}
        actionTitle="ক্রয় নিশ্চিত করুন"
        actionDescription="প্ল্যান আপগ্রেড বা অ্যাড-অন কেনার আগে নিরাপত্তার জন্য পুনরায় যাচাই করুন।"
        onCancel={() => setReauthForCheckout(false)}
        onConfirmed={executeCheckoutAfterReauth}
      />
    </div>
  );
};
