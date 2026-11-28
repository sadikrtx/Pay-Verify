import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicKnowledgeEndpointUrl,
  buildSupportWidgetEmbedConfig,
  evaluateInsideTokenState,
  getWidgetScriptOrigin,
  resolveSupportWidgetMode,
  sanitizeWidgetScriptUrl,
  SUPPORT_WIDGET_INSIDE_LABEL,
  SUPPORT_WIDGET_PUBLIC_LABEL,
} from './supportWidget';
import { buildPublicKnowledgePayload } from './publicKnowledge';
import { DEFAULT_PLATFORM_CONFIG } from './storeMappers';
import type { PayPlanDoc, PayPlatformConfig } from '../types/payment';

function makePlan(overrides: Partial<PayPlanDoc> = {}): PayPlanDoc {
  return {
    id: 'plan_pro',
    name: 'প্রো প্যাকেজ',
    priceMonthly: 990,
    priceYearly: 9900,
    storeLimit: 5,
    dailySessionCap: 500,
    deviceLimit: 3,
    features: {
      rotation: true,
      branding: true,
      embedded: true,
      apiAccess: true,
      woocommerce: true,
      analytics: true,
      csvExport: true,
      manualMatch: true,
      members: 2,
    },
    customPerks: ['অগ্রাধিকার সাপোর্ট'],
    visibleOnMarketing: true,
    highlight: true,
    archived: false,
    sortOrder: 1,
    createdAtMs: 1700000000000,
    ...overrides,
  };
}

test('resolveSupportWidgetMode allows public widget on landing, pricing, signup, and download when logged out', () => {
  for (const publicRoute of ['landing', 'pricing', 'setup_account', 'app_download'] as const) {
    assert.equal(
      resolveSupportWidgetMode({
        isHostedPaymentPage: false,
        authReady: true,
        isAuthenticated: false,
        publicRoute,
      }),
      'public',
      `expected public mode on ${publicRoute}`
    );
  }
});

test('resolveSupportWidgetMode strictly blocks widget on hosted payment page, checkout step, /login, and /admin login', () => {
  assert.equal(
    resolveSupportWidgetMode({
      isHostedPaymentPage: true,
      authReady: true,
      isAuthenticated: false,
      publicRoute: 'landing',
    }),
    'none'
  );
  assert.equal(
    resolveSupportWidgetMode({
      isHostedPaymentPage: true,
      authReady: true,
      isAuthenticated: true,
      publicRoute: 'landing',
    }),
    'none'
  );
  for (const blockedRoute of ['checkout', 'login', 'admin'] as const) {
    assert.equal(
      resolveSupportWidgetMode({
        isHostedPaymentPage: false,
        authReady: true,
        isAuthenticated: false,
        publicRoute: blockedRoute,
      }),
      'none',
      `expected none on ${blockedRoute}`
    );
  }
});

test('resolveSupportWidgetMode enables inside mode across all authenticated merchant dashboard pages', () => {
  assert.equal(
    resolveSupportWidgetMode({
      isHostedPaymentPage: false,
      authReady: true,
      isAuthenticated: true,
      publicRoute: 'landing',
    }),
    'inside'
  );
  assert.equal(
    resolveSupportWidgetMode({
      isHostedPaymentPage: false,
      authReady: true,
      isAuthenticated: true,
      publicRoute: 'admin',
      isBlockedAdminScreen: false,
    }),
    'inside'
  );
  assert.equal(
    resolveSupportWidgetMode({
      isHostedPaymentPage: false,
      authReady: true,
      isAuthenticated: true,
      publicRoute: 'admin',
      isBlockedAdminScreen: true,
    }),
    'none'
  );
});

test('sanitizeWidgetScriptUrl allows HTTPS and localhost dev URLs while blocking unsafe schemes', () => {
  assert.equal(
    sanitizeWidgetScriptUrl('https://widget.xadik.app/embed/payverify.js'),
    'https://widget.xadik.app/embed/payverify.js'
  );
  assert.equal(
    sanitizeWidgetScriptUrl('http://localhost:8787/widget.js'),
    'http://localhost:8787/widget.js'
  );
  assert.equal(sanitizeWidgetScriptUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeWidgetScriptUrl('data:text/javascript,alert(1)'), null);
  assert.equal(sanitizeWidgetScriptUrl('http://evil.example.com/widget.js'), null);
  assert.equal(sanitizeWidgetScriptUrl('https://user:pass@widget.xadik.app/w.js'), null);
  assert.equal(getWidgetScriptOrigin('https://widget.xadik.app/embed/w.js'), 'https://widget.xadik.app');
});

