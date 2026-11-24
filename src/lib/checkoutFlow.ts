import { normalizeBdPhone } from './money';
import { sanitizeRedirectUrl } from './platformLogic';
import {
  WALLET_META,
  WALLET_METHODS,
  type MethodNumberEntry,
  type NormalizedPaymentAccountsMap,
  type NumberAccountType,
  type PaymentActionType,
  type PaymentAccountsMap,
  type PayStoreDoc,
  type WalletEnabledMap,
  type WalletMethod,
  type WalletNumbersMap,
  type WorkerSessionStatusResponse,
} from '../types/payment';

export const CHECKOUT_METHODS: WalletMethod[] = WALLET_METHODS;
const ALL_SESSION_METHODS: WalletMethod[] = WALLET_METHODS;

export interface CheckoutMethodBrand {
  id: WalletMethod;
  name: string;
  nameBn: string;
  primaryHex: string;
  darkHex: string;
  surfaceTint: string;
  borderTint: string;
  stepsBn: (accountType: NumberAccountType, formattedAmount: string) => string[];
}

export const CHECKOUT_METHOD_BRANDS: Record<WalletMethod, CheckoutMethodBrand> = {
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
  upay: {
    id: 'upay',
    name: 'Upay',
    nameBn: 'উপায়',
    primaryHex: '#005BAC',
    darkHex: '#004280',
    surfaceTint: '#EFF6FF',
    borderTint: '#BFDBFE',
    stepsBn: (accountType, formattedAmount) => [
      'আপনার ফোনে Upay অ্যাপ খুলুন এবং পিন দিয়ে লগইন করুন।',
      accountType === 'agent'
        ? 'হোম স্ক্রিন থেকে "Cash Out" (ক্যাশ আউট) অপশন বেছে নিন।'
        : 'হোম স্ক্রিন থেকে "Send Money" (সেন্ড মানি) অপশন বেছে নিন।',
      `উপরে দেখানো নম্বরটি দিন এবং ঠিক ${formattedAmount} পাঠিয়ে নিশ্চিত করুন।`,
      'পেমেন্ট সম্পন্ন হলে প্রাপ্ত Transaction ID নিচে লিখে ভেরিফাই করুন।',
    ],
  },
};

export const PAYMENT_ACTION_TYPES: readonly PaymentActionType[] = [
  'send_money',
  'cash_in',
  'cash_out',
  'payment',
];

export const PAYMENT_ACTION_LABELS_BN: Record<PaymentActionType, string> = {
  send_money: 'সেন্ড মানি',
  cash_in: 'ক্যাশ ইন',
  cash_out: 'ক্যাশ আউট',
  payment: 'পেমেন্ট',
};

export function defaultActionForAccountType(type: NumberAccountType): PaymentActionType {
  return type === 'agent' ? 'cash_out' : 'send_money';
}

export function normalizePaymentActionType(
  rawAction: unknown,
  accountType: NumberAccountType
): PaymentActionType {
  if (
    rawAction === 'send_money' ||
    rawAction === 'cash_in' ||
    rawAction === 'cash_out' ||
    rawAction === 'payment'
  ) {
    return rawAction;
  }
  return defaultActionForAccountType(accountType);
}

export function sanitizeCustomInstruction(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\r\n/g, '\n').trim().slice(0, 500);
}

