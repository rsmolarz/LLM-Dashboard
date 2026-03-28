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
import Admin from "@/pages/Admin";
import Clinical from "@/pages/Clinical";
import Social from "@/pages/Social";
import Finance from "@/pages/Finance";
import DataAgent from "@/pages/DataAgent";
import VoiceAgent from "@/pages/VoiceAgent";
import Databases from "@/pages/Databases";
import PubMedCollector from "@/pages/PubMedCollector";
import TrainingPipeline from "@/pages/TrainingPipeline";
import ResearchPipeline from "@/pages/ResearchPipeline";
import PlatformApi from "@/pages/PlatformApi";
import RagKnowledgeBase from "@/pages/RagKnowledgeBase";
import Evaluation from "@/pages/Evaluation";
import AgentFlow from "@/pages/AgentFlow";
import Prompts from "@/pages/Prompts";
import ModelCompare from "@/pages/ModelCompare";
import Reports from "@/pages/Reports";
import Playground from "@/pages/Playground";
import Memory from "@/pages/Memory";
import Costs from "@/pages/Costs";
import Team from "@/pages/Team";
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
        <Route path="/admin" component={Admin} />
        <Route path="/clinical" component={Clinical} />
        <Route path="/social" component={Social} />
        <Route path="/finance" component={Finance} />
        <Route path="/data-agent" component={DataAgent} />
        <Route path="/voice-agent" component={VoiceAgent} />
        <Route path="/databases" component={Databases} />
        <Route path="/pubmed" component={PubMedCollector} />
        <Route path="/pipeline" component={TrainingPipeline} />
        <Route path="/research-pipeline" component={ResearchPipeline} />
        <Route path="/platform-api" component={PlatformApi} />
        <Route path="/rag" component={RagKnowledgeBase} />
        <Route path="/evaluation" component={Evaluation} />
        <Route path="/agentflow" component={AgentFlow} />
        <Route path="/prompts" component={Prompts} />
        <Route path="/compare" component={ModelCompare} />
        <Route path="/reports" component={Reports} />
        <Route path="/playground" component={Playground} />
        <Route path="/memory" component={Memory} />
        <Route path="/costs" component={Costs} />
        <Route path="/team" component={Team} />
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
