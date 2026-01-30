import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { StorageProvider, useStorage } from "@/contexts/StorageContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { TutorialProvider } from "@/contexts/TutorialContext";
import { TutorialOverlay } from "@/components/tutorial";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import StorageSetup from "./pages/StorageSetup";
import Install from "./pages/Install";

import JoinProject from "./pages/JoinProject";
import JoinBudget from "./pages/JoinBudget";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { storageMode, isInitialized } = useStorage();
  const location = useLocation();
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => 
    localStorage.getItem('onboarding_completed') === 'true'
  );

  // Re-check onboarding status when location changes or custom event fires
  useEffect(() => {
    const checkCompleted = () => {
      const completed = localStorage.getItem('onboarding_completed') === 'true';
      setOnboardingCompleted(completed);
    };
    
    checkCompleted();
    
    // Listen for custom event from onboarding
    const handleOnboardingComplete = () => {
      setOnboardingCompleted(true);
    };
    
    window.addEventListener('onboardingComplete', handleOnboardingComplete);
    
    return () => {
      window.removeEventListener('onboardingComplete', handleOnboardingComplete);
    };
  }, [location]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no storage mode selected, show setup (but allow join route for invitations)
  if (!storageMode) {
    return (
      <Routes>
        <Route path="/setup" element={<StorageSetup />} />
        <Route path="/install" element={<Install />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={onboardingCompleted ? <Index /> : <Navigate to="/onboarding" replace />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/setup" element={<StorageSetup />} />
      <Route path="/install" element={<Install />} />
      
      <Route path="/join-project/:token" element={<JoinProject />} />
      <Route path="/join-budget/:token" element={<JoinBudget />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <StorageProvider>
        <CurrencyProvider>
          <TutorialProvider>
            <Toaster />
            <Sonner />
            <PWAUpdatePrompt />
            <TutorialOverlay />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TutorialProvider>
        </CurrencyProvider>
      </StorageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
