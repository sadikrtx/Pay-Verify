import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { PaymentLogo } from './PaymentLogo';
import { PayVerifyBrandMark } from './PayVerifyBrandMark';
import { HostedPaymentPage } from './HostedPaymentPage';
import {
  mapFunnelFailureReasonBn,
  validateFunnelBuyerContact,
  type FunnelStatusBanner,
} from '../lib/funnelLogic';
import { formatPlanPriceBn } from '../lib/planEngine';
import {
  createPublicSubscriptionCheckout,
  fetchPublicSubscriptionStatus,
  normalizeWorkerBaseUrl,
  type PublicSubscriptionCheckoutResponse,
} from '../lib/workerClient';
import {
  WALLET_METHODS,
  type PayPlanDoc,
  type PayPlatformConfig,
  type WalletMethod,
} from '../types/payment';

interface FunnelCheckoutStepProps {
  plan: PayPlanDoc;
  initialBillingCycle: 'monthly' | 'yearly';
  platformConfig: PayPlatformConfig;
  onBackToPlans: (banner?: FunnelStatusBanner) => void;
  onPaymentVerified: (result: {
    purchaseId: string;
    claimToken: string;
    planName: string;
    buyerName: string;
  }) => void;
}

export const FunnelCheckoutStep: React.FC<FunnelCheckoutStepProps> = ({
  plan,
  initialBillingCycle,
  platformConfig,
  onBackToPlans,
  onPaymentVerified,
}) => {
  const hasYearly = Boolean(plan.priceYearly && plan.priceYearly > 0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(
    initialBillingCycle === 'yearly' && hasYearly ? 'yearly' : 'monthly'
  );
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [method, setMethod] = useState<WalletMethod>('bkash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Worker-created session + purchase record (pending until Worker verifies SMS)
  const [activeCheckout, setActiveCheckout] = useState<PublicSubscriptionCheckoutResponse | null>(
    null
  );
  const [verifyingNote, setVerifyingNote] = useState<string | null>(null);

  const selectedPrice =
    billingCycle === 'yearly' && hasYearly ? plan.priceYearly || 0 : plan.priceMonthly || 0;

  // Poll Worker for server-verified status + server-issued single-use claimToken
  // NEVER marks paid in the browser!
  useEffect(() => {
    if (!activeCheckout) return;
    let cancelled = false;
    const workerBase = normalizeWorkerBaseUrl(platformConfig.workerBaseUrl);
    if (!workerBase) return;

    const pollOnce = async () => {
      try {
        const res = await fetchPublicSubscriptionStatus(
          workerBase,
          activeCheckout.purchaseId,
          activeCheckout.sessionId
        );
        if (cancelled) return;

        if (res.status === 'paid' && res.claimToken) {
          onPaymentVerified({
            purchaseId: activeCheckout.purchaseId,
            claimToken: res.claimToken,
            planName: res.planName || plan.name,
            buyerName: buyerName.trim(),
          });
          return;
        }
        if (res.status === 'paid' && !res.claimToken) {
          setVerifyingNote('পেমেন্ট নিশ্চিত হয়েছে — অ্যাকাউন্ট তৈরির লিংক প্রস্তুত হচ্ছে...');
          return;
        }
        if (res.status === 'expired') {
          onBackToPlans({
            tone: 'error',
            ...mapFunnelFailureReasonBn('expired'),
          });
          return;
        }
        if (res.status === 'cancelled') {
          onBackToPlans({
            tone: 'info',
            message: 'পেমেন্ট বাতিল করা হয়েছে। চাইলে আবার শুরু করতে পারেন।',
          });
          return;
        }
        if (res.status === 'failed') {
          onBackToPlans({
            tone: 'error',
            ...mapFunnelFailureReasonBn(res.failureReason, {
              expectedAmountPaisa: res.expectedAmountPaisa,
              receivedAmountPaisa: res.receivedAmountPaisa,
            }),
          });
        }
      } catch {
        // Keep polling while user completes payment in HostedPaymentPage
      }
    };

    const interval = window.setInterval(() => {
      void pollOnce();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeCheckout,
    platformConfig.workerBaseUrl,
    plan.name,
    buyerName,
    onPaymentVerified,
    onBackToPlans,
  ]);

  const handleStartPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validated = validateFunnelBuyerContact(buyerName, buyerPhone);
    if (!validated.valid) {
      setError(validated.error);
      return;
    }
    if (selectedPrice <= 0) {
      setError('এই প্যাকেজের দাম এখনো সেট করা হয়নি।');
      return;
    }

    setSubmitting(true);
    try {
      const checkout = await createPublicSubscriptionCheckout(platformConfig.workerBaseUrl, {
        subscriptionStoreId: platformConfig.subscriptionStoreId || '',
        planId: plan.id,
        billingCycle,
        method,
        buyerName: validated.cleanName,
        buyerPhone: validated.cleanPhone,
        returnOrigin: typeof window !== 'undefined' ? window.location.origin : '',
      });
      setActiveCheckout(checkout);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'পেমেন্ট সেশন তৈরি করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  // Once Worker has created the pending purchase + PayVerify session, show the real HostedPaymentPage
  if (activeCheckout) {
    return (
      <div className="min-h-screen bg-[#FFF9EC] pb-10" data-testid="step3-hosted-payment-wrap">
        <div className="bg-[#0B3B36] text-white border-b border-white/10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="w-4 h-4 text-[#F2A007] shrink-0" />
              <span>
                ধাপ ৩/৫: {plan.name} প্যাকেজ পেমেন্ট ({formatPlanPriceBn(selectedPrice)})
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onBackToPlans({
                  tone: 'info',
                  message: 'পেমেন্ট সম্পন্ন না করেই ফিরে এসেছেন। চাইলে আবার চেষ্টা করতে পারেন।',
                })
              }
              className="underline text-teal-100 hover:text-white font-semibold"
            >
              প্যাকেজে ফিরুন
            </button>
          </div>
        </div>

        {verifyingNote && (
          <div className="max-w-lg mx-auto px-4 pt-4">
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-semibold flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{verifyingNote}</span>
            </div>
          </div>
        )}

        <HostedPaymentPage
          sessionId={activeCheckout.sessionId}
          workerBaseUrlOverride={platformConfig.workerBaseUrl}
          embedded
          onTerminalStatus={(status, info) => {
            if (status === 'cancelled') {
              onBackToPlans({
                tone: 'info',
                message: 'পেমেন্ট বাতিল করা হয়েছে। চাইলে আবার চেষ্টা করতে পারেন।',
              });
            } else if (status === 'expired') {
              onBackToPlans({
                tone: 'error',
                ...mapFunnelFailureReasonBn('expired'),
              });
            } else if (status === 'failed') {
              onBackToPlans({
                tone: 'error',
                ...mapFunnelFailureReasonBn(info?.failureReason),
              });
            }
            // Note: on 'paid', we deliberately wait for Worker's /subscription/purchase/:id/status
            // to deliver the single-use server-issued claimToken (never trust client alone).
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF9EC] text-[#142523]" data-testid="step3-checkout-form">
      <header className="bg-[#FFF9EC] border-b border-[#E8DEC8]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <PayVerifyBrandMark
            logoUrl={platformConfig.brandLogoUrl}
            logoDataUrl={platformConfig.brandLogoDataUrl}
            variant="dark"
            size="md"
          />
          <button
            type="button"
            onClick={() => onBackToPlans()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold text-[#0B3B36] hover:bg-[#0B3B36]/8 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            প্যাকেজ বদলান
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="bg-white rounded-3xl border border-[#E8DEC8] shadow-sm overflow-hidden">
          {/* Selected Plan Banner */}
          <div className="bg-gradient-to-r from-[#0B3B36] to-[#0F766E] text-white p-6 space-y-2">
            <div className="text-xs font-semibold text-teal-100">
              নির্বাচিত প্যাকেজ · পেমেন্ট যাচাইয়ের পর অ্যাকাউন্ট তৈরি হবে
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-2xl font-bold">{plan.name}</h1>
              <div className="text-2xl font-bold text-[#FDE68A] tabular-nums">
                {formatPlanPriceBn(selectedPrice)}
                <span className="text-sm font-semibold text-teal-100">
                  {' '}
                  / {billingCycle === 'yearly' ? 'বছর' : 'মাস'}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleStartPayment} className="p-6 sm:p-7 space-y-5">
            {error && (
              <div
                className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-start gap-2.5"
                data-testid="step3-error"
              >
                <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {hasYearly && (
              <div>
                <div className="text-xs font-bold text-[#39504D] mb-2">বিলিং সময়কাল</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`min-h-[46px] px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                      billingCycle === 'monthly'
                        ? 'bg-[#0B3B36] text-white border-[#0B3B36]'
                        : 'bg-[#FFF9EC] text-[#142523] border-[#E8DEC8]'
                    }`}
                  >
                    মাসিক ({formatPlanPriceBn(plan.priceMonthly)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('yearly')}
                    className={`min-h-[46px] px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                      billingCycle === 'yearly'
                        ? 'bg-[#0B3B36] text-white border-[#0B3B36]'
                        : 'bg-[#FFF9EC] text-[#142523] border-[#E8DEC8]'
                    }`}
                  >
                    বাৎসরিক ({formatPlanPriceBn(plan.priceYearly)})
                  </button>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="funnel-buyer-name"
                className="block text-sm font-bold text-[#0B3B36] mb-1.5"
              >
                আপনার নাম
              </label>
              <div className="relative">
                <User className="w-4.5 h-4.5 text-[#556B68] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="funnel-buyer-name"
                  type="text"
                  required
                  maxLength={80}
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="যেমন: তানভীর আহমেদ"
                  className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-xl border border-[#DDD2BC] bg-white text-base text-[#142523] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="funnel-buyer-phone"
                className="block text-sm font-bold text-[#0B3B36] mb-1.5"
              >
                মোবাইল নম্বর
              </label>
              <div className="relative">
                <Phone className="w-4.5 h-4.5 text-[#556B68] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="funnel-buyer-phone"
                  type="tel"
                  required
                  maxLength={16}
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="017XXXXXXXX"
                  className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-xl border border-[#DDD2BC] bg-white text-base font-mono text-[#142523] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-bold text-[#0B3B36] mb-2">পেমেন্ট মাধ্যম বেছে নিন</div>
              <div className="grid grid-cols-2 gap-2.5">
                {WALLET_METHODS.map((m) => {
                  const selected = method === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`min-h-[54px] px-3 py-2.5 rounded-2xl border-2 flex items-center justify-center transition-all ${
                        selected
                          ? 'border-[#0F766E] bg-teal-50/70 shadow-xs'
                          : 'border-[#E8DEC8] bg-white hover:border-[#0F766E]/40'
                      }`}
                    >
                      <PaymentLogo method={m} size="sm" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FFF9EC] border border-[#EFE3C8] text-xs sm:text-sm text-[#39504D] flex items-start gap-2.5">
              <CheckCircle2 className="w-4.5 h-4.5 text-[#0F766E] shrink-0 mt-0.5" />
              <span>
                পেমেন্ট আমাদের অটো-ভেরিফিকেশন সিস্টেমে নিশ্চিত হওয়ার পরই আপনার ইমেইল ও পাসওয়ার্ড সেট করার ধাপ খুলবে।
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              data-testid="step3-proceed-pay-btn"
              className="w-full min-h-[50px] px-6 py-3.5 rounded-2xl bg-[#F2A007] hover:bg-[#DC9005] text-[#1A1611] font-bold text-base shadow-sm disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  পেমেন্ট সেশন তৈরি হচ্ছে...
                </>
              ) : (
                <>
                  পেমেন্টে এগিয়ে যান
                  <ArrowRight className="w-4.5 h-4.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
