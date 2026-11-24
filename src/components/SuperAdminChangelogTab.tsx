import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Edit3, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { usePayVerify } from '../lib/store';
import type { PayChangelogDoc } from '../types/payment';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const SuperAdminChangelogTab: React.FC = () => {
  const { changelog, adminSaveChangelog, adminDeleteChangelog } = usePayVerify();

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(todayIso);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(undefined);
    setTitle('');
    setBody('');
    setDate(todayIso());
  };

  const handleEdit = (entry: PayChangelogDoc) => {
    setEditingId(entry.id);
    setTitle(entry.title);
    setBody(entry.body);
    setDate(entry.date || todayIso());
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await adminSaveChangelog({ title, body, date }, editingId);
      setNotice(editingId ? 'আপডেট সম্পাদনা করা হয়েছে।' : 'নতুন আপডেট প্রকাশিত হয়েছে।');
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await adminDeleteChangelog(id);
      if (editingId === id) resetForm();
      setNotice('আপডেট মুছে ফেলা হয়েছে।');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'মুছে ফেলা ব্যর্থ হয়েছে।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="super-admin-changelog-tab">
      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Compose / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">
              {editingId ? 'আপডেট সম্পাদনা করুন' : 'নতুন আপডেট লিখুন'}
            </h2>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              <X className="w-3.5 h-3.5" />
              বাতিল
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">শিরোনাম</label>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="যেমন: নতুন প্ল্যান ও ডিভাইস নিরাপত্তা যুক্ত হয়েছে"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">তারিখ</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            সংক্ষিপ্ত বিবরণ (১–৩ লাইন)
          </label>
          <textarea
            required
            rows={3}
            maxLength={600}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="কী নতুন সুবিধা যুক্ত হয়েছে বা ঠিক করা হয়েছে তা সংক্ষেপে বাংলায় লিখুন..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            data-testid="publish-changelog-btn"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {busy ? 'প্রকাশ হচ্ছে...' : editingId ? 'পরিবর্তন সংরক্ষণ করুন' : 'প্রকাশ করুন'}
          </button>
        </div>
      </form>

      {/* Existing Entries */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">প্রকাশিত আপডেট তালিকা</h2>
        </div>
        {changelog.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            এখনো কোনো আপডেট প্রকাশ করা হয়নি
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {changelog.map((entry) => (
              <div
                key={entry.id}
                className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">{entry.title}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-mono text-slate-600">
                      {entry.date}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                    {entry.body}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(entry)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    সম্পাদনা
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(entry.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    মুছুন
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
