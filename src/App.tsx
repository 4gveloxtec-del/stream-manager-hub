import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { PrivacyModeProvider } from "@/hooks/usePrivacyMode";
import { MenuStyleProvider } from "@/hooks/useMenuStyle";
import { AppLayout } from "@/components/layout/AppLayout";
import { ExpirationNotificationProvider } from "@/components/ExpirationNotificationProvider";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Servers from "./pages/Servers";
import Panels from "./pages/Panels";
import Plans from "./pages/Plans";
import Bills from "./pages/Bills";
import Coupons from "./pages/Coupons";
import Referrals from "./pages/Referrals";
import Templates from "./pages/Templates";
import Sellers from "./pages/Sellers";
import Reports from "./pages/Reports";
import Backup from "./pages/Backup";
import Settings from "./pages/Settings";
import ExternalApps from "./pages/ExternalApps";
import ServerIcons from "./pages/ServerIcons";
import PanelResellers from "./pages/PanelResellers";
import AdminServerTemplates from "./pages/AdminServerTemplates";

import MessageHistory from "./pages/MessageHistory";
import Tutorials from "./pages/Tutorials";
import ForcePasswordUpdate from "./pages/ForcePasswordUpdate";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Wrapper to check if user needs password update
function PasswordUpdateGuard({ children }: { children: React.ReactNode }) {
  const { user, needsPasswordUpdate, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary text-xl">Carregando...</div>
      </div>
    );
  }
  
  if (user && needsPasswordUpdate) {
    return <ForcePasswordUpdate />;
  }
  
  return <>{children}</>;
}

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/force-password-update" element={<ForcePasswordUpdate />} />
        {/* Redirect old shared-panels route to servers */}
        <Route path="/shared-panels" element={<Navigate to="/servers" replace />} />
        <Route element={
          <PasswordUpdateGuard>
            <AppLayout />
          </PasswordUpdateGuard>
        }>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/panel-resellers" element={<PanelResellers />} />
          <Route path="/panels" element={<Panels />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/templates" element={<Templates />} />
          
          <Route path="/message-history" element={<MessageHistory />} />
          <Route path="/sellers" element={<Sellers />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/backup" element={<Backup />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/tutorials" element={<Tutorials />} />
          <Route path="/external-apps" element={<ExternalApps />} />
          <Route path="/server-icons" element={<ServerIcons />} />
          <Route path="/server-templates" element={<AdminServerTemplates />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <PrivacyModeProvider>
          <MenuStyleProvider>
            <ExpirationNotificationProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <AppRoutes />
              </TooltipProvider>
            </ExpirationNotificationProvider>
          </MenuStyleProvider>
        </PrivacyModeProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
