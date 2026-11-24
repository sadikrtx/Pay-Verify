import { normalizeBdPhone } from './money';
import { sanitizeRedirectUrl } from './platformLogic';
import type {
  CheckoutWalletMethod,
  MethodNumberEntry,
  NumberAccountType,
  PaymentAccountsMap,
  PayStoreDoc,
  WalletEnabledMap,
  WalletNumbersMap,
  WorkerSessionStatusResponse,
} from '../types/payment';

export const CHECKOUT_METHODS: CheckoutWalletMethod[] = ['bkash', 'nagad', 'rocket'];

export interface CheckoutMethodBrand {
  id: CheckoutWalletMethod;
  name: string;
  nameBn: string;
  primaryHex: string;
  darkHex: string;
  surfaceTint: string;
  borderTint: string;
  stepsBn: (accountType: NumberAccountType, formattedAmount: string) => string[];
}

export const CHECKOUT_METHOD_BRANDS: Record<CheckoutWalletMethod, CheckoutMethodBrand> = {
  bkash: {
    id: 'bkash',
    name: 'bKash',
    nameBn: 'বিকাশ',
    primaryHex: '#E2136E',
    darkHex: '#B60D57',
    surfaceTint: '#FDF2F8',
    borderTint: '#FBCFE8',
    stepsBn: (accountType, formattedAmount) => [
      'আপনার ফোনে bKash অ্যাপ খুলুন এবং পিন দিয়ে লগইন করুন।',
      accountType === 'agent'
        ? 'হোম স্ক্রিন থেকে "Cash Out" (ক্যাশ আউট) অপশন বেছে নিন।'
        : 'হোম স্ক্রিন থেকে "Send Money" (সেন্ড মানি) অপশন বেছে নিন।',
      `উপরে দেখানো নম্বরটি দিন এবং ঠিক ${formattedAmount} পাঠিয়ে নিশ্চিত করুন।`,
      'পেমেন্ট সফল হলে SMS বা অ্যাপ থেকে পাওয়া Transaction ID নিচে লিখে ভেরিফাই করুন।',
    ],
  },
  nagad: {
    id: 'nagad',
    name: 'Nagad',
    nameBn: 'নগদ',
    primaryHex: '#E04F16',
    darkHex: '#B83D0D',
    surfaceTint: '#FFF7ED',
    borderTint: '#FED7AA',
    stepsBn: (accountType, formattedAmount) => [
      'আপনার ফোনে Nagad অ্যাপ খুলুন এবং পিন দিয়ে লগইন করুন।',
      accountType === 'agent'
        ? 'হোম স্ক্রিন থেকে "Cash Out" (ক্যাশ আউট) অপশন বেছে নিন।'
        : 'হোম স্ক্রিন থেকে "Send Money" (সেন্ড মানি) অপশন বেছে নিন।',
      `উপরে দেখানো নম্বরটি দিন এবং ঠিক ${formattedAmount} পাঠিয়ে নিশ্চিত করুন।`,
      'পেমেন্ট শেষে প্রাপ্ত Transaction ID নিচে বসিয়ে ভেরিফাই করুন।',
    ],
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket',
    nameBn: 'রকেট',
    primaryHex: '#892B91',
    darkHex: '#691E70',
    surfaceTint: '#FAF5FF',
    borderTint: '#E9D5FF',
    stepsBn: (accountType, formattedAmount) => [
      'আপনার ফোনে Rocket অ্যাপ খুলুন এবং পিন দিয়ে লগইন করুন।',
      accountType === 'agent'
        ? 'মেনু থেকে "Cash Out" (ক্যাশ আউট) অপশন বেছে নিন।'
        : 'মেনু থেকে "Send Money" (সেন্ড মানি) অপশন বেছে নিন।',
      `উপরে দেখানো নম্বরটি দিন এবং ঠিক ${formattedAmount} পাঠিয়ে নিশ্চিত করুন।`,
      'পেমেন্ট সম্পন্ন হলে প্রাপ্ত Transaction ID নিচে লিখে ভেরিফাই করুন।',
    ],
  },
};

