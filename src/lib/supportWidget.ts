import { normalizeWorkerBaseUrl } from './workerClient';

export type SupportWidgetMode = 'none' | 'public' | 'inside';

export type SupportWidgetRoute =
  | 'landing'
  | 'pricing'
  | 'checkout'
  | 'setup_account'
  | 'login'
  | 'admin'
  | 'app_download';

export interface SupportWidgetModeInput {
  /** True when rendering /pay/:sessionId or ?pay=... hosted payment page */
  isHostedPaymentPage: boolean;
  /** True when Firebase Auth has finished initializing */
  authReady: boolean;
  /** True when a merchant/staff user is signed in */
  isAuthenticated: boolean;
  /** Current public SPA route */
  publicRoute: SupportWidgetRoute;
  /** True when a non-admin signed-in user is viewing the blocked /admin screen */
  isBlockedAdminScreen?: boolean;
}

export interface SupportWidgetEmbedConfig {
  mode: Exclude<SupportWidgetMode, 'none'>;
  scriptUrl: string | null;
  embedToken: string;
  buttonLabel: 'PayVerify সহায়ক' | 'সহায়তা';
  themeColor: '#0F766E' | '#0B3B36';
  knowledgeUrl: string | null;
}

export type InsideAuthStatus = 'checking' | 'authenticated' | 'expired';

export interface InsideTokenEvaluation {
  status: 'authenticated' | 'expired';
  allowInsideData: boolean;
  /**
   * Security invariant: inside mode NEVER degrades to public mode when the
   * merchant's login token expires.
   */
  fallbackToPublic: false;
  reason?: 'missing_token' | 'token_expired' | 'remote_rejected';
}

export const SUPPORT_WIDGET_PUBLIC_LABEL = 'PayVerify সহায়ক' as const;
export const SUPPORT_WIDGET_INSIDE_LABEL = 'সহায়তা' as const;

/**
 * Determines whether the PayVerify Support widget may mount on the current screen
 * and which mode it must run in.
 *
 * Rules:
 * - NEVER on Hosted Payment Page (/pay/:sessionId or ?pay=...)
 * - NEVER on Subscription Checkout / Payment step (checkout)
 * - NEVER on Login pages (/login or logged-out /admin)
 * - PUBLIC on Landing (/), Pricing (/pricing, /plans), Signup (/setup-account), logged-out /download
 * - INSIDE on ALL authenticated merchant dashboard & staff portal screens
 */
export function resolveSupportWidgetMode(input: SupportWidgetModeInput): SupportWidgetMode {
  if (input.isHostedPaymentPage) return 'none';
  if (!input.authReady) return 'none';

  if (input.isAuthenticated) {
    if (input.isBlockedAdminScreen) return 'none';
    return 'inside';
  }

  // Logged-out routes
  if (input.publicRoute === 'login') return 'none';
  if (input.publicRoute === 'admin') return 'none';
  if (input.publicRoute === 'checkout') return 'none';

  // Allowed public routes: landing, pricing, setup_account (signup), app_download
  return 'public';
}

/**
 * Validates an external XADIK widget script URL.
 * Allows HTTPS URLs (and http://localhost / http://127.0.0.1 for local testing).
 * Rejects javascript:, data:, blob:, relative paths, or invalid URLs.
 */
export function sanitizeWidgetScriptUrl(rawUrl: string | undefined | null): string | null {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed.length > 512) return null;
  try {
    const parsed = new URL(trimmed);
    const isHttps = parsed.protocol === 'https:';
    const isLocalDev =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (!isHttps && !isLocalDev) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Extracts the exact origin of a sanitized widget script URL for safe postMessage origin checks.
 */
export function getWidgetScriptOrigin(scriptUrl: string | null): string | null {
  if (!scriptUrl) return null;
  try {
    return new URL(scriptUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Builds the public knowledge endpoint URL on the configured Worker, if available.
 */
export function buildPublicKnowledgeEndpointUrl(workerBaseUrl: string | undefined | null): string | null {
  const base = normalizeWorkerBaseUrl(workerBaseUrl || '');
  if (!base) return null;
  return `${base}/public/knowledge`;
}

/**
 * Builds the strictly whitelisted host embed configuration.
 * NEVER accepts or emits store keys, device keys, webhook secrets, or user auth tokens.
 */
export function buildSupportWidgetEmbedConfig(params: {
  mode: Exclude<SupportWidgetMode, 'none'>;
  rawScriptUrl?: string | null;
  rawEmbedToken?: string | null;
  workerBaseUrl?: string | null;
}): SupportWidgetEmbedConfig {
  const scriptUrl = sanitizeWidgetScriptUrl(params.rawScriptUrl);
  const embedToken = String(params.rawEmbedToken || '').trim().slice(0, 256);
  const knowledgeUrl = buildPublicKnowledgeEndpointUrl(params.workerBaseUrl);

  if (params.mode === 'inside') {
    return {
      mode: 'inside',
      scriptUrl,
      embedToken,
      buttonLabel: SUPPORT_WIDGET_INSIDE_LABEL,
      themeColor: '#0B3B36',
      knowledgeUrl,
    };
  }

  return {
    mode: 'public',
    scriptUrl,
    embedToken,
    buttonLabel: SUPPORT_WIDGET_PUBLIC_LABEL,
    themeColor: '#0F766E',
    knowledgeUrl,
  };
}

/**
 * Evaluates a merchant's inside-mode auth token state.
 * Security invariant: if the token is missing, expired, or rejected by the backend,
 * inside mode locks down (`allowInsideData: false`, `fallbackToPublic: false`) and
 * displays a "login expired" notice instead of silently falling back to public mode.
 */
export function evaluateInsideTokenState(params: {
  token: string | null;
  expiresAtMs: number | null;
  nowMs?: number;
  remoteRejected?: boolean;
}): InsideTokenEvaluation {
  if (params.remoteRejected) {
    return {
      status: 'expired',
      allowInsideData: false,
      fallbackToPublic: false,
      reason: 'remote_rejected',
    };
  }

  const token = String(params.token || '').trim();
  if (!token) {
    return {
      status: 'expired',
      allowInsideData: false,
      fallbackToPublic: false,
      reason: 'missing_token',
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  if (typeof params.expiresAtMs === 'number' && Number.isFinite(params.expiresAtMs)) {
    if (params.expiresAtMs <= nowMs) {
      return {
        status: 'expired',
        allowInsideData: false,
        fallbackToPublic: false,
        reason: 'token_expired',
      };
    }
  }

  return {
    status: 'authenticated',
    allowInsideData: true,
    fallbackToPublic: false,
  };
}
