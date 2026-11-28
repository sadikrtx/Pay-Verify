import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Lock,
  LogOut,
  MessageCircle,
  MessageSquare,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { buildPublicKnowledgePayload, type PublicKnowledgePayload } from '../lib/publicKnowledge';
import { formatPlanPriceBn } from '../lib/planEngine';
import {
  buildSupportWidgetEmbedConfig,
  evaluateInsideTokenState,
  getWidgetScriptOrigin,
  type InsideAuthStatus,
  type SupportWidgetMode,
} from '../lib/supportWidget';
import type { PayPlanDoc, PayPlatformConfig } from '../types/payment';

export interface SupportWidgetHostProps {
  mode: Exclude<SupportWidgetMode, 'none'>;
  plans: PayPlanDoc[];
  platformConfig: PayPlatformConfig;
  /** True on public landing page where mobile has a sticky bottom CTA bar */
  hasMobileStickyBar?: boolean;
  /** Optional safe non-secret merchant UI context (inside mode ONLY — never keys/secrets) */
  insideContext?: {
    activeSectionLabel?: string;
    planName?: string;
    merchantDisplayName?: string;
    onReLogin?: () => void;
  };
}

export interface PayVerifySupportWidgetBridge {
  mode: 'public' | 'inside';
  embedToken: string;
  buttonLabel: 'PayVerify সহায়ক' | 'সহায়তা';
  themeColor: string;
  knowledgeUrl: string | null;
  getPublicKnowledge: () => PublicKnowledgePayload;
  /** Present ONLY in inside mode. Returns fresh Firebase ID token or login_expired. */
  getAuthToken?: (
    forceRefresh?: boolean
  ) => Promise<
    { ok: true; token: string; expiresAtMs: number } | { ok: false; error: 'login_expired' }
  >;
  notifyAuthExpired: () => void;
  markExternalMounted: () => void;
}

declare global {
  interface Window {
    PayVerifySupportWidget?: PayVerifySupportWidgetBridge;
    __XADIK_WIDGET_MOUNTED__?: boolean;
  }
}

const SCRIPT_ELEMENT_ID = 'payverify-xadik-support-widget-script';

