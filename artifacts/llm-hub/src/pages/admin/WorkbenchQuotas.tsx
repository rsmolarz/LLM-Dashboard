import { useEffect, useState, useCallback } from "react";
import { Shield, RefreshCw, Loader2, AlertTriangle, HardDrive, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@workspace/replit-auth-web";

const API = import.meta.env.VITE_API_URL || "";

interface Quotas {
  userQuotaBytes: number;
  hostQuotaBytes: number;
  defaults: { userQuotaBytes: number; hostQuotaBytes: number };
}

interface UsageEntry {
  userIdHash: string;
  usedBytes: number;
  mtimeMs: number;
  overThreshold: boolean;
}

interface Usage {
  totalBytes: number;
  hostCapBytes: number;
  userCapBytes: number;
  overThresholdPct: number;
  users: UsageEntry[];
}

interface EvictionReport {
  removed: string[];
  evicted: string[];
  kept: number;
  errors: Array<{ path: string; message: string }>;
  usage: Usage;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KiB`;
  return `${n} B`;
}

function formatTimestamp(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default function WorkbenchQuotas() {
  const { isAdmin, isLoading: authLoading, user } = useAuth();
  const [quotas, setQuotas] = useState<Quotas | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evicting, setEvicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [hostInput, setHostInput] = useState("");
  const [lastEviction, setLastEviction] = useState<EvictionReport | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [qRes, uRes] = await Promise.all([
        fetch(`${API}/api/admin/workbench-quotas`, { credentials: "include" }),
        fetch(`${API}/api/admin/workbench-usage`, { credentials: "include" }),
      ]);
      if (!qRes.ok) throw new Error(`Quotas request failed: HTTP ${qRes.status}`);
      if (!uRes.ok) throw new Error(`Usage request failed: HTTP ${uRes.status}`);
      const q = (await qRes.json()) as Quotas;
      const u = (await uRes.json()) as Usage;
      setQuotas(q);
      setUsage(u);
      setUserInput(String(q.userQuotaBytes));
      setHostInput(String(q.hostQuotaBytes));
    } catch (e: any) {
      setError(e?.message || "Failed to load workbench quotas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      refresh();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, isAdmin, refresh]);

  const save = useCallback(
    async (resetField?: "user" | "host") => {
      if (!quotas) return;
      setSaving(true);
      setError(null);
      setMessage(null);
      try {
        const body: { userQuotaBytes?: number | null; hostQuotaBytes?: number | null } = {};
        // Reset actions are scoped: pressing "Reset" on the per-user cap
        // ONLY restores that cap, even if there's an unsaved/invalid
        // draft in the host cap field (and vice versa). This avoids
        // accidentally re-validating or shipping the unrelated draft.
        if (resetField === "user") {
          body.userQuotaBytes = null;
        } else if (resetField === "host") {
          body.hostQuotaBytes = null;
        } else {
          const userN = Number(userInput);
          if (!Number.isFinite(userN) || !Number.isInteger(userN) || userN <= 0) {
            throw new Error("Per-user cap must be a positive integer (bytes).");
          }
          if (userN !== quotas.userQuotaBytes) body.userQuotaBytes = userN;

          const hostN = Number(hostInput);
          if (!Number.isFinite(hostN) || !Number.isInteger(hostN) || hostN <= 0) {
            throw new Error("Host-wide cap must be a positive integer (bytes).");
          }
          if (hostN !== quotas.hostQuotaBytes) body.hostQuotaBytes = hostN;
        }
        if (Object.keys(body).length === 0) {
          setMessage("No changes to save.");
          return;
        }
        const res = await fetch(`${API}/api/admin/workbench-quotas`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setQuotas(data as Quotas);
        setUserInput(String((data as Quotas).userQuotaBytes));
        setHostInput(String((data as Quotas).hostQuotaBytes));
        setMessage("Caps updated. New limits are active immediately on this server process.");
        // Refresh usage so over-threshold flags re-compute against the new cap.
        const uRes = await fetch(`${API}/api/admin/workbench-usage`, { credentials: "include" });
        if (uRes.ok) setUsage((await uRes.json()) as Usage);
      } catch (e: any) {
        setError(e?.message || "Failed to update caps.");
      } finally {
        setSaving(false);
      }
    },
    [quotas, userInput, hostInput],
  );

  const triggerEviction = useCallback(async () => {
    setEvicting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/admin/workbench-evict`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const report = data as EvictionReport;
      setLastEviction(report);
      setUsage(report.usage);
      setMessage(
        `Eviction sweep complete: ${report.removed.length} removed by TTL, ${report.evicted.length} evicted by host cap, ${report.kept} kept, ${report.errors.length} error(s).`,
      );
    } catch (e: any) {
      setError(e?.message || "Eviction sweep failed.");
    } finally {
      setEvicting(false);
    }
  }, []);

  if (authLoading || loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="border border-border rounded-xl p-6 bg-card">
          <h2 className="text-lg font-bold mb-2">Sign in required</h2>
          <p className="text-sm text-muted-foreground">
            Please sign in to view this page.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="border border-border rounded-xl p-6 bg-card flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold mb-1">Admin access required</h2>
            <p className="text-sm text-muted-foreground">
              You need an admin role to view or change workbench disk caps.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hostUsedPct =
    usage && usage.hostCapBytes > 0
      ? Math.min(100, (usage.totalBytes / usage.hostCapBytes) * 100)
      : 0;
  const overUsers = usage?.users.filter((u) => u.overThreshold).length ?? 0;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Shield className="w-4 h-4" /> Admin
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HardDrive className="w-6 h-6" /> Workbench disk caps
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Adjust the per-user and host-wide scratch-disk limits used by the Workbench shell and git
            endpoints. Changes take effect immediately on this server process but are{" "}
            <span className="text-foreground">not persisted</span> — an API server restart reverts
            to the env-variable defaults. Update <code>WORKBENCH_USER_QUOTA_BYTES</code> /{" "}
            <code>WORKBENCH_HOST_QUOTA_BYTES</code> in deployment for permanent changes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      {error && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-300 rounded-lg p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
        </div>
      )}
      {message && !error && (
        <div className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 rounded-lg p-3 text-sm">
          {message}
        </div>
      )}

      <section className="grid md:grid-cols-2 gap-4">
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-semibold">Per-user cap</h2>
            <span className="text-xs text-muted-foreground">
              default {quotas ? formatBytes(quotas.defaults.userQuotaBytes) : "—"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Once a single user's scratch dir reaches this cap, new shell/git commands return a quota
            error until they free space.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              step={1}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              data-testid="input-user-quota-bytes"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => save("user")}
              disabled={saving}
              title="Reset to env / compile-time default"
            >
              Reset
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Currently: {quotas ? formatBytes(quotas.userQuotaBytes) : "—"}
          </div>
        </div>

        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-semibold">Host-wide eviction threshold</h2>
            <span className="text-xs text-muted-foreground">
              default {quotas ? formatBytes(quotas.defaults.hostQuotaBytes) : "—"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            After the TTL sweep, if the entire scratch tree is still bigger than this, the largest
            user dirs are evicted (oldest-active first does not apply — biggest first wins) until
            the tree fits.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              step={1}
              value={hostInput}
              onChange={(e) => setHostInput(e.target.value)}
              data-testid="input-host-quota-bytes"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => save("host")}
              disabled={saving}
              title="Reset to env / compile-time default"
            >
              Reset
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Currently: {quotas ? formatBytes(quotas.hostQuotaBytes) : "—"}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => save()} disabled={saving} data-testid="button-save-quotas">
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save caps
        </Button>
        <Button
          variant="destructive"
          onClick={triggerEviction}
          disabled={evicting}
          data-testid="button-trigger-eviction"
        >
          {evicting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4 mr-2" />
          )}
          Run host eviction sweep now
        </Button>
      </div>

      <section className="border border-border rounded-xl p-4 bg-card">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Host usage</h2>
          <div className="text-xs text-muted-foreground">
            {usage ? `${usage.users.length} active user dirs` : "—"}
          </div>
        </div>
        {usage ? (
          <>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-mono">{formatBytes(usage.totalBytes)}</span>
              <span className="text-muted-foreground">of</span>
              <span className="font-mono">{formatBytes(usage.hostCapBytes)}</span>
              <span className="text-muted-foreground">({hostUsedPct.toFixed(1)}%)</span>
            </div>
            <div className="mt-2 h-2 w-full rounded bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${
                  hostUsedPct >= 100
                    ? "bg-red-500"
                    : hostUsedPct >= 80
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, hostUsedPct)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {overUsers > 0 ? (
                <span className="text-amber-400">
                  {overUsers} user{overUsers === 1 ? "" : "s"} over{" "}
                  {Math.round(usage.overThresholdPct * 100)}% of the per-user cap
                </span>
              ) : (
                <span>No users over {Math.round(usage.overThresholdPct * 100)}% of the per-user cap.</span>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Usage data unavailable.</div>
        )}
      </section>

      <section className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="flex items-baseline justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold">Per-user usage</h2>
          <div className="text-xs text-muted-foreground">Sorted largest first</div>
        </div>
        {usage && usage.users.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">User hash</th>
                <th className="text-right px-4 py-2 font-medium">Used</th>
                <th className="text-right px-4 py-2 font-medium">% of cap</th>
                <th className="text-left px-4 py-2 font-medium">Last activity</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {usage.users.map((u) => {
                const pct = usage.userCapBytes > 0 ? (u.usedBytes / usage.userCapBytes) * 100 : 0;
                return (
                  <tr key={u.userIdHash} className="border-t border-border/50">
                    <td className="px-4 py-2 font-mono text-xs">{u.userIdHash}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatBytes(u.usedBytes)}</td>
                    <td className="px-4 py-2 text-right font-mono">{pct.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatTimestamp(u.mtimeMs)}
                    </td>
                    <td className="px-4 py-2">
                      {u.overThreshold ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
                          <AlertTriangle className="w-3 h-3" /> over threshold
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">ok</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">No active scratch dirs.</div>
        )}
      </section>

      {lastEviction && (
        <section className="border border-border rounded-xl p-4 bg-card">
          <h2 className="font-semibold mb-2">Last eviction sweep</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Removed (TTL)</div>
              <div className="font-mono">{lastEviction.removed.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Evicted (host cap)</div>
              <div className="font-mono">{lastEviction.evicted.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Kept</div>
              <div className="font-mono">{lastEviction.kept}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Errors</div>
              <div className="font-mono">{lastEviction.errors.length}</div>
            </div>
          </div>
          {lastEviction.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-red-300">
              {lastEviction.errors.map((e, i) => (
                <li key={i} className="font-mono">
                  {e.path}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
