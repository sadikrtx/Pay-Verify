import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface PayVerifyBrandMarkProps {
  logoUrl?: string;
  logoDataUrl?: string;
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

export const PayVerifyBrandMark: React.FC<PayVerifyBrandMarkProps> = ({
  logoUrl,
  logoDataUrl,
  variant = 'dark',
  size = 'md',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = (logoDataUrl || logoUrl || '').trim();
  const showCustomLogo = Boolean(src) && !imgFailed;

  const boxClass =
    size === 'lg' ? 'w-11 h-11 rounded-2xl' : size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl';
  const textClass =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg';
  const wordmarkColor = variant === 'light' ? 'text-white' : 'text-[#0B3B36]';

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      {showCustomLogo ? (
        <span
          className={`${boxClass} bg-white border border-black/8 overflow-hidden flex items-center justify-center shrink-0 shadow-xs`}
        >
          <img
            src={src}
            alt="Pay Verify"
            className="w-full h-full object-contain p-1"
            onError={() => setImgFailed(true)}
          />
        </span>
      ) : (
        <span
          className={`${boxClass} ${
            variant === 'light'
              ? 'bg-white/15 text-white border border-white/20'
              : 'bg-gradient-to-br from-[#0B3B36] to-[#0F766E] text-white'
          } flex items-center justify-center shrink-0 shadow-xs`}
        >
          <ShieldCheck className={size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />
        </span>
      )}
      <span
        className={`${textClass} font-bold tracking-tight ${wordmarkColor} whitespace-nowrap`}
        style={{ fontFamily: "'Plus Jakarta Sans', 'Hind Siliguri', sans-serif" }}
      >
        Pay Verify
      </span>
    </span>
  );
};
