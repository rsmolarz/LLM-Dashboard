import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { trainingDataTable } from "@workspace/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";

const router: IRouter = Router();

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const MESH_QUERIES = [
  '"otolaryngology"[MeSH Terms]',
  '"ear diseases"[MeSH Terms]',
  '"nose diseases"[MeSH Terms]',
  '"laryngeal diseases"[MeSH Terms]',
  '"pharyngeal diseases"[MeSH Terms]',
  '"hearing disorders"[MeSH Terms]',
  '"voice disorders"[MeSH Terms]',
  '"deglutition disorders"[MeSH Terms]',
  '"head and neck neoplasms"[MeSH Terms]',
  '"rhinitis"[MeSH Terms]',
  '"sinusitis"[MeSH Terms]',
  '"otitis"[MeSH Terms]',
  '"tonsillitis"[MeSH Terms]',
  '"sleep apnea"[MeSH Terms]',
  '"cochlear implants"[MeSH Terms]',
  '"endoscopy"[MeSH Terms] AND "otolaryngology"[MeSH Terms]',
  '"artificial intelligence"[MeSH Terms] AND "otolaryngology"[MeSH Terms]',
  '"machine learning"[MeSH Terms] AND "laryngoscopy"[MeSH Terms]',
  '"deep learning"[MeSH Terms] AND "head and neck"[All Fields]',
  '"image processing, computer-assisted"[MeSH Terms] AND "larynx"[MeSH Terms]',
  '"large language model"[All Fields] AND "otolaryngology"[All Fields]',
  '"natural language processing"[MeSH Terms] AND "otolaryngology"[MeSH Terms]',
  '"neural networks, computer"[MeSH Terms] AND "otoscopy"[All Fields]',
  '"voice disorders"[MeSH Terms] AND "artificial intelligence"[MeSH Terms]',
  '"thyroid nodule"[MeSH Terms] AND "deep learning"[All Fields]',
  '"pediatrics"[MeSH Terms] AND "otolaryngology"[MeSH Terms]',
  '"otitis media"[MeSH Terms] AND "child"[MeSH Terms]',
  '"adenoidectomy"[MeSH Terms]',
  '"tonsillectomy"[MeSH Terms]',
  '"rhinoplasty"[MeSH Terms]',
  '"facial nerve"[MeSH Terms] AND "surgery"[MeSH Terms]',
  '"salivary gland diseases"[MeSH Terms]',
  '"parotid neoplasms"[MeSH Terms]',
  '"skull base"[MeSH Terms] AND "surgery"[MeSH Terms]',
  '"skull base neoplasms"[MeSH Terms]',
  '"airway management"[MeSH Terms] AND "otolaryngology"[MeSH Terms]',
  '"tracheostomy"[MeSH Terms]',
  '"laryngotracheal stenosis"[MeSH Terms]',
  '"hypersensitivity"[MeSH Terms] AND "rhinitis"[MeSH Terms]',
  '"immunotherapy"[MeSH Terms] AND "rhinitis, allergic"[MeSH Terms]',
  '"dysphonia"[MeSH Terms]',
  '"vocal cord paralysis"[MeSH Terms]',
  '"laryngopharyngeal reflux"[MeSH Terms]',
  '"vertigo"[MeSH Terms]',
  '"meniere disease"[MeSH Terms]',
  '"vestibular diseases"[MeSH Terms]',
  '"cholesteatoma"[MeSH Terms]',
  '"sensorineural hearing loss"[MeSH Terms]',
  '"endoscopy"[MeSH Terms] AND "paranasal sinuses"[MeSH Terms]',
  '"balloon sinuplasty"[All Fields]',
  '"tinnitus"[MeSH Terms]',
  '"cochlear implantation"[MeSH Terms]',
  '"hearing aids"[MeSH Terms]',
  '"otosclerosis"[MeSH Terms]',
  '"presbycusis"[MeSH Terms]',
  '"temporal bone"[MeSH Terms] AND "surgery"[MeSH Terms]',
  '"mastoidectomy"[MeSH Terms]',
  '"tympanoplasty"[MeSH Terms]',
  '"stapedectomy"[MeSH Terms]',
  '"vestibular neuritis"[MeSH Terms]',
  '"labyrinthitis"[MeSH Terms]',
  '"acoustic neuroma"[MeSH Terms]',
  '"glomus tumor"[MeSH Terms] AND "ear"[MeSH Terms]',
  '"nasal polyps"[MeSH Terms]',
  '"nasal septum"[MeSH Terms] AND "deviation"[All Fields]',
  '"olfaction disorders"[MeSH Terms]',
  '"epistaxis"[MeSH Terms]',
  '"cerebrospinal fluid rhinorrhea"[MeSH Terms]',
  '"paranasal sinus neoplasms"[MeSH Terms]',
  '"thyroid neoplasms"[MeSH Terms] AND "surgery"[MeSH Terms]',
  '"thyroidectomy"[MeSH Terms]',
  '"parathyroid neoplasms"[MeSH Terms]',
  '"recurrent laryngeal nerve"[MeSH Terms] AND "injuries"[MeSH Terms]',
  '"neck dissection"[MeSH Terms]',
  '"glossectomy"[MeSH Terms]',
  '"mandibular reconstruction"[MeSH Terms]',
  '"free tissue flaps"[MeSH Terms] AND "head and neck"[All Fields]',
  '"papillomavirus infections"[MeSH Terms] AND "oropharynx"[MeSH Terms]',
  '"salivary gland neoplasms"[MeSH Terms]',
  '"sialolithiasis"[MeSH Terms]',
  '"ranula"[MeSH Terms]',
  '"facial paralysis"[MeSH Terms]',
  '"bell palsy"[MeSH Terms]',
  '"facial nerve injuries"[MeSH Terms] AND "reconstruction"[All Fields]',
  '"obstructive sleep apnea"[MeSH Terms] AND "surgery"[MeSH Terms]',
  '"uvulopalatopharyngoplasty"[MeSH Terms]',
  '"drug-induced sleep endoscopy"[All Fields]',
  '"hypoglossal nerve stimulation"[All Fields]',
  '"laryngomalacia"[MeSH Terms]',
  '"Pierre Robin sequence"[MeSH Terms]',
  '"choanal atresia"[MeSH Terms]',
  '"branchial cleft cyst"[All Fields]',
  '"thyroglossal cyst"[MeSH Terms]',
  '"deep learning"[MeSH Terms] AND "audiometry"[MeSH Terms]',
  '"robotic surgical procedures"[MeSH Terms] AND "otolaryngology"[MeSH Terms]',
  '"transoral robotic surgery"[All Fields]',
  '"laser therapy"[MeSH Terms] AND "larynx"[MeSH Terms]',
  '"photodynamic therapy"[MeSH Terms] AND "head and neck neoplasms"[MeSH Terms]',
  '"eustachian tube"[MeSH Terms] AND "dysfunction"[All Fields]',
  '"otitis media with effusion"[MeSH Terms]',
  '"hearing loss, sudden"[MeSH Terms]',
  '"adenoids"[MeSH Terms] AND "hypertrophy"[MeSH Terms]',
  '"tracheomalacia"[MeSH Terms]',
  '"velopharyngeal insufficiency"[MeSH Terms]',
  '"cleft palate"[MeSH Terms] AND "speech"[MeSH Terms]',
  '"globus sensation"[MeSH Terms]',
  '"esophageal diseases"[MeSH Terms] AND "dysphagia"[MeSH Terms]',
  '"voice prosthesis"[MeSH Terms]',
  '"laryngectomy"[MeSH Terms]',
  '"hypopharyngeal neoplasms"[MeSH Terms]',
  '"continuous positive airway pressure"[MeSH Terms] AND "compliance"[All Fields]',
  '"tongue base"[All Fields] AND "obstruction"[All Fields] AND "sleep apnea"[MeSH Terms]',
  '"hyoid bone"[MeSH Terms] AND "suspension"[All Fields]',
  '"endoscopic skull base surgery"[All Fields]',
  '"pituitary neoplasms"[MeSH Terms] AND "endoscopic surgery"[All Fields]',
  '"mucocele"[MeSH Terms] AND "paranasal sinuses"[MeSH Terms]',
  '"aspergillosis"[MeSH Terms] AND "sinusitis"[MeSH Terms]',
  '"laryngeal neoplasms"[MeSH Terms] AND "staging"[All Fields]',
  '"tracheostomy"[MeSH Terms] AND "complications"[MeSH Terms]',
  '"airway reconstruction"[All Fields] AND "pediatric"[All Fields]',
  '"cricotracheal resection"[All Fields]',
  '"conductive hearing loss"[MeSH Terms]',
  '"auditory brainstem implant"[MeSH Terms]',
  '"ossiculoplasty"[All Fields]',
  '"myringotomy"[MeSH Terms]',
  '"noise-induced hearing loss"[MeSH Terms]',
  '"cochlear nerve"[MeSH Terms] AND "aplasia"[All Fields]',
  '"auditory neuropathy"[MeSH Terms]',
  '"auditory perceptual disorders"[MeSH Terms]',
  '"otoacoustic emissions, spontaneous"[MeSH Terms]',
  '"evoked potentials, auditory, brain stem"[MeSH Terms]',
  '"perilymph"[MeSH Terms] AND "fistula"[MeSH Terms]',
  '"oval window"[All Fields] AND "fistula"[All Fields]',
  '"ototoxicity"[All Fields] AND "monitoring"[All Fields]',
  '"cerumen"[MeSH Terms]',
  '"ear canal"[MeSH Terms] AND "exostoses"[MeSH Terms]',
  '"congenital aural atresia"[All Fields]',
  '"ear, external"[MeSH Terms] AND "abnormalities"[MeSH Terms]',
  '"cystic fibrosis"[MeSH Terms] AND "sinusitis"[MeSH Terms]',
  '"mycoses"[MeSH Terms] AND "sinusitis"[MeSH Terms] AND "allergic"[All Fields]',
  '"ciliary motility disorders"[MeSH Terms]',
  '"rhinitis medicamentosa"[All Fields]',
  '"nasal septum"[MeSH Terms] AND "perforation"[MeSH Terms]',
  '"turbinates"[MeSH Terms] AND "hypertrophy"[MeSH Terms]',
  '"nasal bone"[MeSH Terms] AND "fractures"[MeSH Terms]',
  '"orbital fractures"[MeSH Terms]',
  '"maxillary fractures"[MeSH Terms]',
  '"zygomatic fractures"[MeSH Terms]',
  '"mandibular fractures"[MeSH Terms]',
  '"facial injuries"[MeSH Terms] AND "reconstruction"[All Fields]',
  '"lymphadenopathy"[MeSH Terms] AND "cervical"[All Fields]',
  '"lymphoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"infectious mononucleosis"[MeSH Terms] AND "pharyngitis"[All Fields]',
  '"deep neck infection"[All Fields]',
  '"ludwig angina"[All Fields]',
  '"peritonsillar abscess"[MeSH Terms]',
  '"retropharyngeal abscess"[MeSH Terms]',
  '"lemierre syndrome"[All Fields]',
  '"epiglottitis"[MeSH Terms]',
  '"foreign bodies"[MeSH Terms] AND "airway"[All Fields]',
  '"foreign bodies"[MeSH Terms] AND "esophagus"[MeSH Terms]',
  '"esophageal achalasia"[MeSH Terms]',
  '"reinke edema"[All Fields]',
  '"muscle tension dysphonia"[All Fields]',
  '"presbylaryngis"[All Fields]',
  '"biologics"[All Fields] AND "nasal polyps"[MeSH Terms]',
  '"dupilumab"[All Fields] AND "chronic rhinosinusitis"[All Fields]',
  '"omalizumab"[All Fields] AND "nasal polyps"[All Fields]',
  '"stapedotomy"[All Fields]',
  '"ossicular chain reconstruction"[All Fields]',
  '"bone anchored hearing aid"[All Fields]',
  '"endolymphatic hydrops"[MeSH Terms]',
  '"vestibular migraine"[All Fields]',
  '"acoustic neuroma"[MeSH Terms] AND "microsurgery"[All Fields]',
  '"otitis externa"[MeSH Terms]',
  '"temporal bone"[MeSH Terms] AND "fractures"[MeSH Terms]',
  '"glomus jugulare"[All Fields]',
  '"glomus tympanicum"[All Fields]',
  '"paraganglioma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"carotid body tumor"[MeSH Terms]',
  '"pituitary adenoma"[MeSH Terms] AND "transsphenoidal"[All Fields]',
  '"meningioma"[MeSH Terms] AND "skull base"[MeSH Terms]',
  '"mouth neoplasms"[MeSH Terms]',
  '"tongue neoplasms"[MeSH Terms]',
  '"mucoepidermoid carcinoma"[MeSH Terms]',
  '"carcinoma, adenoid cystic"[MeSH Terms]',
  '"xerostomia"[MeSH Terms]',
  '"bisphosphonate-associated osteonecrosis of the jaw"[MeSH Terms]',
  '"endoscopic ear surgery"[All Fields]',
  '"cochlear implants"[MeSH Terms] AND "programming"[All Fields]',
  '"middle ear"[MeSH Terms] AND "implant"[All Fields]',
  '"bone conduction"[MeSH Terms] AND "implant"[All Fields]',
  '"petrous bone"[MeSH Terms] AND "cholesterol granuloma"[All Fields]',
  '"tegmen"[All Fields] AND "repair"[All Fields] AND "temporal bone"[All Fields]',
  '"autoimmune diseases"[MeSH Terms] AND "inner ear"[All Fields]',
  '"hyperacusis"[MeSH Terms]',
  '"misophonia"[All Fields]',
  '"image-guided surgery"[MeSH Terms] AND "paranasal sinuses"[MeSH Terms]',
  '"budesonide"[MeSH Terms] AND "nasal irrigation"[All Fields]',
  '"aspirin-exacerbated respiratory disease"[All Fields]',
  '"Draf III"[All Fields] AND "frontal sinus"[All Fields]',
  '"orbital decompression"[All Fields] AND "Graves"[All Fields]',
  '"diplacusis"[All Fields]',
  '"laryngeal reinnervation"[All Fields]',
  '"supraglottoplasty"[All Fields]',
  '"trismus"[MeSH Terms]',
  '"mandibular advancement"[All Fields] AND "sleep apnea"[MeSH Terms]',
];

