import React, { useState } from 'react';
import { PayVerifyBrandMark } from './PayVerifyBrandMark';

interface SignInGateProps {
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string, displayName: string) => Promise<void>;
  onViewPlans?: () => void;
}

export const SignInGate: React.FC<SignInGateProps> = ({
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onViewPlans,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google সাইন ইন ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await onEmailSignUp(email, password, displayName);
      } else {
        await onEmailSignIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center p-5">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-7 sm:p-8 space-y-6">
        <div className="flex items-center justify-between gap-2">
          <PayVerifyBrandMark size="md" />
          {onViewPlans && (
            <button
              type="button"
              onClick={onViewPlans}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-100"
            >
              প্ল্যান ও মূল্য দেখুন
            </button>
          )}
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          {mode === 'signup' ? 'নতুন অ্যাকাউন্ট তৈরি করুন' : 'সাইন ইন করুন'}
        </h1>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="w-full px-4 py-3 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-60 rounded-xl transition-colors"
        >
          {submitting ? 'অপেক্ষা করুন...' : 'Google দিয়ে চালিয়ে যান'}
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-xs text-slate-400 whitespace-nowrap">অথবা ইমেইল</span>
          <div className="border-t border-slate-200 w-full" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label htmlFor="auth-name" className="block text-xs font-medium text-slate-700">
                আপনার নাম
              </label>
              <input
                id="auth-name"
                type="text"
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="যেমন: রাকিব হাসান"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700">
              ইমেইল
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="merchant@example.com"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700">
              পাসওয়ার্ড
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-xl transition-colors"
          >
            {mode === 'signup' ? '৭ দিনের ফ্রি ট্রায়াল শুরু করুন' : 'ইমেইল দিয়ে সাইন ইন'}
          </button>
        </form>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            }}
            className="text-xs font-medium text-[#0F766E] hover:text-[#115E59]"
          >
            {mode === 'signin'
              ? 'নতুন ব্যবহারকারী? অ্যাকাউন্ট তৈরি করুন (৭ দিনের ফ্রি ট্রায়াল)'
              : 'আগে থেকেই অ্যাকাউন্ট আছে? সাইন ইন করুন'}
          </button>
        </div>
      </div>
    </div>
  );
};
