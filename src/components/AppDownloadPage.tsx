import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileArchive,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { usePayVerify } from '../lib/store';
import { formatFileSizeBn, parseReleaseNotesList } from '../lib/appReleases';
import { formatBanglaDateTime } from '../lib/money';
import { PayVerifyBrandMark } from './PayVerifyBrandMark';

interface AppDownloadPageProps {
  onBackToDashboard?: () => void;
}

export const AppDownloadPage: React.FC<AppDownloadPageProps> = ({ onBackToDashboard }) => {
  const {
    user,
    platformConfig,
    publishedAppRelease,
    appReleasesLoaded,
    recordAppReleaseDownload,
  } = usePayVerify();

  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!publishedAppRelease) return;
    setDownloading(true);
    try {
      await recordAppReleaseDownload(publishedAppRelease.id);
    } finally {
      const link = document.createElement('a');
      link.href = publishedAppRelease.apkUrl;
      link.setAttribute('download', `PayVerify-v${publishedAppRelease.versionName}.apk`);
      link.setAttribute('rel', 'noopener noreferrer');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => setDownloading(false), 1200);
    }
  };

  const releaseNotesList = publishedAppRelease
    ? parseReleaseNotesList(publishedAppRelease.releaseNotes)
    : [];

  return (
    <div
      className="min-h-screen bg-[#F6F8FB] text-slate-900 flex flex-col"
      data-testid="public-app-download-page"
    >
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
          <PayVerifyBrandMark
            logoUrl={platformConfig.brandLogoUrl}
            logoDataUrl={platformConfig.brandLogoDataUrl}
            variant="dark"
            size="sm"
          />

          {user && onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              ড্যাশবোর্ডে ফিরুন
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        {!appReleasesLoaded ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center space-y-3 shadow-xs">
            <div className="w-8 h-8 rounded-full border-3 border-teal-600 border-t-transparent animate-spin mx-auto" />
            <div className="text-sm font-semibold text-slate-600">লোড হচ্ছে...</div>
          </div>
        ) : !publishedAppRelease ? (
          /* কোনো ভার্সন পাবলিশ না থাকলে "শীঘ্রই আসছে" মেসেজ */
          <div
            className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-12 text-center space-y-4 shadow-xs"
            data-testid="app-download-coming-soon"
          >
            <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200/70 text-teal-700 flex items-center justify-center mx-auto">
              <Smartphone className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                শীঘ্রই আসছে
              </span>
              <h1 className="text-2xl font-bold text-slate-900 pt-1">PayVerify Android App</h1>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                PayVerify Android অ্যাপের নতুন ভার্সন শীঘ্রই এখানে ডাউনলোডের জন্য প্রকাশ করা হবে।
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Main App Download Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="flex items-start sm:items-center gap-4">
                  {/* PayVerify Android App এর আইকন */}
                  <div className="w-16 h-16 rounded-2xl bg-teal-700 text-white flex items-center justify-center shadow-sm shrink-0">
                    <Smartphone className="w-8 h-8" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                        PayVerify Android App
                      </h1>
                      {/* জরুরি আপডেট ব্যাজ */}
                      {publishedAppRelease.mandatory && (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold"
                          data-testid="download-mandatory-badge"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          জরুরি আপডেট
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600">
                      মার্চেন্টদের স্বয়ংক্রিয় পেমেন্ট ভেরিফিকেশনের অফিসিয়াল Android অ্যাপ
                    </p>
                  </div>
                </div>
              </div>

              {/* সর্বশেষ পাবলিশড ভার্সনের তথ্য: ভার্সন নাম, ফাইল সাইজ, পাবলিশের তারিখ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5">
                  <div className="text-xs text-slate-500 font-medium">সর্বশেষ ভার্সন</div>
                  <div
                    className="mt-1 text-base font-bold text-slate-900 flex items-center gap-1.5"
                    data-testid="download-version-name"
                  >
                    <span>v{publishedAppRelease.versionName}</span>
                    <span className="text-xs font-semibold text-slate-500">
                      (কোড {publishedAppRelease.versionCode.toLocaleString('bn-BD')})
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5">
                  <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                    <FileArchive className="w-3.5 h-3.5 text-slate-400" />
                    <span>ফাইল সাইজ</span>
                  </div>
                  <div
                    className="mt-1 text-base font-bold text-slate-900"
                    data-testid="download-file-size"
                  >
                    {formatFileSizeBn(publishedAppRelease.fileSize)}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5">
                  <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>পাবলিশের তারিখ</span>
                  </div>
                  <div
                    className="mt-1 text-sm font-bold text-slate-900"
                    data-testid="download-published-date"
                  >
                    {formatBanglaDateTime(
                      publishedAppRelease.publishedAtMs ?? publishedAppRelease.createdAtMs
                    )}
                  </div>
                </div>
              </div>

              {/* বড় "ডাউনলোড করুন" বাটন */}
              <div className="pt-1">
                <button
                  type="button"
                  data-testid="public-apk-download-btn"
                  disabled={downloading}
                  onClick={() => void handleDownload()}
                  className={`w-full min-h-[54px] px-6 py-3.5 rounded-2xl text-white text-base font-bold flex items-center justify-center gap-2.5 shadow-sm transition-colors disabled:opacity-70 ${
                    publishedAppRelease.mandatory
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-teal-700 hover:bg-teal-800'
                  }`}
                >
                  <Download className="w-5 h-5" />
                  <span>
                    {downloading
                      ? 'ডাউনলোড শুরু হচ্ছে...'
                      : `ডাউনলোড করুন (v${publishedAppRelease.versionName} APK)`}
                  </span>
                </button>
              </div>
            </div>

            {/* "এই ভার্সনে নতুন যা আছে" — পরিবর্তনের তালিকা */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">এই ভার্সনে নতুন যা আছে</h2>
              </div>

              {releaseNotesList.length > 0 ? (
                <ul
                  className="space-y-2 text-sm text-slate-700"
                  data-testid="download-release-notes-list"
                >
                  {releaseNotesList.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">
                  পারফরম্যান্স উন্নতি এবং নিয়মিত রক্ষণাবেক্ষণ আপডেট।
                </p>
              )}
            </div>

            {/* সংক্ষিপ্ত ইনস্টল গাইড */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">কিভাবে ইনস্টল করবেন</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 space-y-1">
                  <div className="text-xs font-bold text-teal-700">ধাপ ১</div>
                  <div className="text-sm font-bold text-slate-900">ডাউনলোড</div>
                  <div className="text-xs text-slate-600">
                    উপরের বাটনে ক্লিক করে APK ফাইলটি ফোনে ডাউনলোড করুন।
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 space-y-1">
                  <div className="text-xs font-bold text-teal-700">ধাপ ২</div>
                  <div className="text-sm font-bold text-slate-900">ফাইল খুলুন</div>
                  <div className="text-xs text-slate-600">
                    ডাউনলোড শেষ হলে নোটিফিকেশন বা Downloads ফোল্ডার থেকে ফাইলটি খুলুন।
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 space-y-1">
                  <div className="text-xs font-bold text-teal-700">ধাপ ৩</div>
                  <div className="text-sm font-bold text-slate-900">অনুমতি দিন (Allow)</div>
                  <div className="text-xs text-slate-600">
                    &quot;অজানা সোর্স থেকে ইনস্টল&quot; (Install unknown apps) অনুমতি চাইলে Allow করুন।
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 space-y-1">
                  <div className="text-xs font-bold text-teal-700">ধাপ ৪</div>
                  <div className="text-sm font-bold text-slate-900">ইনস্টল</div>
                  <div className="text-xs text-slate-600">
                    Install বাটনে চাপ দিন এবং অ্যাপ খুলে আপনার স্টোরের সাথে সংযুক্ত করুন।
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
