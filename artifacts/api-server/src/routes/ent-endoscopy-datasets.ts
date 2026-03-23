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

const TRAINING_REPOSITORIES = [
  { id: "hf-001", name: "epfl-llm/meditron-7b", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/epfl-llm/meditron-7b", description: "Medical domain LLM trained on PubMed, guidelines, and medical papers" },
  { id: "hf-002", name: "epfl-llm/meditron-70b", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/epfl-llm/meditron-70b", description: "70B parameter medical LLM for clinical reasoning" },
  { id: "hf-003", name: "chaoyi-wu/PMC-LLaMA-13B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/chaoyi-wu/PMC-LLaMA-13B", description: "LLM fine-tuned on PubMed Central articles" },
  { id: "hf-004", name: "stanford-crfm/BioMedLM", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/stanford-crfm/BioMedLM", description: "2.7B biomedical language model from Stanford" },
  { id: "hf-005", name: "microsoft/BioGPT-Large", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/BioGPT-Large", description: "Generative pre-trained transformer for biomedical text generation" },
  { id: "hf-006", name: "google/health-search-qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/google/health-search-qa", description: "Medical question-answering dataset from health search queries" },
  { id: "hf-007", name: "bigbio/pubmed_qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/pubmed_qa", description: "PubMed-based biomedical QA dataset" },
  { id: "hf-008", name: "medmcqa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medmcqa", description: "Large-scale multi-subject multi-choice medical QA dataset" },
  { id: "hf-009", name: "GBaker/MedQA-USMLE-4-options", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/GBaker/MedQA-USMLE-4-options", description: "USMLE-style medical questions for clinical reasoning" },
  { id: "hf-010", name: "bigbio/med_qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/med_qa", description: "Medical QA benchmark across multiple languages" },
  { id: "hf-011", name: "Open-Orca/OpenOrca", source: "huggingface", category: "general-llm", url: "https://huggingface.co/datasets/Open-Orca/OpenOrca", description: "Large-scale augmented FLAN data for instruction tuning" },
  { id: "hf-012", name: "allenai/scirepeval", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/allenai/scirepeval", description: "Scientific paper representation evaluation benchmark" },
  { id: "hf-013", name: "qiaojin/PubMedQA", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/qiaojin/PubMedQA", description: "Biomedical research QA dataset from PubMed abstracts" },
  { id: "hf-014", name: "bigbio/biomrc", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/biomrc", description: "Biomedical machine reading comprehension dataset" },
  { id: "hf-015", name: "bigbio/bioasq", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bioasq", description: "BioASQ biomedical semantic indexing and QA" },
  { id: "hf-016", name: "lavita/medical-qa-shared-task-v1-half", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/lavita/medical-qa-shared-task-v1-half", description: "Medical QA shared task data for clinical NLP" },
  { id: "hf-017", name: "BI55/MedText", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/BI55/MedText", description: "Medical text classification dataset" },
  { id: "hf-018", name: "FreedomIntelligence/HuatuoGPT-sft-data-v1", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/FreedomIntelligence/HuatuoGPT-sft-data-v1", description: "Chinese medical instruction tuning data" },
  { id: "hf-019", name: "FreedomIntelligence/medical_o1_reasoning_SFT", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/FreedomIntelligence/medical_o1_reasoning_SFT", description: "Medical reasoning chain-of-thought SFT data" },
  { id: "hf-020", name: "ruslanmv/ai-medical-chatbot", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/ruslanmv/ai-medical-chatbot", description: "Medical chatbot training conversations" },
  { id: "hf-021", name: "Mohammed-Altaf/medical-instruction-120k", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/Mohammed-Altaf/medical-instruction-120k", description: "120K medical instruction-response pairs" },
  { id: "hf-022", name: "gamino/wiki_medical_terms", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/gamino/wiki_medical_terms", description: "Wikipedia medical terminology dataset" },
  { id: "hf-023", name: "keivalya/MedQuad-MedicalQnADataset", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/keivalya/MedQuad-MedicalQnADataset", description: "Medical question-answer dataset from NIH resources" },
  { id: "hf-024", name: "luqh/MedDialog-EN", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/luqh/MedDialog-EN", description: "English medical dialogue dataset patient-doctor conversations" },
  { id: "hf-025", name: "health_fact", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/health_fact", description: "Health claim fact verification dataset" },
  { id: "hf-026", name: "derek-thomas/ScienceQA", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/derek-thomas/ScienceQA", description: "Science QA with multimodal context and explanations" },
  { id: "hf-027", name: "microsoft/ms_marco", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/microsoft/ms_marco", description: "Large-scale information retrieval dataset" },
  { id: "hf-028", name: "allenai/sciq", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/allenai/sciq", description: "Science exam QA with supporting evidence" },
  { id: "hf-029", name: "dmis-lab/biobert-v1.1", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/dmis-lab/biobert-v1.1", description: "BioBERT pre-trained on biomedical corpora for NER and QA" },
  { id: "hf-030", name: "allenai/scibert_scivocab_uncased", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/allenai/scibert_scivocab_uncased", description: "SciBERT trained on scientific text" },
  { id: "hf-031", name: "emilyalsentzer/Bio_ClinicalBERT", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/emilyalsentzer/Bio_ClinicalBERT", description: "ClinicalBERT trained on MIMIC clinical notes" },
  { id: "hf-032", name: "microsoft/biogpt", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/biogpt", description: "BioGPT generative model for biomedical text" },
  { id: "hf-033", name: "google/flan-t5-xxl", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/flan-t5-xxl", description: "Instruction-tuned T5 model useful for medical QA" },
  { id: "hf-034", name: "medicalai/ClinicalBERT", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/medicalai/ClinicalBERT", description: "BERT fine-tuned on clinical text for medical NLP" },
  { id: "hf-035", name: "michiyasunaga/BioLinkBERT-large", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/michiyasunaga/BioLinkBERT-large", description: "LinkBERT pre-trained on biomedical literature with citation links" },
  { id: "hf-036", name: "cambridgeltl/SapBERT-from-PubMedBERT-fulltext", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/cambridgeltl/SapBERT-from-PubMedBERT-fulltext", description: "SapBERT for biomedical entity linking and UMLS" },
  { id: "hf-037", name: "microsoft/pubmedbert-base-uncased", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract-fulltext", description: "PubMedBERT trained from scratch on PubMed" },
  { id: "hf-038", name: "GanjinZero/UMLSBert_ENG", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/GanjinZero/UMLSBert_ENG", description: "BERT fine-tuned on UMLS medical knowledge graph" },
  { id: "hf-039", name: "nlpie/bio-roberta-base-ehr", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/nlpie/bio-roberta-base-ehr", description: "RoBERTa trained on EHR clinical notes" },
  { id: "hf-040", name: "sultan/BioM-ELECTRA-Large-Discriminator", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/sultan/BioM-ELECTRA-Large-Discriminator", description: "ELECTRA model for biomedical text understanding" },
  { id: "hf-041", name: "TheBloke/meditron-7B-GGUF", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/TheBloke/meditron-7B-GGUF", description: "Quantized GGUF version of Meditron for local deployment" },
  { id: "hf-042", name: "johnsnowlabs/JSL-MedS-v1", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/johnsnowlabs/JSL-MedS-v1", description: "John Snow Labs medical NLP model suite" },
  { id: "hf-043", name: "AdaptLLM/medicine-chat", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/AdaptLLM/medicine-chat", description: "LLM adapted for medical conversation via reading comprehension" },
  { id: "hf-044", name: "wangrongsheng/MedQA-ChatGLM", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/wangrongsheng/MedQA-ChatGLM", description: "ChatGLM fine-tuned on medical QA datasets" },
  { id: "hf-045", name: "BAAI/bge-large-en-v1.5", source: "huggingface", category: "embedding", url: "https://huggingface.co/BAAI/bge-large-en-v1.5", description: "BGE embedding model for medical RAG retrieval" },
  { id: "hf-046", name: "sentence-transformers/all-MiniLM-L6-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2", description: "Lightweight sentence embedding for medical document search" },
  { id: "hf-047", name: "nomic-ai/nomic-embed-text-v1.5", source: "huggingface", category: "embedding", url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5", description: "Long-context embedding model for medical documents" },
  { id: "hf-048", name: "Salesforce/SFR-Embedding-Mistral", source: "huggingface", category: "embedding", url: "https://huggingface.co/Salesforce/SFR-Embedding-Mistral", description: "Mistral-based embedding for high-quality retrieval" },
  { id: "hf-049", name: "llmware/industry-bert-medical-v0.1", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/llmware/industry-bert-medical-v0.1", description: "Industry BERT specialized for medical text" },
  { id: "hf-050", name: "llmware/slim-medical-ner", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/llmware/slim-medical-ner", description: "Slim NER model for medical entity extraction" },
  { id: "hf-051", name: "pubmed_central_open_access", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/pubmed_central_open_access", description: "Full text PubMed Central open access articles" },
  { id: "hf-052", name: "scientific_papers/pubmed", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/scientific_papers", description: "Scientific paper summarization from PubMed and arXiv" },
  { id: "hf-053", name: "ccdv/pubmed-summarization", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/ccdv/pubmed-summarization", description: "PubMed abstract summarization dataset" },
  { id: "hf-054", name: "bigbio/pubmed_central_abstracts", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/pubmed", description: "PubMed abstracts for biomedical NLP" },
  { id: "hf-055", name: "alleninstitute/s2orc", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/allenai/s2orc", description: "Semantic Scholar Open Research Corpus 81M papers" },
  { id: "hf-056", name: "bigbio/jnlpba", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/jnlpba", description: "Biomedical named entity recognition dataset" },
  { id: "hf-057", name: "bigbio/ncbi_disease", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ncbi_disease", description: "NCBI disease name recognition corpus" },
  { id: "hf-058", name: "bigbio/bc5cdr", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bc5cdr", description: "BioCreative V CDR chemical-disease relation dataset" },
  { id: "hf-059", name: "bigbio/gnormplus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/gnormplus", description: "Gene normalization and NER in biomedical text" },
  { id: "hf-060", name: "bigbio/ddi_corpus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ddi_corpus", description: "Drug-drug interaction extraction dataset" },
  { id: "hf-061", name: "bigbio/n2c2_2018_track2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/n2c2_2018_track2", description: "n2c2 adverse drug event extraction" },
  { id: "hf-062", name: "bigbio/chemdner", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/chemdner", description: "Chemical compound and drug NER dataset" },
  { id: "hf-063", name: "bigbio/ebm_pico", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ebm_pico", description: "Evidence-based medicine PICO annotation dataset" },
  { id: "hf-064", name: "bigbio/medical_questions_pairs", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/medical_questions_pairs", description: "Medical question similarity pairs" },
  { id: "hf-065", name: "bigbio/scitail", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/scitail", description: "Science entailment dataset for medical reasoning" },
  { id: "hf-066", name: "yelp_review_full", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/yelp_review_full", description: "Review classification for healthcare provider sentiment" },
  { id: "hf-067", name: "tatsu-lab/alpaca", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/tatsu-lab/alpaca", description: "Stanford Alpaca instruction tuning dataset" },
  { id: "hf-068", name: "databricks/dolly-15k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/databricks/dolly-15k", description: "Databricks Dolly instruction following data" },
  { id: "hf-069", name: "OpenAssistant/oasst1", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/OpenAssistant/oasst1", description: "OpenAssistant conversation trees for RLHF" },
  { id: "hf-070", name: "HuggingFaceH4/ultrachat_200k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceH4/ultrachat_200k", description: "Large-scale multi-turn dialogue dataset" },
  { id: "hf-071", name: "WizardLM/WizardLM_evol_instruct_V2_196k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/WizardLM/WizardLM_evol_instruct_V2_196k", description: "Evolved complexity instruction data" },
  { id: "hf-072", name: "garage-bAInd/Open-Platypus", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/garage-bAInd/Open-Platypus", description: "Curated STEM and logic reasoning dataset" },
  { id: "hf-073", name: "TIGER-Lab/MathInstruct", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/TIGER-Lab/MathInstruct", description: "Math instruction data for analytical reasoning" },
  { id: "hf-074", name: "teknium/OpenHermes-2.5", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/teknium/OpenHermes-2.5", description: "1M high-quality instruction entries" },
  { id: "hf-075", name: "jondurbin/airoboros-3.1", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/jondurbin/airoboros-3.1", description: "Diverse instruction tuning with creative/analytical tasks" },
  { id: "gh-076", name: "MIT-LCP/mimic-code", source: "github", category: "medical-tools", url: "https://github.com/MIT-LCP/mimic-code", description: "MIMIC-III/IV clinical database code and analysis tools" },
  { id: "gh-077", name: "EpistasisLab/penn-ml-benchmarks", source: "github", category: "medical-dataset", url: "https://github.com/EpistasisLab/penn-ml-benchmarks", description: "Penn ML benchmarks including biomedical datasets" },
  { id: "gh-078", name: "biopython/biopython", source: "github", category: "medical-tools", url: "https://github.com/biopython/biopython", description: "Python tools for computational biology and bioinformatics" },
  { id: "gh-079", name: "dmis-lab/biobert", source: "github", category: "medical-llm", url: "https://github.com/dmis-lab/biobert", description: "BioBERT pre-training and fine-tuning code" },
  { id: "gh-080", name: "ncbi-nlp/BLUE_Benchmark", source: "github", category: "medical-dataset", url: "https://github.com/ncbi-nlp/BLUE_Benchmark", description: "Biomedical Language Understanding Evaluation benchmark" },
  { id: "gh-081", name: "ncbi-nlp/BlueBERT", source: "github", category: "medical-llm", url: "https://github.com/ncbi-nlp/BlueBERT", description: "NCBI BlueBERT pre-trained on PubMed and MIMIC" },
  { id: "gh-082", name: "allenai/scispacy", source: "github", category: "medical-tools", url: "https://github.com/allenai/scispacy", description: "SpaCy models for biomedical text processing" },
  { id: "gh-083", name: "NLPatVCU/medaCy", source: "github", category: "medical-tools", url: "https://github.com/NLPatVCU/medaCy", description: "Medical text mining and NER framework" },
  { id: "gh-084", name: "kamalkraj/Named-Entity-Recognition-with-Bidirectional-LSTM-CNNs", source: "github", category: "medical-tools", url: "https://github.com/kamalkraj/Named-Entity-Recognition-with-Bidirectional-LSTM-CNNs", description: "BiLSTM-CNN for biomedical NER" },
  { id: "gh-085", name: "strongio/medical-nlp", source: "github", category: "medical-tools", url: "https://github.com/strongio/medical-nlp", description: "Medical NLP toolkit and clinical text analysis" },
  { id: "gh-086", name: "SURA23/Sinus-Surgery-Endoscopic-Image-Datasets", source: "github", category: "ent-dataset", url: "https://github.com/SURA23/Sinus-Surgery-Endoscopic-Image-Datasets", description: "Endoscopic sinus surgery image datasets UW" },
  { id: "gh-087", name: "YichiZhang98/NasalSeg", source: "github", category: "ent-dataset", url: "https://github.com/YichiZhang98/NasalSeg", description: "Nasal cavity and paranasal sinus CT segmentation" },
  { id: "gh-088", name: "danielmlow/vocal-fold-paralysis", source: "github", category: "ent-dataset", url: "https://github.com/danielmlow/vocal-fold-paralysis", description: "Vocal fold paralysis audio and laryngoscopy dataset" },
  { id: "gh-089", name: "simula/hyper-kvasir", source: "github", category: "endoscopy-dataset", url: "https://github.com/simula/hyper-kvasir", description: "110K GI endoscopy images for transfer learning" },
  { id: "gh-090", name: "Project-MONAI/MONAI", source: "github", category: "medical-tools", url: "https://github.com/Project-MONAI/MONAI", description: "Medical Open Network for AI - deep learning framework" },
  { id: "gh-091", name: "facebookresearch/detectron2", source: "github", category: "vision", url: "https://github.com/facebookresearch/detectron2", description: "Object detection for endoscopic instrument segmentation" },
  { id: "gh-092", name: "ultralytics/ultralytics", source: "github", category: "vision", url: "https://github.com/ultralytics/ultralytics", description: "YOLOv8/v11 for real-time endoscopic detection" },
  { id: "gh-093", name: "open-mmlab/mmsegmentation", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmsegmentation", description: "Semantic segmentation for endoscopic images" },
  { id: "gh-094", name: "qubvel/segmentation_models.pytorch", source: "github", category: "vision", url: "https://github.com/qubvel/segmentation_models.pytorch", description: "PyTorch segmentation models for medical imaging" },
  { id: "gh-095", name: "MIC-DKFZ/nnUNet", source: "github", category: "medical-tools", url: "https://github.com/MIC-DKFZ/nnUNet", description: "Self-configuring segmentation framework for medical images" },
  { id: "gh-096", name: "lunit-io/benchmark-ssl-pathology", source: "github", category: "medical-tools", url: "https://github.com/lunit-io/benchmark-ssl-pathology", description: "Self-supervised learning for pathology images" },
  { id: "gh-097", name: "tensorflow/models", source: "github", category: "general-ml", url: "https://github.com/tensorflow/models", description: "TensorFlow model garden with medical imaging examples" },
  { id: "gh-098", name: "pytorch/vision", source: "github", category: "general-ml", url: "https://github.com/pytorch/vision", description: "PyTorch vision models for transfer learning" },
  { id: "gh-099", name: "huggingface/transformers", source: "github", category: "general-ml", url: "https://github.com/huggingface/transformers", description: "HuggingFace Transformers library for all models" },
  { id: "gh-100", name: "huggingface/peft", source: "github", category: "training-tools", url: "https://github.com/huggingface/peft", description: "Parameter-efficient fine-tuning (LoRA, QLoRA)" },
  { id: "kg-101", name: "kaggle/siim-isic-melanoma", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/siim-isic-melanoma-classification", description: "Melanoma classification from dermoscopic images" },
  { id: "kg-102", name: "kaggle/rsna-intracranial-hemorrhage", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/rsna-intracranial-hemorrhage-detection", description: "Intracranial hemorrhage CT detection" },
  { id: "kg-103", name: "kaggle/chest-xray-pneumonia", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia", description: "Chest X-ray pneumonia classification dataset" },
  { id: "kg-104", name: "kaggle/diabetic-retinopathy", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/diabetic-retinopathy-detection", description: "Diabetic retinopathy detection from fundus images" },
  { id: "kg-105", name: "kaggle/vinbigdata-chest-xray", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/vinbigdata-chest-xray-abnormalities-detection", description: "Chest X-ray abnormality detection VinBigData" },
  { id: "kg-106", name: "kaggle/ranzcr-clip", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/ranzcr-clip-catheter-line-classification", description: "Catheter and line classification from CXR" },
  { id: "kg-107", name: "kaggle/lgg-mri-segmentation", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/mateuszbuda/lgg-mri-segmentation", description: "Brain MRI segmentation for tumor detection" },
  { id: "kg-108", name: "kaggle/covid19-radiography", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/tawsifurrahman/covid19-radiography-database", description: "COVID-19 radiography dataset for lung imaging" },
  { id: "kg-109", name: "kaggle/medical-transcriptions", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/tboyle10/medicaltranscriptions", description: "Medical transcription text by specialty" },
  { id: "kg-110", name: "kaggle/medical-speech-transcription", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/paultimothymooney/medical-speech-transcription-and-intent", description: "Medical speech recognition and intent classification" },
  { id: "kg-111", name: "kaggle/hearing-test", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/soumikrakshit/hearing-test", description: "Hearing test audiometry data" },
  { id: "kg-112", name: "kaggle/tympanic-membrane", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/tympanic-membrane-images", description: "Otoscopy tympanic membrane classification images" },
  { id: "kg-113", name: "kaggle/sleep-health-lifestyle", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/uom190346a/sleep-health-and-lifestyle-dataset", description: "Sleep health and lifestyle factors dataset" },
  { id: "kg-114", name: "kaggle/polysomnography-sleep", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/saifurrehman/sleep-edf", description: "Polysomnography sleep staging EEG data" },
  { id: "kg-115", name: "kaggle/voice-gender", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/primaryobjects/voicegender", description: "Voice acoustic features for classification" },
  { id: "kg-116", name: "kaggle/common-voice", source: "kaggle", category: "voice-dataset", url: "https://www.kaggle.com/datasets/mozillaorg/common-voice", description: "Mozilla Common Voice speech recognition dataset" },
  { id: "kg-117", name: "kaggle/speech-accent-archive", source: "kaggle", category: "voice-dataset", url: "https://www.kaggle.com/datasets/rtatman/speech-accent-archive", description: "Speech accent classification and analysis" },
  { id: "kg-118", name: "kaggle/audioset", source: "kaggle", category: "voice-dataset", url: "https://www.kaggle.com/datasets/zfturbo/audioset", description: "Google AudioSet sound event classification" },
  { id: "kg-119", name: "kaggle/esc-50", source: "kaggle", category: "voice-dataset", url: "https://www.kaggle.com/datasets/mmoreaux/environmental-sound-classification-50", description: "Environmental sound classification 50 classes" },
  { id: "kg-120", name: "kaggle/respiratory-sounds", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/vbookshelf/respiratory-sound-database", description: "Respiratory sound classification for airway analysis" },
  { id: "zn-121", name: "zenodo/glottis-segmentation", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/records/6482108", description: "Glottis segmentation dataset from endoscopy" },
  { id: "zn-122", name: "zenodo/laryngeal-nbi", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/search?q=laryngoscopy+NBI", description: "NBI laryngoscopy frames for tissue classification" },
  { id: "zn-123", name: "zenodo/otoscopy-images", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/search?q=otoscopy+classification", description: "Otoscopy image classification datasets" },
  { id: "zn-124", name: "zenodo/speech-pathology", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/search?q=speech+pathology+voice+disorder", description: "Speech pathology and voice disorder datasets" },
  { id: "zn-125", name: "zenodo/sinus-ct-segmentation", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/records/13893419", description: "CT sinus segmentation NasalSeg dataset" },
  { id: "ph-126", name: "physionet/mimic-iv", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/mimiciv/", description: "MIMIC-IV clinical database with ENT ICD codes" },
  { id: "ph-127", name: "physionet/mimic-iv-note", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/mimic-iv-note/", description: "MIMIC-IV clinical notes for NLP training" },
  { id: "ph-128", name: "physionet/mimic-cxr", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/mimic-cxr/", description: "Chest X-ray dataset with radiology reports" },
  { id: "ph-129", name: "physionet/chbmit", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/chbmit/", description: "EEG data useful for vestibular research" },
  { id: "ph-130", name: "physionet/apnea-ecg", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/apnea-ecg/", description: "Sleep apnea ECG database for OSA detection" },
  { id: "ph-131", name: "physionet/sleep-edfx", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/sleep-edfx/", description: "Sleep EDF expanded PSG recordings" },
  { id: "ph-132", name: "physionet/voice-icbhi", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/icbhi-respiratory-sounds/", description: "ICBHI respiratory sounds for airway analysis" },
  { id: "gc-133", name: "grand-challenge/head-neck-auto-segmentation", source: "grand-challenge", category: "ent-dataset", url: "https://grand-challenge.org/challenges/head-and-neck-auto-segmentation/", description: "Head and neck CT auto-segmentation challenge" },
  { id: "gc-134", name: "grand-challenge/hecktor", source: "grand-challenge", category: "ent-dataset", url: "https://hecktor.grand-challenge.org/", description: "Head and neck tumor segmentation PET/CT" },
  { id: "gc-135", name: "grand-challenge/structseg", source: "grand-challenge", category: "ent-dataset", url: "https://structseg2019.grand-challenge.org/", description: "Organs at risk segmentation head and neck CT" },
  { id: "gc-136", name: "grand-challenge/han-seg", source: "grand-challenge", category: "ent-dataset", url: "https://han-seg2023.grand-challenge.org/", description: "Head and neck organ segmentation challenge" },
  { id: "gc-137", name: "grand-challenge/endovis", source: "grand-challenge", category: "endoscopy-dataset", url: "https://endovis.grand-challenge.org/", description: "Endoscopic vision surgical instrument detection" },
  { id: "gc-138", name: "grand-challenge/robust-mia", source: "grand-challenge", category: "medical-dataset", url: "https://robust-mia.grand-challenge.org/", description: "Robust medical image analysis challenge" },
  { id: "tcia-139", name: "TCIA/head-neck-cetuximab", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/head-neck-cetuximab/", description: "Head neck cancer CT with cetuximab treatment data" },
  { id: "tcia-140", name: "TCIA/head-neck-pet-ct", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/head-neck-pet-ct/", description: "Head neck PET/CT radiation therapy planning" },
  { id: "tcia-141", name: "TCIA/head-neck-radiomics-hn1", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/head-neck-radiomics-hn1/", description: "Head neck radiomics feature extraction data" },
  { id: "tcia-142", name: "TCIA/opc-radiomics", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/opc-radiomics/", description: "Oropharyngeal cancer radiomics dataset" },
  { id: "tcia-143", name: "TCIA/qin-headneck", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/qin-headneck/", description: "Quantitative imaging head neck cancer" },
  { id: "tcia-144", name: "TCIA/hnscc", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/hnscc/", description: "Head neck squamous cell carcinoma imaging" },
  { id: "tcia-145", name: "TCIA/tcga-hnsc", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/tcga-hnsc/", description: "TCGA head neck squamous carcinoma pathology" },
  { id: "hf-146", name: "speech31/voicemos2024", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/speech31/voicemos2024", description: "Voice quality assessment MOS prediction" },
  { id: "hf-147", name: "flexthink/librispeech-r", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/flexthink/librispeech_r", description: "LibriSpeech for speech recognition fine-tuning" },
  { id: "hf-148", name: "facebook/voxpopuli", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/facebook/voxpopuli", description: "Large-scale multilingual speech corpus" },
  { id: "hf-149", name: "google/fleurs", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/google/fleurs", description: "Few-shot learning evaluation for speech recognition" },
  { id: "hf-150", name: "openai/whisper-large-v3", source: "huggingface", category: "voice-model", url: "https://huggingface.co/openai/whisper-large-v3", description: "Whisper v3 speech recognition for medical dictation" },
  { id: "hf-151", name: "pyannote/speaker-diarization-3.1", source: "huggingface", category: "voice-model", url: "https://huggingface.co/pyannote/speaker-diarization-3.1", description: "Speaker diarization for patient-doctor conversations" },
  { id: "hf-152", name: "facebook/wav2vec2-large-960h", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/wav2vec2-large-960h", description: "Wav2Vec2 speech representation for voice analysis" },
  { id: "hf-153", name: "microsoft/speecht5_tts", source: "huggingface", category: "voice-model", url: "https://huggingface.co/microsoft/speecht5_tts", description: "SpeechT5 for text-to-speech voice synthesis" },
  { id: "hf-154", name: "speechbrain/asr-crdnn-rnnlm-librispeech", source: "huggingface", category: "voice-model", url: "https://huggingface.co/speechbrain/asr-crdnn-rnnlm-librispeech", description: "SpeechBrain ASR model for voice transcription" },
  { id: "hf-155", name: "nvidia/parakeet-ctc-1.1b", source: "huggingface", category: "voice-model", url: "https://huggingface.co/nvidia/parakeet-ctc-1.1b", description: "NVIDIA Parakeet for medical speech recognition" },
  { id: "gh-156", name: "openai/whisper", source: "github", category: "voice-model", url: "https://github.com/openai/whisper", description: "OpenAI Whisper speech recognition system" },
  { id: "gh-157", name: "coqui-ai/TTS", source: "github", category: "voice-model", url: "https://github.com/coqui-ai/TTS", description: "Coqui TTS deep learning text-to-speech" },
  { id: "gh-158", name: "mozilla/DeepSpeech", source: "github", category: "voice-model", url: "https://github.com/mozilla/DeepSpeech", description: "Mozilla DeepSpeech speech-to-text engine" },
  { id: "gh-159", name: "espnet/espnet", source: "github", category: "voice-model", url: "https://github.com/espnet/espnet", description: "ESPnet end-to-end speech processing toolkit" },
  { id: "gh-160", name: "k2-fsa/icefall", source: "github", category: "voice-model", url: "https://github.com/k2-fsa/icefall", description: "Icefall speech recognition recipes and models" },
  { id: "hf-161", name: "nvidia/med-segmentation-toolkit", source: "huggingface", category: "medical-tools", url: "https://huggingface.co/nvidia/segresnet", description: "NVIDIA medical image segmentation toolkit" },
  { id: "hf-162", name: "google/vit-base-patch16-224", source: "huggingface", category: "vision", url: "https://huggingface.co/google/vit-base-patch16-224", description: "Vision Transformer for endoscopic image classification" },
  { id: "hf-163", name: "microsoft/swin-base-patch4-window7-224", source: "huggingface", category: "vision", url: "https://huggingface.co/microsoft/swin-base-patch4-window7-224", description: "Swin Transformer for medical image analysis" },
  { id: "hf-164", name: "facebook/dinov2-base", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/dinov2-base", description: "DINOv2 self-supervised vision features for endoscopy" },
  { id: "hf-165", name: "facebook/sam-vit-huge", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/sam-vit-huge", description: "Segment Anything Model for medical image segmentation" },
  { id: "hf-166", name: "microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224", description: "BiomedCLIP multimodal biomedical vision-language model" },
  { id: "hf-167", name: "StanfordAIMI/RadBERT", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/StanfordAIMI/RadBERT", description: "RadBERT for radiology report understanding" },
  { id: "hf-168", name: "GreenBitAI/MedLLaMA-13B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/GreenBitAI/MedLLaMA-13B", description: "Medical LLaMA 13B for clinical applications" },
  { id: "hf-169", name: "axiong/PMC-LLaMA-13B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/axiong/PMC_LLaMA_13B", description: "PMC-LLaMA trained on PubMed Central full text" },
  { id: "hf-170", name: "wanglab/ClinicalCamel-70B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/wanglab/ClinicalCamel-70B", description: "70B clinical LLM for medical dialogue" },
  { id: "hf-171", name: "AI-ModelScope/MedGPT", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/AI-ModelScope/MedGPT", description: "Medical GPT for clinical decision support" },
  { id: "hf-172", name: "microsoft/llava-med-v1.5-mistral-7b", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/llava-med-v1.5-mistral-7b", description: "LLaVA-Med multimodal medical vision-language model" },
  { id: "hf-173", name: "BioMistral/BioMistral-7B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/BioMistral/BioMistral-7B", description: "Mistral fine-tuned on biomedical text" },
  { id: "hf-174", name: "m42-health/med42-70b", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/m42-health/med42-70b", description: "Med42 clinical-grade medical LLM" },
  { id: "hf-175", name: "axiong/MedS-Bench", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/axiong/MedS-Bench", description: "Medical specialty benchmark evaluation suite" },
  { id: "hf-176", name: "sahil2801/ChatGPT-Clinical-Notes", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/sahil2801/ChatGPT-Clinical-Notes", description: "Clinical note generation training data" },
  { id: "hf-177", name: "augtoma/usmle_step_1", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/augtoma/usmle_step_1", description: "USMLE Step 1 medical exam questions" },
  { id: "hf-178", name: "augtoma/usmle_step_2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/augtoma/usmle_step_2", description: "USMLE Step 2 clinical knowledge questions" },
  { id: "hf-179", name: "augtoma/usmle_step_3", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/augtoma/usmle_step_3", description: "USMLE Step 3 clinical management questions" },
  { id: "hf-180", name: "YuanGao/MedMCQA-cleaned", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/YuanGao/MedMCQA-cleaned", description: "Cleaned medical MCQ dataset 194K questions" },
  { id: "hf-181", name: "bigbio/mednli", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mednli", description: "Medical natural language inference dataset" },
  { id: "hf-182", name: "bigbio/biosses", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/biosses", description: "Biomedical sentence similarity estimation" },
  { id: "hf-183", name: "bigbio/radqa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/radqa", description: "Radiology question answering dataset" },
  { id: "hf-184", name: "bigbio/genia_relation_corpus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/genia_relation_corpus", description: "GENIA biomedical entity relation extraction" },
  { id: "hf-185", name: "bigbio/linnaeus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/linnaeus", description: "Species NER in biomedical literature" },
  { id: "hf-186", name: "bigbio/scifact", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/scifact", description: "Scientific claim verification with evidence" },
  { id: "hf-187", name: "allenai/cord-19", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/allenai/cord-19", description: "COVID-19 Open Research Dataset 1M+ papers" },
  { id: "hf-188", name: "bigbio/i2b2_2010", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/i2b2_2010", description: "i2b2 clinical concept extraction NER" },
  { id: "hf-189", name: "bigbio/biored", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/biored", description: "BioRED biomedical relation extraction" },
  { id: "hf-190", name: "bigbio/chemprot", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/chemprot", description: "Chemical-protein interaction extraction" },
  { id: "fin-191", name: "FinGPT/fingpt-sentiment-train", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/FinGPT/fingpt-sentiment-train", description: "Financial sentiment analysis training data" },
  { id: "fin-192", name: "yiyanghkust/finbert-tone", source: "huggingface", category: "finance-model", url: "https://huggingface.co/yiyanghkust/finbert-tone", description: "FinBERT for financial text sentiment analysis" },
  { id: "fin-193", name: "ProsusAI/finbert", source: "huggingface", category: "finance-model", url: "https://huggingface.co/ProsusAI/finbert", description: "FinBERT pre-trained on financial communications" },
  { id: "fin-194", name: "AdaptLLM/finance-chat", source: "huggingface", category: "finance-model", url: "https://huggingface.co/AdaptLLM/finance-chat", description: "LLM adapted for financial domain conversations" },
  { id: "fin-195", name: "TheFinAI/flare-finqa", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-finqa", description: "Financial QA numerical reasoning dataset" },
  { id: "fin-196", name: "takala/financial_phrasebank", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/takala/financial_phrasebank", description: "Financial phrase sentiment classification" },
  { id: "fin-197", name: "zeroshot/twitter-financial-news-sentiment", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/zeroshot/twitter-financial-news-sentiment", description: "Twitter financial news sentiment classification" },
  { id: "fin-198", name: "FinGPT/fingpt-forecaster", source: "huggingface", category: "finance-model", url: "https://huggingface.co/FinGPT/fingpt-forecaster", description: "FinGPT stock price forecasting model" },
  { id: "fin-199", name: "sujet-ai/Sujet-Finance-QA-RAG", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/sujet-ai/Sujet-Finance-QA-RAG", description: "Finance QA RAG training data" },
  { id: "fin-200", name: "winddude/reddit_finance_43_250k", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/winddude/reddit_finance_43_250k", description: "Reddit finance posts for sentiment and trend analysis" },
  { id: "gh-201", name: "AI4Finance-Foundation/FinGPT", source: "github", category: "finance-model", url: "https://github.com/AI4Finance-Foundation/FinGPT", description: "Open-source financial LLM framework" },
  { id: "gh-202", name: "AI4Finance-Foundation/FinRL", source: "github", category: "finance-model", url: "https://github.com/AI4Finance-Foundation/FinRL", description: "Deep RL library for quantitative finance" },
  { id: "gh-203", name: "microsoft/qlib", source: "github", category: "finance-model", url: "https://github.com/microsoft/qlib", description: "Microsoft Qlib AI-oriented quantitative investing" },
  { id: "gh-204", name: "stefan-jansen/machine-learning-for-trading", source: "github", category: "finance-dataset", url: "https://github.com/stefan-jansen/machine-learning-for-trading", description: "ML for algorithmic trading strategies and data" },
  { id: "gh-205", name: "firmai/financial-machine-learning", source: "github", category: "finance-dataset", url: "https://github.com/firmai/financial-machine-learning", description: "Curated financial ML research and datasets" },
  { id: "gh-206", name: "ranaroussi/yfinance", source: "github", category: "finance-tools", url: "https://github.com/ranaroussi/yfinance", description: "Yahoo Finance data downloader for market analysis" },
  { id: "gh-207", name: "bukosabino/ta", source: "github", category: "finance-tools", url: "https://github.com/bukosabino/ta", description: "Technical analysis library for financial indicators" },
  { id: "gh-208", name: "kernc/backtesting.py", source: "github", category: "finance-tools", url: "https://github.com/kernc/backtesting.py", description: "Python backtesting framework for trading strategies" },
  { id: "gh-209", name: "pmorissette/bt", source: "github", category: "finance-tools", url: "https://github.com/pmorissette/bt", description: "Flexible backtesting for quantitative finance" },
  { id: "gh-210", name: "goldmansachs/gs-quant", source: "github", category: "finance-tools", url: "https://github.com/goldmansachs/gs-quant", description: "Goldman Sachs quantitative finance Python toolkit" },
  { id: "gh-211", name: "ollama/ollama", source: "github", category: "training-tools", url: "https://github.com/ollama/ollama", description: "Ollama local LLM runner and model management" },
  { id: "gh-212", name: "ggerganov/llama.cpp", source: "github", category: "training-tools", url: "https://github.com/ggerganov/llama.cpp", description: "LLaMA model inference in C/C++ for local deployment" },
  { id: "gh-213", name: "Mozilla-Ocho/llamafile", source: "github", category: "training-tools", url: "https://github.com/Mozilla-Ocho/llamafile", description: "Single-file LLM distribution and execution" },
  { id: "gh-214", name: "vllm-project/vllm", source: "github", category: "training-tools", url: "https://github.com/vllm-project/vllm", description: "High-throughput LLM serving engine" },
  { id: "gh-215", name: "hiyouga/LLaMA-Factory", source: "github", category: "training-tools", url: "https://github.com/hiyouga/LLaMA-Factory", description: "Fine-tuning framework for 100+ LLMs with LoRA" },
  { id: "gh-216", name: "unslothai/unsloth", source: "github", category: "training-tools", url: "https://github.com/unslothai/unsloth", description: "2-5x faster LLM fine-tuning with 80% less memory" },
  { id: "gh-217", name: "axolotl-ai-cloud/axolotl", source: "github", category: "training-tools", url: "https://github.com/axolotl-ai-cloud/axolotl", description: "Streamlined LLM fine-tuning with multiple methods" },
  { id: "gh-218", name: "mlc-ai/mlc-llm", source: "github", category: "training-tools", url: "https://github.com/mlc-ai/mlc-llm", description: "Universal LLM deployment on any hardware" },
  { id: "gh-219", name: "lm-sys/FastChat", source: "github", category: "training-tools", url: "https://github.com/lm-sys/FastChat", description: "Training and serving chatbot models with RLHF" },
  { id: "gh-220", name: "haotian-liu/LLaVA", source: "github", category: "vision", url: "https://github.com/haotian-liu/LLaVA", description: "Large Language and Vision Assistant multimodal" },
  { id: "gh-221", name: "THUDM/CogVLM", source: "github", category: "vision", url: "https://github.com/THUDM/CogVLM", description: "Visual language model for medical image understanding" },
  { id: "gh-222", name: "NVlabs/stylegan3", source: "github", category: "vision", url: "https://github.com/NVlabs/stylegan3", description: "StyleGAN3 for synthetic medical image generation" },
  { id: "gh-223", name: "CompVis/stable-diffusion", source: "github", category: "vision", url: "https://github.com/CompVis/stable-diffusion", description: "Stable Diffusion for synthetic training data augmentation" },
  { id: "gh-224", name: "lucidrains/vit-pytorch", source: "github", category: "vision", url: "https://github.com/lucidrains/vit-pytorch", description: "Vision Transformer implementations for medical imaging" },
  { id: "gh-225", name: "facebookresearch/segment-anything", source: "github", category: "vision", url: "https://github.com/facebookresearch/segment-anything", description: "Segment Anything for endoscopic image annotation" },
  { id: "hf-226", name: "meta-llama/Llama-3.2-3B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct", description: "Llama 3.2 3B for lightweight medical fine-tuning" },
  { id: "hf-227", name: "mistralai/Mistral-7B-Instruct-v0.3", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3", description: "Mistral 7B base for medical domain adaptation" },
  { id: "hf-228", name: "Qwen/Qwen2.5-7B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct", description: "Qwen 2.5 7B instruction model for fine-tuning" },
  { id: "hf-229", name: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", description: "DeepSeek R1 distilled for reasoning tasks" },
  { id: "hf-230", name: "microsoft/phi-3-mini-4k-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/phi-3-mini-4k-instruct", description: "Phi-3 small efficient model for medical inference" },
  { id: "hf-231", name: "google/gemma-2-9b-it", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-2-9b-it", description: "Gemma 2 9B instruction model for medical tasks" },
  { id: "hf-232", name: "CohereForAI/c4ai-command-r-plus", source: "huggingface", category: "general-llm", url: "https://huggingface.co/CohereForAI/c4ai-command-r-plus", description: "Command R+ for RAG-based medical knowledge retrieval" },
  { id: "hf-233", name: "NousResearch/Hermes-3-Llama-3.1-8B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B", description: "Hermes 3 function-calling for medical tool use" },
  { id: "hf-234", name: "Nexusflow/Starling-LM-7B-beta", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Nexusflow/Starling-LM-7B-beta", description: "Starling RLHF-trained model for helpful responses" },
  { id: "hf-235", name: "upstage/solar-10.7b-instruct-v1.0", source: "huggingface", category: "general-llm", url: "https://huggingface.co/upstage/solar-10.7b-instruct-v1.0", description: "SOLAR 10.7B depth upscaled model for specialization" },
  { id: "hf-236", name: "cognitivecomputations/dolphin-2.9.3-mistral-7B-32k", source: "huggingface", category: "general-llm", url: "https://huggingface.co/cognitivecomputations/dolphin-2.9.3-mistral-7B-32k", description: "Dolphin uncensored assistant for medical reasoning" },
  { id: "gh-237", name: "langchain-ai/langchain", source: "github", category: "rag-tools", url: "https://github.com/langchain-ai/langchain", description: "LangChain framework for medical RAG pipelines" },
  { id: "gh-238", name: "run-llama/llama_index", source: "github", category: "rag-tools", url: "https://github.com/run-llama/llama_index", description: "LlamaIndex data framework for medical knowledge bases" },
  { id: "gh-239", name: "chroma-core/chroma", source: "github", category: "rag-tools", url: "https://github.com/chroma-core/chroma", description: "Chroma vector database for medical document retrieval" },
  { id: "gh-240", name: "weaviate/weaviate", source: "github", category: "rag-tools", url: "https://github.com/weaviate/weaviate", description: "Weaviate vector search for medical knowledge graphs" },
  { id: "gh-241", name: "qdrant/qdrant", source: "github", category: "rag-tools", url: "https://github.com/qdrant/qdrant", description: "Qdrant vector similarity search engine" },
  { id: "gh-242", name: "milvus-io/milvus", source: "github", category: "rag-tools", url: "https://github.com/milvus-io/milvus", description: "Milvus vector database for similarity search" },
  { id: "gh-243", name: "deepset-ai/haystack", source: "github", category: "rag-tools", url: "https://github.com/deepset-ai/haystack", description: "Haystack NLP framework for medical search pipelines" },
  { id: "gh-244", name: "stanfordnlp/dspy", source: "github", category: "rag-tools", url: "https://github.com/stanfordnlp/dspy", description: "DSPy programming framework for LLM pipelines" },
  { id: "gh-245", name: "BerriAI/litellm", source: "github", category: "training-tools", url: "https://github.com/BerriAI/litellm", description: "LiteLLM unified API for 100+ LLM providers" },
  { id: "gh-246", name: "bentoml/OpenLLM", source: "github", category: "training-tools", url: "https://github.com/bentoml/OpenLLM", description: "OpenLLM operating LLMs in production" },
  { id: "gh-247", name: "marella/ctransformers", source: "github", category: "training-tools", url: "https://github.com/marella/ctransformers", description: "GGML model inference with Python bindings" },
  { id: "gh-248", name: "guidance-ai/guidance", source: "github", category: "training-tools", url: "https://github.com/guidance-ai/guidance", description: "Guidance structured generation for medical outputs" },
  { id: "gh-249", name: "outlines-dev/outlines", source: "github", category: "training-tools", url: "https://github.com/outlines-dev/outlines", description: "Structured text generation for medical forms" },
  { id: "gh-250", name: "NVIDIA/NeMo", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/NeMo", description: "NVIDIA NeMo toolkit for ASR TTS and NLP" },
  { id: "hf-251", name: "bigbio/hallmarks_of_cancer", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/hallmarks_of_cancer", description: "Cancer hallmarks text classification" },
  { id: "hf-252", name: "bigbio/gene_drug_knowledge", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2013_gro", description: "Gene regulation ontology text mining" },
  { id: "hf-253", name: "bigbio/mediqa_qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mediqa_qa", description: "MEDIQA medical QA shared task dataset" },
  { id: "hf-254", name: "bigbio/codiesp", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/codiesp", description: "Clinical coding ICD-10 extraction from Spanish" },
  { id: "hf-255", name: "bigbio/mantra_gsc", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mantra_gsc", description: "Multilingual medical NER gold standard corpus" },
  { id: "hf-256", name: "bigbio/medal", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/medal", description: "Medical abbreviation disambiguation dataset" },
  { id: "hf-257", name: "bigbio/quaero", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/quaero", description: "French biomedical NER corpus" },
  { id: "hf-258", name: "bigbio/medhop", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/medhop", description: "Multi-hop reading comprehension medical" },
  { id: "hf-259", name: "bigbio/meddialog", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/meddialog", description: "Medical dialogue datasets multi-language" },
  { id: "hf-260", name: "bigbio/evidence_inference", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/evidence_inference", description: "Evidence inference from clinical trial reports" },
  { id: "hf-261", name: "ClinicalTrials/ct-gov", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/clinicaltrials", description: "ClinicalTrials.gov structured trial data" },
  { id: "hf-262", name: "multi_nli", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/multi_nli", description: "Multi-genre NLI for medical text reasoning" },
  { id: "hf-263", name: "snli", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/snli", description: "Stanford NLI for textual entailment" },
  { id: "hf-264", name: "squad_v2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/squad_v2", description: "SQuAD v2 extractive QA for medical passages" },
  { id: "hf-265", name: "natural_questions", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/natural_questions", description: "Google Natural Questions for open-domain QA" },
  { id: "hf-266", name: "trivia_qa", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/trivia_qa", description: "TriviaQA large scale QA with evidence" },
  { id: "hf-267", name: "cnn_dailymail", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/cnn_dailymail", description: "CNN/DailyMail summarization for medical literature" },
  { id: "hf-268", name: "xsum", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/xsum", description: "Extreme summarization for concise medical summaries" },
  { id: "hf-269", name: "glue", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/glue", description: "GLUE benchmark for language understanding" },
  { id: "hf-270", name: "super_glue", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/super_glue", description: "SuperGLUE advanced language understanding" },
  { id: "gh-271", name: "huggingface/trl", source: "github", category: "training-tools", url: "https://github.com/huggingface/trl", description: "Transformer Reinforcement Learning for RLHF" },
  { id: "gh-272", name: "OpenRLHF/OpenRLHF", source: "github", category: "training-tools", url: "https://github.com/OpenRLHF/OpenRLHF", description: "Open-source RLHF framework for LLM alignment" },
  { id: "gh-273", name: "CarperAI/trlx", source: "github", category: "training-tools", url: "https://github.com/CarperAI/trlx", description: "RLHF at scale with PPO and ILQL" },
  { id: "gh-274", name: "microsoft/DeepSpeed", source: "github", category: "training-tools", url: "https://github.com/microsoft/DeepSpeed", description: "DeepSpeed deep learning optimization for training" },
  { id: "gh-275", name: "facebookresearch/fairseq", source: "github", category: "training-tools", url: "https://github.com/facebookresearch/fairseq", description: "Fairseq sequence modeling toolkit" },
  { id: "gh-276", name: "EleutherAI/lm-evaluation-harness", source: "github", category: "training-tools", url: "https://github.com/EleutherAI/lm-evaluation-harness", description: "LLM evaluation framework for benchmarking" },
  { id: "gh-277", name: "bigscience-workshop/petals", source: "github", category: "training-tools", url: "https://github.com/bigscience-workshop/petals", description: "Distributed LLM inference and fine-tuning" },
  { id: "gh-278", name: "TimDettmers/bitsandbytes", source: "github", category: "training-tools", url: "https://github.com/TimDettmers/bitsandbytes", description: "8-bit and 4-bit quantization for efficient training" },
  { id: "gh-279", name: "IST-DASLab/gptq", source: "github", category: "training-tools", url: "https://github.com/IST-DASLab/gptq", description: "GPTQ post-training quantization for deployment" },
  { id: "gh-280", name: "turboderp/exllamav2", source: "github", category: "training-tools", url: "https://github.com/turboderp/exllamav2", description: "ExLlamaV2 fast inference for quantized models" },
  { id: "gh-281", name: "abetlen/llama-cpp-python", source: "github", category: "training-tools", url: "https://github.com/abetlen/llama-cpp-python", description: "Python bindings for llama.cpp local inference" },
  { id: "gh-282", name: "nomic-ai/gpt4all", source: "github", category: "training-tools", url: "https://github.com/nomic-ai/gpt4all", description: "GPT4All local LLM ecosystem" },
  { id: "gh-283", name: "imartinez/privateGPT", source: "github", category: "rag-tools", url: "https://github.com/imartinez/privateGPT", description: "PrivateGPT local document QA with LLMs" },
  { id: "gh-284", name: "Mintplex-Labs/anything-llm", source: "github", category: "rag-tools", url: "https://github.com/Mintplex-Labs/anything-llm", description: "AnythingLLM all-in-one AI desktop app" },
  { id: "gh-285", name: "quivrhq/quivr", source: "github", category: "rag-tools", url: "https://github.com/quivrhq/quivr", description: "Quivr personal AI assistant with RAG" },
  { id: "hf-286", name: "lmsys/chatbot_arena_conversations", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/lmsys/chatbot_arena_conversations", description: "Chatbot Arena preference data for RLHF" },
  { id: "hf-287", name: "argilla/ultrafeedback-binarized-preferences-cleaned", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/argilla/ultrafeedback-binarized-preferences-cleaned", description: "UltraFeedback preference data for DPO training" },
  { id: "hf-288", name: "HuggingFaceH4/no_robots", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceH4/no_robots", description: "10K human-written instruction data" },
  { id: "hf-289", name: "mlabonne/orpo-dpo-mix-40k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/mlabonne/orpo-dpo-mix-40k", description: "Mixed ORPO/DPO preference training data" },
  { id: "hf-290", name: "Intel/orca_dpo_pairs", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Intel/orca_dpo_pairs", description: "Orca DPO pairs for preference alignment" },
  { id: "hf-291", name: "openbmb/UltraChat", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/stingning/ultrachat", description: "1.5M multi-turn instructional dialogues" },
  { id: "hf-292", name: "ShareGPT/ShareGPT_V3", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/anon8231489123/ShareGPT_Vicuna_unfiltered", description: "ShareGPT conversation data for fine-tuning" },
  { id: "hf-293", name: "GAIR/lima", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/GAIR/lima", description: "1K carefully curated instruction examples LIMA" },
  { id: "hf-294", name: "HuggingFaceH4/deita-10k-v0", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceH4/deita-10k-v0", description: "Data-efficient instruction tuning examples" },
  { id: "hf-295", name: "mosaicml/dolly_hhrlhf", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/mosaicml/dolly_hhrlhf", description: "Dolly + Anthropic HH RLHF combined data" },
  { id: "hf-296", name: "Anthropic/hh-rlhf", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Anthropic/hh-rlhf", description: "Anthropic Helpful and Harmless RLHF preference data" },
  { id: "hf-297", name: "stanfordnlp/SHP", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/stanfordnlp/SHP", description: "Stanford Human Preferences from Reddit" },
  { id: "hf-298", name: "nvidia/HelpSteer2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/nvidia/HelpSteer2", description: "NVIDIA HelpSteer steerable alignment data" },
  { id: "hf-299", name: "PKU-Alignment/PKU-SafeRLHF", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/PKU-Alignment/PKU-SafeRLHF", description: "Safe RLHF preference data for alignment" },
  { id: "hf-300", name: "openbmb/UltraFeedback", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/openbmb/UltraFeedback", description: "Large-scale fine-grained AI feedback data" },
  { id: "gh-301", name: "Dao-AILab/flash-attention", source: "github", category: "training-tools", url: "https://github.com/Dao-AILab/flash-attention", description: "FlashAttention fast memory-efficient attention" },
  { id: "gh-302", name: "NVIDIA/Megatron-LM", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/Megatron-LM", description: "NVIDIA Megatron large-scale model training" },
  { id: "gh-303", name: "ray-project/ray", source: "github", category: "training-tools", url: "https://github.com/ray-project/ray", description: "Ray distributed computing for model training" },
  { id: "gh-304", name: "Lightning-AI/pytorch-lightning", source: "github", category: "training-tools", url: "https://github.com/Lightning-AI/pytorch-lightning", description: "PyTorch Lightning for scalable model training" },
  { id: "gh-305", name: "wandb/wandb", source: "github", category: "training-tools", url: "https://github.com/wandb/wandb", description: "Weights & Biases experiment tracking for ML" },
  { id: "gh-306", name: "mlflow/mlflow", source: "github", category: "training-tools", url: "https://github.com/mlflow/mlflow", description: "MLflow ML lifecycle management platform" },
  { id: "gh-307", name: "dmlc/dgl", source: "github", category: "training-tools", url: "https://github.com/dmlc/dgl", description: "Deep Graph Library for knowledge graph models" },
  { id: "gh-308", name: "pyg-team/pytorch_geometric", source: "github", category: "training-tools", url: "https://github.com/pyg-team/pytorch_geometric", description: "PyTorch Geometric for medical knowledge graphs" },
  { id: "gh-309", name: "explosion/spaCy", source: "github", category: "nlp-tools", url: "https://github.com/explosion/spaCy", description: "SpaCy industrial NLP for medical text processing" },
  { id: "gh-310", name: "flairNLP/flair", source: "github", category: "nlp-tools", url: "https://github.com/flairNLP/flair", description: "Flair NLP framework for biomedical NER" },
  { id: "gh-311", name: "JohnSnowLabs/spark-nlp", source: "github", category: "nlp-tools", url: "https://github.com/JohnSnowLabs/spark-nlp", description: "Spark NLP for clinical and biomedical text" },
  { id: "gh-312", name: "stanfordnlp/stanza", source: "github", category: "nlp-tools", url: "https://github.com/stanfordnlp/stanza", description: "Stanford NLP toolkit with biomedical models" },
  { id: "gh-313", name: "allenai/allennlp", source: "github", category: "nlp-tools", url: "https://github.com/allenai/allennlp", description: "AllenNLP research library for scientific NLP" },
  { id: "gh-314", name: "google-research/bert", source: "github", category: "nlp-tools", url: "https://github.com/google-research/bert", description: "BERT pre-training and fine-tuning code" },
  { id: "gh-315", name: "thunlp/OpenNRE", source: "github", category: "nlp-tools", url: "https://github.com/thunlp/OpenNRE", description: "Open relation extraction for medical entities" },
  { id: "gh-316", name: "NVIDIA/NeMo-Curator", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/NeMo-Curator", description: "NVIDIA NeMo Curator for training data curation" },
  { id: "gh-317", name: "argilla-io/argilla", source: "github", category: "training-tools", url: "https://github.com/argilla-io/argilla", description: "Argilla data labeling for medical annotation" },
  { id: "gh-318", name: "doccano/doccano", source: "github", category: "training-tools", url: "https://github.com/doccano/doccano", description: "Doccano text annotation for NER and classification" },
  { id: "gh-319", name: "heartexlabs/label-studio", source: "github", category: "training-tools", url: "https://github.com/HumanSignal/label-studio", description: "Label Studio multi-type data labeling tool" },
  { id: "gh-320", name: "snorkel-team/snorkel", source: "github", category: "training-tools", url: "https://github.com/snorkel-team/snorkel", description: "Snorkel programmatic data labeling" },
  { id: "gh-321", name: "lightly-ai/lightly", source: "github", category: "training-tools", url: "https://github.com/lightly-ai/lightly", description: "Self-supervised learning for data curation" },
  { id: "gh-322", name: "cleanlab/cleanlab", source: "github", category: "training-tools", url: "https://github.com/cleanlab/cleanlab", description: "Cleanlab find label errors in medical datasets" },
  { id: "gh-323", name: "great-expectations/great_expectations", source: "github", category: "training-tools", url: "https://github.com/great-expectations/great_expectations", description: "Data validation and quality for training pipelines" },
  { id: "gh-324", name: "iterative/dvc", source: "github", category: "training-tools", url: "https://github.com/iterative/dvc", description: "DVC data version control for ML datasets" },
  { id: "gh-325", name: "pachyderm/pachyderm", source: "github", category: "training-tools", url: "https://github.com/pachyderm/pachyderm", description: "Pachyderm data versioning and ML pipelines" },
  { id: "hf-326", name: "medical-images/retinal-oct", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/marmal88/skin_cancer", description: "Skin cancer ISIC classification dataset" },
  { id: "hf-327", name: "pathvqa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/flaviagiammarino/path-vqa", description: "Pathology visual QA multimodal dataset" },
  { id: "hf-328", name: "slake", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/BoKelworworworworwor/SLAKE", description: "SLAKE bilingual medical VQA dataset" },
  { id: "hf-329", name: "vqa-rad", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/flaviagiammarino/vqa-rad", description: "VQA-RAD radiology visual QA dataset" },
  { id: "hf-330", name: "PMC-VQA", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/xmcmic/PMC-VQA", description: "PMC-VQA visual QA from PubMed Central figures" },
  { id: "hf-331", name: "chaoyi-wu/RadFM", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/chaoyi-wu/RadFM", description: "RadFM radiology foundation model" },
  { id: "hf-332", name: "OpenGVLab/InternVL2-8B", source: "huggingface", category: "vision", url: "https://huggingface.co/OpenGVLab/InternVL2-8B", description: "InternVL2 vision-language for medical imaging" },
  { id: "hf-333", name: "liuhaotian/llava-v1.6-34b", source: "huggingface", category: "vision", url: "https://huggingface.co/liuhaotian/llava-v1.6-34b", description: "LLaVA 1.6 34B visual reasoning for medical images" },
  { id: "hf-334", name: "MILVLG/imp-v1-3b", source: "huggingface", category: "vision", url: "https://huggingface.co/MILVLG/imp-v1-3b", description: "IMP efficient multimodal model for imaging" },
  { id: "hf-335", name: "google/paligemma-3b-pt-224", source: "huggingface", category: "vision", url: "https://huggingface.co/google/paligemma-3b-pt-224", description: "PaliGemma vision-language for medical VQA" },
  { id: "gh-336", name: "Project-MONAI/MONAILabel", source: "github", category: "medical-tools", url: "https://github.com/Project-MONAI/MONAILabel", description: "MONAI Label interactive medical image annotation" },
  { id: "gh-337", name: "fepegar/torchio", source: "github", category: "medical-tools", url: "https://github.com/fepegar/torchio", description: "TorchIO medical image preprocessing and augmentation" },
  { id: "gh-338", name: "SimpleITK/SimpleITK", source: "github", category: "medical-tools", url: "https://github.com/SimpleITK/SimpleITK", description: "SimpleITK image analysis for medical imaging" },
  { id: "gh-339", name: "InsightSoftwareConsortium/ITK", source: "github", category: "medical-tools", url: "https://github.com/InsightSoftwareConsortium/ITK", description: "Insight Toolkit for medical image analysis" },
  { id: "gh-340", name: "nipy/nipype", source: "github", category: "medical-tools", url: "https://github.com/nipy/nipype", description: "Nipype neuroimaging pipelines for brain studies" },
  { id: "gh-341", name: "3Dslicer/Slicer", source: "github", category: "medical-tools", url: "https://github.com/Slicer/Slicer", description: "3D Slicer medical image visualization platform" },
  { id: "gh-342", name: "OHIF/Viewers", source: "github", category: "medical-tools", url: "https://github.com/OHIF/Viewers", description: "OHIF medical image viewer for DICOM" },
  { id: "gh-343", name: "cornerstonejs/cornerstone3D", source: "github", category: "medical-tools", url: "https://github.com/cornerstonejs/cornerstone3D", description: "Cornerstone.js medical imaging web viewer" },
  { id: "gh-344", name: "nilearn/nilearn", source: "github", category: "medical-tools", url: "https://github.com/nilearn/nilearn", description: "Machine learning for neuroimaging data" },
  { id: "gh-345", name: "dicom/dcm4che", source: "github", category: "medical-tools", url: "https://github.com/dcm4che/dcm4che", description: "DICOM implementation for medical imaging" },
  { id: "kg-346", name: "kaggle/prostate-cancer-grade", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/prostate-cancer-grade-assessment", description: "Prostate cancer grading from pathology" },
  { id: "kg-347", name: "kaggle/rsna-breast-cancer", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/rsna-breast-cancer-detection", description: "RSNA breast cancer screening mammography" },
  { id: "kg-348", name: "kaggle/hubmap-kidney", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/hubmap-kidney-segmentation", description: "HuBMAP kidney tissue segmentation" },
  { id: "kg-349", name: "kaggle/uwmgi-segmentation", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/uw-madison-gi-tract-image-segmentation", description: "GI tract image segmentation for transfer learning" },
  { id: "kg-350", name: "kaggle/rsna-cervical-spine", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/rsna-2022-cervical-spine-fracture-detection", description: "Cervical spine fracture detection CT" },
  { id: "kg-351", name: "kaggle/mayo-clinic-strip-ai", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/mayo-clinic-strip-ai", description: "Mayo Clinic stroke prediction AI" },
  { id: "kg-352", name: "kaggle/g2net-gravitational", source: "kaggle", category: "general-dataset", url: "https://www.kaggle.com/c/g2net-gravitational-wave-detection", description: "Signal detection in noisy data transfer to medical" },
  { id: "kg-353", name: "kaggle/petfinder-pawpularity", source: "kaggle", category: "general-dataset", url: "https://www.kaggle.com/c/petfinder-pawpularity-score", description: "Image quality scoring transferable to medical" },
  { id: "fin-354", name: "kaggle/two-sigma-financial-news", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/c/two-sigma-financial-news", description: "Two Sigma financial news sentiment prediction" },
  { id: "fin-355", name: "kaggle/jane-street-market-prediction", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/c/jane-street-market-prediction", description: "Jane Street market prediction trading data" },
  { id: "fin-356", name: "kaggle/optiver-realized-volatility", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/c/optiver-realized-volatility-prediction", description: "Optiver realized volatility prediction" },
  { id: "fin-357", name: "kaggle/ubiquant-market-prediction", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/c/ubiquant-market-prediction", description: "Ubiquant market prediction competition" },
  { id: "fin-358", name: "kaggle/jpx-tokyo-stock-exchange", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/c/jpx-tokyo-stock-exchange-prediction", description: "JPX Tokyo stock exchange prediction" },
  { id: "fin-359", name: "kaggle/g-research-crypto-forecasting", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/c/g-research-crypto-forecasting", description: "G-Research cryptocurrency forecasting" },
  { id: "fin-360", name: "FinGPT/fingpt-sentiment-cls", source: "huggingface", category: "finance-model", url: "https://huggingface.co/FinGPT/fingpt-sentiment_cls", description: "Financial sentiment classification model" },
  { id: "fin-361", name: "TheFinAI/flare-ner", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-ner", description: "Financial named entity recognition dataset" },
  { id: "fin-362", name: "TheFinAI/flare-fpb", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-fpb", description: "Financial PhraseBank sentiment benchmark" },
  { id: "fin-363", name: "amphora/krx-sample-instructions", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/amphora/krx-sample-instructions", description: "Korean Exchange financial instruction data" },
  { id: "fin-364", name: "AdaptLLM/finance-tasks", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/AdaptLLM/finance-tasks", description: "Finance task evaluation benchmark" },
  { id: "fin-365", name: "sec-edgar-filings", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/JanosAudworworworwor/sec-filings-10k", description: "SEC EDGAR 10-K filing text for financial NLP" },
  { id: "gh-366", name: "AI4Finance-Foundation/FinNLP", source: "github", category: "finance-model", url: "https://github.com/AI4Finance-Foundation/FinNLP", description: "Financial NLP tools and models" },
  { id: "gh-367", name: "YangletLiu/FinTral", source: "github", category: "finance-model", url: "https://github.com/YangletLiu/FinTral", description: "FinTral financial LLM suite" },
  { id: "gh-368", name: "salesforce/Merlion", source: "github", category: "finance-tools", url: "https://github.com/salesforce/Merlion", description: "Time series intelligence for financial forecasting" },
  { id: "gh-369", name: "unit8co/darts", source: "github", category: "finance-tools", url: "https://github.com/unit8co/darts", description: "Time series forecasting for market analysis" },
  { id: "gh-370", name: "nixtla/statsforecast", source: "github", category: "finance-tools", url: "https://github.com/Nixtla/statsforecast", description: "Statistical time series forecasting" },
  { id: "hf-371", name: "bigbio/cadec", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cadec", description: "CSIRO adverse drug event corpus from social media" },
  { id: "hf-372", name: "bigbio/twadrl", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/twadrl", description: "Twitter adverse drug reaction detection" },
  { id: "hf-373", name: "bigbio/euadr", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/euadr", description: "EU-ADR drug-disease-gene relation extraction" },
  { id: "hf-374", name: "bigbio/ask_a_patient", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ask_a_patient", description: "Patient drug review concept normalization" },
  { id: "hf-375", name: "bigbio/spl_adr_200db", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/spl_adr_200db", description: "Drug label adverse reaction extraction" },
  { id: "hf-376", name: "bigbio/pdr", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/pdr", description: "Physician desk reference drug information" },
  { id: "hf-377", name: "bigbio/cord_ner", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cord_ner", description: "CORD-19 named entity recognition" },
  { id: "hf-378", name: "bigbio/distemist", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/distemist", description: "Disease NER and normalization Spanish clinical" },
  { id: "hf-379", name: "bigbio/sst", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/sst", description: "Semantic relations in surgical text" },
  { id: "hf-380", name: "bigbio/craft", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/craft", description: "Colorado Richly Annotated Full Text corpus" },
  { id: "hf-381", name: "bigbio/bionlp_st_2011_ge", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2011_ge", description: "BioNLP GENIA event extraction shared task" },
  { id: "hf-382", name: "bigbio/bionlp_st_2013_cg", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2013_cg", description: "BioNLP cancer genetics event extraction" },
  { id: "hf-383", name: "bigbio/ade_corpus_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ade_corpus_v2", description: "Adverse drug effect relation extraction" },
  { id: "hf-384", name: "bigbio/multi_xscience", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/multi_xscience", description: "Multi-document scientific summarization" },
  { id: "hf-385", name: "bigbio/msh_wsd", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/msh_wsd", description: "MeSH word sense disambiguation" },
  { id: "hf-386", name: "bigbio/pico_extraction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/pico_extraction", description: "PICO element extraction from clinical abstracts" },
  { id: "hf-387", name: "bigbio/an_em", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/an_em", description: "Anatomical entity mention NER" },
  { id: "hf-388", name: "nyu-mll/multi_nli", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/nyu-mll/multi_nli", description: "Multi-genre NLI for reasoning transfer" },
  { id: "hf-389", name: "hellaswag", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/hellaswag", description: "HellaSwag commonsense NLI benchmark" },
  { id: "hf-390", name: "winogrande", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/winogrande", description: "WinoGrande adversarial commonsense" },
  { id: "hf-391", name: "ai2_arc", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/ai2_arc", description: "AI2 Reasoning Challenge science questions" },
  { id: "hf-392", name: "gsm8k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/gsm8k", description: "Grade school math for chain-of-thought reasoning" },
  { id: "hf-393", name: "hendrycks/competition_math", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/hendrycks/competition_math", description: "Competition math problems for analytical reasoning" },
  { id: "hf-394", name: "truthful_qa", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/truthful_qa", description: "TruthfulQA measuring model truthfulness" },
  { id: "hf-395", name: "cais/mmlu", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/cais/mmlu", description: "MMLU massive multitask language understanding" },
  { id: "hf-396", name: "EleutherAI/pile", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/EleutherAI/pile", description: "The Pile 800GB diverse text for pre-training" },
  { id: "hf-397", name: "cerebras/SlimPajama-627B", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/cerebras/SlimPajama-627B", description: "SlimPajama 627B token pre-training dataset" },
  { id: "hf-398", name: "togethercomputer/RedPajama-Data-V2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/togethercomputer/RedPajama-Data-V2", description: "RedPajama 30T token pre-training dataset" },
  { id: "hf-399", name: "allenai/dolma", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/dolma", description: "Dolma 3T token open pre-training corpus" },
  { id: "hf-400", name: "HuggingFaceFW/fineweb", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceFW/fineweb", description: "FineWeb 15T token curated web corpus" },
  { id: "gh-401", name: "geekan/MetaGPT", source: "github", category: "agent-tools", url: "https://github.com/geekan/MetaGPT", description: "MetaGPT multi-agent framework for AI orchestration" },
  { id: "gh-402", name: "microsoft/autogen", source: "github", category: "agent-tools", url: "https://github.com/microsoft/autogen", description: "AutoGen multi-agent conversation framework" },
  { id: "gh-403", name: "joaomdmoura/crewAI", source: "github", category: "agent-tools", url: "https://github.com/joaomdmoura/crewAI", description: "CrewAI AI agent orchestration framework" },
  { id: "gh-404", name: "Significant-Gravitas/AutoGPT", source: "github", category: "agent-tools", url: "https://github.com/Significant-Gravitas/AutoGPT", description: "AutoGPT autonomous AI agent" },
  { id: "gh-405", name: "langgenius/dify", source: "github", category: "agent-tools", url: "https://github.com/langgenius/dify", description: "Dify LLM application development platform" },
  { id: "gh-406", name: "FlowiseAI/Flowise", source: "github", category: "agent-tools", url: "https://github.com/FlowiseAI/Flowise", description: "Flowise low-code LLM apps builder" },
  { id: "gh-407", name: "n8n-io/n8n", source: "github", category: "agent-tools", url: "https://github.com/n8n-io/n8n", description: "n8n workflow automation with AI integration" },
  { id: "gh-408", name: "phidatahq/phidata", source: "github", category: "agent-tools", url: "https://github.com/phidatahq/phidata", description: "Phidata AI assistant framework with tools" },
  { id: "gh-409", name: "princeton-nlp/SWE-agent", source: "github", category: "agent-tools", url: "https://github.com/princeton-nlp/SWE-agent", description: "SWE-Agent autonomous software engineering" },
  { id: "gh-410", name: "OpenBMB/ChatDev", source: "github", category: "agent-tools", url: "https://github.com/OpenBMB/ChatDev", description: "ChatDev AI-powered software development" },
  { id: "gh-411", name: "All-Hands-AI/OpenHands", source: "github", category: "agent-tools", url: "https://github.com/All-Hands-AI/OpenHands", description: "OpenHands AI software developer agent" },
  { id: "gh-412", name: "composiodev/composio", source: "github", category: "agent-tools", url: "https://github.com/composiodev/composio", description: "Composio AI agent tool integration platform" },
  { id: "hf-413", name: "medical/radiology-reports-indiana", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/alkzar90/NIH-Chest-X-ray-dataset", description: "NIH chest X-ray reports for radiology NLP" },
  { id: "hf-414", name: "UCSD-AI4H/COVID-CT", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/UCSD-AI4H/COVID-CT", description: "COVID-19 CT scan classification dataset" },
  { id: "hf-415", name: "keremberke/blood-cell-object-detection", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/keremberke/blood-cell-object-detection", description: "Blood cell detection and classification" },
  { id: "hf-416", name: "marmal88/skin_cancer", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/marmal88/skin_cancer", description: "Skin cancer HAM10000 classification dataset" },
  { id: "hf-417", name: "Falah/Alzheimer_MRI", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/Falah/Alzheimer_MRI", description: "Alzheimer MRI classification dataset" },
  { id: "hf-418", name: "bigbio/cantemist", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cantemist", description: "Clinical case cancer tumor NER Spanish" },
  { id: "hf-419", name: "bigbio/scicite", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/scicite", description: "Citation intent classification scientific" },
  { id: "hf-420", name: "bigbio/anat_em", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/anat_em", description: "Anatomical entity mention recognition" },
  { id: "hf-421", name: "bigbio/genetag", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/genetag", description: "Gene/protein named entity tagging" },
  { id: "hf-422", name: "bigbio/tmvar_v3", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/tmvar_v3", description: "Genetic variant mention recognition" },
  { id: "hf-423", name: "bigbio/scai_disease", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/scai_disease", description: "Disease NER corpus from SCAI" },
  { id: "hf-424", name: "bigbio/scai_chemical", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/scai_chemical", description: "Chemical compound NER corpus" },
  { id: "hf-425", name: "bigbio/osiris", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/osiris", description: "SNP and mutation NER extraction" },
  { id: "gh-426", name: "CambridgeMolecularEngineering/molbart", source: "github", category: "medical-tools", url: "https://github.com/MolecularAI/MolBART", description: "Molecular BART for drug discovery" },
  { id: "gh-427", name: "deepchem/deepchem", source: "github", category: "medical-tools", url: "https://github.com/deepchem/deepchem", description: "DeepChem deep learning for drug discovery" },
  { id: "gh-428", name: "mims-harvard/TDC", source: "github", category: "medical-tools", url: "https://github.com/mims-harvard/TDC", description: "Therapeutics Data Commons ML drug development" },
  { id: "gh-429", name: "snap-stanford/ogb", source: "github", category: "general-ml", url: "https://github.com/snap-stanford/ogb", description: "Open Graph Benchmark for graph ML" },
  { id: "gh-430", name: "snap-stanford/GraphGym", source: "github", category: "general-ml", url: "https://github.com/snap-stanford/GraphGym", description: "GraphGym platform for graph neural networks" },
  { id: "gh-431", name: "Lightning-AI/litgpt", source: "github", category: "training-tools", url: "https://github.com/Lightning-AI/litgpt", description: "LitGPT pretrain finetune deploy LLMs" },
  { id: "gh-432", name: "tensorflow/tensor2tensor", source: "github", category: "training-tools", url: "https://github.com/tensorflow/tensor2tensor", description: "Tensor2Tensor for seq2seq medical tasks" },
  { id: "gh-433", name: "facebookresearch/llama-recipes", source: "github", category: "training-tools", url: "https://github.com/meta-llama/llama-recipes", description: "Llama fine-tuning recipes and examples" },
  { id: "gh-434", name: "artidoro/qlora", source: "github", category: "training-tools", url: "https://github.com/artidoro/qlora", description: "QLoRA efficient fine-tuning of quantized LLMs" },
  { id: "gh-435", name: "databrickslabs/dolly", source: "github", category: "training-tools", url: "https://github.com/databrickslabs/dolly", description: "Databricks Dolly commercial-friendly LLM training" },
  { id: "gh-436", name: "OpenLMLab/MOSS", source: "github", category: "training-tools", url: "https://github.com/OpenLMLab/MOSS", description: "MOSS open-source conversational LLM" },
  { id: "gh-437", name: "OptimalScale/LMFlow", source: "github", category: "training-tools", url: "https://github.com/OptimalScale/LMFlow", description: "LMFlow extensible LLM finetuning framework" },
  { id: "gh-438", name: "InternLM/xtuner", source: "github", category: "training-tools", url: "https://github.com/InternLM/xtuner", description: "XTuner efficient fine-tuning toolkit" },
  { id: "gh-439", name: "jzhang38/TinyLlama", source: "github", category: "general-llm", url: "https://github.com/jzhang38/TinyLlama", description: "TinyLlama 1.1B parameter efficient model" },
  { id: "gh-440", name: "THUDM/ChatGLM3", source: "github", category: "general-llm", url: "https://github.com/THUDM/ChatGLM3", description: "ChatGLM3 bilingual language model" },
  { id: "gh-441", name: "QwenLM/Qwen", source: "github", category: "general-llm", url: "https://github.com/QwenLM/Qwen", description: "Qwen large language model series" },
  { id: "gh-442", name: "01-ai/Yi", source: "github", category: "general-llm", url: "https://github.com/01-ai/Yi", description: "Yi series bilingual language models" },
  { id: "gh-443", name: "BAAI-Agents/Cradle", source: "github", category: "agent-tools", url: "https://github.com/BAAI-Agents/Cradle", description: "General computer agent framework" },
  { id: "gh-444", name: "cpacker/MemGPT", source: "github", category: "agent-tools", url: "https://github.com/cpacker/MemGPT", description: "MemGPT LLM with long-term memory management" },
  { id: "gh-445", name: "ScrapeGraphAI/Scrapegraph-ai", source: "github", category: "agent-tools", url: "https://github.com/ScrapeGraphAI/Scrapegraph-ai", description: "AI web scraping agent for data collection" },
  { id: "gh-446", name: "mem0ai/mem0", source: "github", category: "agent-tools", url: "https://github.com/mem0ai/mem0", description: "Mem0 memory layer for AI applications" },
  { id: "gh-447", name: "AgentOps-AI/agentops", source: "github", category: "agent-tools", url: "https://github.com/AgentOps-AI/agentops", description: "AgentOps observability for AI agents" },
  { id: "gh-448", name: "e2b-dev/E2B", source: "github", category: "agent-tools", url: "https://github.com/e2b-dev/E2B", description: "E2B cloud runtime for AI agents" },
  { id: "hf-449", name: "Open-Orca/SlimOrca", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Open-Orca/SlimOrca", description: "SlimOrca cleaned instruction dataset" },
  { id: "hf-450", name: "NousResearch/Hermes-2-Pro-dataset", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/NousResearch/hermes-function-calling-v1", description: "Function calling instruction dataset" },
  { id: "hf-451", name: "glaiveai/glaive-function-calling-v2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/glaiveai/glaive-function-calling-v2", description: "Function calling training data for tool use" },
  { id: "hf-452", name: "gorilla-llm/berkeley-function-calling", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard", description: "Berkeley function calling benchmark" },
  { id: "hf-453", name: "bigcode/starcoderdata", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/bigcode/starcoderdata", description: "StarCoder pre-training data for code generation" },
  { id: "hf-454", name: "codeparrot/github-code", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/codeparrot/github-code", description: "GitHub code dataset for code generation" },
  { id: "hf-455", name: "m-a-p/CodeFeedback-Filtered-Instruction", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/m-a-p/CodeFeedback-Filtered-Instruction", description: "Code feedback instruction tuning data" },
  { id: "hf-456", name: "nvidia/OpenMathInstruct-2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/nvidia/OpenMathInstruct-2", description: "14M math instruction data for reasoning" },
  { id: "hf-457", name: "allenai/tulu-v2-sft-mixture", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/tulu-v2-sft-mixture", description: "Tulu v2 diverse SFT training mixture" },
  { id: "hf-458", name: "HuggingFaceH4/ultrafeedback_binarized", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceH4/ultrafeedback_binarized", description: "UltraFeedback binarized DPO preference data" },
  { id: "hf-459", name: "jondurbin/gutenberg-dpo-v0.1", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/jondurbin/gutenberg-dpo-v0.1", description: "Gutenberg literature for style training" },
  { id: "hf-460", name: "argilla/distilabel-capybara-dpo-7k-binarized", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/argilla/distilabel-capybara-dpo-7k-binarized", description: "Multi-turn DPO preference alignment data" },
  { id: "gh-461", name: "openmedlab/MedFM", source: "github", category: "medical-tools", url: "https://github.com/openmedlab/MedFM", description: "Medical Foundation Model benchmark toolkit" },
  { id: "gh-462", name: "openmedlab/PULSE", source: "github", category: "medical-llm", url: "https://github.com/openmedlab/PULSE", description: "PULSE Chinese medical LLM platform" },
  { id: "gh-463", name: "UCSC-VLAA/MedTrinity-25M", source: "github", category: "medical-dataset", url: "https://github.com/UCSC-VLAA/MedTrinity-25M", description: "25M image-text medical dataset" },
  { id: "gh-464", name: "chaoyi-wu/PMC-LLaMA", source: "github", category: "medical-llm", url: "https://github.com/chaoyi-wu/PMC-LLaMA", description: "PMC-LLaMA training code and data" },
  { id: "gh-465", name: "WangRongshworworworwor/MedQA", source: "github", category: "medical-dataset", url: "https://github.com/jind11/MedQA", description: "MedQA USMLE-style QA benchmark code" },
  { id: "gh-466", name: "Kent0n-Li/ChatDoctor", source: "github", category: "medical-llm", url: "https://github.com/Kent0n-Li/ChatDoctor", description: "ChatDoctor medical dialogue fine-tuned LLM" },
  { id: "gh-467", name: "FreedomIntelligence/HuatuoGPT", source: "github", category: "medical-llm", url: "https://github.com/FreedomIntelligence/HuatuoGPT", description: "HuatuoGPT medical consultation LLM" },
  { id: "gh-468", name: "michael-wzhu/ChatMed", source: "github", category: "medical-llm", url: "https://github.com/michael-wzhu/ChatMed", description: "ChatMed Chinese medical chatbot" },
  { id: "gh-469", name: "SCIR-HI/Huatuo-Llama-Med-Chinese", source: "github", category: "medical-llm", url: "https://github.com/SCIR-HI/Huatuo-Llama-Med-Chinese", description: "Huatuo Chinese medical LLaMA" },
  { id: "gh-470", name: "cambridgeltl/visual-med-alpaca", source: "github", category: "medical-llm", url: "https://github.com/cambridgeltl/visual-med-alpaca", description: "Visual Med Alpaca multimodal medical LLM" },
  { id: "gh-471", name: "bowang-lab/MedSAM", source: "github", category: "medical-tools", url: "https://github.com/bowang-lab/MedSAM", description: "Medical SAM segment anything for medical images" },
  { id: "gh-472", name: "uni-medical/SAM-Med3D", source: "github", category: "medical-tools", url: "https://github.com/uni-medical/SAM-Med3D", description: "SAM-Med3D 3D medical image segmentation" },
  { id: "gh-473", name: "mazurowski-lab/segment-anything-medical-images", source: "github", category: "medical-tools", url: "https://github.com/mazurowski-lab/segment-anything-medical-images", description: "SAM evaluation for medical image segmentation" },
  { id: "gh-474", name: "ChaoningZhang/MobileSAM", source: "github", category: "medical-tools", url: "https://github.com/ChaoningZhang/MobileSAM", description: "MobileSAM lightweight segmentation for deployment" },
  { id: "gh-475", name: "hitachinsk/SAMed", source: "github", category: "medical-tools", url: "https://github.com/hitachinsk/SAMed", description: "SAMed segment anything adapted for medical images" },
  { id: "hf-476", name: "axiong/pmc_oa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/axiong/pmc_oa", description: "PMC Open Access image-text pairs medical" },
  { id: "hf-477", name: "axiong/pmc_llama_instructions", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/axiong/pmc_llama_instructions", description: "PMC-LLaMA instruction tuning data" },
  { id: "hf-478", name: "medalpaca/medical_meadow_medqa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medalpaca/medical_meadow_medqa", description: "Medical Meadow QA for medical LLM training" },
  { id: "hf-479", name: "medalpaca/medical_meadow_wikidoc", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medalpaca/medical_meadow_wikidoc", description: "WikiDoc medical knowledge QA pairs" },
  { id: "hf-480", name: "medalpaca/medical_meadow_pubmed_causal", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medalpaca/medical_meadow_pubmed_causal", description: "PubMed causal relation extraction medical" },
  { id: "hf-481", name: "medalpaca/medical_meadow_medical_flashcards", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medalpaca/medical_meadow_medical_flashcards", description: "Medical flashcard QA from Anki decks" },
  { id: "hf-482", name: "medalpaca/medical_meadow_cord19", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medalpaca/medical_meadow_cord19", description: "COVID-19 open research dialogue data" },
  { id: "hf-483", name: "medalpaca/medical_meadow_health_advice", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medalpaca/medical_meadow_health_advice", description: "Health advice QA pairs for medical chat" },
  { id: "hf-484", name: "openlifescienceai/Med-HALT", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/openlifescienceai/Med-HALT", description: "Medical hallucination leaderboard test data" },
  { id: "hf-485", name: "aaditya/clinical_notes_summarization", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/aaditya/clinical_notes_summarization", description: "Clinical notes summarization dataset" },
  { id: "hf-486", name: "beanham/clinical_trials_gov_studies", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/beanham/medtrialextract", description: "Clinical trial study data extraction" },
  { id: "hf-487", name: "medical-ner/bc2gm", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bc2gm_corpus", description: "BioCreative II gene mention NER" },
  { id: "hf-488", name: "bigbio/cdr", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bc5cdr", description: "Chemical-disease relation extraction corpus" },
  { id: "hf-489", name: "social-media-health/smm4h", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/twadrl", description: "Social media mining for health monitoring" },
  { id: "hf-490", name: "bigbio/gad", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/gad", description: "Genetic association disease extraction" },
  { id: "gh-491", name: "UpstageAI/evalverse", source: "github", category: "training-tools", url: "https://github.com/UpstageAI/evalverse", description: "LLM evaluation framework multi-benchmark" },
  { id: "gh-492", name: "declare-lab/flan-alpaca", source: "github", category: "training-tools", url: "https://github.com/declare-lab/flan-alpaca", description: "FLAN-Alpaca combined instruction tuning" },
  { id: "gh-493", name: "Instruction-Tuning-with-GPT-4/GPT-4-LLM", source: "github", category: "training-tools", url: "https://github.com/Instruction-Tuning-with-GPT-4/GPT-4-LLM", description: "GPT-4 generated instruction tuning data" },
  { id: "gh-494", name: "tatsu-lab/stanford_alpaca", source: "github", category: "training-tools", url: "https://github.com/tatsu-lab/stanford_alpaca", description: "Stanford Alpaca training code and data" },
  { id: "gh-495", name: "lm-sys/arena-hard-auto", source: "github", category: "training-tools", url: "https://github.com/lm-sys/arena-hard-auto", description: "Arena-Hard automated LLM evaluation" },
  { id: "gh-496", name: "bigscience-workshop/bigscience", source: "github", category: "training-tools", url: "https://github.com/bigscience-workshop/bigscience", description: "BigScience open LLM research collaboration" },
  { id: "gh-497", name: "NVIDIA/TensorRT-LLM", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/TensorRT-LLM", description: "NVIDIA TensorRT-LLM optimized inference" },
  { id: "gh-498", name: "neuralmagic/deepsparse", source: "github", category: "training-tools", url: "https://github.com/neuralmagic/deepsparse", description: "DeepSparse inference engine for CPU deployment" },
  { id: "gh-499", name: "onnx/onnx", source: "github", category: "training-tools", url: "https://github.com/onnx/onnx", description: "ONNX model interoperability format" },
  { id: "gh-500", name: "microsoft/onnxruntime", source: "github", category: "training-tools", url: "https://github.com/microsoft/onnxruntime", description: "ONNX Runtime high-perf model inference" },
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

router.get("/ent-datasets/repositories", async (req, res): Promise<void> => {
  const { source, category, search } = req.query;
  let filtered = TRAINING_REPOSITORIES;
  if (source && typeof source === "string") {
    filtered = filtered.filter(r => r.source === source);
  }
  if (category && typeof category === "string") {
    filtered = filtered.filter(r => r.category === category);
  }
  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }
  const sources = [...new Set(TRAINING_REPOSITORIES.map(r => r.source))];
  const categories = [...new Set(TRAINING_REPOSITORIES.map(r => r.category))];
  const sourceCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const r of TRAINING_REPOSITORIES) {
    sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
  }
  res.json({
    total: TRAINING_REPOSITORIES.length,
    filtered: filtered.length,
    sources,
    categories,
    sourceCounts,
    categoryCounts,
    repositories: filtered,
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
