import React from 'react';
import {
  WALLET_META,
  type SessionStatus,
  type SmsMatchResult,
  type WalletMethod,
} from '../types/payment';

export const WalletMethodChip: React.FC<{ method: WalletMethod }> = ({ method }) => {
  const meta = WALLET_META[method] || WALLET_META.bkash;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap border"
      style={{
        backgroundColor: meta.softBg,
        color: meta.color,
        borderColor: meta.borderColor,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: meta.color }}
        aria-hidden="true"
      />
      {meta.name}
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
