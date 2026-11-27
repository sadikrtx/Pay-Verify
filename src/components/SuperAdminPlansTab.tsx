import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Layers,
  PackagePlus,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { usePayVerify, type AddonDraftInput, type CouponDraftInput, type PlanDraftInput } from '../lib/store';
import { normalizePaymentAccounts } from '../lib/checkoutFlow';
import {
  ADDON_KIND_LABELS_BN,
  PLAN_FEATURE_LABELS_BN,
  formatLimitBn,
  formatPlanPriceBn,
} from '../lib/planEngine';
import { formatBanglaDateTime } from '../lib/money';
import type { AddonKind, PayAddonDoc, PayCouponDoc, PayPlanDoc, PayPlanFeatures } from '../types/payment';

const EMPTY_FEATURES: PayPlanFeatures = {
  rotation: false,
  branding: false,
  embedded: false,
  apiAccess: false,
  woocommerce: false,
  analytics: false,
  csvExport: false,
  manualMatch: true,
  members: 0,
};

function makeEmptyPlanDraft(nextSortOrder: number): PlanDraftInput {
  return {
    name: '',
    priceMonthly: 0,
    priceYearly: 0,
    storeLimit: 1,
    dailySessionCap: 100,
    deviceLimit: 1,
    features: { ...EMPTY_FEATURES },
    customPerks: [],
    visibleOnMarketing: true,
    highlight: false,
    archived: false,
    sortOrder: nextSortOrder,
  };
}

