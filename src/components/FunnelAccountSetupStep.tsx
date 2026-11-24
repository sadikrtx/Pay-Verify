import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { PayVerifyBrandMark } from './PayVerifyBrandMark';
import {
  parseSetupAccountQuery,
  resolveConfiguredTrialPlan,
  validateAccountSetupForm,
} from '../lib/funnelLogic';
import { validateSubscriptionClaimToken } from '../lib/workerClient';
import type { PayPlanDoc, PayPlatformConfig } from '../types/payment';

interface FunnelAccountSetupStepProps {
  platformConfig: PayPlatformConfig;
  plans: PayPlanDoc[];
  /** Optional validated in-memory paid context right after Step 3 auto-advance */
  verifiedContext?: {
    purchaseId: string;
    claimToken: string;
    planName: string;
    buyerName: string;
  } | null;
  onCreateFunnelAccount: (input: {
    email: string;
    password: string;
    displayName: string;
    mode: 'paid' | 'trial';
    purchaseId?: string;
    claimToken?: string;
  }) => Promise<{ email: string; planName: string }>;
  onAccountCreated: (result: { email: string; planName: string }) => void;
  onBackToLanding: () => void;
}

function mapSignupErrorBn(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  if (code === 'auth/email-already-in-use') {
    return 'এই ইমেইল দিয়ে আগেই একটি অ্যাকাউন্ট তৈরি করা আছে। অন্য ইমেইল ব্যবহার করুন, অথবা আপনার লগইন ঠিকানায় গিয়ে লগইন করুন — কোনো সাহায্য লাগলে সাপোর্টে যোগাযোগ করুন।';
  }
  if (code === 'auth/invalid-email') {
    return 'সঠিক ইমেইল ঠিকানা দিন।';
  }
  if (code === 'auth/weak-password') {
    return 'পাসওয়ার্ডটি আরও শক্তিশালী করুন (কমপক্ষে ৬ অক্ষর)।';
  }
  if (code === 'auth/network-request-failed') {
    return 'নেটওয়ার্ক সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।';
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return 'অ্যাকাউন্ট তৈরি করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।';
}

export const FunnelAccountSetupStep: React.FC<FunnelAccountSetupStepProps> = ({
  platformConfig,
  plans,
  verifiedContext = null,
  onCreateFunnelAccount,
  onAccountCreated,
  onBackToLanding,
}) => {
  const parsedQuery = useMemo(
    () =>
      parseSetupAccountQuery(typeof window !== 'undefined' ? window.location.search : ''),
    []
  );

  const configuredTrialPlan = useMemo(
    () => resolveConfiguredTrialPlan(platformConfig, plans),
    [platformConfig, plans]
  );

  const effectivePurchaseId = verifiedContext?.purchaseId || parsedQuery.purchaseId;
  const effectiveClaimToken = verifiedContext?.claimToken || parsedQuery.claimToken;
  const isTrialMode = !effectiveClaimToken && parsedQuery.mode === 'trial';

  const [checkingToken, setCheckingToken] = useState<boolean>(
    () => !isTrialMode && Boolean(effectivePurchaseId && effectiveClaimToken)
  );
  const [tokenValid, setTokenValid] = useState<boolean>(() => Boolean(verifiedContext));
  const [resolvedPlanName, setResolvedPlanName] = useState<string>(
    verifiedContext?.planName || configuredTrialPlan?.name || ''
  );
  const [resolvedBuyerName, setResolvedBuyerName] = useState<string>(
    verifiedContext?.buyerName || ''
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server-verify the single-use claimToken on direct navigation to /setup-account?purchase=...&token=...
  useEffect(() => {
    if (isTrialMode) {
      setCheckingToken(false);
      setTokenValid(Boolean(configuredTrialPlan));
      if (configuredTrialPlan) {
        setResolvedPlanName(configuredTrialPlan.name);
      }
      return;
    }

    if (!effectivePurchaseId || !effectiveClaimToken) {
      setCheckingToken(false);
      setTokenValid(false);
      return;
    }

    // If arriving immediately from Step 3 with verifiedContext, still verify against Worker when workerBaseUrl is set
    let cancelled = false;
    const workerBase = (platformConfig.workerBaseUrl || '').trim();
    if (!workerBase) {
      setCheckingToken(false);
      setTokenValid(Boolean(verifiedContext));
      return;
    }

    setCheckingToken(true);
    void validateSubscriptionClaimToken(workerBase, effectivePurchaseId, effectiveClaimToken).then(
      (res) => {
        if (cancelled) return;
        setCheckingToken(false);
        if (res.valid) {
          setTokenValid(true);
          if (res.planName) setResolvedPlanName(res.planName);
          if (res.buyerName) setResolvedBuyerName(res.buyerName);
        } else {
          setTokenValid(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [
    isTrialMode,
    configuredTrialPlan,
    effectivePurchaseId,
    effectiveClaimToken,
    platformConfig.workerBaseUrl,
    verifiedContext,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validated = validateAccountSetupForm(email, password, confirmPassword);
    if (!validated.valid) {
      setError(validated.error);
      return;
    }

    setSubmitting(true);
    try {
      const created = await onCreateFunnelAccount({
        email: validated.cleanEmail,
        password,
        displayName: resolvedBuyerName || validated.cleanEmail.split('@')[0] || 'মার্চেন্ট',
        mode: isTrialMode ? 'trial' : 'paid',
        purchaseId: effectivePurchaseId || undefined,
        claimToken: effectiveClaimToken || undefined,
      });
      onAccountCreated(created);
    } catch (err) {
      setError(mapSignupErrorBn(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#FFF9EC] text-[#142523] flex flex-col"
      data-testid="step4-setup-account-page"
    >
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
            onClick={onBackToLanding}
            className="min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold text-[#0B3B36] hover:bg-[#0B3B36]/8 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            মূল পাতায় ফিরুন
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        {checkingToken ? (
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#E8DEC8] p-8 text-center space-y-4 shadow-sm">
            <Loader2 className="w-8 h-8 text-[#0F766E] animate-spin mx-auto" />
            <p className="text-base font-bold text-[#0B3B36]">
              আপনার পেমেন্ট লিংক যাচাই করা হচ্ছে...
            </p>
          </div>
        ) : !tokenValid ? (
          <div
            className="w-full max-w-md bg-white rounded-3xl border border-[#E8DEC8] p-8 text-center space-y-5 shadow-sm"
            data-testid="invalid-setup-token-card"
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-[#0B3B36]">
                এই লিংকটি আর ব্যবহার করা যাবে না
              </h1>
              <p className="text-sm text-[#4F6360] leading-relaxed">
                লিংকটি মেয়াদোত্তীর্ণ, অসম্পূর্ণ, অথবা আগেই ব্যবহার করা হয়েছে। নতুন করে শুরু করতে প্যাকেজ নির্বাচন করুন।
              </p>
            </div>
            <button
              type="button"
              onClick={onBackToLanding}
              data-testid="back-to-landing-btn"
              className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-[#F2A007] hover:bg-[#DC9005] text-[#1A1611] font-bold text-base transition-colors"
            >
              প্যাকেজ দেখুন
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#E8DEC8] shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-[#0B3B36] to-[#0F766E] text-white p-6 space-y-2">
              <h1 className="text-2xl font-bold">আপনার অ্যাকাউন্ট তৈরি করুন</h1>
            </div>

            <div className="p-6 sm:p-7 space-y-5">
              {/* Green Verification Line */}
              <div
                className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-bold flex items-start gap-2.5"
                data-testid="step4-verified-banner"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  {isTrialMode
                    ? 'আপনার ফ্রি ট্রায়াল শুরু হয়েছে।'
                    : `পেমেন্ট যাচাই হয়েছে — ${resolvedPlanName || 'প্যাকেজ'} প্যাকেজ সক্রিয় হয়েছে।`}
                </span>
              </div>

              {error && (
                <div
                  className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-start gap-2.5"
                  data-testid="step4-error"
                >
                  <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="setup-email"
                    className="block text-sm font-bold text-[#0B3B36] mb-1.5"
                  >
                    ইমেইল ঠিকানা
                  </label>
                  <div className="relative">
                    <Mail className="w-4.5 h-4.5 text-[#556B68] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="setup-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-xl border border-[#DDD2BC] bg-white text-base text-[#142523] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="setup-password"
                    className="block text-sm font-bold text-[#0B3B36] mb-1.5"
                  >
                    পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <Lock className="w-4.5 h-4.5 text-[#556B68] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="setup-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="কমপক্ষে ৬ অক্ষর"
                      className="w-full min-h-[48px] pl-11 pr-12 py-3 rounded-xl border border-[#DDD2BC] bg-white text-base text-[#142523] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#4F6360] hover:bg-slate-100"
                    >
                      {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="setup-confirm-password"
                    className="block text-sm font-bold text-[#0B3B36] mb-1.5"
                  >
                    পাসওয়ার্ড নিশ্চিত করুন
                  </label>
                  <div className="relative">
                    <Lock className="w-4.5 h-4.5 text-[#556B68] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="setup-confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="একই পাসওয়ার্ড আবার লিখুন"
                      className="w-full min-h-[48px] pl-11 pr-12 py-3 rounded-xl border border-[#DDD2BC] bg-white text-base text-[#142523] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#4F6360] hover:bg-slate-100"
                    >
                      {showConfirm ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  data-testid="step4-create-account-btn"
                  className="w-full min-h-[50px] px-6 py-3.5 rounded-2xl bg-[#F2A007] hover:bg-[#DC9005] text-[#1A1611] font-bold text-base shadow-sm disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-colors mt-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      অ্যাকাউন্ট তৈরি হচ্ছে...
                    </>
                  ) : (
                    <>
                      অ্যাকাউন্ট তৈরি করুন
                      <ArrowRight className="w-4.5 h-4.5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
