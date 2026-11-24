import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  FlaskConical,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  cancelSessionPublic,
  fetchSessionStatus,
  resolvePublicRedirectFallbacks,
  resolvePublicWorkerBaseUrl,
  submitSessionVerification,
} from '../lib/workerClient';
import { formatCountdown, parseTimestampMs } from '../lib/money';
import {
  buildMerchantReturnUrl,
  CHECKOUT_METHOD_BRANDS,
  formatAccountTypeHintBn,
  formatAccountTypeLabel,
  formatBanglaTaka,
  mapFailureReasonBn,
  resolveSessionCheckoutOptions,
  toBanglaDigits,
  validateSenderPhone,
  validateTrxId,
  type CheckoutMethodOption,
  type MerchantReturnStatus,
} from '../lib/checkoutFlow';
import type { CheckoutWalletMethod, WorkerSessionStatusResponse } from '../types/payment';

import { PaymentMethodMark, StoreBrandAvatar } from './PaymentMethodMarks';

export interface PreviewCheckoutConfig {
  storeName: string;
  storeNameEn?: string;
  logoUrl?: string;
  logoDataUrl?: string;
  orderId?: string;
  payablePaisa?: number;
  sessionMinutes?: number;
  methods: CheckoutMethodOption[];
  initialStep?: 'choose' | 'method' | 'verifying' | 'paid' | 'failed' | 'expired';
  initialMethod?: CheckoutWalletMethod;
  onClosePreview?: () => void;
}

interface HostedPaymentPageProps {
  sessionId: string;
  previewConfig?: PreviewCheckoutConfig;
}

type CheckoutStep = 'choose' | 'method' | 'verifying' | 'paid' | 'failed' | 'expired' | 'cancelled';

