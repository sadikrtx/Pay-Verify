import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FlaskConical,
  Send,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatBdt, formatCountdown, takaToPaisa } from '../lib/money';
import {
  getStoreEnabledMethodOptions,
  getTestSessionDisplayState,
  type GeneratedSampleWalletSms,
} from '../lib/testVerification';
import { WALLET_META, type TestVerificationType, type WalletMethod } from '../types/payment';
import { PaymentLogo } from './PaymentLogo';
import { TestModeBadge, TestResultChip } from './WalletBadge';

interface TestVerificationModalProps {
  open: boolean;
  onClose: () => void;
}

export const TestVerificationModal: React.FC<TestVerificationModalProps> = ({ open, onClose }) => {
  const {
    platformConfig,
    accessibleStores,
    selectedStore,
    pausedStoreIds,
    accountSessions,
    createTestVerificationSession,
    sendSimulatedTestSms,
  } = usePayVerify();

  const [storeId, setStoreId] = useState<string>(selectedStore?.id || accessibleStores[0]?.id || '');
  const [method, setMethod] = useState<WalletMethod | ''>('');
  const [amountTaka, setAmountTaka] = useState('10');
  const [testType, setTestType] = useState<TestVerificationType>('real');

  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sendingSim, setSendingSim] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [lastSampleSms, setLastSampleSms] = useState<GeneratedSampleWalletSms | null>(null);
  const [webhookNotice, setWebhookNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  // Sync default store when modal opens
  useEffect(() => {
    if (!open) return;
    if (!storeId || !accessibleStores.some((s) => s.id === storeId)) {
      setStoreId(selectedStore?.id || accessibleStores[0]?.id || '');
    }
  }, [open, storeId, selectedStore, accessibleStores]);

  const chosenStore = useMemo(
    () => accessibleStores.find((s) => s.id === storeId) || accessibleStores[0] || null,
    [accessibleStores, storeId]
  );

  const enabledMethodOptions = useMemo(
    () => getStoreEnabledMethodOptions(chosenStore),
    [chosenStore]
  );

  // Keep selected method valid for chosen store
  useEffect(() => {
    if (enabledMethodOptions.length === 0) {
      setMethod('');
      return;
    }
    if (!method || !enabledMethodOptions.some((o) => o.method === method)) {
      setMethod(enabledMethodOptions[0].method);
    }
  }, [enabledMethodOptions, method]);

  const liveSession = useMemo(
    () => (activeSessionId ? accountSessions.find((s) => s.id === activeSessionId) || null : null),
    [accountSessions, activeSessionId]
  );

  if (!open) return null;

  const buildPayUrl = (sessionId: string): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const base = `${origin}/pay/${encodeURIComponent(sessionId)}`;
    if (platformConfig.workerBaseUrl) {
      return `${base}?worker=${encodeURIComponent(platformConfig.workerBaseUrl)}`;
    }
    return base;
  };

  const openInNewTabViaAnchor = (url: string) => {
    if (typeof document === 'undefined') return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleStartTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!chosenStore) {
      setFormError('অনুগ্রহ করে একটি স্টোর বেছে নিন।');
      return;
    }
    if (pausedStoreIds.has(chosenStore.id)) {
      setFormError('এই স্টোরটি প্ল্যান লিমিটের কারণে পজ করা আছে।');
      return;
    }
    if (!method) {
      setFormError('অনুগ্রহ করে একটি সক্রিয় পেমেন্ট মাধ্যম বেছে নিন।');
      return;
    }
    const paisa = takaToPaisa(amountTaka);
    if (!paisa || paisa < 100) {
      setFormError('সঠিক টাকার পরিমাণ লিখুন (সর্বনিম্ন ৳১)।');
      return;
    }

    setCreating(true);
    setSimError(null);
    setLastSampleSms(null);
    setWebhookNotice(null);

    try {
      const created = await createTestVerificationSession({
        storeId: chosenStore.id,
        method,
        amountPaisa: paisa,
        testType,
      });
      setActiveSessionId(created.id);
      if (testType === 'real') {
        openInNewTabViaAnchor(buildPayUrl(created.id));
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'টেস্ট সেশন তৈরি করা যায়নি।');
    } finally {
      setCreating(false);
    }
  };

  const handleSendSampleSms = async () => {
    if (!liveSession) return;
    setSimError(null);
    setSendingSim(true);
    try {
      const result = await sendSimulatedTestSms(liveSession.id);
      setLastSampleSms(result.sampleSms);
      setWebhookNotice(
        result.webhookFired
          ? 'সতর্কতা: ওয়েববুক চলেছে'
          : 'স্টোরের প্রোডাকশন ওয়েববুক চালানো হয়নি (TEST মোড)'
      );
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'নমুনা SMS পাঠানো যায়নি।');
    } finally {
      setSendingSim(false);
    }
  };

  const handleReset = () => {
    setActiveSessionId(null);
    setLastSampleSms(null);
    setSimError(null);
    setWebhookNotice(null);
    setFormError(null);
  };

  const handleCopyPayLink = async (sessionId: string) => {
    try {
      await navigator.clipboard.writeText(buildPayUrl(sessionId));
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(false);
    }
  };

  const liveDisplay = liveSession ? getTestSessionDisplayState(liveSession, nowMs) : null;
  const remainingMs = liveSession ? Math.max(0, liveSession.expiresAtMs - nowMs) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      data-testid="test-verification-modal"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0B3B36] to-[#0F766E] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <FlaskConical className="w-5 h-5 text-[#F2A007]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold truncate">টেস্ট যাচাই</h2>
                <TestModeBadge />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            aria-label="বন্ধ করুন"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Orange TEST safety notice */}
        <div className="px-6 py-2.5 bg-orange-50 border-b border-orange-200 text-xs text-orange-950 flex items-center gap-2 shrink-0">
          <ShieldCheck className="w-4 h-4 text-orange-700 shrink-0" />
          <span>
            টেস্ট সেশন ১৫ মিনিটে শেষ হয়, বিক্রয় বা কোটায় যোগ হয় না এবং প্রোডাকশন ওয়েববুক চালায় না।
          </span>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {liveSession && liveDisplay ? (
            <div className="space-y-4" data-testid="active-test-session-panel">
              <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TestModeBadge />
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {liveSession.orderId}
                    </span>
                  </div>
                  <TestResultChip
                    result={liveDisplay.code}
                    cancelled={liveSession.status === 'cancelled'}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <div className="text-slate-500">দোকান</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {accessibleStores.find((s) => s.id === liveSession.storeId)?.name || 'স্টোর'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">পরিমাণ</div>
                    <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                      {formatBdt(liveSession.payablePaisa)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">মাধ্যম ও নম্বর</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <PaymentLogo method={liveSession.method} size="sm" />
                      <span className="font-semibold text-slate-800">
                        {WALLET_META[liveSession.method].name}
                      </span>
                      <span className="font-mono text-slate-600">{liveSession.number}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">বাকি সময়</div>
                    <div className="font-mono font-bold text-slate-800 tabular-nums mt-0.5 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {liveSession.status === 'waiting' ? formatCountdown(remainingMs) : '—'}
                    </div>
                  </div>
                </div>

                {liveDisplay.reasonBn && (
                  <div
                    className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800"
                    data-testid="test-failure-reason-bn"
                  >
                    কারণ: {liveDisplay.reasonBn}
                  </div>
                )}

                {liveSession.trxId && (
                  <div className="text-xs font-mono text-slate-700 pt-1 border-t border-orange-200/70">
                    Transaction ID: <strong>{liveSession.trxId}</strong>
                  </div>
                )}
              </div>

              {liveSession.testType === 'real' ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                    <div className="font-semibold text-slate-900">
                      আসল SMS টেস্ট চালু হয়েছে
                    </div>
                    <p>
                      নতুন ট্যাবে খোলা পেমেন্ট পেজে গিয়ে আপনার ফোন থেকে {formatBdt(liveSession.payablePaisa)}{' '}
                      পাঠান এবং Transaction ID দিন। ফোনে পেমেন্ট SMS এলেই ফলাফল এখানে ও পেমেন্ট পেজে দেখাবে।
                    </p>
                  </div>

                  {!platformConfig.workerBaseUrl && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      নোট: এখনো প্ল্যাটফর্মের Worker Base URL সেট করা হয়নি; লাইভ পোলিংয়ের জন্য Worker URL সেট থাকা প্রয়োজন।
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={buildPayUrl(liveSession.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="open-test-pay-page-link"
                      className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F2A007] text-[#0B3B36] text-sm font-extrabold hover:bg-[#dfa006] transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      পেমেন্ট পেজ খুলুন (নতুন ট্যাব)
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleCopyPayLink(liveSession.id)}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          কপি হয়েছে
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          লিঙ্ক কপি
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {liveSession.status === 'waiting' && (
                    <button
                      type="button"
                      disabled={sendingSim}
                      onClick={() => void handleSendSampleSms()}
                      data-testid="send-simulated-sms-btn"
                      className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl bg-[#F2A007] text-[#0B3B36] text-sm font-extrabold hover:bg-[#dfa006] disabled:opacity-50 transition-colors shadow-xs"
                    >
                      <Send className="w-4 h-4" />
                      {sendingSim ? 'নমুনা SMS পাঠানো হচ্ছে...' : 'নমুনা SMS পাঠান'}
                    </button>
                  )}

                  {simError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{simError}</span>
                    </div>
                  )}

                  {lastSampleSms && (
                    <div
                      className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2 text-xs"
                      data-testid="simulated-sms-receipt"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">পাঠানো নমুনা SMS</span>
                        <span className="font-mono text-orange-700 font-bold">
                          {lastSampleSms.trxId}
                        </span>
                      </div>
                      <pre className="p-2.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px] text-slate-800 whitespace-pre-wrap break-words">
                        {lastSampleSms.raw}
                      </pre>
                      {webhookNotice && (
                        <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{webhookNotice}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  আরেকটি টেস্ট করুন
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleStartTest} className="space-y-4">
              {/* Step 1: Store */}
              <div>
                <label
                  htmlFor="test-store-select"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  ১. দোকান নির্বাচন করুন
                </label>
                {accessibleStores.length === 0 ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    এখনো কোনো স্টোর তৈরি করা হয়নি।
                  </div>
                ) : (
                  <select
                    id="test-store-select"
                    value={chosenStore?.id || ''}
                    onChange={(e) => setStoreId(e.target.value)}
                    data-testid="test-store-select"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {accessibleStores.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                        {pausedStoreIds.has(st.id) ? ' (পজ)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Step 2: Enabled Methods ONLY */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ২. পেমেন্ট মাধ্যম (শুধু চালু থাকা মাধ্যম)
                </label>
                {enabledMethodOptions.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    এই স্টোরে এখনো কোনো মাধ্যম চালু ও নম্বর যুক্ত করা হয়নি।
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {enabledMethodOptions.map((opt) => {
                      const meta = WALLET_META[opt.method];
                      const selected = method === opt.method;
                      return (
                        <button
                          key={opt.method}
                          type="button"
                          onClick={() => setMethod(opt.method)}
                          data-testid={`test-method-${opt.method}`}
                          className="p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5"
                          style={{
                            borderColor: selected ? meta.color : '#E2E8F0',
                            backgroundColor: selected ? meta.softBg : '#FFFFFF',
                          }}
                        >
                          <PaymentLogo method={opt.method} size="sm" />
                          <div className="min-w-0">
                            <div
                              className="text-xs font-bold truncate"
                              style={{ color: selected ? meta.color : '#1E293B' }}
                            >
                              {meta.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-600 tabular-nums truncate">
                              {opt.number}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 3: Amount (default ৳10) */}
              <div>
                <label
                  htmlFor="test-amount-input"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  ৩. টাকার পরিমাণ (৳)
                </label>
                <input
                  id="test-amount-input"
                  type="text"
                  inputMode="decimal"
                  required
                  value={amountTaka}
                  onChange={(e) => setAmountTaka(e.target.value)}
                  data-testid="test-amount-input"
                  placeholder="10"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Step 4: Test Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ৪. টেস্টের ধরন
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTestType('real')}
                    data-testid="test-type-real"
                    className={`p-3 rounded-xl border text-left transition-all space-y-1 ${
                      testType === 'real'
                        ? 'border-teal-600 bg-teal-50/70 text-teal-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Smartphone className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span>আসল SMS টেস্ট</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      নতুন ট্যাবে পেমেন্ট পেজ খুলবে; ফোনের আসল SMS দিয়ে যাচাই হবে
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTestType('simulation')}
                    data-testid="test-type-simulation"
                    className={`p-3 rounded-xl border text-left transition-all space-y-1 ${
                      testType === 'simulation'
                        ? 'border-orange-500 bg-orange-50/70 text-orange-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <FlaskConical className="w-3.5 h-3.5 text-orange-700 shrink-0" />
                      <span>সিমুলেশন টেস্ট</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      নমুনা SMS পাঠিয়ে ফোন ছাড়াই যাচাইয়ের পথ পরীক্ষা করুন
                    </p>
                  </button>
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={creating || enabledMethodOptions.length === 0 || !chosenStore}
                  data-testid="start-test-verification-btn"
                  className="px-5 py-2.5 rounded-xl bg-[#F2A007] text-[#0B3B36] text-sm font-extrabold hover:bg-[#dfa006] disabled:opacity-50 transition-colors"
                >
                  {creating ? 'তৈরি হচ্ছে...' : 'টেস্ট শুরু করুন'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
