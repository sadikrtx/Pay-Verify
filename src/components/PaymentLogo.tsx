import React, { useEffect, useState } from 'react';
import type { WalletMethod } from '../types/payment';
import { getPaymentLogoMeta } from '../lib/paymentLogos';
import bkashLogo from '../assets/payments/bkash-opt.webp';
import nagadLogo from '../assets/payments/nagad-opt.webp';
import rocketLogo from '../assets/payments/rocket-opt.webp';
import upayLogo from '../assets/payments/upay-opt.webp';

const PAYMENT_LOGO_SOURCES: Partial<Record<WalletMethod, string>> = {
  bkash: bkashLogo,
  nagad: nagadLogo,
  rocket: rocketLogo,
  upay: upayLogo,
};

export type PaymentLogoSize = 'sm' | 'md' | 'lg';

interface PaymentLogoProps {
  method: WalletMethod;
  size?: PaymentLogoSize;
  className?: string;
}

const SIZE_CLASSES: Record<
  PaymentLogoSize,
  { chip: string; img: string; fallbackText: string }
> = {
  // 28px chip height — compact badges, tables, inline selectors (uniform width aligns table/grid labels)
  sm: {
    chip: 'h-7 w-[52px] px-1.5 py-0.5 rounded-lg',
    img: 'h-5 w-auto max-w-full',
    fallbackText: 'text-[11px] px-0.5',
  },
  // 36px chip height — payment method selector tabs/cards, settings lists, marketing strip
  md: {
    chip: 'h-9 w-[76px] px-2 py-1 rounded-xl',
    img: 'h-7 w-auto max-w-full',
    fallbackText: 'text-xs px-1',
  },
  // 48px chip height — method screen header on hosted payment page
  lg: {
    chip: 'h-12 min-w-[58px] px-3 py-1.5 rounded-2xl',
    img: 'h-9 w-auto max-w-[108px]',
    fallbackText: 'text-base px-2',
  },
};

/**
 * Single shared official payment logo component for bKash, Nagad, Rocket, and Upay.
 * Renders the owner's supplied official logo file unaltered inside a soft white
 * rounded chip at uniform visual height. If a file is missing or fails to load,
 * falls back cleanly to the method's name in its brand color (never a drawn mark).
 */
export const PaymentLogo: React.FC<PaymentLogoProps> = ({
  method,
  size = 'md',
  className = '',
}) => {
  const meta = getPaymentLogoMeta(method);
  const src = PAYMENT_LOGO_SOURCES[method] || '';
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [src, method]);

  const styles = SIZE_CLASSES[size];
  const showImage = Boolean(src) && !loadFailed;

  return (
    <span
      data-testid={`payment-logo-${method}`}
      className={`inline-flex items-center justify-center shrink-0 bg-white border border-slate-200/80 shadow-2xs select-none ${styles.chip} ${className}`}
    >
      {showImage ? (
        <img
          src={src}
          alt={meta.alt}
          loading="eager"
          decoding="async"
          onError={() => setLoadFailed(true)}
          className={`${styles.img} object-contain block`}
        />
      ) : (
        <span
          className={`font-extrabold tracking-tight leading-none whitespace-nowrap ${styles.fallbackText}`}
          style={{ color: meta.brandColor }}
        >
          {meta.name}
        </span>
      )}
    </span>
  );
};
