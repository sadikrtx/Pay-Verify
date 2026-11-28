import type { PayPlanDoc, PayPlanFeatures, PayPlatformConfig } from '../types/payment';

export interface PublicKnowledgePlan {
  id: string;
  name: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  storeLimit: number;
  dailySessionCap: number;
  deviceLimit: number;
  features: PayPlanFeatures;
  customPerks: string[];
  highlight: boolean;
  isTrialPlan: boolean;
}

export interface PublicKnowledgeFaq {
  question: string;
  answer: string;
}

export interface PublicKnowledgePayload {
  service: 'PayVerify BD';
  updatedAtMs: number | null;
  plans: PublicKnowledgePlan[];
  landing: {
    heroHeadline: string;
    heroSupportingLine: string;
    howItWorksSteps: string[];
    benefits: string[];
    faqs: PublicKnowledgeFaq[];
  };
  support: {
    whatsapp: string;
    phone: string;
  };
}

/**
 * Builds the strictly public knowledge payload for the PayVerify Support widget
 * (Part B: visible non-archived payPlans + sanitized public config ONLY).
 * NEVER includes store keys, device keys, webhook secrets, subscriptionStoreId,
 * migratedStoreId, merchant accounts, sessions, or SMS records.
 */
export function buildPublicKnowledgePayload(
  plans: PayPlanDoc[],
  platformConfig: PayPlatformConfig
): PublicKnowledgePayload {
  const trialPlanId = String(platformConfig.trialPlanId || '').trim();

  const visiblePlans: PublicKnowledgePlan[] = [...plans]
    .filter((p) => Boolean(p.visibleOnMarketing) && !p.archived)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((p) => ({
      id: String(p.id),
      name: String(p.name || '').trim(),
      priceMonthly: typeof p.priceMonthly === 'number' && p.priceMonthly > 0 ? p.priceMonthly : null,
      priceYearly: typeof p.priceYearly === 'number' && p.priceYearly > 0 ? p.priceYearly : null,
      storeLimit: Math.max(0, Math.trunc(Number(p.storeLimit ?? 0))),
      dailySessionCap: Math.max(0, Math.trunc(Number(p.dailySessionCap ?? 0))),
      deviceLimit: Math.max(0, Math.trunc(Number(p.deviceLimit ?? 0))),
      features: {
        rotation: Boolean(p.features?.rotation),
        branding: Boolean(p.features?.branding),
        embedded: Boolean(p.features?.embedded),
        apiAccess: Boolean(p.features?.apiAccess),
        woocommerce: Boolean(p.features?.woocommerce),
        analytics: Boolean(p.features?.analytics),
        csvExport: Boolean(p.features?.csvExport),
        manualMatch: Boolean(p.features?.manualMatch),
        members: Math.max(0, Math.trunc(Number(p.features?.members ?? 0))),
      },
      customPerks: Array.isArray(p.customPerks)
        ? p.customPerks.map((perk) => String(perk || '').trim()).filter(Boolean)
        : [],
      highlight: Boolean(p.highlight),
      isTrialPlan: Boolean(trialPlanId && p.id === trialPlanId),
    }));

  const landing = platformConfig.landing;

  return {
    service: 'PayVerify BD',
    updatedAtMs: platformConfig.updatedAtMs ?? null,
    plans: visiblePlans,
    landing: {
      heroHeadline: String(landing?.hero?.headline || '').trim(),
      heroSupportingLine: String(landing?.hero?.supportingLine || '').trim(),
      howItWorksSteps: Array.isArray(landing?.howItWorksSteps)
        ? landing.howItWorksSteps.map((s) => String(s || '').trim()).filter(Boolean)
        : [],
      benefits: Array.isArray(landing?.benefits)
        ? landing.benefits.map((b) => String(b?.text || '').trim()).filter(Boolean)
        : [],
      faqs: Array.isArray(landing?.faqs)
        ? landing.faqs
            .map((f) => ({
              question: String(f?.question || '').trim(),
              answer: String(f?.answer || '').trim(),
            }))
            .filter((f) => f.question && f.answer)
        : [],
    },
    support: {
      whatsapp: String(platformConfig.supportWhatsApp || '').trim(),
      phone: String(platformConfig.supportPhone || '').trim(),
    },
  };
}