export interface CheckoutMethodOption {
  method: CheckoutWalletMethod;
  number: string;
  type: NumberAccountType;
  accountCount: number;
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

/**
 * Formats integer paisa as exact Bangla Taka string (e.g., 125000 -> "৳১,২৫০", 125037 -> "৳১,২৫০.৩৭")
 */
export function formatBanglaTaka(paisa: number): string {
  const safe = Number.isFinite(paisa) ? Math.max(0, Math.round(paisa)) : 0;
  const whole = Math.floor(safe / 100);
  const rem = safe % 100;
  const wholeBn = whole.toLocaleString('bn-BD');
  if (rem === 0) {
    return `৳${wholeBn}`;
  }
  const remStr = toBanglaDigits(String(rem).padStart(2, '0'));
  return `৳${wholeBn}.${remStr}`;
}

export function formatAccountTypeLabel(type: NumberAccountType): string {
  return type === 'agent' ? 'Agent' : 'Personal';
}

export function formatAccountTypeHintBn(type: NumberAccountType, count = 1): string {
  const base = type === 'agent' ? 'Agent নম্বর' : 'Personal নম্বর';
  if (count > 1) {
    return `${base} · ${toBanglaDigits(count)}টি নম্বর সক্রিয়`;
  }
  return base;
}

export function normalizePaymentAccounts(
  rawAccounts: Partial<PaymentAccountsMap> | null | undefined,
  legacyNumbers?: Partial<WalletNumbersMap> | null
): PaymentAccountsMap {
  const result: PaymentAccountsMap = { bkash: [], nagad: [], rocket: [] };

  for (const method of CHECKOUT_METHODS) {
    const entries = Array.isArray(rawAccounts?.[method]) ? rawAccounts[method]! : [];
    const cleaned: MethodNumberEntry[] = [];
    const seen = new Set<string>();

    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;
      const norm = normalizeBdPhone(String(item.number || ''));
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      cleaned.push({
        number: norm,
        type: item.type === 'agent' ? 'agent' : 'personal',
        active: item.active !== undefined ? Boolean(item.active) : true,
      });
      if (cleaned.length >= 10) break;
    }

    if (cleaned.length === 0 && legacyNumbers?.[method]) {
      const legacyNorm = normalizeBdPhone(String(legacyNumbers[method] || ''));
      if (legacyNorm) {
        cleaned.push({ number: legacyNorm, type: 'personal', active: true });
      }
    }

    result[method] = cleaned;
  }

  return result;
}

/**
 * Keeps legacy `numbers` map synced to the first active account per method
 * so existing Worker / matching / dashboard consumers continue working seamlessly.
 */
export function syncLegacyNumbersFromAccounts(
  accounts: PaymentAccountsMap,
  existingUpay = ''
): WalletNumbersMap {
  const pickPrimary = (list: MethodNumberEntry[]): string => {
    const activeFirst = list.find((item) => item.active && item.number);
    return activeFirst?.number || list[0]?.number || '';
  };
  return {
    bkash: pickPrimary(accounts.bkash),
    nagad: pickPrimary(accounts.nagad),
    rocket: pickPrimary(accounts.rocket),
    upay: existingUpay,
  };
}

export function resolveStoreCheckoutOptions(
  store: Pick<PayStoreDoc, 'numberEnabled' | 'numbers' | 'paymentAccounts'>
): CheckoutMethodOption[] {
  const accounts = normalizePaymentAccounts(store.paymentAccounts, store.numbers);
  const options: CheckoutMethodOption[] = [];

  for (const method of CHECKOUT_METHODS) {
    if (!store.numberEnabled[method]) continue;
    const activeEntries = accounts[method].filter((entry) => entry.active && entry.number);
    if (activeEntries.length === 0) continue;
    options.push({
      method,
      number: activeEntries[0].number,
      type: activeEntries[0].type,
      accountCount: activeEntries.length,
    });
  }

  return options;
}

