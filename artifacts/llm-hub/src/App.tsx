import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import LocalLlm from "@/pages/LocalLlm";
import Chat from "@/pages/Chat";
import Training from "@/pages/Training";
import Research from "@/pages/Research";
import Vision from "@/pages/Vision";
import Agents from "@/pages/Agents";
import Monitor from "@/pages/Monitor";
import Analytics from "@/pages/Analytics";
import Automations from "@/pages/Automations";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={LocalLlm} />
        <Route path="/chat" component={Chat} />
        <Route path="/training" component={Training} />
        <Route path="/research" component={Research} />
        <Route path="/vision" component={Vision} />
        <Route path="/agents" component={Agents} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/automations" component={Automations} />
        <Route path="/monitor" component={Monitor} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
