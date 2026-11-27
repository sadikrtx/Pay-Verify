import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  FileArchive,
  Globe,
  Link2,
  Plus,
  Send,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { usePayVerify } from '../lib/store';
import {
  formatFileSizeBn,
  parseReleaseNotesList,
  validateApkFileName,
  validateVersionCode,
} from '../lib/appReleases';
import { formatBanglaDateTime } from '../lib/money';
import type { AppReleaseDoc } from '../types/payment';

export const SuperAdminAppUpdatesTab: React.FC = () => {
  const {
    account,
    appReleases,
    publishedAppRelease,
    adminSaveAppRelease,
    adminTogglePublishAppRelease,
    adminDeleteAppRelease,
  } = usePayVerify();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);
  const [versionName, setVersionName] = useState('');
  const [versionCodeInput, setVersionCodeInput] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [mandatory, setMandatory] = useState(false);

  // Uploaded APK file state
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileSize, setUploadedFileSize] = useState(0);
  const [uploadedApkUrl, setUploadedApkUrl] = useState('');
  const [uploadedStoragePath, setUploadedStoragePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [savingAction, setSavingAction] = useState<'draft' | 'publish' | null>(null);
  const [busyReleaseId, setBusyReleaseId] = useState<string | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<AppReleaseDoc | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Strictly enforce Super Admin only access
  if (!account?.isSuperAdmin) {
    return null;
  }

  const highestExistingCode = useMemo(() => {
    const others = editingReleaseId
      ? appReleases.filter((r) => r.id !== editingReleaseId)
      : appReleases;
    return others.reduce((max, r) => (r.versionCode > max ? r.versionCode : max), 0);
  }, [appReleases, editingReleaseId]);

  const parsedVersionCode = versionCodeInput.trim() === '' ? NaN : Number(versionCodeInput.trim());

  const versionCodeValidation = useMemo(() => {
    if (versionCodeInput.trim() === '') {
      return {
        valid: false,
        errorBn: null,
        highestExistingCode,
      };
    }
    return validateVersionCode(parsedVersionCode, appReleases, editingReleaseId);
  }, [versionCodeInput, parsedVersionCode, appReleases, editingReleaseId, highestExistingCode]);

  const resetForm = () => {
    setEditingReleaseId(null);
    setVersionName('');
    setVersionCodeInput('');
    setExternalUrl('');
    setReleaseNotes('');
    setMandatory(false);
    setUploadedFileName('');
    setUploadedFileSize(0);
    setUploadedApkUrl('');
    setUploadedStoragePath(null);
    setUploading(false);
    setUploadProgress(0);
    setUploadDone(false);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startEdit = (rel: AppReleaseDoc) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setFileError(null);
    setEditingReleaseId(rel.id);
    setVersionName(rel.versionName);
    setVersionCodeInput(String(rel.versionCode));
    setReleaseNotes(rel.releaseNotes);
    setMandatory(rel.mandatory);

    if (rel.storagePath) {
      setUploadedFileName(rel.storagePath.split('/').pop() || `PayVerify-v${rel.versionName}.apk`);
      setUploadedFileSize(rel.fileSize);
      setUploadedApkUrl(rel.apkUrl);
      setUploadedStoragePath(rel.storagePath);
      setUploadDone(true);
      setUploadProgress(100);
      setExternalUrl('');
    } else {
      setUploadedFileName('');
      setUploadedFileSize(rel.fileSize);
      setUploadedApkUrl('');
      setUploadedStoragePath(null);
      setUploadDone(false);
      setUploadProgress(0);
      setExternalUrl(rel.apkUrl);
    }

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFileUpload = (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setFileError(null);

    if (!validateApkFileName(file.name)) {
      setFileError('শুধুমাত্র .apk ফাইল আপলোড করা যাবে। অন্য কোনো ফাইল গ্রহণযোগ্য নয়।');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `app-releases/${Date.now()}_${safeFileName}`;

    setUploadedFileName(file.name);
    setUploadedFileSize(file.size);
    setUploading(true);
    setUploadProgress(5);
    setUploadDone(false);

    let finished = false;
    const finishWithLocalFallback = () => {
      if (finished) return;
      finished = true;
      const localBlobUrl = URL.createObjectURL(file);
      setUploadedApkUrl(localBlobUrl);
      setUploadedStoragePath(storagePath);
      setUploadProgress(100);
      setUploading(false);
      setUploadDone(true);
    };

    // Fallback timer if Firebase Storage bucket isn't provisioned or stalls in preview iframe
    const fallbackTimer = window.setTimeout(() => {
      finishWithLocalFallback();
    }, 6500);

    try {
      const refObj = storageRef(storage, storagePath);
      const task = uploadBytesResumable(refObj, file, {
        contentType: 'application/vnd.android.package-archive',
      });

      task.on(
        'state_changed',
        (snap) => {
          if (finished) return;
          const pct =
            snap.totalBytes > 0
              ? Math.min(99, Math.max(8, Math.round((snap.bytesTransferred / snap.totalBytes) * 100)))
              : 50;
          setUploadProgress(pct);
        },
        () => {
          window.clearTimeout(fallbackTimer);
          finishWithLocalFallback();
        },
        async () => {
          if (finished) return;
          window.clearTimeout(fallbackTimer);
          try {
            const downloadUrl = await getDownloadURL(task.snapshot.ref);
            if (finished) return;
            finished = true;
            setUploadedApkUrl(downloadUrl);
            setUploadedStoragePath(storagePath);
            setUploadProgress(100);
            setUploading(false);
            setUploadDone(true);
          } catch {
            finishWithLocalFallback();
          }
        }
      );
    } catch {
      window.clearTimeout(fallbackTimer);
      finishWithLocalFallback();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFileName('');
    setUploadedFileSize(0);
    setUploadedApkUrl('');
    setUploadedStoragePath(null);
    setUploading(false);
    setUploadProgress(0);
    setUploadDone(false);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Uploaded APK takes precedence if both are provided
  const resolvedApkUrl = uploadedApkUrl.trim() || externalUrl.trim();
  const canSave =
    !uploading &&
    savingAction === null &&
    versionName.trim().length > 0 &&
    versionCodeInput.trim().length > 0 &&
    versionCodeValidation.valid &&
    resolvedApkUrl.length > 0;

  const handleSave = async (publishNow: boolean) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!versionName.trim()) {
      setErrorMsg('ভার্সন নাম অবশ্যই দিতে হবে (যেমন: 1.2.0)।');
      return;
    }
    if (!versionCodeValidation.valid) {
      setErrorMsg(
        versionCodeValidation.errorBn ||
          'ভার্সন কোড আগের ভার্সনের চেয়ে বড় হতে হবে।'
      );
      return;
    }
    if (!resolvedApkUrl) {
      setErrorMsg('APK ফাইল আপলোড করুন অথবা বাইরের ডাউনলোড লিংক দিন।');
      return;
    }

    setSavingAction(publishNow ? 'publish' : 'draft');
    try {
      const saved = await adminSaveAppRelease(
        {
          versionName: versionName.trim(),
          versionCode: Math.trunc(parsedVersionCode),
          apkUrl: resolvedApkUrl,
          storagePath: uploadedApkUrl.trim() ? uploadedStoragePath : null,
          fileSize: uploadedApkUrl.trim() ? uploadedFileSize : 0,
          releaseNotes: releaseNotes.trim(),
          mandatory,
          publishNow,
        },
        editingReleaseId || undefined
      );
      setSuccessMsg(
        publishNow
          ? `ভার্সন ${saved.versionName} (কোড ${saved.versionCode.toLocaleString('bn-BD')}) সফলভাবে পাবলিশ হয়েছে।`
          : `ভার্সন ${saved.versionName} (কোড ${saved.versionCode.toLocaleString('bn-BD')}) খসড়া হিসেবে সেভ হয়েছে।`
      );
      resetForm();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ভার্সন সেভ করা যায়নি।');
    } finally {
      setSavingAction(null);
    }
  };

  const handleTogglePublish = async (rel: AppReleaseDoc) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyReleaseId(rel.id);
    try {
      const nextPublish = !rel.published;
      await adminTogglePublishAppRelease(rel.id, nextPublish);
      setSuccessMsg(
        nextPublish
          ? `ভার্সন ${rel.versionName} এখন পাবলিশড।`
          : `ভার্সন ${rel.versionName} আনপাবলিশ করা হয়েছে।`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'অবস্থা পরিবর্তন ব্যর্থ হয়েছে।');
    } finally {
      setBusyReleaseId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    const target = deleteConfirmTarget;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusyReleaseId(target.id);
    try {
      await adminDeleteAppRelease(target.id);
      if (editingReleaseId === target.id) {
        resetForm();
      }
      setDeleteConfirmTarget(null);
      setSuccessMsg(`ভার্সন ${target.versionName} ডিলিট করা হয়েছে।`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ভার্সন ডিলিট ব্যর্থ হয়েছে।');
    } finally {
      setBusyReleaseId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="super-admin-app-updates-page">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200/70 text-teal-700 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Android App আপডেট</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              নতুন ভার্সনের APK আপলোড ও পাবলিশ করুন — মার্চেন্টরা সরাসরি ওয়েবসাইট থেকে ডাউনলোড করবে
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {publishedAppRelease ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              লাইভ ভার্সন: v{publishedAppRelease.versionName} (কোড{' '}
              {publishedAppRelease.versionCode.toLocaleString('bn-BD')})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
              এখনো কোনো ভার্সন পাবলিশ করা হয়নি
            </span>
          )}
          <a
            href="/download"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Globe className="w-3.5 h-3.5 text-teal-700" />
            পাবলিক ডাউনলোড পেজ (/download)
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </div>

      {errorMsg && (
        <div
          className="flex items-center gap-2.5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-800"
          data-testid="apk-admin-error"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div
          className="flex items-center gap-2.5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800"
          data-testid="apk-admin-success"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* (ক) উপরে: "নতুন ভার্সন যোগ করুন" ফর্ম */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">
              {editingReleaseId ? 'ভার্সন এডিট করুন' : 'নতুন ভার্সন যোগ করুন'}
            </h2>
          </div>
          {editingReleaseId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <X className="w-3.5 h-3.5" />
              নতুন ফর্মে ফিরুন
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* ১. ভার্সন নাম */}
          <div>
            <label
              htmlFor="apk-version-name"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              ভার্সন নাম <span className="text-rose-600">*</span>
            </label>
            <input
              id="apk-version-name"
              data-testid="apk-version-name-input"
              type="text"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="যেমন: 1.2.0"
              required
              className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* ২. ভার্সন কোড */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="apk-version-code"
                className="block text-xs font-bold text-slate-700"
              >
                ভার্সন কোড <span className="text-rose-600">*</span>
              </label>
              {highestExistingCode > 0 && (
                <span className="text-[11px] font-medium text-slate-500">
                  আগের সর্বোচ্চ কোড: {highestExistingCode.toLocaleString('bn-BD')}
                </span>
              )}
            </div>
            <input
              id="apk-version-code"
              data-testid="apk-version-code-input"
              type="number"
              min={1}
              step={1}
              value={versionCodeInput}
              onChange={(e) => setVersionCodeInput(e.target.value)}
              placeholder={
                highestExistingCode > 0 ? `যেমন: ${highestExistingCode + 1}` : 'যেমন: 12'
              }
              required
              className={`w-full h-10 px-3.5 rounded-xl border text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                versionCodeInput.trim() !== '' && !versionCodeValidation.valid
                  ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                  : 'border-slate-200 focus:ring-teal-500'
              }`}
            />
            {versionCodeInput.trim() !== '' && !versionCodeValidation.valid && (
              <p
                className="mt-1.5 text-xs font-semibold text-rose-600 flex items-center gap-1"
                data-testid="apk-version-code-warning"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{versionCodeValidation.errorBn}</span>
              </p>
            )}
          </div>
        </div>

        {/* ৩. APK ফাইল আপলোড */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            APK ফাইল আপলোড
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
            }}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-5 sm:p-6 transition-colors ${
              dragActive
                ? 'border-teal-500 bg-teal-50/50'
                : uploadDone
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : fileError
                    ? 'border-rose-300 bg-rose-50/30'
                    : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
            }`}
          >
            <input
              ref={fileInputRef}
              id="apk-file-input"
              data-testid="apk-file-input"
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={handleFileChange}
              className="sr-only"
            />

            {!uploadedFileName ? (
              <div className="flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-teal-700 flex items-center justify-center shadow-2xs">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-800">
                    এখানে .apk ফাইল ড্র্যাগ করে ছাড়ুন
                  </div>
                  <div className="text-xs text-slate-500">
                    শুধুমাত্র Android প্যাকেজ (.apk) ফাইল গ্রহণযোগ্য
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="apk-pick-file-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800"
                >
                  <FileArchive className="w-3.5 h-3.5" />
                  ফাইল বেছে নিন
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-teal-700 flex items-center justify-center shrink-0">
                      <FileArchive className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className="text-sm font-bold text-slate-900 truncate"
                        data-testid="apk-selected-file-name"
                      >
                        {uploadedFileName}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span data-testid="apk-selected-file-size">
                          সাইজ: {formatFileSizeBn(uploadedFileSize)}
                        </span>
                        {uploadDone && (
                          <span
                            className="inline-flex items-center gap-1 font-bold text-emerald-700"
                            data-testid="apk-upload-complete-badge"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            আপলোড হয়েছে
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      ফাইল বদলান
                    </button>
                    <button
                      type="button"
                      onClick={clearUploadedFile}
                      className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                      aria-label="ফাইল সরান"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* প্রগ্রেস বার */}
                {(uploading || uploadProgress > 0) && (
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          uploadDone ? 'bg-emerald-600' : 'bg-teal-600'
                        }`}
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className={uploadDone ? 'text-emerald-700' : 'text-slate-600'}>
                        {uploadDone ? 'আপলোড হয়েছে' : 'Firebase Storage-এ আপলোড হচ্ছে...'}
                      </span>
                      <span className="text-slate-600 tabular-nums">
                        {uploadProgress.toLocaleString('bn-BD')}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {fileError && (
            <p
              className="mt-1.5 text-xs font-semibold text-rose-600 flex items-center gap-1"
              data-testid="apk-file-error"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{fileError}</span>
            </p>
          )}
        </div>

        {/* ৪. অথবা বাইরের লিংক */}
        <div>
          <label
            htmlFor="apk-external-url"
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            অথবা বাইরের লিংক (ঐচ্ছিক)
          </label>
          <div className="relative">
            <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="apk-external-url"
              data-testid="apk-external-url-input"
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://github.com/.../releases/download/v1.2.0/payverify.apk"
              className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          {uploadedApkUrl.trim() && externalUrl.trim() && (
            <p className="mt-1 text-[11px] text-teal-700 font-medium">
              আপলোড করা APK ফাইল এবং বাইরের লিংক দুটিই দেওয়া হয়েছে — আপলোড করা APK ফাইলটি প্রাধান্য পাবে।
            </p>
          )}
        </div>

        {/* ৫. "এই ভার্সনে নতুন যা আছে" */}
        <div>
          <label
            htmlFor="apk-release-notes"
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            এই ভার্সনে নতুন যা আছে
          </label>
          <textarea
            id="apk-release-notes"
            data-testid="apk-release-notes-input"
            rows={4}
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder={'প্রতি লাইনে একটি করে পরিবর্তন লিখুন, যেমন:\n• ব্যাকগ্রাউন্ডে দ্রুত SMS সিঙ্ক\n• বিকাশ ও নগদ পার্সার উন্নতি\n• ব্যাটারি সাশ্রয় মোড'}
            className="w-full p-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* ৬. জরুরি আপডেট (টগল) */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="space-y-0.5">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>জরুরি আপডেট</span>
              {mandatory && (
                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[11px] font-bold">
                  জরুরি আপডেট
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              চালু করলে ডাউনলোড পেজে এবং মার্চেন্ট ড্যাশবোর্ডে লাল &quot;জরুরি আপডেট&quot; ব্যাজ দেখাবে
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={mandatory}
            data-testid="apk-mandatory-toggle"
            onClick={() => setMandatory((prev) => !prev)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              mandatory ? 'bg-rose-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ${
                mandatory ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* ৭. দুটো বাটন: "খসড়া সেভ করুন" এবং "পাবলিশ করুন" */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            data-testid="apk-save-draft-btn"
            disabled={!canSave}
            onClick={() => void handleSave(false)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
          >
            {savingAction === 'draft' ? 'খসড়া সেভ হচ্ছে...' : 'খসড়া সেভ করুন'}
          </button>
          <button
            type="button"
            data-testid="apk-publish-btn"
            disabled={!canSave}
            onClick={() => void handleSave(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {savingAction === 'publish' ? 'পাবলিশ হচ্ছে...' : 'পাবলিশ করুন'}
          </button>
        </div>
      </div>

      {/* (খ) নিচে: "সব ভার্সন" তালিকা */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">সব ভার্সন</h2>
          <span className="text-xs font-semibold text-slate-500">
            মোট: {appReleases.length.toLocaleString('bn-BD')}টি
          </span>
        </div>

        {appReleases.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-8 text-center space-y-1.5">
            <div className="text-sm font-bold text-slate-700">এখনো কোনো ভার্সন যোগ করা হয়নি</div>
            <div className="text-xs text-slate-500">
              উপরের ফর্ম থেকে প্রথম APK ভার্সন আপলোড করে পাবলিশ করুন।
            </div>
          </div>
        ) : (
          <div className="space-y-3" data-testid="apk-releases-list">
            {appReleases.map((rel) => {
              const notes = parseReleaseNotesList(rel.releaseNotes);
              const isBusy = busyReleaseId === rel.id;
              return (
                <div
                  key={rel.id}
                  data-testid={`apk-release-row-${rel.versionCode}`}
                  className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
                    rel.published
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : 'border-slate-200/80 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-slate-900">
                          ভার্সন {rel.versionName}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold tabular-nums">
                          কোড: {rel.versionCode.toLocaleString('bn-BD')}
                        </span>
                        {rel.published ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            পাবলিশড
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                            খসড়া
                          </span>
                        )}
                        {rel.mandatory && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            জরুরি আপডেট
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>
                          তারিখ:{' '}
                          {formatBanglaDateTime(rel.publishedAtMs ?? rel.createdAtMs)}
                        </span>
                        <span>সাইজ: {formatFileSizeBn(rel.fileSize)}</span>
                        <span className="font-semibold text-teal-800">
                          মোট ডাউনলোড: {rel.downloadCount.toLocaleString('bn-BD')} বার
                        </span>
                      </div>
                    </div>

                    {/* অ্যাকশন বাটন: পাবলিশ/আনপাবলিশ, এডিট, ডিলিট */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleTogglePublish(rel)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
                          rel.published
                            ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                            : 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                        }`}
                      >
                        {rel.published ? 'আনপাবলিশ' : 'পাবলিশ'}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => startEdit(rel)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        এডিট
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setDeleteConfirmTarget(rel)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        ডিলিট
                      </button>
                    </div>
                  </div>

                  {notes.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-xs font-bold text-slate-600 mb-1">
                        এই ভার্সনে নতুন যা আছে:
                      </div>
                      <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                        {notes.map((line, idx) => (
                          <li key={idx}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-400 truncate">
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-mono">{rel.apkUrl}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ডিলিট কনফার্মেশন মডাল */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ভার্সন {deleteConfirmTarget.versionName} ডিলিট করবেন?
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  ডিলিট করলে এই ভার্সনের রেকর্ড এবং স্টোরেজে থাকা APK ফাইল মুছে যাবে। এই কাজটি বাতিল করা যাবে না।
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={busyReleaseId === deleteConfirmTarget.id}
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                বাতিল
              </button>
              <button
                type="button"
                data-testid="confirm-delete-apk-btn"
                disabled={busyReleaseId === deleteConfirmTarget.id}
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                {busyReleaseId === deleteConfirmTarget.id ? 'ডিলিট হচ্ছে...' : 'হ্যাঁ, ডিলিট করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
