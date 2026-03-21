import { Router } from "express";

const router = Router();

interface RedcapInstrument {
  id: string;
  name: string;
  description: string;
  fields: RedcapField[];
  repeating: boolean;
}

interface RedcapField {
  name: string;
  type: "text" | "radio" | "checkbox" | "dropdown" | "slider" | "file" | "notes";
  label: string;
  choices?: string;
  validation?: string;
  validationMin?: string;
  validationMax?: string;
  required: boolean;
}

interface IrbSection {
  id: string;
  title: string;
  content: string;
  status: "draft" | "review" | "approved" | "submitted";
}

interface OutreachEmail {
  id: string;
  label: string;
  targetAudience: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "replied";
}

interface ConsentSection {
  id: string;
  title: string;
  content: string;
}

interface PipelineTask {
  id: string;
  phase: string;
  task: string;
  status: "not_started" | "in_progress" | "completed" | "blocked";
  assignee: string;
  dueDate: string | null;
  notes: string;
}

const redcapInstruments: RedcapInstrument[] = [
  {
    id: "enrollment",
    name: "Patient Enrollment",
    description: "Completed once per patient at study entry. Captures de-identified demographics and enrollment metadata.",
    repeating: false,
    fields: [
      { name: "study_id", type: "text", label: "Study ID", required: true },
      { name: "enrollment_date", type: "text", label: "Month/Year of Enrollment", required: true },
      { name: "age_range", type: "radio", label: "Patient Age Range", choices: "1, 18-30 | 2, 31-45 | 3, 46-60 | 4, 61-75 | 5, 76+", required: true },
      { name: "biological_sex", type: "radio", label: "Biological Sex", choices: "1, Male | 2, Female | 3, Intersex | 4, Unknown", required: true },
      { name: "race_ethnicity", type: "checkbox", label: "Race / Ethnicity", choices: "1, White | 2, Black/AA | 3, Hispanic | 4, Asian | 5, AI/AN | 6, NHPI | 7, Other | 8, Prefer not to say", required: true },
      { name: "region", type: "dropdown", label: "Geographic Region (US only)", choices: "1, Northeast | 2, Southeast | 3, Midwest | 4, Southwest | 5, West | 6, US Territory | 7, Non-US", required: true },
      { name: "practice_setting", type: "radio", label: "Practice Setting", choices: "1, Academic | 2, Community | 3, VA | 4, FQHC | 5, Other", required: false },
      { name: "consent_obtained", type: "radio", label: "Research Consent Obtained?", choices: "1, Yes | 2, Waiver granted | 3, Pending", required: true },
    ],
  },
  {
    id: "clinical_presentation",
    name: "Clinical Presentation",
    description: "Repeating instrument completed once per clinical visit. Captures presenting symptoms and clinical context.",
    repeating: true,
    fields: [
      { name: "visit_number", type: "text", label: "Visit Number", validation: "integer", validationMin: "1", required: true },
      { name: "visit_month_year", type: "text", label: "Visit Month/Year", required: true },
      { name: "chief_complaint", type: "checkbox", label: "Chief Complaint(s)", choices: "1, Hoarseness | 2, Dysphagia | 3, Odynophagia | 4, Throat pain | 5, Otalgia | 6, Hearing loss | 7, Nasal obstruction | 8, Epistaxis | 9, Neck mass | 10, Globus | 11, Dysphonia | 12, Other", required: true },
      { name: "symptom_duration", type: "radio", label: "Symptom Duration", choices: "1, <2 weeks | 2, 2-6 weeks | 3, 1-3 months | 4, 3-6 months | 5, 6-12 months | 6, >1 year", required: true },
      { name: "symptom_severity", type: "slider", label: "Patient-Reported Severity (0-10)", validationMin: "0", validationMax: "10", required: false },
      { name: "tobacco_use", type: "radio", label: "Tobacco Use", choices: "1, Never | 2, Former | 3, Current (<10 pk-yr) | 4, Current (>=10 pk-yr) | 5, Unknown", required: true },
      { name: "alcohol_use", type: "radio", label: "Alcohol Use", choices: "1, None | 2, Social | 3, Moderate | 4, Heavy | 5, Unknown", required: true },
      { name: "gerd_status", type: "radio", label: "GERD/LPR History", choices: "1, None | 2, Suspected | 3, Diagnosed untreated | 4, Diagnosed on PPI | 5, Unknown", required: false },
      { name: "voice_use", type: "radio", label: "Professional Voice Use", choices: "1, None | 2, Moderate | 3, Professional singer/speaker | 4, Teacher | 5, Clergy | 6, Call center | 7, Other", required: false },
      { name: "prior_procedures", type: "checkbox", label: "Prior ENT Procedures", choices: "1, None | 2, Tonsillectomy | 3, Septoplasty | 4, FESS | 5, Laryngeal surgery | 6, Thyroidectomy | 7, Neck dissection | 8, Intubation (recent) | 9, Other", required: false },
    ],
  },
  {
    id: "diagnosis",
    name: "Diagnosis & Classification",
    description: "Links the visit to a confirmed clinical or pathological diagnosis. One record per encounter.",
    repeating: true,
    fields: [
      { name: "primary_dx_icd10", type: "text", label: "Primary Diagnosis ICD-10", required: true },
      { name: "primary_dx_label", type: "text", label: "Primary Diagnosis (Free Text)", required: true },
      { name: "dx_category", type: "dropdown", label: "Diagnosis Category", choices: "1, Laryngeal lesion | 2, Vocal fold paralysis | 3, Voice disorder | 4, Hearing loss | 5, Middle ear disease | 6, Sinonasal | 7, Head & neck mass | 8, Dysphagia | 9, Airway | 10, Thyroid/parathyroid | 11, Other", required: true },
      { name: "dx_laterality", type: "radio", label: "Laterality", choices: "1, Left | 2, Right | 3, Bilateral | 4, Midline | 5, N/A", required: false },
      { name: "dx_method", type: "checkbox", label: "Diagnostic Method", choices: "1, Clinical exam | 2, Flexible laryngoscopy | 3, Stroboscopy | 4, Audiometry | 5, CT | 6, MRI | 7, Biopsy | 8, Other", required: true },
      { name: "dx_confirmed_by", type: "radio", label: "Diagnosis Confirmed By", choices: "1, Single attending | 2, Consensus (2+ reviewers) | 3, Pathology report", required: true },
      { name: "histology", type: "text", label: "Histological Diagnosis (if biopsy)", required: false },
      { name: "tnm_stage", type: "text", label: "TNM Stage (if malignant)", required: false },
    ],
  },
  {
    id: "imaging",
    name: "Imaging & Media Records",
    description: "Repeating instrument for each image, video, or voice recording. All media must be de-identified.",
    repeating: true,
    fields: [
      { name: "media_type", type: "radio", label: "Media Type", choices: "1, Still image | 2, Video clip | 3, Voice recording | 4, CT/MRI DICOM | 5, Other", required: true },
      { name: "modality", type: "dropdown", label: "Imaging Modality", choices: "1, Flexible laryngoscopy | 2, Rigid stroboscopy | 3, Otoscopy | 4, Nasal endoscopy | 5, CT | 6, MRI | 7, Ultrasound | 8, External photo | 9, Other", required: true },
      { name: "capture_date_approx", type: "text", label: "Approximate Date of Capture", required: true },
      { name: "media_file", type: "file", label: "Upload De-identified Media", required: true },
      { name: "media_quality", type: "radio", label: "Image/Video Quality", choices: "1, Excellent | 2, Good | 3, Adequate | 4, Poor | 5, Unusable", required: true },
      { name: "pathology_visible", type: "radio", label: "Is Pathology Visible?", choices: "1, Yes clearly | 2, Yes partially | 3, No | 4, Uncertain", required: true },
      { name: "annotation_label", type: "checkbox", label: "Annotation Labels Applied", choices: "1, Normal | 2, Nodule | 3, Polyp | 4, Cyst | 5, Leukoplakia | 6, Carcinoma | 7, Paralysis | 8, Edema | 9, Granuloma | 10, Papilloma | 11, Other", required: true },
      { name: "annotator_id", type: "text", label: "Annotator ID", required: true },
      { name: "annotation_confidence", type: "radio", label: "Annotation Confidence", choices: "1, Definite | 2, Probable | 3, Uncertain", required: true },
    ],
  },
  {
    id: "voice_data",
    name: "Voice & Acoustic Data",
    description: "Captures structured voice recordings and objective voice quality metrics.",
    repeating: true,
    fields: [
      { name: "recording_type", type: "checkbox", label: "Recording Type(s)", choices: "1, Sustained /a/ | 2, Sustained /i/ | 3, Running speech (Rainbow Passage) | 4, Running speech (spontaneous) | 5, Maximum phonation time | 6, Glides (pitch range) | 7, Other", required: true },
      { name: "recording_environment", type: "radio", label: "Recording Environment", choices: "1, Sound-treated room | 2, Quiet clinic room | 3, Untreated room | 4, Other", required: true },
      { name: "microphone_type", type: "text", label: "Microphone / Equipment Used", required: false },
      { name: "sampling_rate", type: "radio", label: "Sampling Rate", choices: "1, 16 kHz | 2, 22.05 kHz | 3, 44.1 kHz | 4, 48 kHz | 5, Other", required: true },
      { name: "f0_mean", type: "text", label: "Mean F0 (Hz)", validation: "number", required: false },
      { name: "jitter_percent", type: "text", label: "Jitter (%)", validation: "number", required: false },
      { name: "shimmer_percent", type: "text", label: "Shimmer (%)", validation: "number", required: false },
      { name: "hnr", type: "text", label: "Harmonics-to-Noise Ratio (dB)", validation: "number", required: false },
      { name: "mpt_seconds", type: "text", label: "Maximum Phonation Time (sec)", validation: "number", required: false },
      { name: "vhi_score", type: "text", label: "Voice Handicap Index Score (0-120)", validation: "integer", validationMin: "0", validationMax: "120", required: false },
      { name: "cape_v_overall", type: "slider", label: "CAPE-V Overall Severity (0-100)", validationMin: "0", validationMax: "100", required: false },
      { name: "grabs_grade", type: "radio", label: "GRBAS Grade", choices: "0, Normal | 1, Slight | 2, Moderate | 3, Severe", required: false },
    ],
  },
  {
    id: "treatment_outcomes",
    name: "Treatment & Outcomes",
    description: "Captures treatment and follow-up outcomes. May be entered at multiple time points.",
    repeating: true,
    fields: [
      { name: "treatment_type", type: "checkbox", label: "Treatment(s) Applied", choices: "1, Observation | 2, Voice therapy | 3, Medical (PPI steroids) | 4, Injection laryngoplasty | 5, Microlaryngoscopy | 6, Laser surgery | 7, Radiation | 8, Chemoradiation | 9, Neck dissection | 10, Other", required: true },
      { name: "treatment_date", type: "text", label: "Treatment Date", required: true },
      { name: "follow_up_months", type: "text", label: "Follow-up Time (months from treatment)", validation: "integer", validationMin: "0", required: false },
      { name: "outcome_category", type: "radio", label: "Outcome Category", choices: "1, Resolved | 2, Improved | 3, Stable | 4, Worsened | 5, Recurrence | 6, N/A", required: true },
      { name: "post_vhi", type: "text", label: "Post-Treatment VHI Score", validation: "integer", validationMin: "0", validationMax: "120", required: false },
      { name: "post_cape_v", type: "slider", label: "Post-Treatment CAPE-V Overall (0-100)", validationMin: "0", validationMax: "100", required: false },
      { name: "complications", type: "checkbox", label: "Complications", choices: "1, None | 2, Bleeding | 3, Infection | 4, Airway compromise | 5, Scarring | 6, Dysphagia | 7, Voice worsening | 8, Other", required: false },
      { name: "readmission", type: "radio", label: "Unplanned Readmission?", choices: "1, Yes | 0, No", required: false },
    ],
  },
];

