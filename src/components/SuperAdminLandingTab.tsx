import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  Image as ImageIcon,
  Megaphone,
  Monitor,
  Plus,
  Save,
  Smartphone,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { BENEFIT_ICON_OPTIONS, normalizeLandingConfig } from '../lib/landingConfig';
import { PublicLandingPage } from './PublicLandingPage';
import type {
  BenefitIconKey,
  HeroMediaType,
  LandingPageConfig,
  PayPlatformConfig,
} from '../types/payment';

async function compressImageFileToDataUrl(
  file: File,
  maxWidth: number,
  maxBytes: number
): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ছবি পড়া যায়নি।'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('সঠিক ছবির ফাইল বেছে নিন (PNG, JPG বা WebP)।'));
    el.src = rawDataUrl;
  });

  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ছবি প্রসেস করা যায়নি।');
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of [0.85, 0.72, 0.58, 0.45]) {
    const candidate = canvas.toDataURL('image/webp', quality);
    if (candidate.length <= maxBytes && candidate.startsWith('data:image/')) {
      return candidate;
    }
  }
  const pngFallback = canvas.toDataURL('image/jpeg', 0.65);
  if (pngFallback.length > maxBytes) {
    throw new Error('ছবির সাইজ বেশি বড়। ছোট রেজোলিউশনের ছবি দিন অথবা HTTPS URL ব্যবহার করুন।');
  }
  return pngFallback;
}

