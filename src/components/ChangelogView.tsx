import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatBanglaDateTime } from '../lib/money';

/**
 * Signed-in Changelog page ("নতুন কি এসেছে").
 * Shows owner-authored entries newest-first and marks them read automatically on open.
 * Nothing is auto-generated.
 */
export const ChangelogView: React.FC = () => {
  const { changelog, hasUnreadChangelog, markChangelogRead } = usePayVerify();

  useEffect(() => {
    if (hasUnreadChangelog) {
      void markChangelogRead();
    }
  }, [hasUnreadChangelog, markChangelogRead]);

  return (
    <div className="space-y-6 max-w-3xl" data-testid="changelog-view">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">নতুন কি এসেছে</h1>
      </div>

      {changelog.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 py-16 px-6 text-center space-y-2">
          <Sparkles className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">এখনো কোনো আপডেট প্রকাশ করা হয়নি</p>
        </div>
      ) : (
        <div className="space-y-4">
          {changelog.map((entry) => (
            <article
              key={entry.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">{entry.title}</h2>
                <span className="px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono text-slate-600">
                  {entry.date || formatBanglaDateTime(entry.createdAtMs)}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {entry.body}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
