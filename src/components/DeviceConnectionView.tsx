import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  Copy,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatBanglaDateTime, formatCountdown } from '../lib/money';
import { evaluateDeviceFreshness } from '../lib/platformLogic';
import {
  canPairAnotherDevice,
  formatLimitBn,
  isPairingTokenUsable,
} from '../lib/planEngine';
import type { PairingTokenDoc } from '../types/payment';

export const DeviceConnectionView: React.FC = () => {
  const {
    account,
    effectivePlan,
    platformConfig,
    devices,
    pairingTokens,
    deviceRejectedAlerts,
    issueSingleUsePairingToken,
    revokeDevice,
  } = usePayVerify();

  const [deviceName, setDeviceName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [issuedToken, setIssuedToken] = useState<{
    token: PairingTokenDoc;
    qrDataUrl: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const activeDevices = useMemo(() => devices.filter((d) => d.active), [devices]);

  const pairCheck = useMemo(() => {
    if (!account || !effectivePlan) {
      return { allowed: false, limit: 1, planName: '', reasonBn: null };
    }
    return canPairAnotherDevice(account, effectivePlan, activeDevices.length, nowMs);
  }, [account, effectivePlan, activeDevices.length, nowMs]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGenerating(true);
    try {
      const targetName = deviceName.trim() || 'দোকানের ফোন';
      const { token, qrPayload } = await issueSingleUsePairingToken(targetName);
      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        width: 240,
        margin: 2,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      setIssuedToken({ token, qrDataUrl });
      setDeviceName('');
      setCopiedCode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'এককালীন পেয়ারিং টোকেন তৈরি করা যায়নি।');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token.code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setError('কোড কপি করা যায়নি।');
    }
  };

  const handleRevoke = async (deviceId: string) => {
    setError(null);
    setRevokingId(deviceId);
    try {
      await revokeDevice(deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ডিভাইস বাতিল করা যায়নি।');
    } finally {
      setRevokingId(null);
    }
  };

  const modalRemainingMs = issuedToken
    ? Math.max(0, issuedToken.token.expiresAtMs - nowMs)
    : 0;

  return (
    <div className="space-y-6 max-w-4xl" data-testid="device-connection-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ফোন সংযোগ</h1>
        {effectivePlan && (
          <span className="px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 tabular-nums">
            সক্রিয় ডিভাইস: {activeDevices.length.toLocaleString('bn-BD')} /{' '}
            {formatLimitBn(effectivePlan.deviceLimit)}
          </span>
        )}
      </div>

      {/* Server-reported device_rejected alerts (shown ONLY if any exist) */}
      {deviceRejectedAlerts.length > 0 && (
        <div
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2"
          data-testid="device-rejected-alerts"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>অঅনুমোদিত বা বাতিল ডিভাইসের সংযোগ চেষ্টা প্রত্যাখ্যাত হয়েছে</span>
          </div>
          <div className="space-y-1.5">
            {deviceRejectedAlerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className="text-xs text-rose-900 bg-white/80 border border-rose-200/80 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <span>{alert.detail || alert.note}</span>
                <span className="text-rose-700 font-mono">
                  {formatBanglaDateTime(alert.createdAtMs)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Account identity notice */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-teal-50/70 border border-teal-200/80 text-xs text-teal-900">
        <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
        <span>
          অ্যান্ড্রয়েড অ্যাপ শুধু আপনার ড্যাশবোর্ডের এককালীন পেয়ারিং টোকেন দিয়েই যুক্ত হয় — আলাদা কোনো অ্যাপ সাইন-আপ নেই। প্রতিটি টোকেন ১০ মিনিট পর মেয়াদোত্তীর্ণ হয়।
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Active Paired Devices */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900">সংযুক্ত ডিভাইস</h2>

          {activeDevices.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">কোনো সক্রিয় ফোন নেই</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  এককালীন টোকেন স্ক্যান করে আপনার অ্যান্ড্রয়েড ফোন যুক্ত করুন
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDevices.map((dev) => {
                const freshness = evaluateDeviceFreshness(dev.lastSeenAtMs, nowMs);
                return (
                  <div
                    key={dev.id}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            freshness.status === 'fresh'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {dev.name}
                          </div>
                          {dev.model && (
                            <div className="text-[11px] text-slate-500 truncate">{dev.model}</div>
                          )}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap ${
                          freshness.status === 'fresh'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            freshness.status === 'fresh' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        {freshness.labelBn}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 space-y-0.5">
                      <div>যুক্ত হওয়ার সময়: {formatBanglaDateTime(dev.pairedAtMs ?? dev.createdAtMs)}</div>
                      <div>শেষ যোগাযোগ: {formatBanglaDateTime(dev.lastSeenAtMs)}</div>
                      {dev.installId && (
                        <div className="font-mono text-[11px] text-slate-500">
                          Install ID: {dev.installId.slice(0, 14)}
                          {dev.installId.length > 14 ? '…' : ''}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      {freshness.status === 'stale' ? (
                        <span className="text-[11px] text-amber-800">
                          ফোন অফলাইন থাকলে পেমেন্ট নিশ্চিত হতে দেরি হতে পারে
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        disabled={revokingId === dev.id}
                        onClick={() => void handleRevoke(dev.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 shrink-0"
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        {revokingId === dev.id ? 'বাতিল হচ্ছে...' : 'সংযোগ সরান'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Single-Use 10-Minute Pairing Token Form */}
        <form
          onSubmit={handleGenerate}
          className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">নতুন এককালীন পেয়ারিং টোকেন</h2>

          {!pairCheck.allowed && pairCheck.reasonBn && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              {pairCheck.reasonBn}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              ফোনের নাম (চেনার জন্য)
            </label>
            <input
              type="text"
              maxLength={64}
              disabled={!pairCheck.allowed}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="যেমন: দোকানের Android ফোন"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {!platformConfig.workerBaseUrl && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              প্ল্যাটফর্মের Worker URL এখনো সেট করা হয়নি; QR কোড তৈরি হলেও অ্যাপে Worker URL দরকার হবে।
            </div>
          )}

          <button
            type="submit"
            disabled={generating || !pairCheck.allowed}
            data-testid="issue-pairing-token-btn"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            {generating ? 'টোকেন তৈরি হচ্ছে...' : 'এককালীন পেয়ারিং কোড ও QR তৈরি করুন'}
          </button>
        </form>
      </div>

      {/* Recent Single-Use Pairing Tokens */}
      {pairingTokens.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">সাম্প্রতিক পেয়ারিং টোকেন</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">ফোনের নাম</th>
                  <th className="py-3 px-5">কোড</th>
                  <th className="py-3 px-5">তৈরির সময়</th>
                  <th className="py-3 px-5">অবস্থা</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {pairingTokens.slice(0, 8).map((tok) => {
                  const usable = isPairingTokenUsable(tok, nowMs);
                  const remaining = Math.max(0, tok.expiresAtMs - nowMs);
                  return (
                    <tr key={tok.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-5 font-semibold text-slate-900">
                        {tok.deviceName || 'দোকানের ফোন'}
                      </td>
                      <td className="py-3 px-5 font-mono text-slate-700">
                        {usable ? tok.code : `${tok.code.slice(0, 4)}••••••`}
                      </td>
                      <td className="py-3 px-5 text-slate-500">
                        {formatBanglaDateTime(tok.createdAtMs)}
                      </td>
                      <td className="py-3 px-5">
                        {tok.usedAtMs !== null ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                            ব্যবহৃত
                          </span>
                        ) : usable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold font-mono tabular-nums">
                            <Clock className="w-3 h-3" />
                            সক্রিয় ({formatCountdown(remaining)})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-500 font-semibold">
                            মেয়াদ শেষ
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Registered Devices History Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">ডিভাইস তালিকা</h2>
        </div>

        {devices.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-semibold text-slate-700">এখনো কোনো ফোন যুক্ত করা হয়নি</p>
            <p className="text-xs text-slate-400 mt-1">
              এককালীন পেয়ারিং কোড তৈরি করে Android SMS অ্যাপে স্ক্যান করুন
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">ফোন ও মডেল</th>
                  <th className="py-3 px-5">যুক্ত হওয়ার তারিখ</th>
                  <th className="py-3 px-5">শেষ যোগাযোগ</th>
                  <th className="py-3 px-5">অবস্থা</th>
                  <th className="py-3 px-5 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {devices.map((d) => {
                  const freshness = evaluateDeviceFreshness(d.lastSeenAtMs, nowMs);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900">{d.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {d.model || 'মডেল অজানা'}
                          {d.installId ? ` · ${d.installId.slice(0, 10)}` : ''}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-500">
                        {formatBanglaDateTime(d.pairedAtMs ?? d.createdAtMs)}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-500">
                        {formatBanglaDateTime(d.lastSeenAtMs)}
                      </td>
                      <td className="py-3.5 px-5">
                        {!d.active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border bg-slate-100 text-slate-600 border-slate-200">
                            বাতিলকৃত
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                              freshness.status === 'fresh'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {freshness.labelBn}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        {d.active ? (
                          <button
                            type="button"
                            disabled={revokingId === d.id}
                            onClick={() => void handleRevoke(d.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                            {revokingId === d.id ? 'বাতিল হচ্ছে...' : 'সংযোগ বিচ্ছিন্ন করুন'}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">সরানো হয়েছে</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single-Use 10-Minute Pairing Token + QR Modal */}
      {issuedToken && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          data-testid="pairing-token-modal"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">এককালীন পেয়ারিং কোড ও QR</h2>
              <button
                type="button"
                onClick={() => setIssuedToken(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="বন্ধ করুন"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-900">
              <span>একবার ব্যবহারযোগ্য টোকেন</span>
              <span className="inline-flex items-center gap-1 font-mono font-bold tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                {modalRemainingMs > 0
                  ? `বাকি ${formatCountdown(modalRemainingMs)}`
                  : 'মেয়াদ শেষ'}
              </span>
            </div>

            <div className="flex flex-col items-center">
              <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs">
                <img
                  src={issuedToken.qrDataUrl}
                  alt="এককালীন ফোন পেয়ারিং QR কোড"
                  className="w-52 h-52 object-contain"
                />
              </div>
              <div className="text-xs font-semibold text-slate-600 mt-2">
                {issuedToken.token.deviceName || 'দোকানের ফোন'}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                এককালীন পেয়ারিং কোড
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={issuedToken.token.code}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-sm font-bold tracking-wider text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 shrink-0"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      কপি হয়েছে
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      কপি
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIssuedToken(null)}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