const irbSections: IrbSection[] = [
  { id: "title", title: "Title & Key Personnel", content: "Protocol Title: Development of a De-identified Clinical Dataset for Machine Learning in Otolaryngology\nShort Title: ENT-AI Dataset Development\nReview Category: Exempt Category 4 (de-identified EHR data) OR Expedited Review", status: "draft" },
  { id: "background", title: "Background & Significance", content: "Otolaryngology represents a specialty with high unmet need for AI-assisted diagnostic tools. Flexible laryngoscopy, otoscopy, and voice analysis are central to ENT diagnosis, yet there is a critical shortage of publicly available, labeled datasets for ML model development. Deep learning models can classify laryngeal pathology, detect tympanic membrane disease, and analyze voice disorders with accuracy approaching expert clinicians, but the field is limited by small, single-institution datasets.", status: "draft" },
  { id: "aims", title: "Specific Aims", content: "Aim 1: Create a structured, de-identified database of ENT clinical encounters including diagnoses, procedures, demographic data, and outcomes.\nAim 2: Develop a labeled image and video dataset of flexible laryngoscopy, otoscopy, and stroboscopy recordings with expert-annotated pathology labels.\nAim 3: Collect a voice biomarker dataset including sustained vowel phonation, running speech, and maximum phonation time recordings linked to confirmed clinical diagnoses.\nAim 4: Develop and internally validate a machine learning model for classification of laryngeal lesions using the collected dataset.", status: "draft" },
  { id: "design", title: "Study Design", content: "Mixed design: Retrospective chart review PLUS prospective data collection.\nRetrospective Phase: Review of ENT clinic encounters using ICD-10 codes for laryngology, otology, and rhinology diagnoses.\nProspective Phase: Consented patients in outpatient ENT clinic will have clinical images/recordings linked to their de-identified research record.", status: "draft" },
  { id: "population", title: "Study Population & Eligibility", content: "Inclusion: Patients seen in ENT/otolaryngology outpatient clinic, age 18+, encounter ICD-10 code within scope.\nExclusion: Patients who opted out of research use, encounters with insufficient documentation.\nTarget: Retrospective cohort 500-2000 encounters; Prospective cohort 200-500 patients over 12-18 months.", status: "draft" },
  { id: "data_management", title: "Data Management & Security", content: "All data de-identified per HIPAA Safe Harbor (18 identifiers removed).\nStorage: REDCap for structured data, institutional secure media server for images/video/audio.\nAccess: Role-based, PI + approved team only.\nRetention: Minimum 7 years per institutional policy.", status: "draft" },
  { id: "risk_assessment", title: "Risk Assessment", content: "Risk Level: Minimal risk (no intervention, de-identified data only).\nPrimary risk: Re-identification from facial images or rare diagnoses.\nMitigation: Face cropping, rare diagnosis suppression, k-anonymity checks.", status: "draft" },
  { id: "consent", title: "Consent Process", content: "Retrospective arm: Waiver of consent requested (de-identified data, minimal risk, impracticable to contact).\nProspective arm: Written informed consent with optional media release addendum.\nConsent form includes plain-language explanation of AI research purpose.", status: "draft" },
];

