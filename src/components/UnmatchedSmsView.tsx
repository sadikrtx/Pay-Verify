import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, EyeOff, Link2, X } from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatBanglaDateTime, formatBdt } from '../lib/money';
import { isSmsUnmatchedForInbox } from '../lib/platformLogic';
import type { PaySmsDoc } from '../types/payment';
import { WalletMethodChip } from './WalletBadge';

export const UnmatchedSmsView: React.FC = () => {
  const { smsList, accountSessions, matchUnmatchedSmsToSession, dismissUnmatchedSms } =
    usePayVerify();

  const [matchTarget, setMatchTarget] = useState<PaySmsDoc | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unmatchedInbox = useMemo(
    () =>
      smsList
        .filter(isSmsUnmatchedForInbox)
        .sort((a, b) => b.receivedAtMs - a.receivedAtMs),
    [smsList]
  );

  // Waiting sessions matching the exact amount of the selected SMS
  const sameAmountWaitingSessions = useMemo(() => {
    if (!matchTarget) return [];
    return accountSessions.filter(
      (s) => s.status === 'waiting' && s.payablePaisa === matchTarget.amountPaisa
    );
  }, [accountSessions, matchTarget]);

  const handleAttach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchTarget || !selectedSessionId) return;
    setError(null);
    setBusy(true);
    try {
      await matchUnmatchedSmsToSession(matchTarget, selectedSessionId);
      setMatchTarget(null);
      setSelectedSessionId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'মিলানো সম্ভব হয়নি।');
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async (smsId: string) => {
    setError(null);
    setDismissingId(smsId);
    try {
      await dismissUnmatchedSms(smsId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'বাদ দেওয়া যায়নি।');
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">মেলেনি এমন SMS ইনবক্স</h1>
        <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 tabular-nums">
          {unmatchedInbox.length.toLocaleString('bn-BD')}টি বাকি
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {unmatchedInbox.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-2">
            <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">কোনো অমীমাংসিত SMS নেই</p>
            <p className="text-xs text-slate-400">
              সেশনের সাথে না মেলা কোনো পেমেন্ট SMS এলে এখানে দেখা যাবে; কোনো কিছুই স্বয়ংক্রিয়ভাবে মুছে ফেলা হয় না
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">ওয়ালেট</th>
                  <th className="py-3 px-4">পরিমাণ</th>
                  <th className="py-3 px-4">প্রেরক</th>
                  <th className="py-3 px-4">TrxID</th>
                  <th className="py-3 px-4">আসার সময়</th>
                  <th className="py-3 px-4 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {unmatchedInbox.map((sms) => (
                  <tr key={sms.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <WalletMethodChip method={sms.method} />
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 tabular-nums">
                      {formatBdt(sms.amountPaisa)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                      {sms.sender || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900">
                      {sms.trxId || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatBanglaDateTime(sms.receivedAtMs)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setMatchTarget(sms);
                            const exact = accountSessions.find(
                              (s) => s.status === 'waiting' && s.payablePaisa === sms.amountPaisa
                            );
                            setSelectedSessionId(exact?.id || '');
                            setError(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          সেশনে যুক্ত করুন
                        </button>
                        <button
                          type="button"
                          disabled={dismissingId === sms.id}
                          onClick={() => void handleDismiss(sms.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          বাদ দিন
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attach to same-amount waiting session modal */}
      {matchTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900">সমপরিমাণ সেশনে যুক্ত করুন</h2>
              <button
                type="button"
                onClick={() => setMatchTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="বন্ধ করুন"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1 mb-4">
              <div className="flex justify-between">
                <span>পরিমাণ:</span>
                <strong className="tabular-nums">{formatBdt(matchTarget.amountPaisa)}</strong>
              </div>
              <div className="flex justify-between">
                <span>TrxID:</span>
                <strong className="font-mono">{matchTarget.trxId}</strong>
              </div>
              <div className="flex justify-between">
                <span>প্রেরক:</span>
                <strong className="font-mono">{matchTarget.sender}</strong>
              </div>
            </div>

            {sameAmountWaitingSessions.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 mb-4">
                ঠিক <strong>{formatBdt(matchTarget.amountPaisa)}</strong> পরিমাণের কোনো অপেক্ষমাণ সেশন বর্তমানে নেই।
              </div>
            ) : (
              <form onSubmit={handleAttach} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    অপেক্ষমাণ সেশন বাছাই করুন
                  </label>
                  <select
                    required
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">— সেশন বাছাই করুন —</option>
                    {sameAmountWaitingSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.orderId} · {s.method.toUpperCase()} · {formatBdt(s.payablePaisa)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setMatchTarget(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !selectedSessionId}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                  >
                    {busy ? 'মিলানো হচ্ছে...' : 'ম্যানুয়াল ম্যাচ নিশ্চিত করুন'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