const KEYWORD_QUERIES = [
  "flexible laryngoscopy AI",
  "ENT clinical decision support",
  "otolaryngology machine learning",
  "vocal cord paralysis diagnosis",
  "laryngeal cancer detection AI",
  "audiometry deep learning",
  "thyroid nodule classification",
  "sinonasal imaging AI",
  "tympanic membrane image analysis",
  "obstructive sleep apnea prediction model",
  "pediatric otolaryngology tonsillectomy outcomes",
  "pediatric hearing screening",
  "congenital hearing loss genetics",
  "facial plastic surgery outcomes",
  "septoplasty outcomes",
  "parotid gland tumor management",
  "submandibular gland sialolithiasis",
  "skull base surgery endoscopic approach",
  "anterior skull base reconstruction",
  "subglottic stenosis management",
  "tracheostomy decannulation",
  "pediatric airway obstruction",
  "allergic rhinitis immunotherapy",
  "sublingual immunotherapy ENT",
  "voice therapy dysphonia",
  "spasmodic dysphonia treatment",
  "laryngopharyngeal reflux diagnosis",
  "benign paroxysmal positional vertigo treatment",
  "vestibular schwannoma management",
  "cholesteatoma surgery outcomes",
  "endoscopic sinus surgery outcomes",
  "balloon sinuplasty vs FESS",
  "dysphagia evaluation fiberoptic",
  "modified barium swallow ENT",
  "thyroid cancer surgical management",
  "parathyroid surgery outcomes",
  "tinnitus retraining therapy outcomes",
  "pulsatile tinnitus differential diagnosis",
  "cochlear implant candidacy criteria",
  "bone anchored hearing aid outcomes",
  "otosclerosis surgical management",
  "superior semicircular canal dehiscence",
  "endolymphatic hydrops diagnosis MRI",
  "temporal bone fracture management",
  "glomus jugulare tumor treatment",
  "paraganglioma head neck",
  "sinonasal undifferentiated carcinoma",
  "esthesioneuroblastoma treatment outcomes",
  "inverted papilloma sinonasal",
  "frontal sinus surgery Draf procedure",
  "CSF leak endoscopic repair skull base",
  "olfactory training post viral anosmia",
  "empty nose syndrome",
  "nasal valve collapse repair",
  "total thyroidectomy complications",
  "radioactive iodine thyroid cancer",
  "medullary thyroid carcinoma management",
  "Warthin tumor parotid",
  "pleomorphic adenoma recurrence",
  "submandibular gland excision outcomes",
  "facial nerve decompression surgery",
  "facial reanimation cross face nerve graft",
  "hypoglossal facial nerve anastomosis",
  "Inspire therapy sleep apnea outcomes",
  "maxillomandibular advancement sleep apnea",
  "positional obstructive sleep apnea treatment",
  "pediatric cochlear implant outcomes",
  "congenital microtia atresia reconstruction",
  "laryngeal cleft repair pediatric",
  "recurrent respiratory papillomatosis cidofovir",
  "juvenile nasopharyngeal angiofibroma",
  "HPV oropharyngeal cancer de-escalation",
  "sentinel lymph node biopsy head neck",
  "nasopharyngeal carcinoma treatment",
  "free flap reconstruction head neck",
  "osteoradionecrosis mandible management",
  "unilateral vocal fold injection medialization",
  "laryngeal framework surgery thyroplasty",
  "Zenker diverticulum endoscopic treatment",
  "Eagle syndrome elongated styloid",
  "first branchial cleft anomaly management",
  "sudden sensorineural hearing loss steroid treatment",
  "intratympanic dexamethasone sudden hearing loss",
  "eustachian tube balloon dilation",
  "eustachian tube dysfunction grading",
  "otitis media effusion ventilation tubes adults",
  "adenoid hypertrophy nasal obstruction children",
  "pediatric obstructive sleep apnea adenotonsillectomy",
  "CPAP adherence obstructive sleep apnea factors",
  "tongue base reduction sleep apnea radiofrequency",
  "hyoid suspension sleep apnea outcomes",
  "velopharyngeal insufficiency speech surgery",
  "cleft palate pharyngeal flap outcomes",
  "globus pharyngeus diagnosis management",
  "esophageal dysphagia cricopharyngeal dysfunction",
  "voice prosthesis tracheoesophageal puncture",
  "electrolarynx voice rehabilitation laryngectomy",
  "hypopharyngeal cancer treatment outcomes",
  "laryngeal cancer organ preservation chemoradiation",
  "tracheostomy complications long term",
  "percutaneous vs surgical tracheostomy",
  "pediatric airway reconstruction slide tracheoplasty",
  "cricotracheal resection subglottic stenosis outcomes",
  "tracheomalacia diagnosis bronchoscopy",
  "endoscopic endonasal skull base pituitary",
  "cholesteatoma congenital vs acquired management",
  "canal wall down vs canal wall up mastoidectomy",
  "Meniere disease endolymphatic sac surgery",
  "Meniere disease intratympanic gentamicin",
  "benign paroxysmal positional vertigo canalith repositioning",
  "BPPV posterior canal Epley maneuver outcomes",
  "vestibular rehabilitation therapy chronic dizziness",
  "parotid tumor facial nerve preservation",
  "deep lobe parotid tumor surgery approach",
  "neck dissection selective vs modified radical",
  "auditory neuropathy spectrum disorder diagnosis",
  "central auditory processing disorder children",
  "otoacoustic emissions newborn screening",
  "ABR auditory brainstem response threshold",
  "perilymph fistula round window membrane",
  "semicircular canal dehiscence CT diagnosis",
  "noise induced hearing loss prevention workplace",
  "ototoxicity aminoglycoside cisplatin monitoring",
  "cerumen impaction management guidelines",
  "exostosis surfer ear external auditory canal",
  "microtia ear reconstruction Medpor framework",
  "auricular reconstruction autologous rib cartilage",
  "CRS nasal polyps dupilumab biologic therapy",
  "cystic fibrosis sinonasal disease management",
  "allergic fungal sinusitis Bent Kuhn criteria",
  "primary ciliary dyskinesia Kartagener diagnosis",
  "rhinitis medicamentosa oxymetazoline rebound",
  "nasal septal perforation button prosthesis repair",
  "inferior turbinate reduction radiofrequency",
  "nasal fracture closed reduction outcomes",
  "orbital blowout fracture repair timing",
  "Le Fort fracture classification management",
  "zygomaticomaxillary complex fracture repair",
  "mandible fracture open reduction internal fixation",
  "cervical lymphadenopathy differential diagnosis",
  "extranodal lymphoma Waldeyer ring",
  "EBV infectious mononucleosis tonsillar complications",
  "deep neck space infection CT drainage",
  "Ludwig angina airway management",
  "peritonsillar abscess needle aspiration vs incision",
  "retropharyngeal abscess pediatric management",
  "Lemierre syndrome Fusobacterium internal jugular",
  "acute epiglottitis adult management",
  "foreign body aspiration pediatric bronchoscopy",
  "esophageal foreign body coin button battery",
  "stapedotomy laser piston outcomes",
  "ossicular chain reconstruction prosthesis",
  "bone anchored hearing aid Baha Ponto",
  "vestibular migraine diagnosis treatment",
  "acoustic neuroma middle fossa approach",
  "glomus tympanicum management",
  "carotid body tumor resection",
  "pituitary adenoma endoscopic transsphenoidal",
  "meningioma skull base surgical approach",
  "oral cavity squamous cell carcinoma staging",
  "tongue cancer reconstruction outcomes",
  "mucoepidermoid carcinoma parotid treatment",
  "adenoid cystic carcinoma perineural invasion",
  "xerostomia management radiation therapy",
  "bisphosphonate osteonecrosis jaw management",
  "endoscopic ear surgery transcanal",
  "cochlear implant mapping programming",
  "middle ear implant Vibrant Soundbridge",
  "bone conduction implant Osia Bonebridge",
  "petrous apex cholesterol granuloma drainage",
  "tegmen tympani defect repair encephalocele",
  "intratympanic steroid injection protocol",
  "autoimmune inner ear disease treatment",
  "tinnitus cognitive behavioral therapy",
  "hyperacusis sound sensitivity treatment",
  "misophonia assessment management",
  "revision FESS outcomes chronic sinusitis",
  "image guided endoscopic sinus surgery navigation",
  "budesonide sinus irrigation outcomes",
  "aspirin exacerbated respiratory disease desensitization",
  "samter triad nasal polyps asthma",
  "Draf III frontal sinusotomy modified Lothrop",
  "orbital decompression Graves thyroid eye disease",
  "CROS hearing aid single sided deafness",
  "diplacusis frequency pitch mismatch",
  "laryngeal reinnervation ansa cervicalis",
  "supraglottoplasty laryngomalacia outcomes",
  "trismus radiation head neck treatment",
  "oromotor rehabilitation swallowing therapy",
  "mandibular advancement device sleep apnea",
  "spasmodic dysphonia botulinum toxin injection",
  "reinke edema phonosurgery outcomes",
  "recurrent respiratory papillomatosis HPV bevacizumab",
];

interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  pubDate: string;
  meshTerms: string[];
  keywords: string[];
  doi: string;
}

interface CollectionRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  queryType: "mesh" | "keyword" | "both";
  articlesFound: number;
  articlesStored: number;
  samplesGenerated: number;
  errors: string[];
}

interface PipelineStats {
  totalArticles: number;
  totalSamples: number;
  lastRunAt: string | null;
  runHistory: CollectionRun[];
  articlesByCategory: Record<string, number>;
}

let currentRun: CollectionRun | null = null;
const runHistory: CollectionRun[] = [];
const storedArticles: Map<string, PubMedArticle> = new Map();
let autoCollectInterval: ReturnType<typeof setInterval> | null = null;
let autoCollectEnabled = false;

async function searchPubMed(query: string, maxResults: number = 20): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmax: String(maxResults),
    retmode: "json",
    sort: "relevance",
  });

  const res = await fetch(`${PUBMED_BASE}/esearch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed search failed: ${res.status}`);
  const data = await res.json();
  return data.esearchresult?.idlist || [];
}

async function fetchArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
    rettype: "abstract",
  });

  const res = await fetch(`${PUBMED_BASE}/efetch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed fetch failed: ${res.status}`);
  const xml = await res.text();

  return parseArticlesFromXml(xml);
}