const outreachEmails: OutreachEmail[] = [
  {
    id: "faculty",
    label: "ML Faculty / Lab Director",
    targetAudience: "CS/EE professor with a medical imaging or NLP lab",
    subject: "Collaboration Opportunity — Labeled ENT Dataset for AI Research",
    body: `Dear [Professor Name],

I am an otolaryngologist at [Institution] developing a de-identified clinical dataset of flexible laryngoscopy images, voice recordings, and structured EHR data from ENT patients — specifically designed for machine learning applications.

The project:
  - IRB-approved (or in preparation), HIPAA-compliant, fully de-identified
  - REDCap-hosted structured data with expert pathology labels
  - ~500–2,000 annotated encounters spanning laryngeal lesions, vocal fold paralysis, otologic conditions, and voice disorders
  - Multiple modalities: endoscopic images/video, voice recordings, acoustic features, and structured clinical data

I am seeking a collaborator with expertise in deep learning for medical image classification, voice/audio signal processing, or clinical NLP to partner on model development and co-author resulting publications.

Your lab's work on [specific recent paper/project] is highly relevant, and I believe there is a strong opportunity for a high-impact collaboration.

Would you be open to an introductory meeting? I can share the REDCap schema and preliminary data summary in advance.`,
    status: "draft",
  },
  {
    id: "informatics",
    label: "Clinical Informatics / Data Science Team",
    targetAudience: "Internal institutional data science or clinical informatics staff",
    subject: "AI Research Project — ENT Dataset & EHR Collaboration",
    body: `Dear [Name / Team],

I am reaching out from the Department of Otolaryngology regarding a clinical AI research project I am developing and hoping your team might be well-positioned to support.

The project involves:
  1. A retrospective cohort query from Epic/EHR for ENT patients with specific ICD-10 codes
  2. De-identification of structured and free-text clinical data per HIPAA Safe Harbor
  3. Storage of de-identified data in REDCap and a secure media repository
  4. Downstream machine learning model development

I have an IRB application in preparation and am hoping to understand what data extraction, de-identification, and storage infrastructure is available through [Institution].

Would you be available for an introductory meeting? I can send over the study protocol and REDCap data schema in advance.`,
    status: "draft",
  },
  {
    id: "student",
    label: "Graduate Student / Postdoc",
    targetAudience: "PhD student or postdoc whose work aligns — found via recent publications",
    subject: "Annotated Medical Imaging Dataset for Your Research — Potential Collaboration",
    body: `Dear [Name],

I came across your recent work on [their paper/project topic] and was struck by how well it aligns with a clinical AI project I am developing in otolaryngology.

I am an ENT specialist building a labeled dataset of flexible laryngoscopy images and voice recordings linked to confirmed clinical diagnoses. The dataset will be structured for classification and detection tasks.

This could work well as a dissertation chapter, conference paper, or journal publication, and the dataset itself — if well-constructed — would be publishable in a data journal (e.g., Scientific Data, Data in Brief).

The clinical side (data collection, annotation, IRB) is handled entirely by my team. What I'm looking for is someone who can lead the modeling — architecture selection, training, evaluation, ablation studies — and contribute to writing up the results.

Would you be interested in learning more? I'd be happy to send over a one-page project summary and sample data schema.`,
    status: "draft",
  },
];

