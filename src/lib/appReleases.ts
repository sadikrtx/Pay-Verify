import type { AppReleaseDoc } from '../types/payment';

export interface VersionCodeValidationResult {
  valid: boolean;
  errorBn: string | null;
  highestExistingCode: number;
}

/**
 * Validates that a versionCode is an integer >= 1 and strictly greater than any previous
 * version's versionCode (when creating a new version) or does not conflict / regress when editing.
 */
export function validateVersionCode(
  versionCode: number,
  existingReleases: AppReleaseDoc[],
  editingReleaseId?: string | null
): VersionCodeValidationResult {
  const otherReleases = editingReleaseId
    ? existingReleases.filter((r) => r.id !== editingReleaseId)
    : existingReleases;

  const highestExistingCode = otherReleases.reduce(
    (max, r) => (r.versionCode > max ? r.versionCode : max),
    0
  );

  if (!Number.isFinite(versionCode) || !Number.isInteger(versionCode) || versionCode < 1) {
    return {
      valid: false,
      errorBn: 'ভার্সন কোড কমপক্ষে ১ বা তার বেশি পূর্ণসংখ্যা হতে হবে।',
      highestExistingCode,
    };
  }

  if (!editingReleaseId) {
    if (highestExistingCode > 0 && versionCode <= highestExistingCode) {
      return {
        valid: false,
        errorBn: `ভার্সন কোড আগের ভার্সনের (${highestExistingCode.toLocaleString('bn-BD')}) চেয়ে বড় হতে হবে। কম বা সমান কোড দেওয়া যাবে না।`,
        highestExistingCode,
      };
    }
    return { valid: true, errorBn: null, highestExistingCode };
  }

  // When editing an existing version:
  const currentEditing = existingReleases.find((r) => r.id === editingReleaseId);
  if (otherReleases.some((r) => r.versionCode === versionCode)) {
    return {
      valid: false,
      errorBn: `ভার্সন কোড ${versionCode.toLocaleString('bn-BD')} ইতিমধ্যে অন্য একটি ভার্সনে ব্যবহৃত হয়েছে।`,
      highestExistingCode,
    };
  }
  if (
    currentEditing &&
    versionCode !== currentEditing.versionCode &&
    highestExistingCode > 0 &&
    versionCode <= highestExistingCode
  ) {
    return {
      valid: false,
      errorBn: `নতুন ভার্সন কোড আগের সর্বোচ্চ কোডের (${highestExistingCode.toLocaleString('bn-BD')}) চেয়ে বড় হতে হবে।`,
      highestExistingCode,
    };
  }

  return { valid: true, errorBn: null, highestExistingCode };
}

/**
 * Checks whether a selected file has a valid .apk extension.
 */
export function validateApkFileName(fileName: string): boolean {
  const clean = (fileName || '').trim().toLowerCase();
  return clean.length > 4 && clean.endsWith('.apk');
}

/**
 * Formats byte size into human-readable Bangla string (e.g., ১৪.৫ MB, ৮৫০ KB).
 */
export function formatFileSizeBn(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toLocaleString('bn-BD', {
      minimumFractionDigits: mb >= 100 ? 0 : 1,
      maximumFractionDigits: 2,
    })} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb.toLocaleString('bn-BD')} KB`;
}

/**
 * Parses multiline release notes into clean bullet lines.
 */
export function parseReleaseNotesList(releaseNotes: string): string[] {
  if (!releaseNotes || !releaseNotes.trim()) return [];
  return releaseNotes
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-*–—]+/, '').trim())
    .filter(Boolean);
}

/**
 * Picks the single latest published release from a list of releases.
 */
export function pickLatestPublishedRelease(releases: AppReleaseDoc[]): AppReleaseDoc | null {
  const published = releases.filter((r) => r.published);
  if (published.length === 0) return null;
  return [...published].sort(
    (a, b) =>
      b.versionCode - a.versionCode ||
      (b.publishedAtMs ?? b.createdAtMs) - (a.publishedAtMs ?? a.createdAtMs)
  )[0];
}