function parseArticlesFromXml(xml: string): PubMedArticle[] {
  const articles: PubMedArticle[] = [];
  const articleBlocks = xml.split("<PubmedArticle>").slice(1);

  for (const block of articleBlocks) {
    try {
      const pmid = extractTag(block, "PMID") || "";
      const title = extractTag(block, "ArticleTitle") || "";
      const abstractParts: string[] = [];
      const abstractTexts = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g) || [];
      for (const at of abstractTexts) {
        const labelMatch = at.match(/Label="([^"]+)"/);
        const textContent = at.replace(/<[^>]+>/g, "").trim();
        if (labelMatch) {
          abstractParts.push(`${labelMatch[1]}: ${textContent}`);
        } else {
          abstractParts.push(textContent);
        }
      }
      const abstract = abstractParts.join("\n");

      const authorMatches = block.match(/<Author[\s\S]*?<\/Author>/g) || [];
      const authors = authorMatches.map((a) => {
        const last = extractTag(a, "LastName") || "";
        const first = extractTag(a, "ForeName") || "";
        return `${last} ${first}`.trim();
      }).filter(Boolean);

      const journal = extractTag(block, "Title") || extractTag(block, "ISOAbbreviation") || "";
      const year = extractTag(block, "Year") || "";
      const month = extractTag(block, "Month") || "01";
      const day = extractTag(block, "Day") || "01";
      const pubDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

      const meshMatches = block.match(/<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/g) || [];
      const meshTerms = meshMatches.map((m) => m.replace(/<[^>]+>/g, "").trim());

      const kwMatches = block.match(/<Keyword[^>]*>([\s\S]*?)<\/Keyword>/g) || [];
      const keywords = kwMatches.map((k) => k.replace(/<[^>]+>/g, "").trim());

      const doiMatch = block.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
      const doi = doiMatch ? doiMatch[1].trim() : "";

      if (pmid && title) {
        articles.push({ pmid, title, abstract, authors, journal, pubDate, meshTerms, keywords, doi });
      }
    } catch (e) {
      continue;
    }
  }

  return articles;
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : null;
}

