import { isSafeHttpUrl } from './crypto';
import type { PayPlanDoc, PayPlatformConfig } from '../types/payment';

export interface OfferCountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  remainingMs: number;
}

/**
 * Computes a real remaining countdown ONLY when the owner has set a genuine
 * future end timestamp. Returns null when unset, invalid, or already expired —
 * never invents an evergreen or fake countdown.
 */
export function computeRealOfferCountdown(
  offerEndsAtMs: number | null | undefined,
  nowMs: number = Date.now()
): OfferCountdownParts | null {
  if (typeof offerEndsAtMs !== 'number' || !Number.isFinite(offerEndsAtMs)) {
    return null;
  }
  const remainingMs = offerEndsAtMs - nowMs;
  if (remainingMs <= 1000) {
    return null;
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, remainingMs };
}

/**
 * Extracts a safe YouTube privacy-enhanced embed URL from standard youtube.com
 * or youtu.be URLs. Returns null for any non-YouTube or malformed input.
 */
export function parseYouTubeVideoId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || !isSafeHttpUrl(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') {
      id = parsed.pathname.replace(/^\/+/, '').split('/')[0] || null;
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.pathname === '/watch') {
        id = parsed.searchParams.get('v');
      } else if (parsed.pathname.startsWith('/embed/')) {
        id = parsed.pathname.split('/')[2] || null;
      } else if (parsed.pathname.startsWith('/shorts/')) {
        id = parsed.pathname.split('/')[2] || null;
      }
    }
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildYouTubeEmbedUrl(
  videoId: string,
  options: { autoplay: boolean; muted: boolean; loop: boolean }
): string {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    autoplay: options.autoplay ? '1' : '0',
    mute: options.muted ? '1' : '0',
  });
  if (options.loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function isDirectVideoUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed || !isSafeHttpUrl(trimmed)) return false;
  if (parseYouTubeVideoId(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return /\.(mp4|webm|m4v)(\?|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Formats a WhatsApp number (BD 01XXXXXXXXX or international digits) into a
 * safe https://wa.me/... link. Returns null when unset or invalid.
 */
export function buildWhatsAppHref(rawNumber: string | null | undefined): string | null {
  if (!rawNumber) return null;
  const digits = rawNumber.replace(/[^0-9]/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  let normalized = digits;
  if (digits.length === 11 && digits.startsWith('01')) {
    normalized = `88${digits}`;
  }
  return `https://wa.me/${normalized}`;
}

export function buildPhoneHref(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  const cleaned = rawPhone.trim().replace(/[^0-9+]/g, '');
  const digits = cleaned.replace(/\+/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${cleaned}`;
}

/**
 * Resolves the configured free trial plan ONLY when trialPlanId is explicitly set
 * and matches a real, non-archived plan. Returns null if disabled/unconfigured.
 */
export function resolveConfiguredTrialPlan(
  platformConfig: Pick<PayPlatformConfig, 'trialPlanId'>,
  plans: PayPlanDoc[]
): PayPlanDoc | null {
  const trialId = (platformConfig.trialPlanId || '').trim();
  if (!trialId) return null;
  const found = plans.find((p) => p.id === trialId && !p.archived);
  return found ?? null;
}

/**
 * Validates Step 3 buyer contact details (Name + 11-digit Bangladesh mobile number).
 * Account email is intentionally NOT collected in Step 3.
 */
export function validateFunnelBuyerContact(
  buyerName: string,
  buyerPhone: string
): { valid: true; cleanName: string; cleanPhone: string } | { valid: false; error: string } {
  const cleanName = buyerName.trim();
  if (cleanName.length < 2) {
    return { valid: false, error: 'আপনার পুরো নাম লিখুন (কমপক্ষে ২ অক্ষর)।' };
  }
  if (cleanName.length > 80) {
    return { valid: false, error: 'নাম সর্বোচ্চ ৮০ অক্ষরের মধ্যে লিখুন।' };
  }

  let digits = buyerPhone.replace(/[^0-9]/g, '');
  if (digits.length === 13 && digits.startsWith('8801')) {
    digits = digits.slice(2);
  }
  if (!/^01[3-9]\d{8}$/.test(digits)) {
    return { valid: false, error: 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।' };
  }

  return { valid: true, cleanName, cleanPhone: digits };
}

/**
 * Validates Step 4 account creation fields (Email + Password + Confirm Password).
 */
export function validateAccountSetupForm(
  email: string,
  password: string,
  confirmPassword: string
): { valid: true; cleanEmail: string } | { valid: false; error: string } {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return { valid: false, error: 'সঠিক ইমেইল ঠিকানা দিন।' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' };
  }
  if (password !== confirmPassword) {
    return { valid: false, error: 'দুটি পাসওয়ার্ড মেলেনি — আবার যাচাই করুন।' };
  }
  return { valid: true, cleanEmail };
}

export interface ParsedSetupParams {
  mode: 'paid' | 'trial' | 'invalid';
  purchaseId: string | null;
  claimToken: string | null;
}

export function parseSetupAccountQuery(search: string): ParsedSetupParams {
  const params = new URLSearchParams(search);
  if (params.get('trial') === '1') {
    return { mode: 'trial', purchaseId: null, claimToken: null };
  }
  const purchaseId = (params.get('purchase') || '').trim();
  const claimToken = (params.get('token') || '').trim();
  if (
    /^[a-zA-Z0-9_-]{4,128}$/.test(purchaseId) &&
    /^[a-zA-Z0-9._-]{12,256}$/.test(claimToken)
  ) {
    return { mode: 'paid', purchaseId, claimToken };
  }
  return { mode: 'invalid', purchaseId: null, claimToken: null };
}

export function buildLoginBookmarkUrl(origin: string): string {
  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  return `${cleanOrigin}/login`;
}