const consentSections: ConsentSection[] = [
  { id: "what", title: "What Is This Addendum?", content: "This is an optional research consent form separate from regular care. Signing is not required to receive care. Treatment will not be affected by your decision. This addendum asks permission to use information from your visit — including clinical notes, images, video recordings, and voice recordings — for an AI research study in ENT diagnosis." },
  { id: "why", title: "Why Are We Doing This Study?", content: "AI tools have the potential to help doctors diagnose ENT conditions more accurately and to bring specialized ENT expertise to areas where specialists are not readily available. To develop these tools, researchers need large collections of labeled clinical images and data." },
  { id: "involve", title: "What Would Participation Involve?", content: "We WILL: Use images or video captured during your clinical exam (taken as part of standard care), use any voice recordings made during your visit, use relevant medical record information (diagnosis, symptoms, treatment).\n\nWe will NOT: Perform extra procedures beyond standard care, store your name/DOB/MRN or identifying information, share identified information with outside parties, sell your data." },
  { id: "protection", title: "How Will My Information Be Protected?", content: "De-identification: All identifying information removed before entering the research database.\nStudy ID System: Random code assigned (e.g., ENT-0042), only the PI can link it back.\nSecure Storage: Encrypted, HIPAA-compliant servers with access restricted to approved team members.\nNo Sale of Data: Your data will never be sold." },
  { id: "risks", title: "Risks & Benefits", content: "Risks: Minimal. Very small chance of re-identification from medical images (mitigated by cropping faces and removing metadata). No physical risk.\nBenefits: No direct benefit to you. Your participation may help future ENT patients by improving AI diagnostic tools." },
  { id: "rights", title: "Your Rights", content: "You may choose not to participate with no effect on care. You may withdraw at any time — data already collected may remain in the de-identified dataset. You may ask questions at any time by contacting the research team." },
];

