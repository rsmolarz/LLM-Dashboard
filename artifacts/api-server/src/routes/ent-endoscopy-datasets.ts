import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, documentsTable, documentChunksTable, trainingDataTable, llmConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

const ENDOSCOPY_DATASETS_REGISTRY = [
  {
    id: "uw-sinus-surgery",
    name: "UW Sinus Surgery Endoscopic Dataset",
    source: "University of Washington BioRobotics Lab",
    type: "endoscopic-images",
    modality: "Endoscopic sinus surgery video frames",
    subsets: ["UW-Sinus-Surgery-C (cadaver)", "UW-Sinus-Surgery-L (live)"],
    description: "Endoscopic sinus surgery images with manual annotations for surgical instrument segmentation. Features dexterous tip motion, narrow operation space and close lens-object distance.",
    accessUrl: "https://digital.lib.washington.edu/researchworks/handle/1773/45396",
    githubUrl: "https://github.com/SURA23/Sinus-Surgery-Endoscopic-Image-Datasets",
    license: "Research use",
    citations: [
      "Lin et al., LC-GAN: Image-to-image translation based on generative adversarial network for endoscopic images, IROS 2020",
      "Qin et al., Towards better surgical instrument segmentation in endoscopic vision, IEEE RA-L 2020",
    ],
    status: "available",
    tasks: ["instrument-segmentation", "skill-assessment"],
    anatomy: ["paranasal-sinuses", "nasal-cavity"],
  },
  {
    id: "nasalseg",
    name: "NasalSeg Dataset",
    source: "Zhang et al., Scientific Data 2024",
    type: "ct-scans",
    modality: "3D CT images",
    subsets: ["130 CT scans with 5-structure pixel-wise annotations"],
    description: "First large-scale open-access annotated dataset for nasal cavity and paranasal sinus segmentation. Includes left/right nasal cavity, nasopharynx, left/right maxillary sinus annotations.",
    accessUrl: "https://zenodo.org/records/13893419",
    githubUrl: "https://github.com/YichiZhang98/NasalSeg",
    license: "Open access (CC)",
    citations: [
      "Zhang et al., NasalSeg: A Dataset for Automatic Segmentation of Nasal Cavity and Paranasal Sinuses from 3D CT Images, Scientific Data 2024",
    ],
    status: "available",
    tasks: ["segmentation", "anatomy-identification"],
    anatomy: ["nasal-cavity", "maxillary-sinus", "nasopharynx"],
  },
  {
    id: "nbi-infframes",
    name: "NBI-InfFrames Dataset",
    source: "Moccia et al., Zenodo 2018",
    type: "endoscopic-images",
    modality: "Narrow Band Imaging (NBI) laryngoscopy",
    subsets: ["NBI laryngoscopy frames for informative frame selection"],
    description: "Narrow Band Imaging laryngoscopy frames used for training informative frame selection models. NBI enhances mucosal vasculature visualization for detecting dysplasia and early cancer.",
    accessUrl: "https://zenodo.org/search?q=moccia+laryngoscopy+NBI",
    githubUrl: null,
    license: "Open access",
    citations: [
      "Moccia et al., Confident texture-based laryngeal tissue classification for early stage diagnosis support, 2017",
    ],
    status: "available",
    tasks: ["frame-classification", "tissue-classification"],
    anatomy: ["larynx", "vocal-folds"],
  },
  {
    id: "laves-laryngeal",
    name: "Laryngeal Endoscopic Images (Laves et al.)",
    source: "Laves et al., IJCARS 2018",
    type: "endoscopic-images",
    modality: "Laryngeal endoscopy with semantic segmentation",
    subsets: ["Endoscopic images with CNN-based segmentation labels"],
    description: "Public dataset for semantic segmentation of laryngeal endoscopic images. Includes pixel-level annotations for glottis, vocal folds, and surrounding structures.",
    accessUrl: "https://doi.org/10.1007/s11548-018-01910-0",
    githubUrl: null,
    license: "Research use",
    citations: [
      "Laves et al., A dataset of laryngeal endoscopic images with comparative study on CNN-based semantic segmentation, IJCARS 2019",
    ],
    status: "available",
    tasks: ["semantic-segmentation", "glottis-detection"],
    anatomy: ["larynx", "glottis", "vocal-folds"],
  },
  {
    id: "q-larynx",
    name: "Q-Larynx (Quantitative Laryngoscopy)",
    source: "Kuo et al., Scientific Reports 2021",
    type: "endoscopic-video",
    modality: "Laryngoscopy video",
    subsets: ["50 laryngoscopy videos with segmentation annotations"],
    description: "50 laryngoscopy videos designed for quantitative analysis and segmentation of laryngeal structures. Supports automated vocal fold analysis.",
    accessUrl: "https://doi.org/10.1038/s41598-021-91856-6",
    githubUrl: null,
    license: "Research use",
    citations: [
      "Kuo et al., Quantitative laryngoscopy with computer-aided diagnostic system, Scientific Reports 2021",
    ],
    status: "available",
    tasks: ["video-segmentation", "vocal-fold-analysis"],
    anatomy: ["larynx", "vocal-folds"],
  },
  {
    id: "vocal-fold-paralysis",
    name: "Vocal Fold Paralysis Dataset",
    source: "Low D.M., 2021",
    type: "mixed",
    modality: "Audio + laryngoscopy",
    subsets: ["Vocal samples and laryngoscopic images of vocal fold paralysis"],
    description: "Publicly shared dataset combining audio recordings and laryngoscopic imaging for vocal fold paralysis detection and classification.",
    accessUrl: "https://github.com/danielmlow/vocal-fold-paralysis",
    githubUrl: "https://github.com/danielmlow/vocal-fold-paralysis",
    license: "Open source",
    citations: [
      "Low D.M., Vocal fold paralysis dataset, 2021",
    ],
    status: "available",
    tasks: ["paralysis-detection", "audio-classification"],
    anatomy: ["vocal-folds", "larynx"],
  },
  {
    id: "vofcd",
    name: "VoFoCD (Vocal Fold Classification & Detection)",
    source: "Dao et al., J Imaging Informatics Med 2024",
    type: "endoscopic-images",
    modality: "Laryngoscopy images",
    subsets: ["1,724 images with 4 classes + 6 glottic object types"],
    description: "Multi-task dataset for vocal fold classification and detection. Includes normal vocal folds and pathologies (benign and malignant lesions). 0.951 accuracy reported.",
    accessUrl: "Contact: Cho Ray Hospital, Vietnam",
    githubUrl: null,
    license: "Restricted (institutional)",
    citations: [
      "Dao et al., VoFoCD: Vocal Fold Classification and Detection Dataset, 2024",
    ],
    status: "restricted",
    tasks: ["classification", "object-detection"],
    anatomy: ["vocal-folds", "glottis"],
  },
  {
    id: "stanford-nasal-endoscopy",
    name: "Stanford Nasal Endoscopy Dataset",
    source: "Stanford, Int Forum Allergy Rhinology 2025",
    type: "endoscopic-images",
    modality: "Nasal endoscopy",
    subsets: ["1,242 images: 663 normal, 276 polyps, 157 benign tumors, 146 malignant tumors"],
    description: "Classification and segmentation dataset for sinonasal masses from nasal endoscopy. Covers 13 benign and 18 malignant tumor types. 90.5% accuracy with EfficientNet-B2.",
    accessUrl: "Contact: Stanford ENT department",
    githubUrl: null,
    license: "Research collaboration",
    citations: [
      "Machine Learning of Endoscopy Images to Identify, Classify, and Segment Sinonasal Masses, 2025",
    ],
    status: "restricted",
    tasks: ["classification", "segmentation", "tumor-detection"],
    anatomy: ["nasal-cavity", "paranasal-sinuses"],
  },
  {
    id: "ochsner-ne",
    name: "Ochsner Nasal Endoscopy Dataset",
    source: "Ochsner Health, Int Forum Allergy Rhinology 2025",
    type: "endoscopic-images",
    modality: "Nasal endoscopy",
    subsets: ["3,513 images from 452 patients"],
    description: "Multi-class detection dataset for sinusitis diagnosis. Annotated for middle turbinate, inferior turbinate, and mucus detection using YOLOv11-nano.",
    accessUrl: "Contact: Ochsner Health research team",
    githubUrl: null,
    license: "Research collaboration",
    citations: [
      "Machine Learning-Enhanced Clinical Decision Support for Diagnosing Sinusitis With Nasal Endoscopy, 2025",
    ],
    status: "restricted",
    tasks: ["object-detection", "sinusitis-diagnosis"],
    anatomy: ["nasal-cavity", "turbinates"],
  },
  {
    id: "hyperkvasir",
    name: "HyperKvasir (GI Endoscopy - Transfer Learning)",
    source: "SimulaMet, Borgli et al. 2020",
    type: "endoscopic-images",
    modality: "Gastrointestinal endoscopy",
    subsets: ["110,079 images + 373 videos"],
    description: "Largest GI endoscopy dataset. While not ENT-specific, useful for transfer learning of endoscopic image recognition models. Includes landmarks, pathologies, quality frames.",
    accessUrl: "https://datasets.simula.no/hyper-kvasir/",
    githubUrl: "https://github.com/simula/hyper-kvasir",
    license: "Open access (CC BY 4.0)",
    citations: [
      "Borgli et al., HyperKvasir, a comprehensive multi-class image and video dataset for gastrointestinal endoscopy, Scientific Data 2020",
    ],
    status: "available",
    tasks: ["classification", "detection", "segmentation", "transfer-learning"],
    anatomy: ["gastrointestinal"],
  },
];

