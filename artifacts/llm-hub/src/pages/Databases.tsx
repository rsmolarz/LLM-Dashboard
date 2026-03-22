import { useState } from "react";
import {
  Database,
  ExternalLink,
  Search,
  Stethoscope,
  Cloud,
  FlaskConical,
  BookOpen,
  Microscope,
  Globe,
  Filter,
  Star,
  ArrowUpRight,
  Mic,
  Lightbulb,
  Ear,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Category =
  | "all"
  | "general"
  | "cloud"
  | "medical"
  | "laryngoscopy"
  | "otoscopy"
  | "voice"
  | "search"
  | "tips";

interface Resource {
  name: string;
  url: string;
  description: string;
  category: Category;
  tags: string[];
  highlight?: boolean;
}

const RESOURCES: Resource[] = [
  {
    name: "GitHub / GitHub Models",
    url: "https://github.com",
    description:
      "The most widely used code hosting platform; many AI models, training scripts, and datasets are stored here, often linked from papers.",
    category: "general",
    tags: ["code", "models", "training scripts", "datasets"],
  },
  {
    name: "Kaggle",
    url: "https://kaggle.com",
    description:
      "Offers datasets, notebooks, and model competitions; huge community with thousands of public datasets.",
    category: "general",
    tags: ["datasets", "notebooks", "competitions", "community"],
  },
  {
    name: "Papers With Code",
    url: "https://paperswithcode.com",
    description:
      "Links ML papers to their code and datasets, making it easy to find implementations and benchmarks.",
    category: "general",
    tags: ["papers", "code", "benchmarks", "implementations"],
  },
  {
    name: "arXiv",
    url: "https://arxiv.org",
    description:
      "Preprint server where AI research (including model architectures and training data) is published first; essential for discovering new work.",
    category: "general",
    tags: ["preprints", "research", "papers", "model architectures"],
  },
  {
    name: "Zenodo",
    url: "https://zenodo.org",
    description:
      "CERN-backed open repository for scientific data and software, commonly used for medical and research datasets.",
    category: "general",
    tags: ["scientific data", "software", "medical datasets", "open access"],
  },
  {
    name: "OSF (Open Science Framework)",
    url: "https://osf.io",
    description:
      "A research data and model repository used heavily in academic/clinical AI research.",
    category: "general",
    tags: ["research data", "academic", "clinical AI", "open science"],
  },
  {
    name: "Hugging Face",
    url: "https://huggingface.co",
    description:
      "The leading platform for sharing and discovering ML models, datasets, and spaces. Home to thousands of pre-trained models.",
    category: "general",
    tags: ["models", "datasets", "transformers", "community", "spaces"],
    highlight: true,
  },
  {
    name: "Google Vertex AI / Model Garden",
    url: "https://cloud.google.com/vertex-ai/docs/model-garden",
    description:
      "Google's hub for pre-trained and fine-tunable models across vision, language, and more.",
    category: "cloud",
    tags: ["Google", "pre-trained", "fine-tuning", "cloud"],
  },
  {
    name: "AWS SageMaker JumpStart",
    url: "https://aws.amazon.com/sagemaker/jumpstart/",
    description:
      "Amazon's curated catalog of pre-built ML models for quick deployment and fine-tuning.",
    category: "cloud",
    tags: ["AWS", "pre-built models", "deployment", "cloud"],
  },
  {
    name: "Azure Machine Learning Registry",
    url: "https://learn.microsoft.com/en-us/azure/machine-learning/",
    description:
      "Microsoft's model registry for enterprise ML workflows and model management.",
    category: "cloud",
    tags: ["Microsoft", "Azure", "enterprise", "model registry"],
  },
  {
    name: "PhysioNet",
    url: "https://physionet.org",
    description:
      "A major repository of medical data, particularly cardiovascular and physiological signals; openly accessible.",
    category: "medical",
    tags: ["medical data", "physiological signals", "cardiovascular", "open access"],
  },
  {
    name: "The Cancer Imaging Archive (TCIA)",
    url: "https://www.cancerimagingarchive.net",
    description:
      "Large collection of cancer-related medical imaging datasets (CT, MRI, etc.) including head & neck.",
    category: "medical",
    tags: ["cancer imaging", "CT", "MRI", "head & neck"],
  },
  {
    name: "Grand Challenge",
    url: "https://grand-challenge.org",
    description:
      "Hosts medical imaging AI competitions with associated annotated datasets and benchmarks.",
    category: "medical",
    tags: ["medical imaging", "competitions", "annotated datasets", "benchmarks"],
  },
  {
    name: "Medical Segmentation Decathlon",
    url: "http://medicaldecathlon.com",
    description:
      "Benchmark datasets for medical image segmentation across multiple organ types and modalities.",
    category: "medical",
    tags: ["segmentation", "benchmark", "multi-organ", "medical imaging"],
  },
  {
    name: "LLMs and Otolaryngology: A Review (Bao et al., JAMA 2026)",
    url: "https://jamanetwork.com/journals/jamaotolaryngology/article-abstract/2844560",
    description:
      "Landmark JAMA review identifying 5 LLM application areas in ENT: data structuring, precision medicine, administrative efficiency, decision support, and multimodal integration. Recommends open-source fine-tuning and clinical validation.",
    category: "laryngoscopy",
    tags: ["JAMA", "LLM", "review", "2026", "framework"],
    highlight: true,
  },
  {
    name: "Deep Learning in Otolaryngology (Novi et al., JAMA 2026)",
    url: "https://jamanetwork.com/journals/jamaotolaryngology/fullarticle/2841500",
    description:
      "Narrative review of 327 deep learning studies (2020-2025) in otolaryngology. Proposes a framework for integrating DL into clinical practice. Applications: diagnostic improvement, outcome prediction, intraoperative guidance.",
    category: "laryngoscopy",
    tags: ["JAMA", "deep learning", "327 studies", "2026", "framework"],
    highlight: true,
  },
  {
    name: "Deep Learning in OHNS: Scoping Review (Liu et al., Nature 2025)",
    url: "https://www.nature.com/articles/s41746-025-01693-0",
    description:
      "Analyzed 444 studies — found 99.3% are proof-of-concept, 0.7% had offline validation, zero clinical validation. Only 2/950 FDA AI devices are OHNS-specific. Identifies the 'AI chasm' in otolaryngology.",
    category: "laryngoscopy",
    tags: ["Nature", "scoping review", "AI chasm", "444 studies", "FDA"],
    highlight: true,
  },
  {
    name: "AI in Laryngeal Lesions: Meta-Analysis (EUR Arch 2024)",
    url: "https://link.springer.com/article/10.1007/s00405-024-09075-0",
    description:
      "Systematic review and meta-analysis: AI-assisted endoscopy 92% accuracy, 91% sensitivity for benign vs malignant laryngeal classification. Detection sensitivity 91% across studies.",
    category: "laryngoscopy",
    tags: ["meta-analysis", "92% accuracy", "laryngeal", "endoscopy"],
    highlight: true,
  },
  {
    name: "NBI-InfFrames (Zenodo)",
    url: "https://zenodo.org/search?q=NBI-InfFrames",
    description:
      "Publicly available dataset of narrow-band imaging (NBI) laryngoscopic frames (720 frames) by Moccia et al. Used for automated informative frame classification.",
    category: "laryngoscopy",
    tags: ["NBI", "laryngoscopy", "frame classification", "Zenodo"],
    highlight: true,
  },
  {
    name: "Laryngeal Endoscopic Image Dataset",
    url: "https://arxiv.org/search/?query=laryngeal+endoscopic+segmentation",
    description:
      "Open-access dataset with 536 manually segmented laryngeal images from laser incisions, annotated across 7 tissue classes. Used for CNN-based semantic segmentation (SegNet, UNet, ENet, ErfNet).",
    category: "laryngoscopy",
    tags: ["laryngeal", "segmentation", "CNN", "tissue classification"],
    highlight: true,
  },
  {
    name: "GIRAFE Dataset",
    url: "https://arxiv.org/search/?query=GIRAFE+glottal+imaging",
    description:
      "Glottal imaging dataset designed for advanced segmentation, analysis, and facilitative playbacks evaluation (GIRAFE 1.0, 2024).",
    category: "laryngoscopy",
    tags: ["glottal imaging", "segmentation", "voice analysis"],
  },
  {
    name: "Laryngoscope8",
    url: "https://scholar.google.com/scholar?q=Laryngoscope8+dataset",
    description:
      "Laryngeal image dataset developed for classification of laryngeal diseases using attention mechanisms and deep learning for ENT endoscopy.",
    category: "laryngoscopy",
    tags: ["laryngeal diseases", "attention mechanisms", "deep learning", "ENT"],
  },
  {
    name: "NIH Bridge2AI — Voice Database",
    url: "https://bridge2ai.org",
    description:
      "NIH Common Fund project building a diverse voice database linked to health biomarkers, specifically designed to train AI algorithms for laryngology and voice pathology. Collects from diverse populations.",
    category: "laryngoscopy",
    tags: ["NIH", "voice database", "health biomarkers", "laryngology", "diversity"],
    highlight: true,
  },
  {
    name: "Google Gemini 1.5 Pro (Laryngoscopy)",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=gemini+laryngoscopy",
    description:
      "Evaluated for interpreting laryngoscopy frames and videos — recognized procedure as laryngoscopy in 98.9% of frames and accurately diagnosed pathology in majority of cases.",
    category: "laryngoscopy",
    tags: ["Gemini", "foundation model", "clinical decision support", "diagnostic"],
  },
  {
    name: "ResNet-50 Multi-Center Laryngoscopy",
    url: "https://scholar.google.com/scholar?q=ResNet-50+laryngoscopy+multi-center",
    description:
      "Deep learning models trained and tested on multi-center laryngoscopy image databases using white light and NBI to classify diagnostically informative frames in real time.",
    category: "laryngoscopy",
    tags: ["ResNet-50", "multi-center", "real-time classification", "NBI"],
  },
  {
    name: "PubMed",
    url: "https://pubmed.ncbi.nlm.nih.gov",
    description:
      "Primary electronic database for searching AI/ORL literature — best for finding papers that link to released datasets.",
    category: "search",
    tags: ["literature search", "medical", "ORL", "papers"],
  },
  {
    name: "Scopus",
    url: "https://www.scopus.com",
    description:
      "Elsevier's abstract and citation database — comprehensive coverage of scientific, technical, and medical research.",
    category: "search",
    tags: ["citations", "scientific research", "comprehensive"],
  },
  {
    name: "Google Scholar",
    url: "https://scholar.google.com",
    description:
      "Free academic search engine indexing full text of scholarly literature across disciplines — essential for finding papers with data links.",
    category: "search",
    tags: ["academic search", "free", "cross-discipline", "data links"],
  },
  {
    name: "University of Chile Otoscopy Dataset (Zenodo)",
    url: "https://zenodo.org/search?q=otoscopy+chile",
    description:
      "Publicly released otoscopy image dataset from the University of Chile Hospital. Used for machine learning-based middle ear condition detection and classification.",
    category: "otoscopy",
    tags: ["otoscopy", "Zenodo", "public", "middle ear", "Chile"],
    highlight: true,
  },
  {
    name: "Van Akdamar Hospital Otoscopy Dataset (Figshare)",
    url: "https://figshare.com/search?q=otoscopy",
    description:
      "Publicly released otoscopy dataset from Van Akdamar Hospital, Turkey. Available through Figshare for machine learning research on tympanic membrane pathology.",
    category: "otoscopy",
    tags: ["otoscopy", "Figshare", "public", "Turkey", "tympanic membrane"],
    highlight: true,
  },
  {
    name: "41,664-Image Otoscopy Dataset (npj Digital Medicine)",
    url: "https://www.nature.com/articles/s41746-023-00898-3",
    description:
      "Deep learning model trained on 41,664 otoscopic images labeled across 11 diagnostic classes by a senior ENT specialist. Published in npj Digital Medicine — data may be accessible by request to authors.",
    category: "otoscopy",
    tags: ["41,664 images", "11 classes", "deep learning", "npj Digital Medicine", "request"],
    highlight: true,
  },
  {
    name: "SVD — Saarbrücken Voice Database",
    url: "https://stimmdb.coli.uni-saarland.de/",
    description:
      "Long-running German voice pathology database with over 2,000 voice recordings from healthy and pathological speakers. Freely available for research — widely cited in vocal fold disorder ML studies.",
    category: "voice",
    tags: ["voice pathology", "German", "free", "2,000+ recordings", "vocal fold"],
    highlight: true,
  },
  {
    name: "AVPD — Advanced Voice Pathology Database",
    url: "https://scholar.google.com/scholar?q=Advanced+Voice+Pathology+Database+AVPD",
    description:
      "Frequently used in voice pathology ML research for vocal fold disorder classification. Contains recordings and clinical annotations for training voice disorder detection models.",
    category: "voice",
    tags: ["voice pathology", "AVPD", "vocal fold", "classification", "ML"],
    highlight: true,
  },
  {
    name: "NIH Bridge2AI — Voice as a Biomarker",
    url: "https://bridge2ai.org/voice/",
    description:
      "Major NIH Common Fund project building the largest diverse voice database linked to health biomarkers. Currently under construction — will be a transformative open resource for voice AI and laryngology research.",
    category: "voice",
    tags: ["NIH", "Bridge2AI", "voice biomarker", "diversity", "open resource"],
    highlight: true,
  },
  {
    name: "IEEE DataPort — Biomedical Datasets",
    url: "https://ieee-dataport.org/",
    description:
      "Growing repository specifically for engineering and biomedical datasets, including endoscopy, signal processing, and acoustic data relevant to ENT AI research.",
    category: "search",
    tags: ["IEEE", "biomedical", "endoscopy", "signal processing", "repository"],
  },
  {
    name: "MIMIC / PhysioNet — Clinical Data",
    url: "https://physionet.org/",
    description:
      "While not ENT-specific, PhysioNet hosts voice, audio, and clinical note data that can be filtered for ENT diagnoses using ICD codes. MIMIC-III/IV contain millions of clinical records.",
    category: "search",
    tags: ["PhysioNet", "MIMIC", "clinical notes", "ICD codes", "audio"],
  },
  {
    name: "ResearchGate — Dataset Discovery",
    url: "https://www.researchgate.net/search?q=otolaryngology+dataset",
    description:
      "Authors often post their datasets or respond to direct requests on ResearchGate. Search for ENT imaging datasets — many researchers share upon reasonable request.",
    category: "tips",
    tags: ["dataset discovery", "author contact", "direct requests"],
  },
  {
    name: "Pro Tip: Check 'Data Availability' Sections",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=otolaryngology+artificial+intelligence",
    description:
      "Many PubMed/PMC papers now deposit datasets on Zenodo, Figshare, or OSF as a condition of publication. Always check the 'Data Availability Statement' section at the bottom of papers.",
    category: "tips",
    tags: ["pro tip", "data availability", "Zenodo", "Figshare", "OSF"],
    highlight: true,
  },
  {
    name: "Pro Tip: Contact Corresponding Authors",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=deep+learning+otolaryngology",
    description:
      "Many ENT imaging datasets are available from institutions upon reasonable request, even when not publicly posted. Contacting corresponding authors of ML papers is often the most productive path for accessing niche ENT data.",
    category: "tips",
    tags: ["pro tip", "collaboration", "institutional data", "data sharing"],
    highlight: true,
  },
  {
    name: "Pro Tip: Academic ENT Department Outreach",
    url: "https://scholar.google.com/scholar?q=machine+learning+otolaryngology+dataset",
    description:
      "ENT — especially laryngology — is one of the more data-sparse specialties in medical AI. Reaching out to academic ENT departments publishing ML papers is often the most productive path for accessing institutional datasets that require collaboration or data-sharing agreements.",
    category: "tips",
    tags: ["pro tip", "academic", "collaboration", "data-sparse", "institutional"],
    highlight: true,
  },
];

const CATEGORY_CONFIG: Record<
  Category,
  { label: string; icon: typeof Database; color: string }
> = {
  all: { label: "All Resources", icon: Globe, color: "text-white" },
  general: { label: "General Purpose", icon: Database, color: "text-blue-400" },
  cloud: { label: "Cloud Platforms", icon: Cloud, color: "text-cyan-400" },
  medical: { label: "Medical AI", icon: Stethoscope, color: "text-green-400" },
  laryngoscopy: {
    label: "Laryngoscopy / ENT",
    icon: Microscope,
    color: "text-purple-400",
  },
  otoscopy: { label: "Otoscopy / Ear", icon: Ear, color: "text-pink-400" },
  voice: { label: "Voice / Laryngology", icon: Mic, color: "text-orange-400" },
  search: { label: "Search & Repositories", icon: BookOpen, color: "text-amber-400" },
  tips: { label: "Pro Tips", icon: Lightbulb, color: "text-yellow-400" },
};

export default function Databases() {
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = RESOURCES.filter((r) => {
    const matchesCategory =
      activeCategory === "all" || r.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const categoryCounts = Object.keys(CATEGORY_CONFIG).reduce(
    (acc, cat) => {
      acc[cat as Category] =
        cat === "all"
          ? RESOURCES.length
          : RESOURCES.filter((r) => r.category === cat).length;
      return acc;
    },
    {} as Record<Category, number>,
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            AI Databases & Resources
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Model githubrepositories, medical datasets, laryngoscopy resources, and
            research databases
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search databases & resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(CATEGORY_CONFIG) as Category[]).map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          const Icon = config.icon;
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 border",
                isActive
                  ? "bg-white/10 border-white/20 text-white shadow-sm"
                  : "bg-white/[0.02] border-white/5 text-muted-foreground hover:text-white hover:bg-white/5",
              )}
            >
              <Icon
                className={cn("w-3.5 h-3.5", isActive ? config.color : "")}
              />
              {config.label}
              <span
                className={cn(
                  "ml-1 px-1.5 py-0.5 rounded-md text-[10px]",
                  isActive
                    ? "bg-white/10 text-white"
                    : "bg-white/5 text-muted-foreground",
                )}
              >
                {categoryCounts[cat]}
              </span>
            </button>
          );
        })}
      </div>

      {activeCategory === "laryngoscopy" && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-start gap-3">
            <FlaskConical className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-purple-300">
                Laryngoscopy AI — Field Status
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Dedicated open-access flexible laryngoscopy datasets are still
                scarce — it's one of the recognized bottlenecks in the field.
                Most research groups build and keep their own institutional
                datasets. Best strategy: search Zenodo + arXiv + PubMed
                together, and check data availability sections of relevant
                papers for request-based access.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((resource) => {
          const catConfig = CATEGORY_CONFIG[resource.category];
          const CatIcon = catConfig.icon;
          return (
            <a
              key={resource.name}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "group relative rounded-xl border p-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
                resource.highlight
                  ? "border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5",
              )}
            >
              {resource.highlight && (
                <div className="absolute top-3 right-3">
                  <Star className="w-4 h-4 text-primary fill-primary/30" />
                </div>
              )}
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    resource.highlight
                      ? "bg-primary/20"
                      : "bg-white/5",
                  )}
                >
                  <CatIcon
                    className={cn("w-4 h-4", catConfig.color)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-1.5 group-hover:text-primary transition-colors">
                    {resource.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-3">
                    {resource.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {resource.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
                {resource.tags.length > 4 && (
                  <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-muted-foreground">
                    +{resource.tags.length - 4}
                  </span>
                )}
              </div>
            </a>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Filter className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground text-sm">
            No resources match your filters
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("all");
            }}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-400" />
          Quick Reference
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                  Platform
                </th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                  Best For
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ["Zenodo", "Academic medical datasets (NBI-InfFrames, etc.)"],
                ["Kaggle", "General medical imaging competitions"],
                ["Grand Challenge", "Medical imaging benchmarks"],
                ["TCIA", "Cancer imaging (head & neck)"],
                ["PhysioNet", "Physiological / voice signal data"],
                [
                  "NIH Bridge2AI",
                  "Voice + laryngology AI (in development)",
                ],
                [
                  "arXiv",
                  "Finding new laryngoscopy ML papers with data links",
                ],
                ["Hugging Face", "Pre-trained models, datasets, and spaces"],
              ].map(([platform, bestFor]) => (
                <tr key={platform} className="hover:bg-white/[0.02]">
                  <td className="py-2 px-3 text-white font-medium">
                    {platform}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {bestFor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
