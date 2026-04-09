import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useAuth } from "@workspace/replit-auth-web";
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
import Compliance from "@/pages/Compliance";
import BrowserExtension from "@/pages/BrowserExtension";
import CodeTerminal from "@/pages/CodeTerminal";
import ChatImport from "@/pages/ChatImport";
import LlmManager from "@/pages/LlmManager";
import ClawAgent from "@/pages/ClawAgent";
import CreateLlm from "@/pages/CreateLlm";
import Workbench from "@/pages/Workbench";
import ClaudeWorkbench from "@/pages/ClaudeWorkbench";
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
        <Route path="/compliance" component={Compliance} />
        <Route path="/extension" component={BrowserExtension} />
        <Route path="/code" component={CodeTerminal} />
        <Route path="/chat-import" component={ChatImport} />
        <Route path="/llm-manager" component={LlmManager} />
        <Route path="/claw-agent" component={ClawAgent} />
        <Route path="/create-llm" component={CreateLlm} />
        <Route path="/workbench" component={Workbench} />
        <Route path="/claude-workbench" component={ClaudeWorkbench} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function SessionTimeoutOverlay() {
  const { user } = useAuth();
  const { showWarning, remainingSeconds, extendSession } =
    useSessionTimeout(!!user);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4 shadow-2xl">
        <h2 className="text-lg font-bold text-amber-400 mb-2">
          Session Expiring
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Your session will expire in{" "}
          <span className="font-bold text-foreground">{remainingSeconds}</span>{" "}
          seconds due to inactivity. This is required for HIPAA compliance.
        </p>
        <button
          onClick={extendSession}
          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
        >
          Continue Session
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
          <SessionTimeoutOverlay />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
