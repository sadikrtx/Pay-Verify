import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  MessageCircle,
  MessageSquareText,
  Phone,
  Play,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Wallet,
  Zap,
} from 'lucide-react';
import { PaymentLogo } from './PaymentLogo';
import { PayVerifyBrandMark } from './PayVerifyBrandMark';
import {
  buildPhoneHref,
  buildWhatsAppHref,
  buildYouTubeEmbedUrl,
  computeRealOfferCountdown,
  isDirectVideoUrl,
  parseYouTubeVideoId,
  resolveConfiguredTrialPlan,
  type FunnelStatusBanner,
} from '../lib/funnelLogic';
import {
  formatLimitBn,
  formatPlanPriceBn,
  PLAN_FEATURE_LABELS_BN,
} from '../lib/planEngine';
import { toBanglaDigits } from '../lib/checkoutFlow';
import {
  WALLET_METHODS,
  type BenefitIconKey,
  type PayPlanDoc,
  type PayPlatformConfig,
} from '../types/payment';

interface PublicLandingPageProps {
  platformConfig: PayPlatformConfig;
  plans: PayPlanDoc[];
  onSelectPaidPlan: (plan: PayPlanDoc, billingCycle: 'monthly' | 'yearly') => void;
  onStartTrial: (trialPlan: PayPlanDoc) => void;
  initialScrollToPricing?: boolean;
  statusBanner?: FunnelStatusBanner | null;
  onDismissBanner?: () => void;
  /** Used inside Super Admin live preview to force desktop or mobile layout without touching real navigation */
  previewMode?: 'desktop' | 'mobile' | null;
}

const BENEFIT_ICONS: Record<BenefitIconKey, React.ComponentType<{ className?: string }>> = {
  sms: MessageSquareText,
  checkout: CreditCard,
  stores: Store,
  qr: QrCode,
  shield: ShieldCheck,
  zap: Zap,
  wallet: Wallet,
  clock: Clock,
};

const STEP_NUMBERS_BN = ['১', '২', '৩'];

function padBn2(n: number): string {
  return toBanglaDigits(String(Math.max(0, n)).padStart(2, '0'));
}