export const SupportWidgetHost: React.FC<SupportWidgetHostProps> = ({
  mode,
  plans,
  platformConfig,
  hasMobileStickyBar = false,
  insideContext,
}) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [externalMounted, setExternalMounted] = useState(false);
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(0);
  const [insideAuthStatus, setInsideAuthStatus] = useState<InsideAuthStatus>(
    mode === 'inside' ? 'checking' : 'authenticated'
  );
  const remoteRejectedRef = useRef(false);

  const envScriptUrl = (
    import.meta.env.VITE_SUPPORT_WIDGET_SCRIPT_URL as string | undefined
  )?.trim();
  const envEmbedToken = (
    import.meta.env.VITE_SUPPORT_WIDGET_TOKEN as string | undefined
  )?.trim();

  const embedConfig = useMemo(
    () =>
      buildSupportWidgetEmbedConfig({
        mode,
        rawScriptUrl: envScriptUrl,
        rawEmbedToken: envEmbedToken,
        workerBaseUrl: platformConfig.workerBaseUrl,
      }),
    [mode, envScriptUrl, envEmbedToken, platformConfig.workerBaseUrl]
  );

  const publicKnowledge = useMemo(
    () => buildPublicKnowledgePayload(plans, platformConfig),
    [plans, platformConfig]
  );

  const scriptOrigin = useMemo(
    () => getWidgetScriptOrigin(embedConfig.scriptUrl),
    [embedConfig.scriptUrl]
  );

  // Close panel when switching between public and inside mode
  useEffect(() => {
    setPanelOpen(false);
    remoteRejectedRef.current = false;
    setInsideAuthStatus(mode === 'inside' ? 'checking' : 'authenticated');
  }, [mode]);

  /**
   * Inside-mode login token verifier.
   * NEVER exposes store keys, device keys, or webhook secrets — ONLY the merchant's
   * Firebase Auth ID token in memory. If expired/missing/rejected, locks inside mode
   * cleanly without ever degrading to public mode.
   */
  const verifyInsideAuthToken = useCallback(
    async (
      forceRefresh = false
    ): Promise<
      { ok: true; token: string; expiresAtMs: number } | { ok: false; error: 'login_expired' }
    > => {
      if (mode !== 'inside') {
        return { ok: false, error: 'login_expired' };
      }

      if (remoteRejectedRef.current) {
        setInsideAuthStatus('expired');
        return { ok: false, error: 'login_expired' };
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        setInsideAuthStatus('expired');
        return { ok: false, error: 'login_expired' };
      }

      try {
        const result = await currentUser.getIdTokenResult(forceRefresh);
        const expiresAtMs = Date.parse(result.expirationTime);
        const evaluation = evaluateInsideTokenState({
          token: result.token,
          expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : null,
          remoteRejected: remoteRejectedRef.current,
        });

        if (!evaluation.allowInsideData) {
          setInsideAuthStatus('expired');
          return { ok: false, error: 'login_expired' };
        }

        setInsideAuthStatus('authenticated');
        return {
          ok: true,
          token: result.token,
          expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 5 * 60_000,
        };
      } catch {
        setInsideAuthStatus('expired');
        return { ok: false, error: 'login_expired' };
      }
    },
    [mode]
  );

  // Watch Firebase ID token lifecycle strictly in inside mode
  useEffect(() => {
    if (mode !== 'inside') return;
    let cancelled = false;

    const runCheck = () => {
      void verifyInsideAuthToken(false).then((res) => {
        if (cancelled) return;
        setInsideAuthStatus(res.ok ? 'authenticated' : 'expired');
      });
    };

    runCheck();
    const unsub = onIdTokenChanged(auth, (nextUser) => {
      if (cancelled) return;
      if (!nextUser) {
        setInsideAuthStatus('expired');
        return;
      }
      remoteRejectedRef.current = false;
      runCheck();
    });

    const intervalId = window.setInterval(runCheck, 60_000);
    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(intervalId);
    };
  }, [mode, verifyInsideAuthToken]);

  // Re-verify login token each time the merchant opens the inside-mode panel
  useEffect(() => {
    if (mode === 'inside' && panelOpen) {
      void verifyInsideAuthToken(false);
    }
  }, [mode, panelOpen, verifyInsideAuthToken]);

  // Close sheet on Escape key
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanelOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelOpen]);

  // Expose strictly scoped host bridge + load external XADIK script async/deferred
  useEffect(() => {
    const notifyAuthExpired = () => {
      if (mode === 'inside') {
        remoteRejectedRef.current = true;
        setInsideAuthStatus('expired');
      }
    };

    const markExternalMounted = () => {
      setExternalMounted(true);
    };

    const bridge: PayVerifySupportWidgetBridge = {
      mode: embedConfig.mode,
      embedToken: embedConfig.embedToken,
      buttonLabel: embedConfig.buttonLabel,
      themeColor: embedConfig.themeColor,
      knowledgeUrl: embedConfig.knowledgeUrl,
      getPublicKnowledge: () => publicKnowledge,
      notifyAuthExpired,
      markExternalMounted,
    };

    // Only expose auth token getter in inside mode — never on public pages
    if (embedConfig.mode === 'inside') {
      bridge.getAuthToken = verifyInsideAuthToken;
    }

    window.PayVerifySupportWidget = bridge;
    window.dispatchEvent(
      new CustomEvent('payverify:widget-context', {
        detail: {
          mode: embedConfig.mode,
          buttonLabel: embedConfig.buttonLabel,
          themeColor: embedConfig.themeColor,
          knowledgeUrl: embedConfig.knowledgeUrl,
        },
      })
    );

    const onExternalReady = () => setExternalMounted(true);
    const onExternalAuthExpired = () => notifyAuthExpired();
    const onMessage = (event: MessageEvent) => {
      if (!scriptOrigin || event.origin !== scriptOrigin) return;
      if (!event.data || typeof event.data !== 'object') return;
      const msgType = String((event.data as { type?: unknown }).type || '');
      if (msgType === 'xadik:widget-ready') {
        setExternalMounted(true);
      } else if (msgType === 'xadik:widget-auth-expired') {
        notifyAuthExpired();
      }
    };

    window.addEventListener('xadik:widget-ready', onExternalReady);
    window.addEventListener('xadik:widget-auth-expired', onExternalAuthExpired);
    window.addEventListener('message', onMessage);

    // Async/deferred external script injection (gracefully silent if Worker/host is down)
    let injectedScript: HTMLScriptElement | null = null;
    if (embedConfig.scriptUrl) {
      const existing = document.getElementById(SCRIPT_ELEMENT_ID);
      if (existing) {
        existing.remove();
      }
      const script = document.createElement('script');
      script.id = SCRIPT_ELEMENT_ID;
      script.src = embedConfig.scriptUrl;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-payverify-support-widget', 'true');
      script.setAttribute('data-mode', embedConfig.mode);
      script.setAttribute('data-label', embedConfig.buttonLabel);
      script.setAttribute('data-theme', embedConfig.themeColor);
      if (embedConfig.embedToken) {
        script.setAttribute('data-token', embedConfig.embedToken);
      }
      if (embedConfig.knowledgeUrl) {
        script.setAttribute('data-knowledge-url', embedConfig.knowledgeUrl);
      }
      script.onerror = () => {
        // Worker / external widget offline: stay completely silent, zero page error
        setExternalMounted(false);
      };
      script.onload = () => {
        if (window.__XADIK_WIDGET_MOUNTED__) {
          setExternalMounted(true);
        }
      };
      document.body.appendChild(script);
      injectedScript = script;
    }

    return () => {
      window.removeEventListener('xadik:widget-ready', onExternalReady);
      window.removeEventListener('xadik:widget-auth-expired', onExternalAuthExpired);
      window.removeEventListener('message', onMessage);

      if (injectedScript && injectedScript.parentNode) {
        injectedScript.parentNode.removeChild(injectedScript);
      }
      const leftoverScript = document.getElementById(SCRIPT_ELEMENT_ID);
      if (leftoverScript) {
        leftoverScript.remove();
      }
      // Clean up any external widget roots when leaving allowed pages (e.g. to /login or /pay)
      document
        .querySelectorAll('[data-xadik-widget-root], #xadik-support-widget')
        .forEach((node) => node.remove());
      delete window.PayVerifySupportWidget;
      delete window.__XADIK_WIDGET_MOUNTED__;
      setExternalMounted(false);
    };
  }, [embedConfig, publicKnowledge, scriptOrigin, verifyInsideAuthToken, mode]);

  // If the external XADIK widget mounted its own launcher/UI, do not render a duplicate button
  if (externalMounted) {
    return null;
  }

  const isInside = mode === 'inside';

  // Position cleanly so 360px CTA bar (landing) and forms/buttons (dashboard) are NEVER covered
  const launcherPositionClass = isInside
    ? 'fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-40'
    : hasMobileStickyBar
      ? 'fixed right-4 bottom-20 lg:right-6 lg:bottom-6 z-40'
      : 'fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-40';

  const whatsappHref = publicKnowledge.support.whatsapp
    ? `https://wa.me/${publicKnowledge.support.whatsapp.replace(/[^\d]/g, '').replace(/^01/, '8801')}`
    : '';
  const phoneHref = publicKnowledge.support.phone
    ? `tel:${publicKnowledge.support.phone.replace(/[^\d+]/g, '')}`
    : '';

  return (
    <div
      data-testid="payverify-support-widget-host"
      data-widget-mode={mode}
      className="print:hidden"
    >
      {/* Floating Launcher Button */}
      {!panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          data-testid="support-widget-trigger"
          data-widget-mode={mode}
          aria-label={embedConfig.buttonLabel}
          className={`${launcherPositionClass} inline-flex items-center gap-2 rounded-full font-bold shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            isInside
              ? 'h-11 px-3.5 bg-[#0B3B36] hover:bg-[#0F766E] text-white text-xs sm:text-sm border border-teal-400/25 focus:ring-teal-500'
              : 'h-12 px-4 bg-[#0F766E] hover:bg-[#0B3B36] text-white text-xs sm:text-sm border border-white/15 focus:ring-[#0F766E]'
          }`}
        >
          {isInside ? (
            <HelpCircle className="w-4.5 h-4.5 shrink-0 text-teal-200" aria-hidden="true" />
          ) : (
            <MessageSquare className="w-4.5 h-4.5 shrink-0 text-teal-100" aria-hidden="true" />
          )}
          <span className="whitespace-nowrap">{embedConfig.buttonLabel}</span>
        </button>
      )}

      {/* Support Panel: Full-screen sheet on mobile (< sm), clean floating card on desktop (sm+) */}
      {panelOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={embedConfig.buttonLabel}
          data-testid="support-widget-panel"
          data-widget-mode={mode}
          className="fixed inset-0 sm:inset-auto sm:right-6 sm:bottom-6 z-50 bg-white sm:w-[390px] sm:max-w-[calc(100vw-3rem)] sm:h-[540px] sm:max-h-[calc(100vh-4rem)] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Panel Header */}
          <div
            className={`px-4 py-3.5 flex items-center justify-between gap-3 shrink-0 text-white ${
              isInside ? 'bg-[#0B3B36]' : 'bg-[#0F766E]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                {isInside ? (
                  <HelpCircle className="w-4.5 h-4.5 text-white" />
                ) : (
                  <MessageSquare className="w-4.5 h-4.5 text-white" />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight truncate">
                  {isInside ? 'মার্চেন্ট সহায়তা' : 'PayVerify সহায়ক'}
                </div>
                <div className="text-[11px] text-teal-100 truncate">
                  {isInside
                    ? insideContext?.activeSectionLabel
                      ? `ড্যাশবোর্ড · ${insideContext.activeSectionLabel}`
                      : 'ড্যাশবোর্ড সহায়তা (ভিতরের মোড)'
                    : 'প্যাকেজ, সেটআপ ও সাধারণ প্রশ্ন'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              data-testid="support-widget-close"
              aria-label="বন্ধ করুন"
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 transition-colors"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8FAFC]">
            {isInside ? (
              insideAuthStatus === 'expired' ? (
                /* STRICT SECURITY RULE: Inside mode NEVER falls back to public mode on expired token */
                <div
                  data-testid="widget-login-expired"
                  className="bg-white rounded-2xl border border-rose-200 p-5 space-y-3.5 text-center shadow-2xs"
                >
                  <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">
                      লগইনের মেয়াদ শেষ হয়েছে (Login expired)
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      আপনার মার্চেন্ট সেশনের মেয়াদ শেষ হয়ে গেছে। নিরাপত্তার জন্য ড্যাশবোর্ডের ভেতরের তথ্য ও সহায়তা বন্ধ রাখা হয়েছে।
                    </p>
                  </div>
                  {insideContext?.onReLogin && (
                    <button
                      type="button"
                      onClick={() => {
                        setPanelOpen(false);
                        insideContext.onReLogin?.();
                      }}
                      data-testid="widget-relogin-btn"
                      className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#0B3B36] hover:bg-[#0F766E] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      পুনরায় লগইন করুন
                    </button>
                  )}
                </div>
              ) : (
                /* Authenticated Inside Mode Panel — Strictly verified via Firebase ID token, zero keys/secrets */
                <>
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B3B36]">
                        <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                        ভেরিফায়েড মার্চেন্ট সেশন
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-[11px] font-bold text-teal-800">
                        Inside Mode
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {insideContext?.merchantDisplayName
                        ? `${insideContext.merchantDisplayName}, আপনার `
                        : 'আপনার '}
                      {insideContext?.planName ? `${insideContext.planName} ` : ''}
                      ড্যাশবোর্ডের যেকোনো সেটিংস, ফোন সংযোগ বা পেমেন্ট যাচাইয়ে সাহায্য পাবেন এখানে।
                    </p>
                  </div>

                  {/* Quick Merchant Inside Guides */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 space-y-2.5 shadow-2xs">
                    <div className="text-xs font-bold text-slate-900">দ্রুত নির্দেশিকা</div>
                    <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
                      <li className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <strong className="text-slate-900 block mb-0.5">১. ফোন সংযোগ</strong>
                        «ফোন সংযোগ» থেকে QR স্ক্যান করে আপনার নিজের Android ফোনের PayVerify অ্যাপ যুক্ত করুন।
                      </li>
                      <li className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <strong className="text-slate-900 block mb-0.5">২. পেমেন্ট নম্বর ও ওয়েববুক</strong>
                        «স্টোর সেটিংস» ও «পেমেন্ট পেজ সেটিংস»-এ আপনার bKash/Nagad নম্বর এবং Webhook URL/Secret সেভ করুন।
                      </li>
                      <li className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <strong className="text-slate-900 block mb-0.5">৩. টেস্ট পেমেন্ট যাচাই</strong>
                        «লাইভ সেশন»-এ গিয়ে টেস্ট পেমেন্ট চালিয়ে SMS ম্যাচিং নিশ্চিত করে নিন।
                      </li>
                    </ul>
                  </div>

                  {/* Security Assurance Note */}
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-teal-50/70 border border-teal-200/70 text-[11px] text-teal-900">
                    <Lock className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                    <span>
                      নিরাপত্তা: এই সহায়তা উইজেটে কখনোই আপনার Store Key, Device Key বা Webhook Secret পাঠানো হয় না।
                    </span>
                  </div>
                </>
              )
            ) : (
              /* Public Landing / Pricing / Signup Mode — Strictly public knowledge ONLY */
              <>
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 space-y-1.5 shadow-2xs">
                  <div className="text-xs font-bold text-[#0B3B36]">
                    PayVerify BD সম্পর্কে জানতে চান?
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {publicKnowledge.landing.heroSupportingLine ||
                      'bKash, Nagad, Rocket ও Upay পেমেন্ট স্বয়ংক্রিয়ভাবে যাচাই করুন আপনার নিজের ফোন ও নম্বর দিয়ে।'}
                  </p>
                </div>

                {/* Visible Marketing Plans (Strictly public knowledge) */}
                {publicKnowledge.plans.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 space-y-2.5 shadow-2xs">
                    <div className="text-xs font-bold text-slate-900">উপলব্ধ প্যাকেজসমূহ</div>
                    <div className="space-y-2">
                      {publicKnowledge.plans.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {p.name}
                              {p.isTrialPlan && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">
                                  ফ্রি ট্রায়াল
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {p.storeLimit === 0
                                ? 'আনলিমিটেড স্টোর'
                                : `${p.storeLimit.toLocaleString('bn-BD')}টি স্টোর`}
                            </div>
                          </div>
                          <div className="text-xs font-extrabold text-[#0B3B36] shrink-0">
                            {formatPlanPriceBn(p.priceMonthly)}/মাস
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Public FAQs */}
                {publicKnowledge.landing.faqs.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 space-y-2 shadow-2xs">
                    <div className="text-xs font-bold text-slate-900">সাধারণ প্রশ্নোত্তর</div>
                    <div className="divide-y divide-slate-100">
                      {publicKnowledge.landing.faqs.slice(0, 5).map((faq, idx) => {
                        const open = expandedFaqIndex === idx;
                        return (
                          <div key={`${faq.question}-${idx}`} className="py-2 first:pt-0 last:pb-0">
                            <button
                              type="button"
                              onClick={() => setExpandedFaqIndex(open ? null : idx)}
                              className="w-full flex items-center justify-between gap-2 text-left text-xs font-semibold text-slate-800 hover:text-[#0F766E]"
                            >
                              <span>{faq.question}</span>
                              {open ? (
                                <ChevronUp className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                              )}
                            </button>
                            {open && (
                              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                                {faq.answer}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Direct Support Contact Footer (if configured & not expired) */}
            {(!isInside || insideAuthStatus !== 'expired') && (whatsappHref || phoneHref) && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 flex flex-wrap items-center gap-2 shadow-2xs">
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-[120px] min-h-[38px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </a>
                )}
                {phoneHref && (
                  <a
                    href={phoneHref}
                    className="flex-1 min-w-[120px] min-h-[38px] px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    কল করুন
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
