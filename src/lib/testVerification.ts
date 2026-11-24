import {
  WALLET_METHODS,
  type PaySessionDoc,
  type PayStoreDoc,
  type TestFailureReasonCode,
  type TestVerificationResult,
  type TestVerificationType,
  type WalletMethod,
} from '../types/payment';
import { formatBdt, formatCopyAmount, normalizeBdPhone } from './money';
import { normalizePaymentAccounts } from './checkoutFlow';

export const TEST_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes fast expiry
export const DEFAULT_TEST_AMOUNT_PAISA = 1000; // ৳10

export interface StoreEnabledMethodOption {
  method: WalletMethod;
  number: string;
}

/**
 * Returns ONLY the wallet methods switched ON for the given store that also have a valid receiving number.
 */
export function getStoreEnabledMethodOptions(
  store: Pick<PayStoreDoc, 'numberEnabled' | 'numbers' | 'paymentAccounts'> | null | undefined
): StoreEnabledMethodOption[] {
  if (!store) return [];
  const accounts = normalizePaymentAccounts(store.paymentAccounts, store.numbers);
  const result: StoreEnabledMethodOption[] = [];

  for (const method of WALLET_METHODS) {
    if (!store.numberEnabled[method]) continue;
    let resolvedNumber = '';

    if (method === 'bkash' || method === 'nagad' || method === 'rocket') {
      const activeAccount = accounts[method].find((entry) => entry.active && entry.number);
      resolvedNumber = activeAccount?.number || '';
    }

    if (!resolvedNumber) {
      resolvedNumber = normalizeBdPhone(store.numbers[method] || '') || '';
    }

    if (resolvedNumber) {
      result.push({ method, number: resolvedNumber });
    }
  }

  return result;
}

export function isSimulatedTrxId(trxId: string | null | undefined): boolean {
  if (!trxId) return false;
  return /^SIM[A-Z0-9_-]{4,60}$/i.test(trxId.trim());
}

/**
 * Generates a fresh unique simulated TrxID prefixed with `SIM` that can never collide with real TrxIDs.
 */
