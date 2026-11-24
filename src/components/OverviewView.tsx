import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock,
  MessageSquareWarning,
  Smartphone,
  Store,
  Wallet,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import {
  computeDashboardMetrics,
  computeLast7DaysPaid,
  formatBanglaDateTime,
  formatBdt,
} from '../lib/money';
import {
  computeSetupChecklist,
  evaluateDeviceFreshness,
  isSmsUnmatchedForInbox,
} from '../lib/platformLogic';

export type OverviewTargetTab =
  | 'sessions'
  | 'unmatched_sms'
  | 'sms'
  | 'store_settings'
  | 'my_stores'
  | 'device'
  | 'api_docs';

interface OverviewViewProps {
  onNavigate: (tab: OverviewTargetTab) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  const {
    selectedStore,
    storeSessions,
    smsList,
    devices,
    dataLoading,
    selectedStorePermissions,
    markStoreLiveManually,
  } = usePayVerify();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [markingLive, setMarkingLive] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const metrics = useMemo(
    () => computeDashboardMetrics(storeSessions, smsList.filter(isSmsUnmatchedForInbox), nowMs),
    [storeSessions, smsList, nowMs]
  );

  const last7Days = useMemo(
    () => computeLast7DaysPaid(storeSessions, nowMs),
    [storeSessions, nowMs]
  );

  const maxDailyPaisa = useMemo(
    () => last7Days.reduce((max, b) => (b.totalPaisa > max ? b.totalPaisa : max), 0),
    [last7Days]
  );

  const total7DayPaisa = useMemo(
    () => last7Days.reduce((sum, b) => sum + b.totalPaisa, 0),
    [last7Days]
  );

  const activeDevices = useMemo(() => devices.filter((d) => d.active), [devices]);
  const latestDevice = useMemo(() => {
    if (activeDevices.length === 0) return null;
    return [...activeDevices].sort((a, b) => (b.lastSeenAtMs ?? 0) - (a.lastSeenAtMs ?? 0))[0];
  }, [activeDevices]);

  const deviceFreshness = useMemo(
    () => evaluateDeviceFreshness(latestDevice?.lastSeenAtMs ?? null, nowMs),
    [latestDevice, nowMs]
  );

  const checklist = useMemo(
    () => computeSetupChecklist(selectedStore, devices, storeSessions),
    [selectedStore, devices, storeSessions]
  );

  const hasConfirmedTest = useMemo(
    () => storeSessions.some((s) => s.status === 'paid'),
    [storeSessions]
  );