/**
 * Resolves enabled checkout methods from a Worker session status response.
 * Never invents methods or numbers if the session does not include them.
 */
export function resolveSessionCheckoutOptions(
  session: WorkerSessionStatusResponse
): CheckoutMethodOption[] {
  const options: CheckoutMethodOption[] = [];

  if (session.methodNumbers && typeof session.methodNumbers === 'object') {
    const allowed = Array.isArray(session.enabledMethods)
      ? session.enabledMethods
      : (Object.keys(session.methodNumbers) as CheckoutWalletMethod[]);

    for (const method of CHECKOUT_METHODS) {
      if (!allowed.includes(method)) continue;
      const entry = session.methodNumbers[method];
      if (!entry || !entry.number) continue;
      options.push({
        method,
        number: String(entry.number),
        type: entry.type === 'agent' ? 'agent' : 'personal',
        accountCount: 1,
      });
    }
    if (options.length > 0) return options;
  }

  // Backward-compatible single-method session from current Worker
  const m = String(session.method || '').toLowerCase();
  if ((m === 'bkash' || m === 'nagad' || m === 'rocket') && session.number) {
    options.push({
      method: m,
      number: String(session.number),
      type: session.numberType === 'agent' ? 'agent' : 'personal',
      accountCount: 1,
    });
  }

  return options;
}

export interface FieldValidationResult {
  valid: boolean;
  normalized: string;
  errorBn: string | null;
}

export function validateTrxId(raw: string): FieldValidationResult {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned) {
    return { valid: false, normalized: '', errorBn: 'Transaction ID লিখুন।' };
  }
  if (cleaned.length < 6 || cleaned.length > 32) {
    return {
      valid: false,
      normalized: cleaned,
      errorBn: 'সঠিক Transaction ID দিন (সাধারণত ৮–১৬ অক্ষর বা সংখ্যা)।',
    };
  }
  if (!/^[A-Z0-9_-]+$/.test(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      errorBn: 'Transaction ID-তে শুধু ইংরেজি অক্ষর ও সংখ্যা থাকতে পারে।',
    };
  }
  return { valid: true, normalized: cleaned, errorBn: null };
}

export function validateSenderPhone(raw: string): FieldValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      errorBn: 'যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি লিখুন।',
    };
  }
  const normalized = normalizeBdPhone(trimmed);
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      errorBn: 'সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন (যেমন 017XXXXXXXX)।',
    };
  }
  return { valid: true, normalized, errorBn: null };
}

export type MerchantReturnStatus = 'paid' | 'failed' | 'cancelled' | 'expired';

export function buildMerchantReturnUrl(
  baseUrl: string | null | undefined,
  params: {
    status: MerchantReturnStatus;
    sessionId: string;
    orderId?: string;
    trxId?: string | null;
    method?: string;
    reason?: string | null;
  }
): string | null {
  const safe = sanitizeRedirectUrl(baseUrl);
  if (!safe) return null;
  try {
    const parsed = new URL(safe);
    parsed.searchParams.set('status', params.status);
    parsed.searchParams.set('sessionId', params.sessionId);
    if (params.orderId) parsed.searchParams.set('orderId', params.orderId);
    if (params.trxId) parsed.searchParams.set('trxId', params.trxId);
    if (params.method) parsed.searchParams.set('method', params.method);
    if (params.reason) parsed.searchParams.set('reason', params.reason);
    return parsed.toString();
  } catch {
    return null;
  }
}