export function parseCustomInstructionLines(raw: string | undefined): string[] {
  const cleaned = sanitizeCustomInstruction(raw);
  if (!cleaned) return [];
  return cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildActionHeadlineBn(
  actionType: PaymentActionType,
  formattedAmount: string
): string {
  switch (actionType) {
    case 'cash_in':
      return `এই নম্বরে ${formattedAmount} ক্যাশ ইন করুন`;
    case 'cash_out':
      return `এই নম্বরে ${formattedAmount} ক্যাশ আউট করুন`;
    case 'payment':
      return `এই নম্বরে ${formattedAmount} পেমেন্ট করুন`;
    case 'send_money':
    default:
      return `এই নম্বরে ${formattedAmount} সেন্ড মানি করুন`;
  }
}

export function buildActionStepsBn(
  method: WalletMethod,
  actionType: PaymentActionType,
  formattedAmount: string,
  receiverNumber?: string
): string[] {
  const brandName = CHECKOUT_METHOD_BRANDS[method]?.name || WALLET_META[method].name;
  const dialCode = WALLET_META[method].dialCode;
  const numRef = receiverNumber && receiverNumber.trim() ? receiverNumber.trim() : 'উপরের নম্বর';

  switch (actionType) {
    case 'cash_in':
      return [
        `কাছাকাছি যেকোনো ${brandName} এজেন্ট বা দোকানে যান।`,
        `এজেন্টকে ${numRef} নম্বরে ঠিক ${formattedAmount} "Cash In" (ক্যাশ ইন) করতে বলুন।`,
        `টাকা পরিশোধের পর কনফার্মেশন SMS থেকে Transaction ID নিয়ে নিচে ভেরিফাই করুন (প্রয়োজনে ${dialCode} ডায়াল করে দেখুন)।`,
      ];
    case 'cash_out':
      return [
        `আপনার ফোনে ${brandName} অ্যাপ খুলুন অথবা ${dialCode} ডায়াল করুন।`,
        `মেনু থেকে "Cash Out" (ক্যাশ আউট) অপশন বেছে নিন।`,
        `এজেন্ট নম্বরে ${numRef} এবং পরিমাণ ঠিক ${formattedAmount} লিখে পিন দিয়ে নিশ্চিত করুন।`,
        `ক্যাশ আউট সফল হলে কনফার্মেশন SMS-এর Transaction ID নিচে লিখে ভেরিফাই করুন।`,
      ];
    case 'payment':
      return [
        `আপনার ফোনে ${brandName} অ্যাপ খুলুন অথবা ${dialCode} ডায়াল করুন।`,
        `মেনু থেকে "Payment" (পেমেন্ট) অপশন বেছে নিন।`,
        `মার্চেন্ট নম্বরে ${numRef} এবং পরিমাণ ঠিক ${formattedAmount} লিখে পিন দিয়ে কনফার্ম করুন।`,
        `পেমেন্ট সম্পন্ন হলে প্রাপ্ত Transaction ID নিচে লিখে ভেরিফাই করুন।`,
      ];
    case 'send_money':
    default:
      return [
        `আপনার ফোনে ${brandName} অ্যাপ খুলুন অথবা ${dialCode} ডায়াল করুন।`,
        `মেনু থেকে "Send Money" (সেন্ড মানি) অপশন বেছে নিন।`,
        `প্রাপক নম্বরে ${numRef} এবং পরিমাণ ঠিক ${formattedAmount} লিখে পিন দিয়ে পাঠান।`,
        `টাকা পাঠানো হলে কনফার্মেশন SMS বা অ্যাপ থেকে Transaction ID নিয়ে নিচে ভেরিফাই করুন।`,
      ];
  }
}

export function buildTrxIdHintBn(actionType: PaymentActionType): string {
  switch (actionType) {
    case 'cash_in':
      return 'এজেন্ট ক্যাশ ইন করার পর প্রাপ্ত কনফার্মেশন SMS-এ Transaction ID পাবেন।';
    case 'cash_out':
      return 'ক্যাশ আউটের পর প্রাপ্ত কনফার্মেশন SMS-এ Transaction ID পাবেন।';
    case 'payment':
    case 'send_money':
    default:
      return 'টাকা পাঠানোর পর কনফার্মেশন SMS এবং অ্যাপের লেনদেন ইতিহাসে Transaction ID পাবেন।';
  }
}

export function formatCopyableAmount(paisa: number): string {
  const safe = Number.isFinite(paisa) ? Math.max(0, Math.round(paisa)) : 0;
  const whole = Math.floor(safe / 100);
  const rem = safe % 100;
  return rem === 0 ? String(whole) : `${whole}.${String(rem).padStart(2, '0')}`;
}

export interface CheckoutMethodOption {
  method: WalletMethod;
  number: string;
  type: NumberAccountType;
  actionType: PaymentActionType;
  customInstruction?: string;
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

export function buildEmptyPaymentAccounts(): NormalizedPaymentAccountsMap {
  return { bkash: [], nagad: [], rocket: [], upay: [] };
}

export function normalizePaymentAccounts(
  rawAccounts: Partial<PaymentAccountsMap> | null | undefined,
  legacyNumbers?: Partial<WalletNumbersMap> | null
): NormalizedPaymentAccountsMap {
  const result = buildEmptyPaymentAccounts();

  for (const method of CHECKOUT_METHODS) {
    const entries = Array.isArray(rawAccounts?.[method]) ? rawAccounts[method]! : [];
    const cleaned: MethodNumberEntry[] = [];
    const seen = new Set<string>();

    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;
      const norm = normalizeBdPhone(String(item.number || ''));
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const entryType: NumberAccountType = item.type === 'agent' ? 'agent' : 'personal';
      const actionType = normalizePaymentActionType(item.actionType, entryType);
      const customInstruction = sanitizeCustomInstruction(item.customInstruction);
      cleaned.push({
        number: norm,
        type: entryType,
        actionType,
        ...(customInstruction ? { customInstruction } : {}),
        active: item.active !== undefined ? Boolean(item.active) : true,
      });
      if (cleaned.length >= 10) break;
    }

    if (cleaned.length === 0 && legacyNumbers?.[method]) {
      const legacyNorm = normalizeBdPhone(String(legacyNumbers[method] || ''));
      if (legacyNorm) {
        cleaned.push({
          number: legacyNorm,
          type: 'personal',
          actionType: 'send_money',
          active: true,
        });
      }
    }

    result[method] = cleaned;
  }

  return result;
}

/**
 * Keeps legacy `numbers` map strictly derived from canonical `paymentAccounts`
 * so Worker / matching / setup-checklist consumers read the exact same source.
 */
export function syncLegacyNumbersFromAccounts(
  accounts: Partial<PaymentAccountsMap> | NormalizedPaymentAccountsMap,
  existingUpay = ''
): WalletNumbersMap {
  const pickPrimary = (list: MethodNumberEntry[] | undefined): string => {
    if (!Array.isArray(list) || list.length === 0) return '';
    const activeFirst = list.find((item) => item.active && item.number);
    return activeFirst?.number || list[0]?.number || '';
  };
  return {
    bkash: pickPrimary(accounts.bkash),
    nagad: pickPrimary(accounts.nagad),
    rocket: pickPrimary(accounts.rocket),
    upay: accounts.upay !== undefined ? pickPrimary(accounts.upay) : existingUpay,
  };
}

export function hasSavedNumberForMethod(
  accounts: Partial<PaymentAccountsMap> | null | undefined,
  method: WalletMethod
): boolean {
  const list = accounts?.[method];
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some((entry) => Boolean(entry && normalizeBdPhone(String(entry.number || ''))));
}

/**
 * Enforces the Smart Toggle invariant:
 * A method with zero saved numbers can NEVER be ON (`true`).
 */
export function enforceEnabledRequiresSavedNumber(
  enabled: Partial<WalletEnabledMap> | null | undefined,
  accounts: Partial<PaymentAccountsMap> | null | undefined
): WalletEnabledMap {
  return {
    bkash: hasSavedNumberForMethod(accounts, 'bkash') ? Boolean(enabled?.bkash) : false,
    nagad: hasSavedNumberForMethod(accounts, 'nagad') ? Boolean(enabled?.nagad) : false,
    rocket: hasSavedNumberForMethod(accounts, 'rocket') ? Boolean(enabled?.rocket) : false,
    upay: hasSavedNumberForMethod(accounts, 'upay') ? Boolean(enabled?.upay) : false,
  };
}

export function validateStoreWalletNumber(
  raw: string,
  existingEntries: MethodNumberEntry[] = [],
  editingIndex: number | null = null
): FieldValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      errorBn: '১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন 017XXXXXXXX)।',
    };
  }
  const normalized = normalizeBdPhone(trimmed);
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      errorBn: 'সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)।',
    };
  }
  const isDuplicate = existingEntries.some(
    (entry, idx) => idx !== editingIndex && normalizeBdPhone(entry.number) === normalized
  );
  if (isDuplicate) {
    return {
      valid: false,
      normalized,
      errorBn: 'এই নম্বরটি ইতিমধ্যেই সংরক্ষিত আছে। অনুগ্রহ করে ভিন্ন নম্বর দিন।',
    };
  }
  return { valid: true, normalized, errorBn: null };
}

