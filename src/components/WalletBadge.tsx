import React from 'react';
import {
  WALLET_META,
  type SessionStatus,
  type SmsMatchResult,
  type WalletMethod,
} from '../types/payment';
import { PaymentLogo } from './PaymentLogo';

export const WalletMethodChip: React.FC<{ method: WalletMethod }> = ({ method }) => {
  const meta = WALLET_META[method] || WALLET_META.bkash;
  return (
    <span
      className="inline-flex items-center gap-2 pr-2.5 pl-1 py-0.5 rounded-xl text-xs font-semibold whitespace-nowrap border"
      style={{
        backgroundColor: meta.softBg,
        color: meta.color,
        borderColor: meta.borderColor,
      }}
    >
      <PaymentLogo method={method} size="sm" />
      <span>{meta.name}</span>
    </span>
  );
};

export const SessionStatusChip: React.FC<{ status: SessionStatus; manual?: boolean }> = ({
  status,
  manual,
}) => {
  const config: Record<SessionStatus, { label: string; classes: string }> = {
    waiting: {
      label: 'অপেক্ষমাণ',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    paid: {
      label: manual ? 'পরিশোধিত (ম্যানুয়াল)' : 'পরিশোধিত',
      classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    expired: {
      label: 'মেয়াদ শেষ',
      classes: 'bg-rose-50 text-rose-800 border-rose-200',
    },
    cancelled: {
      label: 'বাতিল',
      classes: 'bg-slate-100 text-slate-600 border-slate-200',
    },
    failed: {
      label: 'ব্যর্থ',
      classes: 'bg-rose-50 text-rose-800 border-rose-200',
    },
  };
  const item = config[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap ${item.classes}`}
    >
      {item.label}
    </span>
  );
};

export const SmsMatchChip: React.FC<{ result: SmsMatchResult }> = ({ result }) => {
  const config: Record<SmsMatchResult, { label: string; classes: string }> = {
    matched: {
      label: 'মিলেছে',
      classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    unmatched: {
      label: 'মেলেনি',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    duplicate_trxid: {
      label: 'ডুপ্লিকেট TrxID',
      classes: 'bg-rose-50 text-rose-800 border-rose-200',
    },
    late: {
      label: 'দেরিতে এসেছে',
      classes: 'bg-violet-50 text-violet-800 border-violet-200',
    },
  };
  const item = config[result] || config.unmatched;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap ${item.classes}`}
    >
      {item.label}
    </span>
  );
};

export const TestModeBadge: React.FC<{ label?: string }> = ({ label = 'TEST' }) => (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold tracking-wide bg-orange-100 text-orange-800 border border-orange-300 whitespace-nowrap"
    data-testid="test-mode-badge"
  >
    {label}
  </span>
);

export const TestResultChip: React.FC<{
  result: 'pending' | 'verified' | 'verified_simulated' | 'failed';
  cancelled?: boolean;
}> = ({ result, cancelled }) => {
  if (cancelled) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap bg-slate-100 text-slate-600 border-slate-200">
        বাতিল হয়েছে
      </span>
    );
  }
  const config: Record<
    'pending' | 'verified' | 'verified_simulated' | 'failed',
    { label: string; classes: string }
  > = {
    pending: {
      label: 'অপেক্ষমাণ',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    verified: {
      label: 'যাচাই হয়েছে',
      classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    verified_simulated: {
      label: 'সিমুলেশনে যাচাই হয়েছে',
      classes: 'bg-orange-50 text-orange-800 border-orange-300',
    },
    failed: {
      label: 'ব্যর্থ',
      classes: 'bg-rose-50 text-rose-800 border-rose-200',
    },
  };
  const item = config[result] || config.pending;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap ${item.classes}`}
    >
      {item.label}
    </span>
  );
};

