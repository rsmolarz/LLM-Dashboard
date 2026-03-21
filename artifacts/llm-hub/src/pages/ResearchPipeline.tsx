import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical, FileText, Shield, Mail, Users, CheckCircle, Clock,
  AlertCircle, ChevronDown, ChevronRight, Database, Clipboard, Copy, Check,
  Download, Loader2, RefreshCw, ClipboardList, BookOpen, Target, Beaker,
  Settings, Link2, Upload, CircleDot, SkipForward, ExternalLink, Plug, Wifi, WifiOff
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface Overview {
  progress: number;
  totalTasks: number;
  completedTasks: number;
  phases: { phase: string; total: number; completed: number; inProgress: number; blocked: number }[];
  instruments: number;
  totalFields: number;
  irbSections: number;
  outreachTemplates: number;
}

type Tab = "overview" | "redcap-setup" | "redcap" | "irb" | "outreach" | "consent" | "tasks";

export default function ResearchPipeline() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [redcapData, setRedcapData] = useState<any>(null);
  const [irbData, setIrbData] = useState<any>(null);
  const [outreachData, setOutreachData] = useState<any>(null);
  const [consentData, setConsentData] = useState<any>(null);
  const [tasksData, setTasksData] = useState<any>(null);
  const [setupData, setSetupData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedInstrument, setExpandedInstrument] = useState<string | null>(null);
  const [expandedIrb, setExpandedIrb] = useState<string | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, rc, irb, out, con, tasks, setup] = await Promise.all([
        fetch(`${API}/api/research-pipeline/overview`).then(r => r.json()),
        fetch(`${API}/api/research-pipeline/redcap-schema`).then(r => r.json()),
        fetch(`${API}/api/research-pipeline/irb`).then(r => r.json()),
        fetch(`${API}/api/research-pipeline/outreach`).then(r => r.json()),
        fetch(`${API}/api/research-pipeline/consent`).then(r => r.json()),
        fetch(`${API}/api/research-pipeline/tasks`).then(r => r.json()),
        fetch(`${API}/api/research-pipeline/redcap-setup`).then(r => r.json()),
      ]);
      setOverview(ov);
      setRedcapData(rc);
      setIrbData(irb);
      setOutreachData(out);
      setConsentData(con);
      setTasksData(tasks);
      setSetupData(setup);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    setUpdatingTask(taskId);
    try {
      await fetch(`${API}/api/research-pipeline/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await fetchData();
    } catch { }
    setUpdatingTask(null);
  };

  const exportRedcapCsv = () => {
    window.open(`${API}/api/research-pipeline/export/redcap-csv`, "_blank");
  };

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "overview", label: "Overview", icon: Target },
    { key: "redcap-setup", label: "REDCap Setup", icon: Settings },
    { key: "redcap", label: "REDCap Schema", icon: Database },
    { key: "irb", label: "IRB Protocol", icon: Shield },
    { key: "outreach", label: "Outreach Emails", icon: Mail },
    { key: "consent", label: "Patient Consent", icon: ClipboardList },
    { key: "tasks", label: "Task Tracker", icon: CheckCircle },
  ];

  const statusColors: Record<string, string> = {
    not_started: "text-gray-400 bg-gray-400/10",
    in_progress: "text-blue-400 bg-blue-400/10",
    completed: "text-emerald-400 bg-emerald-400/10",
    blocked: "text-red-400 bg-red-400/10",
    draft: "text-gray-400 bg-gray-400/10",
    review: "text-amber-400 bg-amber-400/10",
    approved: "text-emerald-400 bg-emerald-400/10",
    submitted: "text-blue-400 bg-blue-400/10",
    sent: "text-blue-400 bg-blue-400/10",
    replied: "text-emerald-400 bg-emerald-400/10",
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <FlaskConical className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Research Pipeline</h1>
            <p className="text-sm text-muted-foreground">ENT / Laryngology AI Clinical Dataset Development</p>
          </div>
        </div>
        <button onClick={fetchData} className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm flex items-center gap-1.5 transition-all">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${tab === t.key ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && overview && (
        <div className="space-y-6">
          <div className="glass-panel rounded-xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Pipeline Progress</h2>
              <span className="text-2xl font-bold text-primary">{overview.progress}%</span>
            </div>
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all" style={{ width: `${overview.progress}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">{overview.completedTasks} of {overview.totalTasks} tasks completed</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel rounded-xl p-4 border border-white/5">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> REDCap Instruments</div>
              <div className="text-3xl font-bold text-white">{overview.instruments}</div>
              <div className="text-xs text-muted-foreground mt-1">{overview.totalFields} fields total</div>
            </div>
            <div className="glass-panel rounded-xl p-4 border border-white/5">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> IRB Sections</div>
              <div className="text-3xl font-bold text-white">{overview.irbSections}</div>
            </div>
            <div className="glass-panel rounded-xl p-4 border border-white/5">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Outreach Templates</div>
              <div className="text-3xl font-bold text-white">{overview.outreachTemplates}</div>
            </div>
            <div className="glass-panel rounded-xl p-4 border border-white/5">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Tasks</div>
              <div className="text-3xl font-bold text-white">{overview.totalTasks}</div>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-5 border border-white/5">
            <h2 className="text-lg font-semibold text-white mb-4">Phase Breakdown</h2>
            <div className="space-y-3">
              {overview.phases.map(phase => {
                const pct = phase.total > 0 ? (phase.completed / phase.total) * 100 : 0;
                return (
                  <div key={phase.phase}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white font-medium">{phase.phase}</span>
                      <span className="text-xs text-muted-foreground">{phase.completed}/{phase.total}</span>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                      {phase.inProgress > 0 && <span className="text-blue-400">{phase.inProgress} in progress</span>}
                      {phase.blocked > 0 && <span className="text-red-400">{phase.blocked} blocked</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "redcap-setup" && setupData && <RedcapSetupTab setupData={setupData} copyText={copyText} copiedId={copiedId} fetchData={fetchData} API={API} />}

      {tab === "redcap" && redcapData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-teal-400" /> REDCap Data Dictionary
            </h2>
            <button onClick={exportRedcapCsv} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600/20 text-teal-400 border border-teal-500/30 hover:bg-teal-600/30 text-xs font-medium transition-all">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          <p className="text-xs text-muted-foreground">6 instruments, structured for de-identified ENT clinical data. Export as CSV to import directly into REDCap.</p>

          {redcapData.instruments.map((inst: any) => (
            <div key={inst.id} className="glass-panel rounded-xl border border-white/5 overflow-hidden">
              <button
                onClick={() => setExpandedInstrument(expandedInstrument === inst.id ? null : inst.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">{inst.name}</div>
                    <div className="text-[10px] text-muted-foreground">{inst.fields.length} fields {inst.repeating ? "• Repeating" : "• Single entry"}</div>
                  </div>
                </div>
                {expandedInstrument === inst.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>

              {expandedInstrument === inst.id && (
                <div className="border-t border-white/5 p-4">
                  <p className="text-xs text-muted-foreground mb-3">{inst.description}</p>
                  <div className="rounded-lg border border-white/10 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/[0.03] border-b border-white/10">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Field</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Type</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium hidden md:table-cell">Label</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium hidden lg:table-cell">Choices / Validation</th>
                          <th className="text-center px-3 py-2 text-muted-foreground font-medium w-12">Req</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inst.fields.map((f: any) => (
                          <tr key={f.name} className="border-b border-white/5 hover:bg-white/[0.02]">
                            <td className="px-3 py-2 font-mono text-teal-300">{f.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{f.type}</td>
                            <td className="px-3 py-2 text-white hidden md:table-cell">{f.label}</td>
                            <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell text-[10px]">{f.choices || f.validation || "—"}</td>
                            <td className="px-3 py-2 text-center">{f.required ? <CheckCircle className="w-3 h-3 text-emerald-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "irb" && irbData && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" /> IRB Protocol Outline
          </h2>
          <p className="text-xs text-muted-foreground">Template protocol for "Development of a De-identified Clinical Dataset for Machine Learning in Otolaryngology." Replace bracketed placeholders with institution-specific information.</p>

          {irbData.sections.map((section: any) => (
            <div key={section.id} className="glass-panel rounded-xl border border-white/5 overflow-hidden">
              <button
                onClick={() => setExpandedIrb(expandedIrb === section.id ? null : section.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">{section.title}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[section.status]}`}>{section.status}</span>
                  {expandedIrb === section.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {expandedIrb === section.id && (
                <div className="border-t border-white/5 p-4">
                  <div className="whitespace-pre-line text-xs text-white/80 leading-relaxed bg-white/[0.02] rounded-lg p-4 border border-white/5">
                    {section.content}
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => copyText(section.content, `irb-${section.id}`)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-white transition-all"
                    >
                      {copiedId === `irb-${section.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedId === `irb-${section.id}` ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "outreach" && outreachData && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-violet-400" /> ML Collaborator Outreach Emails
          </h2>
          <p className="text-xs text-muted-foreground">Pre-written email templates for recruiting machine learning collaborators. Replace bracketed placeholders before sending.</p>

          {outreachData.emails.map((email: any) => (
            <div key={email.id} className="glass-panel rounded-xl border border-white/5 overflow-hidden">
              <button
                onClick={() => setExpandedEmail(expandedEmail === email.id ? null : email.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">{email.label}</div>
                    <div className="text-[10px] text-muted-foreground">{email.targetAudience}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[email.status]}`}>{email.status}</span>
                  {expandedEmail === email.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {expandedEmail === email.id && (
                <div className="border-t border-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Subject:</span>
                    <span className="text-white font-medium">{email.subject}</span>
                  </div>
                  <div className="whitespace-pre-line text-xs text-white/80 leading-relaxed bg-white/[0.02] rounded-lg p-4 border border-white/5">
                    {email.body}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => copyText(`Subject: ${email.subject}\n\n${email.body}`, `email-${email.id}`)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                    >
                      {copiedId === `email-${email.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedId === `email-${email.id}` ? "Copied" : "Copy Email"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "consent" && consentData && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-cyan-400" /> Patient Consent Addendum
          </h2>
          <p className="text-xs text-muted-foreground">Template consent form for use of clinical data in AI research. Must be reviewed and approved by your IRB before use.</p>

          <div className="glass-panel rounded-xl border border-white/5 p-5">
            <div className="text-center mb-4 pb-4 border-b border-white/10">
              <div className="text-sm font-semibold text-white">Research Consent Addendum</div>
              <div className="text-xs text-muted-foreground mt-1">Use of Clinical Data for AI Research in Otolaryngology</div>
            </div>

            <div className="space-y-4">
              {consentData.sections.map((section: any) => (
                <div key={section.id} className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                  <p className="text-xs text-white/70 leading-relaxed whitespace-pre-line">{section.content}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-4 pt-4 border-t border-white/10">
              <button
                onClick={() => copyText(consentData.sections.map((s: any) => `${s.title}\n${s.content}`).join("\n\n"), "consent-all")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 transition-all"
              >
                {copiedId === "consent-all" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === "consent-all" ? "Copied" : "Copy Full Consent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "tasks" && tasksData && (
        <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-14rem)]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" /> Research Pipeline Tasks
          </h2>

          {["IRB & Compliance", "Infrastructure", "Data Collection", "Collaboration", "ML Development", "Publication"].map(phase => {
            const phaseTasks = tasksData.tasks.filter((t: any) => t.phase === phase);
            if (phaseTasks.length === 0) return null;
            return (
              <div key={phase} className="glass-panel rounded-xl border border-white/5 p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Beaker className="w-4 h-4 text-teal-400" /> {phase}
                </h3>
                <div className="space-y-2">
                  {phaseTasks.map((task: any) => (
                    <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-all">
                      <select
                        value={task.status}
                        onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                        disabled={updatingTask === task.id}
                        className={`px-2 py-1 rounded text-[10px] font-medium border-0 cursor-pointer ${statusColors[task.status]} bg-opacity-20`}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="blocked">Blocked</option>
                      </select>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-medium ${task.status === "completed" ? "text-muted-foreground line-through" : "text-white"}`}>{task.task}</div>
                        {task.notes && <div className="text-[10px] text-muted-foreground mt-0.5">{task.notes}</div>}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{task.assignee}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RedcapSetupTab({ setupData, copyText, copiedId, fetchData, API }: {
  setupData: any;
  copyText: (text: string, id: string) => void;
  copiedId: string | null;
  fetchData: () => void;
  API: string;
}) {
  const [redcapUrl, setRedcapUrl] = useState(setupData.connection?.url || "");
  const [redcapToken, setRedcapToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);

  const stepStatusColors: Record<string, string> = {
    pending: "text-gray-400 bg-gray-400/10 border-gray-500/20",
    done: "text-emerald-400 bg-emerald-400/10 border-emerald-500/20",
    skipped: "text-amber-400 bg-amber-400/10 border-amber-500/20",
  };

  const stepIcons: Record<string, any> = {
    pending: CircleDot,
    done: CheckCircle,
    skipped: SkipForward,
  };

  const updateStepStatus = async (stepId: string, status: string) => {
    setUpdatingStep(stepId);
    try {
      await fetch(`${API}/api/research-pipeline/redcap-setup/steps/${stepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await fetchData();
    } catch { }
    setUpdatingStep(null);
  };

  const testConnection = async () => {
    if (!redcapUrl || !redcapToken) return;
    setConnecting(true);
    setConnectionResult(null);
    try {
      const resp = await fetch(`${API}/api/research-pipeline/redcap-setup/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: redcapUrl, token: redcapToken }),
      });
      const data = await resp.json();
      setConnectionResult(data);
      await fetchData();
    } catch (err: any) {
      setConnectionResult({ connected: false, error: err.message });
    }
    setConnecting(false);
  };

  const importDictionary = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const resp = await fetch(`${API}/api/research-pipeline/redcap-setup/import-dictionary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      setImportResult(data);
      await fetchData();
    } catch (err: any) {
      setImportResult({ success: false, error: err.message });
    }
    setImporting(false);
  };

  const completedSteps = setupData.steps.filter((s: any) => s.status === "done").length;
  const totalSteps = setupData.steps.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-orange-400" /> REDCap Development Setup
        </h2>
        <p className="text-xs text-muted-foreground mt-1">Step-by-step guide to request and configure your REDCap project in Development mode. No IRB approval needed for this stage.</p>
      </div>

      <div className="glass-panel rounded-xl p-4 border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">Setup Progress</span>
          <span className="text-sm font-bold text-orange-400">{completedSteps}/{totalSteps}</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all" style={{ width: `${(completedSteps / totalSteps) * 100}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {setupData.steps.map((step: any) => {
          const Icon = stepIcons[step.status] || CircleDot;
          return (
            <div key={step.id} className={`glass-panel rounded-xl border p-4 ${step.status === "done" ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-white/5"}`}>
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground font-mono w-5">{step.step}.</span>
                  <Icon className={`w-4 h-4 ${step.status === "done" ? "text-emerald-400" : step.status === "skipped" ? "text-amber-400" : "text-gray-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${step.status === "done" ? "text-emerald-300 line-through" : "text-white"}`}>{step.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{step.description}</div>
                  {step.details && <div className="text-[10px] text-muted-foreground/70 mt-1 italic">{step.details}</div>}
                </div>
                <select
                  value={step.status}
                  onChange={(e) => updateStepStatus(step.id, e.target.value)}
                  disabled={updatingStep === step.id}
                  className={`px-2 py-1 rounded text-[10px] font-medium border cursor-pointer ${stepStatusColors[step.status]}`}
                >
                  <option value="pending">Pending</option>
                  <option value="done">Done</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Mail className="w-4 h-4 text-violet-400" /> REDCap Admin Request Email
        </h3>
        <p className="text-xs text-muted-foreground">Copy this email and send it to your institution's REDCap administrator to request a new project.</p>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Subject:</span>
            <span className="text-white font-medium">{setupData.adminEmail.subject}</span>
          </div>
          <div className="whitespace-pre-line text-xs text-white/80 leading-relaxed bg-white/[0.02] rounded-lg p-4 border border-white/5 max-h-64 overflow-y-auto">
            {setupData.adminEmail.body}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => copyText(`Subject: ${setupData.adminEmail.subject}\n\n${setupData.adminEmail.body}`, "admin-email")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600/30 transition-all"
          >
            {copiedId === "admin-email" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedId === "admin-email" ? "Copied" : "Copy Email"}
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Plug className="w-4 h-4 text-cyan-400" /> REDCap API Connection
        </h3>
        <p className="text-xs text-muted-foreground">Once you have your REDCap project and API token, connect it here to enable direct data dictionary import.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">REDCap URL</label>
            <input
              type="url"
              value={redcapUrl}
              onChange={(e) => setRedcapUrl(e.target.value)}
              placeholder="https://redcap.yourschool.edu"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder:text-muted-foreground/50 focus:border-cyan-500/50 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">API Token</label>
            <input
              type="password"
              value={redcapToken}
              onChange={(e) => setRedcapToken(e.target.value)}
              placeholder="Enter your REDCap API token"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs placeholder:text-muted-foreground/50 focus:border-cyan-500/50 focus:outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={testConnection}
              disabled={connecting || !redcapUrl || !redcapToken}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              {connecting ? "Testing..." : "Test Connection"}
            </button>

            {setupData.connection?.connected && (
              <button
                onClick={importDictionary}
                disabled={importing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {importing ? "Importing..." : "Import Data Dictionary"}
              </button>
            )}
          </div>

          {setupData.connection?.connected && (
            <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">Connected to: {setupData.connection.projectTitle || "REDCap Project"}</span>
            </div>
          )}

          {connectionResult && (
            <div className={`text-xs p-3 rounded-lg border ${connectionResult.connected ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-red-500/10 border-red-500/20 text-red-300"}`}>
              {connectionResult.connected ? (
                <div className="flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Connected successfully! Project: {connectionResult.projectTitle}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Connection failed: {connectionResult.error}</span>
                </div>
              )}
            </div>
          )}

          {importResult && (
            <div className={`text-xs p-3 rounded-lg border ${importResult.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-red-500/10 border-red-500/20 text-red-300"}`}>
              {importResult.success ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Data dictionary imported successfully! {importResult.fieldsImported} fields pushed to REDCap.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Import failed: {importResult.error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
