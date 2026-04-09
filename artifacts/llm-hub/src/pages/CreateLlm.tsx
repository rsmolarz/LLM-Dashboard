import { useState, useMemo } from "react";
import { Brain, Plus, Code2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_MODELS = [
  "llama3.2",
  "llama3.1",
  "mistral",
  "deepseek-r1",
  "meditron",
  "phi3",
  "gemma2",
  "codellama",
];

export default function CreateLlm() {
  const [modelName, setModelName] = useState("");
  const [baseModel, setBaseModel] = useState("llama3.2");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [contextWindow, setContextWindow] = useState(4096);
  const [stopSequences, setStopSequences] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const modelfile = useMemo(() => {
    let mf = `FROM ${baseModel}\n`;
    if (systemPrompt.trim()) {
      mf += `\nSYSTEM """${systemPrompt.trim()}"""\n`;
    }
    mf += `\nPARAMETER temperature ${temperature}\n`;
    mf += `PARAMETER num_ctx ${contextWindow}\n`;
    if (stopSequences.trim()) {
      stopSequences.split(",").map(s => s.trim()).filter(Boolean).forEach(s => {
        mf += `PARAMETER stop "${s}"\n`;
      });
    }
    return mf;
  }, [baseModel, systemPrompt, temperature, contextWindow, stopSequences]);

  const handleCreate = async () => {
    if (!modelName.trim()) {
      setStatus("error");
      setStatusMsg("Model name is required.");
      return;
    }
    setStatus("loading");
    setStatusMsg("Creating model...");
    try {
      const res = await fetch("/api/ollama/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName.trim(), modelfile }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setStatus("success");
      setStatusMsg(`Model "${modelName}" created successfully!`);
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(e.message || "Failed to create model.");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <Brain className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Create LLM</h1>
          <p className="text-sm text-muted-foreground">Build a custom model using an Ollama Modelfile</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-400" /> Model Configuration
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Model Name</label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                placeholder="e.g. my-custom-llama"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Base Model</label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                value={baseModel}
                onChange={e => setBaseModel(e.target.value)}
              >
                {BASE_MODELS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">System Prompt</label>
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                rows={6}
                placeholder="You are a helpful assistant..."
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Temperature</label>
                <span className="text-xs font-bold text-violet-400 tabular-nums">{temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0.0 (precise)</span>
                <span>2.0 (creative)</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Context Window</label>
              <input
                type="number"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                value={contextWindow}
                onChange={e => setContextWindow(parseInt(e.target.value) || 4096)}
                min={512}
                max={131072}
                step={512}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Stop Sequences <span className="text-muted-foreground/60">(comma-separated)</span></label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                placeholder="[DONE], </s>, ..."
                value={stopSequences}
                onChange={e => setStopSequences(e.target.value)}
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={status === "loading"}
              className={cn(
                "w-full rounded-lg px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                status === "loading"
                  ? "bg-violet-500/30 text-violet-300 cursor-not-allowed"
                  : "bg-violet-600 hover:bg-violet-500 text-white"
              )}
            >
              {status === "loading" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              ) : (
                <><Plus className="w-4 h-4" /> Create Model</>
              )}
            </button>

            {status === "success" && (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-emerald-300">{statusMsg}</p>
              </div>
            )}
            {status === "error" && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">{statusMsg}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Code2 className="w-4 h-4 text-violet-400" /> Modelfile Preview
            </h2>
            <pre className="rounded-lg bg-black/40 border border-border p-4 text-xs font-mono text-violet-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {modelfile}
            </pre>
            <p className="text-xs text-muted-foreground">
              This Modelfile will be sent to Ollama's <code className="text-violet-400">/api/create</code> endpoint to build your custom model.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