test('buildSupportWidgetEmbedConfig sets distinct public vs inside labels and never includes merchant secrets', () => {
  const pub = buildSupportWidgetEmbedConfig({
    mode: 'public',
    rawScriptUrl: 'https://widget.xadik.app/embed.js',
    rawEmbedToken: 'xdk_pub_12345',
    workerBaseUrl: 'https://pay.example.workers.dev/',
  });
  assert.equal(pub.mode, 'public');
  assert.equal(pub.buttonLabel, SUPPORT_WIDGET_PUBLIC_LABEL);
  assert.equal(pub.knowledgeUrl, 'https://pay.example.workers.dev/public/knowledge');
  assert.equal(buildPublicKnowledgeEndpointUrl('https://pay.example.workers.dev/'), pub.knowledgeUrl);

  const inside = buildSupportWidgetEmbedConfig({
    mode: 'inside',
    rawScriptUrl: 'https://widget.xadik.app/embed.js',
    rawEmbedToken: 'xdk_pub_12345',
    workerBaseUrl: 'https://pay.example.workers.dev',
  });
  assert.equal(inside.mode, 'inside');
  assert.equal(inside.buttonLabel, SUPPORT_WIDGET_INSIDE_LABEL);
  assert.notEqual(inside.buttonLabel, pub.buttonLabel);

  const serialized = JSON.stringify(inside);
  assert.ok(!serialized.includes('storeKey'));
  assert.ok(!serialized.includes('deviceKey'));
  assert.ok(!serialized.includes('webhookSecret'));
});

test('evaluateInsideTokenState locks inside mode on token expiry or rejection and NEVER degrades to public mode', () => {
  const valid = evaluateInsideTokenState({
    token: 'eyJhbGciOiJSUzI1NiJ9.valid.sig',
    expiresAtMs: 2_000_000,
    nowMs: 1_000_000,
  });
  assert.equal(valid.status, 'authenticated');
  assert.equal(valid.allowInsideData, true);
  assert.equal(valid.fallbackToPublic, false);

  const expired = evaluateInsideTokenState({
    token: 'eyJhbGciOiJSUzI1NiJ9.old.sig',
    expiresAtMs: 1_000_000,
    nowMs: 1_000_001,
  });
  assert.equal(expired.status, 'expired');
  assert.equal(expired.allowInsideData, false);
  assert.equal(expired.fallbackToPublic, false);
  assert.equal(expired.reason, 'token_expired');

  const missing = evaluateInsideTokenState({
    token: '',
    expiresAtMs: null,
  });
  assert.equal(missing.status, 'expired');
  assert.equal(missing.allowInsideData, false);
  assert.equal(missing.fallbackToPublic, false);

  const rejected = evaluateInsideTokenState({
    token: 'eyJhbGciOiJSUzI1NiJ9.valid.sig',
    expiresAtMs: 2_000_000,
    nowMs: 1_000_000,
    remoteRejected: true,
  });
  assert.equal(rejected.status, 'expired');
  assert.equal(rejected.allowInsideData, false);
  assert.equal(rejected.fallbackToPublic, false);
  assert.equal(rejected.reason, 'remote_rejected');
});

test('buildPublicKnowledgePayload exposes ONLY visible non-archived payPlans and sanitized public config', () => {
  const plans: PayPlanDoc[] = [
    makePlan({ id: 'plan_visible_2', name: 'বিজনেস', sortOrder: 2, visibleOnMarketing: true, archived: false }),
    makePlan({ id: 'plan_visible_1', name: 'স্ট্যান্ডার্ড', sortOrder: 1, visibleOnMarketing: true, archived: false }),
    makePlan({ id: 'plan_hidden', name: 'প্রাইভেট ডিল', sortOrder: 0, visibleOnMarketing: false, archived: false }),
    makePlan({ id: 'plan_archived', name: 'পুরনো প্ল্যান', sortOrder: 3, visibleOnMarketing: true, archived: true }),
  ];

  const cfg: PayPlatformConfig = {
    ...DEFAULT_PLATFORM_CONFIG,
    trialPlanId: 'plan_visible_1',
    subscriptionStoreId: 'internal_sub_store_secret_id',
    migratedStoreId: 'internal_migrated_store_id',
    supportWhatsApp: '01711000000',
    supportPhone: '01711000001',
    updatedAtMs: 1730000000000,
  };

  const payload = buildPublicKnowledgePayload(plans, cfg);
  assert.equal(payload.service, 'PayVerify BD');
  assert.deepEqual(
    payload.plans.map((p) => p.id),
    ['plan_visible_1', 'plan_visible_2']
  );
  assert.equal(payload.plans[0].isTrialPlan, true);
  assert.equal(payload.plans[1].isTrialPlan, false);
  assert.equal(payload.support.whatsapp, '01711000000');
  assert.equal(payload.support.phone, '01711000001');

  const rawJson = JSON.stringify(payload);
  assert.ok(!rawJson.includes('internal_sub_store_secret_id'));
  assert.ok(!rawJson.includes('internal_migrated_store_id'));
  assert.ok(!rawJson.includes('plan_hidden'));
  assert.ok(!rawJson.includes('plan_archived'));
});
