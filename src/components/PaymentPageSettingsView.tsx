import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  ImagePlus,
  Link2,
  Lock,
  Save,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import {
  compressLogoFileToDataUrl,
  resolveStoreCheckoutOptions,
} from '../lib/checkoutFlow';
import { HostedPaymentPage } from './HostedPaymentPage';
import { StoreBrandAvatar } from './PaymentMethodMarks';
import { PaymentMethodsManager } from './PaymentMethodsManager';

export const PaymentPageSettingsView: React.FC = () => {
  const {
    selectedStore,
    selectedStorePermissions,
    selectedStoreIsPaused,
    savePaymentPageSettings,
    saveStorePaymentMethods,
  } = usePayVerify();

  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');

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
    setError(null);
    setSavedNotice(false);
  }, [selectedStore]);

  const previewOptions = useMemo(() => {
    if (!selectedStore) return [];
    return resolveStoreCheckoutOptions(selectedStore);
  }, [selectedStore]);

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

  const handleSaveBranding = async (e: React.FormEvent) => {
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
            onClick={(e) => void handleSaveBranding(e)}
            disabled={!canEdit || saving}
            data-testid="save-payment-page-settings-btn"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50 shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'সংরক্ষণ হচ্ছে…' : 'ব্র্যান্ডিং সংরক্ষণ করুন'}
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
          <span>দোকানের নাম ও লোগো সংরক্ষিত হয়েছে।</span>
        </div>
      )}

      {/* Section 1: Store Name (Bangla & English) + Logo */}
      <form
        onSubmit={handleSaveBranding}
        className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-5"
      >
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

        {canEdit && (
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-xl bg-teal-600 text-white text-xs sm:text-sm font-bold hover:bg-teal-700 disabled:opacity-50 shadow-xs"
            >
              <Save className="w-4 h-4" />
              {saving ? 'সংরক্ষণ হচ্ছে…' : 'ব্র্যান্ডিং সংরক্ষণ করুন'}
            </button>
          </div>
        )}
      </form>

      {/* Section 2: Unified Single-Source Payment Methods & Numbers */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">পেমেন্ট মাধ্যম ও নম্বরসমূহ</h2>
          <span className="text-xs text-slate-500">
            প্রতিটি নম্বরের পাশে “সংরক্ষণ করুন” চাপলেই সেটি সংরক্ষিত হবে; বন্ধ মাধ্যম কাস্টমার দেখবেন না
          </span>
        </div>

        <PaymentMethodsManager
          store={selectedStore}
          canEdit={canEdit}
          onSaveMethods={(nextAccounts, nextEnabled) =>
            saveStorePaymentMethods(selectedStore.id, nextAccounts, nextEnabled)
          }
          showBulkRuleBar
          showHonestCustomerPreview
          layout="stack"
        />
      </section>

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