const pipelineTasks: PipelineTask[] = [
  { id: "t1", phase: "IRB & Compliance", task: "Draft IRB protocol", status: "not_started", assignee: "PI", dueDate: null, notes: "Use template from platform" },
  { id: "t2", phase: "IRB & Compliance", task: "Submit IRB application", status: "not_started", assignee: "PI", dueDate: null, notes: "" },
  { id: "t3", phase: "IRB & Compliance", task: "Prepare consent addendum", status: "not_started", assignee: "Coordinator", dueDate: null, notes: "Template available" },
  { id: "t4", phase: "IRB & Compliance", task: "IRB approval received", status: "not_started", assignee: "IRB", dueDate: null, notes: "" },
  { id: "t5", phase: "Infrastructure", task: "Set up REDCap project", status: "not_started", assignee: "PI", dueDate: null, notes: "Use data schema from platform" },
  { id: "t6", phase: "Infrastructure", task: "Configure secure media storage", status: "not_started", assignee: "IT", dueDate: null, notes: "HIPAA-compliant server" },
  { id: "t7", phase: "Infrastructure", task: "Set up de-identification pipeline", status: "not_started", assignee: "Informatics", dueDate: null, notes: "HIPAA Safe Harbor, 18 identifiers" },
  { id: "t8", phase: "Data Collection", task: "Retrospective cohort query", status: "not_started", assignee: "Informatics", dueDate: null, notes: "ICD-10 codes for ENT diagnoses" },
  { id: "t9", phase: "Data Collection", task: "Begin prospective enrollment", status: "not_started", assignee: "Coordinator", dueDate: null, notes: "Target: 200-500 patients" },
  { id: "t10", phase: "Data Collection", task: "Image/video annotation (round 1)", status: "not_started", assignee: "PI + Fellows", dueDate: null, notes: "Expert labeling with confidence scores" },
  { id: "t11", phase: "Collaboration", task: "Send outreach emails to ML labs", status: "not_started", assignee: "PI", dueDate: null, notes: "Templates available" },
  { id: "t12", phase: "Collaboration", task: "Secure ML collaborator", status: "not_started", assignee: "PI", dueDate: null, notes: "" },
  { id: "t13", phase: "ML Development", task: "Export training dataset", status: "not_started", assignee: "ML Team", dueDate: null, notes: "JSONL format from platform" },
  { id: "t14", phase: "ML Development", task: "Model training (v1)", status: "not_started", assignee: "ML Team", dueDate: null, notes: "Classification model for laryngeal lesions" },
  { id: "t15", phase: "ML Development", task: "Evaluation & validation", status: "not_started", assignee: "ML Team + PI", dueDate: null, notes: "AUC, sensitivity, specificity metrics" },
  { id: "t16", phase: "Publication", task: "Draft manuscript", status: "not_started", assignee: "PI + ML Lead", dueDate: null, notes: "" },
  { id: "t17", phase: "Publication", task: "Submit to journal", status: "not_started", assignee: "PI", dueDate: null, notes: "Target: JAMA Otolaryngology, Laryngoscope" },
];

