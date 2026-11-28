import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoginBookmarkUrl,
  buildPhoneHref,
  buildWhatsAppHref,
  buildYouTubeEmbedUrl,
  computeRealOfferCountdown,
  isDirectVideoUrl,
  mapFunnelFailureReasonBn,
  parseSetupAccountQuery,
  parseYouTubeVideoId,
  resolveConfiguredTrialPlan,
  validateAccountSetupForm,
  validateFunnelBuyerContact,
} from './funnelLogic';
import { DEFAULT_LANDING_CONFIG, normalizeLandingConfig } from './landingConfig';
import { buildSeededPlans } from './planEngine';

test('computeRealOfferCountdown returns null when unset or past (never fake/evergreen)', () => {
  const now = 1_700_000_000_000;
  assert.equal(computeRealOfferCountdown(null, now), null);
  assert.equal(computeRealOfferCountdown(undefined, now), null);
  assert.equal(computeRealOfferCountdown(now - 5000, now), null);
  assert.equal(computeRealOfferCountdown(now + 500, now), null);

  const future = now + (2 * 86400 + 3 * 3600 + 15 * 60 + 42) * 1000;
  const parts = computeRealOfferCountdown(future, now);
  assert.ok(parts);
  assert.equal(parts.days, 2);
  assert.equal(parts.hours, 3);
  assert.equal(parts.minutes, 15);
  assert.equal(parts.seconds, 42);
});