function categorizeArticle(article: PubMedArticle): string {
  const text = `${article.title} ${article.abstract} ${article.meshTerms.join(" ")} ${article.keywords.join(" ")}`.toLowerCase();

  if (text.includes("artificial intelligence") || text.includes("machine learning") || text.includes("deep learning") || text.includes("neural network") || text.includes("large language model")) return "ai_ent";
  if (text.includes("pediatric") || text.includes("child") || text.includes("neonat") || text.includes("infant")) {
    if (text.includes("otolaryngol") || text.includes("tonsil") || text.includes("adenoid") || text.includes("ear tube") || text.includes("myringotomy") || text.includes("hearing")) return "pediatric_ent";
  }
  if (text.includes("skull base") || text.includes("anterior cranial") || text.includes("pituitary") || text.includes("cerebrospinal fluid leak")) return "skull_base";
  if (text.includes("salivary") || text.includes("parotid") || text.includes("submandibular gland") || text.includes("sialolithiasis") || text.includes("sialadenitis")) return "salivary_gland";
  if (text.includes("tracheostom") || text.includes("subglottic stenosis") || text.includes("laryngotracheal") || text.includes("airway obstruction") || text.includes("stridor")) return "airway";
  if (text.includes("rhinoplast") || text.includes("facial plastic") || text.includes("septoplast") || text.includes("blepharoplast") || text.includes("facelift") || text.includes("facial reconstruction")) return "facial_plastics";
  if (text.includes("allergic rhinit") || text.includes("immunotherapy") && text.includes("rhinit") || text.includes("sublingual immunotherapy") || text.includes("allergy") && text.includes("nasal")) return "allergy";
  if (text.includes("voice disorder") || text.includes("dysphoni") || text.includes("spasmodic dysphonia") || text.includes("voice therapy") || text.includes("vocal hygiene")) return "voice_disorders";
  if (text.includes("vertigo") || text.includes("meniere") || text.includes("vestibular") || text.includes("benign paroxysmal") || text.includes("bppv")) return "vestibular";
  if (text.includes("laryngopharyngeal reflux") || text.includes("lpr") && text.includes("reflux")) return "laryngopharyngeal_reflux";
  if (text.includes("laryngo") || text.includes("vocal cord") || text.includes("vocal fold") || text.includes("glott")) return "laryngology";
  if (text.includes("otitis") || text.includes("hearing") || text.includes("cochle") || text.includes("tympan") || text.includes("cholesteatoma") || text.includes("sensorineural")) return "otology";
  if (text.includes("sinus") || text.includes("rhinit") || text.includes("nasal") || text.includes("nose") || text.includes("rhinol") || text.includes("sinuplasty")) return "rhinology";
  if (text.includes("cancer") || text.includes("neoplas") || text.includes("tumor") || text.includes("carcinoma") || text.includes("squamous cell")) return "head_neck_oncology";
  if (text.includes("sleep apnea") || text.includes("snoring") || text.includes("obstructive sleep") || text.includes("uvulopalatopharyngoplasty")) return "sleep_medicine";
  if (text.includes("swallow") || text.includes("deglutit") || text.includes("dysphag") || text.includes("modified barium") || text.includes("fiberoptic endoscopic evaluation")) return "dysphagia";
  if (text.includes("thyroid") || text.includes("parathyroid") || text.includes("thyroidectom")) return "thyroid";
  if (text.includes("tonsil") || text.includes("adenoid") || text.includes("pharyn")) return "pharyngology";
  if (text.includes("endoscop")) return "endoscopy";
  return "general_ent";
}

