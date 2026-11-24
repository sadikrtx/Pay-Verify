import React, { useState } from 'react';
import { AlertCircle, Lock, ShieldCheck, X } from 'lucide-react';
import { usePayVerify } from '../lib/store';

interface ReauthModalProps {
  open: boolean;
  actionTitle: string;
  actionDescription: string;
  onCancel: () => void;
  onConfirmed: () => Promise<void> | void;
}

/**
 * Reusable password / Google re-authentication confirmation modal for sensitive actions:
 * store-key rotation, webhook URL/secret change, member add/remove, and plan/add-on purchase.
 */
export const ReauthModal: React.FC<ReauthModalProps> = ({
  open,
  actionTitle,
  actionDescription,
  onCancel,
  onConfirmed,
}) => {
  const { authMetadata, reauthenticateUser } = usePayVerify();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await reauthenticateUser(authMetadata.hasPasswordProvider ? password : undefined);
      setPassword('');
      await onConfirmed();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'পুনরায় যাচাই ব্যর্থ হয়েছে। সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      data-testid="reauth-modal"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-slate-900">{actionTitle}</h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPassword('');
              setError(null);
              onCancel();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="বন্ধ করুন"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
          {actionDescription}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {authMetadata.hasPasswordProvider ? (
            <div>
              <label
                htmlFor="reauth-password-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                নিরাপত্তার জন্য আপনার পাসওয়ার্ড দিন
              </label>
              <input
                id="reauth-password-input"
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="আপনার বর্তমান পাসওয়ার্ড"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <span>
                এই সংবেদনশীল কাজটি সম্পন্ন করতে Google অ্যাকাউন্ট দিয়ে পুনরায় যাচাই করতে হবে।
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPassword('');
                setError(null);
                onCancel();
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={busy}
              data-testid="reauth-confirm-btn"
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {busy
                ? 'যাচাই হচ্ছে...'
                : authMetadata.hasPasswordProvider
                  ? 'যাচাই করে এগিয়ে যান'
                  : 'Google দিয়ে যাচাই করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
