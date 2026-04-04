import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";

const Index = lazy(() => import("./pages/Index"));
const Business = lazy(() => import("./pages/Business"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Projects = lazy(() => import("./pages/Projects"));
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
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import("./pages/Admin"));
const Paywall = lazy(() => import("./pages/Paywall"));
const Landing = lazy(() => import("./pages/Landing"));
const AvatarDemo = lazy(() => import("./pages/AvatarDemo"));

const queryClient = new QueryClient();

const NativeInit = () => {
  useStatusBar();
  return null;
};

const DeepLinkInit = () => {
  useDeepLinks();
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
  return <Landing />;
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
          <Route path="/admin" element={<Admin />} />
          <Route path="/avatar-demo" element={<AvatarDemo />} />
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
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="*" element={<Navigate to="/paywall" replace />} />
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
          <Route path="/admin" element={<Admin />} />
          <Route path="/avatar-demo" element={<AvatarDemo />} />
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
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/app" element={<Navigate to={appEntryRoute!} replace />} />
        <Route path="/home" element={requireOnboarding(<Index />)} />
        <Route path="/business" element={<Business />} />
        <Route path="/onboarding" element={onboardingCompleted ? <Navigate to="/home" replace /> : <Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={requireOnboarding(<Projects />)} />
        <Route path="/budgets" element={requireOnboarding(<Budgets />)} />
        <Route path="/wallet" element={requireOnboarding(<Wallet />)} />
        <Route path="/family" element={requireOnboarding(<Family />)} />
        <Route path="/join-family/:token" element={<JoinFamily />} />
        <Route path="/auth" element={user ? <Navigate to="/home" replace /> : <Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/setup" element={<StorageSetup />} />
        <Route path="/install" element={<Install />} />
        <Route path="/join-project/:token" element={<JoinProject />} />
        <Route path="/join-budget/:token" element={<JoinBudget />} />
        <Route path="/paywall" element={<Paywall />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/avatar-demo" element={<AvatarDemo />} />
        <Route path="/landing" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
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
                  <OfflineBanner />
                  <Toaster />
                  <Sonner />
                  <PWAUpdatePrompt />
                  <TutorialOverlay />
                  <LockScreen />
                  <BrowserRouter>
                    <BackButtonProvider>
                      <DeepLinkInit />
                      <AppRoutes />
                      <CookieConsentBanner />
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
