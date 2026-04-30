import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { StorageProvider, useStorage } from "@/contexts/StorageContext";
import { BackButtonProvider } from "@/contexts/BackButtonContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { TutorialProvider } from "@/contexts/TutorialContext";
import { AppStateProvider, useAppState } from "@/contexts/AppStateContext";
import { AppLockProvider } from "@/contexts/AppLockContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { LockScreen } from "@/components/LockScreen";
import { TutorialOverlay } from "@/components/tutorial";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useStatusBar } from "@/hooks/useStatusBar";
import { useDeepLinks } from "@/hooks/useDeepLinks";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { DiagnosticRouteTracker } from "@/components/DiagnosticRouteTracker";
import { ScrollToTop } from "@/components/ScrollToTop";
import { isPublicRoute } from "@/lib/publicRoutes";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import StatusFeedback from "@/components/StatusFeedback";
import { useAuth } from "@/hooks/useAuth";
import { HomeSkeleton, DashboardSkeleton, WalletSkeleton, GenericPageSkeleton } from "@/components/skeletons";
import { BusinessModeGuard } from "@/components/guards/BusinessModeGuard";
import { autoRegisterIfEnabled } from "@/lib/nativePush";

const Index = lazy(() => import("./pages/Index"));
const Business = lazy(() => import("./pages/Business"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Projects = lazy(() => import("./pages/Projects"));
const CalendarPage = lazy(() => import("./pages/Calendar"));
const Budgets = lazy(() => import("./pages/Budgets"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const StorageSetup = lazy(() => import("./pages/StorageSetup"));
const Install = lazy(() => import("./pages/Install"));
const JoinProject = lazy(() => import("./pages/JoinProject"));
const JoinBudget = lazy(() => import("./pages/JoinBudget"));
const Family = lazy(() => import("./pages/Family"));
const JoinFamily = lazy(() => import("./pages/JoinFamily"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Impressum = lazy(() => import("./pages/Impressum"));
const Help = lazy(() => import("./pages/Help"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import("./pages/Admin"));
const Paywall = lazy(() => import("./pages/Paywall"));
const AvatarDemo = lazy(() => import("./pages/AvatarDemo"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const PublicProject = lazy(() => import("./pages/PublicProject"));
const Landing = lazy(() => import("./pages/Landing"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes (garbage collect unused cache)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const NativeInit = () => {
  useStatusBar();
  return null;
};

const DeepLinkInit = () => {
  useDeepLinks();
  return null;
};

const PushAutoRegister = () => {
  const { user, authReady } = useAuth();
  useEffect(() => {
    if (authReady && user) {
      autoRegisterIfEnabled();
    }
  }, [authReady, user?.id]);
  return null;
};

const PageLoader = () => (
  <div className="min-h-dvh bg-background flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const isInstalledApp = () => {
  if (typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.()) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((navigator as any).standalone === true) return true;
  return false;
};

const RootRoute = () => {
  if (isInstalledApp()) {
    return <Navigate to="/app" replace />;
  }
  return <Suspense fallback={<PageLoader />}><Landing /></Suspense>;
};

const RouteAwareGlobalOverlays = () => {
  const location = useLocation();
  if (isPublicRoute(location.pathname)) {
    if (import.meta.env.DEV) {
      console.log('[Overlays] suppressed on public route:', location.pathname);
    }
    return null;
  }

  return (
    <>
      <OfflineBanner />
      <StatusFeedback />
      <PWAUpdatePrompt />
      <TutorialOverlay />
      <LockScreen />
      <CookieConsentBanner />
    </>
  );
};

const AppRoutes = () => {
  const { storageMode, isInitialized } = useStorage();
  const { onboardingCompleted, appStateReady } = useAppState();
  const { trialExpired, subscribed, loading: subLoading } = useSubscription();
  const { user, authReady } = useAuth();

  // Wait for all readiness signals before making routing decisions
  const allReady = isInitialized && authReady && appStateReady;

  // Determine where /app should redirect
  const getAppEntryRoute = () => {
    if (!allReady) return null;
    if (!storageMode) return "/setup";
    if (storageMode === 'local') return onboardingCompleted ? "/home" : "/onboarding";
    // cloud mode
    if (!user) return "/auth";
    return onboardingCompleted ? "/home" : "/onboarding";
  };

  const appEntryRoute = getAppEntryRoute();

  // Phase 1: Wait for initialization
  if (!isInitialized) {
    return <PageLoader />;
  }

  // No storage mode selected yet — show setup and public routes
  if (!storageMode) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/app" element={allReady ? <Navigate to={appEntryRoute!} replace /> : <PageLoader />} />
          <Route path="/setup" element={<StorageSetup />} />
          <Route path="/install" element={<Install />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/impressum" element={<Impressum />} />
          <Route path="/help" element={<Help />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/avatar-demo" element={<AvatarDemo />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/p/:token" element={<PublicProject />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Phase 2: Storage mode is set but auth/appState not ready yet — show loader
  if (!allReady) {
    return <PageLoader />;
  }

  // Phase 3: Trial expired paywall
  if (storageMode === "cloud" && !subLoading && trialExpired && !subscribed) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/paywall" element={<Paywall />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/avatar-demo" element={<AvatarDemo />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
           <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/impressum" element={<Impressum />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </Suspense>
    );
  }

  // Phase 4: Cloud mode — redirect unauthenticated users to /auth
  if (storageMode === 'cloud' && !user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/app" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/setup" element={<StorageSetup />} />
          <Route path="/install" element={<Install />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/impressum" element={<Impressum />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/avatar-demo" element={<AvatarDemo />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/p/:token" element={<PublicProject />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Phase 5: Fully authenticated (or local mode) — main app routes
  const requireOnboarding = (element: React.ReactNode) =>
    onboardingCompleted ? element : <Navigate to="/onboarding" replace />;

  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/app" element={<Navigate to={appEntryRoute!} replace />} />
      <Route path="/home" element={<Suspense fallback={<HomeSkeleton />}>{requireOnboarding(<Index />)}</Suspense>} />
      <Route path="/business" element={<Suspense fallback={<HomeSkeleton />}><Business /></Suspense>} />
      <Route path="/onboarding" element={<Suspense fallback={<PageLoader />}>{onboardingCompleted ? <Navigate to="/home" replace /> : <Onboarding />}</Suspense>} />
      <Route path="/dashboard" element={<Suspense fallback={<DashboardSkeleton />}><Dashboard /></Suspense>} />
      <Route path="/projects" element={<Suspense fallback={<GenericPageSkeleton />}>{requireOnboarding(<Projects />)}</Suspense>} />
      <Route path="/calendar" element={<Suspense fallback={<GenericPageSkeleton />}>{requireOnboarding(<CalendarPage />)}</Suspense>} />
      <Route path="/budgets" element={<Suspense fallback={<GenericPageSkeleton />}>{requireOnboarding(<Budgets />)}</Suspense>} />
      <Route path="/wallet" element={<Suspense fallback={<WalletSkeleton />}>{requireOnboarding(<Wallet />)}</Suspense>} />
      <Route path="/family" element={<Suspense fallback={<GenericPageSkeleton />}>{requireOnboarding(<Family />)}</Suspense>} />
      <Route path="/join-family/:token" element={<Suspense fallback={<PageLoader />}><JoinFamily /></Suspense>} />
      <Route path="/auth" element={<Suspense fallback={<PageLoader />}>{user ? <Navigate to="/home" replace /> : <Auth />}</Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
      <Route path="/setup" element={<Suspense fallback={<PageLoader />}><StorageSetup /></Suspense>} />
      <Route path="/install" element={<Suspense fallback={<PageLoader />}><Install /></Suspense>} />
      <Route path="/join-project/:token" element={<Suspense fallback={<PageLoader />}><JoinProject /></Suspense>} />
      <Route path="/join-budget/:token" element={<Suspense fallback={<PageLoader />}><JoinBudget /></Suspense>} />
      <Route path="/paywall" element={<Suspense fallback={<PageLoader />}><Paywall /></Suspense>} />
      <Route path="/privacy-policy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />
      <Route path="/terms-of-service" element={<Suspense fallback={<PageLoader />}><TermsOfService /></Suspense>} />
      <Route path="/impressum" element={<Suspense fallback={<PageLoader />}><Impressum /></Suspense>} />
      <Route path="/admin" element={<Suspense fallback={<PageLoader />}><Admin /></Suspense>} />
      <Route path="/avatar-demo" element={<Suspense fallback={<PageLoader />}><AvatarDemo /></Suspense>} />
      <Route path="/landing" element={<Navigate to="/" replace />} />
      <Route path="/unsubscribe" element={<Suspense fallback={<PageLoader />}><Unsubscribe /></Suspense>} />
      <Route path="/p/:token" element={<Suspense fallback={<PageLoader />}><PublicProject /></Suspense>} />
      <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <StorageProvider>
        <AppStateProvider>
          <AppLockProvider>
            <CurrencyProvider>
              <SubscriptionProvider>
                <TutorialProvider>
                  <NativeInit />
                  <Toaster />
                  <Sonner />
                  <BrowserRouter>
                    <BackButtonProvider>
                      <ScrollToTop />
                      <DeepLinkInit />
                      <PushAutoRegister />
                      <DiagnosticRouteTracker />
                      <BusinessModeGuard />
                      <RouteAwareGlobalOverlays />
                      <AppRoutes />
                    </BackButtonProvider>
                  </BrowserRouter>
                </TutorialProvider>
              </SubscriptionProvider>
            </CurrencyProvider>
          </AppLockProvider>
        </AppStateProvider>
      </StorageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
