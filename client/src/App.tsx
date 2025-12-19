import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import CallPage from "@/pages/call";
import ProfilePage from "@/pages/profile";
import InvitePage from "@/pages/invite";
import LandingPage from "@/pages/landing";
import PricingPage from "@/pages/pricing";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/app" component={CallPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/invite/:code" component={InvitePage} />
      <Route path="/u/:handle" component={ProfilePage} />
      <Route path="/pay/:tokenId" component={CallPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SonnerToaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
