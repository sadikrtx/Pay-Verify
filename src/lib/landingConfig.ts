import { isValidLogoDataUrl } from './checkoutFlow';
import { sanitizeRedirectUrl } from './platformLogic';
import type {
  BenefitIconKey,
  HeroMediaType,
  LandingBenefitItem,
  LandingFaqItem,
  LandingPageConfig,
} from '../types/payment';

export const BENEFIT_ICON_OPTIONS: Array<{ key: BenefitIconKey; labelBn: string }> = [
  { key: 'sms', labelBn: 'SMS অটো ভেরিফিকেশন' },
  { key: 'checkout', labelBn: 'হোস্টেড ও এমবেডেড চেকআউট' },
  { key: 'stores', labelBn: 'দোকান ও নম্বর রোটেশন' },
  { key: 'qr', labelBn: 'QR ফোন সংযোগ' },
  { key: 'shield', labelBn: 'নিরাপত্তা ও ডুপ্লিকেট সুরক্ষা' },
  { key: 'zap', labelBn: 'তাৎক্ষণিক কনফার্মেশন' },
  { key: 'wallet', labelBn: 'মোবাইল ওয়ালেট' },
  { key: 'clock', labelBn: '২৪/৭ সচল' },
];

const VALID_BENEFIT_ICONS = new Set<string>(BENEFIT_ICON_OPTIONS.map((o) => o.key));

export const DEFAULT_LANDING_CONFIG: LandingPageConfig = {
  announcement: {
    enabled: false,
    text: '',
    offerEndsAtMs: null,
  },
  hero: {
    headline: 'পেমেন্ট এলেই অর্ডার অটো-কনফার্ম',
    supportingLine:
      'বিকাশ, নগদ, রকেট ও উপায় পেমেন্টের SMS পড়ে আপনার নিজের ফোনের অ্যাপ থেকেই অর্ডার সাথে সাথেই যাচাই ও কনফার্ম হয়।',
    ctaText: 'প্যাকেজ বেছে নিন',
    mediaType: 'three_step',
    imageUrl: '',
    imageDataUrl: '',
    videoUrl: '',
    videoPosterUrl: '',
    videoPosterDataUrl: '',
  },
  howItWorksSteps: [
    'কাস্টমার আপনার নম্বরে পেমেন্ট করে',
    'আপনার ফোনের অ্যাপ SMS পড়ে যাচাই করে',
    'অর্ডার নিজে নিজেই কনফার্ম হয়',
  ],
  benefits: [
    { id: 'ben_sms', icon: 'sms', text: 'SMS দিয়ে অটো ভেরিফিকেশন' },
    { id: 'ben_checkout', icon: 'checkout', text: 'হোস্টেড + এমবেডেড চেকআউট' },
    { id: 'ben_stores', icon: 'stores', text: 'একাধিক দোকান ও নম্বর রোটেশন' },
    { id: 'ben_qr', icon: 'qr', text: 'QR দিয়ে নিরাপদ ফোন সংযোগ' },
  ],
  faqs: [
    {
      id: 'faq_verify',
      question: 'পেমেন্ট কীভাবে অটো-যাচাই হয়?',
      answer:
        'কাস্টমার আপনার বিকাশ, নগদ, রকেট বা উপায় নম্বরে টাকা পাঠানোর পর আপনার ফোনে আসা SMS আমাদের অ্যান্ড্রয়েড অ্যাপ নিরাপদে পড়ে ট্রানজেকশন আইডি ও টাকার পরিমাণ মিলিয়ে অর্ডার কনফার্ম করে।',
    },
    {
      id: 'faq_wallets',
      question: 'কোন কোন পেমেন্ট মাধ্যম ব্যবহার করা যাবে?',
      answer:
        'বিকাশ, নগদ, রকেট এবং উপায় — চারটি জনপ্রিয় মোবাইল ব্যাংকিং মাধ্যমই নিজের পার্সোনাল বা এজেন্ট নম্বরে ব্যবহার করা যায়।',
    },
    {
      id: 'faq_setup',
      question: 'ওয়েবসাইটে যুক্ত করতে কি জটিল সেটআপ লাগে?',
      answer:
        'না। ড্যাশবোর্ড থেকে একটি QR কোড স্ক্যান করে ফোন যুক্ত করুন এবং হোস্টেড পেমেন্ট লিংক বা এমবেডেড চেকআউট আপনার স্টোরে বসিয়ে দিন।',
    },
    {
      id: 'faq_support',
      question: 'প্যাকেজ নেওয়ার পর অ্যাকাউন্ট কীভাবে চালু হবে?',
      answer:
        'প্যাকেজের পেমেন্ট আমাদের সিস্টেমে যাচাই হওয়ার সাথে সাথেই আপনার ইমেইল ও পাসওয়ার্ড সেট করার পাতা খুলে যাবে এবং অ্যাকাউন্ট সক্রিয় হয়ে যাবে।',
    },
  ],
  finalCtaHeadline: 'ম্যানুয়াল পেমেন্ট চেক বন্ধ করে আজই অটো ভেরিফিকেশন চালু করুন',
  finalCtaButtonText: 'প্যাকেজ বেছে নিন',
};