const ENDOSCOPY_TRAINING_KNOWLEDGE = [
  {
    title: "Flexible Laryngoscopy - AI-Assisted Diagnosis Training",
    category: "ent-endoscopy-ai",
    content: `AI-ASSISTED FLEXIBLE LARYNGOSCOPY DIAGNOSIS

DEEP LEARNING FOR VOCAL FOLD PATHOLOGY DETECTION:
Current state-of-the-art models can detect and classify vocal fold pathologies from flexible laryngoscopy images with high accuracy. Key approaches include:

1. CONVOLUTIONAL NEURAL NETWORKS (CNN):
- EfficientNet-B2: Achieves 90.5% accuracy for sinonasal mass classification
- ResNet-50: Widely used backbone for endoscopic image classification
- VGG-16/19: Used for initial feature extraction from laryngoscopy frames
- YOLOv11: Real-time detection of anatomical structures and pathology

2. INFORMATIVE FRAME SELECTION:
- Automated classification of laryngoscopic video frames into informative vs non-informative
- Critical preprocessing step — reduces noise from blurred, dark, or out-of-focus frames
- Yao et al. (2022) achieved reliable selection from 22,132 frames
- Key features: motion blur detection, tissue visibility scoring, illumination quality

3. VOCAL FOLD MOTION TRACKING:
- Real-time automated tracking of vocal fold motion during office laryngoscopy
- Measures glottic area over time for quantitative assessment
- Keypoint detection models identify 39 laryngeal landmarks (Koivu et al., 2026)
- Applications: vocal fold paralysis detection, movement asymmetry quantification

4. NARROW BAND IMAGING (NBI) ANALYSIS:
- NBI enhances superficial mucosal vasculature patterns
- AI models distinguish between benign and malignant vascular patterns
- Type V classification (Ni classification): Types I-III (benign), IV (suspicious), V (malignant)
- Intra-papillary capillary loops (IPCL) pattern recognition
- Sensitivity >90% for detecting laryngeal dysplasia and early SCC

5. STROBOSCOPY ANALYSIS:
- Automated mucosal wave analysis from videostroboscopy
- Quantification of vibratory parameters: amplitude, mucosal wave propagation, phase symmetry
- Detection of stiffness patterns indicating Reinke's edema, scarring, or infiltrative lesions

TRAINING DATA CONSIDERATIONS:
- Data augmentation essential: rotation, flipping, color jittering, elastic deformation
- Class imbalance common (normal >> pathological) — use weighted sampling or SMOTE
- Multi-center data improves generalization
- Annotation by experienced laryngologists critical for quality
- Video vs frame-based approaches: video captures temporal dynamics but requires more compute

CLINICAL VALIDATION REQUIREMENTS:
- Prospective validation on independent dataset
- Comparison with expert consensus
- Sensitivity/specificity reporting per pathology class
- Analysis of failure modes (false positives in post-surgical cases, etc.)`,
  },
  {
    title: "Nasal Endoscopy - Pathology Recognition Training Data",
    category: "ent-endoscopy-ai",
    content: `NASAL ENDOSCOPY AI PATHOLOGY RECOGNITION

AUTOMATED SINONASAL MASS CLASSIFICATION:
Machine learning models can classify nasal endoscopy findings into four major categories:
1. Normal mucosa (baseline reference)
2. Nasal polyps (inflammatory, most common mass)
3. Benign tumors (inverted papilloma, hemangioma, osteoma, schwannoma, etc.)
4. Malignant tumors (SCC, adenocarcinoma, esthesioneuroblastoma, lymphoma, melanoma, etc.)

KEY DIFFERENTIATING FEATURES:
Nasal Polyps:
- Grape-like, translucent, pedunculated masses
- Bilateral in most cases (if unilateral, rule out neoplasm)
- Smooth, glistening surface
- Insensate to touch (do not bleed easily)
- Origin: ethmoid sinuses, middle meatus
- Associated: CRSwNP, AERD, AFRS, CF

Inverted Papilloma (IP):
- Unilateral in >90% of cases
- Irregular, lobulated, papillomatous surface
- Often arises from lateral nasal wall/middle meatus
- Pink-gray color, firmer than polyps
- 5-15% malignant transformation risk
- Requires complete excision with margins

Malignant Tumors:
- Irregular surface, friable (bleeds easily on contact)
- Usually unilateral
- May have necrotic areas
- Bone erosion on CT
- Unilateral epistaxis, obstruction, facial pain
- Cranial nerve deficits suggest advanced disease

ENDOSCOPIC GRADING SYSTEMS:
Lund-Kennedy Score (endoscopic):
- Polyps: 0 (absent), 1 (in middle meatus only), 2 (beyond middle meatus)
- Edema: 0 (absent), 1 (mild), 2 (severe)
- Discharge: 0 (none), 1 (clear/thin), 2 (thick/purulent)
- Scarring: 0 (absent), 1 (mild), 2 (severe)
- Crusting: 0 (absent), 1 (mild), 2 (severe)
- Scored per side (0-10 per side, 0-20 total)

SNOT-22 (subjective, not endoscopic but correlated):
- 22-item patient-reported outcome measure
- Correlates with endoscopic findings
- Used to track treatment response

POST-OPERATIVE ENDOSCOPIC MONITORING:
- Debridement visits at 1, 3, 6 weeks post-FESS
- Assessment: healing, adhesions (synechiae), recurrent polyps, ostial patency
- Modified Lund-Kennedy for post-op scoring
- Frontal recess: most common site of scarring and recurrence
- Neo-ostium patency crucial for long-term success

AI MODEL PERFORMANCE BENCHMARKS:
- EfficientNet-B2: 90.5% accuracy, 86.2% sensitivity, 94.5% specificity (Stanford 2025)
- YOLOv11-nano: Real-time detection at 30+ FPS for clinical use (Ochsner 2025)
- nnUNet: Gold standard for volumetric segmentation (NasalSeg 2024)
- CNN+attention: Improved focus on subtle mucosal changes`,
  },
  {
    title: "Endoscopic Sinus Surgery - Instrument and Anatomy Recognition",
    category: "ent-endoscopy-ai",
    content: `ENDOSCOPIC SINUS SURGERY (ESS) - AI APPLICATIONS

SURGICAL INSTRUMENT SEGMENTATION:
AI models trained on endoscopic sinus surgery video can identify and track surgical instruments in real-time. Key applications:

1. INSTRUMENT TYPES RECOGNIZED:
- Microdebrider (powered instrument for tissue removal)
- Suction (Frazier tip, various sizes)
- Through-cutting forceps (Blakesley, Takahashi)
- Curettes (frontal sinus, sphenoid)
- Powered drill (diamond burr for bone)
- Bipolar cautery forceps
- Image-guided surgery (IGS) pointer

2. SEGMENTATION APPROACHES:
- Pixel-level binary segmentation (instrument vs background)
- Instance segmentation (individual instruments)
- Part-based segmentation (shaft, joint, tip)
- UW-Sinus-Surgery dataset: Cadaver and live surgery subsets
- Multi-angle feature aggregation improves accuracy
- Contour supervision enhances boundary detection

3. SURGICAL SKILL ASSESSMENT:
- Automated scoring based on instrument handling metrics
- Economy of motion analysis
- Time in critical zones (skull base, orbit proximity)
- Instrument trajectory smoothness
- Bleeding events per procedure
- Correlation with OSATS (Objective Structured Assessment of Technical Skills)

ANATOMICAL LANDMARK RECOGNITION:
Critical structures that AI models must identify:

Safety Landmarks:
- Lamina papyracea (medial orbital wall): Paper-thin bone
- Skull base (fovea ethmoidalis): Roof of ethmoid sinuses
- Anterior ethmoid artery: Runs along skull base, marks posterior limit of frontal recess
- Optic nerve: Medial wall of posterior ethmoid/lateral wall of sphenoid
- Internal carotid artery: Lateral wall of sphenoid sinus
- Sphenopalatine artery: Posterior attachment of middle turbinate

Surgical Landmarks:
- Uncinate process: First structure in stepwise approach
- Ethmoid bulla: Largest anterior ethmoid cell
- Basal lamella: Boundary between anterior/posterior ethmoids
- Natural maxillary ostium: Target for antrostomy
- Frontal recess: Complex 3D anatomy, most challenging area
- Sphenoid ostium: Medial to superior turbinate
- Onodi cell: Posterior ethmoid cell lateral to sphenoid (optic nerve at risk)
- Haller cell: Infraorbital ethmoid cell (may obstruct OMC)

IMAGE-GUIDED SURGERY (IGS) INTEGRATION:
- Electromagnetic or optical tracking systems
- CT-to-endoscopy registration
- Real-time overlay of planned trajectory
- Automatic instrument tip tracking
- Warning systems for proximity to critical structures
- Accuracy: typically 1-2mm in clinical practice`,
  },
  {
    title: "Flexible Laryngoscopy - Clinical Training Scenarios",
    category: "ent-endoscopy-training",
    content: `CLINICAL TRAINING SCENARIOS FOR FLEXIBLE LARYNGOSCOPY AI

SCENARIO 1: VOCAL FOLD NODULES
Patient: 35-year-old female teacher with 3-month history of hoarseness
Laryngoscopy findings:
- Bilateral symmetric white/translucent lesions at junction of anterior 1/3 and posterior 2/3 of true vocal folds
- Small, well-circumscribed
- Incomplete glottic closure (hourglass pattern)
- Preserved vocal fold mobility bilaterally
- Mucosal wave slightly reduced at nodule sites on stroboscopy
AI classification: Benign vocal fold lesion — nodules
Management: Voice therapy first-line (6-12 weeks), microsurgical excision if refractory

SCENARIO 2: VOCAL FOLD POLYP
Patient: 55-year-old male smoker with acute onset dysphonia after shouting
Laryngoscopy findings:
- Unilateral (right) pedunculated mass arising from middle third of vocal fold
- Hemorrhagic (reddish) translucent appearance
- Contralateral reactive changes (contact injury)
- Vocal fold mobility preserved
- Incomplete glottic closure
AI classification: Benign vocal fold lesion — hemorrhagic polyp
Management: Voice rest, smoking cessation, microsurgical excision if persistent

SCENARIO 3: LARYNGEAL LEUKOPLAKIA
Patient: 62-year-old male with 40-pack-year smoking history and progressive hoarseness
Laryngoscopy findings:
- White patch on right true vocal fold
- Irregular borders
- Stiffened mucosa (reduced mucosal wave on stroboscopy)
- No obvious mass effect
- Vocal fold mobility preserved
AI classification: Suspicious lesion — requires biopsy to rule out dysplasia/carcinoma
Differential: Keratosis, mild/moderate/severe dysplasia, carcinoma in situ, invasive SCC
Management: Direct laryngoscopy with biopsy MANDATORY

SCENARIO 4: UNILATERAL VOCAL FOLD PARALYSIS
Patient: 48-year-old female, 2 weeks post thyroidectomy with breathy voice and aspiration
Laryngoscopy findings:
- Left vocal fold immobile in paramedian position
- Right vocal fold crosses midline on phonation
- Large posterior glottic gap
- Pooling of secretions in left pyriform sinus
- Arytenoid prolapse on left side
AI classification: Left vocal fold paralysis — post-surgical (recurrent laryngeal nerve injury)
Management: Observation 6-12 months (possible recovery), injection laryngoplasty for symptomatic relief, medialization thyroplasty if permanent

SCENARIO 5: LARYNGOPHARYNGEAL REFLUX (LPR)
Patient: 42-year-old with chronic throat clearing, globus sensation, and intermittent hoarseness
Laryngoscopy findings:
- Posterior laryngeal erythema and edema
- Pachydermia (thickening of interarytenoid mucosa)
- Pseudosulcus (infraglottic edema creating appearance of sulcus)
- Ventricular obliteration
- Thick endolaryngeal mucus
- Reflux Finding Score (RFS): 14 (>7 suggests LPR)
AI classification: Laryngopharyngeal reflux changes
Management: PPI therapy (twice daily for 3 months), behavioral modifications

SCENARIO 6: EARLY GLOTTIC CARCINOMA
Patient: 65-year-old male with progressive hoarseness for 4 months and 50-pack-year smoking
Laryngoscopy findings:
- Irregular, raised, erythematous/leukoplakic mass on right true vocal fold
- Extends from anterior commissure to vocal process
- Stiff, no mucosal wave on stroboscopy
- Vocal fold mobility preserved (T1)
- No supraglottic or subglottic extension visible
- No cervical lymphadenopathy
AI classification: Suspicious for malignancy — glottic SCC
Required: Direct laryngoscopy under general anesthesia with biopsy, CT neck with contrast
Staging: T1aN0M0 if confirmed on biopsy with normal mobility
Treatment: Radiation therapy (cure rate >90% for T1 glottic SCC) or transoral laser microsurgery

SCENARIO 7: RECURRENT RESPIRATORY PAPILLOMATOSIS (RRP)
Patient: 8-year-old child with progressive stridor and hoarseness
Laryngoscopy findings:
- Multiple exophytic, papillomatous (cauliflower-like) masses
- Bilateral vocal folds, anterior commissure, and subglottis involved
- Pedunculated, pink-white, cluster-of-grapes appearance
- Narrowed airway
- HPV types 6 and 11
AI classification: Recurrent respiratory papillomatosis (juvenile onset)
Management: Repeated microlaryngoscopy with debulking (CO2 laser, microdebrider), cidofovir injection, bevacizumab injection, HPV vaccination (Gardasil)`,
  },
  {
    title: "Nasal Endoscopy - Clinical Training Scenarios",
    category: "ent-endoscopy-training",
    content: `CLINICAL TRAINING SCENARIOS FOR NASAL ENDOSCOPY AI

SCENARIO 1: CHRONIC RHINOSINUSITIS WITH NASAL POLYPOSIS
Patient: 45-year-old with bilateral nasal obstruction, anosmia, and postnasal drip for >12 weeks
Endoscopic findings:
- Bilateral translucent, grape-like polyps filling middle meati
- Grade 3 polyps (extending to floor of nasal cavity)
- Mucopurulent discharge from middle meati
- Edematous middle turbinates
- Olfactory cleft obscured by polyps
- Lund-Kennedy score: 16/20
AI classification: CRS with nasal polyposis (CRSwNP), Grade 3 bilateral
CT findings: Lund-Mackay score >12, bilateral opacification of ethmoids and maxillary sinuses
Management: Maximal medical therapy (topical steroids, saline irrigations, short course oral steroids), then FESS if refractory. Consider biologics (dupilumab) for Type 2 inflammation.

SCENARIO 2: UNILATERAL NASAL MASS — INVERTED PAPILLOMA
Patient: 58-year-old male with progressive unilateral left nasal obstruction and intermittent epistaxis
Endoscopic findings:
- Unilateral (left) lobulated, irregular mass in middle meatus
- Pink-gray, papillomatous surface texture
- Bleeds on contact
- Displaces middle turbinate medially
- No polyps on contralateral side
AI classification: Suspicious for inverted papilloma — biopsy required
Key differentiators from polyps: Unilateral, irregular surface, contact bleeding, firmer consistency
CT: Focal hyperostosis at site of attachment (characteristic for IP)
Management: Endoscopic medial maxillectomy with complete excision of attachment site. Long-term surveillance (10% recurrence rate, 5-15% malignant transformation)

SCENARIO 3: ALLERGIC FUNGAL RHINOSINUSITIS (AFRS)
Patient: 28-year-old with history of asthma and allergic rhinitis, bilateral nasal obstruction, thick dark nasal discharge
Endoscopic findings:
- Bilateral nasal polyps
- Characteristic "allergic mucin" — thick, tenacious, dark green/brown eosinophilic mucin
- Expansion of sinuses (bone remodeling on CT)
- Fungal debris and mucin cast filling sinuses
AI classification: Features consistent with allergic fungal rhinosinusitis
Bent-Kuhn criteria: Type I hypersensitivity, nasal polyposis, characteristic CT findings, eosinophilic mucin, positive fungal stain
Management: FESS for complete removal of fungal debris and mucin, systemic steroids, allergen immunotherapy, long-term topical steroids

SCENARIO 4: SEPTAL PERFORATION
Patient: 52-year-old with crusting, whistling noise during breathing, and history of prior septoplasty
Endoscopic findings:
- Perforation of nasal septum in anterior cartilaginous portion
- Crusted margins
- Size approximately 1.5cm
- No active bleeding
- Surrounding mucosa dry with mild atrophic changes
AI classification: Septal perforation — anterior, medium size
Differential etiology: Prior surgery (most common), cocaine use, granulomatous disease (GPA/Wegener's), topical steroid abuse, chronic digital trauma
Management: Saline irrigations, humidification, septal button (temporary), surgical repair with mucosal flaps if symptomatic and large

SCENARIO 5: JUVENILE NASOPHARYNGEAL ANGIOFIBROMA (JNA)
Patient: 16-year-old male with recurrent unilateral epistaxis and progressive nasal obstruction
Endoscopic findings:
- Smooth, lobulated, vascular mass in posterior nasal cavity
- Arising from sphenopalatine foramen area
- Highly vascular (do NOT biopsy in clinic — risk of massive hemorrhage)
- Widening of sphenopalatine foramen on CT
- Holman-Miller sign on lateral X-ray (anterior bowing of posterior wall of maxillary sinus)
AI classification: Highly vascular posterior nasal mass — consistent with JNA
DO NOT BIOPSY: Risk of uncontrollable hemorrhage
Management: CT angiography, preoperative embolization, then endoscopic or open surgical resection. Consider hormonal therapy for advanced cases.

SCENARIO 6: POST-FESS SURVEILLANCE — RECURRENT POLYPS
Patient: 3-month follow-up after endoscopic sinus surgery for CRSwNP
Endoscopic findings:
- Right side: Well-healed mucosa, patent maxillary antrostomy, no polyps
- Left side: Early polypoid change in left ethmoid cavity (Grade 1 polyps returning)
- Mild edema around frontal recess bilaterally
- No synechiae (adhesions)
- Sphenoid ostia patent bilaterally
- Modified Lund-Kennedy post-op score: 4/20
AI classification: Partial recurrence, left side — early polyp reformation
Management: Increase topical steroid irrigation, consider budesonide sinus rinse, close surveillance, consider biologic therapy if rapid recurrence

SCENARIO 7: EPISTAXIS — POSTERIOR SOURCE
Patient: 72-year-old on warfarin with profuse right-sided epistaxis not controlled by anterior packing
Endoscopic findings:
- Active arterial bleeding from right sphenopalatine artery region
- Blood pooling in nasopharynx
- No anterior bleeding source identified
- Prominent posterior septal artery branch visible
AI classification: Posterior epistaxis — sphenopalatine artery territory
Management: Endoscopic sphenopalatine artery ligation (ESPAL). Identify SPA at posterior attachment of middle turbinate, mucosal flap, clip or cauterize artery. Correct warfarin anticoagulation.`,
  },
  {
    title: "CT Sinus Analysis - AI Segmentation Training",
    category: "ent-radiology-ai",
    content: `CT SINUS IMAGING FOR AI SEGMENTATION TRAINING

ANATOMY FOR AUTOMATED SEGMENTATION:
The NasalSeg dataset (Zhang et al., 2024) identifies 5 primary structures for segmentation:
1. Left nasal cavity
2. Right nasal cavity
3. Nasopharynx
4. Left maxillary sinus
5. Right maxillary sinus

EXTENDED ANATOMY FOR COMPREHENSIVE MODELS:
Additional structures for advanced models:
6. Anterior ethmoid air cells (right and left)
7. Posterior ethmoid air cells (right and left)
8. Frontal sinus (right and left)
9. Sphenoid sinus (may be asymmetric or septated)
10. Nasal septum (cartilaginous and bony portions)
11. Inferior turbinates
12. Middle turbinates (identify concha bullosa variant)
13. Superior turbinates
14. Ostiomeatal complex region

LUND-MACKAY CT SCORING:
Standardized scoring system for sinus CT (used in research and clinical practice):
Each sinus scored 0 (clear), 1 (partial opacification), or 2 (complete opacification):
- Maxillary sinus (R/L): 0-2
- Anterior ethmoids (R/L): 0-2
- Posterior ethmoids (R/L): 0-2
- Sphenoid sinus (R/L): 0-2
- Frontal sinus (R/L): 0-2
- Ostiomeatal complex (R/L): 0 (not obstructed) or 2 (obstructed)
Total score: 0-24 (12 per side)
Score >4 correlates with clinically significant CRS

CT IMAGING PROTOCOLS:
- Non-contrast CT: Standard for sinus evaluation
- Bone algorithm/window: Critical for anatomical detail
- Coronal reformats: Primary plane for sinus anatomy
- Sagittal reformats: Essential for frontal recess evaluation
- Axial acquisition: Base data for multiplanar reconstruction
- Slice thickness: 0.5-1.0mm for high-resolution detail
- Cone-beam CT (CBCT): Lower radiation, office-based option

ANATOMICAL VARIANTS (Critical for AI to recognize):
- Agger nasi cell: Anterior-most ethmoid cell, key to frontal recess
- Haller cell (infraorbital ethmoid cell): May narrow OMC
- Onodi cell (sphenoethmoid cell): Optic nerve courses through wall
- Concha bullosa: Pneumatized middle turbinate
- Paradoxical middle turbinate: Lateral curvature
- Deviated septum: C-shaped, S-shaped, spurs
- Asymmetric ethmoid roof (Keros classification):
  Type I: 1-3mm depth (safest)
  Type II: 4-7mm depth
  Type III: 8-16mm depth (highest risk of CSF leak during surgery)
- Dehiscent lamina papyracea: Pre-existing orbital exposure
- Dehiscent carotid artery (in sphenoid): Present in ~25% of patients

SEGMENTATION MODEL ARCHITECTURES:
- nnUNet: Self-configuring framework, gold standard for medical image segmentation
- 3D U-Net: Volumetric segmentation
- V-Net: Designed for volumetric medical data
- TransUNet: Transformer + U-Net hybrid for improved global context
- SegResNet: Residual network for semantic segmentation
- Input: 3D CT volumes (typically 512x512 axial slices, variable count)
- Output: Multi-class label map (one class per anatomical structure)

DATA PREPROCESSING:
- HU windowing: Bone window (W:2000, L:400), soft tissue window (W:400, L:40)
- Resampling to isotropic voxels (e.g., 0.5mm³)
- Intensity normalization (z-score or min-max)
- Data augmentation: Random rotation, scaling, elastic deformation, intensity shifts`,
  },
  {
    title: "Endoscopy Image Quality and Preprocessing for AI",
    category: "ent-endoscopy-ai",
    content: `ENDOSCOPY IMAGE QUALITY AND PREPROCESSING FOR AI TRAINING

IMAGE QUALITY ASSESSMENT:
Endoscopic images require quality filtering before use in training:

1. INFORMATIVE FRAME CRITERIA:
- Clear visualization of target anatomy
- Adequate illumination (not over/underexposed)
- In-focus (not motion-blurred)
- Minimal specular reflections (light hotspots)
- Tissue occupies majority of frame
- No significant lens contamination (blood, mucus, fog)

2. NON-INFORMATIVE FRAME TYPES:
- Blurred/out-of-focus
- Close-wall views (scope tip touching mucosa)
- Dark/underexposed
- Lens insertion/withdrawal frames
- Completely obstructed by blood or secretions
- Specular reflection dominated

3. AUTOMATED QUALITY FILTERING:
- CNN-based binary classifier (informative vs non-informative)
- Laplacian variance for blur detection (threshold ~100)
- Histogram analysis for exposure assessment
- Edge density metrics for tissue content
- Yao et al. (2022): Trained on 22,132 frames, achieving reliable automated selection

PREPROCESSING PIPELINE:
Step 1: Frame extraction from video (if applicable)
- Typical endoscopy video: 25-30 fps
- Sample every Nth frame (N=10-30) for diversity
- Or use scene change detection for key frames

Step 2: Quality filtering
- Remove non-informative frames
- Remove duplicates/near-duplicates (perceptual hashing)
- Minimum resolution threshold (e.g., 224x224)

Step 3: Region of interest (ROI) extraction
- Remove endoscope barrel (circular mask)
- Crop to tissue area
- Handle varying aspect ratios

Step 4: Color normalization
- White balance correction (endoscope light source varies)
- Stain normalization for NBI vs white light
- Histogram equalization for contrast enhancement
- Color constancy algorithms (gray world, max-RGB)

Step 5: Augmentation for training
- Geometric: Rotation (0-360°), flipping (H/V), scaling (0.8-1.2x)
- Color: Brightness (±20%), contrast (±15%), saturation (±20%)
- Noise: Gaussian noise, speckle noise
- Elastic deformation (simulates tissue deformation)
- Cutout/random erasing (improves robustness)
- Mixup/CutMix (inter-class augmentation)

ANNOTATION STANDARDS:
- Classification: Per-frame labels by consensus of ≥2 experts
- Detection: Bounding boxes around pathology (PASCAL VOC or COCO format)
- Segmentation: Pixel-level masks (binary or multi-class)
- Inter-annotator agreement: Cohen's kappa ≥0.7 for quality
- Ground truth verification by senior specialist

DATASET SPLIT STRATEGIES:
- Patient-level split (NOT frame-level): Prevents data leakage
- Typical: 70% train / 15% validation / 15% test
- K-fold cross-validation for small datasets
- External validation set from different institution preferred
- Temporal split: Training on older data, testing on newer data`,
  },
  {
    title: "Transfer Learning Strategies for ENT Endoscopy",
    category: "ent-endoscopy-ai",
    content: `TRANSFER LEARNING FOR ENT ENDOSCOPY AI MODELS

STRATEGY 1: IMAGENET → ENT ENDOSCOPY
- Pre-train on ImageNet (1.4M images, 1000 classes)
- Fine-tune on ENT endoscopy dataset
- Effective even with small ENT datasets (100-500 images)
- Freeze early layers, fine-tune later layers
- Learning rate: 10-100x lower than initial pretraining

STRATEGY 2: GI ENDOSCOPY → ENT ENDOSCOPY
- Leverages visual similarities between endoscopic modalities
- HyperKvasir (110K GI images) as intermediate domain
- Better feature transfer than ImageNet for endoscopic tasks
- Shared features: mucosal texture, vascular patterns, specular reflections
- Domain gap: Different anatomy, lighting, scope diameter

STRATEGY 3: MULTI-TASK LEARNING
- Train single model for multiple ENT tasks simultaneously
- Classification head + detection head + segmentation head
- Shared backbone extracts common features
- Task-specific heads learn specialized features
- Regularization effect prevents overfitting on small datasets

STRATEGY 4: SELF-SUPERVISED PRETRAINING
- Contrastive learning (SimCLR, MoCo) on unlabeled endoscopy video
- Masked autoencoder (MAE) for endoscopic image reconstruction
- Rotation prediction as pretext task
- Temporal coherence in endoscopy video sequences
- Leverages large amounts of unlabeled clinical video data

PRACTICAL IMPLEMENTATION:
For Ollama/LLM integration:
- Use LLaVA (Large Language and Vision Assistant) for multimodal understanding
- Fine-tune llava:13b on ENT endoscopy image-text pairs
- Create instruction-following dataset:
  Input: [endoscopy image] + "What pathology do you see?"
  Output: "This laryngoscopy image shows bilateral vocal fold nodules at the junction of the anterior third and posterior two-thirds..."
- Minimum dataset size: 500+ image-text pairs for meaningful fine-tuning
- Evaluation: Expert comparison on held-out test set

RECOMMENDED TRAINING PIPELINE:
1. Collect endoscopy images from public datasets
2. Generate Q&A pairs using expert annotations
3. Format as instruction-following conversations
4. Fine-tune LLaVA or similar multimodal model via Ollama
5. Validate against expert consensus
6. Deploy for clinical decision support (not autonomous diagnosis)

OLLAMA MULTIMODAL MODELS:
- llava:13b — best for detailed image analysis
- llava:7b — faster, suitable for real-time assistance
- bakllava — alternative vision-language model
- Future: CogVLM, InternVL for specialized medical use`,
  },
];

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  let currentChunk = "";
  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).trim().length > 500 && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const words = currentChunk.split(/\s+/);
      currentChunk = words.slice(-50).join(" ") + " " + sentence;
    } else {
      currentChunk = (currentChunk + " " + sentence).trim();
    }
  }
  if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
  return chunks.length > 0 ? chunks : [text];
}