function generateTrainingSamples(article: PubMedArticle): Array<{ input: string; output: string; category: string }> {
  const samples: Array<{ input: string; output: string; category: string }> = [];
  const category = categorizeArticle(article);

  if (!article.abstract || article.abstract.length < 100) return samples;

  samples.push({
    input: `Summarize the key findings from the following ENT research: "${article.title}"`,
    output: `Based on the study "${article.title}" published in ${article.journal} (${article.pubDate}):\n\n${article.abstract}\n\nAuthors: ${article.authors.slice(0, 5).join(", ")}${article.authors.length > 5 ? " et al." : ""}\n${article.doi ? `DOI: ${article.doi}` : `PMID: ${article.pmid}`}`,
    category,
  });

  if (article.meshTerms.length > 0) {
    samples.push({
      input: `What MeSH terms and medical concepts are associated with "${article.title}"?`,
      output: `The study "${article.title}" is indexed with the following MeSH terms: ${article.meshTerms.join(", ")}.\n\n${article.keywords.length > 0 ? `Additional keywords: ${article.keywords.join(", ")}.` : ""}\n\nThis article falls under the ${category.replace(/_/g, " ")} subcategory of otolaryngology.`,
      category,
    });
  }

  const hasBackground = article.abstract.toLowerCase().includes("background") || article.abstract.toLowerCase().includes("objective");
  const hasConclusion = article.abstract.toLowerCase().includes("conclusion") || article.abstract.toLowerCase().includes("results");
  if (hasBackground && hasConclusion) {
    samples.push({
      input: `What clinical question does this study address and what were the conclusions? Title: "${article.title}"`,
      output: article.abstract,
      category,
    });
  }

  return samples;
}

async function runCollection(queryType: "mesh" | "keyword" | "both", maxPerQuery: number = 10): Promise<CollectionRun> {
  const run: CollectionRun = {
    id: `pubmed-${Date.now()}`,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    queryType,
    articlesFound: 0,
    articlesStored: 0,
    samplesGenerated: 0,
    errors: [],
  };
  currentRun = run;

  try {
    const queries: string[] = [];
    if (queryType === "mesh" || queryType === "both") queries.push(...MESH_QUERIES);
    if (queryType === "keyword" || queryType === "both") queries.push(...KEYWORD_QUERIES);

    const allPmids = new Set<string>();

    for (const query of queries) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const pmids = await searchPubMed(query, maxPerQuery);
        pmids.forEach((id) => allPmids.add(id));
      } catch (e: any) {
        run.errors.push(`Search "${query.slice(0, 50)}...": ${e.message}`);
      }
    }

    run.articlesFound = allPmids.size;
    console.log(`[pubmed-ent] Found ${allPmids.size} unique articles from ${queries.length} queries`);

    const pmidArray = Array.from(allPmids);
    const batchSize = 50;
    const articles: PubMedArticle[] = [];

    for (let i = 0; i < pmidArray.length; i += batchSize) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const batch = await fetchArticleDetails(pmidArray.slice(i, i + batchSize));
        articles.push(...batch);
      } catch (e: any) {
        run.errors.push(`Fetch batch ${i}: ${e.message}`);
      }
    }

    let newArticles = 0;
    for (const article of articles) {
      if (!storedArticles.has(article.pmid)) {
        storedArticles.set(article.pmid, article);
        newArticles++;
      }
    }
    run.articlesStored = newArticles;

    let samplesGenerated = 0;
    for (const article of articles) {
      const samples = generateTrainingSamples(article);
      for (const sample of samples) {
        try {
          const existing = await db
            .select({ id: trainingDataTable.id })
            .from(trainingDataTable)
            .where(
              and(
                eq(trainingDataTable.source, "pubmed"),
                eq(trainingDataTable.inputText, sample.input)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            await db.insert(trainingDataTable).values({
              inputText: sample.input,
              outputText: sample.output,
              systemPrompt: "You are a board-certified otolaryngologist and AI-in-medicine researcher with comprehensive knowledge of current ENT literature. Per Bao et al. (JAMA Otolaryngology 2026), LLM applications in ENT span data structuring, precision medicine, administrative efficiency, decision support, and multimodal integration. Reference evidence-based benchmarks and cite sources when applicable.",
              category: sample.category,
              quality: 4,
              source: "pubmed",
            });
            samplesGenerated++;
          }
        } catch (e: any) {
          run.errors.push(`Store sample: ${e.message}`);
        }
      }
    }

    run.samplesGenerated = samplesGenerated;
    run.status = "completed";
    run.completedAt = new Date().toISOString();
    console.log(`[pubmed-ent] Collection complete: ${run.articlesFound} found, ${run.articlesStored} new articles, ${run.samplesGenerated} samples generated`);
  } catch (e: any) {
    run.status = "failed";
    run.errors.push(`Fatal: ${e.message}`);
    run.completedAt = new Date().toISOString();
    console.error(`[pubmed-ent] Collection failed:`, e.message);
  }

  currentRun = null;
  runHistory.unshift(run);
  if (runHistory.length > 50) runHistory.pop();
  return run;
}

