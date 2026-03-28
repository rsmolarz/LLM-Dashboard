import { useState, useEffect, useCallback } from "react";
import { Shield, Activity, Eye, AlertTriangle, CheckCircle, XCircle, Clock, Users, FileText, RefreshCw, Download, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

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

interface DocSection {
  title: string;
  content: string;
}

interface HIPAADocument {
  id: string;
  title: string;
  category: string;
  description: string;
  lastUpdated: string;
  status: string;
  sections: DocSection[];
}

export default function Compliance() {
  const [tab, setTab] = useState<"overview" | "audit-log" | "phi-report" | "documents">("overview");
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [phiOnly, setPhiOnly] = useState(false);
  const [phiReport, setPhiReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<HIPAADocument[]>([]);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

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

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API}/compliance/documents`, { credentials: "include" });
      if (res.ok) setDocuments(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => { if (tab === "audit-log") fetchAuditLogs(); }, [tab, fetchAuditLogs]);
  useEffect(() => { if (tab === "phi-report") fetchPHIReport(); }, [tab, fetchPHIReport]);
  useEffect(() => { if (tab === "documents") fetchDocuments(); }, [tab, fetchDocuments]);

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

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    const elements: JSX.Element[] = [];
    let tableRows: string[][] = [];
    let inTable = false;
    let skipNext = false;

    const formatInline = (line: string) => {
      const parts: (string | JSX.Element)[] = [];
      let remaining = line;
      let keyIdx = 0;
      const regex = /\*\*(.+?)\*\*/g;
      let match;
      let lastIdx = 0;
      while ((match = regex.exec(remaining)) !== null) {
        if (match.index > lastIdx) parts.push(remaining.slice(lastIdx, match.index));
        parts.push(<strong key={keyIdx++} className="font-semibold text-foreground">{match[1]}</strong>);
        lastIdx = regex.lastIndex;
      }
      if (lastIdx < remaining.length) parts.push(remaining.slice(lastIdx));
      return parts;
    };

    for (let i = 0; i < lines.length; i++) {
      if (skipNext) { skipNext = false; continue; }
      const line = lines[i];

      if (line.startsWith("|") && line.endsWith("|")) {
        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        if (lines[i + 1]?.match(/^\|[\s-|]+\|$/)) {
          inTable = true;
          tableRows = [cells];
          skipNext = true;
          continue;
        }
        if (inTable) {
          tableRows.push(cells);
          if (i === lines.length - 1 || !lines[i + 1]?.startsWith("|")) {
            elements.push(
              <div key={i} className="overflow-x-auto my-3">
                <table className="w-full text-sm border border-border rounded">
                  <thead>
                    <tr className="bg-card/50 border-b border-border">
                      {tableRows[0].map((h, hi) => (
                        <th key={hi} className="text-left px-3 py-2 font-medium text-xs">{formatInline(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tableRows.slice(1).map((row, ri) => (
                      <tr key={ri} className="hover:bg-accent/30">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-xs">{formatInline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            inTable = false;
            tableRows = [];
          }
          continue;
        }
      } else {
        if (inTable && tableRows.length > 0) {
          elements.push(
            <div key={`t-${i}`} className="overflow-x-auto my-3">
              <table className="w-full text-sm border border-border rounded">
                <thead>
                  <tr className="bg-card/50 border-b border-border">
                    {tableRows[0].map((h, hi) => (
                      <th key={hi} className="text-left px-3 py-2 font-medium text-xs">{formatInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tableRows.slice(1).map((row, ri) => (
                    <tr key={ri} className="hover:bg-accent/30">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-xs">{formatInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          inTable = false;
          tableRows = [];
        }
      }

      if (line.trim() === "---") {
        elements.push(<hr key={i} className="border-border my-4" />);
      } else if (line.startsWith("☐")) {
        elements.push(<div key={i} className="flex items-start gap-2 ml-2 my-0.5"><input type="checkbox" className="mt-1 rounded border-border" readOnly /><span className="text-sm">{formatInline(line.slice(1).trim())}</span></div>);
      } else if (line.match(/^\d+\.\s/)) {
        elements.push(<div key={i} className="ml-4 my-0.5 text-sm">{formatInline(line)}</div>);
      } else if (line.match(/^[a-z]\)\s/)) {
        elements.push(<div key={i} className="ml-6 my-0.5 text-sm">{formatInline(line)}</div>);
      } else if (line.startsWith("- ")) {
        elements.push(<div key={i} className="ml-4 my-0.5 text-sm flex gap-2"><span className="text-muted-foreground">•</span><span>{formatInline(line.slice(2))}</span></div>);
      } else if (line.startsWith("   - ")) {
        elements.push(<div key={i} className="ml-8 my-0.5 text-sm flex gap-2"><span className="text-muted-foreground">◦</span><span>{formatInline(line.slice(5))}</span></div>);
      } else if (line.trim() === "") {
        elements.push(<div key={i} className="h-2" />);
      } else {
        elements.push(<p key={i} className="text-sm my-0.5">{formatInline(line)}</p>);
      }
    }

    return <div className="space-y-0">{elements}</div>;
  };

  const exportDocument = (doc: HIPAADocument) => {
    let text = `${doc.title}\n${"=".repeat(doc.title.length)}\n\n`;
    text += `Category: ${doc.category}\n`;
    text += `Description: ${doc.description}\n`;
    text += `Last Updated: ${doc.lastUpdated}\n\n`;
    doc.sections.forEach(s => {
      text += `${s.title}\n${"-".repeat(s.title.length)}\n\n${s.content}\n\n`;
    });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.id}-template.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const categoryIcon: Record<string, string> = {
    "Administrative Safeguards": "bg-blue-600",
    "Physical Safeguards": "bg-orange-600",
    "Technical Safeguards": "bg-emerald-600",
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
        <button onClick={() => { fetchStatus(); if (tab === "audit-log") fetchAuditLogs(); if (tab === "phi-report") fetchPHIReport(); if (tab === "documents") fetchDocuments(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["overview", "audit-log", "phi-report", "documents"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-emerald-600 text-white" : "bg-card border border-border hover:bg-accent"}`}>
            {t === "overview" && <Shield className="h-4 w-4" />}
            {t === "audit-log" && <Activity className="h-4 w-4" />}
            {t === "phi-report" && <Eye className="h-4 w-4" />}
            {t === "documents" && <FileText className="h-4 w-4" />}
            {t === "overview" ? "Overview" : t === "audit-log" ? "Audit Log" : t === "phi-report" ? "PHI Access" : "Documents"}
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

      {tab === "documents" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">HIPAA Template Documents</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {documents.length} template documents available. Fill in bracketed fields with your organization's information.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded bg-blue-900/50 text-blue-300 border border-blue-700">
                  {documents.filter(d => d.category === "Administrative Safeguards").length} Administrative
                </span>
                <span className="text-xs px-2 py-1 rounded bg-orange-900/50 text-orange-300 border border-orange-700">
                  {documents.filter(d => d.category === "Physical Safeguards").length} Physical
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {documents.map(doc => (
              <div key={doc.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors text-left cursor-pointer"
                  onClick={() => {
                    setExpandedDoc(expandedDoc === doc.id ? null : doc.id);
                    if (expandedDoc !== doc.id) {
                      const allKeys = doc.sections.map((_, i) => `${doc.id}-${i}`);
                      setExpandedSections(prev => {
                        const next = new Set(prev);
                        allKeys.forEach(k => next.add(k));
                        return next;
                      });
                    }
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${categoryIcon[doc.category] || "bg-gray-600"}`}>
                      <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold">{doc.title}</div>
                      <div className="text-sm text-muted-foreground">{doc.description}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">{doc.category}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">{doc.sections.length} sections</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">Updated {doc.lastUpdated}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); exportDocument(doc); }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors"
                      title="Download as text file"
                    >
                      <Download className="h-3 w-3" /> Export
                    </button>
                    {expandedDoc === doc.id ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </div>

                {expandedDoc === doc.id && (
                  <div className="border-t border-border">
                    {doc.sections.map((section, si) => {
                      const sectionKey = `${doc.id}-${si}`;
                      const isOpen = expandedSections.has(sectionKey);
                      return (
                        <div key={si} className="border-b border-border last:border-b-0">
                          <button
                            onClick={() => toggleSection(sectionKey)}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-accent/30 transition-colors text-left"
                          >
                            <span className="font-medium text-sm">{section.title}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={e => { e.stopPropagation(); copyToClipboard(section.content, sectionKey); }}
                                className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-accent transition-colors"
                                title="Copy section text"
                              >
                                {copied === sectionKey ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                              </button>
                              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-4 pt-1 bg-accent/10">
                              {renderMarkdown(section.content)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {documents.length === 0 && (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Loading Documents...</h3>
                <p className="text-sm text-muted-foreground mt-1">Admin access required to view HIPAA templates</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