router.get("/ent-datasets/registry", async (_req, res): Promise<void> => {
  const available = ENDOSCOPY_DATASETS_REGISTRY.filter(d => d.status === "available");
  const restricted = ENDOSCOPY_DATASETS_REGISTRY.filter(d => d.status === "restricted");

  const dataDir = "/home/runner/workspace/data/ent-datasets";
  const downloaded: string[] = [];
  try {
    const entries = await fs.readdir(dataDir);
    downloaded.push(...entries);
  } catch {}

  res.json({
    totalDatasets: ENDOSCOPY_DATASETS_REGISTRY.length,
    available: available.length,
    restricted: restricted.length,
    downloaded: downloaded.length,
    datasets: ENDOSCOPY_DATASETS_REGISTRY.map(d => ({
      ...d,
      isDownloaded: downloaded.includes(d.id),
    })),
    downloadedFolders: downloaded,
  });
});

router.get("/ent-datasets/knowledge", async (_req, res): Promise<void> => {
  const existingDocs = await db
    .select({ id: documentsTable.id, title: documentsTable.title, category: documentsTable.category, chunksCount: documentsTable.chunksCount })
    .from(documentsTable);

  const aiCategories = ["ent-endoscopy-ai", "ent-endoscopy-training", "ent-radiology-ai"];
  const entAiDocs = existingDocs.filter(d => aiCategories.includes(d.category));

  const topics = ENDOSCOPY_TRAINING_KNOWLEDGE.map(kb => ({
    title: kb.title,
    category: kb.category,
    contentLength: kb.content.length,
    alreadyLoaded: entAiDocs.some(d => d.title === kb.title),
  }));

  res.json({
    totalTopics: ENDOSCOPY_TRAINING_KNOWLEDGE.length,
    alreadyLoaded: entAiDocs.length,
    topics,
    loadedDocs: entAiDocs,
  });
});

