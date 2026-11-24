import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Palette,
  RefreshCw,
  Save,
  Trash2,
  UserPlus,
  Users,
  Webhook,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatBanglaDateTime, parseTimestampMs } from '../lib/money';
import { DEFAULT_STORE_ACCENT, type StoreMemberRole } from '../types/payment';
import { ReauthModal } from './ReauthModal';
import { PaymentMethodsManager } from './PaymentMethodsManager';

const ROLE_LABELS_BN: Record<StoreMemberRole, string> = {
  'co-owner': 'সহ-মালিক (Co-owner)',
  manager: 'ম্যানেজার (Manager)',
  viewer: 'দর্শক (Viewer)',
};

type PendingSensitiveAction =
  | { kind: 'rotate_key' }
  | { kind: 'save_webhook' }
  | { kind: 'add_member'; email: string; role: StoreMemberRole }
  | { kind: 'remove_member'; uid: string }
  | null;

export const StoreSettingsView: React.FC = () => {
  const {
    selectedStore,
    selectedStorePermissions,
    selectedStoreIsPaused,
    effectivePlan,
    saveStorePaymentMethods,
    saveStoreSettings,
    rotateStoreKey,
    addStoreMember,
    removeStoreMember,
  } = usePayVerify();

  const [name, setName] = useState('');
  const [uniquePaisa, setUniquePaisa] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(15);
  const [logoUrl, setLogoUrl] = useState('');
  const [accentColor, setAccentColor] = useState(DEFAULT_STORE_ACCENT);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecretInput, setWebhookSecretInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  // Store Key Rotation Modal (one-time display)
  const [rotating, setRotating] = useState(false);
  const [newStoreKey, setNewStoreKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Team Member Form
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<StoreMemberRole>('manager');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);

  // Re-auth Gate for Sensitive Actions
  const [pendingSensitive, setPendingSensitive] = useState<PendingSensitiveAction>(null);

  useEffect(() => {
    if (!selectedStore) return;
    setName(selectedStore.name);
    setUniquePaisa(selectedStore.uniquePaisa);
    setSessionMinutes(selectedStore.sessionMinutes);
    setLogoUrl(selectedStore.logoUrl);
    setAccentColor(selectedStore.accentColor || DEFAULT_STORE_ACCENT);
    setWebhookUrl(selectedStore.webhookUrl);
    setWebhookSecretInput('');
    setError(null);
    setSavedNotice(false);
  }, [selectedStore]);

  if (!selectedStore) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">স্টোর সেটিংস</h1>
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-600">
          প্রথমে একটি স্টোর নির্বাচন করুন অথবা নতুন স্টোর তৈরি করুন।
        </div>
      </div>
    );
  }

  const canEdit = selectedStorePermissions.canEditSettings && !selectedStoreIsPaused;
  const lastWebhook = selectedStore.lastWebhook;
  const lastWebhookMs = lastWebhook ? parseTimestampMs(lastWebhook.at) : null;

  const persistStoreSettings = async () => {
    setError(null);
    setSavedNotice(false);
    setSaving(true);
    try {
      await saveStoreSettings(selectedStore.id, {
        name,
        uniquePaisa,
        sessionMinutes,
        logoUrl,
        accentColor,
        webhookUrl,
        webhookSecret: webhookSecretInput || undefined,
      });
      setWebhookSecretInput('');
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সংরক্ষণ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const webhookChanged =
      webhookUrl.trim() !== (selectedStore.webhookUrl || '').trim() ||
      webhookSecretInput.trim().length > 0;
    if (webhookChanged) {
      setPendingSensitive({ kind: 'save_webhook' });
      return;
    }
    await persistStoreSettings();
  };

  const executeRotateKey = async () => {
    setError(null);
    setRotating(true);
    try {
      const rawKey = await rotateStoreKey(selectedStore.id);
      setNewStoreKey(rawKey);
      setCopiedKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'স্টোর কী পরিবর্তন করা যায়নি।');
    } finally {
      setRotating(false);
    }
  };

  const handleCopyKey = async () => {
    if (!newStoreKey) return;
    try {
      await navigator.clipboard.writeText(newStoreKey);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStoreIsPaused) return;
    setMemberError(null);
    setMemberSuccess(null);
    setPendingSensitive({
      kind: 'add_member',
      email: memberEmail.trim(),
      role: memberRole,
    });
  };

  const executeAddMember = async (email: string, role: StoreMemberRole) => {
    setMemberError(null);
    setMemberSuccess(null);
    setMemberBusy(true);
    try {
      await addStoreMember(selectedStore.id, email, role);
      setMemberEmail('');
      setMemberSuccess('মেম্বার সফলভাবে যুক্ত হয়েছেন।');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'মেম্বার যুক্ত করা যায়নি।');
    } finally {
      setMemberBusy(false);
    }
  };

  const executeRemoveMember = async (uid: string) => {
    setMemberError(null);
    setMemberSuccess(null);
    setMemberBusy(true);
    try {
      await removeStoreMember(selectedStore.id, uid);
      setMemberSuccess('মেম্বার সরানো হয়েছে।');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'মেম্বার সরানো যায়নি।');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleReauthConfirmed = async () => {
    const action = pendingSensitive;
    setPendingSensitive(null);
    if (!action) return;
    if (action.kind === 'rotate_key') {
      await executeRotateKey();
    } else if (action.kind === 'save_webhook') {
      await persistStoreSettings();
    } else if (action.kind === 'add_member') {
      await executeAddMember(action.email, action.role);
    } else if (action.kind === 'remove_member') {
      await executeRemoveMember(action.uid);
    }
  };

  const getReauthCopy = (): { title: string; description: string } => {
    if (!pendingSensitive) return { title: '', description: '' };
    if (pendingSensitive.kind === 'rotate_key') {
      return {
        title: 'স্টোর কী রোটেশন নিশ্চিত করুন',
        description:
          'নতুন স্টোর কী তৈরি করলে পুরোনো কী সাথে সাথেই বাতিল হয়ে যাবে। এগিয়ে যেতে আপনার পরিচয় পুনরায় যাচাই করুন।',
      };
    }
    if (pendingSensitive.kind === 'save_webhook') {
      return {
        title: 'ওয়েববুক পরিবর্তন নিশ্চিত করুন',
        description:
          'ওয়েববুক URL বা সিক্রেট পরিবর্তন একটি সংবেদনশীল কাজ। সংরক্ষণ করতে আপনার পরিচয় পুনরায় যাচাই করুন।',
      };
    }
    if (pendingSensitive.kind === 'add_member') {
      return {
        title: 'নতুন মেম্বার যুক্ত নিশ্চিত করুন',
        description: `${pendingSensitive.email}-কে এই স্টোরে যুক্ত করতে আপনার পরিচয় পুনরায় যাচাই করুন।`,
      };
    }
    return {
      title: 'মেম্বার সরানো নিশ্চিত করুন',
      description: 'এই টিম মেম্বারের অ্যাক্সেস সরাতে আপনার পরিচয় পুনরায় যাচাই করুন।',
    };
  };

  const reauthCopy = getReauthCopy();

  const memberEntries = Object.entries(selectedStore.memberRoles) as Array<
    [string, StoreMemberRole]
  >;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">স্টোর সেটিংস</h1>
        <div className="flex items-center gap-2">
          {selectedStoreIsPaused && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-xs font-bold text-amber-900">
              প্ল্যান লিমিটের বাইরে — পজ
            </span>
          )}
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
            আপনার ভূমিকা: {selectedStorePermissions.roleLabelBn}
          </span>
        </div>
      </div>

      {selectedStoreIsPaused && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>
            <strong>প্ল্যান লিমিটের বাইরে — পজ:</strong> আপনার বর্তমান প্ল্যানের স্টোর সীমার বাইরে থাকায় এই স্টোরটি শুধু পড়ার জন্য পজ করা আছে। প্ল্যান আপগ্রেড বা লিমিট বাড়ালে এটি স্বয়ংক্রিয়ভাবে পুনরায় চালু হবে।
          </span>
        </div>
      )}

      {!selectedStoreIsPaused && !selectedStorePermissions.canEditSettings && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          এই স্টোরে আপনার ভূমিকা ({selectedStorePermissions.roleLabelBn}) হওয়ায় সেটিংস পরিবর্তন করা যাবে না।
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {savedNotice && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>স্টোর সেটিংস সংরক্ষিত হয়েছে।</span>
        </div>
      )}

      {/* Unified Single-Source Payment Methods & Numbers (independent explicit save per number) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">রিসিভিং পেমেন্ট নম্বর ও মাধ্যম</h2>
          <span className="text-xs text-slate-500">
            পেমেন্ট পেজ সেটিংস এবং স্টোর সেটিংস একই তালিকা ব্যবহার করে
          </span>
        </div>
        <PaymentMethodsManager
          store={selectedStore}
          canEdit={canEdit}
          onSaveMethods={(nextAccounts, nextEnabled) =>
            saveStorePaymentMethods(selectedStore.id, nextAccounts, nextEnabled)
          }
          showBulkRuleBar={false}
          showHonestCustomerPreview
          layout="grid"
        />
      </section>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Store General + Payment Page Branding */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">স্টোর তথ্য ও পেমেন্ট পেজ ব্র্যান্ডিং</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                স্টোরের নাম
              </label>
              <input
                type="text"
                required
                disabled={!canEdit}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                সেশনের মেয়াদ (মিনিট)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                required
                disabled={!canEdit}
                value={sessionMinutes}
                onChange={(e) => setSessionMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums text-slate-900 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                লোগো URL (ঐচ্ছিক)
              </label>
              <input
                type="url"
                disabled={!canEdit}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://your-shop.com/logo.png"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs text-slate-900 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                অ্যাকসেন্ট রঙ
              </label>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  disabled={!canEdit}
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-11 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer disabled:opacity-50"
                />
                <input
                  type="text"
                  disabled={!canEdit}
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  maxLength={7}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 font-mono text-xs text-slate-900 disabled:bg-slate-50"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                ইউনিক পয়সা চালু করুন (uniquePaisa)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                একই সময়ে সমপরিমাণ অর্ডার আলাদা করতে সামান্য পয়সা যোগ হয়
              </div>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              role="switch"
              aria-checked={uniquePaisa}
              aria-label="ইউনিক পয়সা চালু বা বন্ধ করুন"
              onClick={() => setUniquePaisa((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                uniquePaisa ? 'bg-teal-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  uniquePaisa ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Webhook URL & Secret (Re-auth gated on change) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-indigo-700" />
              <h2 className="text-base font-bold text-slate-900">ওয়েববুক কনফিগারেশন</h2>
            </div>
            {selectedStore.webhookSecretSet && (
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                সিক্রেট: সেট করা আছে
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Webhook URL
              </label>
              <input
                type="url"
                disabled={!canEdit}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-shop.com/api/payverify-webhook"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs text-slate-900 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Webhook Secret {selectedStore.webhookSecretSet ? '(নতুন দিতে লিখুন)' : ''}
              </label>
              <input
                type="password"
                disabled={!canEdit}
                value={webhookSecretInput}
                onChange={(e) => setWebhookSecretInput(e.target.value)}
                placeholder={
                  selectedStore.webhookSecretSet
                    ? 'সেট করা আছে (পরিবর্তন করতে নতুন দিন)'
                    : 'নতুন ওয়েববুক সিক্রেট লিখুন'
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs text-slate-900 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-600 mb-2">সর্বশেষ ওয়েববুক ফলাফল</div>
            {!lastWebhook ? (
              <div className="text-xs text-slate-400">এখনো কোনো ওয়েববুক পাঠানো হয়নি।</div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span
                  className={`px-2 py-0.5 rounded font-semibold ${
                    lastWebhook.ok
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {lastWebhook.ok ? 'সফল' : 'ব্যর্থ'}
                </span>
                <span className="font-mono text-slate-700">
                  অর্ডার: {lastWebhook.orderId || '—'}
                </span>
                <span className="font-mono text-slate-700">
                  HTTP: {lastWebhook.status !== undefined ? String(lastWebhook.status) : '—'}
                </span>
                <span className="text-slate-500">{formatBanglaDateTime(lastWebhookMs)}</span>
                {lastWebhook.error && (
                  <span className="font-mono text-rose-700">{lastWebhook.error}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              data-testid="save-store-general-settings-btn"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 shadow-xs"
            >
              <Save className="w-4 h-4" />
              {saving ? 'সংরক্ষণ হচ্ছে...' : 'স্টোর তথ্য সংরক্ষণ করুন'}
            </button>
          </div>
        )}
      </form>

      {/* Store Key & Rotation (Primary Owner ONLY + Re-auth Gated) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">স্টোর API কী (x-store-key)</h2>
          </div>

          {selectedStorePermissions.canRotateStoreKey && !selectedStoreIsPaused && (
            <button
              type="button"
              disabled={rotating}
              onClick={() => setPendingSensitive({ kind: 'rotate_key' })}
              data-testid="rotate-store-key-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {rotating ? 'তৈরি হচ্ছে...' : 'নতুন কী তৈরি করুন (রোটেট)'}
            </button>
          )}
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono">
            {selectedStore.storeKeyLegacy
              ? 'পূর্ববর্তী স্টোর কী সক্রিয় রয়েছে (কোনো পরিবর্তন ছাড়াই চলবে)'
              : `কী হ্যাশ: ${selectedStore.storeKeyHash.slice(0, 12)}••••••••••••`}
          </span>
          <span className="text-slate-500">নিরাপত্তার জন্য আসল কী পুনরায় দেখানো হয় না</span>
        </div>
      </div>

      {/* Shared Access / Store Members (Re-auth Gated) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">টিম মেম্বার (শেয়ার্ড অ্যাক্সেস)</h2>
          </div>
          {effectivePlan && (
            <span className="text-xs text-slate-500 tabular-nums">
              প্ল্যান মেম্বার সীমা: {effectivePlan.features.members.toLocaleString('bn-BD')} জন
            </span>
          )}
        </div>

        {memberError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {memberError}
          </div>
        )}
        {memberSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {memberSuccess}
          </div>
        )}

        {selectedStorePermissions.canManageMembers && !selectedStoreIsPaused && (
          <form onSubmit={handleAddMemberSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              type="email"
              required
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="মেম্বারের অ্যাকাউন্ট ইমেইল লিখুন"
              className="sm:col-span-6 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as StoreMemberRole)}
              className="sm:col-span-3 px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="co-owner">সহ-মালিক</option>
              <option value="manager">ম্যানেজার</option>
              <option value="viewer">দর্শক</option>
            </select>
            <button
              type="submit"
              disabled={memberBusy}
              className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              যুক্ত করুন
            </button>
          </form>
        )}

        {memberEntries.length === 0 ? (
          <div className="text-xs text-slate-400 py-2">
            এখনো কোনো অতিরিক্ত মেম্বার যুক্ত করা হয়নি।
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {memberEntries.map(([uid, role]) => (
              <div
                key={uid}
                className="px-4 py-3 flex items-center justify-between gap-3 bg-white text-sm"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-900 truncate">
                    {selectedStore.memberEmails[uid] || uid}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{ROLE_LABELS_BN[role]}</div>
                </div>
                {selectedStorePermissions.canManageMembers && !selectedStoreIsPaused && (
                  <button
                    type="button"
                    disabled={memberBusy}
                    onClick={() => setPendingSensitive({ kind: 'remove_member', uid })}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    সরান
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Password / Google Re-auth Modal for Sensitive Store Actions */}
      <ReauthModal
        open={pendingSensitive !== null}
        actionTitle={reauthCopy.title}
        actionDescription={reauthCopy.description}
        onCancel={() => setPendingSensitive(null)}
        onConfirmed={handleReauthConfirmed}
      />

      {/* One-Time Store Key Display Modal */}
      {newStoreKey && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          data-testid="rotated-store-key-modal"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">নতুন স্টোর কী</h2>
              <button
                type="button"
                onClick={() => setNewStoreKey(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              এই কীটি শুধুমাত্র <strong>একবারই</strong> দেখানো হচ্ছে। নিরাপদ স্থানে সংরক্ষণ করুন।
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={newStoreKey}
                className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-900"
              />
              <button
                type="button"
                onClick={() => void handleCopyKey()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? 'কপি হয়েছে' : 'কপি'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNewStoreKey(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              সংরক্ষণ করেছি, বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
