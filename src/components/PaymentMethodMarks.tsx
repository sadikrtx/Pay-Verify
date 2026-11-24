import React, { useEffect, useState } from 'react';
import { getStoreInitials } from '../lib/checkoutFlow';

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