export const PublicLandingPage: React.FC<PublicLandingPageProps> = ({
  platformConfig,
  plans,
  onSelectPaidPlan,
  onStartTrial,
  initialScrollToPricing = false,
  statusBanner = null,
  onDismissBanner,
  previewMode = null,
}) => {
  const isPreview = Boolean(previewMode);
  const isForcedMobile = previewMode === 'mobile';
  const landing = platformConfig.landing;

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openFaqId, setOpenFaqId] = useState<string | null>(landing.faqs[0]?.id ?? null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() => {
    if (previewMode === 'mobile') return false;
    if (previewMode === 'desktop') return true;
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
  const [showMobileSticky, setShowMobileSticky] = useState(false);

  useEffect(() => {
    if (previewMode) {
      setIsDesktopViewport(previewMode === 'desktop');
      return;
    }
    const onResize = () => setIsDesktopViewport(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [previewMode]);

  useEffect(() => {
    if (isPreview) return;
    const onScroll = () => {
      setShowMobileSticky(window.scrollY > 240);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isPreview]);

  // Tick every second ONLY when announcement bar has a real future offer end timestamp
  const hasRealFutureOffer =
    landing.announcement.enabled &&
    typeof landing.announcement.offerEndsAtMs === 'number' &&
    landing.announcement.offerEndsAtMs > nowMs;

  useEffect(() => {
    if (!hasRealFutureOffer) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasRealFutureOffer]);

  useEffect(() => {
    if (!initialScrollToPricing || isPreview) return;
    const timer = window.setTimeout(() => {
      document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [initialScrollToPricing, isPreview]);

  const countdown = useMemo(
    () =>
      landing.announcement.enabled
        ? computeRealOfferCountdown(landing.announcement.offerEndsAtMs, nowMs)
        : null,
    [landing.announcement.enabled, landing.announcement.offerEndsAtMs, nowMs]
  );

  const visiblePlans = useMemo(
    () =>
      plans
        .filter((p) => p.visibleOnMarketing && !p.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAtMs - b.createdAtMs),
    [plans]
  );

  const hasAnyYearlyPrice = useMemo(
    () => visiblePlans.some((p) => p.priceYearly && p.priceYearly > 0),
    [visiblePlans]
  );

  const configuredTrialPlan = useMemo(
    () => resolveConfiguredTrialPlan(platformConfig, plans),
    [platformConfig, plans]
  );

  const whatsappHref = useMemo(
    () => buildWhatsAppHref(platformConfig.supportWhatsApp),
    [platformConfig.supportWhatsApp]
  );
  const phoneHref = useMemo(
    () => buildPhoneHref(platformConfig.supportPhone),
    [platformConfig.supportPhone]
  );

  const scrollToPricing = () => {
    if (isPreview) return;
    document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const heroImageSrc = (landing.hero.imageDataUrl || landing.hero.imageUrl || '').trim();
  const videoPosterSrc = (
    landing.hero.videoPosterDataUrl ||
    landing.hero.videoPosterUrl ||
    ''
  ).trim();
  const youtubeId = parseYouTubeVideoId(landing.hero.videoUrl);
  const directVideo = isDirectVideoUrl(landing.hero.videoUrl);
  const hasValidVideo = Boolean(youtubeId || directVideo);

  const renderHeroMedia = () => {
    // Mode (a): Image
    if (landing.hero.mediaType === 'image' && heroImageSrc) {
      return (
        <div className="rounded-3xl overflow-hidden border border-white/15 bg-white/10 shadow-2xl">
          <img
            src={heroImageSrc}
            alt={landing.hero.headline}
            className="w-full h-auto max-h-[380px] object-cover block"
          />
        </div>
      );
    }

    // Mode (b): Video (desktop muted autoplay with poster; mobile NEVER autoplays — shows poster + Play button)
    if (landing.hero.mediaType === 'video' && hasValidVideo) {
      const shouldAutoplayDesktop = isDesktopViewport && !isForcedMobile;
      const showActivePlayer = shouldAutoplayDesktop || videoPlaying;

      return (
        <div className="rounded-3xl overflow-hidden border border-white/15 bg-[#062421] shadow-2xl aspect-video relative">
          {!showActivePlayer ? (
            <button
              type="button"
              onClick={() => setVideoPlaying(true)}
              className="w-full h-full relative flex items-center justify-center group focus:outline-none"
              aria-label="ভিডিও চালু করুন"
            >
              {videoPosterSrc ? (
                <img
                  src={videoPosterSrc}
                  alt="ভিডিও প্রিভিউ"
                  className="w-full h-full object-cover opacity-85 group-hover:opacity-95 transition-opacity"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#0B3B36] to-[#0F766E] flex flex-col items-center justify-center gap-3 p-6 text-white/90">
                  <Smartphone className="w-10 h-10 text-[#F2A007]" />
                  <span className="text-sm font-semibold">কীভাবে কাজ করে দেখুন</span>
                </div>
              )}
              <span className="absolute inset-0 bg-black/25 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                <span className="w-16 h-16 rounded-full bg-[#F2A007] text-[#0B3B36] flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
                  <Play className="w-7 h-7 fill-current ml-1" />
                </span>
              </span>
            </button>
          ) : youtubeId ? (
            <iframe
              src={buildYouTubeEmbedUrl(youtubeId, {
                autoplay: true,
                muted: shouldAutoplayDesktop && !videoPlaying,
                loop: true,
              })}
              title="Pay Verify ডেমো ভিডিও"
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              src={landing.hero.videoUrl}
              poster={videoPosterSrc || undefined}
              autoPlay
              muted={shouldAutoplayDesktop && !videoPlaying}
              loop
              playsInline
              controls={!shouldAutoplayDesktop || videoPlaying}
              preload={shouldAutoplayDesktop ? 'metadata' : 'none'}
              className="w-full h-full object-cover"
            />
          )}
        </div>
      );
    }

    // Mode (c): Built-in clean 3-step visual (default when nothing is set)
    return (
      <div
        className="rounded-3xl bg-white/10 border border-white/15 backdrop-blur-xs p-5 sm:p-6 shadow-2xl space-y-4"
        data-testid="hero-three-step-visual"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-white/15">
          <span className="text-sm font-bold text-white">৩ ধাপে অটো-ভেরিফিকেশন</span>
          <span className="text-xs font-semibold text-teal-100">বিকাশ · নগদ · রকেট · উপায়</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3.5 rounded-2xl bg-white text-[#102624] p-3.5 shadow-sm">
            <span className="w-9 h-9 rounded-xl bg-[#FFF9EC] border border-[#EFE3C8] text-[#0B3B36] flex items-center justify-center shrink-0 font-bold text-sm">
              ১
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-snug">{landing.howItWorksSteps[0]}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WALLET_METHODS.map((m) => (
                  <PaymentLogo key={m} method={m} size="sm" />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl bg-white/95 text-[#102624] p-3.5 shadow-sm">
            <span className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 text-[#0F766E] flex items-center justify-center shrink-0">
              <Smartphone className="w-4.5 h-4.5" />
            </span>
            <div className="text-sm font-bold leading-snug">{landing.howItWorksSteps[1]}</div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl bg-[#FFF9EC] text-[#0B3B36] p-3.5 border border-[#F2A007]/40 shadow-sm">
            <span className="w-9 h-9 rounded-xl bg-[#0B3B36] text-[#F2A007] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </span>
            <div className="text-sm font-bold leading-snug">{landing.howItWorksSteps[2]}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`min-h-screen bg-[#FFF9EC] text-[#142523] ${
        !isPreview ? 'pb-20 lg:pb-0' : ''
      }`}
      data-testid="public-landing-page"
    >
      {/* Optional Announcement Bar (controlled by Super Admin; real countdown ONLY when real future offerEndsAtMs is set) */}
      {landing.announcement.enabled && landing.announcement.text.trim() && (
        <div
          className="bg-[#0B3B36] text-white border-b border-white/10"
          data-testid="landing-announcement-bar"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs sm:text-sm font-semibold">
            <span>{landing.announcement.text}</span>
            {countdown && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white/15 text-[#FDE68A] font-mono text-xs tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                {countdown.days > 0 ? `${toBanglaDigits(countdown.days)} দিন ` : ''}
                {padBn2(countdown.hours)}:{padBn2(countdown.minutes)}:{padBn2(countdown.seconds)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Slim Header — Owner Logo + "Pay Verify" (left) and "প্যাকেজ ও দাম" link (right). ZERO login button or login link! */}
      <header className="sticky top-0 z-30 bg-[#FFF9EC]/95 backdrop-blur-sm border-b border-[#E8DEC8]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a
            href="#top"
            onClick={(e) => {
              if (isPreview) e.preventDefault();
            }}
            className="focus:outline-none"
          >
            <PayVerifyBrandMark
              logoUrl={platformConfig.brandLogoUrl}
              logoDataUrl={platformConfig.brandLogoDataUrl}
              variant="dark"
              size="md"
            />
          </a>

          <button
            type="button"
            onClick={scrollToPricing}
            data-testid="header-pricing-link"
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold text-[#0B3B36] hover:bg-[#0B3B36]/8 transition-colors inline-flex items-center gap-1.5"
          >
            প্যাকেজ ও দাম
            <ArrowDown className="w-4 h-4 text-[#0F766E]" />
          </button>
        </div>
      </header>

      {/* Optional Status Notice Banner (e.g. returned cleanly from expired/cancelled payment in Step 3) */}
      {statusBanner && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5">
          <div
            className={`rounded-2xl p-4 border flex items-center justify-between gap-3 text-sm font-semibold ${
              statusBanner.tone === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-teal-50 border-teal-200 text-[#0B3B36]'
            }`}
            data-testid="funnel-status-banner"
          >
            <div className="space-y-0.5">
              {statusBanner.headline && (
                <div className="font-bold text-sm sm:text-base" data-testid="funnel-status-banner-headline">
                  {statusBanner.headline}
                </div>
              )}
              <div
                className={statusBanner.headline ? 'text-xs sm:text-sm font-medium opacity-90' : ''}
                data-testid="funnel-status-banner-body"
              >
                {statusBanner.message}
              </div>
            </div>
            {onDismissBanner && (
              <button
                type="button"
                onClick={onDismissBanner}
                className="text-xs font-bold underline shrink-0"
              >
                বন্ধ করুন
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 1 — HERO (Deep Teal Gradient Panel #0B3B36 -> #0F766E on Warm Ivory #FFF9EC) */}
      <section id="top" className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-10 sm:pb-14">
        <div className="rounded-[28px] bg-gradient-to-br from-[#0B3B36] via-[#0D524B] to-[#0F766E] text-white p-6 sm:p-10 lg:p-12 shadow-xl overflow-hidden">
          <div
            className={`grid gap-8 lg:gap-10 items-center ${
              isForcedMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'
            }`}
          >
            <div className={isForcedMobile ? 'space-y-5' : 'lg:col-span-7 space-y-6'}>
              <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.18] tracking-tight text-white">
                {landing.hero.headline}
              </h1>

              <p className="text-base sm:text-lg text-teal-50/90 leading-relaxed max-w-xl">
                {landing.hero.supportingLine}
              </p>

              {/* Official A4 Wallet Logo Chips — never redrawn */}
              <div className="flex flex-wrap items-center gap-2.5" data-testid="hero-wallet-logos">
                {WALLET_METHODS.map((method) => (
                  <PaymentLogo key={method} method={method} size="md" />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={scrollToPricing}
                  data-testid="hero-primary-cta"
                  className="min-h-[48px] px-7 py-3.5 rounded-2xl bg-[#F2A007] hover:bg-[#DC9005] active:scale-[0.99] text-[#1A1611] font-bold text-base shadow-lg transition-all inline-flex items-center justify-center gap-2"
                >
                  {landing.hero.ctaText}
                  <ArrowRight className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            <div className={isForcedMobile ? '' : 'lg:col-span-5'}>{renderHeroMedia()}</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — “কীভাবে কাজ করে” */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0B3B36] tracking-tight">
            কীভাবে কাজ করে
          </h2>
        </div>

        <div
          className={`grid gap-5 ${
            isForcedMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'
          }`}
        >
          {landing.howItWorksSteps.map((stepText, idx) => {
            const StepIcon = idx === 0 ? Wallet : idx === 1 ? Smartphone : CheckCircle2;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-[#E8DEC8] p-6 shadow-xs flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <span className="w-11 h-11 rounded-2xl bg-[#0B3B36] text-white flex items-center justify-center">
                    <StepIcon className="w-5 h-5" />
                  </span>
                  <span className="text-2xl font-bold text-[#0F766E]/35">
                    {STEP_NUMBERS_BN[idx]}
                  </span>
                </div>
                <p className="text-base font-bold text-[#142523] leading-snug">{stepText}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FOUR TRUE BENEFIT ROWS */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="bg-white rounded-3xl border border-[#E8DEC8] p-6 sm:p-9 shadow-xs">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0B3B36] tracking-tight mb-6">
            কেন Pay Verify ব্যবহার করবেন
          </h2>
          <div
            className={`grid gap-4 ${
              isForcedMobile ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {landing.benefits.map((item) => {
              const Icon = BENEFIT_ICONS[item.icon] || ShieldCheck;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-[#FFF9EC] border border-[#EFE3C8]"
                >
                  <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0B3B36] to-[#0F766E] text-white flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="text-base font-bold text-[#142523] leading-snug">
                    {item.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* STEP 2 — PLAN SELECTION (Built ONLY from real payPlans data) */}
      <section
        id="pricing-section"
        data-testid="step2-pricing-section"
        className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 scroll-mt-20"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0B3B36] tracking-tight">
            প্যাকেজ বেছে নিন
          </h2>

          {hasAnyYearlyPrice && (
            <div className="inline-flex items-center p-1 rounded-2xl bg-white border border-[#E8DEC8] self-start">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`min-h-[40px] px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-[#0B3B36] text-white'
                    : 'text-[#39504D] hover:text-[#0B3B36]'
                }`}
              >
                মাসিক
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`min-h-[40px] px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                  billingCycle === 'yearly'
                    ? 'bg-[#0B3B36] text-white'
                    : 'text-[#39504D] hover:text-[#0B3B36]'
                }`}
              >
                বাৎসরিক
              </button>
            </div>
          )}
        </div>

        {/* Optional Free Trial Card — shown ONLY when platformConfig.trialPlanId resolves to an active plan */}
        {configuredTrialPlan && (
          <div
            className="mb-6 rounded-2xl bg-white border-2 border-[#0F766E]/35 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
            data-testid="trial-plan-card"
          >
            <div className="space-y-1">
              <div className="text-lg font-bold text-[#0B3B36]">
                ৭ দিনের ফ্রি ট্রায়াল — {configuredTrialPlan.name}
              </div>
              <div className="text-sm text-[#39504D]">
                কোনো অগ্রিম পেমেন্ট ছাড়াই শুরু করে দেখুন। ট্রায়াল শেষে যেকোনো প্যাকেজে আপগ্রেড করতে পারবেন।
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!isPreview) onStartTrial(configuredTrialPlan);
              }}
              data-testid="start-free-trial-btn"
              className="min-h-[46px] px-6 py-3 rounded-xl bg-[#0F766E] hover:bg-[#0B3B36] text-white font-bold text-sm transition-colors shrink-0 inline-flex items-center justify-center gap-2"
            >
              ফ্রি ট্রায়াল শুরু করুন
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {visiblePlans.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E8DEC8] p-10 text-center space-y-2">
            <p className="text-base font-bold text-[#0B3B36]">
              প্যাকেজ তালিকা এখনো প্রকাশ করা হয়নি
            </p>
            <p className="text-sm text-[#4F6360]">
              প্যাকেজ সম্পর্কে জানতে নিচের সাপোর্ট নম্বরে যোগাযোগ করুন।
            </p>
          </div>
        ) : (
          <div
            className={`grid gap-6 ${
              isForcedMobile
                ? 'grid-cols-1'
                : visiblePlans.length === 1
                  ? 'grid-cols-1 max-w-md mx-auto'
                  : visiblePlans.length === 2
                    ? 'grid-cols-1 md:grid-cols-2'
                    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {visiblePlans.map((plan) => {
              const useYearly =
                billingCycle === 'yearly' && Boolean(plan.priceYearly && plan.priceYearly > 0);
              const activePrice = useYearly ? plan.priceYearly : plan.priceMonthly;
              const isPriced = Boolean(activePrice && activePrice > 0);

              return (
                <div
                  key={plan.id}
                  data-testid={`plan-card-${plan.id}`}
                  className={`relative bg-white rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-shadow ${
                    plan.highlight
                      ? 'border-2 border-[#0F766E] shadow-lg'
                      : 'border border-[#E8DEC8] shadow-xs hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <h3 className="text-xl font-bold text-[#0B3B36]">{plan.name}</h3>
                      {plan.highlight && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F2A007] text-[#1A1611] text-xs font-bold shrink-0">
                          <Sparkles className="w-3.5 h-3.5" />
                          জনপ্রিয়
                        </span>
                      )}
                    </div>

                    <div className="pb-5 mb-5 border-b border-[#EFE7D6]">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold text-[#142523] tabular-nums">
                          {formatPlanPriceBn(activePrice)}
                        </span>
                        {isPriced && (
                          <span className="text-sm font-semibold text-[#556B68]">
                            / {useYearly ? 'বছর' : 'মাস'}
                          </span>
                        )}
                      </div>
                      {!useYearly && Boolean(plan.priceYearly && plan.priceYearly > 0) && (
                        <div className="text-xs font-semibold text-[#0F766E] mt-1">
                          বাৎসরিক: {formatPlanPriceBn(plan.priceYearly)} / বছর
                        </div>
                      )}
                    </div>

                    {/* Numeric Limits from real payPlans */}
                    <div className="space-y-2 text-sm mb-5">
                      <div className="flex items-center justify-between py-1">
                        <span className="text-[#4F6360]">স্টোর সীমা</span>
                        <span className="font-bold text-[#142523]">
                          {formatLimitBn(plan.storeLimit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-[#4F6360]">অ্যান্ড্রয়েড ডিভাইস</span>
                        <span className="font-bold text-[#142523]">
                          {formatLimitBn(plan.deviceLimit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-[#4F6360]">দৈনিক পেমেন্ট সেশন</span>
                        <span className="font-bold text-[#142523]">
                          {formatLimitBn(plan.dailySessionCap)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-[#4F6360]">টিম মেম্বার</span>
                        <span className="font-bold text-[#142523]">
                          {plan.features.members > 0
                            ? `${toBanglaDigits(plan.features.members)} জন`
                            : 'শুধু মালিক'}
                        </span>
                      </div>
                    </div>

                    {/* Enabled Features */}
                    <ul className="space-y-2.5 text-sm text-[#243B38] mb-6">
                      {PLAN_FEATURE_LABELS_BN.filter((f) => plan.features[f.key]).map((feat) => (
                        <li key={feat.key} className="flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
                          <span>{feat.label}</span>
                        </li>
                      ))}
                      {plan.customPerks.map((perk, idx) => (
                        <li key={`perk_${idx}`} className="flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    disabled={!isPriced}
                    onClick={() => {
                      if (!isPreview && isPriced) {
                        onSelectPaidPlan(plan, useYearly ? 'yearly' : 'monthly');
                      }
                    }}
                    data-testid={`select-plan-btn-${plan.id}`}
                    className={`w-full min-h-[48px] px-5 py-3 rounded-2xl font-bold text-base transition-colors inline-flex items-center justify-center gap-2 ${
                      isPriced
                        ? 'bg-[#F2A007] hover:bg-[#DC9005] text-[#1A1611] shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isPriced ? 'এই প্যাকেজটি নিন' : 'দাম সেট করা হয়নি'}
                    {isPriced && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* EDITABLE FAQ SECTION */}
      {landing.faqs.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0B3B36] text-center tracking-tight mb-7">
            সাধারণ প্রশ্ন ও উত্তর
          </h2>
          <div className="space-y-3">
            {landing.faqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="bg-white rounded-2xl border border-[#E8DEC8] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    aria-expanded={isOpen}
                    className="w-full min-h-[52px] px-5 py-4 flex items-center justify-between gap-4 text-left font-bold text-[#0B3B36] hover:bg-[#FFF9EC]/60 transition-colors"
                  >
                    <span className="text-base">{faq.question}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-[#0F766E] shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-sm sm:text-base text-[#39504D] leading-relaxed border-t border-[#F4ECD9] pt-3.5">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* FINAL MARIGOLD CTA BAND */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-12">
        <div className="rounded-3xl bg-gradient-to-r from-[#0B3B36] to-[#0F766E] text-white p-7 sm:p-10 text-center space-y-5 shadow-lg">
          <h2 className="text-2xl sm:text-3xl font-bold leading-snug max-w-2xl mx-auto">
            {landing.finalCtaHeadline}
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {WALLET_METHODS.map((method) => (
              <PaymentLogo key={method} method={method} size="sm" />
            ))}
          </div>
          <div>
            <button
              type="button"
              onClick={scrollToPricing}
              className="min-h-[48px] px-7 py-3.5 rounded-2xl bg-[#F2A007] hover:bg-[#DC9005] text-[#1A1611] font-bold text-base shadow-md transition-colors inline-flex items-center justify-center gap-2"
            >
              {landing.finalCtaButtonText}
              <ArrowRight className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </section>

      {/* QUIET FOOTER — Support WhatsApp/Phone ONLY if configured; ZERO login links! */}
      <footer className="border-t border-[#E8DEC8] bg-[#F7F0DF]/70 pb-24 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-4">
          <PayVerifyBrandMark
            logoUrl={platformConfig.brandLogoUrl}
            logoDataUrl={platformConfig.brandLogoDataUrl}
            variant="dark"
            size="footer"
          />

          <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-semibold text-[#2A423F]">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-[#0F766E]"
              >
                <MessageCircle className="w-4 h-4 text-[#0F766E]" />
                WhatsApp: {platformConfig.supportWhatsApp}
              </a>
            )}
            {phoneHref && (
              <a
                href={phoneHref}
                className="inline-flex items-center gap-1.5 hover:text-[#0F766E]"
              >
                <Phone className="w-4 h-4 text-[#0F766E]" />
                ফোন: {platformConfig.supportPhone}
              </a>
            )}
          </div>
        </div>
      </footer>

      {/* FLOATING WHATSAPP SUPPORT BUTTON (shown ONLY if supportWhatsApp is set in platform settings) */}
      {!isPreview && whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp সাপোর্ট"
          data-testid="floating-whatsapp-btn"
          className="fixed right-4 bottom-36 lg:right-6 lg:bottom-22 z-40 w-12 h-12 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105"
        >
          <MessageCircle className="w-6 h-6" />
        </a>
      )}

      {/* STICKY MOBILE BOTTOM BAR (compact <=15% viewport height; shows trial button ONLY when trialPlanId is configured) */}
      {!isPreview && showMobileSticky && (
        <div
          className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8DEC8] px-3 py-2.5 shadow-lg"
          data-testid="mobile-sticky-bar"
        >
          <div className="flex items-center gap-2 max-w-md mx-auto">
            <button
              type="button"
              onClick={scrollToPricing}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#F2A007] hover:bg-[#DC9005] text-[#1A1611] font-bold text-sm"
            >
              প্যাকেজ দেখুন
            </button>
            {configuredTrialPlan && (
              <button
                type="button"
                onClick={() => onStartTrial(configuredTrialPlan)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#0B3B36] hover:bg-[#0F766E] text-white font-bold text-sm"
              >
                ফ্রি ট্রায়াল
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
