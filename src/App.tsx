import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CreditCard,
  Inbox,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  UserCircle2,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HostedPaymentPage } from './components/HostedPaymentPage';
import { SignInGate } from './components/SignInGate';
import { MarketingPlansView } from './components/MarketingPlansView';
import { OverviewView } from './components/OverviewView';
import { SessionsView } from './components/SessionsView';
import { UnmatchedSmsView } from './components/UnmatchedSmsView';
import { TransactionsView } from './components/TransactionsView';
import { StoreSettingsView } from './components/StoreSettingsView';
import { PaymentPageSettingsView } from './components/PaymentPageSettingsView';
import { MyStoresView } from './components/MyStoresView';
import { DeviceConnectionView } from './components/DeviceConnectionView';
import { ApiDocsView } from './components/ApiDocsView';
import { AccountView } from './components/AccountView';
import { ChangelogView } from './components/ChangelogView';
import { SuperAdminView } from './components/SuperAdminView';
import { PayVerifyProvider, usePayVerify } from './lib/store';
import { isSmsUnmatchedForInbox } from './lib/platformLogic';

type DashboardTab =
  | 'overview'
  | 'sessions'
  | 'unmatched_sms'
  | 'sms'
  | 'payment_page'
  | 'store_settings'
  | 'my_stores'
  | 'device'
  | 'api_docs'
  | 'changelog'
  | 'account'
  | 'super_admin';

function extractPublicSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/pay\/([^/]+)\/?$/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }
  const fromQuery = new URLSearchParams(window.location.search).get('pay');
  if (fromQuery && fromQuery.trim()) {
    return fromQuery.trim();
  }
  return null;
}

function isInitialPlansRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return /^\/plans\/?$/.test(window.location.pathname);
}

