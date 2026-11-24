import type { PaySessionDoc, PaySmsDoc } from '../types/payment';

export const MAX_AMOUNT_PAISA = 100_000_000; // ৳10,00,000.00
export const MIN_AMOUNT_PAISA = 100; // ৳1.00

/**
 * Parses a decimal Taka input into exact integer paisa (100 paisa = ৳1).
 */
export function takaToPaisa(input: string | number): number | null {
  const cleaned = String(input).replace(/[,৳\s]/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [wholeStr, fracStr = ''] = cleaned.split('.');
  const whole = Number.parseInt(wholeStr, 10);
  const frac = Number.parseInt(fracStr.padEnd(2, '0'), 10);
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(frac)) {
    return null;
  }
  const paisa = whole * 100 + frac;
  if (paisa < 1 || paisa > MAX_AMOUNT_PAISA + 99) {
    return null;
  }
  return paisa;
}

/**
 * Formats integer paisa with ৳ symbol and Bengali-style (lakh/thousand) grouping.
 * Always shows 2 decimal places when fractional paisa is non-zero or alwaysDecimals=true.
 */
export function formatBdt(paisa: number, options?: { alwaysDecimals?: boolean }): string {
  const safe = Math.trunc(Number.isFinite(paisa) ? paisa : 0);
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeFormatted = whole.toLocaleString('en-IN');
  const showDecimals = options?.alwaysDecimals ?? frac !== 0;
  if (!showDecimals) {
    return `${negative ? '-' : ''}৳${wholeFormatted}`;
  }
  return `${negative ? '-' : ''}৳${wholeFormatted}.${String(frac).padStart(2, '0')}`;
}

export function formatCopyAmount(paisa: number): string {
  const abs = Math.abs(Math.trunc(paisa));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

export function hasFractionalPaisa(paisa: number): boolean {
  return Math.abs(Math.trunc(paisa)) % 100 !== 0;
}

export function normalizeBdPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  let normalized = digits;
  if (normalized.startsWith('8801') && normalized.length === 13) {
    normalized = normalized.slice(2);
  }
  if (/^01[3-9]\d{8}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '00:00';
  const totalSec = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function parseTimestampMs(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && Number.isFinite(val)) {
    // Handle Unix seconds vs milliseconds
    return val < 10_000_000_000 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const num = Number(val);
    if (Number.isFinite(num) && val.trim() !== '') {
      return num < 10_000_000_000 ? num * 1000 : num;
    }
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (
    typeof val === 'object' &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function formatBanglaDateTime(ms: number | null): string {
  if (!ms) return 'কখনো নয়';
  const d = new Date(ms);
  return d.toLocaleString('bn-BD', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface DashboardMetrics {
  todayTotalPaisa: number;
  todayMatchedCount: number;
  waitingCount: number;
  unmatchedSmsCount: number;
}

/**
 * Computes the 4 live Overview stat card figures from Firestore paySessions & paySms.
 */
export function computeDashboardMetrics(
  sessions: PaySessionDoc[],
  smsList: PaySmsDoc[],
  nowMs: number
): DashboardMetrics {
  const startOfDay = new Date(nowMs);
  startOfDay.setHours(0, 0, 0, 0);
  const startMs = startOfDay.getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;

  let todayTotalPaisa = 0;
  let todayMatchedCount = 0;
  let waitingCount = 0;

  for (const s of sessions) {
    if (s.status === 'paid') {
      const paidTime = s.paidAtMs ?? s.createdAtMs;
      if (paidTime >= startMs && paidTime < endMs) {
        todayTotalPaisa += s.payablePaisa;
        todayMatchedCount += 1;
      }
    } else if (s.status === 'waiting' && nowMs < s.expiresAtMs) {
      waitingCount += 1;
    }
  }

  const unmatchedSmsCount = smsList.filter((m) => m.matchResult === 'unmatched').length;

  return {
    todayTotalPaisa,
    todayMatchedCount,
    waitingCount,
    unmatchedSmsCount,
  };
}

export interface DailyPaidBucket {
  dateKey: string;
  label: string;
  totalPaisa: number;
  count: number;
}

/**
 * Aggregates paid session amounts across the last 7 local calendar days for the Overview bar chart.
 */
export function computeLast7DaysPaid(sessions: PaySessionDoc[], nowMs: number): DailyPaidBucket[] {
  const base = new Date(nowMs);
  base.setHours(0, 0, 0, 0);
  const buckets: DailyPaidBucket[] = [];
  const byKey = new Map<string, DailyPaidBucket>();

  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(base.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const label = day.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });
    const bucket: DailyPaidBucket = { dateKey: key, label, totalPaisa: 0, count: 0 };
    buckets.push(bucket);
    byKey.set(key, bucket);
  }

  for (const s of sessions) {
    if (s.status !== 'paid') continue;
    const paidMs = s.paidAtMs ?? s.createdAtMs;
    const d = new Date(paidMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.totalPaisa += s.payablePaisa;
      bucket.count += 1;
    }
  }

  return buckets;
}