export const SuperAdminPlansTab: React.FC = () => {
  const {
    plans,
    addons,
    coupons,
    allStores,
    account,
    canAdmin,
    platformConfig,
    adminSavePlatformSettings,
    adminSavePlan,
    adminArchivePlan,
    adminDeletePlan,
    adminSaveAddon,
    adminSaveCoupon,
  } = usePayVerify();

  const canViewPlans = canAdmin('plans', 'view');
  const canCreatePlans = canAdmin('plans', 'create');
  const canEditPlans = canAdmin('plans', 'edit');
  const canDeletePlans = canAdmin('plans', 'delete');
  const isSuperAdmin = Boolean(account?.isSuperAdmin);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Platform trialPlanId & subscriptionStoreId config
  const [trialPlanId, setTrialPlanId] = useState(platformConfig.trialPlanId);
  const [subscriptionStoreId, setSubscriptionStoreId] = useState(
    platformConfig.subscriptionStoreId || ''
  );
  const [cfgSaving, setCfgSaving] = useState(false);

  useEffect(() => {
    setTrialPlanId(platformConfig.trialPlanId);
    setSubscriptionStoreId(platformConfig.subscriptionStoreId || '');
  }, [platformConfig.trialPlanId, platformConfig.subscriptionStoreId]);

  // Plan Create / Edit Modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | undefined>(undefined);
  const [planDraft, setPlanDraft] = useState<PlanDraftInput>(() => makeEmptyPlanDraft(1));
  const [customPerksText, setCustomPerksText] = useState('');
  const [planNote, setPlanNote] = useState('');
  const [planSaving, setPlanSaving] = useState(false);

  // Add-on Create / Edit Modal
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [editingAddonId, setEditingAddonId] = useState<string | undefined>(undefined);
  const [addonDraft, setAddonDraft] = useState<AddonDraftInput>({
    name: '',
    kind: '+store',
    amount: 1,
    price: 0,
    active: true,
    sortOrder: 1,
  });
  const [addonSaving, setAddonSaving] = useState(false);

  // Coupon Create / Edit Modal
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | undefined>(undefined);
  const [couponCode, setCouponCode] = useState('');
  const [couponPercent, setCouponPercent] = useState(10);
  const [couponExpires, setCouponExpires] = useState('');
  const [couponMaxUses, setCouponMaxUses] = useState(0);
  const [couponPlanId, setCouponPlanId] = useState('');
  const [couponActive, setCouponActive] = useState(true);
  const [couponSaving, setCouponSaving] = useState(false);

  const nonArchivedPlans = plans.filter((p) => !p.archived);
  const adminOwnStores = allStores.filter(
    (s) => s.type === 'own' || (account && s.accountId === account.id)
  );

  const flashNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((prev) => (prev === msg ? null : prev)), 4000);
  };

  const handleSavePlatformPlanConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCfgSaving(true);
    try {
      await adminSavePlatformSettings(
        {
          trialPlanId,
          subscriptionStoreId: subscriptionStoreId || null,
        },
        'ট্রায়াল প্ল্যান ও সাবস্ক্রিপশন স্টোর সেটিংস আপডেট'
      );
      flashNotice('প্ল্যাটফর্ম প্ল্যান সেটিংস সংরক্ষিত হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setCfgSaving(false);
    }
  };

  const openNewPlanModal = () => {
    const nextOrder = plans.length > 0 ? Math.max(...plans.map((p) => p.sortOrder)) + 1 : 1;
    setEditingPlanId(undefined);
    setPlanDraft(makeEmptyPlanDraft(nextOrder));
    setCustomPerksText('');
    setPlanNote('');
    setPlanModalOpen(true);
    setError(null);
  };

  const openEditPlanModal = (plan: PayPlanDoc) => {
    setEditingPlanId(plan.id);
    setPlanDraft({
      name: plan.name,
      priceMonthly: plan.priceMonthly ?? 0,
      priceYearly: plan.priceYearly ?? 0,
      storeLimit: plan.storeLimit,
      dailySessionCap: plan.dailySessionCap,
      deviceLimit: plan.deviceLimit,
      features: { ...plan.features },
      customPerks: [...plan.customPerks],
      visibleOnMarketing: plan.visibleOnMarketing,
      highlight: plan.highlight,
      archived: plan.archived,
      sortOrder: plan.sortOrder,
    });
    setCustomPerksText(plan.customPerks.join('\n'));
    setPlanNote('');
    setPlanModalOpen(true);
    setError(null);
  };

  const openDuplicatePlanModal = (plan: PayPlanDoc) => {
    const nextOrder = plans.length > 0 ? Math.max(...plans.map((p) => p.sortOrder)) + 1 : 1;
    setEditingPlanId(undefined);
    setPlanDraft({
      name: `${plan.name} (কপি)`,
      priceMonthly: plan.priceMonthly ?? 0,
      priceYearly: plan.priceYearly ?? 0,
      storeLimit: plan.storeLimit,
      dailySessionCap: plan.dailySessionCap,
      deviceLimit: plan.deviceLimit,
      features: { ...plan.features },
      customPerks: [...plan.customPerks],
      visibleOnMarketing: false,
      highlight: false,
      archived: false,
      sortOrder: nextOrder,
    });
    setCustomPerksText(plan.customPerks.join('\n'));
    setPlanNote(`${plan.name} থেকে ডুপ্লিকেট`);
    setPlanModalOpen(true);
    setError(null);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPlanSaving(true);
    try {
      const perks = customPerksText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      await adminSavePlan(
        { ...planDraft, customPerks: perks },
        editingPlanId,
        planNote.trim() || undefined
      );
      setPlanModalOpen(false);
      flashNotice(editingPlanId ? 'প্ল্যান আপডেট হয়েছে।' : 'নতুন প্ল্যান তৈরি হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'প্ল্যান সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setPlanSaving(false);
    }
  };

  const handleToggleArchive = async (plan: PayPlanDoc) => {
    setError(null);
    try {
      await adminArchivePlan(plan.id, !plan.archived);
      flashNotice(!plan.archived ? `${plan.name} আর্কাইভ করা হয়েছে।` : `${plan.name} পুনরায় সক্রিয় করা হয়েছে।`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'আর্কাইভ পরিবর্তন ব্যর্থ হয়েছে।');
    }
  };

  const handleDeletePlan = async (plan: PayPlanDoc) => {
    setError(null);
    try {
      await adminDeletePlan(plan.id);
      flashNotice(`"${plan.name}" প্ল্যানটি মুছে ফেলা হয়েছে।`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'প্ল্যান মুছে ফেলা যায়নি।');
    }
  };

  const handleQuickToggle = async (
    plan: PayPlanDoc,
    field: 'visibleOnMarketing' | 'highlight'
  ) => {
    setError(null);
    try {
      const nextVal = !plan[field];
      await adminSavePlan(
        {
          name: plan.name,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          storeLimit: plan.storeLimit,
          dailySessionCap: plan.dailySessionCap,
          deviceLimit: plan.deviceLimit,
          features: plan.features,
          customPerks: plan.customPerks,
          visibleOnMarketing: field === 'visibleOnMarketing' ? nextVal : plan.visibleOnMarketing,
          highlight: field === 'highlight' ? nextVal : plan.highlight,
          archived: plan.archived,
          sortOrder: plan.sortOrder,
        },
        plan.id,
        field === 'highlight' ? 'জনপ্রিয় ব্যাজ পরিবর্তন' : 'মার্কেটিং প্রদর্শন পরিবর্তন'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'আপডেট ব্যর্থ হয়েছে।');
    }
  };

  const handleReorderPlan = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= plans.length) return;
    const current = plans[index];
    const swap = plans[targetIdx];
    setError(null);
    try {
      const currentOrder = current.sortOrder;
      const swapOrder = swap.sortOrder === currentOrder ? currentOrder + delta : swap.sortOrder;
      await Promise.all([
        adminSavePlan(
          {
            name: current.name,
            priceMonthly: current.priceMonthly,
            priceYearly: current.priceYearly,
            storeLimit: current.storeLimit,
            dailySessionCap: current.dailySessionCap,
            deviceLimit: current.deviceLimit,
            features: current.features,
            customPerks: current.customPerks,
            visibleOnMarketing: current.visibleOnMarketing,
            highlight: current.highlight,
            archived: current.archived,
            sortOrder: swapOrder,
          },
          current.id,
          'প্ল্যানের ক্রম পরিবর্তন'
        ),
        adminSavePlan(
          {
            name: swap.name,
            priceMonthly: swap.priceMonthly,
            priceYearly: swap.priceYearly,
            storeLimit: swap.storeLimit,
            dailySessionCap: swap.dailySessionCap,
            deviceLimit: swap.deviceLimit,
            features: swap.features,
            customPerks: swap.customPerks,
            visibleOnMarketing: swap.visibleOnMarketing,
            highlight: swap.highlight,
            archived: swap.archived,
            sortOrder: currentOrder,
          },
          swap.id,
          'প্ল্যানের ক্রম পরিবর্তন'
        ),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ক্রম পরিবর্তন ব্যর্থ হয়েছে।');
    }
  };

  // Add-on Handlers
  const openAddonModal = (addon?: PayAddonDoc) => {
    if (addon) {
      setEditingAddonId(addon.id);
      setAddonDraft({
        name: addon.name,
        kind: addon.kind,
        amount: addon.amount,
        price: addon.price,
        active: addon.active,
        sortOrder: addon.sortOrder,
      });
    } else {
      setEditingAddonId(undefined);
      setAddonDraft({
        name: '',
        kind: '+store',
        amount: 2,
        price: 0,
        active: true,
        sortOrder: addons.length + 1,
      });
    }
    setAddonModalOpen(true);
    setError(null);
  };

  const handleSaveAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAddonSaving(true);
    try {
      await adminSaveAddon(addonDraft, editingAddonId);
      setAddonModalOpen(false);
      flashNotice(editingAddonId ? 'অ্যাড-অন আপডেট হয়েছে।' : 'নতুন অ্যাড-অন তৈরি হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'অ্যাড-অন সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setAddonSaving(false);
    }
  };

  // Coupon Handlers
  const openCouponModal = (coupon?: PayCouponDoc) => {
    if (coupon) {
      setEditingCouponId(coupon.id);
      setCouponCode(coupon.code);
      setCouponPercent(coupon.percentOff);
      setCouponExpires(
        coupon.expiresAtMs ? new Date(coupon.expiresAtMs).toISOString().slice(0, 10) : ''
      );
      setCouponMaxUses(coupon.maxUses);
      setCouponPlanId(coupon.planId || '');
      setCouponActive(coupon.active);
    } else {
      setEditingCouponId(undefined);
      setCouponCode('');
      setCouponPercent(15);
      setCouponExpires('');
      setCouponMaxUses(0);
      setCouponPlanId('');
      setCouponActive(true);
    }
    setCouponModalOpen(true);
    setError(null);
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCouponSaving(true);
    try {
      const draft: CouponDraftInput = {
        code: couponCode.trim().toUpperCase(),
        percentOff: couponPercent,
        expiresAtMs: couponExpires ? new Date(`${couponExpires}T23:59:59`).getTime() : null,
        maxUses: couponMaxUses,
        planId: couponPlanId || null,
        active: couponActive,
      };
      await adminSaveCoupon(draft, editingCouponId);
      setCouponModalOpen(false);
      flashNotice(editingCouponId ? 'কুপন আপডেট হয়েছে।' : 'নতুন কুপন তৈরি হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'কুপন সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setCouponSaving(false);
    }
  };

  if (!canViewPlans) {
    return null;
  }

  return (
    <div className="space-y-6" data-testid="super-admin-plans-tab">
      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Subscription Payment Store Settings (Super Admin only) */}
      {isSuperAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4" data-testid="subscription-payment-store-section">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-slate-900">সাবস্ক্রিপশন পেমেন্ট</h2>
              <p className="text-xs text-slate-500">গ্রাহকরা প্ল্যান কেনার সময় যে স্টোর ও নম্বরে পেমেন্ট করবেন</p>
            </div>
            {subscriptionStoreId ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                স্টোর নির্ধারণ করা আছে
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                স্টোর নির্ধারণ করা হয়নি
              </span>
            )}
          </div>

          <form onSubmit={handleSavePlatformPlanConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  সাবস্ক্রিপশন পেমেন্ট স্টোর (সাবস্ক্রিপশন পেমেন্ট স্টোর)
                </label>
                <select
                  value={subscriptionStoreId}
                  onChange={(e) => setSubscriptionStoreId(e.target.value)}
                  data-testid="subscription-store-select"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white font-medium text-slate-900"
                >
                  <option value="">— স্টোর নির্বাচন করুন —</option>
                  {adminOwnStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type === 'own' ? 'নিজের স্টোর' : 'মার্চেন্ট'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ট্রায়াল অ্যাকাউন্টের ডিফল্ট প্ল্যান
                </label>
                <select
                  value={trialPlanId}
                  onChange={(e) => setTrialPlanId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white text-slate-900"
                >
                  <option value="">কোনো ফ্রি ট্রায়াল নেই (বন্ধ)</option>
                  {nonArchivedPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Store Preview Box */}
            {subscriptionStoreId && (() => {
              const st = allStores.find((s) => s.id === subscriptionStoreId);
              if (!st) {
                return (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    নির্বাচিত স্টোরটি ডাটাবেজে পাওয়া যায়নি বা মুছে ফেলা হয়েছে। অন্য স্টোর নির্বাচন করুন।
                  </div>
                );
              }
              const acts = normalizePaymentAccounts(st.paymentAccounts, st.numbers);
              const activeMethods = Object.entries(acts).filter(([_, entries]) => entries.some((e) => e.active));
              return (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>নির্বাচিত স্টোর: {st.name}</span>
                    <span className="text-teal-700 font-mono">ID: {st.id}</span>
                  </div>
                  <div className="text-xs text-slate-600 flex flex-wrap gap-3">
                    {activeMethods.length === 0 ? (
                      <span className="text-rose-600 font-medium">⚠️ এই স্টোরে কোনো পেমেন্ট নম্বর চালু নেই!</span>
                    ) : (
                      activeMethods.map(([method, entries]) => {
                        const activeEntries = entries.filter((e) => e.active);
                        return (
                          <div key={method} className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80">
                            <strong className="uppercase text-slate-800">{method}:</strong>{' '}
                            {activeEntries.map((en) => {
                              const raw = en.number;
                              const masked = raw.length > 6 ? `${raw.slice(0, 4)}***${raw.slice(-3)}` : raw;
                              return <span key={en.number} className="font-mono text-slate-700 ml-1">{masked}</span>;
                            })}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={cfgSaving}
                data-testid="save-subscription-store-btn"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {cfgSaving ? 'সংরক্ষণ হচ্ছে...' : 'সেটিংস সংরক্ষণ করুন'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Plans Management Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">প্ল্যানসমূহ</h2>
          </div>
          {canCreatePlans && (
            <button
              type="button"
              onClick={openNewPlanModal}
              data-testid="create-plan-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
            >
              <Plus className="w-4 h-4" />
              নতুন প্ল্যান
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {plans.map((plan, idx) => (
            <div
              key={plan.id}
              className={`p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                plan.archived ? 'bg-slate-50/70 opacity-75' : 'bg-white'
              }`}
            >
              <div className="space-y-2 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-slate-900">{plan.name}</span>
                  {plan.highlight && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-600 text-white text-[11px] font-bold">
                      <Sparkles className="w-3 h-3" />
                      জনপ্রিয়
                    </span>
                  )}
                  {plan.archived && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[11px] font-bold">
                      আর্কাইভকৃত
                    </span>
                  )}
                  {!plan.visibleOnMarketing && !plan.archived && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
                      মার্কেটিং পেজে লুকানো
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>
                    মাসিক: <strong className="text-slate-900">{formatPlanPriceBn(plan.priceMonthly)}</strong>
                  </span>
                  <span>
                    বাৎসরিক:{' '}
                    <strong className="text-slate-900">
                      {plan.priceYearly && plan.priceYearly > 0
                        ? formatPlanPriceBn(plan.priceYearly)
                        : 'প্রযোজ্য নয়'}
                    </strong>
                  </span>
                  <span>
                    স্টোর: <strong className="text-slate-900">{formatLimitBn(plan.storeLimit)}</strong>
                  </span>
                  <span>
                    ডিভাইস: <strong className="text-slate-900">{formatLimitBn(plan.deviceLimit)}</strong>
                  </span>
                  <span>
                    দৈনিক সেশন:{' '}
                    <strong className="text-slate-900">{formatLimitBn(plan.dailySessionCap)}</strong>
                  </span>
                  <span>
                    মেম্বার:{' '}
                    <strong className="text-slate-900">
                      {plan.features.members.toLocaleString('bn-BD')}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {canEditPlans && (
                  <>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void handleReorderPlan(idx, -1)}
                      title="উপরে নিন"
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === plans.length - 1}
                      onClick={() => void handleReorderPlan(idx, 1)}
                      title="নিচে নিন"
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleQuickToggle(plan, 'visibleOnMarketing')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {plan.visibleOnMarketing ? (
                        <>
                          <Eye className="w-3.5 h-3.5 text-teal-700" />
                          দৃশ্যমান
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          লুকানো
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleQuickToggle(plan, 'highlight')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                        plan.highlight
                          ? 'bg-teal-50 border-teal-200 text-teal-800'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      জনপ্রিয়
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditPlanModal(plan)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      সম্পাদনা
                    </button>
                  </>
                )}
                {canCreatePlans && (
                  <button
                    type="button"
                    onClick={() => openDuplicatePlanModal(plan)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    ডুপ্লিকেট
                  </button>
                )}
                {canDeletePlans && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleToggleArchive(plan)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
                        plan.archived
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                          : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      {plan.archived ? (
                        <>
                          <ArchiveRestore className="w-3.5 h-3.5" />
                          সক্রিয় করুন
                        </>
                      ) : (
                        <>
                          <Archive className="w-3.5 h-3.5" />
                          আর্কাইভ
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeletePlan(plan)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      মুছুন
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add-on Packs Section (Super Admin only) */}
      {isSuperAdmin && (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-indigo-700" />
            <h2 className="text-base font-bold text-slate-900">অ্যাড-অন প্যাকসমূহ</h2>
          </div>
          <button
            type="button"
            onClick={() => openAddonModal()}
            data-testid="create-addon-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            নতুন অ্যাড-অন
          </button>
        </div>

        {addons.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            এখনো কোনো অ্যাড-অন প্যাক যোগ করা হয়নি
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {addons.map((addon) => (
              <div
                key={addon.id}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{addon.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        addon.active
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {addon.active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {ADDON_KIND_LABELS_BN[addon.kind]} (+{addon.amount.toLocaleString('bn-BD')}) · মূল্য:{' '}
                    <strong className="text-slate-800">{formatPlanPriceBn(addon.price)}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openAddonModal(addon)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  সম্পাদনা
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Coupon Codes Section (Super Admin only) */}
      {isSuperAdmin && (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-900">কুপন কোডসমূহ</h2>
          </div>
          <button
            type="button"
            onClick={() => openCouponModal()}
            data-testid="create-coupon-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            নতুন কুপন
          </button>
        </div>

        {coupons.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            এখনো কোনো কুপন কোড তৈরি করা হয়নি
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">কোড</th>
                  <th className="py-3 px-5">ছাড়</th>
                  <th className="py-3 px-5">ব্যবহার</th>
                  <th className="py-3 px-5">মেয়াদ</th>
                  <th className="py-3 px-5">প্ল্যান সীমাবদ্ধতা</th>
                  <th className="py-3 px-5">অবস্থা</th>
                  <th className="py-3 px-5 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {coupons.map((c) => {
                  const restrictedPlan = c.planId ? plans.find((p) => p.id === c.planId) : null;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-5 font-mono font-bold text-slate-900">{c.code}</td>
                      <td className="py-3.5 px-5 font-bold text-emerald-700">{c.percentOff}%</td>
                      <td className="py-3.5 px-5 tabular-nums text-slate-700">
                        {c.usedCount.toLocaleString('bn-BD')} /{' '}
                        {c.maxUses === 0 ? 'আনলিমিটেড' : c.maxUses.toLocaleString('bn-BD')}
                      </td>
                      <td className="py-3.5 px-5 text-slate-600">
                        {c.expiresAtMs ? formatBanglaDateTime(c.expiresAtMs) : 'মেয়াদহীন'}
                      </td>
                      <td className="py-3.5 px-5 text-slate-600">
                        {restrictedPlan ? restrictedPlan.name : 'সব প্ল্যান'}
                      </td>
                      <td className="py-3.5 px-5">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold border ${
                            c.active
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          {c.active ? 'সক্রিয়' : 'বন্ধ'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => openCouponModal(c)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          সম্পাদনা
                        </button>
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

      {/* Plan Create / Edit Modal */}
      {planModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingPlanId ? 'প্ল্যান সম্পাদনা করুন' : 'নতুন প্ল্যান তৈরি করুন'}
              </h2>
              <button
                type="button"
                onClick={() => setPlanModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    প্ল্যানের নাম
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={planDraft.name}
                    onChange={(e) => setPlanDraft((p) => ({ ...p, name: e.target.value }))}
                    placeholder="যেমন: প্রো প্লাস"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    মাসিক মূল্য (৳) — ০ দিলে “দাম সেট করা হয়নি”
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={planDraft.priceMonthly ?? 0}
                    onChange={(e) =>
                      setPlanDraft((p) => ({ ...p, priceMonthly: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    বাৎসরিক মূল্য (৳) — ০ দিলে প্রযোজ্য নয়
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={planDraft.priceYearly ?? 0}
                    onChange={(e) =>
                      setPlanDraft((p) => ({ ...p, priceYearly: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    স্টোর সীমা (০ = আনলিমিটেড)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={planDraft.storeLimit}
                    onChange={(e) =>
                      setPlanDraft((p) => ({ ...p, storeLimit: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ডিভাইস সীমা (০ = আনলিমিটেড)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={planDraft.deviceLimit}
                    onChange={(e) =>
                      setPlanDraft((p) => ({ ...p, deviceLimit: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    দৈনিক সেশন সীমা (০ = আনলিমিটেড)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={planDraft.dailySessionCap}
                    onChange={(e) =>
                      setPlanDraft((p) => ({
                        ...p,
                        dailySessionCap: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    টিম মেম্বার সংখ্যা
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={planDraft.features.members}
                    onChange={(e) =>
                      setPlanDraft((p) => ({
                        ...p,
                        features: {
                          ...p.features,
                          members: Math.max(0, Number(e.target.value) || 0),
                        },
                      }))
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>
              </div>

              {/* Feature Toggles */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-700">সুবিধাসমূহ (Features)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PLAN_FEATURE_LABELS_BN.map((feat) => (
                    <label
                      key={feat.key}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs font-medium text-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={planDraft.features[feat.key]}
                        onChange={(e) =>
                          setPlanDraft((p) => ({
                            ...p,
                            features: { ...p.features, [feat.key]: e.target.checked },
                          }))
                        }
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span>{feat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom Perks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  অতিরিক্ত সুবিধা (প্রতি লাইনে একটি করে)
                </label>
                <textarea
                  rows={3}
                  value={customPerksText}
                  onChange={(e) => setCustomPerksText(e.target.value)}
                  placeholder="যেমন: অগ্রাধিকার হোয়াটসঅ্যাপ সাপোর্ট"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planDraft.visibleOnMarketing}
                    onChange={(e) =>
                      setPlanDraft((p) => ({ ...p, visibleOnMarketing: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-teal-600"
                  />
                  মার্কেটিং পেজে দেখান
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planDraft.highlight}
                    onChange={(e) =>
                      setPlanDraft((p) => ({ ...p, highlight: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-teal-600"
                  />
                  “জনপ্রিয়” ব্যাজ দিন
                </label>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    সাজানোর ক্রম (sortOrder)
                  </label>
                  <input
                    type="number"
                    value={planDraft.sortOrder}
                    onChange={(e) =>
                      setPlanDraft((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  অ্যাক্টিভিটি লগ নোট (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={planNote}
                  onChange={(e) => setPlanNote(e.target.value)}
                  placeholder="পরিবর্তনের সংক্ষিপ্ত বিবরণ"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={planSaving}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                >
                  {planSaving ? 'সংরক্ষণ হচ্ছে...' : 'প্ল্যান সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add-on Modal */}
      {addonModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingAddonId ? 'অ্যাড-অন সম্পাদনা' : 'নতুন অ্যাড-অন প্যাক'}
              </h2>
              <button
                type="button"
                onClick={() => setAddonModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAddon} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">নাম</label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={addonDraft.name}
                  onChange={(e) => setAddonDraft((a) => ({ ...a, name: e.target.value }))}
                  placeholder="যেমন: +২ অতিরিক্ত স্টোর"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ধরন</label>
                  <select
                    value={addonDraft.kind}
                    onChange={(e) =>
                      setAddonDraft((a) => ({ ...a, kind: e.target.value as AddonKind }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="+store">+স্টোর</option>
                    <option value="+device">+ডিভাইস</option>
                    <option value="+dailySessions">+দৈনিক সেশন</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">পরিমাণ</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={addonDraft.amount}
                    onChange={(e) =>
                      setAddonDraft((a) => ({ ...a, amount: Math.max(1, Number(e.target.value) || 1) }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  মূল্য (৳)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={addonDraft.price}
                  onChange={(e) =>
                    setAddonDraft((a) => ({ ...a, price: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addonDraft.active}
                  onChange={(e) => setAddonDraft((a) => ({ ...a, active: e.target.checked }))}
                  className="rounded border-slate-300 text-teal-600"
                />
                সক্রিয় রাখুন
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddonModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={addonSaving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {addonSaving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coupon Modal */}
      {couponModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingCouponId ? 'কুপন সম্পাদনা' : 'নতুন কুপন কোড'}
              </h2>
              <button
                type="button"
                onClick={() => setCouponModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  কুপন কোড (ইংরেজি অক্ষর/সংখ্যা)
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingCouponId)}
                  maxLength={32}
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="যেমন: SAVE20"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-sm uppercase disabled:bg-slate-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ছাড় (%) (১–১০০)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={couponPercent}
                    onChange={(e) => setCouponPercent(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    সর্বোচ্চ ব্যবহার (০ = আনলিমিটেড)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={couponMaxUses}
                    onChange={(e) => setCouponMaxUses(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    মেয়াদ শেষ (ঐচ্ছিক)
                  </label>
                  <input
                    type="date"
                    value={couponExpires}
                    onChange={(e) => setCouponExpires(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    নির্দিষ্ট প্ল্যান (ঐচ্ছিক)
                  </label>
                  <select
                    value={couponPlanId}
                    onChange={(e) => setCouponPlanId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="">সব প্ল্যানে প্রযোজ্য</option>
                    {nonArchivedPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={couponActive}
                  onChange={(e) => setCouponActive(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                কুপন সক্রিয় রাখুন
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCouponModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={couponSaving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {couponSaving ? 'সংরক্ষণ হচ্ছে...' : 'কুপন সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