router.get("/research-pipeline/overview", (_req, res) => {
  const phases = ["IRB & Compliance", "Infrastructure", "Data Collection", "Collaboration", "ML Development", "Publication"];
  const phaseStats = phases.map(phase => {
    const tasks = pipelineTasks.filter(t => t.phase === phase);
    return {
      phase,
      total: tasks.length,
      completed: tasks.filter(t => t.status === "completed").length,
      inProgress: tasks.filter(t => t.status === "in_progress").length,
      blocked: tasks.filter(t => t.status === "blocked").length,
    };
  });

  const totalTasks = pipelineTasks.length;
  const completedTasks = pipelineTasks.filter(t => t.status === "completed").length;

  res.json({
    progress: parseFloat(((completedTasks / totalTasks) * 100).toFixed(1)),
    totalTasks,
    completedTasks,
    phases: phaseStats,
    instruments: redcapInstruments.length,
    totalFields: redcapInstruments.reduce((sum, i) => sum + i.fields.length, 0),
    irbSections: irbSections.length,
    outreachTemplates: outreachEmails.length,
  });
});

router.get("/research-pipeline/redcap-schema", (_req, res) => {
  res.json({ instruments: redcapInstruments });
});

router.get("/research-pipeline/irb", (_req, res) => {
  res.json({ sections: irbSections });
});

const validIrbStatuses = ["draft", "review", "approved", "submitted"] as const;
const validEmailStatuses = ["draft", "sent", "replied"] as const;
const validTaskStatuses = ["not_started", "in_progress", "completed", "blocked"] as const;

router.put("/research-pipeline/irb/:id", (req, res) => {
  const section = irbSections.find(s => s.id === req.params.id);
  if (!section) { res.status(404).json({ error: "Section not found" }); return; }
  if (req.body.content !== undefined) {
    if (typeof req.body.content !== "string") { res.status(400).json({ error: "content must be a string" }); return; }
    section.content = req.body.content;
  }
  if (req.body.status !== undefined) {
    if (!validIrbStatuses.includes(req.body.status)) { res.status(400).json({ error: `status must be one of: ${validIrbStatuses.join(", ")}` }); return; }
    section.status = req.body.status;
  }
  res.json({ section });
});

router.get("/research-pipeline/outreach", (_req, res) => {
  res.json({ emails: outreachEmails });
});

router.put("/research-pipeline/outreach/:id", (req, res) => {
  const email = outreachEmails.find(e => e.id === req.params.id);
  if (!email) { res.status(404).json({ error: "Email not found" }); return; }
  if (req.body.body !== undefined) {
    if (typeof req.body.body !== "string") { res.status(400).json({ error: "body must be a string" }); return; }
    email.body = req.body.body;
  }
  if (req.body.status !== undefined) {
    if (!validEmailStatuses.includes(req.body.status)) { res.status(400).json({ error: `status must be one of: ${validEmailStatuses.join(", ")}` }); return; }
    email.status = req.body.status;
  }
  res.json({ email });
});

router.get("/research-pipeline/consent", (_req, res) => {
  res.json({ sections: consentSections });
});

router.get("/research-pipeline/tasks", (_req, res) => {
  res.json({ tasks: pipelineTasks });
});

router.put("/research-pipeline/tasks/:id", (req, res) => {
  const task = pipelineTasks.find(t => t.id === req.params.id);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (req.body.status !== undefined) {
    if (!validTaskStatuses.includes(req.body.status)) { res.status(400).json({ error: `status must be one of: ${validTaskStatuses.join(", ")}` }); return; }
    task.status = req.body.status;
  }
  if (req.body.assignee !== undefined) {
    if (typeof req.body.assignee !== "string") { res.status(400).json({ error: "assignee must be a string" }); return; }
    task.assignee = req.body.assignee;
  }
  if (req.body.dueDate !== undefined) task.dueDate = req.body.dueDate;
  if (req.body.notes !== undefined) {
    if (typeof req.body.notes !== "string") { res.status(400).json({ error: "notes must be a string" }); return; }
    task.notes = req.body.notes;
  }
  res.json({ task });
});

interface RedcapSetupStep {
  id: string;
  step: number;
  title: string;
  description: string;
  status: "pending" | "done" | "skipped";
  details?: string;
}