router.get("/pubmed-ent/status", (_req, res) => {
  const totalSamples = storedArticles.size;
  res.json({
    autoCollectEnabled,
    currentRun,
    totalArticlesCached: storedArticles.size,
    runHistory: runHistory.slice(0, 20),
    meshQueries: MESH_QUERIES.length,
    keywordQueries: KEYWORD_QUERIES.length,
  });
});

router.get("/pubmed-ent/stats", async (_req, res) => {
  try {
    const samples = await db
      .select({
        category: trainingDataTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(trainingDataTable)
      .where(eq(trainingDataTable.source, "pubmed"))
      .groupBy(trainingDataTable.category);

    const total = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainingDataTable)
      .where(eq(trainingDataTable.source, "pubmed"));

    const recent = await db
      .select()
      .from(trainingDataTable)
      .where(eq(trainingDataTable.source, "pubmed"))
      .orderBy(desc(trainingDataTable.createdAt))
      .limit(10);

    res.json({
      totalSamples: total[0]?.count || 0,
      byCategory: Object.fromEntries(samples.map((s) => [s.category, s.count])),
      recentSamples: recent,
      totalArticlesCached: storedArticles.size,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/pubmed-ent/collect", async (req, res) => {
  if (currentRun) {
    return res.status(409).json({ error: "Collection already in progress", currentRun });
  }

  const { queryType = "both", maxPerQuery = 10 } = req.body || {};
  res.json({ message: "Collection started", queryType, maxPerQuery });

  runCollection(queryType, maxPerQuery).catch((e) =>
    console.error("[pubmed-ent] Background collection error:", e)
  );
});

router.post("/pubmed-ent/search-custom", async (req, res) => {
  try {
    const { query, maxResults = 10 } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });

    const pmids = await searchPubMed(query, maxResults);
    const articles = await fetchArticleDetails(pmids);

    articles.forEach((a) => {
      if (!storedArticles.has(a.pmid)) storedArticles.set(a.pmid, a);
    });

    res.json({
      query,
      found: articles.length,
      articles: articles.map((a) => ({
        pmid: a.pmid,
        title: a.title,
        authors: a.authors.slice(0, 3).join(", ") + (a.authors.length > 3 ? " et al." : ""),
        journal: a.journal,
        pubDate: a.pubDate,
        category: categorizeArticle(a),
        hasAbstract: a.abstract.length > 0,
        meshTerms: a.meshTerms.slice(0, 5),
        doi: a.doi,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/pubmed-ent/articles", (req, res) => {
  const search = ((req.query.search as string) || "").toLowerCase().trim();
  const categoryFilter = (req.query.category as string) || "";
  const yearFilter = (req.query.year as string) || "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));
  const sortBy = (req.query.sortBy as string) || "date";
  const sortDir = (req.query.sortDir as string) || "desc";

  let allArticles = Array.from(storedArticles.values()).map((a) => {
    const cat = categorizeArticle(a);
    return { ...a, _category: cat };
  });

  if (search) {
    allArticles = allArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(search) ||
        a.journal.toLowerCase().includes(search) ||
        a.abstract.toLowerCase().includes(search) ||
        a.authors.some((auth: string) => auth.toLowerCase().includes(search)) ||
        a.pmid.includes(search)
    );
  }

  if (categoryFilter) {
    allArticles = allArticles.filter((a) => a._category === categoryFilter);
  }

  if (yearFilter) {
    allArticles = allArticles.filter((a) => a.pubDate.startsWith(yearFilter));
  }

  const categories = Array.from(storedArticles.values()).reduce((acc: Record<string, number>, a) => {
    const cat = categorizeArticle(a);
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const years = Array.from(new Set(
    Array.from(storedArticles.values()).map((a) => a.pubDate.slice(0, 4)).filter(Boolean)
  )).sort((a, b) => b.localeCompare(a));

  allArticles.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "title") return dir * a.title.localeCompare(b.title);
    if (sortBy === "journal") return dir * a.journal.localeCompare(b.journal);
    if (sortBy === "category") return dir * a._category.localeCompare(b._category);
    return dir * b.pubDate.localeCompare(a.pubDate);
  });

  const totalFiltered = allArticles.length;
  const totalPages = Math.ceil(totalFiltered / pageSize);
  const paged = allArticles.slice((page - 1) * pageSize, page * pageSize);

  const articles = paged.map((a) => ({
    pmid: a.pmid,
    title: a.title,
    authors: a.authors.slice(0, 3).join(", ") + (a.authors.length > 3 ? " et al." : ""),
    journal: a.journal,
    pubDate: a.pubDate,
    category: a._category,
    hasAbstract: a.abstract.length > 0,
    abstractLength: a.abstract.length,
    abstractPreview: a.abstract.length > 0 ? a.abstract.slice(0, 300) + (a.abstract.length > 300 ? "..." : "") : "",
    meshTerms: a.meshTerms.slice(0, 5),
    keywords: a.keywords.slice(0, 5),
    doi: a.doi,
  }));

  res.json({
    total: storedArticles.size,
    totalFiltered,
    page,
    pageSize,
    totalPages,
    categories,
    years,
    articles,
  });
});

router.get("/pubmed-ent/article/:pmid", (req, res) => {
  const article = storedArticles.get(req.params.pmid);
  if (!article) return res.status(404).json({ error: "Article not found in cache" });
  res.json({ ...article, category: categorizeArticle(article) });
});

router.post("/pubmed-ent/export-articles", (req, res) => {
  try {
    const { pmids, format } = req.body as { pmids?: string[]; format?: string };
    const exportFormat = format || "jsonl";

    let articlesToExport: any[];
    if (pmids && pmids.length > 0) {
      articlesToExport = pmids
        .map((id) => storedArticles.get(id))
        .filter(Boolean) as any[];
    } else {
      articlesToExport = Array.from(storedArticles.values());
    }

    if (articlesToExport.length === 0) {
      return res.status(404).json({ error: "No articles found for export" });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    if (exportFormat === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="pubmed-articles-${timestamp}.csv"`);
      res.write("PMID,Title,Authors,Journal,PubDate,Category,DOI,AbstractLength,MeSH Terms\n");
      for (const a of articlesToExport) {
        const cat = categorizeArticle(a);
        const csvRow = [
          a.pmid,
          `"${a.title.replace(/"/g, '""')}"`,
          `"${a.authors.join("; ").replace(/"/g, '""')}"`,
          `"${a.journal.replace(/"/g, '""')}"`,
          a.pubDate,
          cat,
          a.doi || "",
          a.abstract.length,
          `"${a.meshTerms.join("; ").replace(/"/g, '""')}"`,
        ].join(",");
        res.write(csvRow + "\n");
      }
      res.end();
    } else {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename="pubmed-articles-${timestamp}.jsonl"`);
      for (const a of articlesToExport) {
        const line = JSON.stringify({
          pmid: a.pmid,
          title: a.title,
          authors: a.authors,
          journal: a.journal,
          pubDate: a.pubDate,
          category: categorizeArticle(a),
          abstract: a.abstract,
          meshTerms: a.meshTerms,
          keywords: a.keywords,
          doi: a.doi,
        });
        res.write(line + "\n");
      }
      res.end();
    }

    console.log(`[pubmed-export] Exported ${articlesToExport.length} articles as ${exportFormat}`);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/pubmed-ent/generate-samples/:pmid", async (req, res) => {
  try {
    const article = storedArticles.get(req.params.pmid);
    if (!article) return res.status(404).json({ error: "Article not found in cache" });

    const samples = generateTrainingSamples(article);
    let stored = 0;

    for (const sample of samples) {
      const existing = await db
        .select({ id: trainingDataTable.id })
        .from(trainingDataTable)
        .where(
          and(
            eq(trainingDataTable.source, "pubmed"),
            eq(trainingDataTable.inputText, sample.input)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(trainingDataTable).values({
          inputText: sample.input,
          outputText: sample.output,
          systemPrompt: "You are a board-certified otolaryngologist and AI-in-medicine researcher with comprehensive knowledge of current ENT literature. Per Bao et al. (JAMA Otolaryngology 2026), LLM applications in ENT span data structuring, precision medicine, administrative efficiency, decision support, and multimodal integration. Reference evidence-based benchmarks and cite sources when applicable.",
          category: sample.category,
          quality: 4,
          source: "pubmed",
        });
        stored++;
      }
    }

    res.json({
      pmid: article.pmid,
      title: article.title,
      samplesGenerated: samples.length,
      samplesStored: stored,
      category: categorizeArticle(article),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/pubmed-ent/auto-collect", (req, res) => {
  const { enabled, intervalMinutes = 120 } = req.body;

  if (enabled && !autoCollectEnabled) {
    autoCollectEnabled = true;
    autoCollectInterval = setInterval(() => {
      if (!currentRun) {
        console.log("[pubmed-ent] Auto-collect triggered");
        runCollection("both", 5).catch((e) =>
          console.error("[pubmed-ent] Auto-collect error:", e)
        );
      }
    }, intervalMinutes * 60 * 1000);
    console.log(`[pubmed-ent] Auto-collect enabled every ${intervalMinutes} minutes`);
    res.json({ enabled: true, intervalMinutes });
  } else if (!enabled && autoCollectEnabled) {
    autoCollectEnabled = false;
    if (autoCollectInterval) {
      clearInterval(autoCollectInterval);
      autoCollectInterval = null;
    }
    console.log("[pubmed-ent] Auto-collect disabled");
    res.json({ enabled: false });
  } else {
    res.json({ enabled: autoCollectEnabled });
  }
});

router.get("/pubmed-ent/queries", (_req, res) => {
  res.json({
    meshQueries: MESH_QUERIES,
    keywordQueries: KEYWORD_QUERIES,
  });
});

export default router;