router.post("/ent-datasets/ingest-knowledge", requireAuth, async (req, res): Promise<void> => {
  const { topics } = req.body as { topics?: string[] };

  const toIngest = topics
    ? ENDOSCOPY_TRAINING_KNOWLEDGE.filter(kb => topics.includes(kb.title))
    : ENDOSCOPY_TRAINING_KNOWLEDGE;

  if (toIngest.length === 0) {
    res.status(400).json({ error: "No matching topics found" });
    return;
  }

  const existingDocs = await db
    .select({ title: documentsTable.title })
    .from(documentsTable);
  const existingTitles = new Set(existingDocs.map(d => d.title));

  const results: Array<{ title: string; status: string; chunks: number }> = [];

  for (const kb of toIngest) {
    if (existingTitles.has(kb.title)) {
      results.push({ title: kb.title, status: "skipped (already exists)", chunks: 0 });
      continue;
    }

    try {
      const chunks = chunkText(kb.content);
      const [doc] = await db
        .insert(documentsTable)
        .values({
          title: kb.title,
          content: kb.content,
          category: kb.category,
          chunksCount: chunks.length,
        })
        .returning();

      if (chunks.length > 0) {
        await db.insert(documentChunksTable).values(
          chunks.map((content, index) => ({
            documentId: doc.id,
            content,
            chunkIndex: index,
          }))
        );
      }

      results.push({ title: kb.title, status: "ingested", chunks: chunks.length });
    } catch (err: any) {
      results.push({ title: kb.title, status: `error: ${err?.message}`, chunks: 0 });
    }
  }

  const ingested = results.filter(r => r.status === "ingested").length;
  const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);

  res.json({ ingested, skipped: results.filter(r => r.status.startsWith("skipped")).length, errors: results.filter(r => r.status.startsWith("error")).length, totalChunks, results });
});