  const handleMarkLive = async () => {
    if (!selectedStore) return;
    setMarkingLive(true);
    try {
      await markStoreLiveManually(selectedStore.id);
    } finally {
      setMarkingLive(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ওভারভিউ</h1>
        {!selectedStore && !dataLoading && (
          <button
            type="button"
            onClick={() => onNavigate('my_stores')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
          >
            <Store className="w-4 h-4" />
            প্রথম স্টোর তৈরি করুন
          </button>
        )}
      </div>

      {/* Feature #3: Real Setup Checklist (disappears automatically when all 4 steps are done) */}
      {!dataLoading && selectedStore && !checklist.allDone && (
        <div
          className="bg-white rounded-2xl border border-teal-200/80 p-5 shadow-xs space-y-4"
          data-testid="setup-checklist-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">সেটআপ চেকলিস্ট</h2>
            <span className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-md tabular-nums">
              {checklist.completedCount.toLocaleString('bn-BD')} / ৪ সম্পন্ন
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {checklist.steps.map((step) => (
              <div
                key={step.id}
                className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 ${
                  step.done
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span
                    className={`text-sm font-semibold ${
                      step.done ? 'text-emerald-900' : 'text-slate-800'
                    }`}
                  >
                    {step.labelBn}
                  </span>
                </div>

                {!step.done && (
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(step.targetTab)}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                    >
                      সেট করুন
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    {step.id === 'live' &&
                      hasConfirmedTest &&
                      selectedStorePermissions.canEditSettings && (
                        <button
                          type="button"
                          disabled={markingLive}
                          onClick={() => void handleMarkLive()}
                          className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          {markingLive ? '...' : 'সম্পন্ন চিহ্নিত করুন'}
                        </button>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Live Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-600">আজকের মোট পেমেন্ট</span>
            <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">
            {dataLoading ? '—' : formatBdt(metrics.todayTotalPaisa)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-600">আজ মিলেছে কয়টা</span>
            <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">
            {dataLoading ? '—' : metrics.todayMatchedCount.toLocaleString('bn-BD')}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('sessions')}
          className="text-left bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-600">অপেক্ষমাণ সেশন</span>
            <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {dataLoading ? '—' : metrics.waitingCount.toLocaleString('bn-BD')}
            </span>
            <ArrowUpRight className="w-4 h-4 text-slate-400" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('unmatched_sms')}
          className="text-left bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-rose-300 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-600">মেলেনি এমন SMS</span>
            <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
              <MessageSquareWarning className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {dataLoading ? '—' : metrics.unmatchedSmsCount.toLocaleString('bn-BD')}
            </span>
            <ArrowUpRight className="w-4 h-4 text-slate-400" />
          </div>
        </button>
      </div>

      {/* Device Status + 7-Day Paid Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Device Status Card (Feature #2) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">ফোন সংযোগের অবস্থা</h2>
              {latestDevice ? (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                    deviceFreshness.status === 'fresh'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      deviceFreshness.status === 'fresh' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  {deviceFreshness.labelBn}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-slate-100 text-slate-600 border-slate-200">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  সংযুক্ত নয়
                </span>
              )}
            </div>

            <div className="mt-5 flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  latestDevice && deviceFreshness.status === 'fresh'
                    ? 'bg-teal-100 text-teal-700'
                    : 'bg-slate-200/80 text-slate-500'
                }`}
              >
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {latestDevice ? latestDevice.name : 'কোনো ফোন যুক্ত নেই'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  শেষ যোগাযোগ: {formatBanglaDateTime(latestDevice?.lastSeenAtMs ?? null)}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('device')}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            ফোন সংযোগ পরিচালনা করুন
          </button>
        </div>

        {/* 7-Day Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <h2 className="text-base font-bold text-slate-900">গত ৭ দিনের পেমেন্ট</h2>
            <span className="text-sm font-semibold text-teal-700 tabular-nums">
              মোট: {formatBdt(total7DayPaisa)}
            </span>
          </div>

          {total7DayPaisa === 0 ? (
            <div className="h-44 rounded-xl bg-slate-50/80 border border-dashed border-slate-200 flex flex-col items-center justify-center text-center px-4">
              <p className="text-sm font-medium text-slate-600">
                গত ৭ দিনে এখনো কোনো পরিশোধিত পেমেন্ট নেই
              </p>
              <p className="text-xs text-slate-400 mt-1">
                নতুন পেমেন্ট মিললেই এখানে দৈনিক চার্ট দেখা যাবে
              </p>
            </div>
          ) : (
            <div className="h-48 flex items-end justify-between gap-2 sm:gap-4 pt-6">
              {last7Days.map((bucket) => {
                const ratio = maxDailyPaisa > 0 ? bucket.totalPaisa / maxDailyPaisa : 0;
                const heightPct = bucket.totalPaisa > 0 ? Math.max(10, Math.round(ratio * 100)) : 3;
                return (
                  <div
                    key={bucket.dateKey}
                    className="flex-1 flex flex-col items-center gap-2 min-w-0 h-full justify-end"
                  >
                    <div className="text-[11px] font-semibold text-slate-600 tabular-nums truncate max-w-full">
                      {bucket.totalPaisa > 0 ? formatBdt(bucket.totalPaisa) : '৳0'}
                    </div>
                    <div className="w-full max-w-[42px] h-28 bg-slate-100 rounded-lg flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          bucket.totalPaisa > 0 ? 'bg-teal-500' : 'bg-slate-200'
                        }`}
                        style={{ height: `${heightPct}%` }}
                        title={`${bucket.label}: ${formatBdt(bucket.totalPaisa)} (${bucket.count})`}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500 truncate max-w-full">
                      {bucket.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
