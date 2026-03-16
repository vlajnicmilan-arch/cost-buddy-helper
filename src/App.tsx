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
import { LockScreen } from "@/components/LockScreen";
import { TutorialOverlay } from "@/components/tutorial";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { OfflineBanner } from "@/components/OfflineBanner";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import Index from "./pages/Index";
import Business from "./pages/Business";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import Budgets from "./pages/Budgets";
import Wallet from "./pages/Wallet";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import StorageSetup from "./pages/StorageSetup";
import Install from "./pages/Install";
import JoinProject from "./pages/JoinProject";
import JoinBudget from "./pages/JoinBudget";
import Family from "./pages/Family";
import JoinFamily from "./pages/JoinFamily";
import Onboarding from "./pages/Onboarding";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { storageMode, isInitialized } = useStorage();
  const { onboardingCompleted } = useAppState();

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!storageMode) {
    return (
      <Routes>
        <Route path="/setup" element={<StorageSetup />} />
        <Route path="/install" element={<Install />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={onboardingCompleted ? <Index /> : <Navigate to="/onboarding" replace />} />
      <Route path="/business" element={<Business />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/projects" element={onboardingCompleted ? <Projects /> : <Navigate to="/onboarding" replace />} />
      <Route path="/budgets" element={onboardingCompleted ? <Budgets /> : <Navigate to="/onboarding" replace />} />
      <Route path="/wallet" element={onboardingCompleted ? <Wallet /> : <Navigate to="/onboarding" replace />} />
      <Route path="/family" element={onboardingCompleted ? <Family /> : <Navigate to="/onboarding" replace />} />
      <Route path="/join-family/:token" element={<JoinFamily />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/setup" element={<StorageSetup />} />
      <Route path="/install" element={<Install />} />
      <Route path="/join-project/:token" element={<JoinProject />} />
      <Route path="/join-budget/:token" element={<JoinBudget />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
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
              <TutorialProvider>
                <OfflineBanner />
                <Toaster />
                <Sonner />
                <PWAUpdatePrompt />
                <TutorialOverlay />
                <LockScreen />
                <BrowserRouter>
                  <BackButtonProvider>
                    <AppRoutes />
                    <CookieConsentBanner />
                  </BackButtonProvider>
                </BrowserRouter>
              </TutorialProvider>
            </CurrencyProvider>
          </AppLockProvider>
        </AppStateProvider>
      </StorageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
