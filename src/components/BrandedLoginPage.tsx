import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Shield,
} from 'lucide-react';
import { PayVerifyBrandMark } from './PayVerifyBrandMark';
import { buildLoginBookmarkUrl } from '../lib/funnelLogic';
import type { PayPlatformConfig } from '../types/payment';

interface BrandedLoginPageProps {
  portal: 'buyer' | 'admin';
  platformConfig: PayPlatformConfig;
  prefilledEmail?: string;
  justCreatedAccount?: boolean;
  onEmailSignIn: (email: string, password: string, portal: 'buyer' | 'admin') => Promise<void>;
  onGoogleSignIn: (portal: 'buyer' | 'admin') => Promise<void>;
}

function mapLoginErrorBn(err: unknown): string {
  if (err instanceof Error && err.message === 'এই পোর্টালটি শুধু অ্যাডমিনের জন্য') {
    return 'এই পোর্টালটি শুধু অ্যাডমিনের জন্য';
  }
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'ইমেইল বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।';
  }
  if (code === 'auth/too-many-requests') {
    return 'অতিরিক্ত চেষ্টার কারণে সাময়িকভাবে বন্ধ আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'সাইন-ইন পপআপ বন্ধ করা হয়েছে।';
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return 'লগইন করা যায়নি। আবার চেষ্টা করুন।';
}

export const BrandedLoginPage: React.FC<BrandedLoginPageProps> = ({
  portal,
  platformConfig,
  prefilledEmail = '',
  justCreatedAccount = false,
  onEmailSignIn,
  onGoogleSignIn,
}) => {
  const isAdminPortal = portal === 'admin';
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const loginBookmarkUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://payverify.app';
    return buildLoginBookmarkUrl(origin);
  }, []);

  const handleCopyLoginUrl = async () => {
    try {
      await navigator.clipboard.writeText(loginBookmarkUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2400);
    } catch {
      // Fallback copy
      const input = document.createElement('input');
      input.value = loginBookmarkUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2400);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onEmailSignIn(email.trim(), password, portal);
    } catch (err) {
      setError(mapLoginErrorBn(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleClick = async () => {
    setError(null);
    setBusy(true);
    try {
      await onGoogleSignIn(portal);
    } catch (err) {
      setError(mapLoginErrorBn(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#FFF9EC] text-[#142523] flex flex-col items-center justify-center px-4 py-10"
      data-testid={isAdminPortal ? 'admin-login-page' : 'buyer-login-page'}
    >
      <div className="w-full max-w-md space-y-5">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-2">
          <PayVerifyBrandMark
            logoUrl={platformConfig.brandLogoUrl}
            logoDataUrl={platformConfig.brandLogoDataUrl}
            variant="dark"
            size="lg"
          />
        </div>

        {/* Post-Signup Bookmark Card ("তোমার লগইন ঠিকানা") shown immediately after Step 4 */}
        {!isAdminPortal && justCreatedAccount && (
          <div
            className="bg-white rounded-3xl border-2 border-[#0F766E]/35 p-5 space-y-3 shadow-xs"
            data-testid="login-bookmark-card"
          >
            <div className="flex items-center gap-2 text-[#0B3B36] font-bold text-base">
              <Bookmark className="w-4.5 h-4.5 text-[#0F766E] shrink-0" />
              <span>তোমার লগইন ঠিকানা</span>
            </div>
            <div className="flex items-center gap-2 bg-[#FFF9EC] border border-[#E8DEC8] rounded-xl px-3 py-2.5">
              <span className="text-xs sm:text-sm font-mono font-semibold text-[#0B3B36] truncate flex-1 select-all">
                {loginBookmarkUrl}
              </span>
              <button
                type="button"
                onClick={() => void handleCopyLoginUrl()}
                data-testid="copy-login-url-btn"
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B3B36] hover:bg-[#0F766E] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedUrl ? 'কপি হয়েছে' : 'লিংক কপি করুন'}
              </button>
            </div>
            <p className="text-xs sm:text-sm text-[#39504D] font-medium leading-relaxed">
              পরের বার এই ঠিকানায় এসে লগইন করবেন — বুকমার্ক করে রাখুন।
            </p>
          </div>
        )}

        {/* Clean White Login Card */}
        <div className="bg-white rounded-3xl border border-[#E8DEC8] shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-2.5">
            {isAdminPortal && (
              <span className="w-9 h-9 rounded-xl bg-[#0B3B36] text-[#F2A007] flex items-center justify-center shrink-0">
                <Shield className="w-4.5 h-4.5" />
              </span>
            )}
            <h1 className="text-xl font-bold text-[#0B3B36]">
              {isAdminPortal ? 'অ্যাডমিন পোর্টাল' : 'আপনার অ্যাকাউন্টে লগইন করুন'}
            </h1>
          </div>

          {!isAdminPortal && justCreatedAccount && (
            <div
              className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-bold flex items-center gap-2.5"
              data-testid="account-created-notice"
            >
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
              <span>অ্যাকাউন্ট তৈরি হয়েছে — এখন লগইন করুন</span>
            </div>
          )}

          {error && (
            <div
              className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-start gap-2.5"
              data-testid="login-error-banner"
            >
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="portal-login-email"
                className="block text-sm font-bold text-[#0B3B36] mb-1.5"
              >
                ইমেইল
              </label>
              <div className="relative">
                <Mail className="w-4.5 h-4.5 text-[#556B68] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="portal-login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-xl border border-[#DDD2BC] bg-white text-base text-[#142523] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="portal-login-password"
                className="block text-sm font-bold text-[#0B3B36] mb-1.5"
              >
                পাসওয়ার্ড
              </label>
              <div className="relative">
                <Lock className="w-4.5 h-4.5 text-[#556B68] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="portal-login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[48px] pl-11 pr-12 py-3 rounded-xl border border-[#DDD2BC] bg-white text-base text-[#142523] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#4F6360] hover:bg-slate-100"
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              data-testid="portal-login-submit-btn"
              className="w-full min-h-[50px] px-6 py-3.5 rounded-2xl bg-[#0F766E] hover:bg-[#0B3B36] text-white font-bold text-base shadow-sm disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-colors"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  যাচাই হচ্ছে...
                </>
              ) : isAdminPortal ? (
                'অ্যাডমিন লগইন'
              ) : (
                'লগইন করুন'
              )}
            </button>
          </form>

          <div className="relative flex items-center justify-center py-1">
            <span className="h-px bg-[#EFE7D6] flex-1" />
            <span className="px-3 text-xs font-semibold text-[#647875]">অথবা</span>
            <span className="h-px bg-[#EFE7D6] flex-1" />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGoogleClick()}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl border border-[#DDD2BC] bg-white hover:bg-[#FFF9EC] text-[#142523] font-bold text-sm inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60"
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
              />
            </svg>
            Google দিয়ে লগইন করুন
          </button>
        </div>
      </div>
    </div>
  );
};
