import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFileSizeBn,
  parseReleaseNotesList,
  pickLatestPublishedRelease,
  validateApkFileName,
  validateVersionCode,
} from './appReleases';
import type { AppReleaseDoc } from '../types/payment';

const sampleReleases: AppReleaseDoc[] = [
  {
    id: 'rel_10',
    versionName: '1.0.0',
    versionCode: 10,
    apkUrl: 'https://example.com/payverify-1.0.0.apk',
    storagePath: 'app-releases/payverify-1.0.0.apk',
    fileSize: 12 * 1024 * 1024,
    releaseNotes: 'প্রথম রিলিজ',
    mandatory: false,
    published: false,
    publishedAtMs: null,
    downloadCount: 5,
    createdAtMs: 1000,
    updatedAtMs: 1000,
  },
  {
    id: 'rel_12',
    versionName: '1.2.0',
    versionCode: 12,
    apkUrl: 'https://example.com/payverify-1.2.0.apk',
    storagePath: 'app-releases/payverify-1.2.0.apk',
    fileSize: 15 * 1024 * 1024,
    releaseNotes: '• দ্রুত SMS সিঙ্ক\n- বাগ ফিক্স',
    mandatory: true,
    published: true,
    publishedAtMs: 2000,
    downloadCount: 19,
    createdAtMs: 2000,
    updatedAtMs: 2000,
  },
];

test('validateVersionCode blocks versionCode less than or equal to previous max', () => {
  const resEqual = validateVersionCode(12, sampleReleases);
  assert.equal(resEqual.valid, false);
  assert.equal(resEqual.highestExistingCode, 12);
  assert.ok(resEqual.errorBn && resEqual.errorBn.includes('বড় হতে হবে'));

  const resSmaller = validateVersionCode(11, sampleReleases);
  assert.equal(resSmaller.valid, false);

  const resGreater = validateVersionCode(13, sampleReleases);
  assert.equal(resGreater.valid, true);
  assert.equal(resGreater.errorBn, null);
});

test('validateVersionCode allows keeping the same versionCode when editing that exact release', () => {
  const resSameEdit = validateVersionCode(12, sampleReleases, 'rel_12');
  assert.equal(resSameEdit.valid, true);
  assert.equal(resSameEdit.errorBn, null);

  const resCollisionEdit = validateVersionCode(10, sampleReleases, 'rel_12');
  assert.equal(resCollisionEdit.valid, false);
});

test('validateApkFileName accepts only .apk files', () => {
  assert.equal(validateApkFileName('PayVerify-v1.2.0.apk'), true);
  assert.equal(validateApkFileName('PAYVERIFY.APK'), true);
  assert.equal(validateApkFileName('payverify.zip'), false);
  assert.equal(validateApkFileName('payverify.exe'), false);
  assert.equal(validateApkFileName('.apk'), false);
});

test('formatFileSizeBn and parseReleaseNotesList format size and bullet notes cleanly', () => {
  assert.equal(formatFileSizeBn(0), '—');
  assert.ok(formatFileSizeBn(15 * 1024 * 1024).includes('MB'));

  const notes = parseReleaseNotesList('• নতুন ড্যাশবোর্ড\n- দ্রুত ভেরিফিকেশন\n\n* বাগ সমাধান');
  assert.deepEqual(notes, ['নতুন ড্যাশবোর্ড', 'দ্রুত ভেরিফিকেশন', 'বাগ সমাধান']);

  const picked = pickLatestPublishedRelease(sampleReleases);
  assert.equal(picked?.id, 'rel_12');
});
