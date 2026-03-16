import { useState, useEffect } from "react";
import {
  useGetVpsDatabaseConfig,
  useSaveVpsDatabaseConfig,
  useTestVpsDatabase,
  useGetVpsDatabaseSetupScript,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Database, Server, Loader2, CheckCircle2, XCircle, Download,
  RefreshCw, Shield, Globe, AlertCircle, Copy, Check
} from "lucide-react";

export default function VpsDatabasePanel() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetVpsDatabaseConfig();
  const saveConfig = useSaveVpsDatabaseConfig();
  const testConnection = useTestVpsDatabase();
  const { data: setupScript, refetch: fetchScript } = useGetVpsDatabaseSetupScript({
    query: { enabled: false }
  });

  const [form, setForm] = useState({
    host: "72.60.167.64",
    port: "5432",
    database: "llmhub",
    username: "llmhub",
    password: "",
    sslEnabled: false,
    isActive: false,
  });
  const [testResult, setTestResult] = useState<any>(null);
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        host: config.host || "72.60.167.64",
        port: config.port || "5432",
        database: config.database || "llmhub",
        username: config.username || "llmhub",
        password: config.password || "",
        sslEnabled: config.sslEnabled ?? false,
        isActive: config.isActive ?? false,
      });
    }
  }, [config]);

  const handleSave = () => {
    saveConfig.mutate(
      { data: form },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/vps-database/config"] });
          setDirty(false);
        },
      }
    );
  };

  const handleTest = () => {
    setTestResult(null);
    testConnection.mutate(
      { data: {} as any },
      {
        onSuccess: (data: any) => {
          setTestResult(data);
          queryClient.invalidateQueries({ queryKey: ["/api/vps-database/config"] });
        },
        onError: (err: any) => {
          setTestResult({ success: false, error: err?.message || "Test failed" });
        },
      }
    );
  };

  const handleDownloadScript = async () => {
    const result = await fetchScript();
    if (result.data) {
      const blob = new Blob([result.data as string], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "setup-postgresql.sh";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleCopyScript = async () => {
    const result = await fetchScript();
    if (result.data) {
      await navigator.clipboard.writeText(result.data as string);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const updateField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="bg-card/50 border border-white/10 rounded-2xl p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-card/50 border border-white/10 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Database className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              VPS PostgreSQL
              {config?.isActive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Active
                </span>
              )}
            </h4>
            <p className="text-xs text-muted-foreground">
              PostgreSQL database on your VPS at {form.host}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyScript}
            className="gap-1.5 text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy Script"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadScript}
            className="gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" /> Setup Script
          </Button>
        </div>
      </div>

      {config?.lastTestResult && (
        <div className={cn(
          "rounded-lg p-3 flex items-center gap-2 text-xs border",
          config.lastTestResult.startsWith("FAILED")
            ? "bg-red-500/10 border-red-500/20 text-red-400"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
        )}>
          {config.lastTestResult.startsWith("FAILED") ? (
            <XCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{config.lastTestResult}</span>
          {config.lastTestedAt && (
            <span className="text-muted-foreground ml-auto">
              {new Date(config.lastTestedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Globe className="w-3 h-3" /> Host
          </label>
          <Input
            value={form.host}
            onChange={(e) => updateField("host", e.target.value)}
            placeholder="72.60.167.64"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" /> Port
          </label>
          <Input
            value={form.port}
            onChange={(e) => updateField("port", e.target.value)}
            placeholder="5432"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Database Name</label>
          <Input
            value={form.database}
            onChange={(e) => updateField("database", e.target.value)}
            placeholder="llmhub"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Username</label>
          <Input
            value={form.username}
            onChange={(e) => updateField("username", e.target.value)}
            placeholder="llmhub"
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Shield className="w-3 h-3" /> Password
          </label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Enter database password"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={form.sslEnabled}
            onChange={(e) => updateField("sslEnabled", e.target.checked)}
            className="rounded"
          />
          SSL Enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => updateField("isActive", e.target.checked)}
            className="rounded"
          />
          Active Connection
        </label>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saveConfig.isPending || !dirty}
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
        >
          {saveConfig.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Save Config
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testConnection.isPending}
          className="gap-1.5"
        >
          {testConnection.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Test Connection
        </Button>
      </div>

      {testResult && (
        <div className={cn(
          "rounded-lg p-4 border space-y-2",
          testResult.success
            ? "bg-emerald-500/10 border-emerald-500/20"
            : "bg-red-500/10 border-red-500/20"
        )}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            <p className={cn("text-sm font-medium", testResult.success ? "text-emerald-400" : "text-red-400")}>
              {testResult.success ? "Connection Successful!" : "Connection Failed"}
            </p>
          </div>
          {testResult.message && <p className="text-xs text-emerald-300">{testResult.message}</p>}
          {testResult.error && <p className="text-xs text-red-300">{testResult.error}</p>}
          {testResult.sizeBytes && (
            <p className="text-[10px] text-muted-foreground">
              Database size: {(testResult.sizeBytes / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
        </div>
      )}

      <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-2">
        <h5 className="text-xs font-medium text-white flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          Quick Setup
        </h5>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          1. SSH into your VPS: <code className="text-cyan-400">ssh root@{form.host}</code><br />
          2. Download and run the setup script, or copy/paste it directly<br />
          3. Set your password above and click "Test Connection"<br />
          4. Enable "Active Connection" once verified
        </p>
      </div>
    </div>
  );
}
