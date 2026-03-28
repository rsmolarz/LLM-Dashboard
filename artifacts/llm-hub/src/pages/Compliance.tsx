import { useState, useEffect, useCallback } from "react";
import { Shield, Activity, Eye, AlertTriangle, CheckCircle, XCircle, Clock, Users, FileText, RefreshCw } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`;

interface ComplianceCheck {
  id: string;
  name: string;
  description: string;
  status: "compliant" | "warning" | "action-required";
  category: string;
}

interface AuditLog {
  id: number;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  ip_address: string | null;
  phi_accessed: boolean;
  details: any;
  created_at: string;
}

interface ComplianceStatus {
  overallScore: number;
  summary: { compliant: number; warnings: number; actionRequired: number; total: number };
  checks: ComplianceCheck[];
  auditStats: { totalEvents: number; phiAccessEvents: number; last24hEvents: number; uniqueUsers: number };
  lastChecked: string;
}

export default function Compliance() {
  const [tab, setTab] = useState<"overview" | "audit-log" | "phi-report">("overview");
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [phiOnly, setPhiOnly] = useState(false);
  const [phiReport, setPhiReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/compliance/status`, { credentials: "include" });
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30", offset: String(auditPage * 30) });
      if (phiOnly) params.set("phiOnly", "true");
      const res = await fetch(`${API}/compliance/audit-logs?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs);
        setAuditTotal(data.total);
      }
    } catch {}
    setLoading(false);
  }, [auditPage, phiOnly]);

  const fetchPHIReport = useCallback(async () => {
    try {
      const res = await fetch(`${API}/compliance/phi-access-report?days=30`, { credentials: "include" });
      if (res.ok) setPhiReport(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => { if (tab === "audit-log") fetchAuditLogs(); }, [tab, fetchAuditLogs]);
  useEffect(() => { if (tab === "phi-report") fetchPHIReport(); }, [tab, fetchPHIReport]);

  const statusIcon = (s: string) => {
    if (s === "compliant") return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (s === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
    return <XCircle className="h-4 w-4 text-red-400" />;
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      compliant: "bg-green-900/50 text-green-300 border-green-700",
      warning: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
      "action-required": "bg-red-900/50 text-red-300 border-red-700",
    };
    const labels: Record<string, string> = { compliant: "Compliant", warning: "Warning", "action-required": "Action Required" };
    return <span className={`text-xs px-2 py-0.5 rounded border ${colors[s] || ""}`}>{labels[s] || s}</span>;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-lg">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">HIPAA Compliance</h1>
            <p className="text-sm text-muted-foreground">Security controls, audit logs, and PHI access monitoring</p>
          </div>
        </div>
        <button onClick={() => { fetchStatus(); if (tab === "audit-log") fetchAuditLogs(); if (tab === "phi-report") fetchPHIReport(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        {(["overview", "audit-log", "phi-report"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-emerald-600 text-white" : "bg-card border border-border hover:bg-accent"}`}>
            {t === "overview" && <Shield className="h-4 w-4" />}
            {t === "audit-log" && <Activity className="h-4 w-4" />}
            {t === "phi-report" && <Eye className="h-4 w-4" />}
            {t === "overview" ? "Overview" : t === "audit-log" ? "Audit Log" : "PHI Access"}
          </button>
        ))}
      </div>

      {tab === "overview" && status && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-sm text-muted-foreground">Compliance Score</div>
              <div className={`text-3xl font-bold mt-1 ${status.overallScore >= 70 ? "text-green-400" : status.overallScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                {status.overallScore}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">{status.summary.compliant}/{status.summary.total} controls met</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" /> Audit Events</div>
              <div className="text-3xl font-bold mt-1">{status.auditStats.totalEvents.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">{status.auditStats.last24hEvents} in last 24h</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> PHI Accesses</div>
              <div className="text-3xl font-bold mt-1 text-amber-400">{status.auditStats.phiAccessEvents.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">Protected health info accesses</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Tracked Users</div>
              <div className="text-3xl font-bold mt-1">{status.auditStats.uniqueUsers}</div>
              <div className="text-xs text-muted-foreground mt-1">With audit trail</div>
            </div>
          </div>

          {["Technical Safeguards", "Administrative Safeguards", "Physical Safeguards"].map(category => {
            const items = status.checks.filter(c => c.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-card/50">
                  <h3 className="font-semibold">{category}</h3>
                </div>
                <div className="divide-y divide-border">
                  {items.map(check => (
                    <div key={check.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        {statusIcon(check.status)}
                        <div>
                          <div className="font-medium text-sm">{check.name}</div>
                          <div className="text-xs text-muted-foreground">{check.description}</div>
                        </div>
                      </div>
                      {statusBadge(check.status)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "overview" && !status && (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Admin Access Required</h3>
          <p className="text-sm text-muted-foreground mt-1">Sign in as an admin to view compliance status</p>
        </div>
      )}

      {tab === "audit-log" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={phiOnly} onChange={e => { setPhiOnly(e.target.checked); setAuditPage(0); }}
                  className="rounded border-border" />
                PHI access only
              </label>
              <span className="text-sm text-muted-foreground">{auditTotal} total events</span>
            </div>
            <div className="flex gap-2">
              <button disabled={auditPage === 0} onClick={() => setAuditPage(p => p - 1)}
                className="px-3 py-1 text-sm border border-border rounded hover:bg-accent disabled:opacity-50">Prev</button>
              <span className="px-3 py-1 text-sm">Page {auditPage + 1}</span>
              <button disabled={(auditPage + 1) * 30 >= auditTotal} onClick={() => setAuditPage(p => p + 1)}
                className="px-3 py-1 text-sm border border-border rounded hover:bg-accent disabled:opacity-50">Next</button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card/50">
                    <th className="text-left px-4 py-2 font-medium">Time</th>
                    <th className="text-left px-4 py-2 font-medium">User</th>
                    <th className="text-left px-4 py-2 font-medium">Action</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">PHI</th>
                    <th className="text-left px-4 py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditLogs.map(log => (
                    <tr key={log.id} className={`hover:bg-accent/50 ${log.phi_accessed ? "bg-amber-950/10" : ""}`}>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">{log.user_email || log.user_id || "anonymous"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{log.action}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${log.details?.statusCode < 400 ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"}`}>
                          {log.details?.statusCode || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {log.phi_accessed && <Eye className="h-4 w-4 text-amber-400" />}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{log.ip_address || "—"}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        {loading ? "Loading..." : "No audit logs found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "phi-report" && (
        <div className="space-y-4">
          {phiReport && (
            <>
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="font-semibold mb-2">PHI Access Summary — Last {phiReport.period}</h3>
                <p className="text-2xl font-bold text-amber-400">{phiReport.totalPHIAccesses} total PHI accesses</p>
                <p className="text-sm text-muted-foreground">{phiReport.users.length} users accessed PHI</p>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card/50">
                      <th className="text-left px-4 py-2 font-medium">User</th>
                      <th className="text-left px-4 py-2 font-medium">Access Count</th>
                      <th className="text-left px-4 py-2 font-medium">Unique Resources</th>
                      <th className="text-left px-4 py-2 font-medium">First Access</th>
                      <th className="text-left px-4 py-2 font-medium">Last Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {phiReport.users.map((u: any) => (
                      <tr key={u.user_id} className="hover:bg-accent/50">
                        <td className="px-4 py-2">{u.user_email || u.user_id}</td>
                        <td className="px-4 py-2 font-bold">{u.access_count}</td>
                        <td className="px-4 py-2">{u.unique_resources}</td>
                        <td className="px-4 py-2 text-muted-foreground">{new Date(u.first_access).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-muted-foreground">{new Date(u.last_access).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    {phiReport.users.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No PHI access recorded in this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!phiReport && (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Loading PHI Access Report...</h3>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