const DashboardShell: React.FC = () => {
  const {
    user,
    authReady,
    account,
    planEvaluation,
    effectivePlan,
    hasUnreadChangelog,
    accessibleStores,
    selectedStore,
    setSelectedStoreId,
    storeSessions,
    smsList,
    deviceRejectedAlerts,
    newDeviceLoginAlert,
    dismissNewDeviceLoginAlert,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
  } = usePayVerify();

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPublicPlans, setShowPublicPlans] = useState<boolean>(() => isInitialPlansRoute());
  const [showInAppPlans, setShowInAppPlans] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeTab, showPublicPlans, showInAppPlans]);

  const waitingCount = useMemo(
    () => storeSessions.filter((s) => s.status === 'waiting').length,
    [storeSessions]
  );
  const unmatchedSmsCount = useMemo(
    () => smsList.filter(isSmsUnmatchedForInbox).length,
    [smsList]
  );

  // Public marketing plan comparison route (/plans) works both signed out and signed in
  if (showPublicPlans) {
    return (
      <MarketingPlansView
        onBack={() => {
          setShowPublicPlans(false);
          if (typeof window !== 'undefined' && /^\/plans\/?$/.test(window.location.pathname)) {
            window.history.replaceState({}, '', '/');
          }
        }}
        backLabel={user ? 'ড্যাশবোর্ডে ফিরুন' : 'সাইন ইনে ফিরুন'}
        currentPlanId={effectivePlan?.plan.id || null}
        onSelectPlan={() => {
          setShowPublicPlans(false);
          if (typeof window !== 'undefined' && /^\/plans\/?$/.test(window.location.pathname)) {
            window.history.replaceState({}, '', '/');
          }
          if (user) {
            setActiveTab('account');
          }
        }}
        actionLabel={user ? 'প্ল্যান বেছে নিন' : '৭ দিনের ট্রায়াল শুরু করুন'}
      />
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center p-6">
        <div className="w-9 h-9 rounded-full border-3 border-teal-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <SignInGate
        onGoogleSignIn={signInWithGoogle}
        onEmailSignIn={signInWithEmail}
        onEmailSignUp={signUpWithEmail}
        onViewPlans={() => setShowPublicPlans(true)}
      />
    );
  }

  if (showInAppPlans) {
    return (
      <MarketingPlansView
        onBack={() => setShowInAppPlans(false)}
        backLabel="অ্যাকাউন্টে ফিরুন"
        currentPlanId={effectivePlan?.plan.id || null}
        onSelectPlan={() => {
          setShowInAppPlans(false);
          setActiveTab('account');
        }}
        actionLabel="এই প্ল্যান নিন"
      />
    );
  }

  const navItems: Array<{
    id: DashboardTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    unreadDot?: boolean;
  }> = [
    { id: 'overview', label: 'ওভারভিউ', icon: LayoutDashboard },
    { id: 'sessions', label: 'লাইভ সেশন', icon: Activity, badge: waitingCount },
    { id: 'unmatched_sms', label: 'মেলেনি এমন SMS', icon: Inbox, badge: unmatchedSmsCount },
    { id: 'sms', label: 'SMS লগ', icon: MessageSquareText },
    { id: 'payment_page', label: 'পেমেন্ট পেজ সেটিংস', icon: CreditCard },
    { id: 'store_settings', label: 'স্টোর সেটিংস', icon: Settings },
    { id: 'my_stores', label: 'আমার স্টোরসমূহ', icon: Store },
    { id: 'device', label: 'ফোন সংযোগ', icon: Smartphone },
    { id: 'api_docs', label: 'API ডকুমেন্ট', icon: BookOpen },
    {
      id: 'changelog',
      label: 'নতুন কি এসেছে',
      icon: Sparkles,
      unreadDot: hasUnreadChangelog,
    },
    { id: 'account', label: 'অ্যাকাউন্ট', icon: UserCircle2 },
  ];

  if (account?.isSuperAdmin) {
    navItems.push({ id: 'super_admin', label: 'সুপার অ্যাডমিন', icon: Shield });
  }

  const selectTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const showStoreSwitcher = accessibleStores.length > 1;
  const planInactive = Boolean(planEvaluation && !planEvaluation.isActive);
  const inGrace = Boolean(planEvaluation?.inGrace);

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200/80 z-30">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-slate-900 leading-tight truncate">
              PayVerify BD
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {selectedStore?.name || account?.displayName || 'মার্চেন্ট'}
            </div>
          </div>
        </div>

        {/* Store Switcher (shown when account has >1 store) */}
        {showStoreSwitcher && (
          <div className="px-3.5 pt-3.5">
            <label htmlFor="desktop-store-switcher" className="sr-only">
              স্টোর নির্বাচন করুন
            </label>
            <select
              id="desktop-store-switcher"
              value={selectedStore?.id || ''}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {accessibleStores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => selectTab(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  active
                    ? item.id === 'super_admin'
                      ? 'bg-indigo-50 text-indigo-800 border border-indigo-200/70'
                      : 'bg-teal-50 text-teal-800 border border-teal-200/70'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active
                        ? item.id === 'super_admin'
                          ? 'text-indigo-700'
                          : 'text-teal-700'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {item.unreadDot && (
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-teal-500 ring-2 ring-teal-100"
                      data-testid="changelog-unread-dot"
                      aria-label="নতুন অপঠিত আপডেট"
                    />
                  )}
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 tabular-nums">
                      {item.badge.toLocaleString('bn-BD')}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-1.5">
          {planEvaluation && (
            <div className="flex items-center justify-between text-[11px] gap-2">
              <span className="text-slate-500 truncate">
                {effectivePlan?.plan.name || 'প্ল্যান'}
              </span>
              <span
                className={`font-bold shrink-0 ${
                  inGrace
                    ? 'text-amber-700'
                    : planEvaluation.isActive
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                }`}
              >
                {planEvaluation.labelBn}
              </span>
            </div>
          )}
          <div className="text-xs text-slate-500 truncate font-mono">{user.email}</div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-white border-b border-slate-200/80 px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-base font-bold text-slate-900 truncate">PayVerify BD</span>
        </div>

        <div className="flex items-center gap-2">
          {showStoreSwitcher && (
            <select
              aria-label="স্টোর নির্বাচন করুন"
              value={selectedStore?.id || ''}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="max-w-[130px] px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
            >
              {accessibleStores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="মেনু"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {hasUnreadChangelog && !mobileMenuOpen && (
              <span className="w-2 h-2 rounded-full bg-teal-500 absolute top-1.5 right-1.5" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Slide-down Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-14 z-40 bg-white border-b border-slate-200 shadow-lg p-3 space-y-1 max-h-[80vh] overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                  active ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  {item.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {item.unreadDot && <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />}
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 tabular-nums">
                      {item.badge.toLocaleString('bn-BD')}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:pl-64 min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">
          {/* 3-Day Grace Period Warning Banner (everything still works) */}
          {inGrace && planEvaluation && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950"
              data-testid="grace-warning-banner"
            >
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-bold">
                    প্ল্যানের মেয়াদ শেষ হয়েছে — {planEvaluation.labelBn}
                  </div>
                  <div className="text-xs text-amber-900 mt-0.5">
                    গ্রেস সময়ে আপনার সব পেমেন্ট সচল থাকবে। সংযোগ বিচ্ছিন্ন হওয়া এড়াতে এখনই প্ল্যান নবায়ন করুন।
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectTab('account')}
                className="px-3.5 py-2 rounded-xl bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 shrink-0"
              >
                নবায়ন করুন
              </button>
            </div>
          )}

          {/* Honest Inactive / Trial Expired / Suspended Banner */}
          {planInactive && planEvaluation && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900"
              data-testid="plan-inactive-banner"
            >
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-bold">
                    {planEvaluation.code === 'suspended'
                      ? 'আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে'
                      : 'আপনার প্ল্যানের মেয়াদ শেষ হয়েছে'}
                  </div>
                  <div className="text-xs text-rose-800 mt-0.5">
                    নতুন পেমেন্ট সেশন তৈরি করা বর্তমানে বন্ধ আছে। পুনরায় চালু করতে প্ল্যান নবায়ন করুন অথবা সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।
                  </div>
                </div>
              </div>
              {planEvaluation.code !== 'suspended' && (
                <button
                  type="button"
                  onClick={() => selectTab('account')}
                  className="px-3.5 py-2 rounded-xl bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 shrink-0"
                >
                  নবায়ন করুন
                </button>
              )}
            </div>
          )}

          {/* New Device / Browser Login In-App Notification */}
          {newDeviceLoginAlert && (
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldAlert className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>
                  নতুন ডিভাইস বা ব্রাউজার থেকে আপনার অ্যাকাউন্টে লগইন হয়েছে। বিস্তারিত জানতে{' '}
                  <button
                    type="button"
                    onClick={() => selectTab('account')}
                    className="underline font-bold"
                  >
                    অ্যাকাউন্ট নিরাপত্তা
                  </button>{' '}
                  দেখুন।
                </span>
              </div>
              <button
                type="button"
                onClick={dismissNewDeviceLoginAlert}
                className="p-1 rounded-lg text-indigo-700 hover:bg-indigo-100 shrink-0"
                aria-label="বন্ধ করুন"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Device Rejected Alert Banner (ONLY if server-reported device_rejected exists) */}
          {deviceRejectedAlerts.length > 0 && activeTab !== 'device' && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  একটি অঅনুমোদিত বা বাতিল ফোন থেকে SMS পাঠানোর চেষ্টা প্রত্যাখ্যাত হয়েছে (
                  {deviceRejectedAlerts.length.toLocaleString('bn-BD')}টি সতর্কতা)।
                </span>
              </div>
              <button
                type="button"
                onClick={() => selectTab('device')}
                className="px-3 py-1.5 rounded-lg bg-rose-700 text-white font-semibold hover:bg-rose-800"
              >
                ফোন সংযোগ দেখুন
              </button>
            </div>
          )}

          {activeTab === 'overview' && <OverviewView onNavigate={(t) => selectTab(t)} />}
          {activeTab === 'sessions' && <SessionsView />}
          {activeTab === 'unmatched_sms' && <UnmatchedSmsView />}
          {activeTab === 'sms' && <TransactionsView />}
          {activeTab === 'payment_page' && <PaymentPageSettingsView />}
          {activeTab === 'store_settings' && <StoreSettingsView />}
          {activeTab === 'my_stores' && (
            <MyStoresView
              onOpenStoreSettings={(storeId) => {
                setSelectedStoreId(storeId);
                selectTab('store_settings');
              }}
            />
          )}
          {activeTab === 'device' && <DeviceConnectionView />}
          {activeTab === 'api_docs' && <ApiDocsView />}
          {activeTab === 'changelog' && <ChangelogView />}
          {activeTab === 'account' && (
            <AccountView onOpenPlanComparison={() => setShowInAppPlans(true)} />
          )}
          {activeTab === 'super_admin' && account?.isSuperAdmin && <SuperAdminView />}
        </div>
      </main>
    </div>
  );
};

export default function App() {
  const publicSessionId = useMemo(() => extractPublicSessionId(), []);

  // Public customer payment page (/pay/:sessionId): NEVER reads Firestore, polls Worker only
  if (publicSessionId) {
    return (
      <ErrorBoundary>
        <HostedPaymentPage sessionId={publicSessionId} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <PayVerifyProvider>
        <DashboardShell />
      </PayVerifyProvider>
    </ErrorBoundary>
  );
}