export interface SaveMethodNumberRowResult {
  ok: boolean;
  errorBn: string | null;
  savedIndex: number | null;
  accounts: NormalizedPaymentAccountsMap;
  enabled: WalletEnabledMap;
}

/**
 * Pure Save operation for adding (`rowIndex === null`) or editing (`rowIndex >= 0`) a number row.
 * - Rejects invalid/duplicate numbers without discarding saved state.
 * - NEVER silently forces an OFF method ON when saving a number.
 */
export function saveMethodNumberRow(input: {
  accounts: Partial<PaymentAccountsMap> | null | undefined;
  enabled: Partial<WalletEnabledMap> | null | undefined;
  method: WalletMethod;
  rowIndex: number | null;
  draft: MethodNumberEntry;
}): SaveMethodNumberRowResult {
  const baseAccounts = normalizePaymentAccounts(input.accounts);
  const currentList = baseAccounts[input.method];
  const check = validateStoreWalletNumber(input.draft.number, currentList, input.rowIndex);

  if (!check.valid) {
    return {
      ok: false,
      errorBn: check.errorBn,
      savedIndex: null,
      accounts: baseAccounts,
      enabled: enforceEnabledRequiresSavedNumber(input.enabled, baseAccounts),
    };
  }

  const entryType: NumberAccountType = input.draft.type === 'agent' ? 'agent' : 'personal';
  const actionType = normalizePaymentActionType(input.draft.actionType, entryType);
  const customInstruction = sanitizeCustomInstruction(input.draft.customInstruction);
  const cleanedEntry: MethodNumberEntry = {
    number: check.normalized,
    type: entryType,
    actionType,
    ...(customInstruction ? { customInstruction } : {}),
    active: input.draft.active !== undefined ? Boolean(input.draft.active) : true,
  };

  const nextList = [...currentList];
  let savedIndex: number;
  if (input.rowIndex !== null && input.rowIndex >= 0 && input.rowIndex < nextList.length) {
    nextList[input.rowIndex] = cleanedEntry;
    savedIndex = input.rowIndex;
  } else {
    if (nextList.length >= 10) {
      return {
        ok: false,
        errorBn: 'প্রতি মাধ্যমে সর্বোচ্চ ১০টি নম্বর যোগ করা যায়।',
        savedIndex: null,
        accounts: baseAccounts,
        enabled: enforceEnabledRequiresSavedNumber(input.enabled, baseAccounts),
      };
    }
    nextList.push(cleanedEntry);
    savedIndex = nextList.length - 1;
  }

  const nextAccounts: NormalizedPaymentAccountsMap = {
    ...baseAccounts,
    [input.method]: nextList,
  };

  // CRITICAL: Saving a number MUST NOT silently force `enabled[method]` to `true`.
  const nextEnabled = enforceEnabledRequiresSavedNumber(input.enabled, nextAccounts);

  return {
    ok: true,
    errorBn: null,
    savedIndex,
    accounts: nextAccounts,
    enabled: nextEnabled,
  };
}

