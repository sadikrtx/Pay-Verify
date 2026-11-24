import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Plus, Store, X } from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatBdt } from '../lib/money';
import { computeTodayStoreStats, getStorePermissions } from '../lib/platformLogic';
import { canCreateStoreUnderPlan, formatLimitBn } from '../lib/planEngine';

interface MyStoresViewProps {
  onOpenStoreSettings: (storeId: string) => void;
}

export const MyStoresView: React.FC<MyStoresViewProps> = ({ onOpenStoreSettings }) => {
  const {
    account,
    effectivePlan,
    accessibleStores,
    ownedStores,
    pausedStoreIds,
    selectedStoreId,
    setSelectedStoreId,
    accountSessions,
    createStore,
  } = usePayVerify();

  const [showCreate, setShowCreate] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKeyModal, setCreatedKeyModal] = useState<{
    storeName: string;
    rawKey: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const nowMs = Date.now();

  const createCheck = useMemo(() => {
    if (!account || !effectivePlan) {
      return { allowed: false, limit: 1, planName: '', reasonBn: null };
    }
    return canCreateStoreUnderPlan(account, effectivePlan, ownedStores.length, nowMs);
  }, [account, effectivePlan, ownedStores.length, nowMs]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const { store, rawStoreKey } = await createStore(storeName);
      setStoreName('');
      setShowCreate(false);
      setCreatedKeyModal({ storeName: store.name, rawKey: rawStoreKey });
      setCopiedKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'নতুন স্টোর তৈরি করা যায়নি।');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdKeyModal) return;
    try {
      await navigator.clipboard.writeText(createdKeyModal.rawKey);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">আমার স্টোরসমূহ</h1>
          {effectivePlan && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 tabular-nums">
              {ownedStores.length.toLocaleString('bn-BD')} /{' '}
              {formatLimitBn(effectivePlan.storeLimit)} ({effectivePlan.plan.name})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowCreate(true);
          }}
          data-testid="new-store-btn"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          নতুন স্টোর
        </button>
      </div>

      {!createCheck.allowed && createCheck.reasonBn && (
        <div
          className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900"
          data-testid="store-limit-warning"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{createCheck.reasonBn}</span>
        </div>
      )}

      {accessibleStores.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 py-16 px-6 text-center space-y-3">
          <Store className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">এখনো কোনো স্টোর তৈরি করা হয়নি</p>
          <p className="text-xs text-slate-400">
            পেমেন্ট নেওয়া শুরু করতে উপরের “নতুন স্টোর” বাটনে ক্লিক করুন
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accessibleStores.map((store) => {
            const sessionsForStore = accountSessions.filter((s) => s.storeId === store.id);
            const todayStats = computeTodayStoreStats(sessionsForStore, nowMs);
            const perms = getStorePermissions(store, account);
            const isSelected = store.id === selectedStoreId;
            const isPaused = pausedStoreIds.has(store.id);

            return (
              <div
                key={store.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between gap-4 transition-colors ${
                  isPaused
                    ? 'border-amber-300 bg-amber-50/20'
                    : isSelected
                      ? 'border-teal-400 ring-1 ring-teal-200'
                      : 'border-slate-200/80'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900 truncate">{store.name}</h2>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            store.type === 'own'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {store.type === 'own' ? 'নিজের' : 'কাস্টমার'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200">
                          {perms.roleLabelBn}
                        </span>
                        {isPaused && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            প্ল্যান লিমিটের বাইরে — পজ
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-md bg-teal-600 text-white text-[11px] font-semibold shrink-0">
                        নির্বাচিত
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                      <div className="text-[11px] text-slate-500">আজকের সেশন</div>
                      <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                        {todayStats.sessionsToday.toLocaleString('bn-BD')}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                      <div className="text-[11px] text-slate-500">আজকের পেমেন্ট</div>
                      <div className="text-lg font-bold text-emerald-700 tabular-nums mt-0.5">
                        {formatBdt(todayStats.paidTodayPaisa)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  {!isSelected && (
                    <button
                      type="button"
                      onClick={() => setSelectedStoreId(store.id)}
                      className="flex-1 py-2 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      নির্বাচন করুন
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenStoreSettings(store.id)}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    স্টোর সেটিংস
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* + New Store Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">নতুন স্টোর তৈরি করুন</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!createCheck.allowed && createCheck.reasonBn ? (
              <div className="space-y-4">
                <div
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700"
                  data-testid="store-limit-blocked-msg"
                >
                  {createCheck.reasonBn}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
                  >
                    ঠিক আছে
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    স্টোরের নাম
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="যেমন: আমার অনলাইন শপ"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                  >
                    {creating ? 'তৈরি হচ্ছে...' : 'স্টোর তৈরি করুন'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Newly Created Store One-Time Key Modal */}
      {createdKeyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              {createdKeyModal.storeName} তৈরি হয়েছে
            </h2>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              নিচের Store Key-টি শুধুমাত্র <strong>একবারই</strong> দেখানো হচ্ছে। সংরক্ষণ করে রাখুন (পরে স্টোর সেটিংস থেকে রোটেট করা যাবে)।
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={createdKeyModal.rawKey}
                className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-900"
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? 'কপি হয়েছে' : 'কপি'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCreatedKeyModal(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              সংরক্ষণ করেছি, এগিয়ে যান
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