export function cloneDefaultLandingConfig(): LandingPageConfig {
  return {
    announcement: { ...DEFAULT_LANDING_CONFIG.announcement },
    hero: { ...DEFAULT_LANDING_CONFIG.hero },
    howItWorksSteps: [...DEFAULT_LANDING_CONFIG.howItWorksSteps] as [string, string, string],
    benefits: DEFAULT_LANDING_CONFIG.benefits.map((b) => ({ ...b })),
    faqs: DEFAULT_LANDING_CONFIG.faqs.map((f) => ({ ...f })),
    finalCtaHeadline: DEFAULT_LANDING_CONFIG.finalCtaHeadline,
    finalCtaButtonText: DEFAULT_LANDING_CONFIG.finalCtaButtonText,
  };
}

function cleanText(raw: unknown, fallback: string, maxLen: number): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, maxLen) : fallback;
}

function cleanOptionalText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, maxLen);
}

function cleanSafeUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return sanitizeRedirectUrl(trimmed) ?? '';
}

function cleanImageDataUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Allow compressed hero/poster data URLs up to ~180KB as well as logo data URLs
  if (isValidLogoDataUrl(raw)) return raw;
  if (
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw) &&
    raw.length <= 200_000
  ) {
    return raw;
  }
  return '';
}

export function normalizeLandingConfig(raw: unknown): LandingPageConfig {
  const def = cloneDefaultLandingConfig();
  if (!raw || typeof raw !== 'object') return def;
  const obj = raw as Record<string, unknown>;

  const ann =
    obj.announcement && typeof obj.announcement === 'object'
      ? (obj.announcement as Record<string, unknown>)
      : {};
  const rawOfferEnd = ann.offerEndsAtMs;
  const offerEndsAtMs =
    typeof rawOfferEnd === 'number' && Number.isFinite(rawOfferEnd) && rawOfferEnd > 0
      ? Math.trunc(rawOfferEnd)
      : null;

  const heroRaw =
    obj.hero && typeof obj.hero === 'object' ? (obj.hero as Record<string, unknown>) : {};
  const mediaTypeRaw = String(heroRaw.mediaType || 'three_step');
  const mediaType: HeroMediaType =
    mediaTypeRaw === 'image' || mediaTypeRaw === 'video' ? mediaTypeRaw : 'three_step';

  const rawSteps = Array.isArray(obj.howItWorksSteps) ? obj.howItWorksSteps : [];
  const howItWorksSteps: [string, string, string] = [
    cleanText(rawSteps[0], def.howItWorksSteps[0], 140),
    cleanText(rawSteps[1], def.howItWorksSteps[1], 140),
    cleanText(rawSteps[2], def.howItWorksSteps[2], 140),
  ];

  const rawBenefits = Array.isArray(obj.benefits) ? obj.benefits : null;
  const benefits: LandingBenefitItem[] =
    rawBenefits && rawBenefits.length > 0
      ? rawBenefits
          .slice(0, 12)
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item, idx) => {
            const rawIcon = String(item.icon || 'sms');
            const icon: BenefitIconKey = VALID_BENEFIT_ICONS.has(rawIcon)
              ? (rawIcon as BenefitIconKey)
              : 'sms';
            return {
              id: cleanText(item.id, `ben_${idx + 1}`, 40),
              icon,
              text: cleanOptionalText(item.text, 160),
            };
          })
          .filter((b) => b.text.length > 0)
      : def.benefits;

  const rawFaqs = Array.isArray(obj.faqs) ? obj.faqs : null;
  const faqs: LandingFaqItem[] =
    rawFaqs !== null
      ? rawFaqs
          .slice(0, 20)
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item, idx) => ({
            id: cleanText(item.id, `faq_${idx + 1}`, 40),
            question: cleanOptionalText(item.question, 180),
            answer: cleanOptionalText(item.answer, 600),
          }))
          .filter((f) => f.question.length > 0 && f.answer.length > 0)
      : def.faqs;

  return {
    announcement: {
      enabled: Boolean(ann.enabled),
      text: cleanOptionalText(ann.text, 200),
      offerEndsAtMs,
    },
    hero: {
      headline: cleanText(heroRaw.headline, def.hero.headline, 140),
      supportingLine: cleanText(heroRaw.supportingLine, def.hero.supportingLine, 260),
      ctaText: cleanText(heroRaw.ctaText, def.hero.ctaText, 60),
      mediaType,
      imageUrl: cleanSafeUrl(heroRaw.imageUrl),
      imageDataUrl: cleanImageDataUrl(heroRaw.imageDataUrl),
      videoUrl: cleanSafeUrl(heroRaw.videoUrl),
      videoPosterUrl: cleanSafeUrl(heroRaw.videoPosterUrl),
      videoPosterDataUrl: cleanImageDataUrl(heroRaw.videoPosterDataUrl),
    },
    howItWorksSteps,
    benefits: benefits.length > 0 ? benefits : def.benefits,
    faqs,
    finalCtaHeadline: cleanText(obj.finalCtaHeadline, def.finalCtaHeadline, 180),
    finalCtaButtonText: cleanText(obj.finalCtaButtonText, def.finalCtaButtonText, 60),
  };
}