/**
 * Pure Delete operation for a saved number row.
 * Deleting the last number of a method returns it to empty and forces OFF.
 */
export function deleteMethodNumberRow(input: {
  accounts: Partial<PaymentAccountsMap> | null | undefined;
  enabled: Partial<WalletEnabledMap> | null | undefined;
  method: WalletMethod;
  rowIndex: number;
}): {
  accounts: NormalizedPaymentAccountsMap;
  enabled: WalletEnabledMap;
  becameEmpty: boolean;
} {
  const baseAccounts = normalizePaymentAccounts(input.accounts);
  const nextList = baseAccounts[input.method].filter((_, idx) => idx !== input.rowIndex);
  const nextAccounts: NormalizedPaymentAccountsMap = {
    ...baseAccounts,
    [input.method]: nextList,
  };
  const nextEnabled = enforceEnabledRequiresSavedNumber(input.enabled, nextAccounts);
  return {
    accounts: nextAccounts,
    enabled: nextEnabled,
    becameEmpty: nextList.length === 0,
  };
}

/**
 * Pure Smart Toggle operation.
 * - Cannot turn ON a method with 0 saved numbers (returns hint `"আগে নম্বর সংরক্ষণ করুন"`).
 * - Turning OFF preserves saved numbers intact and returns inline note.
 */
