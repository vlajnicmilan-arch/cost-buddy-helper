import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StorageProvider, useStorage } from "@/contexts/StorageContext";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import StorageSetup from "./pages/StorageSetup";
import Install from "./pages/Install";
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

  // If no storage mode selected, show setup
  if (!storageMode) {
    return (
      <Routes>
        <Route path="/setup" element={<StorageSetup />} />
        <Route path="/install" element={<Install />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/setup" element={<StorageSetup />} />
      <Route path="/install" element={<Install />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <StorageProvider>
        <Toaster />
        <Sonner />
        <PWAUpdatePrompt />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </StorageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