export const HostedPaymentPage: React.FC<HostedPaymentPageProps> = ({
  sessionId,
  previewConfig,
}) => {
  const isPreview = Boolean(previewConfig);

  const workerBaseUrl = useMemo(() => resolvePublicWorkerBaseUrl(), []);
  const urlFallbacks = useMemo(() => resolvePublicRedirectFallbacks(), []);

  // Real session state (populated ONLY from Worker response; never demo fallback)
  const [sessionData, setSessionData] = useState<WorkerSessionStatusResponse | null>(null);
  const [loading, setLoading] = useState(!isPreview);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [pollWarning, setPollWarning] = useState<string | null>(null);

  // Preview-only expiry timestamp (stable for preview session)
  const [previewExpiresAt] = useState<number>(
    () => Date.now() + (previewConfig?.sessionMinutes ?? 15) * 60_000
  );

  // Step & method selection
  const [step, setStep] = useState<CheckoutStep>(() => {
    if (previewConfig?.initialStep) return previewConfig.initialStep;
    return 'choose';
  });
  const [selectedMethod, setSelectedMethod] = useState<CheckoutWalletMethod | null>(() => {
    if (previewConfig?.initialMethod) return previewConfig.initialMethod;
    if (
      previewConfig &&
      previewConfig.initialStep &&
      previewConfig.initialStep !== 'choose' &&
      previewConfig.methods.length > 0
    ) {
      return previewConfig.methods[0].method;
    }
    return null;
  });

  // Customer inputs in Step 2
  const [trxIdInput, setTrxIdInput] = useState('');
  const [senderInput, setSenderInput] = useState('');
  const [trxError, setTrxError] = useState<string | null>(null);
  const [senderError, setSenderError] = useState<string | null>(null);
  const [copiedNumber, setCopiedNumber] = useState(false);

  // Result state tracking
  const [submittedTrxId, setSubmittedTrxId] = useState<string | null>(
    previewConfig?.initialStep === 'paid' ? 'BKA89M4K2P' : null
  );
  const [failureReason, setFailureReason] = useState<string | null>(
    previewConfig?.initialStep === 'failed' ? 'trx_not_found' : null
  );
  const [submitting, setSubmitting] = useState(false);

  // Live clock & redirect countdown
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const hasAutoRedirectedRef = useRef(false);

  // Tick every second for session timer
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Poll Worker for real sessions ONLY (never reads Firestore)
  const pollStatus = useCallback(async () => {
    if (isPreview) return;
    if (!workerBaseUrl) {
      setLoading(false);
      setFatalError('পেমেন্ট সার্ভারের ঠিকানা যুক্ত নেই। দোকানের মূল লিঙ্ক থেকে আবার চেষ্টা করুন।');
      return;
    }
    try {
      const res = await fetchSessionStatus(workerBaseUrl, sessionId);
      // Hard Rule: NEVER fall back to another merchant's name/logo/numbers or demo data.
      if (!res.storeName || !res.storeName.trim()) {
        setSessionData(null);
        setLoading(false);
        setFatalError(
          'এই পেমেন্ট সেশনের মার্চেন্ট তথ্য পাওয়া যায়নি। নিরাপত্তার স্বার্থে পেমেন্ট প্রক্রিয়া বন্ধ রাখা হয়েছে।'
        );
        return;
      }
      setSessionData(res);
      setFatalError(null);
      setPollWarning(null);
      setLoading(false);

      if (res.status === 'paid') {
        if (res.trxId) setSubmittedTrxId(res.trxId);
        setStep('paid');
      } else if (res.status === 'expired') {
        setStep('expired');
      } else if (res.status === 'cancelled') {
        setStep('cancelled');
      } else if (res.status === 'failed') {
        setFailureReason(res.failureReason || 'verification_failed');
        setStep('failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।';
      if (!sessionData) {
        setFatalError(msg);
      } else {
        setPollWarning(msg);
      }
      setLoading(false);
    }
  }, [isPreview, workerBaseUrl, sessionId, sessionData]);

  useEffect(() => {
    if (isPreview) return;
    void pollStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, sessionId, workerBaseUrl]);

  useEffect(() => {
    if (isPreview) return;
    if (!sessionData) return;
    if (step === 'paid' || step === 'expired' || step === 'cancelled') return;
    const id = window.setInterval(() => {
      void pollStatus();
    }, 3000);
    return () => window.clearInterval(id);
  }, [isPreview, sessionData, step, pollStatus]);

  // Derived merchant & session view model (strictly from previewConfig OR sessionData)
  const storeName = previewConfig ? previewConfig.storeName : sessionData?.storeName || '';
  const storeNameEn = previewConfig ? previewConfig.storeNameEn || '' : sessionData?.storeNameEn || '';
  const logoUrl = previewConfig ? previewConfig.logoUrl || '' : sessionData?.logoUrl || '';
  const logoDataUrl = previewConfig ? previewConfig.logoDataUrl || '' : sessionData?.logoDataUrl || '';
  const orderId = previewConfig
    ? previewConfig.orderId || 'TEST-ORD-1024'
    : sessionData?.orderId || sessionId;
  const payablePaisa = previewConfig
    ? previewConfig.payablePaisa ?? 125000
    : sessionData?.payablePaisa ?? 0;
  const expiresAtMs = previewConfig
    ? previewExpiresAt
    : sessionData
      ? parseTimestampMs(sessionData.expiresAt) ?? 0
      : 0;
  const isTestSession = isPreview || Boolean(sessionData?.isTest);

  const enabledOptions: CheckoutMethodOption[] = useMemo(() => {
    if (previewConfig) return previewConfig.methods;
    if (!sessionData) return [];
    return resolveSessionCheckoutOptions(sessionData);
  }, [previewConfig, sessionData]);

  const activeOption: CheckoutMethodOption | null = useMemo(() => {
    if (!selectedMethod) return enabledOptions[0] ?? null;
    return enabledOptions.find((o) => o.method === selectedMethod) ?? enabledOptions[0] ?? null;
  }, [selectedMethod, enabledOptions]);

  const remainingMs = expiresAtMs > 0 ? Math.max(0, expiresAtMs - nowMs) : 0;
  const isExpiredByClock =
    expiresAtMs > 0 && remainingMs <= 0 && step !== 'paid' && step !== 'cancelled';

  const effectiveStep: CheckoutStep =
    step === 'paid'
      ? 'paid'
      : step === 'cancelled'
        ? 'cancelled'
        : isExpiredByClock && step !== 'failed'
          ? 'expired'
          : step;

  // Build return URLs safely
  const successBaseUrl = isPreview ? null : sessionData?.successUrl || urlFallbacks.successUrl;
  const failBaseUrl = isPreview ? null : sessionData?.failUrl || urlFallbacks.failUrl;

  const getReturnHref = useCallback(
    (status: MerchantReturnStatus) => {
      const base = status === 'paid' ? successBaseUrl : failBaseUrl || successBaseUrl;
      return buildMerchantReturnUrl(base, {
        status,
        sessionId,
        orderId,
        trxId: status === 'paid' ? submittedTrxId || sessionData?.trxId : null,
        method: activeOption?.method,
        reason: status === 'failed' ? failureReason : null,
      });
    },
    [
      successBaseUrl,
      failBaseUrl,
      sessionId,
      orderId,
      submittedTrxId,
      sessionData?.trxId,
      activeOption?.method,
      failureReason,
    ]
  );

  // Automatic redirect countdown when paid, OR when expired while in failed state
  const autoRedirectTarget = useMemo(() => {
    if (isPreview) return null;
    if (effectiveStep === 'paid') return getReturnHref('paid');
    if (effectiveStep === 'failed' && isExpiredByClock) return getReturnHref('failed');
    return null;
  }, [isPreview, effectiveStep, isExpiredByClock, getReturnHref]);

  useEffect(() => {
    if (!autoRedirectTarget) {
      setRedirectCountdown(null);
      return;
    }
    if (hasAutoRedirectedRef.current) return;
    setRedirectCountdown(5);
    const interval = window.setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          window.clearInterval(interval);
          if (!hasAutoRedirectedRef.current) {
            hasAutoRedirectedRef.current = true;
            window.location.assign(autoRedirectTarget);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [autoRedirectTarget]);

  const handleSelectMethod = (method: CheckoutWalletMethod) => {
    setSelectedMethod(method);
    setTrxError(null);
    setSenderError(null);
    setCopiedNumber(false);
    setStep('method');
  };

  const handleCopyNumber = async (num: string) => {
    if (!num) return;
    try {
      await navigator.clipboard.writeText(num);
      setCopiedNumber(true);
      window.setTimeout(() => setCopiedNumber(false), 2200);
    } catch {
      setCopiedNumber(true);
      window.setTimeout(() => setCopiedNumber(false), 2200);
    }
  };

  const handleCancelReturn = async () => {
    if (isPreview) {
      if (previewConfig?.onClosePreview) {
        previewConfig.onClosePreview();
      } else {
        setStep('cancelled');
      }
      return;
    }
    if (workerBaseUrl) {
      await cancelSessionPublic(workerBaseUrl, sessionId);
    }
    const href = getReturnHref('cancelled');
    if (href) {
      window.location.assign(href);
    } else {
      setStep('cancelled');
    }
  };

  const handleSubmitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOption) return;

    const trxCheck = validateTrxId(trxIdInput);
    const senderCheck = validateSenderPhone(senderInput);

    setTrxError(trxCheck.errorBn);
    setSenderError(senderCheck.errorBn);
    if (!trxCheck.valid || !senderCheck.valid) return;

    setSubmittedTrxId(trxCheck.normalized);
    setFailureReason(null);

    if (isPreview) {
      // Safe preview mode: enters verifying screen, never fakes live payment
      setStep('verifying');
      return;
    }

    setSubmitting(true);
    setStep('verifying');
    try {
      const result = await submitSessionVerification(workerBaseUrl, sessionId, {
        method: activeOption.method,
        trxId: trxCheck.normalized,
        sender: senderCheck.normalized,
      });

      if (result.supported) {
        if (result.status === 'paid') {
          if (result.trxId) setSubmittedTrxId(result.trxId);
          setStep('paid');
        } else if (result.status === 'failed') {
          setFailureReason(result.failureReason || 'verification_failed');
          setStep('failed');
        } else if (result.status === 'expired') {
          setStep('expired');
        }
        // If status === 'waiting', stay calmly on verifying while polling continues
      }
      // If Worker does not yet implement /verify, remain on verifying and poll GET /status
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryFromFailure = () => {
    setFailureReason(null);
    setTrxError(null);
    setSenderError(null);
    setStep('method');
  };

  // ─── Loading State (neutral, no merchant branding yet) ──────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F5F9] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-sm p-10 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-700 animate-spin" />
          </div>
          <div className="text-base font-bold text-slate-900">পেমেন্ট পেজ লোড হচ্ছে…</div>
        </div>
        <footer className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Secured by PayVerify</span>
        </footer>
      </div>
    );
  }

  // ─── Neutral Error Page (Missing Merchant Data or Invalid Session) ──────
  if (fatalError || (!isPreview && (!sessionData || !storeName))) {
    return (
      <div
        className="min-h-screen bg-[#F2F5F9] flex flex-col items-center justify-center p-4 sm:p-6"
        data-testid="checkout-neutral-error"
      >
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm p-7 sm:p-8 text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-bold text-slate-900">পেমেন্ট সেশন খোলা যায়নি</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {fatalError ||
                'এই পেমেন্ট লিঙ্কটির মার্চেন্ট তথ্য পাওয়া যায়নি। অনুগ্রহ করে দোকানের ওয়েবসাইট থেকে নতুন করে পেমেন্ট শুরু করুন।'}
            </p>
          </div>
          <div className="pt-1 flex flex-col sm:flex-row gap-2.5 justify-center">
            <button
              type="button"
              onClick={() => void pollStatus()}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              আবার চেষ্টা করুন
            </button>
            {urlFallbacks.failUrl && (
              <a
                href={getReturnHref('failed') || urlFallbacks.failUrl}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                দোকানে ফিরুন
              </a>
            )}
          </div>
        </div>
        <footer className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Secured by PayVerify</span>
        </footer>
      </div>
    );
  }

  const formattedAmount = formatBanglaTaka(payablePaisa);
  const formattedCountdown =
    expiresAtMs > 0 ? toBanglaDigits(formatCountdown(remainingMs)) : '--:--';
  const lowTime = remainingMs > 0 && remainingMs <= 120_000;
  const activeBrand = activeOption ? CHECKOUT_METHOD_BRANDS[activeOption.method] : null;
  const failureInfo = mapFailureReasonBn(failureReason);

  return (
    <div className="min-h-screen bg-[#F2F5F9] text-slate-900 flex flex-col justify-between py-4 px-3 sm:py-8 sm:px-6">
      <div className="w-full max-w-[840px] mx-auto space-y-3.5">
        {/* TEST / Preview Mode Banner — clearly separated from real transactions */}
        {isTestSession && (
          <div
            className="rounded-2xl bg-amber-50 border border-amber-300 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-amber-950"
            data-testid="checkout-preview-banner"
          >
            <div className="flex items-center gap-2 text-xs font-bold">
              <FlaskConical className="w-4 h-4 text-amber-700 shrink-0" />
              <span>প্রিভিউ · TEST মোড — কোনো আসল লেনদেন তৈরি হচ্ছে না</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {isPreview && (
                <>
                  {(
                    [
                      { id: 'choose', label: 'মাধ্যম' },
                      { id: 'verifying', label: 'যাচাই হচ্ছে' },
                      { id: 'paid', label: 'সফল' },
                      { id: 'failed', label: 'ব্যর্থ' },
                      { id: 'expired', label: 'সময় শেষ' },
                    ] as const
                  ).map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      data-testid={`preview-state-${btn.id}`}
                      onClick={() => {
                        if (btn.id !== 'choose' && !selectedMethod && enabledOptions[0]) {
                          setSelectedMethod(enabledOptions[0].method);
                        }
                        if (btn.id === 'paid' && !submittedTrxId) {
                          setSubmittedTrxId('TEST88K92P');
                        }
                        if (btn.id === 'failed' && !failureReason) {
                          setFailureReason('trx_not_found');
                        }
                        setStep(btn.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                        effectiveStep === btn.id
                          ? 'bg-amber-800 text-white'
                          : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </>
              )}
              {previewConfig?.onClosePreview && (
                <button
                  type="button"
                  onClick={previewConfig.onClosePreview}
                  data-testid="close-preview-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800"
                >
                  <X className="w-3.5 h-3.5" />
                  বন্ধ করুন
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main SSLCommerz-style Checkout Shell */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md shadow-slate-900/5 overflow-hidden">
          {/* Merchant Header (Logo + Bangla/English Name + Small Lock Line ONLY) */}
          <header className="px-5 py-4 sm:px-7 sm:py-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <StoreBrandAvatar
                name={storeName}
                nameEn={storeNameEn}
                logoUrl={logoUrl}
                logoDataUrl={logoDataUrl}
                size="md"
              />
              <div className="min-w-0">
                <h1
                  className="text-lg sm:text-xl font-bold text-slate-900 leading-snug truncate"
                  data-testid="checkout-merchant-name"
                >
                  {storeName}
                </h1>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
                  {storeNameEn && (
                    <span className="text-xs font-medium text-slate-500 truncate">
                      {storeNameEn}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <Lock className="w-3 h-3 shrink-0" />
                    নিরাপদ পেমেন্ট
                  </span>
                </div>
              </div>
            </div>

            {/* Session Countdown */}
            {effectiveStep !== 'paid' && effectiveStep !== 'cancelled' && (
              <div
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold tabular-nums ${
                  effectiveStep === 'expired'
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : lowTime
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
                data-testid="checkout-countdown"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>{effectiveStep === 'expired' ? 'সময় শেষ' : formattedCountdown}</span>
              </div>
            )}
          </header>

          {/* Desktop 2-Column / Mobile Stacked Body */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Order Summary Strip (Left sidebar on desktop, top strip on mobile) */}
            <aside className="lg:col-span-4 bg-slate-50/80 border-b lg:border-b-0 lg:border-r border-slate-100 p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between lg:block space-y-0 lg:space-y-1">
                  <div className="text-xs font-semibold text-slate-500">পরিশোধযোগ্য পরিমাণ</div>
                  <div
                    className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums"
                    data-testid="checkout-locked-amount"
                  >
                    {formattedAmount}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/80 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">দোকান</span>
                    <span className="font-semibold text-slate-800 text-right truncate">
                      {storeName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">অর্ডার / ইনভয়েস</span>
                    <span
                      className="font-mono font-semibold text-slate-800 text-right truncate max-w-[170px]"
                      data-testid="checkout-order-id"
                    >
                      {orderId}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">টাকার পরিমাণ</span>
                    <span className="font-semibold text-slate-700">নির্ধারিত (লকড)</span>
                  </div>
                </div>
              </div>

              {pollWarning && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                  সংযোগ পুনরায় চেষ্টা করা হচ্ছে…
                </div>
              )}
            </aside>

            {/* Interactive Checkout Stage */}
            <section className="lg:col-span-8">
              {/* ─── STEP 1: CHOOSE METHOD ───────────────────────────────── */}
              {effectiveStep === 'choose' && (
                <div className="p-5 sm:p-7 space-y-5" data-testid="checkout-step-choose">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    পেমেন্ট মাধ্যম বেছে নিন
                  </h2>

                  {enabledOptions.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                      <div className="text-sm font-bold text-slate-800">
                        কোনো সক্রিয় পেমেন্ট মাধ্যম পাওয়া যায়নি
                      </div>
                      <p className="text-xs text-slate-500">
                        এই স্টোরে এখনো bKash, Nagad বা Rocket নম্বর চালু করা হয়নি।
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {enabledOptions.map((option) => {
                        const brand = CHECKOUT_METHOD_BRANDS[option.method];
                        return (
                          <button
                            key={option.method}
                            type="button"
                            data-testid={`method-card-${option.method}`}
                            onClick={() => handleSelectMethod(option.method)}
                            className="group w-full min-h-[76px] p-4 rounded-2xl bg-white border-2 border-slate-200/90 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all flex items-center justify-between gap-4 text-left shadow-2xs hover:shadow-sm"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <PaymentMethodMark method={option.method} className="w-11 h-11 shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-base font-extrabold tracking-tight"
                                    style={{ color: brand.primaryHex }}
                                  >
                                    {brand.name}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-400">
                                    ({brand.nameBn})
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 font-medium mt-0.5 truncate">
                                  {formatAccountTypeHintBn(option.type, option.accountCount)}
                                </div>
                              </div>
                            </div>

                            <div className="w-9 h-9 rounded-xl bg-slate-50 group-hover:bg-slate-100 flex items-center justify-center text-slate-500 group-hover:text-slate-800 shrink-0 transition-colors">
                              <ChevronRight className="w-5 h-5" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 text-center">
                    <button
                      type="button"
                      onClick={() => void handleCancelReturn()}
                      data-testid="checkout-cancel-link"
                      className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      বাতিল করে দোকানে ফিরুন
                    </button>
                  </div>
                </div>
              )}

              {/* ─── STEP 2: BRANDED METHOD SCREEN ───────────────────────── */}
              {effectiveStep === 'method' && activeOption && activeBrand && (
                <div
                  className="text-white"
                  style={{
                    background: `linear-gradient(160deg, ${activeBrand.primaryHex} 0%, ${activeBrand.darkHex} 100%)`,
                  }}
                  data-testid={`checkout-step-method-${activeOption.method}`}
                >
                  {/* Brand Top Strip */}
                  <div className="px-5 pt-5 pb-4 sm:px-7 sm:pt-6 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PaymentMethodMark method={activeOption.method} inverted className="w-10 h-10 shrink-0" />
                      <div>
                        <div className="text-lg font-extrabold tracking-tight leading-tight">
                          {activeBrand.name}
                        </div>
                        <div className="text-xs font-semibold text-white/85">
                          {formatAccountTypeLabel(activeOption.type)} অ্যাকাউন্ট
                        </div>
                      </div>
                    </div>

                    {enabledOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setStep('choose')}
                        data-testid="checkout-change-method"
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/25 transition-colors"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        মাধ্যম বদলান
                      </button>
                    )}
                  </div>

                  {/* Prominent Receiving Number & Exact Payable Line */}
                  <div className="px-5 pb-5 sm:px-7 space-y-4">
                    <div className="rounded-2xl bg-black/20 border border-white/20 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold text-white/80">
                            {activeBrand.name} {formatAccountTypeLabel(activeOption.type)} নম্বর
                          </div>
                          <div
                            className="text-2xl sm:text-[26px] font-mono font-extrabold tracking-wider text-white mt-0.5 select-all"
                            data-testid="checkout-receiver-number"
                          >
                            {activeOption.number}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleCopyNumber(activeOption.number)}
                          data-testid="checkout-copy-number"
                          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-extrabold shadow-sm hover:bg-white/95 active:scale-[0.98] transition-all"
                        >
                          {copiedNumber ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-600" />
                              <span>কপি হয়েছে</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>কপি করুন</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="pt-2.5 border-t border-white/15 text-sm sm:text-base font-bold text-white">
                        {activeOption.type === 'agent'
                          ? `এই নম্বরে ${formattedAmount} ক্যাশ আউট করুন`
                          : `এই নম্বরে ${formattedAmount} সেন্ড মানি করুন`}
                      </div>
                    </div>

                    {/* Short Numbered Bangla Instructions */}
                    <ol className="space-y-2 text-xs sm:text-[13px] text-white/95">
                      {activeBrand.stepsBn(activeOption.type, formattedAmount).map((line, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                          <span className="w-5 h-5 rounded-full bg-white/20 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {toBanglaDigits(idx + 1)}
                          </span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ol>

                    {/* Clean High-Contrast Verification Form Surface */}
                    <form
                      onSubmit={handleSubmitVerify}
                      noValidate
                      className="rounded-2xl bg-white text-slate-900 p-4 sm:p-5 shadow-md space-y-4"
                    >
                      <div className="space-y-1.5">
                        <label
                          htmlFor="checkout-trx-id"
                          className="block text-xs font-bold text-slate-800"
                        >
                          Transaction ID <span className="text-rose-600">*</span>
                        </label>
                        <input
                          id="checkout-trx-id"
                          type="text"
                          value={trxIdInput}
                          onChange={(e) => {
                            setTrxIdInput(e.target.value.toUpperCase());
                            if (trxError) setTrxError(null);
                          }}
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder="যেমন: 8N7A6B5C4D"
                          data-testid="input-trx-id"
                          className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-sm font-mono font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 ${
                            trxError
                              ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                              : 'border-slate-300 bg-slate-50/60 focus:bg-white focus:ring-slate-900'
                          }`}
                        />
                        {trxError ? (
                          <p className="text-xs font-semibold text-rose-600">{trxError}</p>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            পেমেন্টের পর SMS বা অ্যাপে পাওয়া ৮–১৬ অক্ষরের Transaction ID লিখুন।
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="checkout-sender-phone"
                          className="block text-xs font-bold text-slate-800"
                        >
                          যে নম্বর থেকে পাঠিয়েছেন <span className="text-rose-600">*</span>
                        </label>
                        <input
                          id="checkout-sender-phone"
                          type="tel"
                          inputMode="tel"
                          value={senderInput}
                          onChange={(e) => {
                            setSenderInput(e.target.value);
                            if (senderError) setSenderError(null);
                          }}
                          placeholder="01XXXXXXXXX"
                          data-testid="input-sender-phone"
                          className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-sm font-mono font-semibold focus:outline-none focus:ring-2 ${
                            senderError
                              ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                              : 'border-slate-300 bg-slate-50/60 focus:bg-white focus:ring-slate-900'
                          }`}
                        />
                        {senderError ? (
                          <p className="text-xs font-semibold text-rose-600">{senderError}</p>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন।
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 pt-1">
                        <button
                          type="submit"
                          disabled={submitting}
                          data-testid="checkout-verify-btn"
                          style={{ backgroundColor: activeBrand.primaryHex }}
                          className="w-full min-h-[50px] px-5 py-3 rounded-xl text-white text-sm sm:text-base font-extrabold shadow-sm hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span>ভেরিফাই করুন</span>
                        </button>
                        <p className="text-[11px] text-slate-500 text-center">
                          যাচাইকরণ স্বয়ংক্রিয় এবং সাধারণত কয়েক মুহূর্ত সময় নেয়।
                        </p>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* ─── STEP 3A: VERIFYING / WAITING ────────────────────────── */}
              {effectiveStep === 'verifying' && (
                <div
                  className="p-7 sm:p-10 text-center space-y-6"
                  data-testid="checkout-step-verifying"
                >
                  <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-teal-100 animate-ping opacity-45" />
                    <div className="relative w-16 h-16 rounded-full bg-teal-50 border-2 border-teal-500 text-teal-700 flex items-center justify-center">
                      <Loader2 className="w-7 h-7 animate-spin" />
                    </div>
                  </div>

                  <div className="space-y-2 max-w-sm mx-auto">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                      আপনার পেমেন্ট যাচাই করা হচ্ছে…
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      অনুগ্রহ করে এই পেজটি বন্ধ করবেন না। সার্ভার থেকে নিশ্চিত হলে সাথে সাথেই ফলাফল দেখানো হবে।
                    </p>
                  </div>

                  {(activeBrand || submittedTrxId) && (
                    <div className="max-w-xs mx-auto rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 text-xs space-y-1.5">
                      {activeBrand && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500">মাধ্যম</span>
                          <span className="font-bold text-slate-800">{activeBrand.name}</span>
                        </div>
                      )}
                      {submittedTrxId && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500">Transaction ID</span>
                          <span className="font-mono font-bold text-slate-900">{submittedTrxId}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setStep('method')}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      তথ্য সংশোধন করুন
                    </button>
                  </div>
                </div>
              )}

              {/* ─── STEP 3B: SUCCESS ────────────────────────────────────── */}
              {effectiveStep === 'paid' && (
                <div
                  className="p-7 sm:p-10 text-center space-y-6 bg-gradient-to-b from-emerald-50/70 to-white"
                  data-testid="checkout-step-paid"
                >
                  <div className="w-20 h-20 mx-auto rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
                    <CheckCircle2 className="w-11 h-11" />
                  </div>

                  <div className="space-y-1.5">
                    <h2 className="text-xl sm:text-2xl font-extrabold text-emerald-950">
                      পেমেন্ট সফল হয়েছে
                    </h2>
                    <p className="text-sm text-emerald-800">
                      {storeName}-এ আপনার পেমেন্ট স্বয়ংক্রিয়ভাবে নিশ্চিত হয়েছে।
                    </p>
                  </div>

                  <div className="max-w-sm mx-auto rounded-2xl bg-white border border-emerald-200 p-4 space-y-2.5 text-sm shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 text-xs">পরিশোধিত পরিমাণ</span>
                      <span className="font-extrabold text-slate-900 tabular-nums">
                        {formattedAmount}
                      </span>
                    </div>
                    {activeBrand && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 text-xs">মাধ্যম</span>
                        <span className="font-bold text-slate-800">{activeBrand.name}</span>
                      </div>
                    )}
                    {(submittedTrxId || sessionData?.trxId) && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 text-xs">Transaction ID</span>
                        <span className="font-mono font-bold text-emerald-800">
                          {submittedTrxId || sessionData?.trxId}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-1">
                    {redirectCountdown !== null && autoRedirectTarget && (
                      <p className="text-xs font-semibold text-emerald-800">
                        {toBanglaDigits(redirectCountdown)} সেকেন্ডের মধ্যে দোকানে ফিরে যাচ্ছেন…
                      </p>
                    )}

                    {getReturnHref('paid') ? (
                      <a
                        href={getReturnHref('paid')!}
                        data-testid="checkout-return-now-btn"
                        className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold hover:bg-emerald-700 shadow-sm transition-colors"
                      >
                        <span>এখনই ফিরে যান</span>
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    ) : isPreview && previewConfig?.onClosePreview ? (
                      <button
                        type="button"
                        onClick={previewConfig.onClosePreview}
                        className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold hover:bg-emerald-700"
                      >
                        এখনই ফিরে যান
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {/* ─── STEP 3C: FAILED / UNMATCHED ─────────────────────────── */}
              {effectiveStep === 'failed' && (
                <div
                  className="p-6 sm:p-9 space-y-6 bg-gradient-to-b from-rose-50/60 to-white"
                  data-testid="checkout-step-failed"
                >
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                      <XCircle className="w-9 h-9" />
                    </div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                      {failureInfo.headline}
                    </h2>
                  </div>

                  <div className="max-w-md mx-auto rounded-2xl bg-white border border-rose-200/80 p-4 space-y-2">
                    <div className="text-xs font-bold text-slate-700">সম্ভাব্য কারণসমূহ:</div>
                    <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 list-disc pl-4">
                      {failureInfo.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  {redirectCountdown !== null && autoRedirectTarget && (
                    <p className="text-center text-xs font-semibold text-rose-700">
                      সময় শেষ হওয়ায় {toBanglaDigits(redirectCountdown)} সেকেন্ডের মধ্যে দোকানে ফিরে যাচ্ছেন…
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    {!isExpiredByClock && (
                      <button
                        type="button"
                        onClick={handleRetryFromFailure}
                        data-testid="checkout-retry-btn"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-extrabold hover:bg-slate-800 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        আবার চেষ্টা করুন
                      </button>
                    )}

                    {getReturnHref('failed') ? (
                      <a
                        href={getReturnHref('failed')!}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 transition-colors"
                      >
                        দোকানে ফিরুন
                      </a>
                    ) : isPreview && previewConfig?.onClosePreview ? (
                      <button
                        type="button"
                        onClick={previewConfig.onClosePreview}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50"
                      >
                        দোকানে ফিরুন
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {/* ─── STEP 3D: EXPIRED ────────────────────────────────────── */}
              {effectiveStep === 'expired' && (
                <div
                  className="p-7 sm:p-10 text-center space-y-5"
                  data-testid="checkout-step-expired"
                >
                  <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Clock className="w-8 h-8" />
                  </div>
                  <div className="space-y-1.5 max-w-sm mx-auto">
                    <h2 className="text-xl font-extrabold text-slate-900">সময় শেষ</h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      এই পেমেন্ট সেশনের নির্ধারিত সময় শেষ হয়ে গেছে। নিরাপদ পেমেন্টের জন্য অনুগ্রহ করে দোকানে ফিরে নতুন করে অর্ডার করুন।
                    </p>
                  </div>
                  <div className="pt-1">
                    {getReturnHref('expired') ? (
                      <a
                        href={getReturnHref('expired')!}
                        className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-extrabold hover:bg-slate-800"
                      >
                        দোকানে ফিরুন
                      </a>
                    ) : isPreview && previewConfig?.onClosePreview ? (
                      <button
                        type="button"
                        onClick={previewConfig.onClosePreview}
                        className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-extrabold hover:bg-slate-800"
                      >
                        দোকানে ফিরুন
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {/* ─── STEP 3E: CANCELLED ──────────────────────────────────── */}
              {effectiveStep === 'cancelled' && (
                <div
                  className="p-7 sm:p-10 text-center space-y-5"
                  data-testid="checkout-step-cancelled"
                >
                  <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                    <XCircle className="w-8 h-8" />
                  </div>
                  <div className="space-y-1.5 max-w-sm mx-auto">
                    <h2 className="text-xl font-extrabold text-slate-900">পেমেন্ট বাতিল করা হয়েছে</h2>
                    <p className="text-sm text-slate-600">
                      আপনার কোনো টাকা কাটা হয়নি। প্রয়োজনে দোকানে ফিরে আবার চেষ্টা করতে পারেন।
                    </p>
                  </div>
                  {getReturnHref('cancelled') && (
                    <a
                      href={getReturnHref('cancelled')!}
                      className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-extrabold hover:bg-slate-800"
                    >
                      দোকানে ফিরুন
                    </a>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Quiet Footer — Merchant Branding Always Dominates */}
      <footer className="mt-6 text-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          Secured by PayVerify
        </span>
      </footer>
    </div>
  );
};