export function toggleStoreMethodEnabled(input: {
  accounts: Partial<PaymentAccountsMap> | null | undefined;
  enabled: Partial<WalletEnabledMap> | null | undefined;
  method: WalletMethod;
}): {
  changed: boolean;
  blockedReasonBn: string | null;
  turnedOffWithNumbers: boolean;
  inlineNoteBn: string | null;
  enabled: WalletEnabledMap;
} {
  const baseAccounts = normalizePaymentAccounts(input.accounts);
  const currentEnabled = enforceEnabledRequiresSavedNumber(input.enabled, baseAccounts);
  const hasNumbers = baseAccounts[input.method].length > 0;

  if (!hasNumbers) {
    return {
      changed: false,
      blockedReasonBn: 'আগে নম্বর সংরক্ষণ করুন',
      turnedOffWithNumbers: false,
      inlineNoteBn: null,
      enabled: { ...currentEnabled, [input.method]: false },
    };
  }

  const nextValue = !currentEnabled[input.method];
  const nextEnabled: WalletEnabledMap = {
    ...currentEnabled,
    [input.method]: nextValue,
  };

  return {
    changed: true,
    blockedReasonBn: null,
    turnedOffWithNumbers: !nextValue && hasNumbers,
    inlineNoteBn: !nextValue ? 'কাস্টমাররা এই মাধ্যমটি আর দেখতে পাবেন না' : null,
    enabled: nextEnabled,
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
    const first = activeEntries[0];
    const customInstruction = sanitizeCustomInstruction(first.customInstruction);
    options.push({
      method,
      number: first.number,
      type: first.type,
      actionType: normalizePaymentActionType(first.actionType, first.type),
      ...(customInstruction ? { customInstruction } : {}),
      accountCount: activeEntries.length,
    });
  }

  return options;
}

/**
 * Resolves enabled checkout methods from a Worker session status response.
 * Never invents methods or leaks OFF methods when `enabledMethods` is provided.
 */
