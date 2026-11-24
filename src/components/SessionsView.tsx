import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FlaskConical,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import {
  formatBanglaDateTime,
  formatBdt,
  formatCountdown,
  takaToPaisa,
} from '../lib/money';
import {
  buildTestHistoryEntries,
  getTestSessionDisplayState,
} from '../lib/testVerification';
import {
  WALLET_META,
  WALLET_METHODS,
  type PaySessionDoc,
  type SessionStatus,
  type WalletMethod,
  type WorkerCreateSessionResponse,
} from '../types/payment';
import {
  SessionStatusChip,
  TestModeBadge,
  TestResultChip,
  WalletMethodChip,
} from './WalletBadge';
import { PaymentLogo } from './PaymentLogo';
import { TestVerificationModal } from './TestVerificationModal';

type FilterTab = 'all' | SessionStatus;

interface SessionsViewProps {
  autoOpenTestModal?: boolean;
  onConsumedAutoOpen?: () => void;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  autoOpenTestModal,
  onConsumedAutoOpen,
}) => {
  const {
    platformConfig,
    planEvaluation,
    accessibleStores,
    selectedStore,
    selectedStorePermissions,
    selectedStoreIsPaused,
    accountSessions,
    storeSessions,
    createManualSessionViaWorker,
    cancelWaitingSession,
    manualConfirmSession,
    testHistoryClearedBeforeMs,
    clearTestHistory,
  } = usePayVerify();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create Manual Session Modal
  const [showCreate, setShowCreate] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [amountTaka, setAmountTaka] = useState('');
  const [method, setMethod] = useState<WalletMethod>('bkash');
  const [storeKey, setStoreKey] = useState('');
  const [successUrl, setSuccessUrl] = useState('');
  const [failUrl, setFailUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdSession, setCreatedSession] = useState<WorkerCreateSessionResponse | null>(null);

  // Manual Confirm Modal (mandatory note)
  const [confirmTarget, setConfirmTarget] = useState<PaySessionDoc | null>(null);
  const [manualNote, setManualNote] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (autoOpenTestModal) {
      setShowTestModal(true);
      onConsumedAutoOpen?.();
    }
  }, [autoOpenTestModal, onConsumedAutoOpen]);

  const testHistory = useMemo(
    () =>
      buildTestHistoryEntries(
        accountSessions,
        accessibleStores,
        nowMs,
        testHistoryClearedBeforeMs
      ),
    [accountSessions, accessibleStores, nowMs, testHistoryClearedBeforeMs]
  );

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return storeSessions.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (!q) return true;
      return (
        s.orderId.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.number.includes(q) ||
        (s.trxId || '').toLowerCase().includes(q)
      );
    });
  }, [storeSessions, filter, search]);

  const buildCustomerPayLink = (sessionId: string): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const base = `${origin}/pay/${encodeURIComponent(sessionId)}`;
    if (platformConfig.workerBaseUrl) {
      return `${base}?worker=${encodeURIComponent(platformConfig.workerBaseUrl)}`;
    }
    return base;
  };

  const copyLink = async (sessionId: string) => {
    try {
      await navigator.clipboard.writeText(buildCustomerPayLink(sessionId));
      setCopiedId(sessionId);
      window.setTimeout(() => setCopiedId((prev) => (prev === sessionId ? null : prev)), 2000);
    } catch {
      setActionError('লিঙ্ক কপি করা যায়নি।');
    }
  };

  const canCreate =
    Boolean(selectedStore) &&
    !selectedStoreIsPaused &&
    selectedStorePermissions.canCreateSession &&
    Boolean(planEvaluation?.canCreateSessions);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) return;
    setCreateError(null);
    const paisa = takaToPaisa(amountTaka);
    if (!paisa) {
      setCreateError('সঠিক টাকার পরিমাণ লিখুন (যেমন: 500 বা 1250.50)।');
      return;
    }
    setCreating(true);
    try {
      const res = await createManualSessionViaWorker({
        storeId: selectedStore.id,
        orderId,
        amountPaisa: paisa,
        method,
        storeKey,
        successUrl: successUrl.trim() || undefined,
        failUrl: failUrl.trim() || undefined,
      });
      setCreatedSession(res);
      setOrderId('');
      setAmountTaka('');
      setSuccessUrl('');
      setFailUrl('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'সেশন তৈরি করা যায়নি।');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (sessionId: string) => {
    setActionError(null);
    try {
      await cancelWaitingSession(sessionId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'সেশন বাতিল করা যায়নি।');
    }
  };

  const handleManualConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmTarget) return;
    setConfirmError(null);
    if (!manualNote.trim()) {
      setConfirmError('নোট লেখা বাধ্যতামূলক।');
      return;
    }
    setConfirmBusy(true);
    try {
      await manualConfirmSession(confirmTarget.id, manualNote);
      setConfirmTarget(null);
      setManualNote('');
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'ম্যানুয়াল কনফার্ম ব্যর্থ হয়েছে।');
    } finally {
      setConfirmBusy(false);
    }
  };

  const filterTabs: Array<{ id: FilterTab; label: string }> = [
    { id: 'all', label: 'সব' },
    { id: 'waiting', label: 'অপেক্ষমাণ' },
    { id: 'paid', label: 'পরিশোধিত' },
    { id: 'expired', label: 'মেয়াদ শেষ' },
    { id: 'cancelled', label: 'বাতিল' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">লাইভ সেশন</h1>
        <div className="flex flex-wrap items-center gap-2">
          {accessibleStores.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              data-testid="open-test-verification-btn"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-300 text-orange-900 text-sm font-bold hover:bg-orange-100 transition-colors"
            >
              <FlaskConical className="w-4 h-4 text-orange-700" />
              টেস্ট যাচাই
            </button>
          )}
          {selectedStorePermissions.canCreateSession && (
            <button
              type="button"
              disabled={!canCreate}
              onClick={() => {
                setShowCreate(true);
                setCreateError(null);
                setCreatedSession(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              নতুন সেশন তৈরি করুন
            </button>
          )}
        </div>
      </div>

      {selectedStoreIsPaused && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>
            <strong>প্ল্যান লিমিটের বাইরে — পজ:</strong> এই স্টোরে বর্তমানে নতুন সেশন তৈরি করা যাবে না। প্ল্যান আপগ্রেড করলে এটি স্বয়ংক্রিয়ভাবে চালু হবে।
          </span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === t.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="অর্ডার, নম্বর বা TrxID খুঁজুন..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-sm font-semibold text-slate-700">কোনো পেমেন্ট সেশন পাওয়া যায়নি</p>
            <p className="text-xs text-slate-400 mt-1">
              ওয়েবসাইট থেকে অর্ডার এলে বা নতুন সেশন তৈরি করলে এখানে লাইভ দেখা যাবে
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">অর্ডার</th>
                  <th className="py-3 px-4">ওয়ালেট</th>
                  <th className="py-3 px-4">নম্বর</th>
                  <th className="py-3 px-4">মূল টাকা</th>
                  <th className="py-3 px-4">প্রদেয় টাকা</th>
                  <th className="py-3 px-4">সময় বাকি</th>
                  <th className="py-3 px-4">অবস্থা</th>
                  <th className="py-3 px-4 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSessions.map((s) => {
                  const remainingMs = Math.max(0, s.expiresAtMs - nowMs);
                  const isWaiting = s.status === 'waiting';
                  const testDisplay = s.isTest ? getTestSessionDisplayState(s, nowMs) : null;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 font-mono text-xs">
                            {s.orderId}
                          </span>
                          {s.isTest && <TestModeBadge />}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {s.isTest
                            ? s.testType === 'simulation'
                              ? 'টেস্ট · সিমুলেশন'
                              : 'টেস্ট · আসল SMS'
                            : s.source === 'manual'
                              ? 'ম্যানুয়াল'
                              : 'API / KenaX'}{' '}
                          · {formatBanglaDateTime(s.createdAtMs)}
                        </div>
                        {s.trxId && (
                          <div className="text-[11px] font-mono text-emerald-700 mt-0.5">
                            TrxID: {s.trxId}
                          </div>
                        )}
                        {s.manualNote && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            নোট: {s.manualNote}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <WalletMethodChip method={s.method} />
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-medium text-slate-700 tabular-nums">
                        {s.number || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 tabular-nums">
                        {formatBdt(s.amountPaisa)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 tabular-nums">
                        {formatBdt(s.payablePaisa)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                        {isWaiting ? (
                          <span
                            className={
                              remainingMs > 0
                                ? 'text-amber-700 font-semibold'
                                : 'text-rose-600 font-semibold'
                            }
                          >
                            {formatCountdown(remainingMs)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {testDisplay ? (
                          <div className="space-y-1">
                            <TestResultChip
                              result={testDisplay.code}
                              cancelled={s.status === 'cancelled'}
                            />
                            {testDisplay.reasonBn && (
                              <div className="text-[11px] text-rose-700 max-w-[200px]">
                                {testDisplay.reasonBn}
                              </div>
                            )}
                          </div>
                        ) : (
                          <SessionStatusChip status={s.status} manual={s.manual} />
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => void copyLink(s.id)}
                            title="পেমেন্ট লিঙ্ক কপি করুন"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {copiedId === s.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                কপি হয়েছে
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                লিঙ্ক
                              </>
                            )}
                          </button>

                          {isWaiting && selectedStorePermissions.canManualConfirm && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmTarget(s);
                                setManualNote('');
                                setConfirmError(null);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              কনফার্ম
                            </button>
                          )}

                          {isWaiting && selectedStorePermissions.canCancelSession && (
                            <button
                              type="button"
                              onClick={() => void handleCancel(s.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              বাতিল
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
        )}
      </div>

      {/* Test History (Last 10) */}
      <div
        className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
        data-testid="test-history-card"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-orange-600 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">টেস্ট ইতিহাস (সর্বশেষ ১০টি)</h2>
            <TestModeBadge />
          </div>
          {testHistory.length > 0 && (
            <button
              type="button"
              onClick={clearTestHistory}
              data-testid="clear-test-history-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-rose-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              টেস্ট ইতিহাস মুছুন
            </button>
          )}
        </div>

        {testHistory.length === 0 ? (
          <div className="py-8 px-6 text-center text-xs text-slate-500">
            কোনো সাম্প্রতিক টেস্ট যাচাই নেই।
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {testHistory.map((item) => (
              <div
                key={item.sessionId}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50/70"
                data-testid={`test-history-row-${item.sessionId}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PaymentLogo method={item.method} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">{item.storeName}</span>
                      <span className="text-slate-500">
                        · {WALLET_META[item.method].name} ·{' '}
                        {item.testType === 'simulation' ? 'সিমুলেশন' : 'আসল SMS'}
                      </span>
                      <TestModeBadge />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{formatBanglaDateTime(item.createdAtMs)}</span>
                      {item.trxId && (
                        <span className="font-mono text-slate-600">TrxID: {item.trxId}</span>
                      )}
                    </div>
                    {item.failureReasonBn && (
                      <div className="text-[11px] text-rose-700 mt-0.5 font-medium">
                        {item.failureReasonBn}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatBdt(item.amountPaisa)}
                  </span>
                  <TestResultChip
                    result={item.result}
                    cancelled={item.resultLabelBn === 'বাতিল হয়েছে'}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Manual Session Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900">নতুন ম্যানুয়াল সেশন</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="বন্ধ করুন"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!platformConfig.workerBaseUrl && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                প্ল্যাটফর্মের Worker Base URL এখনো সেট করা হয়নি। সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।
              </div>
            )}

            {createdSession ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="text-sm font-bold text-emerald-800">
                    সেশন সফলভাবে তৈরি হয়েছে
                  </div>
                  <div className="text-xs text-emerald-900 space-y-1 font-mono">
                    <div>Session ID: {createdSession.sessionId}</div>
                    <div>নম্বর: {createdSession.number}</div>
                    <div>প্রদেয়: {formatBdt(createdSession.payablePaisa)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-600">
                    কাস্টমার পেমেন্ট লিঙ্ক
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={buildCustomerPayLink(createdSession.sessionId)}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void copyLink(createdSession.sessionId)}
                      className="px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 shrink-0"
                    >
                      {copiedId === createdSession.sessionId ? 'কপি হয়েছে' : 'কপি'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <a
                    href={buildCustomerPayLink(createdSession.sessionId)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    পেমেন্ট পেজ দেখুন
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                  >
                    সম্পন্ন
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateSession} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    অর্ডার আইডি
                  </label>
                  <input
                    type="text"
                    required
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="যেমন: ORD-1042"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    টাকার পরিমাণ (৳)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={amountTaka}
                    onChange={(e) => setAmountTaka(e.target.value)}
                    placeholder="যেমন: 1250"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    ওয়ালেট নির্বাচন করুন
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {WALLET_METHODS.map((m) => {
                      const meta = WALLET_META[m];
                      const selected = method === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMethod(m)}
                          className="py-2 px-2.5 rounded-xl border text-sm font-semibold transition-all text-left flex items-center gap-2.5"
                          style={{
                            borderColor: selected ? meta.color : '#E2E8F0',
                            backgroundColor: selected ? meta.softBg : '#FFFFFF',
                            color: selected ? meta.color : '#334155',
                          }}
                        >
                          <PaymentLogo method={m} size="sm" />
                          <span>{meta.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Store Key (x-store-key)
                  </label>
                  <input
                    type="password"
                    required
                    value={storeKey}
                    onChange={(e) => setStoreKey(e.target.value)}
                    placeholder="এই স্টোরের স্টোর কী দিন"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Success URL (ঐচ্ছিক)
                    </label>
                    <input
                      type="url"
                      value={successUrl}
                      onChange={(e) => setSuccessUrl(e.target.value)}
                      placeholder="https://your-shop.com/order-success"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fail URL (ঐচ্ছিক)
                    </label>
                    <input
                      type="url"
                      value={failUrl}
                      onChange={(e) => setFailUrl(e.target.value)}
                      placeholder="https://your-shop.com/order-failed"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                {createError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {createError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !platformConfig.workerBaseUrl}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                  >
                    {creating ? 'তৈরি হচ্ছে...' : 'সেশন তৈরি করুন'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Manual Confirm Modal (Mandatory Note) */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900">ম্যানুয়াল কনফার্ম</h2>
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="বন্ধ করুন"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1 mb-4">
              <div>
                অর্ডার: <strong className="font-mono">{confirmTarget.orderId}</strong>
              </div>
              <div>
                প্রদেয় টাকা: <strong>{formatBdt(confirmTarget.payablePaisa)}</strong>
              </div>
            </div>

            <form onSubmit={handleManualConfirm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ম্যানুয়াল কনফার্ম নোট (বাধ্যতামূলক)
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={200}
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="যেমন: ফোনে যাচাই করা হয়েছে, কাস্টমার টাকা পাঠিয়েছে"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {confirmError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {confirmError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmTarget(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={confirmBusy}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {confirmBusy ? 'সংরক্ষণ হচ্ছে...' : 'পরিশোধিত হিসেবে নিশ্চিত করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TestVerificationModal
        open={showTestModal}
        onClose={() => setShowTestModal(false)}
      />
    </div>
  );
};
