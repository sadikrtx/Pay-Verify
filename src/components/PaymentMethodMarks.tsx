import React, { useEffect, useState } from 'react';
import type { CheckoutWalletMethod } from '../types/payment';
import { getStoreInitials } from '../lib/checkoutFlow';

interface MethodMarkProps {
  method: CheckoutWalletMethod;
  className?: string;
  inverted?: boolean;
}

/**
 * Lightweight inline SVG marks for bKash, Nagad, and Rocket.
 * Zero external image requests; sharp on all screen densities.
 */
export const PaymentMethodMark: React.FC<MethodMarkProps> = ({
  method,
  className = 'w-10 h-10',
  inverted = false,
}) => {
  if (method === 'bkash') {
    const bg = inverted ? '#FFFFFF' : '#E2136E';
    const fg = inverted ? '#E2136E' : '#FFFFFF';
    return (
      <svg
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <rect width="44" height="44" rx="12" fill={bg} />
        <path
          d="M11 16.5L22.5 11L31.5 21.5L23.5 25L11 16.5Z"
          fill={fg}
          fillOpacity={inverted ? '1' : '0.95'}
        />
        <path
          d="M23.5 25L31.5 21.5L34 26L21 33L23.5 25Z"
          fill={fg}
          fillOpacity={inverted ? '0.78' : '0.78'}
        />
        <path d="M11 16.5L19.5 28L13.5 31L11 16.5Z" fill={fg} fillOpacity="0.62" />
      </svg>
    );
  }

  if (method === 'nagad') {
    const bg = inverted ? '#FFFFFF' : '#E04F16';
    const fg = inverted ? '#E04F16' : '#FFFFFF';
    return (
      <svg
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <rect width="44" height="44" rx="12" fill={bg} />
        <path
          d="M22.8 10C18.5 13.8 14 18.6 14 24.4C14 29.2 17.6 33 22.2 33C26.9 33 30.5 29.3 30.5 24.6C30.5 21.4 28.9 18.6 26.8 16.4C26.6 18.9 25.3 20.6 23.4 21.4C24.7 17.8 24.4 13.4 22.8 10Z"
          fill={fg}
        />
        <circle cx="22.2" cy="26.2" r="3.1" fill={bg} />
      </svg>
    );
  }

  // Rocket
  const bg = inverted ? '#FFFFFF' : '#892B91';
  const fg = inverted ? '#892B91' : '#FFFFFF';
  return (
    <svg
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="44" height="44" rx="12" fill={bg} />
      <path
        d="M29.8 14.2C25.6 14.2 21.2 16 18.2 19L15.4 21.8L22.2 28.6L25 25.8C28 22.8 29.8 18.4 29.8 14.2Z"
        fill={fg}
      />
      <path
        d="M15.4 21.8L11.8 22.6L14.2 25.4L18.6 29.8L21.4 32.2L22.2 28.6L15.4 21.8Z"
        fill={fg}
        fillOpacity="0.72"
      />
      <circle cx="24" cy="20" r="2.2" fill={bg} />
    </svg>
  );
};

interface StoreBrandAvatarProps {
  name: string;
  nameEn?: string;
  logoUrl?: string;
  logoDataUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Displays merchant's uploaded or linked logo cleanly.
 * If missing or if the image fails to load, falls back immediately to a styled
 * initial badge — never renders a broken image icon.
 */
export const StoreBrandAvatar: React.FC<StoreBrandAvatarProps> = ({
  name,
  nameEn,
  logoUrl,
  logoDataUrl,
  size = 'md',
}) => {
  const src = (logoDataUrl && logoDataUrl.trim()) || (logoUrl && logoUrl.trim()) || '';
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  const showImage = Boolean(src) && failedSrc !== src;
  const initials = getStoreInitials(name, nameEn);

  const dims =
    size === 'sm'
      ? 'w-9 h-9 rounded-xl text-xs'
      : size === 'lg'
        ? 'w-14 h-14 rounded-2xl text-lg'
        : 'w-12 h-12 rounded-2xl text-sm';

  if (showImage) {
    return (
      <div
        className={`${dims} bg-white border border-slate-200/90 shadow-xs overflow-hidden flex items-center justify-center shrink-0 p-1`}
      >
        <img
          src={src}
          alt={name || nameEn || 'স্টোর লোগো'}
          className="w-full h-full object-contain"
          onError={() => setFailedSrc(src)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${dims} bg-slate-900 text-white font-bold tracking-tight flex items-center justify-center shrink-0 shadow-xs select-none`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
};
