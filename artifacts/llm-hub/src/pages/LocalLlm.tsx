import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Server, Cpu, Activity, Download, Play, 
  TerminalSquare, Send, ChevronDown, ChevronUp, CheckCircle2,
  Package, Trash2, Plus, Loader2, HardDrive
} from "lucide-react";
import { 
  useGetLlmStatus, 
  useGetLlmConfig, 
  useSaveLlmConfig, 
  useGetSetupScript,
  useSendChatMessage,
  useListModels,
  usePullModel,
  useDeleteModel,
  useListRunningModels
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const configSchema = z.object({
  serverUrl: z.string().min(1, "Required"),
  port: z.coerce.number().min(1).max(65535),
  gpuEnabled: z.boolean(),
  defaultModel: z.string().min(1, "Required"),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function LocalLlm() {
  const queryClient = useQueryClient();
  const { data: status, isLoading: statusLoading } = useGetLlmStatus({ 
    query: { refetchInterval: 15000 } 
  });
  const { data: config, isLoading: configLoading } = useGetLlmConfig();
  const saveConfig = useSaveLlmConfig();
  const { refetch: fetchScript } = useGetSetupScript({ query: { enabled: false } });
  const { data: models = [], isLoading: modelsLoading } = useListModels({
    query: { refetchInterval: 30000 }
  });
  const { data: runningModels = [] } = useListRunningModels({
    query: { refetchInterval: 15000 }
  });
  const pullModel = usePullModel();
  const deleteModel = useDeleteModel();

  const [showGuide, setShowGuide] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pullModelName, setPullModelName] = useState("");
  const [showPullInput, setShowPullInput] = useState(false);

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      serverUrl: "http://localhost:11434",
      port: 11434,
      gpuEnabled: false,
      defaultModel: "llama3",
    }
  });

  useEffect(() => {
    if (config) {
      form.reset({
        serverUrl: config.serverUrl,
        port: config.port,
        gpuEnabled: config.gpuEnabled,
        defaultModel: config.defaultModel,
      });
    }
  }, [config, form]);

  const onSubmit = (data: ConfigFormValues) => {
    saveConfig.mutate({ data }, {
      onSuccess: () => {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    });
  };

  const handleDownloadScript = async () => {
    try {
      const res = await fetchScript();
      if (res.data) {
        const blob = new Blob([res.data], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'setup-ollama.sh';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Failed to download script", e);
    }
  };

  const handlePullModel = () => {
    if (!pullModelName.trim()) return;
    pullModel.mutate({ data: { name: pullModelName.trim() } }, {
      onSuccess: () => {
        setPullModelName("");
        setShowPullInput(false);
        queryClient.invalidateQueries({ queryKey: ["/api/llm/models"] });
      }
    });
  };

  const handleDeleteModel = (name: string) => {
    deleteModel.mutate({ name }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/llm/models"] });
      }
    });
  };

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Ollama Control Center</h2>
            <p className="text-muted-foreground max-w-2xl">
              Monitor and configure your self-hosted Ollama instance. Run multiple models on your VPS with full control.
            </p>
          </div>
          <Button onClick={handleDownloadScript} className="gap-2 shrink-0 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white shadow-lg shadow-primary/20">
            <Download className="w-4 h-4" />
            Download Setup Script
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <StatusCard 
            icon={<Activity className="text-primary w-5 h-5" />}
            title="Server Health"
            value={statusLoading ? "Checking..." : (status?.online ? "Online" : "Offline")}
            subvalue={status?.version ? `v${status.version}` : "Check configuration"}
            status={status?.online ? "good" : "bad"}
          />
          <StatusCard 
            icon={<Package className="text-purple-400 w-5 h-5" />}
            title="Available Models"
            value={status?.online ? `${status?.modelsCount ?? 0}` : "-"}
            subvalue="Installed on server"
            status={status?.modelsCount ? "good" : "neutral"}
          />
          <StatusCard 
            icon={<Cpu className="text-blue-400 w-5 h-5" />}
            title="Running Models"
            value={status?.online ? `${status?.runningModels?.length ?? 0}` : "-"}
            subvalue={status?.runningModels?.length ? status.runningModels[0] : "None loaded"}
            status={status?.runningModels?.length ? "good" : "neutral"}
          />
          <StatusCard 
            icon={<HardDrive className="text-emerald-400 w-5 h-5" />}
            title="Default Model"
            value={config?.defaultModel ?? "-"}
            subvalue="Used for new chats"
            status={config?.defaultModel ? "good" : "neutral"}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card/50 backdrop-blur-sm border border-white/10 rounded-2xl p-6 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent" />
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-primary" /> Server Configuration
              </h3>

              {configLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Server URL</label>
                      <Input {...form.register("serverUrl")} placeholder="http://72.60.167.64:11434" />
                      {form.formState.errors.serverUrl && <p className="text-xs text-red-400">{form.formState.errors.serverUrl.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Port</label>
                      <Input type="number" {...form.register("port")} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Default Model</label>
                      <Input {...form.register("defaultModel")} placeholder="llama3" />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                    <input 
                      type="checkbox" 
                      {...form.register("gpuEnabled")}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">GPU Acceleration</p>
                      <p className="text-xs text-muted-foreground">Enable NVIDIA GPU support for faster inference</p>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-between border-t border-white/5">
                    <p className="text-xs text-muted-foreground">Settings configure the setup script & API connection.</p>
                    <Button type="submit" disabled={saveConfig.isPending} className="min-w-[120px]">
                      {saveConfig.isPending ? "Saving..." : saveSuccess ? (
                        <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Saved</span>
                      ) : "Save Config"}
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card/50 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Package className="w-5 h-5 text-purple-400" /> Installed Models
                </h3>
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPullInput(!showPullInput)}
                  className="gap-1 text-xs border-white/10"
                >
                  <Plus className="w-3.5 h-3.5" /> Pull Model
                </Button>
              </div>

              {showPullInput && (
                <div className="px-5 pt-4 flex gap-2">
                  <Input 
                    value={pullModelName}
                    onChange={(e) => setPullModelName(e.target.value)}
                    placeholder="e.g. llama3, mistral, deepseek-coder"
                    className="flex-1 bg-black/40 border-white/10"
                    onKeyDown={(e) => { if (e.key === 'Enter') handlePullModel(); }}
                  />
                  <Button 
                    onClick={handlePullModel}
                    disabled={!pullModelName.trim() || pullModel.isPending}
                    size="sm"
                  >
                    {pullModel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pull"}
                  </Button>
                </div>
              )}

              {pullModel.isPending && (
                <div className="px-5 pt-3">
                  <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 rounded-lg px-3 py-2 border border-primary/20">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Pulling {pullModelName}... This may take several minutes.
                  </div>
                </div>
              )}

              <div className="p-5">
                {modelsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : !status?.online ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Connect to Ollama to see models</p>
                  </div>
                ) : models.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No models installed. Pull one to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {models.map((model) => {
                      const isRunning = runningModels.some(r => r.name === model.name);
                      return (
                        <div key={model.digest} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              isRunning ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-gray-600"
                            )} />
                            <div className="overflow-hidden">
                              <p className="text-sm font-medium text-white truncate">{model.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatBytes(model.size)}
                                {model.parameterSize && ` · ${model.parameterSize}`}
                                {model.quantizationLevel && ` · ${model.quantizationLevel}`}
                                {model.family && ` · ${model.family}`}
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDeleteModel(model.name)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-all shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          <div className="space-y-8 flex flex-col">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card/50 backdrop-blur-sm border border-white/10 rounded-2xl p-1"
            >
              <button 
                onClick={() => setShowGuide(!showGuide)}
                className="w-full flex items-center justify-between p-5 text-left rounded-xl hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <TerminalSquare className="w-5 h-5 text-purple-400" />
                  <h3 className="text-xl font-semibold">Quick Setup Guide</h3>
                </div>
                {showGuide ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
              </button>

              {showGuide && (
                <div className="px-6 pb-6 pt-2 space-y-4 text-sm text-muted-foreground">
                  <p className="text-white font-medium">SSH into your VPS and run these commands:</p>
                  
                  <div className="space-y-3">
                    <p>1. Install Docker:</p>
                    <div className="bg-black/60 p-3 rounded-lg font-mono text-xs border border-white/5 text-green-400">
                      sudo apt update && sudo apt install docker.io docker-compose -y<br/>
                      sudo systemctl enable docker
                    </div>
                    
                    <p>2. Start Ollama container:</p>
                    <div className="bg-black/60 p-3 rounded-lg font-mono text-xs border border-white/5 text-green-400">
                      docker run -d \<br/>
                      &nbsp;&nbsp;--name ollama \<br/>
                      &nbsp;&nbsp;-p 11434:11434 \<br/>
                      &nbsp;&nbsp;-v ollama:/root/.ollama \<br/>
                      &nbsp;&nbsp;ollama/ollama
                    </div>

                    <p>3. Pull your first model:</p>
                    <div className="bg-black/60 p-3 rounded-lg font-mono text-xs border border-white/5 text-green-400">
                      docker exec -it ollama ollama pull llama3
                    </div>

                    <p>4. (Optional) Install OpenWebUI for a ChatGPT-style interface:</p>
                    <div className="bg-black/60 p-3 rounded-lg font-mono text-xs border border-white/5 text-green-400">
                      docker run -d \<br/>
                      &nbsp;&nbsp;-p 3000:8080 \<br/>
                      &nbsp;&nbsp;--name openwebui \<br/>
                      &nbsp;&nbsp;-v open-webui:/app/backend/data \<br/>
                      &nbsp;&nbsp;ghcr.io/open-webui/open-webui:main
                    </div>

                    <p>5. Open port in firewall:</p>
                    <div className="bg-black/60 p-3 rounded-lg font-mono text-xs border border-white/5 text-green-400">
                      sudo ufw allow 11434<br/>
                      sudo ufw allow 3000
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs">
                      Or just download the setup script above — it automates all of this including GPU detection.
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card/50 backdrop-blur-sm border border-white/10 rounded-2xl flex-1 flex flex-col min-h-[400px] overflow-hidden relative"
            >
              <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Play className="w-4 h-4 text-primary" fill="currentColor" /> Local Sandbox
                </h3>
                <span className={cn(
                  "text-xs px-2 py-1 rounded-md border",
                  status?.online 
                    ? "bg-green-500/10 text-green-400 border-green-500/20" 
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                )}>
                  {status?.online ? "Connected" : "Offline"}
                </span>
              </div>

              {!status?.online ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                  <Server className="w-12 h-12 mb-4 opacity-20" />
                  <p className="font-medium text-white/50 mb-1">Server not reachable</p>
                  <p className="text-sm">Start your Ollama server to test models here.</p>
                </div>
              ) : (
                <LocalChatTester defaultModel={config?.defaultModel ?? "llama3"} models={models} />
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ icon, title, value, subvalue, status }: { icon: React.ReactNode; title: string; value: string; subvalue: string; status: string }) {
  return (
    <div className="bg-card/50 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-card/70 transition-colors group">
      <div className="flex justify-between items-start mb-3">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors border border-white/5">
          {icon}
        </div>
        <div className={cn(
          "w-2 h-2 rounded-full",
          status === 'good' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
          status === 'warning' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]' :
          status === 'bad' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
          'bg-gray-500'
        )} />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
        <p className="text-xl font-bold text-white mb-0.5 truncate" title={value}>{value}</p>
        <p className="text-xs text-muted-foreground/80 truncate">{subvalue}</p>
      </div>
    </div>
  );
}

function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function LocalChatTester({ defaultModel, models }: { defaultModel: string; models: Array<{ name: string }> }) {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: 'Hello! I am your local Ollama model. Ask me anything — all processing stays on your server.' }
  ]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const sendMessage = useSendChatMessage();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || sendMessage.isPending) return;

    const newMsgs = [...messages, { role: 'user', content: input }];
    setMessages(newMsgs);
    setInput("");

    sendMessage.mutate({
      data: {
        model: selectedModel,
        messages: newMsgs,
        temperature: 0.7
      }
    }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      },
      onError: () => {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get response from Ollama server.' }]);
      }
    });
  };

  return (
    <div className="flex flex-col h-full w-full">
      {models.length > 1 && (
        <div className="px-4 pt-3">
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
          >
            {models.map(m => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={cn(
            "flex w-full",
            m.role === 'user' ? "justify-end" : "justify-start"
          )}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
              m.role === 'user' 
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 rounded-br-none" 
                : "bg-white/10 text-foreground rounded-bl-none border border-white/5"
            )}>
              {m.content}
            </div>
          </div>
        ))}
        {sendMessage.isPending && (
          <div className="flex w-full justify-start">
            <div className="bg-white/5 border border-white/5 text-foreground rounded-2xl rounded-bl-none px-4 py-3 flex gap-1 items-center">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{animationDelay: '75ms'}} />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{animationDelay: '150ms'}} />
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-white/5 bg-black/20">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <Input 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-black/40 border-white/10"
            disabled={sendMessage.isPending}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || sendMessage.isPending} className="shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