export function resolveSessionCheckoutOptions(
  session: WorkerSessionStatusResponse
): CheckoutMethodOption[] {
  const options: CheckoutMethodOption[] = [];

  if (session.methodNumbers && typeof session.methodNumbers === 'object') {
    const hasExplicitEnabledList = Array.isArray(session.enabledMethods);
    const allowed = hasExplicitEnabledList
      ? session.enabledMethods!
      : (Object.keys(session.methodNumbers) as WalletMethod[]);

    for (const method of ALL_SESSION_METHODS) {
      if (!allowed.includes(method)) continue;
      const entry = session.methodNumbers[method];
      if (!entry || !entry.number) continue;
      const entryType: NumberAccountType = entry.type === 'agent' ? 'agent' : 'personal';
      const customInstruction = sanitizeCustomInstruction(entry.customInstruction);
      options.push({
        method,
        number: String(entry.number),
        type: entryType,
        actionType: normalizePaymentActionType(entry.actionType, entryType),
        ...(customInstruction ? { customInstruction } : {}),
        accountCount: 1,
      });
    }
    if (hasExplicitEnabledList || options.length > 0) {
      return options;
    }
  }

  // Backward-compatible single-method session from current Worker
  const m = String(session.method || '').toLowerCase();
  if ((m === 'bkash' || m === 'nagad' || m === 'rocket' || m === 'upay') && session.number) {
    if (Array.isArray(session.enabledMethods) && !session.enabledMethods.includes(m)) {
      return [];
    }
    const entryType: NumberAccountType = session.numberType === 'agent' ? 'agent' : 'personal';
    const customInstruction = sanitizeCustomInstruction(session.customInstruction);
    options.push({
      method: m,
      number: String(session.number),
      type: entryType,
      actionType: normalizePaymentActionType(session.actionType, entryType),
      ...(customInstruction ? { customInstruction } : {}),
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

export function mapFailureReasonBn(
  rawReason?: string | null,
  expectedAmountPaisa?: number | null,
  receivedAmountPaisa?: number | null
): {
  headline: string;
  reasons: string[];
} {
  const lower = (rawReason || '').toLowerCase();
  if (lower.includes('duplicate') || lower.includes('used') || lower === 'trxid_used') {
    return {
      headline: 'এই Transaction ID আগেই ব্যবহার করা হয়েছে',
      reasons: [
        'এই Transaction ID দিয়ে আগে একটি পেমেন্ট নিশ্চিত হয়েছে।',
        'নতুন পেমেন্ট করে থাকলে সঠিক নতুন Transaction ID লিখুন।',
      ],
    };
  }
  if (lower.includes('expir') || lower === 'expired') {
    return {
      headline: 'সেশনের নির্ধারিত সময় (১৫ মিনিট) শেষ হয়ে গেছে',
      reasons: [
        'নির্ধারিত সময়ের মধ্যে পেমেন্ট যাচাই সম্পন্ন হয়নি।',
        'অনুগ্রহ করে নতুন পেমেন্ট সেশন তৈরি করে আবার চেষ্টা করুন।',
      ],
    };
  }
  if (lower.includes('amount') || lower.includes('mismatch') || lower === 'amount_mismatch') {
    const detailLine =
      typeof expectedAmountPaisa === 'number' &&
      expectedAmountPaisa > 0 &&
      typeof receivedAmountPaisa === 'number' &&
      receivedAmountPaisa > 0
        ? `প্রত্যাশিত পরিমাণ ছিল ${formatBanglaTaka(expectedAmountPaisa)}, কিন্তু SMS-এ পাওয়া গেছে ${formatBanglaTaka(receivedAmountPaisa)}।`
        : 'নির্ধারিত ঠিক পরিমাণ টাকা পাঠানো না হলে স্বয়ংক্রিয় যাচাই ব্যর্থ হয়।';
    return {
      headline: 'পাঠানো টাকার পরিমাণ নির্ধারিত পরিমাণের সাথে মেলেনি',
      reasons: [
        detailLine,
        'সঠিক পরিমাণ পাঠিয়ে আবার চেষ্টা করুন অথবা দোকানের সাথে যোগাযোগ করুন।',
      ],
    };
  }
  if (lower === 'no_sms_yet' || lower.includes('no_sms')) {
    return {
      headline: 'এখনো কোনো ম্যাচিং SMS আসেনি',
      reasons: [
        'SMS পৌঁছাতে কয়েক সেকেন্ড সময় লাগতে পারে — একটু পর আবার চেষ্টা করুন।',
        'ফোনের PayVerify অ্যাপটি চালু এবং ইন্টারনেটে যুক্ত আছে কিনা নিশ্চিত করুন।',
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
  return { bkash: false, nagad: false, rocket: false, upay: false };
}
