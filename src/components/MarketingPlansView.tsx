import React, { useState } from 'react';
import { ArrowLeft, Check, Minus, Sparkles } from 'lucide-react';
import { PayVerifyBrandMark } from './PayVerifyBrandMark';
import { usePayVerify } from '../lib/store';
import {
  PLAN_FEATURE_LABELS_BN,
  formatLimitBn,
  formatPlanPriceBn,
} from '../lib/planEngine';
import { WALLET_METHODS, type PayPlanDoc } from '../types/payment';
import { PaymentLogo } from './PaymentLogo';

interface MarketingPlansViewProps {
  onBack?: () => void;
  backLabel?: string;
  onSelectPlan?: (plan: PayPlanDoc, billingCycle: 'monthly' | 'yearly') => void;
  actionLabel?: string;
  currentPlanId?: string | null;
}

/**
 * Dynamic public & in-app plan comparison page generated purely from visible non-archived payPlans.
 * Zero hard-coded tier names, limits, or prices.
 */
export const MarketingPlansView: React.FC<MarketingPlansViewProps> = ({
  onBack,
  backLabel = 'ফিরে যান',
  onSelectPlan,
  actionLabel = 'শুরু করুন',
  currentPlanId,
}) => {
  const { visibleMarketingPlans } = usePayVerify();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const anyYearlyOffered = visibleMarketingPlans.some(
    (p) => typeof p.priceYearly === 'number' && p.priceYearly > 0
  );

  return (
    <div className="min-h-screen bg-[#F6F8FB] pt-8 pb-24 px-4 sm:px-6 lg:px-8" data-testid="marketing-plans-page">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" />
                {backLabel}
              </button>
            )}
            <PayVerifyBrandMark size="md" />
          </div>

          {anyYearlyOffered && (
            <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                মাসিক
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  billingCycle === 'yearly'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                বাৎসরিক
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            প্ল্যান ও মূল্য তালিকা
          </h1>
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="marketing-payment-strip"
            aria-label="সমর্থিত পেমেন্ট মাধ্যম"
          >
            <span className="text-xs font-semibold text-slate-500 mr-1">সমর্থিত মাধ্যম:</span>
            {WALLET_METHODS.map((method) => (
              <PaymentLogo key={method} method={method} size="md" />
            ))}
          </div>
        </div>

        {visibleMarketingPlans.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
            বর্তমানে কোনো প্রদর্শিত প্ল্যান পাওয়া যায়নি।
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleMarketingPlans.map((plan) => {
              const rawPrice =
                billingCycle === 'yearly' && plan.priceYearly && plan.priceYearly > 0
                  ? plan.priceYearly
                  : plan.priceMonthly;
              const priceLabel = formatPlanPriceBn(rawPrice);
              const hasPrice = Boolean(rawPrice && rawPrice > 0);
              const isCurrent = currentPlanId === plan.id;

              return (
                <div
                  key={plan.id}
                  data-testid={`plan-card-${plan.id}`}
                  className={`bg-white rounded-2xl border p-6 flex flex-col justify-between gap-6 transition-all ${
                    plan.highlight
                      ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-md'
                      : 'border-slate-200/90 shadow-xs'
                  }`}
                >
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {plan.highlight && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-teal-600 text-white text-[11px] font-bold">
                            <Sparkles className="w-3 h-3" />
                            জনপ্রিয়
                          </span>
                        )}
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                            বর্তমান
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pb-4 border-b border-slate-100">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`font-extrabold tabular-nums ${
                            hasPrice ? 'text-3xl text-slate-900' : 'text-lg text-slate-500'
                          }`}
                        >
                          {priceLabel}
                        </span>
                        {hasPrice && (
                          <span className="text-xs font-medium text-slate-500">
                            / {billingCycle === 'yearly' && plan.priceYearly ? 'বছর' : 'মাস'}
                          </span>
                        )}
                      </div>
                      {billingCycle === 'monthly' &&
                        plan.priceYearly !== null &&
                        plan.priceYearly > 0 && (
                          <div className="text-xs text-teal-700 font-medium mt-1">
                            বাৎসরিক: {formatPlanPriceBn(plan.priceYearly)} / বছর
                          </div>
                        )}
                    </div>

                    {/* Numeric limits (0 => আনলিমিটেড) */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                        <div className="text-[11px] text-slate-500">স্টোর</div>
                        <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                          {formatLimitBn(plan.storeLimit)}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                        <div className="text-[11px] text-slate-500">ডিভাইস</div>
                        <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                          {formatLimitBn(plan.deviceLimit)}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                        <div className="text-[11px] text-slate-500">দৈনিক সেশন</div>
                        <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                          {formatLimitBn(plan.dailySessionCap)}
                        </div>
                      </div>
                    </div>

                    {/* Feature Matrix */}
                    <ul className="space-y-2 text-xs">
                      <li className="flex items-center gap-2 text-slate-700">
                        <span className="w-4 h-4 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                        <span>
                          টিম মেম্বার:{' '}
                          <strong className="text-slate-900">
                            {plan.features.members === 0
                              ? 'শুধু মালিক'
                              : `${plan.features.members.toLocaleString('bn-BD')} জন`}
                          </strong>
                        </span>
                      </li>
                      {PLAN_FEATURE_LABELS_BN.map((feat) => {
                        const included = Boolean(plan.features[feat.key]);
                        return (
                          <li
                            key={feat.key}
                            className={`flex items-center gap-2 ${
                              included ? 'text-slate-700' : 'text-slate-400'
                            }`}
                          >
                            {included ? (
                              <span className="w-4 h-4 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                                <Check className="w-3 h-3" />
                              </span>
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                                <Minus className="w-3 h-3" />
                              </span>
                            )}
                            <span>{feat.label}</span>
                          </li>
                        );
                      })}
                      {plan.customPerks.map((perk, idx) => (
                        <li key={`${plan.id}-perk-${idx}`} className="flex items-center gap-2 text-slate-800 font-medium">
                          <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3" />
                          </span>
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {onSelectPlan && (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectPlan(
                          plan,
                          billingCycle === 'yearly' && plan.priceYearly && plan.priceYearly > 0
                            ? 'yearly'
                            : 'monthly'
                        )
                      }
                      className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${
                        plan.highlight
                          ? 'bg-teal-600 text-white hover:bg-teal-700'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {isCurrent ? 'এই প্ল্যান নবায়ন করুন' : actionLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