router.post("/ent-datasets/generate-training-pairs", requireAuth, async (req, res): Promise<void> => {
  const { category, count, model } = req.body as { category?: string; count?: number; model?: string };
  const pairCount = Math.min(count || 10, 50);
  const modelName = model || "meditron:7b";

  const [config] = await db.select().from(llmConfigTable).limit(1);
  const ollamaUrl = config?.serverUrl;
  if (!ollamaUrl) {
    res.status(503).json({ error: "Ollama server not configured" });
    return;
  }

  const aiCategories = ["ent-endoscopy-ai", "ent-endoscopy-training", "ent-radiology-ai"];
  let chunks;

  if (category && aiCategories.includes(category)) {
    chunks = await db
      .select({ content: documentChunksTable.content })
      .from(documentChunksTable)
      .innerJoin(documentsTable, eq(documentChunksTable.documentId, documentsTable.id))
      .where(eq(documentsTable.category, category));
  } else {
    chunks = await db
      .select({ content: documentChunksTable.content })
      .from(documentChunksTable)
      .innerJoin(documentsTable, eq(documentChunksTable.documentId, documentsTable.id));

    chunks = chunks.filter(c => {
      const lower = c.content.toLowerCase();
      return lower.includes("endoscop") || lower.includes("laryngo") ||
        lower.includes("nasal") || lower.includes("sinus") ||
        lower.includes("vocal fold") || lower.includes("polyp") ||
        lower.includes("segmentation") || lower.includes("nbi");
    });
  }

  if (chunks.length === 0) {
    res.status(404).json({ error: "No endoscopy knowledge found. Please ingest knowledge first via POST /ent-datasets/ingest-knowledge" });
    return;
  }

  const selectedChunks = chunks
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(5, chunks.length))
    .map(c => c.content)
    .join("\n\n");

  const prompt = `You are an expert otolaryngologist specializing in endoscopy (flexible laryngoscopy, nasal endoscopy, and sinus surgery). Based on the following knowledge, generate exactly ${pairCount} high-quality question-answer training pairs suitable for fine-tuning an AI model for ENT endoscopy assistance.

KNOWLEDGE:
${selectedChunks}

REQUIREMENTS:
- Questions should cover endoscopic findings, diagnosis, and management
- Include clinical scenarios with endoscopic descriptions
- Mix: identification questions, diagnostic reasoning, management decisions
- Cover both flexible laryngoscopy and nasal endoscopy topics
- Include AI/ML applications in endoscopy where relevant

Return ONLY a valid JSON array of objects with "instruction" and "output" fields.
Example: [{"instruction":"Describe the endoscopic appearance of nasal polyps and how they differ from inverted papilloma","output":"Nasal polyps appear as..."}]

Return ONLY the JSON array, no other text.`;

  try {
    const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(180000),
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      res.status(502).json({ error: `Model error: ${text}` });
      return;
    }

    const data = (await ollamaRes.json()) as any;
    const responseText = data.message?.content ?? "";

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      res.json({ pairs: [], raw: responseText, error: "Could not parse JSON from model response" });
      return;
    }

    let pairs: Array<{ instruction: string; output: string }>;
    try {
      pairs = JSON.parse(jsonMatch[0]);
    } catch {
      res.json({ pairs: [], raw: responseText, error: "Invalid JSON from model" });
      return;
    }

    res.json({
      pairs: pairs.filter(p => p.instruction && p.output),
      count: pairs.length,
      category: category || "all-endoscopy",
      model: modelName,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Generation failed: ${err?.message ?? "Unknown error"}` });
  }
});

router.post("/ent-datasets/bulk-ingest-training", requireAuth, async (req, res): Promise<void> => {
  const { pairs, category, source } = req.body as {
    pairs: Array<{ instruction: string; output: string }>;
    category?: string;
    source?: string;
  };

  if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
    res.status(400).json({ error: "No training pairs provided" });
    return;
  }

  const results: Array<{ instruction: string; status: string }> = [];

  for (const pair of pairs) {
    if (!pair.instruction || !pair.output) {
      results.push({ instruction: pair.instruction || "(empty)", status: "skipped (missing fields)" });
      continue;
    }

    try {
      await db.insert(trainingDataTable).values({
        inputText: pair.instruction,
        outputText: pair.output,
        systemPrompt: "You are an expert otolaryngologist specializing in endoscopy procedures including flexible laryngoscopy, nasal endoscopy, and endoscopic sinus surgery.",
        category: category || "ent-endoscopy",
        quality: 4,
        source: source || "ent-endoscopy-dataset",
      });
      results.push({ instruction: pair.instruction.slice(0, 80) + "...", status: "ingested" });
    } catch (err: any) {
      results.push({ instruction: pair.instruction.slice(0, 80) + "...", status: `error: ${err?.message}` });
    }
  }

  res.json({
    total: pairs.length,
    ingested: results.filter(r => r.status === "ingested").length,
    skipped: results.filter(r => r.status.startsWith("skipped")).length,
    errors: results.filter(r => r.status.startsWith("error")).length,
    results,
  });
});

router.post("/ent-datasets/ingest-all", requireAuth, async (_req, res): Promise<void> => {
  const existingDocs = await db
    .select({ title: documentsTable.title })
    .from(documentsTable);
  const existingTitles = new Set(existingDocs.map(d => d.title));

  const allResults: Array<{ title: string; status: string; chunks: number }> = [];

  for (const kb of ENDOSCOPY_TRAINING_KNOWLEDGE) {
    if (existingTitles.has(kb.title)) {
      allResults.push({ title: kb.title, status: "skipped (already exists)", chunks: 0 });
      continue;
    }

    try {
      const chunks = chunkText(kb.content);
      const [doc] = await db
        .insert(documentsTable)
        .values({
          title: kb.title,
          content: kb.content,
          category: kb.category,
          chunksCount: chunks.length,
        })
        .returning();

      if (chunks.length > 0) {
        await db.insert(documentChunksTable).values(
          chunks.map((content, index) => ({
            documentId: doc.id,
            content,
            chunkIndex: index,
          }))
        );
      }

      allResults.push({ title: kb.title, status: "ingested", chunks: chunks.length });
    } catch (err: any) {
      allResults.push({ title: kb.title, status: `error: ${err?.message}`, chunks: 0 });
    }
  }

  const ingested = allResults.filter(r => r.status === "ingested").length;
  const totalChunks = allResults.reduce((sum, r) => sum + r.chunks, 0);

  res.json({
    source: "ent-endoscopy-datasets",
    knowledgeTopics: ENDOSCOPY_TRAINING_KNOWLEDGE.length,
    ingested,
    skipped: allResults.filter(r => r.status.startsWith("skipped")).length,
    errors: allResults.filter(r => r.status.startsWith("error")).length,
    totalChunks,
    datasetsAvailable: ENDOSCOPY_DATASETS_REGISTRY.length,
    publicDatasets: ENDOSCOPY_DATASETS_REGISTRY.filter(d => d.status === "available").length,
    results: allResults,
  });
});

export default router;
