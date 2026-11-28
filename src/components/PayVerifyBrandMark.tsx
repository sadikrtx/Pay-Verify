import React from 'react';
import payVerifyLogoLight from '../assets/brand/pay-verify-logo-light.png';
import payVerifyLogoDark from '../assets/brand/pay-verify-logo-dark.png';
import payVerifyIcon from '../assets/brand/pay-verify-icon.png';

/**
 * Centralized official Pay Verify brand image registry.
 * Swapping any official asset file here updates every screen in the app at once.
 */
export const PAY_VERIFY_BRAND_ASSETS = {
  fullLight: payVerifyLogoLight,
  fullDark: payVerifyLogoDark,
  icon: payVerifyIcon,
} as const;

export interface PayVerifyBrandMarkProps {
  /** Retained for call-site compatibility; the official brand files are always used. */
  logoUrl?: string;
  logoDataUrl?: string;
  /**
   * Legacy surface hint used by existing callers:
   * - 'dark' = placed on a LIGHT surface (previously dark text on light bg)
   * - 'light' = placed on a DARK surface (previously light text on dark bg)
   */
  variant?: 'light' | 'dark';
  /** Explicit surface background tone; overrides `variant` when provided. */
  surface?: 'light' | 'dark';
  /** 'full' renders the full official logo (icon + "Pay Verify"); 'icon' renders icon only. */
  mode?: 'full' | 'icon';
  /**
   * Standard responsive heights (preserving exact aspect ratio via `w-auto`):
   * - 'xs': 16px (icon-only inline mark)
   * - 'footer': 32–36px (footers & receipts)
   * - 'sm': 36px (compact headers & mobile top bar)
   * - 'md': 36–40px (main headers & sidebar)
   * - 'lg': 56–64px (login page & loading splash)
   */
  size?: 'xs' | 'footer' | 'sm' | 'md' | 'lg';
  className?: string;
}

const FULL_HEIGHT_CLASS: Record<NonNullable<PayVerifyBrandMarkProps['size']>, string> = {
  xs: 'h-6',
  footer: 'h-8 sm:h-9',
  sm: 'h-9',
  md: 'h-9 sm:h-10',
  lg: 'h-14 sm:h-16',
};

const ICON_SIZE_CLASS: Record<NonNullable<PayVerifyBrandMarkProps['size']>, string> = {
  xs: 'h-4 w-4',
  footer: 'h-8 w-8',
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

export const PayVerifyBrandMark: React.FC<PayVerifyBrandMarkProps> = ({
  variant = 'dark',
  surface,
  mode = 'full',
  size = 'md',
  className = '',
}) => {
  const effectiveSurface: 'light' | 'dark' =
    surface ?? (variant === 'light' ? 'dark' : 'light');

  if (mode === 'icon') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 select-none ${className}`.trim()}
      >
        <img
          src={PAY_VERIFY_BRAND_ASSETS.icon}
          alt="Pay Verify"
          draggable={false}
          className={`${ICON_SIZE_CLASS[size]} object-contain block`}
        />
      </span>
    );
  }

  const src =
    effectiveSurface === 'dark'
      ? PAY_VERIFY_BRAND_ASSETS.fullDark
      : PAY_VERIFY_BRAND_ASSETS.fullLight;

  return (
    <span className={`inline-flex items-center shrink-0 select-none ${className}`.trim()}>
      <img
        src={src}
        alt="Pay Verify"
        draggable={false}
        className={`${FULL_HEIGHT_CLASS[size]} w-auto object-contain block`}
      />
    </span>
  );
};

export const PayVerifyLogo = PayVerifyBrandMark;
