import type { WalletMethod } from '../types/payment';

export interface PaymentLogoMeta {
  method: WalletMethod;
  name: string;
  alt: string;
  brandColor: string;
}

export const PAYMENT_LOGO_META: Record<WalletMethod, PaymentLogoMeta> = {
  bkash: {
    method: 'bkash',
    name: 'bKash',
    alt: 'bKash',
    brandColor: '#E2136E',
  },
  nagad: {
    method: 'nagad',
    name: 'Nagad',
    alt: 'Nagad',
    brandColor: '#E04F16',
  },
  rocket: {
    method: 'rocket',
    name: 'Rocket',
    alt: 'Rocket',
    brandColor: '#892B91',
  },
  upay: {
    method: 'upay',
    name: 'Upay',
    alt: 'Upay',
    brandColor: '#005BAC',
  },
};

export function getPaymentLogoMeta(method: WalletMethod): PaymentLogoMeta {
  return PAYMENT_LOGO_META[method] ?? PAYMENT_LOGO_META.bkash;
}
