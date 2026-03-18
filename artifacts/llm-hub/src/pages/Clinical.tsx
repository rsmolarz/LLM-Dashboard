import { useState } from "react";
import { Stethoscope, Ear, BookOpen, FileText, Pill, Heart, ImageIcon, ClipboardList, Loader2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";

type Tab = "decisions" | "audiogram" | "cases" | "reports" | "drugs" | "education" | "annotations" | "protocols";

const TABS: { id: Tab; label: string; icon: any; desc: string }[] = [
  { id: "decisions", label: "Clinical Decisions", icon: Stethoscope, desc: "AI-assisted diagnosis" },
  { id: "audiogram", label: "Audiogram AI", icon: Ear, desc: "Hearing test analysis" },
  { id: "cases", label: "Case Studies", icon: BookOpen, desc: "Generate ENT cases" },
  { id: "reports", label: "Report Writer", icon: FileText, desc: "Draft clinical reports" },
  { id: "drugs", label: "Drug Interactions", icon: Pill, desc: "Medication safety" },
  { id: "education", label: "Patient Education", icon: Heart, desc: "Education materials" },
  { id: "annotations", label: "Image Annotation", icon: ImageIcon, desc: "AI image analysis" },
  { id: "protocols", label: "Protocols", icon: ClipboardList, desc: "Clinical pathways" },
];

function ClinicalDecisionsTab() {
  const [symptoms, setSymptoms] = useState("");
  const [history, setHistory] = useState("");
  const [findings, setFindings] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [pastDecisions, setPastDecisions] = useState<any[]>([]);

  const analyze = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/clinical/decisions/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms, history, findings }),
      });
      const data = await r.json();
      setResult(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadPast = async () => {
    const r = await fetch(`${API}/clinical/decisions`);
    setPastDecisions(await r.json());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Clinical Decision Support</h2>
          <p className="text-gray-400 text-sm">AI-assisted differential diagnosis using Meditron</p>
        </div>
        <button onClick={loadPast} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">History</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-400">Presenting Symptoms *</label>
            <textarea value={symptoms} onChange={e => setSymptoms(e.target.value)} rows={3}
              className="w-full mt-1 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              placeholder="e.g., Right-sided hearing loss, tinnitus for 3 months, occasional vertigo..." />
          </div>
          <div>
            <label className="text-sm text-gray-400">Relevant History</label>
            <textarea value={history} onChange={e => setHistory(e.target.value)} rows={2}
              className="w-full mt-1 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              placeholder="e.g., No prior ear surgery, no noise exposure, family history of hearing loss..." />
          </div>
          <div>
            <label className="text-sm text-gray-400">Examination Findings</label>
            <textarea value={findings} onChange={e => setFindings(e.target.value)} rows={2}
              className="w-full mt-1 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              placeholder="e.g., TM intact bilaterally, Rinne negative right, Weber lateralizes right..." />
          </div>
          <button onClick={analyze} disabled={loading || !symptoms}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Stethoscope className="w-4 h-4" /> Analyze Symptoms</>}
          </button>
        </div>

        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          {result ? (
            <div className="space-y-3">
              <h3 className="text-white font-semibold">Differential Diagnoses</h3>
              {result.parsed?.differentials?.map((d: any, i: number) => (
                <div key={i} className="p-2 bg-gray-700/50 rounded">
                  <div className="flex justify-between">
                    <span className="text-white text-sm font-medium">{d.diagnosis}</span>
                    <span className="text-cyan-400 text-sm">{(d.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-gray-400 text-xs mt-1">{d.reasoning}</p>
                </div>
              )) || <p className="text-gray-400 text-sm whitespace-pre-wrap">{result.parsed?.raw || JSON.stringify(result.parsed, null, 2)}</p>}
              {result.urgencyLevel && (
                <div className={`text-sm font-medium px-3 py-1 rounded inline-block ${result.urgencyLevel === "emergency" ? "bg-red-500/20 text-red-400" : result.urgencyLevel === "urgent" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}`}>
                  Urgency: {result.urgencyLevel}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12">
              <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Enter symptoms to get AI-assisted differential diagnosis</p>
            </div>
          )}
        </div>
      </div>

      {pastDecisions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-white font-semibold">Recent Analyses</h3>
          {pastDecisions.slice(0, 5).map((d: any) => (
            <div key={d.id} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <p className="text-white text-sm">{d.symptoms?.substring(0, 100)}...</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-cyan-400">{d.urgencyLevel}</span>
                <span className="text-xs text-gray-500">{new Date(d.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AudiogramTab() {
  const [frequencies, setFrequencies] = useState<Record<string, { right: number; left: number }>>({
    "250": { right: 15, left: 15 }, "500": { right: 20, left: 20 },
    "1000": { right: 25, left: 25 }, "2000": { right: 30, left: 25 },
    "4000": { right: 40, left: 30 }, "8000": { right: 45, left: 35 },
  });
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyze = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/clinical/audiogram/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequencies, patientAge: age ? parseInt(age) : null }),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Audiogram AI Analyzer</h2>
      <p className="text-gray-400 text-sm">Input audiogram thresholds for AI interpretation</p>

      <div className="grid grid-cols-6 gap-2">
        {Object.entries(frequencies).map(([freq, vals]) => (
          <div key={freq} className="text-center">
            <label className="text-xs text-gray-400 block">{freq} Hz</label>
            <input type="number" value={vals.right}
              onChange={e => setFrequencies(p => ({ ...p, [freq]: { ...p[freq], right: parseInt(e.target.value) || 0 } }))}
              className="w-full mt-1 p-1.5 bg-gray-800 border border-red-500/30 rounded text-red-400 text-xs text-center" />
            <span className="text-[10px] text-red-400">R</span>
            <input type="number" value={vals.left}
              onChange={e => setFrequencies(p => ({ ...p, [freq]: { ...p[freq], left: parseInt(e.target.value) || 0 } }))}
              className="w-full mt-1 p-1.5 bg-gray-800 border border-blue-500/30 rounded text-blue-400 text-xs text-center" />
            <span className="text-[10px] text-blue-400">L</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-sm text-gray-400">Patient Age</label>
          <input value={age} onChange={e => setAge(e.target.value)} type="number"
            className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
        </div>
        <button onClick={analyze} disabled={loading}
          className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ear className="w-4 h-4" />} Analyze
        </button>
      </div>

      {result?.parsed && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-700/50 rounded">
              <span className="text-xs text-gray-400">Hearing Loss Type</span>
              <p className="text-white font-medium">{result.parsed.hearingLossType || "—"}</p>
            </div>
            <div className="p-3 bg-gray-700/50 rounded">
              <span className="text-xs text-gray-400">Severity</span>
              <p className="text-white font-medium">{result.parsed.severity || "—"}</p>
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-400">Interpretation</span>
            <p className="text-gray-300 text-sm mt-1">{result.parsed.interpretation || result.aiInterpretation}</p>
          </div>
          {result.parsed.recommendations?.length > 0 && (
            <div>
              <span className="text-xs text-gray-400">Recommendations</span>
              <ul className="list-disc list-inside text-gray-300 text-sm mt-1">
                {result.parsed.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CaseStudiesTab() {
  const [category, setCategory] = useState("otology");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [loading, setLoading] = useState(false);
  const [currentCase, setCurrentCase] = useState<any>(null);
  const [cases, setCases] = useState<any[]>([]);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/clinical/cases/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, difficulty }),
      });
      setCurrentCase(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCases = async () => {
    const r = await fetch(`${API}/clinical/cases`);
    setCases(await r.json());
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">ENT Case Study Generator</h2>
      <div className="flex gap-3 flex-wrap">
        {["otology", "rhinology", "laryngology", "head-neck"].map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded text-sm ${category === c ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50" : "bg-gray-800 text-gray-400 border border-gray-700"}`}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
        <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
          className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-300 border border-gray-700">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <button onClick={generate} disabled={loading}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Generate Case
        </button>
        <button onClick={loadCases} className="px-3 py-1.5 rounded bg-gray-700 text-gray-300 text-sm">View All</button>
      </div>

      {currentCase && (
        <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700 space-y-4">
          <h3 className="text-white font-bold text-lg">{currentCase.title}</h3>
          <div className="space-y-3 text-sm">
            <div><span className="text-cyan-400 font-medium">Presentation:</span><p className="text-gray-300 mt-1">{currentCase.presentation}</p></div>
            {currentCase.diagnosis && <div><span className="text-cyan-400 font-medium">Diagnosis:</span><p className="text-gray-300 mt-1">{currentCase.diagnosis}</p></div>}
            {currentCase.workup && <div><span className="text-cyan-400 font-medium">Workup:</span><p className="text-gray-300 mt-1">{currentCase.workup}</p></div>}
            {currentCase.management && <div><span className="text-cyan-400 font-medium">Management:</span><p className="text-gray-300 mt-1">{currentCase.management}</p></div>}
          </div>
        </div>
      )}

      {cases.length > 0 && (
        <div className="space-y-2">{cases.slice(0, 10).map((c: any) => (
          <div key={c.id} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 cursor-pointer hover:border-cyan-500/50" onClick={() => setCurrentCase(c)}>
            <div className="flex justify-between"><span className="text-white text-sm font-medium">{c.title}</span><span className="text-xs text-gray-500">{c.category} / {c.difficulty}</span></div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

function SimpleGenTab({ title, desc, endpoint, fields, resultKey }: { title: string; desc: string; endpoint: string; fields: { key: string; label: string; type?: string; options?: string[] }[]; resultKey: string }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      setResult(await r.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="text-gray-400 text-sm">{desc}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-sm text-gray-400">{f.label}</label>
            {f.options ? (
              <select value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm">
                <option value="">Select...</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} rows={3}
                className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
            ) : (
              <input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" />
            )}
          </div>
        ))}
      </div>
      <button onClick={generate} disabled={loading}
        className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Generate
      </button>
      {result && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <pre className="text-gray-300 text-sm whitespace-pre-wrap">{result[resultKey] || result.generatedReport || result.content || JSON.stringify(result.parsed || result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default function Clinical() {
  const [tab, setTab] = useState<Tab>("decisions");

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
          <Stethoscope className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">ENT Clinical AI</h1>
          <p className="text-gray-400 text-sm">AI-powered clinical tools for otolaryngology practice</p>
        </div>
      </div>

      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`p-3 rounded-lg text-center transition-all ${tab === t.id ? "bg-red-500/20 border border-red-500/50" : "bg-gray-800/50 border border-gray-700 hover:border-gray-600"}`}>
            <t.icon className={`w-5 h-5 mx-auto mb-1 ${tab === t.id ? "text-red-400" : "text-gray-400"}`} />
            <span className={`text-xs block ${tab === t.id ? "text-red-300" : "text-gray-400"}`}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        {tab === "decisions" && <ClinicalDecisionsTab />}
        {tab === "audiogram" && <AudiogramTab />}
        {tab === "cases" && <CaseStudiesTab />}
        {tab === "reports" && <SimpleGenTab title="Medical Report Writer" desc="AI-generated clinical reports from structured input"
          endpoint="/clinical/reports/generate"
          fields={[
            { key: "reportType", label: "Report Type", options: ["operative_note", "clinic_letter", "discharge_summary", "consultation"] },
            { key: "inputData", label: "Clinical Information", type: "textarea" },
          ]} resultKey="generatedReport" />}
        {tab === "drugs" && <SimpleGenTab title="Drug Interaction Checker" desc="AI-analyzed ENT medication interactions"
          endpoint="/clinical/drug-interactions/check"
          fields={[{ key: "drugs", label: "Medications (comma-separated)", type: "textarea" }]} resultKey="interactions" />}
        {tab === "education" && <SimpleGenTab title="Patient Education Generator" desc="Create patient-friendly education materials"
          endpoint="/clinical/patient-education/generate"
          fields={[
            { key: "topic", label: "Topic" },
            { key: "category", label: "Category", options: ["otology", "rhinology", "laryngology", "head-neck", "general"] },
            { key: "readingLevel", label: "Reading Level", options: ["4th grade", "6th grade", "8th grade", "high school"] },
          ]} resultKey="content" />}
        {tab === "annotations" && <SimpleGenTab title="ENT Image Annotation" desc="AI-assisted image analysis for endoscopy and otoscopy"
          endpoint="/clinical/annotations/analyze"
          fields={[
            { key: "imageType", label: "Image Type", options: ["endoscopy", "otoscopy", "CT scan", "MRI", "laryngoscopy"] },
            { key: "imageUrl", label: "Image URL (optional)" },
          ]} resultKey="pathologyFindings" />}
        {tab === "protocols" && <SimpleGenTab title="Clinical Protocol Builder" desc="AI-generated evidence-based clinical pathways"
          endpoint="/clinical/protocols/generate"
          fields={[
            { key: "condition", label: "Condition" },
            { key: "category", label: "Category", options: ["diagnostic", "therapeutic", "surgical", "follow-up"] },
          ]} resultKey="steps" />}
      </div>
    </div>
  );
}
