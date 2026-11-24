import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8'));

test('firestore.rules enforces default-deny first and covers every collection in firebase-blueprint.json', () => {
  const defaultDenyIdx = rules.indexOf('match /{document=**}');
  const firstCollectionIdx = rules.indexOf('match /payPlatform/{docId}');
  assert.ok(defaultDenyIdx > 0 && defaultDenyIdx < firstCollectionIdx, 'Default deny must come first');

  const collections = Object.keys(blueprint.firestore).map((p) => p.split('/')[1]);
  assert.ok(collections.length >= 15, 'All 15 Prompt A1 + A2 collections must be declared');
  for (const col of collections) {
    assert.ok(
      rules.includes(`match /${col}/`),
      `firestore.rules is missing a match block for blueprint collection /${col}`
    );
  }
});

test('firestore.rules enforces multi-tenant isolation, plan system authority, hard device binding, and Worker-only usedTrxIds', () => {
  // Verified Super Admin check (no unverified email spoofing)
  assert.match(rules, /request\.auth\.token\.email == 'sadikrtx3060@gmail\.com'/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);

  // Zero client access on usedTrxIds
  const usedBlock = rules.slice(rules.indexOf('match /usedTrxIds/{trxId}'));
  assert.match(usedBlock, /allow read, write: if false;/);

  // Plans, Add-ons, Coupons are Super Admin write-only & archive-only (no delete)
  const plansBlock = rules.slice(
    rules.indexOf('match /payPlans/{planId}'),
    rules.indexOf('match /payAddons/{addonId}')
  );
  assert.match(plansBlock, /allow create:[\s\S]*isSuperAdmin\(\)/);
  assert.match(plansBlock, /allow update:[\s\S]*isSuperAdmin\(\)/);
  assert.match(plansBlock, /allow delete: if false;/);

  const couponsBlock = rules.slice(
    rules.indexOf('match /payCoupons/{couponId}'),
    rules.indexOf('match /pairingTokens/{tokenId}')
  );
  assert.match(couponsBlock, /allow list: if isSuperAdmin\(\);/, 'Non-admins must not scrape coupons');
  assert.match(couponsBlock, /allow delete: if false;/);

  // Pairing tokens: single-use owner-created with usedAt == null, immutable from client
  const tokensBlock = rules.slice(
    rules.indexOf('match /pairingTokens/{tokenId}'),
    rules.indexOf('match /payChangelog/{entryId}')
  );
  assert.match(tokensBlock, /incoming\(\)\.accountId == request\.auth\.uid/);
  assert.match(tokensBlock, /incoming\(\)\.usedAt == null/);
  assert.match(tokensBlock, /allow update, delete: if false;/);

  // Changelog: Super Admin write-only, signed-in read
  const changelogBlock = rules.slice(
    rules.indexOf('match /payChangelog/{entryId}'),
    rules.indexOf('match /payAccounts/{accountId}')
  );
  assert.match(changelogBlock, /allow create:[\s\S]*isSuperAdmin\(\)/);
  assert.match(changelogBlock, /allow delete:[\s\S]*isSuperAdmin\(\)/);

  // Accounts: non-admins cannot set planId on create or escalate plan fields on update
  const accountsBlock = rules.slice(
    rules.indexOf('match /payAccounts/{accountId}'),
    rules.indexOf('match /payStores/{storeId}')
  );
  assert.match(accountsBlock, /!incoming\(\)\.keys\(\)\.hasAny\(\['planId'\]\) \|\| incoming\(\)\.planId == null/);

  // Activity: non-admins can create ONLY type == 'login' for themselves and read only their own accountId
  const activityBlock = rules.slice(
    rules.indexOf('match /payActivity/{entryId}'),
    rules.indexOf('match /paySettings/{docId}')
  );
  assert.match(activityBlock, /incoming\(\)\.type == 'login'/);
  assert.match(activityBlock, /resource\.data\.accountId == request\.auth\.uid/);

  // No get() or exists() inside any allow list rule (Pillar 8)
  const listBlocks = rules.match(/allow list:[^;]+;/g) || [];
  assert.ok(listBlocks.length >= 10);
  for (const lb of listBlocks) {
    assert.ok(!lb.includes('get(') && !lb.includes('exists('), `Found DB lookup inside allow list: ${lb}`);
  }
});

test('firestore.rules allows merchant branding fields and prevents silent Super Admin branding edits', () => {
  const storesBlock = rules.slice(
    rules.indexOf('match /payStores/{storeId}'),
    rules.indexOf('match /paySessions/{sessionId}')
  );
  assert.match(storesBlock, /'nameEn'/);
  assert.match(storesBlock, /'logoDataUrl'/);
  assert.match(storesBlock, /'paymentAccounts'/);

  // Super Admin update branch must NOT include merchant branding keys
  const updateBlock = storesBlock.slice(
    storesBlock.indexOf('allow update:'),
    storesBlock.indexOf('allow delete:')
  );
  const superAdminUpdateAllowlist = updateBlock.slice(updateBlock.indexOf('isSuperAdmin()'));
  assert.ok(!superAdminUpdateAllowlist.includes("'nameEn'"));
  assert.ok(!superAdminUpdateAllowlist.includes("'logoUrl'"));
  assert.ok(!superAdminUpdateAllowlist.includes("'logoDataUrl'"));
  assert.ok(!superAdminUpdateAllowlist.includes("'paymentAccounts'"));

  // Activity allows owner branding_change audit entries
  const activityBlock = rules.slice(
    rules.indexOf('match /payActivity/{entryId}'),
    rules.indexOf('match /paySettings/{docId}')
  );
  assert.match(activityBlock, /incoming\(\)\.type == 'branding_change'/);
});

