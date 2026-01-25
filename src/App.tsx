import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StorageProvider, useStorage } from "@/contexts/StorageContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import StorageSetup from "./pages/StorageSetup";
import Install from "./pages/Install";
import JoinCircle from "./pages/JoinCircle";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { storageMode, isInitialized } = useStorage();

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
        <Route path="/join/:token" element={<JoinCircle />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  // Check if onboarding is completed
  const onboardingCompleted = localStorage.getItem('onboarding_completed') === 'true';

  return (
    <Routes>
      <Route path="/" element={onboardingCompleted ? <Index /> : <Navigate to="/onboarding" replace />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/setup" element={<StorageSetup />} />
      <Route path="/install" element={<Install />} />
      <Route path="/join/:token" element={<JoinCircle />} />
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
          <Toaster />
          <Sonner />
          <PWAUpdatePrompt />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </CurrencyProvider>
      </StorageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
