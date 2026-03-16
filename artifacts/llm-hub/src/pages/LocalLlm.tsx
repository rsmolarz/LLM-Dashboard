import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Server, Cpu, Activity, HardDrive, Download, Play, 
  TerminalSquare, Send, ChevronDown, ChevronUp, CheckCircle2
} from "lucide-react";
import { 
  useGetLlmStatus, 
  useGetLlmConfig, 
  useSaveLlmConfig, 
  useGetSetupScript,
  useSendChatMessage
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// --- Form Schema ---
const configSchema = z.object({
  serverUrl: z.string().url({ message: "Must be a valid URL" }),
  port: z.coerce.number().min(1).max(65535),
  cpuThreads: z.coerce.number().min(1),
  contextSize: z.coerce.number().min(512),
  gpuLayers: z.coerce.number().min(0),
  containerName: z.string().min(1),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function LocalLlm() {
  // Queries
  const { data: status, isLoading: statusLoading } = useGetLlmStatus({ 
    query: { refetchInterval: 15000 } 
  });
  const { data: config, isLoading: configLoading } = useGetLlmConfig();
  const saveConfig = useSaveLlmConfig();
  const { refetch: fetchScript } = useGetSetupScript({ query: { enabled: false } });

  // State
  const [showGuide, setShowGuide] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form Setup
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      serverUrl: "http://localhost",
      port: 8080,
      cpuThreads: 4,
      contextSize: 4096,
      gpuLayers: 0,
      containerName: "llama-cpp-server",
    }
  });

  // Update form when config loads
  useEffect(() => {
    if (config) {
      form.reset({
        serverUrl: config.serverUrl,
        port: config.port,
        cpuThreads: config.cpuThreads,
        contextSize: config.contextSize,
        gpuLayers: config.gpuLayers,
        containerName: config.containerName,
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
        a.download = 'setup-llama.sh';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Failed to download script", e);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-white mb-2">Local Inference Hub</h2>
            <p className="text-muted-foreground max-w-2xl">
              Monitor and configure your self-hosted llama.cpp instance. All processing stays on your private server.
            </p>
          </div>
          <Button variant="glow" onClick={handleDownloadScript} className="gap-2 shrink-0">
            <Download className="w-4 h-4" />
            Download Setup Script
          </Button>
        </div>

        {/* Status Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatusCard 
            icon={<Activity className="text-primary w-6 h-6" />}
            title="Server Health"
            value={statusLoading ? "Checking..." : (status?.online ? "Online & Ready" : "Offline")}
            subvalue={status?.serverHealth || "Check configuration"}
            status={status?.online ? "good" : "bad"}
          />
          <StatusCard 
            icon={<Server className="text-accent w-6 h-6" />}
            title="Loaded Model"
            value={status?.modelLoaded || "None Loaded"}
            subvalue={status?.online ? "Ready for inference" : "Server not reachable"}
            status={status?.modelLoaded ? "good" : "neutral"}
          />
          <StatusCard 
            icon={<Cpu className="text-blue-400 w-6 h-6" />}
            title="Inference Slots"
            value={status?.online ? `${status?.slotsUsed || 0} / ${status?.slotsTotal || 0}` : "-"}
            subvalue="Active concurrent requests"
            status={(status?.slotsUsed || 0) < (status?.slotsTotal || 1) ? "good" : "warning"}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-6 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent" />
            <h3 className="text-xl font-display font-semibold mb-6 flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Server Configuration
            </h3>

            {configLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Server URL</label>
                    <Input {...form.register("serverUrl")} placeholder="http://72.60.167.64" />
                    {form.formState.errors.serverUrl && <p className="text-xs text-red-400">{form.formState.errors.serverUrl.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Port</label>
                    <Input type="number" {...form.register("port")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">CPU Threads</label>
                    <Input type="number" {...form.register("cpuThreads")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Context Size</label>
                    <Input type="number" {...form.register("contextSize")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">GPU Layers</label>
                    <Input type="number" {...form.register("gpuLayers")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Container Name</label>
                    <Input {...form.register("containerName")} />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-white/5">
                  <p className="text-xs text-muted-foreground">Settings are used to generate the setup script.</p>
                  <Button type="submit" disabled={saveConfig.isPending} className="min-w-[120px]">
                    {saveConfig.isPending ? "Saving..." : saveSuccess ? (
                      <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Saved</span>
                    ) : "Save Config"}
                  </Button>
                </div>
              </form>
            )}
          </motion.div>

          <div className="space-y-8 flex flex-col h-full">
            {/* Quick Setup Guide */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-panel rounded-2xl p-1"
            >
              <button 
                onClick={() => setShowGuide(!showGuide)}
                className="w-full flex items-center justify-between p-5 text-left rounded-xl hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <TerminalSquare className="w-5 h-5 text-accent" />
                  <h3 className="text-xl font-display font-semibold">Quick Setup Guide</h3>
                </div>
                {showGuide ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
              </button>

              {showGuide && (
                <div className="px-6 pb-6 pt-2 space-y-4 text-sm text-muted-foreground">
                  <p>1. SSH into your VPS as root or a user with sudo privileges.</p>
                  <p>2. Download the customized setup script using the button above, or copy it manually.</p>
                  <p>3. Upload it to your server and make it executable:</p>
                  <div className="bg-black/50 p-3 rounded-lg font-mono text-xs border border-white/5 text-primary-foreground">
                    chmod +x setup-llama.sh<br/>
                    ./setup-llama.sh
                  </div>
                  <p>4. The script will install Docker, download the Qwen 2.5 3B model (~2GB), and start the server.</p>
                  <p>5. Ensure your VPS firewall allows inbound traffic on port {form.getValues("port")}.</p>
                </div>
              )}
            </motion.div>

            {/* Local Chat Tester */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-panel rounded-2xl flex-1 flex flex-col min-h-[400px] overflow-hidden relative"
            >
              <div className="p-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <h3 className="text-lg font-display font-semibold flex items-center gap-2">
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
                  <p className="text-sm">Start your local server to test the model here.</p>
                </div>
              ) : (
                <LocalChatTester />
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-components

function StatusCard({ icon, title, value, subvalue, status }: any) {
  return (
    <div className="glass-panel rounded-2xl p-6 glass-panel-hover group">
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors border border-white/5">
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
        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold text-white mb-1 truncate" title={value}>{value}</p>
        <p className="text-xs text-muted-foreground/80">{subvalue}</p>
      </div>
    </div>
  );
}

function Settings(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function LocalChatTester() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: 'Hello! I am your local model. How can I help you today?' }
  ]);
  const [input, setInput] = useState("");
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
        messages: newMsgs,
        temperature: 0.7
      }
    }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      },
      onError: () => {
        setMessages(prev => [...prev, { role: 'assistant', content: '**Error: Failed to get response from local server.**' }]);
      }
    });
  };

  return (
    <div className="flex flex-col h-full w-full">
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
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-75" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-150" />
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