test('parseYouTubeVideoId & isDirectVideoUrl safely allowlist valid media and block unsafe URLs', () => {
  assert.equal(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(
    parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s'),
    'dQw4w9WgXcQ'
  );
  assert.equal(parseYouTubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeVideoId('javascript:alert(1)'), null);
  assert.equal(parseYouTubeVideoId('https://evil.example/watch?v=dQw4w9WgXcQ'), null);

  const embed = buildYouTubeEmbedUrl('dQw4w9WgXcQ', {
    autoplay: true,
    muted: true,
    loop: true,
  });
  assert.ok(embed.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?'));
  assert.ok(embed.includes('autoplay=1'));
  assert.ok(embed.includes('mute=1'));

  assert.equal(isDirectVideoUrl('https://cdn.example.com/demo.mp4'), true);
  assert.equal(isDirectVideoUrl('https://cdn.example.com/demo.webm?v=2'), true);
  assert.equal(isDirectVideoUrl('https://youtu.be/dQw4w9WgXcQ'), false);
  assert.equal(isDirectVideoUrl('javascript:alert(1)'), false);
});

test('buildWhatsAppHref and buildPhoneHref format BD numbers cleanly and return null when empty', () => {
  assert.equal(buildWhatsAppHref(''), null);
  assert.equal(buildWhatsAppHref('01712345678'), 'https://wa.me/8801712345678');
  assert.equal(buildWhatsAppHref('+880 1712-345678'), 'https://wa.me/8801712345678');
  assert.equal(buildWhatsAppHref('123'), null);

  assert.equal(buildPhoneHref(''), null);
  assert.equal(buildPhoneHref('+880 1712-345678'), 'tel:+8801712345678');
});

test('resolveConfiguredTrialPlan returns null when trialPlanId is empty or archived', () => {
  const plans = buildSeededPlans();
  assert.equal(resolveConfiguredTrialPlan({ trialPlanId: '' }, plans), null);
  assert.equal(resolveConfiguredTrialPlan({ trialPlanId: 'nonexistent' }, plans), null);

  const active = resolveConfiguredTrialPlan({ trialPlanId: 'plan_standard' }, plans);
  assert.ok(active);
  assert.equal(active.id, 'plan_standard');

  const archivedPlans = plans.map((p) =>
    p.id === 'plan_standard' ? { ...p, archived: true } : p
  );
  assert.equal(resolveConfiguredTrialPlan({ trialPlanId: 'plan_standard' }, archivedPlans), null);
});

test('validateFunnelBuyerContact validates BD phone and name (no email collected)', () => {
  assert.equal(validateFunnelBuyerContact('A', '01712345678').valid, false);
  assert.equal(validateFunnelBuyerContact('তানভীর', '01212345678').valid, false);
  const ok1 = validateFunnelBuyerContact('  তানভীর আহমেদ  ', '01712-345678');
  assert.equal(ok1.valid, true);
  if (ok1.valid) {
    assert.equal(ok1.cleanName, 'তানভীর আহমেদ');
    assert.equal(ok1.cleanPhone, '01712345678');
  }
  const ok2 = validateFunnelBuyerContact('Rahim', '+8801812345678');
  assert.equal(ok2.valid, true);
  if (ok2.valid) {
    assert.equal(ok2.cleanPhone, '01812345678');
  }
});

test('validateAccountSetupForm checks email, password length, and confirmation match', () => {
  assert.equal(validateAccountSetupForm('bad-email', 'secret123', 'secret123').valid, false);
  assert.equal(validateAccountSetupForm('a@b.com', '12345', '12345').valid, false);
  assert.equal(validateAccountSetupForm('a@b.com', 'secret123', 'secret456').valid, false);
  const ok = validateAccountSetupForm('  Owner@Shop.BD ', 'secret123', 'secret123');
  assert.equal(ok.valid, true);
  if (ok.valid) {
    assert.equal(ok.cleanEmail, 'owner@shop.bd');
  }
});

test('parseSetupAccountQuery strictly separates paid token, trial mode, and invalid links', () => {
  assert.deepEqual(parseSetupAccountQuery(''), {
    mode: 'invalid',
    purchaseId: null,
    claimToken: null,
  });
  assert.deepEqual(parseSetupAccountQuery('?trial=1'), {
    mode: 'trial',
    purchaseId: null,
    claimToken: null,
  });
  assert.deepEqual(parseSetupAccountQuery('?purchase=pur_1234&token=short'), {
    mode: 'invalid',
    purchaseId: null,
    claimToken: null,
  });
  assert.deepEqual(
    parseSetupAccountQuery('?purchase=pur_98765&token=tok_abcdef1234567890'),
    {
      mode: 'paid',
      purchaseId: 'pur_98765',
      claimToken: 'tok_abcdef1234567890',
    }
  );
  assert.equal(buildLoginBookmarkUrl('https://payverify.web.app/'), 'https://payverify.web.app/login');
});

test('normalizeLandingConfig preserves exact Step 1 defaults and strips unsafe URLs', () => {
  const def = normalizeLandingConfig(undefined);
  assert.equal(def.hero.headline, DEFAULT_LANDING_CONFIG.hero.headline);
  assert.equal(def.howItWorksSteps.length, 3);
  assert.equal(def.benefits.length, 4);

  const sanitized = normalizeLandingConfig({
    hero: {
      headline: 'কাস্টম শিরোনাম',
      mediaType: 'image',
      imageUrl: 'javascript:alert(1)',
      videoUrl: 'data:text/html,evil',
    },
  });
  assert.equal(sanitized.hero.headline, 'কাস্টম শিরোনাম');
  assert.equal(sanitized.hero.imageUrl, '');
  assert.equal(sanitized.hero.videoUrl, '');
});

test('mapFunnelFailureReasonBn maps all 5 Worker failureReason codes and falls back cleanly', () => {
  const used = mapFunnelFailureReasonBn('trxid_used');
  assert.equal(used.headline, 'এই TrxID ইতিমধ্যে ব্যবহার হয়েছে');
  assert.equal(
    used.message,
    'এই TrxID দিয়ে আগেই একটি পেমেন্ট নিশ্চিত হয়েছে। একই TrxID দুইবার ব্যবহার করা যায় না। নতুন পেমেন্ট করলে নতুন TrxID দিন।'
  );

  const mismatchNoAmt = mapFunnelFailureReasonBn('amount_mismatch');
  assert.equal(mismatchNoAmt.headline, 'টাকার পরিমাণ মেলেনি');
  assert.equal(
    mismatchNoAmt.message,
    'আপনার পাঠানো টাকার পরিমাণ নির্ধারিত পরিমাণের সাথে মেলেনি। সঠিক পরিমাণ পাঠিয়ে আবার চেষ্টা করুন।'
  );

  const mismatchWithAmt = mapFunnelFailureReasonBn('amount_mismatch', {
    expectedAmountPaisa: 99_900,
    receivedAmountPaisa: 50_000,
  });
  assert.equal(mismatchWithAmt.headline, 'টাকার পরিমাণ মেলেনি');
  assert.match(mismatchWithAmt.message, /৳৯৯৯/);
  assert.match(mismatchWithAmt.message, /৳৫০০/);

  const noSms = mapFunnelFailureReasonBn('no_sms_yet');
  assert.equal(noSms.headline, 'এখনো কোনো ম্যাচিং SMS আসেনি');
  assert.equal(
    noSms.message,
    'আপনার TrxID দিয়ে এখনো কোনো মিল পাওয়া যায়নি। পেমেন্টের SMS টি দোকানের ফোনে পৌঁছালে আবার যাচাই করুন।'
  );

  const oldSms = mapFunnelFailureReasonBn('sms_too_old');
  assert.equal(oldSms.headline, 'এই পেমেন্টটি অনেক পুরোনো');
  assert.equal(
    oldSms.message,
    'এই TrxID-এর পেমেন্ট অনেক আগের — এই কেনায় ব্যবহার করা যাবে না।'
  );

  const expired = mapFunnelFailureReasonBn('expired');
  assert.equal(expired.headline, 'এই পেমেন্ট সেশনের সময় শেষ');
  assert.equal(expired.message, 'নতুন করে আবার শুরু করুন।');

  const fallbackNull = mapFunnelFailureReasonBn(null);
  assert.equal(fallbackNull.headline, undefined);
  assert.equal(fallbackNull.message, 'পেমেন্ট যাচাই ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');

  const fallbackUnknown = mapFunnelFailureReasonBn('some_other_error');
  assert.equal(fallbackUnknown.headline, undefined);
  assert.equal(fallbackUnknown.message, 'পেমেন্ট যাচাই ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
});