export function generateFreshSimTrxId(existingTrxIds?: Iterable<string>): string {
  const used = new Set<string>();
  if (existingTrxIds) {
    for (const id of existingTrxIds) {
      if (id) used.add(id.trim().toUpperCase());
    }
  }

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 40; attempt++) {
    let suffix = '';
    for (let i = 0; i < 8; i++) {
      suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    const candidate = `SIM${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  const fallback = `SIM${Date.now().toString(36).toUpperCase().slice(-8)}`;
  return fallback;
}

export interface GeneratedSampleWalletSms {
  method: WalletMethod;
  amountPaisa: number;
  smsSenderAddress: string;
  customerPhone: string;
  trxId: string;
  raw: string;
  smsTimeMs: number;
  simulated: true;
}

function formatSmsDateTime(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function pickSampleCustomerPhone(method: WalletMethod, receiverNumber: string): string {
  const candidates: Record<WalletMethod, string[]> = {
    bkash: ['01711009988', '01755112233'],
    nagad: ['01819001122', '01844223344'],
    rocket: ['01911002233', '01933445566'],
    upay: ['01611003344', '01677889900'],
  };
  const list = candidates[method];
  return list.find((n) => n !== receiverNumber) || '01700000099';
}

/**
 * Generates a realistic Bangladeshi mobile wallet SMS for simulation testing.
 */
export function generateSampleWalletSms(input: {
  method: WalletMethod;
  amountPaisa: number;
  receiverNumber: string;
  existingTrxIds?: Iterable<string>;
  timestampMs?: number;
}): GeneratedSampleWalletSms {
  const nowMs = input.timestampMs ?? Date.now();
  const trxId = generateFreshSimTrxId(input.existingTrxIds);
  const amountNum = formatCopyAmount(input.amountPaisa);
  const amountWithDec = amountNum.includes('.') ? amountNum : `${amountNum}.00`;
  const customerPhone = pickSampleCustomerPhone(input.method, input.receiverNumber);
  const formattedTime = formatSmsDateTime(nowMs);

  let smsSenderAddress = 'bKash';
  let raw = '';

  switch (input.method) {
    case 'nagad':
      smsSenderAddress = 'Nagad';
      raw = `Money Received. Amount: Tk ${amountWithDec} Sender: ${customerPhone} Ref: TEST TxnID: ${trxId} Balance: Tk 1,250.00`;
      break;
    case 'rocket':
      smsSenderAddress = '16216';
      raw = `DBBL Mobile Banking: Cash-In/Recv Tk${amountWithDec} from A/C ${customerPhone}X TxnId:${trxId} Date:${formattedTime} Bal:Tk1250.00`;
      break;
    case 'upay':
      smsSenderAddress = 'upay';
      raw = `You have received Tk ${amountWithDec} from ${customerPhone}. TrxID: ${trxId}. Your current balance is Tk 1,250.00.`;
      break;
    case 'bkash':
    default:
      smsSenderAddress = 'bKash';
      raw = `You have received Tk ${amountWithDec} from ${customerPhone}. Fee Tk 0.00. Balance Tk 1,250.00. TrxID ${trxId} at ${formattedTime}`;
      break;
  }

  return {
    method: input.method,
    amountPaisa: input.amountPaisa,
    smsSenderAddress,
    customerPhone,
    trxId,
    raw,
    smsTimeMs: nowMs,
    simulated: true,
  };
}

/**
 * Formats failure reasons strictly in clean Bangla.
 * Supports: amount_mismatch (with expected vs received), expired, trxid_used, no_sms_yet.
 */
export function formatTestFailureReasonBn(
  reasonCodeOrRaw: string | null | undefined,
  expectedAmountPaisa?: number | null,
  receivedAmountPaisa?: number | null
): string {
  const code = (reasonCodeOrRaw || '').trim().toLowerCase();

  if (code === 'amount_mismatch' || code.includes('mismatch') || code.includes('amount')) {
    if (
      typeof expectedAmountPaisa === 'number' &&
      expectedAmountPaisa > 0 &&
      typeof receivedAmountPaisa === 'number' &&
      receivedAmountPaisa > 0
    ) {
      return `টাকার পরিমাণ মেলেনি (প্রত্যাশিত ${formatBdt(expectedAmountPaisa)}, এসেছে ${formatBdt(receivedAmountPaisa)})`;
    }
    return 'টাকার পরিমাণ নির্ধারিত পরিমাণের সাথে মেলেনি';
  }

  if (code === 'expired' || code.includes('expir')) {
    return 'সেশনের সময় (১৫ মিনিট) শেষ হয়ে গেছে';
  }

  if (code === 'trxid_used' || code.includes('duplicate') || code.includes('used')) {
    return 'এই Transaction ID আগেই ব্যবহার করা হয়েছে';
  }

  if (code === 'no_sms_yet' || code.includes('no_sms') || code.includes('not_found')) {
    return 'এখনো কোনো ম্যাচিং SMS আসেনি';
  }

  if (code === 'simulation_on_real_session_forbidden') {
    return 'নিরাপত্তা নীতি: সিমুলেটেড SMS দিয়ে আসল সেশন যাচাই করা যাবে না';
  }

  return reasonCodeOrRaw?.trim() || 'পেমেন্ট যাচাই করা যায়নি';
}

export interface EvaluateSmsInput {
  session: Pick<
    PaySessionDoc,
    'id' | 'method' | 'payablePaisa' | 'status' | 'expiresAtMs' | 'isTest' | 'testType'
  >;
  sms: {
    method: WalletMethod;
    amountPaisa: number;
    sender: string;
    trxId: string;
    simulated?: boolean;
  };
  usedTrxIds?: ReadonlySet<string>;
  nowMs?: number;
  webhookUrl?: string | null;
}

export type EvaluateSmsOutcome =
  | {
      ok: true;
      status: 'paid';
      testResult: TestVerificationResult | undefined;
      simulated: boolean;
      webhookFired: false | boolean;
      trxId: string;
      paidAtMs: number;
    }
  | {
      ok: false;
      rejectedForbidden?: boolean;
      failureCode: TestFailureReasonCode | 'simulation_on_real_session_forbidden';
      failureReasonBn: string;
      expectedAmountPaisa: number;
      receivedAmountPaisa: number;
      webhookFired: false;
    };

/**
 * Hard Server-Equivalent Safety & Matching Engine for Test & Real SMS Ingest.
 * Enforces:
 * 1. Simulated SMS (`simulated === true`) can ONLY verify `session.isTest === true`.
 *    A real (non-test) session can NEVER be marked paid by simulation.
 * 2. Test sessions (`isTest === true`) NEVER fire the store's production webhook (`webhookFired = false`).
 * 3. Simulated TrxIDs must carry `SIM` prefix and cannot replay already-used TrxIDs.
 * 4. Enforces 15-minute expiry and exact integer paisa match (returning Bangla `amount_mismatch`).
 */
export function evaluateSmsAgainstSession(input: EvaluateSmsInput): EvaluateSmsOutcome {
  const { session, sms, usedTrxIds, webhookUrl } = input;
  const nowMs = input.nowMs ?? Date.now();
  const isSimulated = Boolean(sms.simulated);
  const normalizedTrxId = sms.trxId.trim().toUpperCase();

  // HARD SAFETY RULE 1: A simulated SMS can ONLY verify a test session (isTest === true).
  if (isSimulated && session.isTest !== true) {
    return {
      ok: false,
      rejectedForbidden: true,
      failureCode: 'simulation_on_real_session_forbidden',
      failureReasonBn: formatTestFailureReasonBn('simulation_on_real_session_forbidden'),
      expectedAmountPaisa: session.payablePaisa,
      receivedAmountPaisa: sms.amountPaisa,
      webhookFired: false,
    };
  }

  // HARD SAFETY RULE 2: Replay check for used TrxIDs
  if (usedTrxIds && usedTrxIds.has(normalizedTrxId)) {
    return {
      ok: false,
      failureCode: 'trxid_used',
      failureReasonBn: formatTestFailureReasonBn('trxid_used'),
      expectedAmountPaisa: session.payablePaisa,
      receivedAmountPaisa: sms.amountPaisa,
      webhookFired: false,
    };
  }

  // HARD SAFETY RULE 3: Expiry check (15-min fast expiry for test sessions)
  if (session.status === 'expired' || nowMs > session.expiresAtMs) {
    return {
      ok: false,
      failureCode: 'expired',
      failureReasonBn: formatTestFailureReasonBn('expired'),
      expectedAmountPaisa: session.payablePaisa,
      receivedAmountPaisa: sms.amountPaisa,
      webhookFired: false,
    };
  }

  if (sms.method !== session.method) {
    return {
      ok: false,
      failureCode: 'no_sms_yet',
      failureReasonBn: formatTestFailureReasonBn('no_sms_yet'),
      expectedAmountPaisa: session.payablePaisa,
      receivedAmountPaisa: sms.amountPaisa,
      webhookFired: false,
    };
  }

  if (Math.trunc(sms.amountPaisa) !== Math.trunc(session.payablePaisa)) {
    return {
      ok: false,
      failureCode: 'amount_mismatch',
      failureReasonBn: formatTestFailureReasonBn(
        'amount_mismatch',
        session.payablePaisa,
        sms.amountPaisa
      ),
      expectedAmountPaisa: session.payablePaisa,
      receivedAmountPaisa: sms.amountPaisa,
      webhookFired: false,
    };
  }

  const finalTrxId =
    isSimulated && !isSimulatedTrxId(normalizedTrxId)
      ? generateFreshSimTrxId(usedTrxIds)
      : normalizedTrxId;

  // HARD SAFETY RULE 4: Test sessions NEVER fire the store's production webhook.
  const shouldFireWebhook = session.isTest === true ? false : Boolean(webhookUrl && webhookUrl.trim());

  const testResult: TestVerificationResult | undefined =
    session.isTest === true ? (isSimulated ? 'verified_simulated' : 'verified') : undefined;

  return {
    ok: true,
    status: 'paid',
    testResult,
    simulated: isSimulated,
    webhookFired: shouldFireWebhook,
    trxId: finalTrxId,
    paidAtMs: nowMs,
  };
}

export interface TestSessionDisplayState {
  code: TestVerificationResult;
  labelBn: string;
  reasonBn: string | null;
}

export function getTestSessionDisplayState(
  session: PaySessionDoc,
  nowMs: number
): TestSessionDisplayState {
  if (session.status === 'paid') {
    if (session.testResult === 'verified_simulated' || session.simulated) {
      return {
        code: 'verified_simulated',
        labelBn: 'সিমুলেশনে যাচাই হয়েছে',
        reasonBn: null,
      };
    }
    return {
      code: 'verified',
      labelBn: 'যাচাই হয়েছে',
      reasonBn: null,
    };
  }

  if (session.status === 'failed') {
    return {
      code: 'failed',
      labelBn: 'ব্যর্থ',
      reasonBn: formatTestFailureReasonBn(
        session.failureReason,
        session.expectedAmountPaisa ?? session.payablePaisa,
        session.receivedAmountPaisa
      ),
    };
  }

  if (session.status === 'expired' || (session.status === 'waiting' && nowMs >= session.expiresAtMs)) {
    return {
      code: 'failed',
      labelBn: 'ব্যর্থ',
      reasonBn: formatTestFailureReasonBn('expired'),
    };
  }

  if (session.status === 'cancelled') {
    return {
      code: 'failed',
      labelBn: 'বাতিল হয়েছে',
      reasonBn: null,
    };
  }

  return {
    code: 'pending',
    labelBn: 'অপেক্ষমাণ',
    reasonBn: null,
  };
}

export interface TestHistoryEntry {
  sessionId: string;
  storeId: string;
  storeName: string;
  method: WalletMethod;
  amountPaisa: number;
  testType: TestVerificationType;
  result: TestVerificationResult;
  resultLabelBn: string;
  failureReasonBn: string | null;
  trxId: string | null;
  createdAtMs: number;
}

export function buildTestHistoryEntries(
  sessions: PaySessionDoc[],
  stores: Array<Pick<PayStoreDoc, 'id' | 'name'>>,
  nowMs: number,
  clearedBeforeMs = 0
): TestHistoryEntry[] {
  const storeMap = new Map<string, string>();
  for (const st of stores) {
    storeMap.set(st.id, st.name);
  }

  return sessions
    .filter((s) => s.isTest === true && s.createdAtMs > clearedBeforeMs)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 10)
    .map((s) => {
      const display = getTestSessionDisplayState(s, nowMs);
      const testType: TestVerificationType = s.testType === 'simulation' ? 'simulation' : 'real';
      return {
        sessionId: s.id,
        storeId: s.storeId,
        storeName: storeMap.get(s.storeId) || 'স্টোর',
        method: s.method,
        amountPaisa: s.payablePaisa,
        testType,
        result: display.code,
        resultLabelBn: display.labelBn,
        failureReasonBn: display.reasonBn,
        trxId: s.trxId,
        createdAtMs: s.createdAtMs,
      };
    });
}
