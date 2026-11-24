import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  ImagePlus,
  Link2,
  Lock,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import {
  CHECKOUT_METHOD_BRANDS,
  CHECKOUT_METHODS,
  compressLogoFileToDataUrl,
  normalizePaymentAccounts,
  resolveStoreCheckoutOptions,
} from '../lib/checkoutFlow';
import type {
  CheckoutWalletMethod,
  MethodNumberEntry,
  NumberAccountType,
  PaymentAccountsMap,
} from '../types/payment';
import { HostedPaymentPage } from './HostedPaymentPage';
import { PaymentMethodMark, StoreBrandAvatar } from './PaymentMethodMarks';

function createEmptyEntry(): MethodNumberEntry {
  return { number: '', type: 'personal', active: true };
}

export const PaymentPageSettingsView: React.FC = () => {
  const {
    selectedStore,
    selectedStorePermissions,
    selectedStoreIsPaused,
    savePaymentPageSettings,
  } = usePayVerify();

  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [enabled, setEnabled] = useState<{ bkash: boolean; nagad: boolean; rocket: boolean }>({
    bkash: true,
    nagad: true,
    rocket: true,
  });
  const [accounts, setAccounts] = useState<PaymentAccountsMap>({
    bkash: [createEmptyEntry()],
    nagad: [createEmptyEntry()],
    rocket: [createEmptyEntry()],
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedStore) return;
    setName(selectedStore.name || '');
    setNameEn(selectedStore.nameEn || '');
    setLogoUrl(selectedStore.logoUrl || '');
    setLogoDataUrl(selectedStore.logoDataUrl || '');
    setEnabled({
      bkash: Boolean(selectedStore.numberEnabled.bkash),
      nagad: Boolean(selectedStore.numberEnabled.nagad),
      rocket: Boolean(selectedStore.numberEnabled.rocket),
    });
    const normalized = normalizePaymentAccounts(
      selectedStore.paymentAccounts,
      selectedStore.numbers
    );
    setAccounts({
      bkash: normalized.bkash.length > 0 ? normalized.bkash : [createEmptyEntry()],
      nagad: normalized.nagad.length > 0 ? normalized.nagad : [createEmptyEntry()],
      rocket: normalized.rocket.length > 0 ? normalized.rocket : [createEmptyEntry()],
    });
    setError(null);
    setSavedNotice(false);
  }, [selectedStore]);

  const previewOptions = useMemo(() => {
    return resolveStoreCheckoutOptions({
      numberEnabled: { ...enabled, upay: false },
      numbers: { bkash: '', nagad: '', rocket: '', upay: '' },
      paymentAccounts: accounts,
    });
  }, [enabled, accounts]);

  if (!selectedStore) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">পেমেন্ট পেজ সেটিংস</h1>
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-600">
          প্রথমে একটি স্টোর নির্বাচন করুন অথবা নতুন স্টোর তৈরি করুন।
        </div>
      </div>
    );
  }

  const canEdit = selectedStorePermissions.canEditSettings && !selectedStoreIsPaused;

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingLogo(true);
    try {
      const dataUrl = await compressLogoFileToDataUrl(file);
      setLogoDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'লোগো আপলোড করা যায়নি।');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateMethodEntry = (
    method: CheckoutWalletMethod,
    idx: number,
    patch: Partial<MethodNumberEntry>
  ) => {
    setAccounts((prev) => ({
      ...prev,
      [method]: prev[method].map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }));
  };

  const addMethodEntry = (method: CheckoutWalletMethod) => {
    setAccounts((prev) => {
      if (prev[method].length >= 10) return prev;
      return {
        ...prev,
        [method]: [...prev[method], createEmptyEntry()],
      };
    });
  };

  const removeMethodEntry = (method: CheckoutWalletMethod, idx: number) => {
    setAccounts((prev) => {
      const next = prev[method].filter((_, i) => i !== idx);
      return {
        ...prev,
        [method]: next.length > 0 ? next : [createEmptyEntry()],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    setSavedNotice(false);
    setSaving(true);
    try {
      await savePaymentPageSettings(selectedStore.id, {
        name,
        nameEn,
        logoUrl,
        logoDataUrl,
        numberEnabled: enabled,
        paymentAccounts: accounts,
      });
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সেটিংস সংরক্ষণ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">পেমেন্ট পেজ সেটিংস</h1>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            data-testid="open-checkout-preview-btn"
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <Eye className="w-4 h-4 text-teal-700" />
            প্রিভিউ
          </button>
          <button
            type="button"
            onClick={(e) => void handleSave(e)}
            disabled={!canEdit || saving}
            data-testid="save-payment-page-settings-btn"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50 shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
          {selectedStoreIsPaused
            ? 'এই স্টোরটি বর্তমানে পজ করা আছে। প্ল্যান আপগ্রেড করে পুনরায় সক্রিয় করুন।'
            : 'আপনার বর্তমান রোলে পেমেন্ট পেজ সেটিংস পরিবর্তন করার অনুমতি নেই। আপনি প্রিভিউ দেখতে পারবেন।'}
        </div>
      )}

      {error && (
        <div
          className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm font-medium text-rose-800"
          data-testid="payment-page-settings-error"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {savedNotice && (
        <div
          className="flex items-center gap-2.5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-900"
          data-testid="payment-page-settings-saved"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>পেমেন্ট পেজ সেটিংস সংরক্ষিত হয়েছে — নতুন সব সেশনে সাথে সাথেই কার্যকর হবে।</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Store Name (Bangla & English) + Logo */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">দোকানের নাম ও লোগো</h2>

            {/* Live Header Preview Chip */}
            <div
              className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200/80"
              data-testid="branding-header-preview"
            >
              <StoreBrandAvatar
                name={name || selectedStore.name}
                nameEn={nameEn}
                logoUrl={logoUrl}
                logoDataUrl={logoDataUrl}
                size="sm"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate max-w-[180px]">
                  {name.trim() || selectedStore.name}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {nameEn.trim() && (
                    <span className="text-slate-500 truncate max-w-[110px]">{nameEn.trim()}</span>
                  )}
                  <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700">
                    <Lock className="w-2.5 h-2.5" />
                    নিরাপদ পেমেন্ট
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="pp-store-name-bn" className="block text-xs font-bold text-slate-700">
                দোকানের নাম (বাংলা) <span className="text-rose-600">*</span>
              </label>
              <input
                id="pp-store-name-bn"
                type="text"
                maxLength={80}
                value={name}
                disabled={!canEdit}
                onChange={(e) => setName(e.target.value)}
                placeholder="যেমন: কেনাএক্স বাংলাদেশ"
                data-testid="input-store-name-bn"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pp-store-name-en" className="block text-xs font-bold text-slate-700">
                দোকানের নাম (ইংরেজি)
              </label>
              <input
                id="pp-store-name-en"
                type="text"
                maxLength={80}
                value={nameEn}
                disabled={!canEdit}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. KenaX Bangladesh"
                data-testid="input-store-name-en"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50"
              />
            </div>
          </div>

          {/* Logo Upload OR Image URL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700">লোগো আপলোড করুন</div>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => void handleLogoFileChange(e)}
                  disabled={!canEdit || uploadingLogo}
                  className="hidden"
                  id="pp-logo-upload"
                />
                <label
                  htmlFor="pp-logo-upload"
                  className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800 cursor-pointer transition-colors ${
                    !canEdit || uploadingLogo ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <ImagePlus className="w-4 h-4 text-teal-700" />
                  {uploadingLogo ? 'প্রসেস হচ্ছে…' : 'ইমেজ ফাইল বাছাই করুন'}
                </label>

                {logoDataUrl && canEdit && (
                  <button
                    type="button"
                    onClick={() => setLogoDataUrl('')}
                    className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    <X className="w-3.5 h-3.5" />
                    আপলোড সরান
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                PNG, JPG বা WebP ফাইল আপলোড করুন। লোগো না থাকলে দোকানের নামের ব্যাজ দেখাবে।
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pp-logo-url" className="block text-xs font-bold text-slate-700">
                অথবা লোগো ইমেজ URL
              </label>
              <div className="relative">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="pp-logo-url"
                  type="url"
                  maxLength={512}
                  value={logoUrl}
                  disabled={!canEdit}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://yourstore.com/logo.png"
                  data-testid="input-store-logo-url"
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                আপলোড করা লোগো থাকলে সেটি অগ্রাধিকার পাবে; লিঙ্ক কাজ না করলে স্বয়ংক্রিয় ব্যাজ দেখাবে।
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Payment Methods ON/OFF + Multiple Personal/Agent Numbers */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">পেমেন্ট মাধ্যম ও নম্বরসমূহ</h2>
            <span className="text-xs text-slate-500">
              বন্ধ রাখা মাধ্যম কাস্টমারের পেমেন্ট পেজে দেখাবে না
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {CHECKOUT_METHODS.map((method) => {
              const brand = CHECKOUT_METHOD_BRANDS[method];
              const isOn = enabled[method];
              const rows = accounts[method];

              return (
                <div
                  key={method}
                  data-testid={`method-config-card-${method}`}
                  className={`bg-white rounded-2xl border transition-colors shadow-xs overflow-hidden ${
                    isOn ? 'border-slate-200/90' : 'border-slate-200/60 opacity-80'
                  }`}
                >
                  {/* Method Header + Toggle */}
                  <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <PaymentMethodMark method={method} className="w-10 h-10 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-base font-extrabold"
                            style={{ color: brand.primaryHex }}
                          >
                            {brand.name}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            ({brand.nameBn})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {isOn ? 'কাস্টমার পেমেন্ট পেজে চালু আছে' : 'বর্তমানে বন্ধ আছে'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      disabled={!canEdit}
                      data-testid={`toggle-method-${method}`}
                      onClick={() =>
                        setEnabled((prev) => ({
                          ...prev,
                          [method]: !prev[method],
                        }))
                      }
                      className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
                        isOn
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-slate-100 border-slate-300 text-slate-600'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isOn ? 'bg-emerald-600' : 'bg-slate-400'
                        }`}
                      />
                      {isOn ? 'চালু (ON)' : 'বন্ধ (OFF)'}
                    </button>
                  </div>

                  {/* Numbers Pool for This Method */}
                  <div className="p-5 space-y-3">
                    {rows.map((entry, idx) => (
                      <div
                        key={`${method}-${idx}`}
                        className="flex flex-col sm:flex-row sm:items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/70"
                      >
                        <div className="flex-1 min-w-0">
                          <label className="sr-only" htmlFor={`num-${method}-${idx}`}>
                            {brand.name} নম্বর {idx + 1}
                          </label>
                          <input
                            id={`num-${method}-${idx}`}
                            type="tel"
                            inputMode="tel"
                            disabled={!canEdit}
                            value={entry.number}
                            onChange={(e) =>
                              updateMethodEntry(method, idx, { number: e.target.value })
                            }
                            placeholder="01XXXXXXXXX"
                            data-testid={`input-number-${method}-${idx}`}
                            className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                          />
                        </div>

                        {/* Personal / Agent Selector */}
                        <div
                          className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shrink-0"
                          role="group"
                          aria-label="নম্বরের ধরন"
                        >
                          {(['personal', 'agent'] as NumberAccountType[]).map((t) => {
                            const active = entry.type === t;
                            return (
                              <button
                                key={t}
                                type="button"
                                disabled={!canEdit}
                                data-testid={`type-${method}-${idx}-${t}`}
                                onClick={() => updateMethodEntry(method, idx, { type: t })}
                                className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                                  active
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                {t === 'personal' ? 'Personal' : 'Agent'}
                              </button>
                            );
                          })}
                        </div>

                        {/* Active Toggle + Delete */}
                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={entry.active}
                              disabled={!canEdit}
                              onChange={(e) =>
                                updateMethodEntry(method, idx, { active: e.target.checked })
                              }
                              className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            সক্রিয়
                          </label>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeMethodEntry(method, idx)}
                              aria-label="নম্বর মুছুন"
                              className="min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {canEdit && rows.length < 10 && (
                      <button
                        type="button"
                        onClick={() => addMethodEntry(method)}
                        data-testid={`add-number-${method}`}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        আরেকটি {brand.name} নম্বর যোগ করুন
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Sticky-friendly Save Bar */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50"
          >
            <Eye className="w-4 h-4 text-teal-700" />
            পেমেন্ট পেজ প্রিভিউ দেখুন
          </button>
          <button
            type="submit"
            disabled={!canEdit || saving}
            className="inline-flex items-center gap-2 min-h-[46px] px-6 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50 shadow-xs"
          >
            <Save className="w-4 h-4" />
            {saving ? 'সংরক্ষণ হচ্ছে…' : 'পরিবর্তন সংরক্ষণ করুন'}
          </button>
        </div>
      </form>

      {/* Safe Full-Screen Preview Modal (TEST Mode — creates zero real sessions) */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="পেমেন্ট পেজ প্রিভিউ"
          data-testid="checkout-preview-modal"
        >
          <HostedPaymentPage
            sessionId="preview-test-session"
            previewConfig={{
              storeName: name.trim() || selectedStore.name,
              storeNameEn: nameEn.trim(),
              logoUrl: logoUrl.trim(),
              logoDataUrl: logoDataUrl.trim(),
              orderId: 'TEST-INV-2026',
              payablePaisa: 125000,
              sessionMinutes: selectedStore.sessionMinutes || 15,
              methods: previewOptions,
              onClosePreview: () => setPreviewOpen(false),
            }}
          />
        </div>
      )}
    </div>
  );
};