const setupSteps: RedcapSetupStep[] = [
  { id: "s1", step: 1, title: "Identify your institution's REDCap admin", description: "Find out who manages REDCap at your institution. This is typically the Clinical Research Office, IT Research Services, or a Biomedical Informatics department.", status: "pending", details: "Check your institution's research website or ask your department research coordinator." },
  { id: "s2", step: 2, title: "Submit REDCap project request", description: "Request a new REDCap project in Development mode. Use the email template below or your institution's online request form.", status: "pending", details: "Most institutions process these within 1-5 business days." },
  { id: "s3", step: 3, title: "Import data dictionary", description: "Once your project is created, import the CSV data dictionary from this platform. Go to REDCap > Project Setup > Data Dictionary > Upload.", status: "pending", details: "Use the 'Export CSV' button on the REDCap Schema tab to download the file." },
  { id: "s4", step: 4, title: "Request API token", description: "In REDCap, go to API > Request API Token. Your admin must approve this. Once granted, enter the token in the connection panel below.", status: "pending", details: "API access may require additional IRB documentation at some institutions." },
  { id: "s5", step: 5, title: "Test API connection", description: "Enter your REDCap URL and API token in the connection panel below and test the connection.", status: "pending" },
  { id: "s6", step: 6, title: "Configure instruments in Development", description: "Review all 6 instruments in REDCap, test data entry forms, adjust field labels or branching logic as needed.", status: "pending" },
  { id: "s7", step: 7, title: "Move to Production (after IRB approval)", description: "Once IRB approves your protocol, move the project to Production mode to begin real data collection.", status: "pending", details: "This step requires IRB approval — do not move to Production before then." },
];

const redcapAdminEmail = {
  subject: "REDCap Project Request — ENT AI Clinical Dataset Research",
  body: `Dear REDCap Administrator,

I am writing to request a new REDCap project for a clinical research study in the Department of Otolaryngology.

Project Details:
  - Project Title: ENT-AI Dataset Development
  - PI: [YOUR NAME, MD]
  - Department: Otolaryngology — Head and Neck Surgery
  - Purpose: Development of a de-identified clinical dataset for machine learning research in otolaryngology
  - IRB Status: In preparation (data dictionary setup in Development mode only at this stage)
  - Estimated enrollment: 500–2,000 encounters (retrospective) + 200–500 patients (prospective)

I have a complete REDCap data dictionary (CSV) ready to import with 6 instruments and 55+ fields covering:
  1. Patient Enrollment (demographics, consent)
  2. Clinical Presentation (symptoms, history)
  3. Diagnosis & Classification (ICD-10, pathology)
  4. Imaging & Media Records (endoscopy, otoscopy)
  5. Voice & Acoustic Data (recordings, acoustic measures)
  6. Treatment & Outcomes (interventions, follow-up)

I would also like to request API access for this project to enable integration with our research data management platform.

Please let me know if you need any additional information or documentation to process this request. I am happy to schedule a meeting to discuss the project.

Thank you for your time.

Best regards,
[YOUR NAME], MD
Department of Otolaryngology — Head and Neck Surgery
[INSTITUTION]
[EMAIL] | [PHONE]`
};

let redcapConnection: { url: string; token: string; connected: boolean; lastTest: string | null; projectTitle: string | null } = {
  url: "",
  token: "",
  connected: false,
  lastTest: null,
  projectTitle: null,
};

router.get("/research-pipeline/redcap-setup", (_req, res) => {
  res.json({
    steps: setupSteps,
    adminEmail: redcapAdminEmail,
    connection: {
      url: redcapConnection.url,
      hasToken: !!redcapConnection.token,
      connected: redcapConnection.connected,
      lastTest: redcapConnection.lastTest,
      projectTitle: redcapConnection.projectTitle,
    },
  });
});