export function mapFailureReasonBn(rawReason?: string | null): {
  headline: string;
  reasons: string[];
} {
  const lower = (rawReason || '').toLowerCase();
  if (lower.includes('duplicate') || lower.includes('used')) {
    return {
      headline: 'এই Transaction ID আগেই ব্যবহার করা হয়েছে',
      reasons: [
        'এই Transaction ID দিয়ে আগে একটি পেমেন্ট নিশ্চিত হয়েছে।',
        'নতুন পেমেন্ট করে থাকলে সঠিক নতুন Transaction ID লিখুন।',
      ],
    };
  }
  if (lower.includes('amount') || lower.includes('mismatch')) {
    return {
      headline: 'পাঠানো টাকার পরিমাণ নির্ধারিত পরিমাণের সাথে মেলেনি',
      reasons: [
        'নির্ধারিত ঠিক পরিমাণ টাকা পাঠানো না হলে স্বয়ংক্রিয় যাচাই ব্যর্থ হয়।',
        'সঠিক পরিমাণ পাঠিয়ে আবার চেষ্টা করুন অথবা দোকানের সাথে যোগাযোগ করুন।',
      ],
    };
  }
  if (lower.includes('trx') || lower.includes('not_found') || lower.includes('unmatched')) {
    return {
      headline: 'প্রদত্ত Transaction ID খুঁজে পাওয়া যায়নি',
      reasons: [
        'Transaction ID-তে কোনো অক্ষর বা সংখ্যা ভুল হয়েছে কিনা দেখে নিন।',
        'SMS পৌঁছাতে কয়েক সেকেন্ড দেরি হতে পারে — একটু পর আবার চেষ্টা করুন।',
        'সঠিক নম্বরে ও ঠিক নির্ধারিত পরিমাণ টাকা পাঠানো হয়েছে কিনা নিশ্চিত করুন।',
      ],
    };
  }
  return {
    headline: 'পেমেন্টটি যাচাই করা যায়নি',
    reasons: [
      'Transaction ID ভুলভাবে লেখা হয়ে থাকতে পারে।',
      'পাঠানো টাকার পরিমাণ নির্ধারিত পরিমাণের সাথে নাও মিলতে পারে।',
      'এই Transaction ID আগেই অন্য অর্ডারে ব্যবহৃত হয়ে থাকতে পারে।',
    ],
  };
}

export function getStoreInitials(name: string, nameEn?: string): string {
  const source = (nameEn && nameEn.trim()) || name.trim();
  if (!source) return 'PV';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function isValidLogoDataUrl(val: string): boolean {
  if (!val) return true;
  if (val.length > 65000) return false;
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(val);
}

/**
 * Resizes an uploaded image File in the browser into a compact square-fitted
 * PNG/WebP data URL (< 60KB) suitable for Firestore storage without broken URLs.
 */
export async function compressLogoFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('শুধুমাত্র ইমেজ ফাইল (PNG, JPG, WebP) আপলোড করা যাবে।');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('ইমেজ ফাইল সর্বোচ্চ ৫ মেগাবাইট হতে পারবে।');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ইমেজ পড়া যায়নি।'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('ইমেজ লোড করা যায়নি।'));
    image.src = rawDataUrl;
  });

  const maxDim = 160;
  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('ইমেজ প্রসেস করা যায়নি।');
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  // Prefer WebP for crisp transparency + tiny payload; fall back to PNG then JPEG
  let out = canvas.toDataURL('image/webp', 0.85);
  if (!out.startsWith('data:image/webp') || out.length > 58000) {
    out = canvas.toDataURL('image/png');
  }
  if (out.length > 58000) {
    out = canvas.toDataURL('image/jpeg', 0.8);
  }
  if (!isValidLogoDataUrl(out)) {
    throw new Error('ইমেজটির আকার অনেক বড় — আরেকটু ছোট লোগো ব্যবহার করুন।');
  }
  return out;
}

export function buildEmptyEnabledMap(): WalletEnabledMap {
  return { bkash: true, nagad: true, rocket: true, upay: false };
}