function toDatetimeLocalValue(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SuperAdminLandingTab: React.FC = () => {
  const { platformConfig, plans, adminSavePlatformSettings } = usePayVerify();

  const [brandLogoUrl, setBrandLogoUrl] = useState(platformConfig.brandLogoUrl);
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState(platformConfig.brandLogoDataUrl);
  const [supportWhatsApp, setSupportWhatsApp] = useState(platformConfig.supportWhatsApp);
  const [supportPhone, setSupportPhone] = useState(platformConfig.supportPhone);
  const [draft, setDraft] = useState<LandingPageConfig>(() =>
    normalizeLandingConfig(platformConfig.landing)
  );
  const [offerEndLocal, setOfferEndLocal] = useState(() =>
    toDatetimeLocalValue(platformConfig.landing.announcement.offerEndsAtMs)
  );

  const [showPreview, setShowPreview] = useState(true);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setBrandLogoUrl(platformConfig.brandLogoUrl);
    setBrandLogoDataUrl(platformConfig.brandLogoDataUrl);
    setSupportWhatsApp(platformConfig.supportWhatsApp);
    setSupportPhone(platformConfig.supportPhone);
    const normalized = normalizeLandingConfig(platformConfig.landing);
    setDraft(normalized);
    setOfferEndLocal(toDatetimeLocalValue(normalized.announcement.offerEndsAtMs));
  }, [platformConfig]);

  const previewPlatformConfig: PayPlatformConfig = useMemo(
    () => ({
      ...platformConfig,
      brandLogoUrl: brandLogoUrl.trim(),
      brandLogoDataUrl,
      supportWhatsApp: supportWhatsApp.trim(),
      supportPhone: supportPhone.trim(),
      landing: {
        ...draft,
        announcement: {
          ...draft.announcement,
          offerEndsAtMs: offerEndLocal ? new Date(offerEndLocal).getTime() || null : null,
        },
      },
    }),
    [platformConfig, brandLogoUrl, brandLogoDataUrl, supportWhatsApp, supportPhone, draft, offerEndLocal]
  );

  const handleUploadBrandLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 256, 62_000);
      setBrandLogoDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'লোগো আপলোড ব্যর্থ হয়েছে।');
    }
  };

  const handleUploadHeroMediaImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'hero' | 'poster'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 960, 190_000);
      setDraft((prev) => ({
        ...prev,
        hero: {
          ...prev.hero,
          ...(target === 'hero' ? { imageDataUrl: dataUrl } : { videoPosterDataUrl: dataUrl }),
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ছবি আপলোড ব্যর্থ হয়েছে।');
    }
  };

  const moveBenefit = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= draft.benefits.length) return;
    setDraft((prev) => {
      const next = [...prev.benefits];
      const [item] = next.splice(index, 1);
      next.splice(nextIdx, 0, item);
      return { ...prev, benefits: next };
    });
  };

  const moveFaq = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= draft.faqs.length) return;
    setDraft((prev) => {
      const next = [...prev.faqs];
      const [item] = next.splice(index, 1);
      next.splice(nextIdx, 0, item);
      return { ...prev, faqs: next };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const offerEndsAtMs = offerEndLocal ? new Date(offerEndLocal).getTime() : null;
      const cleanLanding = normalizeLandingConfig({
        ...draft,
        announcement: {
          ...draft.announcement,
          offerEndsAtMs:
            offerEndsAtMs && Number.isFinite(offerEndsAtMs) ? Math.trunc(offerEndsAtMs) : null,
        },
      });
      await adminSavePlatformSettings(
        {
          brandLogoUrl: brandLogoUrl.trim(),
          brandLogoDataUrl,
          supportWhatsApp: supportWhatsApp.trim(),
          supportPhone: supportPhone.trim(),
          landing: cleanLanding,
        },
        'ল্যান্ডিং পেজ ও ব্র্যান্ড বিজ্ঞাপন সেটিংস আপডেট'
      );
      setNotice('ল্যান্ডিং পেজের পরিবর্তন সংরক্ষিত হয়েছে — পাবলিক পেজে এখনই দেখা যাচ্ছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="super-admin-landing-tab">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Top Save & Live Preview Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-slate-900">ল্যান্ডিং পেজ / বিজ্ঞাপন সম্পাদক</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              পাবলিক ল্যান্ডিং পেজের লেখা, হিরো মিডিয়া, সুবিধা, FAQ ও সাপোর্ট নম্বর এখান থেকে পরিবর্তন করুন।
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              data-testid="toggle-landing-preview-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Eye className="w-4 h-4" />
              {showPreview ? 'প্রিভিউ লুকান' : 'লাইভ প্রিভিউ দেখুন'}
            </button>
            <button
              type="submit"
              disabled={saving}
              data-testid="save-landing-settings-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </div>

        {/* 1. Brand Logo & Support Contacts */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">ব্র্যান্ড লোগো ও সাপোর্ট যোগাযোগ</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                নিজের লোগো আপলোড বা HTTPS লিংক
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  লোগো আপলোড
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleUploadBrandLogo(e)}
                    className="hidden"
                  />
                </label>
                {brandLogoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setBrandLogoDataUrl('')}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    মুছুন
                  </button>
                )}
              </div>
              <input
                type="url"
                value={brandLogoUrl}
                onChange={(e) => setBrandLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png (ঐচ্ছিক)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  সাপোর্ট WhatsApp নম্বর
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={supportWhatsApp}
                  onChange={(e) => setSupportWhatsApp(e.target.value)}
                  placeholder="017XXXXXXXX (ফাঁকা রাখলে লুকানো)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  সাপোর্ট ফোন নম্বর
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="017XXXXXXXX (ফাঁকা রাখলে লুকানো)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Announcement Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">ঘোষণা বার (Announcement Bar)</h3>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.announcement.enabled}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    announcement: { ...prev.announcement, enabled: e.target.checked },
                  }))
                }
                className="rounded border-slate-300 text-teal-600"
              />
              চালু করুন
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">ঘোষণার লেখা</label>
              <input
                type="text"
                maxLength={200}
                value={draft.announcement.text}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    announcement: { ...prev.announcement, text: e.target.value },
                  }))
                }
                placeholder="যেমন: নতুন মার্চেন্টদের জন্য বাৎসরিক প্যাকেজে বিশেষ ছাড়"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                অফার শেষের তারিখ (ঐচ্ছিক — বাস্তব কাউন্টডাউন)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="datetime-local"
                  value={offerEndLocal}
                  onChange={(e) => setOfferEndLocal(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
                {offerEndLocal && (
                  <button
                    type="button"
                    onClick={() => setOfferEndLocal('')}
                    className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
                    title="তারিখ মুছুন"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Hero Copy & Media */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">হিরো সেকশন ও মিডিয়া</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">শিরোনাম (Headline)</label>
              <input
                type="text"
                required
                maxLength={140}
                value={draft.hero.headline}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    hero: { ...prev.hero, headline: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">মূল বাটনের লেখা</label>
              <input
                type="text"
                required
                maxLength={60}
                value={draft.hero.ctaText}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    hero: { ...prev.hero, ctaText: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                সহায়ক লাইন (১ লাইন)
              </label>
              <input
                type="text"
                maxLength={260}
                value={draft.hero.supportingLine}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    hero: { ...prev.hero, supportingLine: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold text-slate-700">হিরো মিডিয়া ধরন</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { id: 'three_step', label: '৩-ধাপ ভিজ্যুয়াল (ডিফল্ট)', icon: CheckCircle2 },
                  { id: 'image', label: 'ছবি (Image)', icon: ImageIcon },
                  { id: 'video', label: 'ভিডিও (MP4 / YouTube)', icon: Video },
                ] as Array<{ id: HeroMediaType; label: string; icon: React.ComponentType<{ className?: string }> }>
              ).map((opt) => {
                const Icon = opt.icon;
                const active = draft.hero.mediaType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, mediaType: opt.id },
                      }))
                    }
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-teal-50 border-teal-500 text-teal-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {draft.hero.mediaType === 'image' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ছবির HTTPS লিংক
                  </label>
                  <input
                    type="url"
                    value={draft.hero.imageUrl}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, imageUrl: e.target.value },
                      }))
                    }
                    placeholder="https://example.com/hero.jpg"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    অথবা ছবি আপলোড করুন
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      ছবি বেছে নিন
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => void handleUploadHeroMediaImage(e, 'hero')}
                        className="hidden"
                      />
                    </label>
                    {draft.hero.imageDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            hero: { ...prev.hero, imageDataUrl: '' },
                          }))
                        }
                        className="text-xs font-semibold text-rose-700"
                      >
                        মুছুন
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {draft.hero.mediaType === 'video' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ভিডিও লিংক (MP4 URL বা YouTube লিংক)
                  </label>
                  <input
                    type="url"
                    value={draft.hero.videoUrl}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, videoUrl: e.target.value },
                      }))
                    }
                    placeholder="https://youtu.be/... অথবা https://example.com/demo.mp4"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    পোস্টার ছবি URL (মোবাইলে প্লে বাটনের আগে দেখাবে)
                  </label>
                  <input
                    type="url"
                    value={draft.hero.videoPosterUrl}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, videoPosterUrl: e.target.value },
                      }))
                    }
                    placeholder="https://example.com/poster.jpg"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    অথবা পোস্টার আপলোড করুন
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      পোস্টার আপলোড
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => void handleUploadHeroMediaImage(e, 'poster')}
                        className="hidden"
                      />
                    </label>
                    {draft.hero.videoPosterDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            hero: { ...prev.hero, videoPosterDataUrl: '' },
                          }))
                        }
                        className="text-xs font-semibold text-rose-700"
                      >
                        মুছুন
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. How It Works 3 Steps */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">কীভাবে কাজ করে (৩টি ধাপ)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[0, 1, 2].map((idx) => (
              <div key={idx}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ধাপ {idx + 1}
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={draft.howItWorksSteps[idx]}
                  onChange={(e) => {
                    const nextSteps = [...draft.howItWorksSteps] as [string, string, string];
                    nextSteps[idx] = e.target.value;
                    setDraft((prev) => ({ ...prev, howItWorksSteps: nextSteps }));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 5. Benefits (Add / Remove / Reorder) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">সুবিধাসমূহ (Benefit Rows)</h3>
            <button
              type="button"
              disabled={draft.benefits.length >= 12}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  benefits: [
                    ...prev.benefits,
                    { id: `ben_${Date.now()}`, icon: 'shield', text: '' },
                  ],
                }))
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              যোগ করুন
            </button>
          </div>

          <div className="space-y-2">
            {draft.benefits.map((b, idx) => (
              <div key={b.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <select
                  value={b.icon}
                  onChange={(e) => {
                    const icon = e.target.value as BenefitIconKey;
                    setDraft((prev) => ({
                      ...prev,
                      benefits: prev.benefits.map((item, i) =>
                        i === idx ? { ...item, icon } : item
                      ),
                    }));
                  }}
                  className="px-2.5 py-2 rounded-xl border border-slate-200 text-xs bg-white shrink-0"
                >
                  {BENEFIT_ICON_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.labelBn}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={b.text}
                  onChange={(e) => {
                    const text = e.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      benefits: prev.benefits.map((item, i) =>
                        i === idx ? { ...item, text } : item
                      ),
                    }));
                  }}
                  placeholder="সুবিধার সংক্ষিপ্ত লাইন"
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveBenefit(idx, -1)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === draft.benefits.length - 1}
                    onClick={() => moveBenefit(idx, 1)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={draft.benefits.length <= 1}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        benefits: prev.benefits.filter((_, i) => i !== idx),
                      }))
                    }
                    className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. FAQs (Add / Remove / Reorder) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">প্রশ্ন ও উত্তর (FAQ)</h3>
            <button
              type="button"
              disabled={draft.faqs.length >= 20}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  faqs: [
                    ...prev.faqs,
                    { id: `faq_${Date.now()}`, question: '', answer: '' },
                  ],
                }))
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              নতুন প্রশ্ন
            </button>
          </div>

          <div className="space-y-3">
            {draft.faqs.map((faq, idx) => (
              <div
                key={faq.id}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    maxLength={180}
                    value={faq.question}
                    onChange={(e) => {
                      const question = e.target.value;
                      setDraft((prev) => ({
                        ...prev,
                        faqs: prev.faqs.map((item, i) =>
                          i === idx ? { ...item, question } : item
                        ),
                      }));
                    }}
                    placeholder="প্রশ্ন লিখুন"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                  />
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveFaq(idx, -1)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === draft.faqs.length - 1}
                    onClick={() => moveFaq(idx, 1)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        faqs: prev.faqs.filter((_, i) => i !== idx),
                      }))
                    }
                    className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  rows={2}
                  required
                  maxLength={600}
                  value={faq.answer}
                  onChange={(e) => {
                    const answer = e.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      faqs: prev.faqs.map((item, i) =>
                        i === idx ? { ...item, answer } : item
                      ),
                    }));
                  }}
                  placeholder="উত্তর লিখুন"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 7. Final CTA Band */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              শেষ ব্যানারের শিরোনাম
            </label>
            <input
              type="text"
              maxLength={180}
              value={draft.finalCtaHeadline}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, finalCtaHeadline: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              শেষ বাটনের লেখা
            </label>
            <input
              type="text"
              maxLength={60}
              value={draft.finalCtaButtonText}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, finalCtaButtonText: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
            />
          </div>
        </div>
      </form>

      {/* Live Preview Panel with Desktop / Mobile Toggle */}
      {showPreview && (
        <div
          className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
          data-testid="landing-live-preview-panel"
        >
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <span className="text-sm font-bold text-slate-900">লাইভ প্রিভিউ (সংরক্ষণের আগে দেখুন)</span>
            <div className="inline-flex items-center p-1 rounded-xl bg-white border border-slate-200">
              <button
                type="button"
                onClick={() => setPreviewViewport('desktop')}
                data-testid="preview-desktop-btn"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  previewViewport === 'desktop'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                ডেস্কটপ
              </button>
              <button
                type="button"
                onClick={() => setPreviewViewport('mobile')}
                data-testid="preview-mobile-btn"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  previewViewport === 'mobile'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                মোবাইল
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-100/80 flex justify-center">
            <div
              className={`bg-[#FFF9EC] border border-slate-300 rounded-2xl overflow-y-auto max-h-[680px] shadow-md transition-all ${
                previewViewport === 'mobile' ? 'w-[375px] max-w-full' : 'w-full'
              }`}
            >
              <PublicLandingPage
                platformConfig={previewPlatformConfig}
                plans={plans}
                onSelectPaidPlan={() => {}}
                onStartTrial={() => {}}
                previewMode={previewViewport}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
