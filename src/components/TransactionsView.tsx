import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Link2,
  Search,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatBanglaDateTime, formatBdt } from '../lib/money';
import type { PaySmsDoc, SmsMatchResult } from '../types/payment';
import { SmsMatchChip, TestModeBadge, WalletMethodChip } from './WalletBadge';

type SmsFilter = 'all' | SmsMatchResult;

export const TransactionsView: React.FC = () => {
  const { smsList, accountSessions, matchUnmatchedSmsToSession } = usePayVerify();
  const [filter, setFilter] = useState<SmsFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [matchTarget, setMatchTarget] = useState<PaySmsDoc | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  const waitingSessions = useMemo(
    () => accountSessions.filter((s) => s.status === 'waiting'),
    [accountSessions]
  );

  const filteredSms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return smsList.filter((m) => {
      if (filter !== 'all' && m.matchResult !== filter) return false;
      if (!q) return true;
      return (
        m.trxId.toLowerCase().includes(q) ||
        m.sender.toLowerCase().includes(q) ||
        m.raw.toLowerCase().includes(q)
      );
    });
  }, [smsList, filter, search]);

  const handleConfirmMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchTarget || !selectedSessionId) return;
    setMatchError(null);
    setMatching(true);
    try {
      await matchUnmatchedSmsToSession(matchTarget, selectedSessionId);
      setMatchTarget(null);
      setSelectedSessionId('');
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'মিলানো সম্ভব হয়নি।');
    } finally {
      setMatching(false);
    }
  };

  const filterTabs: Array<{ id: SmsFilter; label: string }> = [
    { id: 'all', label: 'সব' },
    { id: 'matched', label: 'মিলেছে' },
    { id: 'unmatched', label: 'মেলেনি' },
    { id: 'duplicate_trxid', label: 'ডুপ্লিকেট TrxID' },
    { id: 'late', label: 'দেরিতে এসেছে' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SMS লগ</h1>
      </div>

      {/* Filter & Search */}
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
            placeholder="TrxID, প্রেরক বা SMS খুঁজুন..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Account-wide SMS Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredSms.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-sm font-semibold text-slate-700">এখনো কোনো SMS লগ নেই</p>
            <p className="text-xs text-slate-400 mt-1">
              ফোন অ্যাপ থেকে পেমেন্ট SMS এলে এখানে লাইভ দেখা যাবে
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
                  <th className="py-3 px-4">প্রাপ্তির সময়</th>
                  <th className="py-3 px-4">ফলাফল</th>
                  <th className="py-3 px-4 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSms.map((sms) => {
                  const isExpanded = expandedId === sms.id;
                  return (
                    <React.Fragment key={sms.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : sms.id)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
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
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <SmsMatchChip result={sms.matchResult} />
                            {sms.simulated && <TestModeBadge label="TEST · সিমুলেশন" />}
                            {sms.dismissed && (
                              <span className="text-[11px] text-slate-400">(বাদ দেওয়া)</span>
                            )}
                          </div>
                        </td>
                        <td
                          className="py-3.5 px-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-2">
                            {(sms.matchResult === 'unmatched' || !sms.matched) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMatchTarget(sms);
                                  setSelectedSessionId(waitingSessions[0]?.id || '');
                                  setMatchError(null);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                সেশনের সাথে মিলিয়ে দাও
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : sms.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              aria-label="মূল SMS দেখুন"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={7} className="px-4 py-3.5">
                            <div className="text-xs font-semibold text-slate-500 mb-1.5">
                              মূল SMS বার্তা
                            </div>
                            <pre className="p-3 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap break-words">
                              {sms.raw || '(কোনো মূল টেক্সট নেই)'}
                            </pre>
                            {sms.sessionId && (
                              <div className="mt-2 text-xs text-slate-500 font-mono">
                                সংযুক্ত সেশন: {sms.sessionId}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Match Unmatched SMS to Waiting Session Modal */}
      {matchTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900">সেশনের সাথে মিলিয়ে দাও</h2>
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
              <div className="flex items-center justify-between">
                <span>পরিমাণ:</span>
                <strong className="tabular-nums">{formatBdt(matchTarget.amountPaisa)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>TrxID:</span>
                <strong className="font-mono">{matchTarget.trxId}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>প্রেরক:</span>
                <strong className="font-mono">{matchTarget.sender}</strong>
              </div>
            </div>

            {waitingSessions.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 mb-4">
                বর্তমানে কোনো অপেক্ষমাণ সেশন নেই।
              </div>
            ) : (
              <form onSubmit={handleConfirmMatch} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    অপেক্ষমাণ সেশন নির্বাচন করুন
                  </label>
                  <select
                    required
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">— সেশন বাছাই করুন —</option>
                    {waitingSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.orderId} · {s.method.toUpperCase()} · {formatBdt(s.payablePaisa)}
                      </option>
                    ))}
                  </select>
                </div>

                {matchError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{matchError}</span>
                  </div>
                )}

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
                    disabled={matching || !selectedSessionId}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                  >
                    {matching ? 'মিলানো হচ্ছে...' : 'মিলিয়ে দিন'}
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