router.put("/research-pipeline/redcap-setup/steps/:id", (req, res) => {
  const step = setupSteps.find(s => s.id === req.params.id);
  if (!step) { res.status(404).json({ error: "Step not found" }); return; }
  const validStatuses = ["pending", "done", "skipped"] as const;
  if (req.body.status !== undefined) {
    if (!validStatuses.includes(req.body.status)) { res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` }); return; }
    step.status = req.body.status;
  }
  res.json({ step });
});

router.post("/research-pipeline/redcap-setup/connection", async (req, res) => {
  const { url, token } = req.body;
  if (!url || typeof url !== "string") { res.status(400).json({ error: "url is required" }); return; }
  if (!token || typeof token !== "string") { res.status(400).json({ error: "token is required" }); return; }

  const cleanUrl = url.replace(/\/+$/, "");
  redcapConnection.url = cleanUrl;
  redcapConnection.token = token;

  try {
    const apiUrl = `${cleanUrl}/api/`;
    const params = new URLSearchParams();
    params.append("token", token);
    params.append("content", "project");
    params.append("format", "json");

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      redcapConnection.connected = false;
      redcapConnection.lastTest = new Date().toISOString();
      res.json({ connected: false, error: `REDCap returned HTTP ${response.status}` });
      return;
    }

    const data = await response.json();
    redcapConnection.connected = true;
    redcapConnection.lastTest = new Date().toISOString();
    redcapConnection.projectTitle = data.project_title || null;

    const setupStep = setupSteps.find(s => s.id === "s5");
    if (setupStep) setupStep.status = "done";

    res.json({
      connected: true,
      projectTitle: data.project_title,
      creationTime: data.creation_time,
      inProduction: data.in_production,
    });
  } catch (err: any) {
    redcapConnection.connected = false;
    redcapConnection.lastTest = new Date().toISOString();
    res.json({ connected: false, error: err.message || "Connection failed" });
  }
});

router.post("/research-pipeline/redcap-setup/import-dictionary", async (req, res) => {
  if (!redcapConnection.connected || !redcapConnection.token || !redcapConnection.url) {
    res.status(400).json({ error: "REDCap not connected. Test connection first." });
    return;
  }

  try {
    const csvRows: string[] = [];
    csvRows.push("Variable / Field Name,Form Name,Section Header,Field Type,Field Label,Choices Calculations or Slider Labels,Field Note,Text Validation Type OR Show Slider Number,Text Validation Min,Text Validation Max,Identifier?,Branching Logic (Show field only if...),Required Field?,Custom Alignment,Question Number (surveys only),Matrix Group Name,Matrix Ranking?,Field Annotation");

    function esc(s: string) { return s.replace(/"/g, '""'); }

    for (const inst of redcapInstruments) {
      for (const field of inst.fields) {
        const choices = (field.choices || "").replace(/\s*\|\s*/g, " | ");
        const validationType = field.type === "slider" ? "number_1dp" : (field.validation || "");
        const valMin = field.validationMin || "";
        const valMax = field.validationMax || "";
        csvRows.push(`"${esc(field.name)}","${esc(inst.id)}","","${esc(field.type)}","${esc(field.label)}","${esc(choices)}","","${esc(validationType)}","${valMin}","${valMax}","","","${field.required ? "y" : ""}","","","","",""`);
      }
    }

    const csvContent = csvRows.join("\n");
    const apiUrl = `${redcapConnection.url}/api/`;

    const formData = new URLSearchParams();
    formData.append("token", redcapConnection.token);
    formData.append("content", "metadata");
    formData.append("format", "csv");
    formData.append("data", csvContent);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text();
      res.json({ success: false, error: `REDCap returned HTTP ${response.status}: ${text}` });
      return;
    }

    const result = await response.text();

    const importStep = setupSteps.find(s => s.id === "s3");
    if (importStep) importStep.status = "done";

    res.json({ success: true, result, fieldsImported: redcapInstruments.reduce((sum, i) => sum + i.fields.length, 0) });
  } catch (err: any) {
    res.json({ success: false, error: err.message || "Import failed" });
  }
});

router.get("/research-pipeline/export/redcap-csv", (_req, res) => {
  const rows: string[] = [];
  rows.push("Variable / Field Name,Form Name,Section Header,Field Type,Field Label,Choices Calculations or Slider Labels,Field Note,Text Validation Type OR Show Slider Number,Text Validation Min,Text Validation Max,Identifier?,Branching Logic (Show field only if...),Required Field?,Custom Alignment,Question Number (surveys only),Matrix Group Name,Matrix Ranking?,Field Annotation");

  function esc(s: string) { return s.replace(/"/g, '""'); }

  for (const inst of redcapInstruments) {
    for (const field of inst.fields) {
      const choices = (field.choices || "").replace(/\s*\|\s*/g, " | ");
      const validationType = field.type === "slider" ? "number_1dp" : (field.validation || "");
      const valMin = field.validationMin || "";
      const valMax = field.validationMax || "";
      rows.push(`"${esc(field.name)}","${esc(inst.id)}","","${esc(field.type)}","${esc(field.label)}","${esc(choices)}","","${esc(validationType)}","${valMin}","${valMax}","","","${field.required ? "y" : ""}","","","","",""`);
    }
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=ent_ai_redcap_data_dictionary.csv");
  res.send(rows.join("\n"));
});

export default router;
