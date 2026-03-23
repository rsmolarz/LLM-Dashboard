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
  { id: "hf-501", name: "allenai/led-base-16384", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/allenai/led-base-16384", description: "Longformer Encoder-Decoder for long medical documents" },
  { id: "hf-502", name: "google/long-t5-tglobal-base", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/google/long-t5-tglobal-base", description: "LongT5 for summarizing lengthy clinical reports" },
  { id: "hf-503", name: "allenai/longformer-base-4096", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/allenai/longformer-base-4096", description: "Longformer for processing long clinical notes" },
  { id: "hf-504", name: "microsoft/deberta-v3-large", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/deberta-v3-large", description: "DeBERTa v3 for medical text classification" },
  { id: "hf-505", name: "xlnet-large-cased", source: "huggingface", category: "general-llm", url: "https://huggingface.co/xlnet/xlnet-large-cased", description: "XLNet for autoregressive medical text understanding" },
  { id: "hf-506", name: "roberta-large", source: "huggingface", category: "general-llm", url: "https://huggingface.co/FacebookAI/roberta-large", description: "RoBERTa large for biomedical text classification" },
  { id: "hf-507", name: "albert-xxlarge-v2", source: "huggingface", category: "general-llm", url: "https://huggingface.co/albert/albert-xxlarge-v2", description: "ALBERT for parameter-efficient medical NLP" },
  { id: "hf-508", name: "EleutherAI/gpt-neox-20b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/EleutherAI/gpt-neox-20b", description: "GPT-NeoX 20B for medical domain adaptation" },
  { id: "hf-509", name: "EleutherAI/pythia-12b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/EleutherAI/pythia-12b", description: "Pythia 12B for controlled medical fine-tuning experiments" },
  { id: "hf-510", name: "tiiuae/falcon-7b-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/tiiuae/falcon-7b-instruct", description: "Falcon 7B instruction model for medical chat" },
  { id: "hf-511", name: "stabilityai/stablelm-zephyr-3b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/stabilityai/stablelm-zephyr-3b", description: "StableLM lightweight model for edge medical deployment" },
  { id: "hf-512", name: "internlm/internlm2-chat-7b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/internlm/internlm2-chat-7b", description: "InternLM2 for bilingual medical reasoning" },
  { id: "hf-513", name: "Deci/DeciLM-7B-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Deci/DeciLM-7B-instruct", description: "DeciLM efficient inference model for clinical use" },
  { id: "hf-514", name: "abacusai/Smaug-72B-v0.1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/abacusai/Smaug-72B-v0.1", description: "Smaug 72B for complex medical reasoning" },
  { id: "hf-515", name: "WizardLM/WizardCoder-15B-V1.0", source: "huggingface", category: "code-model", url: "https://huggingface.co/WizardLM/WizardCoder-15B-V1.0", description: "WizardCoder for medical software development" },
  { id: "hf-516", name: "deepseek-ai/deepseek-coder-6.7b-instruct", source: "huggingface", category: "code-model", url: "https://huggingface.co/deepseek-ai/deepseek-coder-6.7b-instruct", description: "DeepSeek Coder for clinical data pipelines" },
  { id: "hf-517", name: "Phind/Phind-CodeLlama-34B-v2", source: "huggingface", category: "code-model", url: "https://huggingface.co/Phind/Phind-CodeLlama-34B-v2", description: "Phind CodeLlama for bioinformatics coding" },
  { id: "hf-518", name: "codellama/CodeLlama-13b-Instruct-hf", source: "huggingface", category: "code-model", url: "https://huggingface.co/codellama/CodeLlama-13b-Instruct-hf", description: "CodeLlama for medical informatics automation" },
  { id: "hf-519", name: "bigcode/starcoder2-15b", source: "huggingface", category: "code-model", url: "https://huggingface.co/bigcode/starcoder2-15b", description: "StarCoder2 for clinical research code generation" },
  { id: "hf-520", name: "Salesforce/codegen25-7b-multi", source: "huggingface", category: "code-model", url: "https://huggingface.co/Salesforce/codegen25-7b-multi", description: "CodeGen2.5 for biomedical data processing scripts" },
  { id: "hf-521", name: "bigbio/leonarrd", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/leonarrd", description: "Longitudinal EHR outcome annotation resource" },
  { id: "hf-522", name: "bigbio/mqp", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mqp", description: "Medical question pairs for semantic similarity" },
  { id: "hf-523", name: "bigbio/minimayosrs", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/minimayosrs", description: "MiniMayoSRS clinical term similarity" },
  { id: "hf-524", name: "bigbio/umnsrs", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/umnsrs", description: "UMN semantic relatedness scores medical concepts" },
  { id: "hf-525", name: "bigbio/pedec", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/pedec", description: "Patient experience detection in web posts" },
  { id: "hf-526", name: "bigbio/progene", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/progene", description: "Protein-gene NER from biomedical literature" },
  { id: "hf-527", name: "bigbio/cellfinder", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cellfinder", description: "Cell type NER from biomedical text" },
  { id: "hf-528", name: "bigbio/verspoor", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/verspoor_2013", description: "Molecular event extraction from PubMed" },
  { id: "hf-529", name: "bigbio/grounding_gene", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/gnormplus", description: "Gene grounding and normalization corpus" },
  { id: "hf-530", name: "bigbio/bionlp_st_2019_bb", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2019_bb", description: "BioNLP bacteria biotope extraction" },
  { id: "hf-531", name: "bigbio/drugprot", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/drugprot", description: "Drug-protein interaction extraction BioCreative" },
  { id: "hf-532", name: "bigbio/nlmchem", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/nlmchem", description: "NLM-Chem chemical NER from PubMed" },
  { id: "hf-533", name: "bigbio/lll", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/lll", description: "Learning Language in Logic biomedical RE" },
  { id: "hf-534", name: "bigbio/ctebmsp", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ctebmsp", description: "Clinical trial EBM sentence classification" },
  { id: "hf-535", name: "bigbio/phos", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/phos", description: "Phosphorylation event extraction biomedical" },
  { id: "hf-536", name: "bigbio/psytar", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/psytar", description: "Psychiatric treatment ADR from patient reports" },
  { id: "hf-537", name: "bigbio/n2c2_2006_deid", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/n2c2_2006_deid", description: "n2c2 clinical text de-identification" },
  { id: "hf-538", name: "bigbio/n2c2_2008", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/n2c2_2008", description: "n2c2 2008 obesity detection from clinical notes" },
  { id: "hf-539", name: "bigbio/n2c2_2009", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/n2c2_2009", description: "n2c2 2009 medication extraction challenge" },
  { id: "hf-540", name: "bigbio/n2c2_2011", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/n2c2_2011", description: "n2c2 coreference resolution in clinical text" },
  { id: "hf-541", name: "bigbio/n2c2_2014_deid", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/n2c2_2014_deid", description: "n2c2 2014 de-identification and heart disease" },
  { id: "hf-542", name: "bigbio/n2c2_2018_track1", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/n2c2_2018_track1", description: "n2c2 2018 clinical trial cohort selection" },
  { id: "hf-543", name: "bigbio/smpdb", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/smpdb", description: "Small molecule pathway database text mining" },
  { id: "hf-544", name: "bigbio/biology_how_why_corpus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/biology_how_why_corpus", description: "Biology causal question-answer corpus" },
  { id: "hf-545", name: "bigbio/mlee", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mlee", description: "Multi-level event extraction biomedical" },
  { id: "hf-546", name: "bigbio/pubtator_central", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/pubtator_central", description: "PubTator Central biomedical concept annotation" },
  { id: "hf-547", name: "bigbio/blurb", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/blurb", description: "Biomedical language understanding benchmark" },
  { id: "hf-548", name: "bigbio/cpi", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cpi", description: "Compound-protein interaction extraction" },
  { id: "hf-549", name: "bigbio/bionlp_shared_task_2009", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2009", description: "BioNLP 2009 GENIA event extraction shared task" },
  { id: "hf-550", name: "bigbio/tmchem", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/tmchem", description: "TmChem chemical compound recognition" },
  { id: "hf-551", name: "Open-Orca/FLAN", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Open-Orca/FLAN", description: "FLAN collection for multi-task instruction tuning" },
  { id: "hf-552", name: "allenai/c4", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/c4", description: "Colossal Clean Crawled Corpus for pre-training" },
  { id: "hf-553", name: "oscar-corpus/OSCAR-2301", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/oscar-corpus/OSCAR-2301", description: "OSCAR multilingual web corpus" },
  { id: "hf-554", name: "HuggingFaceFW/fineweb-edu", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceFW/fineweb-edu", description: "FineWeb-Edu educational text filtered corpus" },
  { id: "hf-555", name: "wikipedia", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/wikipedia", description: "Wikipedia full text for knowledge pre-training" },
  { id: "hf-556", name: "bookcorpus", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/bookcorpus", description: "BookCorpus for long-form text understanding" },
  { id: "hf-557", name: "openwebtext", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/openwebtext", description: "OpenWebText Reddit-filtered web text" },
  { id: "hf-558", name: "mc4", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/mc4", description: "Multilingual C4 web corpus 100+ languages" },
  { id: "hf-559", name: "bigscience/roots_en_wikipedia", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/bigscience/roots_en_wikipedia", description: "ROOTS English Wikipedia for pre-training" },
  { id: "hf-560", name: "togethercomputer/RedPajama-Data-1T", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/togethercomputer/RedPajama-Data-1T", description: "RedPajama 1.2T token open pre-training set" },
  { id: "hf-561", name: "math_dataset", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/math_dataset", description: "DeepMind math dataset for reasoning transfer" },
  { id: "hf-562", name: "competition_math", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/hendrycks/competition_math", description: "Competition math for advanced reasoning" },
  { id: "hf-563", name: "lighteval/mmlu", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/lighteval/mmlu", description: "MMLU benchmark with medical subcategories" },
  { id: "hf-564", name: "lukaemon/bbh", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/lukaemon/bbh", description: "BIG-Bench Hard reasoning benchmark" },
  { id: "hf-565", name: "openai/humaneval", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/openai/openai_humaneval", description: "HumanEval code generation benchmark" },
  { id: "hf-566", name: "nuprl/MultiPL-E", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/nuprl/MultiPL-E", description: "Multi-programming language evaluation" },
  { id: "hf-567", name: "mbpp", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/google-research-datasets/mbpp", description: "Mostly Basic Python Problems for code eval" },
  { id: "hf-568", name: "deepmind/code_contests", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/deepmind/code_contests", description: "Competitive programming problems dataset" },
  { id: "hf-569", name: "sahil2801/CodeAlpaca-20k", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/sahil2801/CodeAlpaca-20k", description: "Code instruction tuning dataset" },
  { id: "hf-570", name: "iamtarun/python_code_instructions_18k_alpaca", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/iamtarun/python_code_instructions_18k_alpaca", description: "Python code instruction-following data" },
  { id: "hf-571", name: "Amod/mental_health_counseling_conversations", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/Amod/mental_health_counseling_conversations", description: "Mental health counseling conversation dataset" },
  { id: "hf-572", name: "medical_dialog", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medical_dialog", description: "Medical dialogue English and Chinese" },
  { id: "hf-573", name: "zhengyun21/PMC-Patients", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/zhengyun21/PMC-Patients", description: "Patient summaries extracted from PubMed Central" },
  { id: "hf-574", name: "epfl-llm/guidelines", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/epfl-llm/guidelines", description: "Clinical practice guidelines for medical training" },
  { id: "hf-575", name: "UFNLP/MedS-Ins", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/UFNLP/MedS-Ins", description: "Medical instruction following dataset 58 tasks" },
  { id: "hf-576", name: "wangrongsheng/GenMedGPT-5k", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/wangrongsheng/GenMedGPT-5k", description: "Generated medical GPT training conversations" },
  { id: "hf-577", name: "FreedomIntelligence/ShareGPT-Medical", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/FreedomIntelligence/ShareGPT-Medical", description: "ShareGPT medical conversation data" },
  { id: "hf-578", name: "Flmc/DISC-Med-SFT", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/Flmc/DISC-Med-SFT", description: "DISC-MedLLM SFT dataset Chinese medical" },
  { id: "hf-579", name: "shibing624/medical", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/shibing624/medical", description: "Chinese medical NLP dataset collection" },
  { id: "hf-580", name: "liwu/MNBVC", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/liwu/MNBVC", description: "Massive Chinese text corpus for pre-training" },
  { id: "gh-581", name: "THUDM/GLM-130B", source: "github", category: "general-llm", url: "https://github.com/THUDM/GLM-130B", description: "GLM-130B open bilingual pre-trained model" },
  { id: "gh-582", name: "openlm-research/open_llama", source: "github", category: "general-llm", url: "https://github.com/openlm-research/open_llama", description: "OpenLLaMA permissive open-source LLaMA" },
  { id: "gh-583", name: "mosaicml/llm-foundry", source: "github", category: "training-tools", url: "https://github.com/mosaicml/llm-foundry", description: "MosaicML LLM training and fine-tuning foundry" },
  { id: "gh-584", name: "mosaicml/composer", source: "github", category: "training-tools", url: "https://github.com/mosaicml/composer", description: "Composer efficient neural network training library" },
  { id: "gh-585", name: "microsoft/LoRA", source: "github", category: "training-tools", url: "https://github.com/microsoft/LoRA", description: "Low-Rank Adaptation of large language models" },
  { id: "gh-586", name: "alpa-projects/alpa", source: "github", category: "training-tools", url: "https://github.com/alpa-projects/alpa", description: "Alpa automated model-parallel deep learning" },
  { id: "gh-587", name: "hpcaitech/ColossalAI", source: "github", category: "training-tools", url: "https://github.com/hpcaitech/ColossalAI", description: "Colossal-AI large-scale parallel training" },
  { id: "gh-588", name: "facebookresearch/metaseq", source: "github", category: "training-tools", url: "https://github.com/facebookresearch/metaseq", description: "MetaSeq large-scale sequence modeling toolkit" },
  { id: "gh-589", name: "kingoflolz/mesh-transformer-jax", source: "github", category: "training-tools", url: "https://github.com/kingoflolz/mesh-transformer-jax", description: "Mesh Transformer JAX model-parallel training" },
  { id: "gh-590", name: "google/jax", source: "github", category: "training-tools", url: "https://github.com/google/jax", description: "JAX high-performance numerical computing" },
  { id: "gh-591", name: "google/flax", source: "github", category: "training-tools", url: "https://github.com/google/flax", description: "Flax neural network library for JAX" },
  { id: "gh-592", name: "google-deepmind/optax", source: "github", category: "training-tools", url: "https://github.com/google-deepmind/optax", description: "Optax gradient processing and optimization" },
  { id: "gh-593", name: "NVIDIA/apex", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/apex", description: "NVIDIA Apex mixed precision training tools" },
  { id: "gh-594", name: "NVIDIA/TransformerEngine", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/TransformerEngine", description: "Transformer Engine for FP8 mixed precision" },
  { id: "gh-595", name: "intel/intel-extension-for-pytorch", source: "github", category: "training-tools", url: "https://github.com/intel/intel-extension-for-pytorch", description: "Intel PyTorch extension for CPU optimization" },
  { id: "gh-596", name: "microsoft/SynapseML", source: "github", category: "training-tools", url: "https://github.com/microsoft/SynapseML", description: "SynapseML distributed ML on Spark" },
  { id: "gh-597", name: "dask/dask", source: "github", category: "training-tools", url: "https://github.com/dask/dask", description: "Dask parallel computing for large datasets" },
  { id: "gh-598", name: "vaexio/vaex", source: "github", category: "training-tools", url: "https://github.com/vaexio/vaex", description: "Vaex out-of-core dataframes for big medical data" },
  { id: "gh-599", name: "modin-project/modin", source: "github", category: "training-tools", url: "https://github.com/modin-project/modin", description: "Modin parallel pandas for clinical data" },
  { id: "gh-600", name: "rapidsai/cudf", source: "github", category: "training-tools", url: "https://github.com/rapidsai/cudf", description: "RAPIDS cuDF GPU accelerated dataframes" },
  { id: "hf-601", name: "nlptown/bert-base-multilingual-uncased-sentiment", source: "huggingface", category: "general-llm", url: "https://huggingface.co/nlptown/bert-base-multilingual-uncased-sentiment", description: "Multilingual sentiment for patient feedback" },
  { id: "hf-602", name: "cardiffnlp/twitter-roberta-base-sentiment-latest", source: "huggingface", category: "general-llm", url: "https://huggingface.co/cardiffnlp/twitter-roberta-base-sentiment-latest", description: "Twitter sentiment for social media health monitoring" },
  { id: "hf-603", name: "finiteautomata/bertweet-base-sentiment-analysis", source: "huggingface", category: "general-llm", url: "https://huggingface.co/finiteautomata/bertweet-base-sentiment-analysis", description: "BERTweet for healthcare social media sentiment" },
  { id: "hf-604", name: "j-hartmann/emotion-english-distilroberta-base", source: "huggingface", category: "general-llm", url: "https://huggingface.co/j-hartmann/emotion-english-distilroberta-base", description: "Emotion classification for patient communication" },
  { id: "hf-605", name: "SamLowe/roberta-base-go_emotions", source: "huggingface", category: "general-llm", url: "https://huggingface.co/SamLowe/roberta-base-go_emotions", description: "GoEmotions multi-label for patient sentiment" },
  { id: "hf-606", name: "facebook/bart-large-mnli", source: "huggingface", category: "general-llm", url: "https://huggingface.co/facebook/bart-large-mnli", description: "BART zero-shot classification for medical triage" },
  { id: "hf-607", name: "valhalla/distilbart-mnli-12-3", source: "huggingface", category: "general-llm", url: "https://huggingface.co/valhalla/distilbart-mnli-12-3", description: "Distilled BART for fast medical classification" },
  { id: "hf-608", name: "facebook/bart-large-cnn", source: "huggingface", category: "general-llm", url: "https://huggingface.co/facebook/bart-large-cnn", description: "BART for clinical note summarization" },
  { id: "hf-609", name: "google/pegasus-xsum", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/pegasus-xsum", description: "PEGASUS for abstractive medical summarization" },
  { id: "hf-610", name: "Falconsai/text_summarization", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Falconsai/text_summarization", description: "Text summarization for medical literature" },
  { id: "hf-611", name: "pszemraj/led-large-book-summary", source: "huggingface", category: "general-llm", url: "https://huggingface.co/pszemraj/led-large-book-summary", description: "LED for long document medical case summarization" },
  { id: "hf-612", name: "dslim/bert-base-NER", source: "huggingface", category: "general-llm", url: "https://huggingface.co/dslim/bert-base-NER", description: "BERT NER for general entity extraction" },
  { id: "hf-613", name: "Jean-Baptiste/camembert-ner", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Jean-Baptiste/camembert-ner", description: "French NER for francophone medical text" },
  { id: "hf-614", name: "d4data/biomedical-ner-all", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/d4data/biomedical-ner-all", description: "Biomedical NER trained on 20+ medical NER datasets" },
  { id: "hf-615", name: "samrawal/bert-base-uncased-clinicalner", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/samrawal/bert-base-uncased-clinicalner", description: "BERT fine-tuned for clinical NER" },
  { id: "hf-616", name: "blaze999/Medical-NER", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/blaze999/Medical-NER", description: "Medical NER for drug disease symptom extraction" },
  { id: "hf-617", name: "ukkendane/bert-clinical-ner", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/ukkendane/bert-clinical-ner", description: "BERT for clinical concept NER in EHR" },
  { id: "hf-618", name: "medical_questions_pairs", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medical_questions_pairs", description: "Medical question deduplication pairs" },
  { id: "hf-619", name: "maharshipandya/spotify-tracks-dataset", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset", description: "Audio feature analysis for voice quality metrics" },
  { id: "hf-620", name: "speech_commands", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/speech_commands", description: "Google Speech Commands for voice agent triggers" },
  { id: "hf-621", name: "superb", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/superb", description: "Speech Understanding Benchmark for voice tasks" },
  { id: "hf-622", name: "librispeech_asr", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/librispeech_asr", description: "LibriSpeech ASR corpus 960h for voice models" },
  { id: "hf-623", name: "peoples_speech", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/MLCommons/peoples_speech", description: "People's Speech 30K hours open ASR data" },
  { id: "hf-624", name: "mozilla-foundation/common_voice_16_1", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/mozilla-foundation/common_voice_16_1", description: "Mozilla Common Voice 16.1 multilingual ASR" },
  { id: "hf-625", name: "google/MusicCaps", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/google/MusicCaps", description: "Audio captioning for acoustic analysis training" },
  { id: "hf-626", name: "speechcolab/gigaspeech", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/speechcolab/gigaspeech", description: "GigaSpeech 10K hours evolving ASR corpus" },
  { id: "hf-627", name: "edinburghcstr/ami", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/edinburghcstr/ami", description: "AMI meeting corpus for multi-speaker recognition" },
  { id: "hf-628", name: "google/xtreme_s", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/google/xtreme_s", description: "XTREME-S multilingual speech benchmark" },
  { id: "hf-629", name: "facebook/multilingual_librispeech", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/facebook/multilingual_librispeech", description: "Multilingual LibriSpeech for cross-lingual speech" },
  { id: "hf-630", name: "suno/bark", source: "huggingface", category: "voice-model", url: "https://huggingface.co/suno/bark", description: "Bark text-to-audio generation model" },
  { id: "hf-631", name: "facebook/mms-1b-all", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/mms-1b-all", description: "Massively Multilingual Speech 1100+ languages" },
  { id: "hf-632", name: "openai/whisper-medium", source: "huggingface", category: "voice-model", url: "https://huggingface.co/openai/whisper-medium", description: "Whisper medium for balanced speed/accuracy" },
  { id: "hf-633", name: "openai/whisper-small", source: "huggingface", category: "voice-model", url: "https://huggingface.co/openai/whisper-small", description: "Whisper small for real-time clinical dictation" },
  { id: "hf-634", name: "facebook/hubert-large-ls960-ft", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/hubert-large-ls960-ft", description: "HuBERT for voice feature extraction" },
  { id: "hf-635", name: "facebook/data2vec-audio-base-960h", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/data2vec-audio-base-960h", description: "Data2Vec audio for speech representation" },
  { id: "hf-636", name: "microsoft/wavlm-large", source: "huggingface", category: "voice-model", url: "https://huggingface.co/microsoft/wavlm-large", description: "WavLM for voice pathology detection" },
  { id: "hf-637", name: "microsoft/unispeech-sat-large", source: "huggingface", category: "voice-model", url: "https://huggingface.co/microsoft/unispeech-sat-large", description: "UniSpeech-SAT for speaker verification" },
  { id: "hf-638", name: "speechbrain/spkrec-ecapa-voxceleb", source: "huggingface", category: "voice-model", url: "https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb", description: "ECAPA-TDNN speaker recognition for patient ID" },
  { id: "hf-639", name: "patrickvonplaten/wavlm-libri-clean-100h-base-plus", source: "huggingface", category: "voice-model", url: "https://huggingface.co/patrickvonplaten/wavlm-libri-clean-100h-base-plus", description: "WavLM for clean speech analysis" },
  { id: "hf-640", name: "facebook/seamless-m4t-v2-large", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/seamless-m4t-v2-large", description: "SeamlessM4T speech translation for multilingual patients" },
  { id: "gh-641", name: "NVIDIA/NeMo-Aligner", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/NeMo-Aligner", description: "NeMo Aligner RLHF and DPO alignment toolkit" },
  { id: "gh-642", name: "facebookresearch/audiocraft", source: "github", category: "voice-model", url: "https://github.com/facebookresearch/audiocraft", description: "AudioCraft audio generation and processing" },
  { id: "gh-643", name: "suno-ai/bark", source: "github", category: "voice-model", url: "https://github.com/suno-ai/bark", description: "Bark text-to-audio generation system" },
  { id: "gh-644", name: "rhasspy/piper", source: "github", category: "voice-model", url: "https://github.com/rhasspy/piper", description: "Piper fast local neural TTS for voice agents" },
  { id: "gh-645", name: "MycroftAI/mimic3", source: "github", category: "voice-model", url: "https://github.com/MycroftAI/mimic3", description: "Mimic 3 privacy-focused TTS for clinical" },
  { id: "gh-646", name: "livekit/agents", source: "github", category: "voice-model", url: "https://github.com/livekit/agents", description: "LiveKit Agents for real-time voice AI" },
  { id: "gh-647", name: "fixie-ai/ultravox", source: "github", category: "voice-model", url: "https://github.com/fixie-ai/ultravox", description: "Ultravox multimodal speech-to-speech model" },
  { id: "gh-648", name: "Vaibhavs10/insanely-fast-whisper", source: "github", category: "voice-model", url: "https://github.com/Vaibhavs10/insanely-fast-whisper", description: "Insanely Fast Whisper optimized inference" },
  { id: "gh-649", name: "collabora/WhisperSpeech", source: "github", category: "voice-model", url: "https://github.com/collabora/WhisperSpeech", description: "WhisperSpeech text-to-speech system" },
  { id: "gh-650", name: "jasonppy/VoiceCraft", source: "github", category: "voice-model", url: "https://github.com/jasonppy/VoiceCraft", description: "VoiceCraft zero-shot speech editing and TTS" },
  { id: "kg-651", name: "kaggle/osic-pulmonary-fibrosis", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/osic-pulmonary-fibrosis-progression", description: "Pulmonary fibrosis progression prediction" },
  { id: "kg-652", name: "kaggle/champs-predicting", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/champs-scalar-coupling", description: "Molecular property prediction challenge" },
  { id: "kg-653", name: "kaggle/ranzcr-clip-2", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/ranzcr-clip-catheter-line-classification", description: "RANZCR CliP catheter assessment X-ray" },
  { id: "kg-654", name: "kaggle/siim-covid19-detection", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/siim-covid19-detection", description: "COVID-19 detection and severity from CXR" },
  { id: "kg-655", name: "kaggle/rsna-miccai-brain-tumor", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/rsna-miccai-brain-tumor-radiogenomic-classification", description: "Brain tumor MGMT classification MRI" },
  { id: "kg-656", name: "kaggle/rsna-pneumonia-detection", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/rsna-pneumonia-detection-challenge", description: "RSNA pneumonia detection from CXR" },
  { id: "kg-657", name: "kaggle/aptos-blindness", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/aptos2019-blindness-detection", description: "APTOS diabetic retinopathy severity grading" },
  { id: "kg-658", name: "kaggle/histopathologic-cancer", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/histopathologic-cancer-detection", description: "Histopathologic cancer metastasis detection" },
  { id: "kg-659", name: "kaggle/human-protein-atlas", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/human-protein-atlas-image-classification", description: "Human Protein Atlas image classification" },
  { id: "kg-660", name: "kaggle/data-science-bowl-2018", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/data-science-bowl-2018", description: "Nuclei segmentation in microscopy images" },
  { id: "kg-661", name: "kaggle/blood-cell-images", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/paultimothymooney/blood-cells", description: "Blood cell image classification dataset" },
  { id: "kg-662", name: "kaggle/alzheimers-dataset", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/tourist55/alzheimers-dataset-4-class-of-images", description: "Alzheimer MRI classification 4 classes" },
  { id: "kg-663", name: "kaggle/brain-tumor-classification", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/sartajbhuvaji/brain-tumor-classification-mri", description: "Brain tumor MRI classification 4 classes" },
  { id: "kg-664", name: "kaggle/skin-cancer-mnist", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/kmader/skin-cancer-mnist-ham10000", description: "HAM10000 skin cancer dermoscopy dataset" },
  { id: "kg-665", name: "kaggle/retinal-oct-images", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/paultimothymooney/kermany2018", description: "Retinal OCT images classification" },
  { id: "kg-666", name: "kaggle/bone-fracture-detection", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/bmadushanirodrigo/fracture-multi-region-x-ray-data", description: "Bone fracture X-ray detection dataset" },
  { id: "kg-667", name: "kaggle/dental-xray", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/pushparajpushp/dental-xray", description: "Dental X-ray panoramic classification" },
  { id: "kg-668", name: "kaggle/ecg-heartbeat", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/shayanfazeli/heartbeat", description: "ECG heartbeat categorization MIT-BIH" },
  { id: "kg-669", name: "kaggle/pima-diabetes", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/uciml/pima-indians-diabetes-database", description: "Pima Indians diabetes classification" },
  { id: "kg-670", name: "kaggle/heart-disease-uci", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/redwankarimsony/heart-disease-data", description: "Heart disease UCI multi-center classification" },
  { id: "fin-671", name: "kaggle/stock-market-dataset", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/jacksoncrow/stock-market-dataset", description: "Stock market historical OHLCV data" },
  { id: "fin-672", name: "kaggle/bitcoin-historical", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/mczielinski/bitcoin-historical-data", description: "Bitcoin historical minute-level price data" },
  { id: "fin-673", name: "kaggle/s&p-500-stock-data", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/camnugent/sandp500", description: "S&P 500 historical stock data" },
  { id: "fin-674", name: "kaggle/forex-exchange-rates", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/thebasss/currency-exchange-rates", description: "Foreign exchange rate historical data" },
  { id: "fin-675", name: "kaggle/financial-news-sentiment", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/ankurzing/sentiment-analysis-for-financial-news", description: "Financial news headline sentiment analysis" },
  { id: "fin-676", name: "kaggle/sec-filings", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/finnhub/reported-financials", description: "SEC financial statement data" },
  { id: "fin-677", name: "kaggle/yahoo-finance-crypto", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/sudalairajkumar/cryptocurrencypricehistory", description: "Cryptocurrency price history all major coins" },
  { id: "fin-678", name: "kaggle/nifty50-stock-data", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/rohanrao/nifty50-stock-market-data", description: "Nifty 50 Indian stock market data" },
  { id: "fin-679", name: "kaggle/loan-default", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/hemanthsai7/loandefault", description: "Loan default prediction tabular data" },
  { id: "fin-680", name: "kaggle/credit-card-fraud", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud", description: "Credit card fraud detection dataset" },
  { id: "fin-681", name: "FinGPT/fingpt-mt", source: "huggingface", category: "finance-model", url: "https://huggingface.co/FinGPT/fingpt-mt", description: "FinGPT multi-task financial model" },
  { id: "fin-682", name: "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis", source: "huggingface", category: "finance-model", url: "https://huggingface.co/mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis", description: "DistilRoBERTa financial news sentiment" },
  { id: "fin-683", name: "nickmuchi/sec-bert-finetuned-finance-classification", source: "huggingface", category: "finance-model", url: "https://huggingface.co/nickmuchi/sec-bert-finetuned-finance-classification", description: "SEC-BERT for financial document classification" },
  { id: "fin-684", name: "yiyanghkust/finbert-esg", source: "huggingface", category: "finance-model", url: "https://huggingface.co/yiyanghkust/finbert-esg", description: "FinBERT-ESG environmental social governance" },
  { id: "fin-685", name: "kensho/spacy-financial", source: "huggingface", category: "finance-model", url: "https://huggingface.co/kensho/spacy-financial", description: "S&P Kensho financial NER model" },
  { id: "fin-686", name: "TheFinAI/flare-cfa", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-cfa", description: "CFA exam question financial benchmark" },
  { id: "fin-687", name: "TheFinAI/flare-edtsum", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-edtsum", description: "EDT financial text summarization" },
  { id: "fin-688", name: "TheFinAI/flare-headlines", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-headlines", description: "Financial headline classification benchmark" },
  { id: "fin-689", name: "TheFinAI/flare-fomc", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-fomc", description: "FOMC hawkish/dovish classification" },
  { id: "fin-690", name: "TheFinAI/flare-convfinqa", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-convfinqa", description: "Conversational financial QA dataset" },
  { id: "gh-691", name: "AI4Finance-Foundation/FinRL-Meta", source: "github", category: "finance-tools", url: "https://github.com/AI4Finance-Foundation/FinRL-Meta", description: "FinRL-Meta data-centric RL framework" },
  { id: "gh-692", name: "AI4Finance-Foundation/FinRL-Trading", source: "github", category: "finance-tools", url: "https://github.com/AI4Finance-Foundation/FinRL-Trading", description: "FinRL trading strategy optimization" },
  { id: "gh-693", name: "hudson-and-thames/mlfinlab", source: "github", category: "finance-tools", url: "https://github.com/hudson-and-thames/mlfinlab", description: "MLFinLab implementations of financial ML" },
  { id: "gh-694", name: "polakowo/vectorbt", source: "github", category: "finance-tools", url: "https://github.com/polakowo/vectorbt", description: "VectorBT vectorized backtesting framework" },
  { id: "gh-695", name: "mhallsmoore/qstrader", source: "github", category: "finance-tools", url: "https://github.com/mhallsmoore/qstrader", description: "QSTrader event-driven quantitative trading" },
  { id: "gh-696", name: "quantopian/zipline", source: "github", category: "finance-tools", url: "https://github.com/quantopian/zipline", description: "Zipline algorithmic trading library" },
  { id: "gh-697", name: "enigmampc/catalyst", source: "github", category: "finance-tools", url: "https://github.com/enigmampc/catalyst", description: "Catalyst algorithmic trading for crypto" },
  { id: "gh-698", name: "gbeced/pyalgotrade", source: "github", category: "finance-tools", url: "https://github.com/gbeced/pyalgotrade", description: "PyAlgoTrade event-driven backtesting" },
  { id: "gh-699", name: "quantconnect/Lean", source: "github", category: "finance-tools", url: "https://github.com/QuantConnect/Lean", description: "LEAN algorithmic trading engine" },
  { id: "gh-700", name: "freqtrade/freqtrade", source: "github", category: "finance-tools", url: "https://github.com/freqtrade/freqtrade", description: "Freqtrade crypto trading bot framework" },
  { id: "hf-701", name: "Undi95/Toppy-M-7B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Undi95/Toppy-M-7B", description: "Toppy-M merged model for diverse tasks" },
  { id: "hf-702", name: "berkeley-nest/Starling-LM-7B-alpha", source: "huggingface", category: "general-llm", url: "https://huggingface.co/berkeley-nest/Starling-LM-7B-alpha", description: "Starling alpha RLHF preference-tuned" },
  { id: "hf-703", name: "openchat/openchat-3.5-0106", source: "huggingface", category: "general-llm", url: "https://huggingface.co/openchat/openchat-3.5-0106", description: "OpenChat 3.5 C-RLFT instruction model" },
  { id: "hf-704", name: "NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO", description: "Hermes 2 Mixtral MoE DPO alignment" },
  { id: "hf-705", name: "DiscoResearch/DiscoLM-mixtral-8x7b-v2", source: "huggingface", category: "general-llm", url: "https://huggingface.co/DiscoResearch/DiscoLM-mixtral-8x7b-v2", description: "DiscoLM Mixtral for versatile instruction following" },
  { id: "hf-706", name: "argilla/notus-7b-v1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/argilla/notus-7b-v1", description: "Notus DPO-tuned Zephyr variant" },
  { id: "hf-707", name: "HuggingFaceH4/zephyr-7b-beta", source: "huggingface", category: "general-llm", url: "https://huggingface.co/HuggingFaceH4/zephyr-7b-beta", description: "Zephyr 7B DPO aligned for helpful responses" },
  { id: "hf-708", name: "teknium/CollectiveCognition-v1.1-Mistral-7B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/teknium/CollectiveCognition-v1.1-Mistral-7B", description: "Collective Cognition crowdsourced training" },
  { id: "hf-709", name: "garage-bAInd/Platypus2-70B-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/garage-bAInd/Platypus2-70B-instruct", description: "Platypus2 STEM and logic reasoning model" },
  { id: "hf-710", name: "WizardLM/WizardMath-7B-V1.1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/WizardLM/WizardMath-7B-V1.1", description: "WizardMath for mathematical clinical reasoning" },
  { id: "gh-711", name: "sgl-project/sglang", source: "github", category: "training-tools", url: "https://github.com/sgl-project/sglang", description: "SGLang structured generation language for LLMs" },
  { id: "gh-712", name: "databricks/dbrx", source: "github", category: "general-llm", url: "https://github.com/databricks/dbrx", description: "DBRX open MoE large language model" },
  { id: "gh-713", name: "xai-org/grok-1", source: "github", category: "general-llm", url: "https://github.com/xai-org/grok-1", description: "Grok-1 314B parameter MoE model weights" },
  { id: "gh-714", name: "mistralai/mistral-src", source: "github", category: "general-llm", url: "https://github.com/mistralai/mistral-src", description: "Mistral AI reference implementation" },
  { id: "gh-715", name: "google-deepmind/gemma", source: "github", category: "general-llm", url: "https://github.com/google-deepmind/gemma", description: "Gemma lightweight open model from Google" },
  { id: "gh-716", name: "apple/ml-ferret", source: "github", category: "vision", url: "https://github.com/apple/ml-ferret", description: "Ferret multimodal model from Apple" },
  { id: "gh-717", name: "OpenGVLab/InternVL", source: "github", category: "vision", url: "https://github.com/OpenGVLab/InternVL", description: "InternVL open multimodal vision-language model" },
  { id: "gh-718", name: "THUDM/CogVLM2", source: "github", category: "vision", url: "https://github.com/THUDM/CogVLM2", description: "CogVLM2 improved visual language model" },
  { id: "gh-719", name: "X-PLUG/mPLUG-Owl", source: "github", category: "vision", url: "https://github.com/X-PLUG/mPLUG-Owl", description: "mPLUG-Owl modularized multimodal LLM" },
  { id: "gh-720", name: "NVlabs/VILA", source: "github", category: "vision", url: "https://github.com/NVlabs/VILA", description: "VILA visual language model from NVIDIA" },
  { id: "gh-721", name: "Emu2/Emu", source: "github", category: "vision", url: "https://github.com/baaivision/Emu", description: "Emu multimodal generative model" },
  { id: "gh-722", name: "deepseek-ai/DeepSeek-VL", source: "github", category: "vision", url: "https://github.com/deepseek-ai/DeepSeek-VL", description: "DeepSeek-VL vision-language understanding model" },
  { id: "gh-723", name: "open-compass/opencompass", source: "github", category: "training-tools", url: "https://github.com/open-compass/opencompass", description: "OpenCompass LLM evaluation platform" },
  { id: "gh-724", name: "huggingface/lighteval", source: "github", category: "training-tools", url: "https://github.com/huggingface/lighteval", description: "LightEval lightweight LLM evaluation" },
  { id: "gh-725", name: "confident-ai/deepeval", source: "github", category: "training-tools", url: "https://github.com/confident-ai/deepeval", description: "DeepEval LLM evaluation framework" },
  { id: "gh-726", name: "langfuse/langfuse", source: "github", category: "training-tools", url: "https://github.com/langfuse/langfuse", description: "Langfuse LLM observability and analytics" },
  { id: "gh-727", name: "traceloop/openllmetry", source: "github", category: "training-tools", url: "https://github.com/traceloop/openllmetry", description: "OpenLLMetry open-source LLM observability" },
  { id: "gh-728", name: "Arize-ai/phoenix", source: "github", category: "training-tools", url: "https://github.com/Arize-ai/phoenix", description: "Arize Phoenix AI observability and evaluation" },
  { id: "gh-729", name: "promptfoo/promptfoo", source: "github", category: "training-tools", url: "https://github.com/promptfoo/promptfoo", description: "Promptfoo LLM output testing and evaluation" },
  { id: "gh-730", name: "brainlid/langchain_demo", source: "github", category: "rag-tools", url: "https://github.com/hwchase17/langchain", description: "LangChain framework main repository" },
  { id: "gh-731", name: "run-llama/rags", source: "github", category: "rag-tools", url: "https://github.com/run-llama/rags", description: "RAGs Streamlit chatbot with LlamaIndex" },
  { id: "gh-732", name: "infiniflow/ragflow", source: "github", category: "rag-tools", url: "https://github.com/infiniflow/ragflow", description: "RAGFlow deep document understanding RAG engine" },
  { id: "gh-733", name: "vanna-ai/vanna", source: "github", category: "rag-tools", url: "https://github.com/vanna-ai/vanna", description: "Vanna AI SQL generation from natural language" },
  { id: "gh-734", name: "embedchain/embedchain", source: "github", category: "rag-tools", url: "https://github.com/mem0ai/mem0", description: "Mem0 RAG data pipeline framework" },
  { id: "gh-735", name: "Unstructured-IO/unstructured", source: "github", category: "rag-tools", url: "https://github.com/Unstructured-IO/unstructured", description: "Unstructured document parsing for RAG pipelines" },
  { id: "gh-736", name: "pgvector/pgvector", source: "github", category: "rag-tools", url: "https://github.com/pgvector/pgvector", description: "pgvector PostgreSQL vector similarity search" },
  { id: "gh-737", name: "neuml/txtai", source: "github", category: "rag-tools", url: "https://github.com/neuml/txtai", description: "txtai AI-powered semantic search and workflows" },
  { id: "gh-738", name: "zilliztech/GPTCache", source: "github", category: "rag-tools", url: "https://github.com/zilliztech/GPTCache", description: "GPTCache semantic cache for LLM queries" },
  { id: "gh-739", name: "StanGirard/quivr", source: "github", category: "rag-tools", url: "https://github.com/QuivrHQ/quivr", description: "Quivr second brain with generative AI" },
  { id: "gh-740", name: "microsoft/graphrag", source: "github", category: "rag-tools", url: "https://github.com/microsoft/graphrag", description: "Microsoft GraphRAG knowledge graph RAG" },
  { id: "hf-741", name: "Yirany/UniEntrezGene", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/Yirany/UniEntrezGene", description: "Unified gene entity linking dataset" },
  { id: "hf-742", name: "bigbio/genetag_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/genetag", description: "Updated gene/protein tagging corpus" },
  { id: "hf-743", name: "bigbio/chebi", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/chebi_nactem", description: "ChEBI chemical entity normalization" },
  { id: "hf-744", name: "bigbio/pdr_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/pdr", description: "Physician Desk Reference v2 drug data" },
  { id: "hf-745", name: "bigbio/euadr_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/euadr", description: "EU-ADR drug safety relation mining" },
  { id: "hf-746", name: "MedRAG/textbooks", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/MedRAG/textbooks", description: "Medical textbook passages for RAG retrieval" },
  { id: "hf-747", name: "MedRAG/pubmed", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/MedRAG/pubmed", description: "MedRAG PubMed passages for retrieval" },
  { id: "hf-748", name: "MedRAG/statpearls", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/MedRAG/statpearls", description: "StatPearls medical reference for RAG" },
  { id: "hf-749", name: "MedRAG/wikipedia", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/MedRAG/wikipedia", description: "Medical Wikipedia articles for retrieval" },
  { id: "hf-750", name: "chaoyi-wu/PMC-15M", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/chaoyi-wu/PMC-15M", description: "15M biomedical image-caption pairs from PMC" },
  { id: "hf-751", name: "BAAI/CogAgent", source: "huggingface", category: "vision", url: "https://huggingface.co/THUDM/cogagent-chat-hf", description: "CogAgent GUI-oriented vision language model" },
  { id: "hf-752", name: "llava-hf/llava-1.5-7b-hf", source: "huggingface", category: "vision", url: "https://huggingface.co/llava-hf/llava-1.5-7b-hf", description: "LLaVA 1.5 7B for visual question answering" },
  { id: "hf-753", name: "Qwen/Qwen-VL-Chat", source: "huggingface", category: "vision", url: "https://huggingface.co/Qwen/Qwen-VL-Chat", description: "Qwen-VL visual language chat model" },
  { id: "hf-754", name: "openbmb/MiniCPM-V-2_6", source: "huggingface", category: "vision", url: "https://huggingface.co/openbmb/MiniCPM-V-2_6", description: "MiniCPM-V efficient multimodal model" },
  { id: "hf-755", name: "microsoft/Florence-2-large", source: "huggingface", category: "vision", url: "https://huggingface.co/microsoft/Florence-2-large", description: "Florence-2 universal visual representation" },
  { id: "hf-756", name: "google/siglip-so400m-patch14-384", source: "huggingface", category: "vision", url: "https://huggingface.co/google/siglip-so400m-patch14-384", description: "SigLIP image-text matching for medical retrieval" },
  { id: "hf-757", name: "openai/clip-vit-large-patch14", source: "huggingface", category: "vision", url: "https://huggingface.co/openai/clip-vit-large-patch14", description: "CLIP for medical image-text alignment" },
  { id: "hf-758", name: "EVA-CLIP/EVA02-CLIP-bigE-14", source: "huggingface", category: "vision", url: "https://huggingface.co/QuanSun/EVA-CLIP", description: "EVA-CLIP improved vision-language matching" },
  { id: "hf-759", name: "facebook/mask2former-swin-large-cityscapes-semantic", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/mask2former-swin-large-cityscapes-semantic", description: "Mask2Former for semantic segmentation transfer" },
  { id: "hf-760", name: "shi-labs/oneformer_cityscapes_swin_large", source: "huggingface", category: "vision", url: "https://huggingface.co/shi-labs/oneformer_cityscapes_swin_large", description: "OneFormer universal image segmentation" },
  { id: "gh-761", name: "roboflow/supervision", source: "github", category: "vision", url: "https://github.com/roboflow/supervision", description: "Supervision computer vision toolkit and utilities" },
  { id: "gh-762", name: "open-mmlab/mmdetection", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmdetection", description: "MMDetection object detection toolbox" },
  { id: "gh-763", name: "open-mmlab/mmpose", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmpose", description: "MMPose for anatomical landmark detection" },
  { id: "gh-764", name: "open-mmlab/mmaction2", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmaction2", description: "MMAction2 video understanding for surgical videos" },
  { id: "gh-765", name: "open-mmlab/mmpretrain", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmpretrain", description: "MMPreTrain pre-training toolbox for vision" },
  { id: "gh-766", name: "PaddlePaddle/PaddleDetection", source: "github", category: "vision", url: "https://github.com/PaddlePaddle/PaddleDetection", description: "PaddleDetection end-to-end detection framework" },
  { id: "gh-767", name: "PaddlePaddle/PaddleSeg", source: "github", category: "vision", url: "https://github.com/PaddlePaddle/PaddleSeg", description: "PaddleSeg image segmentation for medical" },
  { id: "gh-768", name: "PaddlePaddle/PaddleOCR", source: "github", category: "vision", url: "https://github.com/PaddlePaddle/PaddleOCR", description: "PaddleOCR for medical document OCR" },
  { id: "gh-769", name: "openvinotoolkit/openvino", source: "github", category: "training-tools", url: "https://github.com/openvinotoolkit/openvino", description: "OpenVINO inference optimization for deployment" },
  { id: "gh-770", name: "triton-inference-server/server", source: "github", category: "training-tools", url: "https://github.com/triton-inference-server/server", description: "Triton Inference Server for model serving" },
  { id: "gh-771", name: "bentoml/BentoML", source: "github", category: "training-tools", url: "https://github.com/bentoml/BentoML", description: "BentoML model serving framework" },
  { id: "gh-772", name: "seldon-core/seldon-core", source: "github", category: "training-tools", url: "https://github.com/SeldonIO/seldon-core", description: "Seldon Core ML deployment on Kubernetes" },
  { id: "gh-773", name: "kubeflow/kubeflow", source: "github", category: "training-tools", url: "https://github.com/kubeflow/kubeflow", description: "Kubeflow ML toolkit for Kubernetes" },
  { id: "gh-774", name: "zenml-io/zenml", source: "github", category: "training-tools", url: "https://github.com/zenml-io/zenml", description: "ZenML MLOps framework for reproducible pipelines" },
  { id: "gh-775", name: "prefecthq/prefect", source: "github", category: "training-tools", url: "https://github.com/PrefectHQ/prefect", description: "Prefect workflow orchestration for ML pipelines" },
  { id: "gh-776", name: "apache/airflow", source: "github", category: "training-tools", url: "https://github.com/apache/airflow", description: "Airflow workflow automation for data pipelines" },
  { id: "gh-777", name: "dagster-io/dagster", source: "github", category: "training-tools", url: "https://github.com/dagster-io/dagster", description: "Dagster data orchestration platform" },
  { id: "gh-778", name: "determined-ai/determined", source: "github", category: "training-tools", url: "https://github.com/determined-ai/determined", description: "Determined AI deep learning training platform" },
  { id: "gh-779", name: "polyaxon/polyaxon", source: "github", category: "training-tools", url: "https://github.com/polyaxon/polyaxon", description: "Polyaxon ML platform for model lifecycle" },
  { id: "gh-780", name: "neptune-ai/neptune-client", source: "github", category: "training-tools", url: "https://github.com/neptune-ai/neptune-client", description: "Neptune.ai experiment tracking for ML" },
  { id: "gh-781", name: "whylabs/whylogs", source: "github", category: "training-tools", url: "https://github.com/whylabs/whylogs", description: "WhyLogs data logging and monitoring for ML" },
  { id: "gh-782", name: "evidentlyai/evidently", source: "github", category: "training-tools", url: "https://github.com/evidentlyai/evidently", description: "Evidently ML model monitoring and evaluation" },
  { id: "gh-783", name: "SeldonIO/alibi-detect", source: "github", category: "training-tools", url: "https://github.com/SeldonIO/alibi-detect", description: "Alibi Detect outlier drift detection for models" },
  { id: "gh-784", name: "fiddler-labs/fiddler-auditor", source: "github", category: "training-tools", url: "https://github.com/fiddler-labs/fiddler-auditor", description: "Model auditing for bias in medical AI" },
  { id: "hf-785", name: "meta-llama/Llama-3.1-8B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct", description: "Llama 3.1 8B for medical domain fine-tuning" },
  { id: "hf-786", name: "meta-llama/Llama-3.1-70B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct", description: "Llama 3.1 70B for advanced clinical reasoning" },
  { id: "hf-787", name: "mistralai/Mixtral-8x7B-Instruct-v0.1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mistralai/Mixtral-8x7B-Instruct-v0.1", description: "Mixtral MoE for efficient medical inference" },
  { id: "hf-788", name: "mistralai/Mistral-Nemo-Instruct-2407", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407", description: "Mistral Nemo 12B multilingual for global health" },
  { id: "hf-789", name: "Qwen/Qwen2.5-14B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-14B-Instruct", description: "Qwen 2.5 14B for complex medical analysis" },
  { id: "hf-790", name: "Qwen/Qwen2.5-72B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-72B-Instruct", description: "Qwen 2.5 72B largest for research applications" },
  { id: "hf-791", name: "deepseek-ai/DeepSeek-V2-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-V2-Chat", description: "DeepSeek V2 MoE efficient large model" },
  { id: "hf-792", name: "google/gemma-2-27b-it", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-2-27b-it", description: "Gemma 2 27B for robust medical reasoning" },
  { id: "hf-793", name: "01-ai/Yi-1.5-34B-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/01-ai/Yi-1.5-34B-Chat", description: "Yi 1.5 34B bilingual for medical translation" },
  { id: "hf-794", name: "microsoft/Phi-3.5-mini-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/Phi-3.5-mini-instruct", description: "Phi 3.5 mini for mobile medical applications" },
  { id: "hf-795", name: "internlm/internlm2_5-7b-chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/internlm/internlm2_5-7b-chat", description: "InternLM 2.5 for medical tool calling" },
  { id: "hf-796", name: "allenai/OLMo-7B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/allenai/OLMo-7B-Instruct", description: "OLMo fully open LLM for research" },
  { id: "hf-797", name: "Snowflake/snowflake-arctic-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Snowflake/snowflake-arctic-instruct", description: "Snowflake Arctic for enterprise medical analytics" },
  { id: "hf-798", name: "ibm-granite/granite-3.0-8b-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/ibm-granite/granite-3.0-8b-instruct", description: "IBM Granite for enterprise medical applications" },
  { id: "hf-799", name: "Alibaba-NLP/gte-Qwen2-7B-instruct", source: "huggingface", category: "embedding", url: "https://huggingface.co/Alibaba-NLP/gte-Qwen2-7B-instruct", description: "GTE-Qwen2 7B embedding for medical retrieval" },
  { id: "hf-800", name: "dunzhang/stella_en_1.5B_v5", source: "huggingface", category: "embedding", url: "https://huggingface.co/dunzhang/stella_en_1.5B_v5", description: "Stella 1.5B high-quality embedding model" },
  { id: "hf-801", name: "nvidia/NV-Embed-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/nvidia/NV-Embed-v2", description: "NVIDIA NV-Embed MTEB leader for retrieval" },
  { id: "hf-802", name: "intfloat/e5-mistral-7b-instruct", source: "huggingface", category: "embedding", url: "https://huggingface.co/intfloat/e5-mistral-7b-instruct", description: "E5-Mistral 7B instruction embedding model" },
  { id: "hf-803", name: "jinaai/jina-embeddings-v3", source: "huggingface", category: "embedding", url: "https://huggingface.co/jinaai/jina-embeddings-v3", description: "Jina v3 task-specific embedding model" },
  { id: "hf-804", name: "mixedbread-ai/mxbai-embed-large-v1", source: "huggingface", category: "embedding", url: "https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1", description: "MixedBread large embedding for search" },
  { id: "hf-805", name: "BAAI/bge-m3", source: "huggingface", category: "embedding", url: "https://huggingface.co/BAAI/bge-m3", description: "BGE-M3 multi-function multilingual embedding" },
  { id: "hf-806", name: "thenlper/gte-large", source: "huggingface", category: "embedding", url: "https://huggingface.co/thenlper/gte-large", description: "GTE large general text embedding" },
  { id: "hf-807", name: "voyageai/voyage-large-2-instruct", source: "huggingface", category: "embedding", url: "https://huggingface.co/voyageai/voyage-large-2-instruct", description: "Voyage large embedding for code and text" },
  { id: "hf-808", name: "sentence-transformers/all-mpnet-base-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/all-mpnet-base-v2", description: "MPNet-based sentence embedding baseline" },
  { id: "hf-809", name: "sentence-transformers/multi-qa-mpnet-base-dot-v1", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/multi-qa-mpnet-base-dot-v1", description: "Multi-QA embedding for medical question search" },
  { id: "hf-810", name: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", description: "Multilingual paraphrase detection for dedup" },
  { id: "gh-811", name: "crewAIInc/crewAI-tools", source: "github", category: "agent-tools", url: "https://github.com/crewAIInc/crewAI-tools", description: "CrewAI tools for agent capabilities" },
  { id: "gh-812", name: "microsoft/semantic-kernel", source: "github", category: "agent-tools", url: "https://github.com/microsoft/semantic-kernel", description: "Semantic Kernel AI orchestration SDK" },
  { id: "gh-813", name: "run-llama/llama-agents", source: "github", category: "agent-tools", url: "https://github.com/run-llama/llama-agents", description: "LlamaIndex agent framework for multi-agent" },
  { id: "gh-814", name: "anthropics/anthropic-cookbook", source: "github", category: "agent-tools", url: "https://github.com/anthropics/anthropic-cookbook", description: "Anthropic agent patterns and examples" },
  { id: "gh-815", name: "openai/swarm", source: "github", category: "agent-tools", url: "https://github.com/openai/swarm", description: "OpenAI Swarm multi-agent orchestration" },
  { id: "gh-816", name: "langchain-ai/langgraph", source: "github", category: "agent-tools", url: "https://github.com/langchain-ai/langgraph", description: "LangGraph stateful multi-actor agent graphs" },
  { id: "gh-817", name: "BerriAI/litellm-proxy", source: "github", category: "agent-tools", url: "https://github.com/BerriAI/litellm", description: "LiteLLM proxy for unified LLM gateway" },
  { id: "gh-818", name: "vercel/ai", source: "github", category: "agent-tools", url: "https://github.com/vercel/ai", description: "Vercel AI SDK for building AI applications" },
  { id: "gh-819", name: "supabase/supabase", source: "github", category: "agent-tools", url: "https://github.com/supabase/supabase", description: "Supabase open-source Firebase alternative with pgvector" },
  { id: "gh-820", name: "pydantic/pydantic-ai", source: "github", category: "agent-tools", url: "https://github.com/pydantic/pydantic-ai", description: "Pydantic AI type-safe agent framework" },
  { id: "gh-821", name: "instructor-ai/instructor", source: "github", category: "agent-tools", url: "https://github.com/jxnl/instructor", description: "Instructor structured outputs from LLMs" },
  { id: "gh-822", name: "marvin-ai/marvin", source: "github", category: "agent-tools", url: "https://github.com/PrefectHQ/marvin", description: "Marvin AI engineering framework" },
  { id: "gh-823", name: "modelscope/agentscope", source: "github", category: "agent-tools", url: "https://github.com/modelscope/agentscope", description: "AgentScope flexible multi-agent platform" },
  { id: "gh-824", name: "camel-ai/camel", source: "github", category: "agent-tools", url: "https://github.com/camel-ai/camel", description: "CAMEL communicative agents for AI society" },
  { id: "gh-825", name: "assafelovic/gpt-researcher", source: "github", category: "agent-tools", url: "https://github.com/assafelovic/gpt-researcher", description: "GPT Researcher autonomous medical research agent" },
  { id: "hf-826", name: "microsoft/Phi-3-vision-128k-instruct", source: "huggingface", category: "vision", url: "https://huggingface.co/microsoft/Phi-3-vision-128k-instruct", description: "Phi-3 Vision for efficient medical image analysis" },
  { id: "hf-827", name: "HuggingFaceM4/idefics2-8b", source: "huggingface", category: "vision", url: "https://huggingface.co/HuggingFaceM4/idefics2-8b", description: "IDEFICS2 open multimodal for medical VQA" },
  { id: "hf-828", name: "internlm/internlm-xcomposer2-vl-7b", source: "huggingface", category: "vision", url: "https://huggingface.co/internlm/internlm-xcomposer2-vl-7b", description: "InternLM-XComposer2 vision-language model" },
  { id: "hf-829", name: "TIGER-Lab/Mantis-8B-siglip-llama3", source: "huggingface", category: "vision", url: "https://huggingface.co/TIGER-Lab/Mantis-8B-siglip-llama3", description: "Mantis multi-image interleaved model" },
  { id: "hf-830", name: "allenai/Molmo-7B-D-0924", source: "huggingface", category: "vision", url: "https://huggingface.co/allenai/Molmo-7B-D-0924", description: "Molmo open multimodal from Allen AI" },
  { id: "hf-831", name: "vikhyatk/moondream2", source: "huggingface", category: "vision", url: "https://huggingface.co/vikhyatk/moondream2", description: "Moondream2 tiny vision language model" },
  { id: "hf-832", name: "liuhaotian/llava-v1.5-13b", source: "huggingface", category: "vision", url: "https://huggingface.co/liuhaotian/llava-v1.5-13b", description: "LLaVA 1.5 13B improved visual reasoning" },
  { id: "hf-833", name: "adept/fuyu-8b", source: "huggingface", category: "vision", url: "https://huggingface.co/adept/fuyu-8b", description: "Fuyu-8B multimodal model native resolution" },
  { id: "hf-834", name: "Salesforce/blip2-opt-2.7b", source: "huggingface", category: "vision", url: "https://huggingface.co/Salesforce/blip2-opt-2.7b", description: "BLIP-2 vision-language pre-training" },
  { id: "hf-835", name: "google/pix2struct-base", source: "huggingface", category: "vision", url: "https://huggingface.co/google/pix2struct-base", description: "Pix2Struct for medical chart understanding" },
  { id: "gh-836", name: "huggingface/diffusers", source: "github", category: "vision", url: "https://github.com/huggingface/diffusers", description: "Diffusers library for image generation" },
  { id: "gh-837", name: "Stability-AI/stablediffusion", source: "github", category: "vision", url: "https://github.com/Stability-AI/stablediffusion", description: "Stable Diffusion for synthetic medical data" },
  { id: "gh-838", name: "comfyanonymous/ComfyUI", source: "github", category: "vision", url: "https://github.com/comfyanonymous/ComfyUI", description: "ComfyUI node-based image generation pipeline" },
  { id: "gh-839", name: "AUTOMATIC1111/stable-diffusion-webui", source: "github", category: "vision", url: "https://github.com/AUTOMATIC1111/stable-diffusion-webui", description: "SD WebUI for medical image augmentation" },
  { id: "gh-840", name: "invoke-ai/InvokeAI", source: "github", category: "vision", url: "https://github.com/invoke-ai/InvokeAI", description: "InvokeAI professional image generation toolkit" },
  { id: "hf-841", name: "medicalai/ClinicalT5-large", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/luqh/ClinicalT5-large", description: "Clinical T5 large for medical text generation" },
  { id: "hf-842", name: "razent/SciFive-large-Pubmed_PMC", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/razent/SciFive-large-Pubmed_PMC", description: "SciFive T5 for biomedical text generation" },
  { id: "hf-843", name: "google/flan-t5-large", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/flan-t5-large", description: "Flan-T5 large for instruction-following medical QA" },
  { id: "hf-844", name: "google/flan-t5-xl", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/flan-t5-xl", description: "Flan-T5 XL for complex medical summarization" },
  { id: "hf-845", name: "google/mt5-large", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/mt5-large", description: "mT5 multilingual for global health applications" },
  { id: "hf-846", name: "Voicelab/trurl-2-13b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Voicelab/trurl-2-13b", description: "Trurl Polish/European medical model" },
  { id: "hf-847", name: "Qwen/Qwen2.5-Coder-7B-Instruct", source: "huggingface", category: "code-model", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct", description: "Qwen 2.5 Coder for medical informatics" },
  { id: "hf-848", name: "deepseek-ai/deepseek-coder-33b-instruct", source: "huggingface", category: "code-model", url: "https://huggingface.co/deepseek-ai/deepseek-coder-33b-instruct", description: "DeepSeek Coder 33B for complex medical systems" },
  { id: "hf-849", name: "codellama/CodeLlama-34b-Instruct-hf", source: "huggingface", category: "code-model", url: "https://huggingface.co/codellama/CodeLlama-34b-Instruct-hf", description: "CodeLlama 34B for advanced bioinformatics" },
  { id: "hf-850", name: "replit/replit-code-v1_5-3b", source: "huggingface", category: "code-model", url: "https://huggingface.co/replit/replit-code-v1_5-3b", description: "Replit Code for rapid prototyping" },
  { id: "gh-851", name: "aigc-apps/EasyAnimate", source: "github", category: "vision", url: "https://github.com/aigc-apps/EasyAnimate", description: "EasyAnimate for medical educational animations" },
  { id: "gh-852", name: "hpcaitech/Open-Sora", source: "github", category: "vision", url: "https://github.com/hpcaitech/Open-Sora", description: "Open-Sora video generation for medical education" },
  { id: "gh-853", name: "PKU-YuanGroup/Open-Sora-Plan", source: "github", category: "vision", url: "https://github.com/PKU-YuanGroup/Open-Sora-Plan", description: "Open-Sora-Plan video generation model" },
  { id: "gh-854", name: "modelscope/DiffSynth-Studio", source: "github", category: "vision", url: "https://github.com/modelscope/DiffSynth-Studio", description: "DiffSynth for diffusion-based image synthesis" },
  { id: "gh-855", name: "lllyasviel/Fooocus", source: "github", category: "vision", url: "https://github.com/lllyasviel/Fooocus", description: "Fooocus simplified image generation" },
  { id: "gh-856", name: "lllyasviel/ControlNet", source: "github", category: "vision", url: "https://github.com/lllyasviel/ControlNet", description: "ControlNet controlled image generation" },
  { id: "gh-857", name: "InstantID/InstantID", source: "github", category: "vision", url: "https://github.com/InstantID/InstantID", description: "InstantID zero-shot identity-preserving generation" },
  { id: "gh-858", name: "tencent/ip-adapter", source: "github", category: "vision", url: "https://github.com/tencent-ailab/IP-Adapter", description: "IP-Adapter image prompt for style transfer" },
  { id: "gh-859", name: "sczhou/CodeFormer", source: "github", category: "vision", url: "https://github.com/sczhou/CodeFormer", description: "CodeFormer face restoration for patient photos" },
  { id: "gh-860", name: "xinntao/Real-ESRGAN", source: "github", category: "vision", url: "https://github.com/xinntao/Real-ESRGAN", description: "Real-ESRGAN image super-resolution for medical" },
  { id: "hf-861", name: "medical-ai/pathology-bert", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/medicalai/ClinicalBERT", description: "Pathology-specialized BERT for report analysis" },
  { id: "hf-862", name: "umlsbert/umlsbert", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/GanjinZero/UMLSBert_ENG", description: "UMLS-enriched BERT for concept linking" },
  { id: "hf-863", name: "nlpie/clinical-longformer", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/yikuan8/Clinical-Longformer", description: "Clinical Longformer for long EHR documents" },
  { id: "hf-864", name: "yikuan8/Clinical-BigBird", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/yikuan8/Clinical-BigBird", description: "Clinical BigBird for extremely long clinical notes" },
  { id: "hf-865", name: "urdadx/radiologyBERT", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/bionlp/bluebert_pubmed_mimic_uncased_L-12_H-768_A-12", description: "Radiology BERT for report interpretation" },
  { id: "hf-866", name: "monologg/biobert_v1.1_pubmed_squad2", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/monologg/biobert_v1.1_pubmed_squad_v2", description: "BioBERT fine-tuned for medical QA extraction" },
  { id: "hf-867", name: "microsoft/BiomedVLP-CXR-BERT-specialized", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/BiomedVLP-CXR-BERT-specialized", description: "BiomedVLP for chest X-ray report generation" },
  { id: "hf-868", name: "kamalkraj/BioSimCSE-BioLinkBERT-BASE", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/kamalkraj/BioSimCSE-BioLinkBERT-BASE", description: "BioSimCSE for biomedical sentence similarity" },
  { id: "hf-869", name: "TimKond/SpeechTokenizer", source: "huggingface", category: "voice-model", url: "https://huggingface.co/fnlp/SpeechTokenizer", description: "SpeechTokenizer for unified speech-language modeling" },
  { id: "hf-870", name: "fishaudio/fish-speech-1.4", source: "huggingface", category: "voice-model", url: "https://huggingface.co/fishaudio/fish-speech-1.4", description: "Fish Speech multi-language TTS model" },
  { id: "hf-871", name: "parler-tts/parler-tts-large-v1", source: "huggingface", category: "voice-model", url: "https://huggingface.co/parler-tts/parler-tts-large-v1", description: "Parler-TTS high-quality text-to-speech" },
  { id: "hf-872", name: "coqui/XTTS-v2", source: "huggingface", category: "voice-model", url: "https://huggingface.co/coqui/XTTS-v2", description: "XTTS-v2 multilingual voice cloning TTS" },
  { id: "hf-873", name: "facebook/w2v-bert-2.0", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/w2v-bert-2.0", description: "W2v-BERT 2.0 speech representation learning" },
  { id: "hf-874", name: "nvidia/canary-1b", source: "huggingface", category: "voice-model", url: "https://huggingface.co/nvidia/canary-1b", description: "NVIDIA Canary multilingual ASR and translation" },
  { id: "hf-875", name: "facebook/encodec_48khz", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/encodec_48khz", description: "EnCodec neural audio codec for voice processing" },
  { id: "hf-876", name: "amphion/MaskGCT", source: "huggingface", category: "voice-model", url: "https://huggingface.co/amphion/MaskGCT", description: "MaskGCT non-autoregressive TTS model" },
  { id: "gh-877", name: "modelscope/FunASR", source: "github", category: "voice-model", url: "https://github.com/modelscope/FunASR", description: "FunASR fundamental speech recognition toolkit" },
  { id: "gh-878", name: "NVIDIA/NeMo-text-processing", source: "github", category: "voice-model", url: "https://github.com/NVIDIA/NeMo-text-processing", description: "NeMo text normalization for TTS" },
  { id: "gh-879", name: "facebookresearch/fairseq/wav2vec", source: "github", category: "voice-model", url: "https://github.com/facebookresearch/fairseq", description: "Fairseq wav2vec speech representations" },
  { id: "gh-880", name: "kaldi-asr/kaldi", source: "github", category: "voice-model", url: "https://github.com/kaldi-asr/kaldi", description: "Kaldi speech recognition toolkit" },
  { id: "gh-881", name: "PaddlePaddle/PaddleSpeech", source: "github", category: "voice-model", url: "https://github.com/PaddlePaddle/PaddleSpeech", description: "PaddleSpeech easy-to-use speech toolkit" },
  { id: "gh-882", name: "wenet-e2e/wenet", source: "github", category: "voice-model", url: "https://github.com/wenet-e2e/wenet", description: "WeNet production-ready speech recognition" },
  { id: "gh-883", name: "openai/chatgpt-retrieval-plugin", source: "github", category: "rag-tools", url: "https://github.com/openai/chatgpt-retrieval-plugin", description: "ChatGPT retrieval plugin for document search" },
  { id: "gh-884", name: "docugami/docugami-langchain", source: "github", category: "rag-tools", url: "https://github.com/docugami/dgml-utils", description: "Docugami document understanding for RAG" },
  { id: "gh-885", name: "run-llama/sec-insights", source: "github", category: "finance-tools", url: "https://github.com/run-llama/sec-insights", description: "SEC Insights financial document analysis RAG" },
  { id: "gh-886", name: "Cinnamon/kotaemon", source: "github", category: "rag-tools", url: "https://github.com/Cinnamon/kotaemon", description: "Kotaemon open-source RAG document chat" },
  { id: "gh-887", name: "khoj-ai/khoj", source: "github", category: "rag-tools", url: "https://github.com/khoj-ai/khoj", description: "Khoj personal AI search and chat" },
  { id: "gh-888", name: "danswer-ai/danswer", source: "github", category: "rag-tools", url: "https://github.com/danswer-ai/danswer", description: "Danswer enterprise AI search and chat" },
  { id: "gh-889", name: "verba-app/verba", source: "github", category: "rag-tools", url: "https://github.com/weaviate/Verba", description: "Verba golden RAGtriever with Weaviate" },
  { id: "gh-890", name: "superduper-io/superduper", source: "github", category: "rag-tools", url: "https://github.com/superduper-io/superduper", description: "SuperDuper AI on existing databases" },
  { id: "gh-891", name: "DS4SD/docling", source: "github", category: "rag-tools", url: "https://github.com/DS4SD/docling", description: "Docling document parsing for RAG ingestion" },
  { id: "gh-892", name: "jina-ai/reader", source: "github", category: "rag-tools", url: "https://github.com/jina-ai/reader", description: "Jina Reader URL to LLM-friendly input" },
  { id: "gh-893", name: "llmware-ai/llmware", source: "github", category: "rag-tools", url: "https://github.com/llmware-ai/llmware", description: "LLMWare enterprise RAG for medical documents" },
  { id: "gh-894", name: "SciPhi-AI/R2R", source: "github", category: "rag-tools", url: "https://github.com/SciPhi-AI/R2R", description: "R2R production RAG engine" },
  { id: "gh-895", name: "biomedical-data/pubtator", source: "github", category: "medical-tools", url: "https://github.com/ncbi-nlp/PubTator", description: "PubTator biomedical text mining and annotation" },
  { id: "gh-896", name: "bioinformatics-ua/imageclef-medical", source: "github", category: "medical-tools", url: "https://github.com/bioinformatics-ua/imageclef-toolkit", description: "ImageCLEF medical image retrieval tools" },
  { id: "gh-897", name: "microsoft/lida", source: "github", category: "agent-tools", url: "https://github.com/microsoft/lida", description: "LIDA automatic visualization generation" },
  { id: "gh-898", name: "NVIDIA/GenerativeAIExamples", source: "github", category: "agent-tools", url: "https://github.com/NVIDIA/GenerativeAIExamples", description: "NVIDIA generative AI reference applications" },
  { id: "gh-899", name: "Forethought-Technologies/AutoChain", source: "github", category: "agent-tools", url: "https://github.com/Forethought-Technologies/AutoChain", description: "AutoChain generative agent for automation" },
  { id: "gh-900", name: "weaviate/recipes", source: "github", category: "rag-tools", url: "https://github.com/weaviate/recipes", description: "Weaviate RAG recipes and examples" },
  { id: "hf-901", name: "Henrychur/MMed-Llama-3-8B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/Henrychur/MMed-Llama-3-8B", description: "MMed-Llama multilingual medical LLM" },
  { id: "hf-902", name: "johnsnowlabs/JSL-MedS-v2", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/johnsnowlabs/JSL-MedS-v2.5-8b", description: "JSL MedS v2 medical NLP suite" },
  { id: "hf-903", name: "ContactDoctor/Bio-Medical-Llama-3-8B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/ContactDoctor/Bio-Medical-Llama-3-8B", description: "Bio-Medical Llama 3 for clinical use" },
  { id: "hf-904", name: "aaditya/Llama3-OpenBioLLM-8B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/aaditya/Llama3-OpenBioLLM-8B", description: "OpenBioLLM Llama3 for biomedical tasks" },
  { id: "hf-905", name: "BioMistral/BioMistral-7B-DARE", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/BioMistral/BioMistral-7B-DARE", description: "BioMistral DARE merge for medical reasoning" },
  { id: "hf-906", name: "llSourcell/medllama2_7b", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/llSourcell/medllama2_7b", description: "MedLlama2 medical domain adapted model" },
  { id: "hf-907", name: "PharMolix/BioMedGPT-LM-7B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/PharMolix/BioMedGPT-LM-7B", description: "BioMedGPT for molecular and clinical text" },
  { id: "hf-908", name: "starmpcc/Asclepius-Llama2-7B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/starmpcc/Asclepius-Llama2-7B", description: "Asclepius clinical note generation model" },
  { id: "hf-909", name: "PULSE/PULSE-7bv5", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/OpenMEDLab/PULSE-7bv5", description: "PULSE Chinese medical LLM series" },
  { id: "hf-910", name: "wangrongsheng/IvyGPT-35k-instruction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/wangrongsheng/IvyGPT-35k-instruction", description: "IvyGPT medical instruction tuning data" },
  { id: "hf-911", name: "lavita/ChatDoctor-HealthCareMagic-100k", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/lavita/ChatDoctor-HealthCareMagic-100k", description: "HealthCareMagic doctor-patient dialogues" },
  { id: "hf-912", name: "lavita/medical-qa-datasets", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/lavita/medical-qa-datasets", description: "Aggregated medical QA from multiple sources" },
  { id: "hf-913", name: "AdaptLLM/medicine-tasks", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/AdaptLLM/medicine-tasks", description: "Medical domain task evaluation suite" },
  { id: "hf-914", name: "nlpie/Rad-ReStruct", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/nlpie/Rad-ReStruct", description: "Radiology report restructuring dataset" },
  { id: "hf-915", name: "omi-health/medical-dialogue-to-soap-summary", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/omi-health/medical-dialogue-to-soap-summary", description: "Medical dialogue to SOAP note summarization" },
  { id: "hf-916", name: "medarc/clinical_qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/gpt-clinical/clinical_qa", description: "Clinical QA for medical decision support" },
  { id: "hf-917", name: "alkzar90/CC-CCII", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/alkzar90/CC-CCII", description: "COVID CT classification dataset" },
  { id: "hf-918", name: "srowen/healthsea", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/srowen/healthsea", description: "Health supplement NER extraction dataset" },
  { id: "hf-919", name: "HPAI-BSC/pubmedqa-synthetic", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/HPAI-BSC/pubmedqa-synthetic", description: "Synthetic PubMedQA for data augmentation" },
  { id: "hf-920", name: "bigbio/healthadvice", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/health_advice", description: "Health advice reliability classification" },
  { id: "gh-921", name: "mims-harvard/UniMol", source: "github", category: "medical-tools", url: "https://github.com/deepmodeling/Uni-Mol", description: "UniMol molecular representation learning" },
  { id: "gh-922", name: "google-deepmind/alphafold", source: "github", category: "medical-tools", url: "https://github.com/google-deepmind/alphafold", description: "AlphaFold protein structure prediction" },
  { id: "gh-923", name: "facebookresearch/esm", source: "github", category: "medical-tools", url: "https://github.com/facebookresearch/esm", description: "ESM evolutionary protein language model" },
  { id: "gh-924", name: "Lightning-AI/lit-llama", source: "github", category: "training-tools", url: "https://github.com/Lightning-AI/lit-llama", description: "Lit-LLaMA Apache 2.0 LLaMA implementation" },
  { id: "gh-925", name: "SafeAILab/EAGLE", source: "github", category: "training-tools", url: "https://github.com/SafeAILab/EAGLE", description: "EAGLE speculative sampling for fast inference" },
  { id: "gh-926", name: "FMInference/FlexGen", source: "github", category: "training-tools", url: "https://github.com/FMInference/FlexGen", description: "FlexGen offloading for single GPU LLM inference" },
  { id: "gh-927", name: "mit-han-lab/streaming-llm", source: "github", category: "training-tools", url: "https://github.com/mit-han-lab/streaming-llm", description: "StreamingLLM infinite context for long medical docs" },
  { id: "gh-928", name: "FranxYao/chain-of-thought-hub", source: "github", category: "training-tools", url: "https://github.com/FranxYao/chain-of-thought-hub", description: "Chain-of-thought prompting for medical reasoning" },
  { id: "gh-929", name: "reasoning-machines/pal", source: "github", category: "training-tools", url: "https://github.com/reasoning-machines/pal", description: "Program-Aided Language for medical calculations" },
  { id: "gh-930", name: "princeton-nlp/tree-of-thought-llm", source: "github", category: "training-tools", url: "https://github.com/princeton-nlp/tree-of-thought-llm", description: "Tree of Thought for medical differential diagnosis" },
  { id: "gh-931", name: "AGI-Edgerunners/LLM-Adapters", source: "github", category: "training-tools", url: "https://github.com/AGI-Edgerunners/LLM-Adapters", description: "LLM-Adapters unified adapter tuning framework" },
  { id: "gh-932", name: "jxnl/instructor", source: "github", category: "training-tools", url: "https://github.com/jxnl/instructor", description: "Instructor structured extraction from LLMs" },
  { id: "gh-933", name: "huggingface/text-generation-inference", source: "github", category: "training-tools", url: "https://github.com/huggingface/text-generation-inference", description: "TGI production LLM text generation server" },
  { id: "gh-934", name: "predibase/lorax", source: "github", category: "training-tools", url: "https://github.com/predibase/lorax", description: "LoRAX serve many LoRA adapters on single GPU" },
  { id: "gh-935", name: "linkedin/FastTreeSHAP", source: "github", category: "training-tools", url: "https://github.com/linkedin/FastTreeSHAP", description: "FastTreeSHAP for medical model explainability" },
  { id: "gh-936", name: "slundberg/shap", source: "github", category: "training-tools", url: "https://github.com/slundberg/shap", description: "SHAP explainable AI for medical model decisions" },
  { id: "gh-937", name: "marcotcr/lime", source: "github", category: "training-tools", url: "https://github.com/marcotcr/lime", description: "LIME local interpretable explanations for medical AI" },
  { id: "gh-938", name: "pytorch/captum", source: "github", category: "training-tools", url: "https://github.com/pytorch/captum", description: "Captum model interpretability for PyTorch medical models" },
  { id: "gh-939", name: "google-deepmind/reverb", source: "github", category: "training-tools", url: "https://github.com/google-deepmind/reverb", description: "Reverb data storage for reinforcement learning" },
  { id: "gh-940", name: "tensorflow/agents", source: "github", category: "training-tools", url: "https://github.com/tensorflow/agents", description: "TF-Agents reinforcement learning library" },
  { id: "gh-941", name: "google/dopamine", source: "github", category: "training-tools", url: "https://github.com/google/dopamine", description: "Dopamine RL framework for research" },
  { id: "gh-942", name: "DLR-RM/stable-baselines3", source: "github", category: "training-tools", url: "https://github.com/DLR-RM/stable-baselines3", description: "Stable Baselines3 RL algorithms for optimization" },
  { id: "gh-943", name: "thu-ml/tianshou", source: "github", category: "training-tools", url: "https://github.com/thu-ml/tianshou", description: "Tianshou deep RL library" },
  { id: "gh-944", name: "google/brax", source: "github", category: "training-tools", url: "https://github.com/google/brax", description: "Brax differentiable physics engine for RL" },
  { id: "fin-945", name: "FinGPT/fingpt-benchmark", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/FinGPT/fingpt-benchmark", description: "FinGPT comprehensive financial benchmark" },
  { id: "fin-946", name: "Aiera/aiera-benchmark", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/Aiera/aiera-benchmark", description: "Aiera financial AI benchmark suite" },
  { id: "fin-947", name: "ChanceFocus/PIXIU", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/ChanceFocus/flare-finqa", description: "PIXIU financial LLM evaluation benchmark" },
  { id: "fin-948", name: "TheFinAI/flare-sm-acl", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-sm-acl", description: "Social media financial sentiment ACL" },
  { id: "fin-949", name: "TheFinAI/flare-german", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-german", description: "German financial credit classification" },
  { id: "fin-950", name: "TheFinAI/flare-australian", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-australian", description: "Australian financial credit dataset" },
  { id: "gh-951", name: "AI4Finance-Foundation/FinGPT-v3", source: "github", category: "finance-model", url: "https://github.com/AI4Finance-Foundation/FinGPT", description: "FinGPT v3 instruction-tuned financial model" },
  { id: "gh-952", name: "Dod-o/CatBoostFinance", source: "github", category: "finance-tools", url: "https://github.com/catboost/catboost", description: "CatBoost gradient boosting for financial tabular" },
  { id: "gh-953", name: "amazon-science/chronos-forecasting", source: "github", category: "finance-tools", url: "https://github.com/amazon-science/chronos-forecasting", description: "Chronos time series forecasting foundation model" },
  { id: "gh-954", name: "Nixtla/neuralforecast", source: "github", category: "finance-tools", url: "https://github.com/Nixtla/neuralforecast", description: "NeuralForecast deep learning time series" },
  { id: "gh-955", name: "google-research/timesfm", source: "github", category: "finance-tools", url: "https://github.com/google-research/timesfm", description: "TimesFM Google time series foundation model" },
  { id: "gh-956", name: "thuml/Time-Series-Library", source: "github", category: "finance-tools", url: "https://github.com/thuml/Time-Series-Library", description: "Time series deep learning library" },
  { id: "gh-957", name: "ts-foundation-models/lag-llama", source: "github", category: "finance-tools", url: "https://github.com/time-series-foundation-models/lag-llama", description: "Lag-Llama time series foundation model" },
  { id: "gh-958", name: "cure-lab/LTSF-Linear", source: "github", category: "finance-tools", url: "https://github.com/cure-lab/LTSF-Linear", description: "Long-term time series forecasting" },
  { id: "gh-959", name: "AIStream-Peelout/flow-forecast", source: "github", category: "finance-tools", url: "https://github.com/AIStream-Peelout/flow-forecast", description: "Flow Forecast deep learning time series" },
  { id: "gh-960", name: "fmfn/BayesianOptimization", source: "github", category: "training-tools", url: "https://github.com/bayesian-optimization/BayesianOptimization", description: "Bayesian optimization for hyperparameter tuning" },
  { id: "gh-961", name: "optuna/optuna", source: "github", category: "training-tools", url: "https://github.com/optuna/optuna", description: "Optuna hyperparameter optimization framework" },
  { id: "gh-962", name: "hyperopt/hyperopt", source: "github", category: "training-tools", url: "https://github.com/hyperopt/hyperopt", description: "Hyperopt distributed hyperparameter optimization" },
  { id: "gh-963", name: "microsoft/nni", source: "github", category: "training-tools", url: "https://github.com/microsoft/nni", description: "NNI neural network intelligence AutoML toolkit" },
  { id: "gh-964", name: "keras-team/keras-tuner", source: "github", category: "training-tools", url: "https://github.com/keras-team/keras-tuner", description: "Keras Tuner hyperparameter search for neural nets" },
  { id: "gh-965", name: "automl/auto-sklearn", source: "github", category: "training-tools", url: "https://github.com/automl/auto-sklearn", description: "Auto-sklearn automated ML for medical tabular data" },
  { id: "gh-966", name: "EpistasisLab/tpot", source: "github", category: "training-tools", url: "https://github.com/EpistasisLab/tpot", description: "TPOT AutoML pipeline optimization" },
  { id: "gh-967", name: "h2oai/h2o-3", source: "github", category: "training-tools", url: "https://github.com/h2oai/h2o-3", description: "H2O AutoML for medical predictive models" },
  { id: "gh-968", name: "autogluon/autogluon", source: "github", category: "training-tools", url: "https://github.com/autogluon/autogluon", description: "AutoGluon automated ML for tabular and multimodal" },
  { id: "gh-969", name: "pycaret/pycaret", source: "github", category: "training-tools", url: "https://github.com/pycaret/pycaret", description: "PyCaret low-code ML for clinical data" },
  { id: "gh-970", name: "scikit-learn/scikit-learn", source: "github", category: "general-ml", url: "https://github.com/scikit-learn/scikit-learn", description: "Scikit-learn machine learning for medical research" },
  { id: "gh-971", name: "xgboost/xgboost", source: "github", category: "general-ml", url: "https://github.com/dmlc/xgboost", description: "XGBoost gradient boosting for clinical predictions" },
  { id: "gh-972", name: "microsoft/LightGBM", source: "github", category: "general-ml", url: "https://github.com/microsoft/LightGBM", description: "LightGBM fast gradient boosting for tabular" },
  { id: "gh-973", name: "catboost/catboost", source: "github", category: "general-ml", url: "https://github.com/catboost/catboost", description: "CatBoost gradient boosting for categorical data" },
  { id: "gh-974", name: "facebook/prophet", source: "github", category: "general-ml", url: "https://github.com/facebook/prophet", description: "Prophet time series forecasting for patient data" },
  { id: "gh-975", name: "statsmodels/statsmodels", source: "github", category: "general-ml", url: "https://github.com/statsmodels/statsmodels", description: "Statsmodels statistical models for clinical research" },
  { id: "gh-976", name: "lifelines-survival", source: "github", category: "medical-tools", url: "https://github.com/CamDavidsonPilon/lifelines", description: "Lifelines survival analysis for clinical outcomes" },
  { id: "gh-977", name: "sebp/scikit-survival", source: "github", category: "medical-tools", url: "https://github.com/sebp/scikit-survival", description: "Scikit-survival for medical survival prediction" },
  { id: "gh-978", name: "amirhossein-kz/Awesome-Diffusion-Models-in-Medical-Imaging", source: "github", category: "medical-tools", url: "https://github.com/amirhossein-kz/Awesome-Diffusion-Models-in-Medical-Imaging", description: "Curated diffusion models for medical imaging" },
  { id: "gh-979", name: "HazyResearch/medical-reasoning", source: "github", category: "medical-tools", url: "https://github.com/HazyResearch/legalbench", description: "Medical reasoning benchmarks and evaluation" },
  { id: "gh-980", name: "stanfordmlgroup/CheXNet", source: "github", category: "medical-tools", url: "https://github.com/arnoweng/CheXNet", description: "CheXNet radiologist-level pneumonia detection" },
  { id: "hf-981", name: "knkarthick/MEETING_SUMMARY", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/knkarthick/dialogsum", description: "Meeting and dialogue summarization dataset" },
  { id: "hf-982", name: "samsum", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/samsum", description: "Samsung dialogue summarization corpus" },
  { id: "hf-983", name: "multi_woz_v22", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/multi_woz_v22", description: "MultiWOZ task-oriented dialogue for appointment booking" },
  { id: "hf-984", name: "daily_dialog", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/daily_dialog", description: "Daily Dialog multi-turn for conversational AI" },
  { id: "hf-985", name: "empathetic_dialogues", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/empathetic_dialogues", description: "Empathetic dialogues for patient communication" },
  { id: "hf-986", name: "blended_skill_talk", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/blended_skill_talk", description: "Blended skill talk for engaging medical chat" },
  { id: "hf-987", name: "conv_ai_2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/conv_ai_2", description: "ConvAI2 persona-grounded dialogue" },
  { id: "hf-988", name: "taskmaster2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/taskmaster2", description: "Taskmaster for task-oriented medical scheduling" },
  { id: "hf-989", name: "spider", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/spider", description: "Spider text-to-SQL for medical database queries" },
  { id: "hf-990", name: "wikisql", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/wikisql", description: "WikiSQL for natural language database queries" },
  { id: "hf-991", name: "cosql", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/cosql", description: "CoSQL conversational text-to-SQL for clinical DB" },
  { id: "hf-992", name: "eli5", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/eli5", description: "ELI5 long-form QA for patient education" },
  { id: "hf-993", name: "hotpot_qa", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/hotpot_qa", description: "HotpotQA multi-hop QA for medical reasoning" },
  { id: "hf-994", name: "web_questions", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/web_questions", description: "WebQuestions for open-domain medical QA" },
  { id: "hf-995", name: "narrativeqa", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/narrativeqa", description: "NarrativeQA reading comprehension for case studies" },
  { id: "hf-996", name: "drop", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/drop", description: "DROP discrete reasoning over paragraphs" },
  { id: "hf-997", name: "race", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/race", description: "RACE reading comprehension for medical education" },
  { id: "hf-998", name: "quoref", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/quoref", description: "Quoref coreference resolution in QA" },
  { id: "hf-999", name: "ropes", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/ropes", description: "ROPES reasoning over situation effects" },
  { id: "hf-1000", name: "multirc", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/super_glue", description: "MultiRC multi-sentence reading comprehension" },
  { id: "gh-1001", name: "mosaicml/streaming", source: "github", category: "training-tools", url: "https://github.com/mosaicml/streaming", description: "MosaicML Streaming for efficient data loading" },
  { id: "gh-1002", name: "huggingface/datasets", source: "github", category: "training-tools", url: "https://github.com/huggingface/datasets", description: "HuggingFace Datasets library for data loading" },
  { id: "gh-1003", name: "huggingface/tokenizers", source: "github", category: "training-tools", url: "https://github.com/huggingface/tokenizers", description: "HuggingFace Tokenizers fast tokenization" },
  { id: "gh-1004", name: "huggingface/accelerate", source: "github", category: "training-tools", url: "https://github.com/huggingface/accelerate", description: "HuggingFace Accelerate distributed training" },
  { id: "gh-1005", name: "huggingface/optimum", source: "github", category: "training-tools", url: "https://github.com/huggingface/optimum", description: "HuggingFace Optimum hardware acceleration" },
  { id: "gh-1006", name: "huggingface/safetensors", source: "github", category: "training-tools", url: "https://github.com/huggingface/safetensors", description: "Safetensors safe model serialization format" },
  { id: "gh-1007", name: "huggingface/chat-ui", source: "github", category: "agent-tools", url: "https://github.com/huggingface/chat-ui", description: "HuggingFace Chat UI for LLM interaction" },
  { id: "gh-1008", name: "oobabooga/text-generation-webui", source: "github", category: "agent-tools", url: "https://github.com/oobabooga/text-generation-webui", description: "Text Generation WebUI for local LLMs" },
  { id: "gh-1009", name: "open-webui/open-webui", source: "github", category: "agent-tools", url: "https://github.com/open-webui/open-webui", description: "Open WebUI ChatGPT-style interface for local LLMs" },
  { id: "gh-1010", name: "lobehub/lobe-chat", source: "github", category: "agent-tools", url: "https://github.com/lobehub/lobe-chat", description: "LobeChat modern chat framework for AI" },
  { id: "hf-1011", name: "internlm/internlm-xcomposer2-4khd-7b", source: "huggingface", category: "vision", url: "https://huggingface.co/internlm/internlm-xcomposer2-4khd-7b", description: "XComposer2 4K HD resolution medical imaging" },
  { id: "hf-1012", name: "google/paligemma2-3b-pt-896", source: "huggingface", category: "vision", url: "https://huggingface.co/google/paligemma2-3b-pt-896", description: "PaliGemma2 high-res vision-language model" },
  { id: "hf-1013", name: "Qwen/Qwen2-VL-7B-Instruct", source: "huggingface", category: "vision", url: "https://huggingface.co/Qwen/Qwen2-VL-7B-Instruct", description: "Qwen2-VL for medical image conversation" },
  { id: "hf-1014", name: "meta-llama/Llama-3.2-11B-Vision-Instruct", source: "huggingface", category: "vision", url: "https://huggingface.co/meta-llama/Llama-3.2-11B-Vision-Instruct", description: "Llama 3.2 Vision for multimodal medical tasks" },
  { id: "hf-1015", name: "deepseek-ai/deepseek-vl2", source: "huggingface", category: "vision", url: "https://huggingface.co/deepseek-ai/deepseek-vl2", description: "DeepSeek-VL2 advanced vision understanding" },
  { id: "zn-1016", name: "zenodo/voice-disorders-db", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/search?q=voice+disorder+database", description: "Voice disorder databases for ENT analysis" },
  { id: "zn-1017", name: "zenodo/audiometry-datasets", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/search?q=audiometry+hearing", description: "Audiometry and hearing assessment datasets" },
  { id: "zn-1018", name: "zenodo/endoscopy-annotation", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/search?q=endoscopy+annotation+segmentation", description: "Endoscopy annotation and segmentation datasets" },
  { id: "zn-1019", name: "zenodo/thyroid-ultrasound", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/search?q=thyroid+ultrasound+classification", description: "Thyroid ultrasound imaging datasets" },
  { id: "zn-1020", name: "zenodo/sleep-apnea-psg", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/search?q=sleep+apnea+polysomnography", description: "Sleep apnea polysomnography recordings" },
  { id: "ph-1021", name: "physionet/sleep-heart-health", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/shhpsgdb/", description: "Sleep Heart Health Study PSG database" },
  { id: "ph-1022", name: "physionet/dreams", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/dreams/", description: "DREAMS sleep spindle detection database" },
  { id: "ph-1023", name: "physionet/mesa", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/mesa/", description: "Multi-Ethnic Study of Atherosclerosis sleep data" },
  { id: "ph-1024", name: "physionet/cric", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/challenge-2018/", description: "PhysioNet challenge sleep arousal detection" },
  { id: "gc-1025", name: "grand-challenge/airway-seg", source: "grand-challenge", category: "ent-dataset", url: "https://atm22.grand-challenge.org/", description: "Airway tree modeling segmentation challenge" },
  { id: "gc-1026", name: "grand-challenge/head-neck-organ-seg", source: "grand-challenge", category: "ent-dataset", url: "https://han-seg2023.grand-challenge.org/", description: "Head neck organ-at-risk segmentation 2023" },
  { id: "gc-1027", name: "grand-challenge/thyroid-nodule", source: "grand-challenge", category: "ent-dataset", url: "https://tn-scui2020.grand-challenge.org/", description: "Thyroid nodule classification ultrasound" },
  { id: "gc-1028", name: "grand-challenge/surgical-workflow", source: "grand-challenge", category: "endoscopy-dataset", url: "https://cholectriplet2022.grand-challenge.org/", description: "Surgical workflow recognition from endoscopy" },
  { id: "tcia-1029", name: "TCIA/head-neck-radiomics-02", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/head-neck-radiomics-02/", description: "Head neck radiomics collection 02" },
  { id: "tcia-1030", name: "TCIA/radcure", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/radcure/", description: "RADCURE radiation therapy head neck outcomes" },
  { id: "tcia-1031", name: "TCIA/tcga-thca", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/tcga-thca/", description: "TCGA thyroid carcinoma pathology images" },
  { id: "tcia-1032", name: "TCIA/cptac-hnscc", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/cptac-hnscc/", description: "CPTAC head neck squamous cell carcinoma" },
  { id: "kg-1033", name: "kaggle/thyroid-disease", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/emmanuelfwerr/thyroid-disease-data", description: "Thyroid disease classification dataset" },
  { id: "kg-1034", name: "kaggle/snoring-detection", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/tareqkhanemu/snoring", description: "Snoring sound detection for sleep apnea" },
  { id: "kg-1035", name: "kaggle/tinnitus-survey", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/tinnitus-survey", description: "Tinnitus survey and clinical data" },
  { id: "kg-1036", name: "kaggle/ear-disease-classification", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/ear-disease", description: "Ear disease otoscopy classification images" },
  { id: "kg-1037", name: "kaggle/oral-cancer-images", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/zaidpy/oral-cancer", description: "Oral cancer image classification dataset" },
  { id: "kg-1038", name: "kaggle/ct-scan-head-neck", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/head-neck-ct", description: "Head and neck CT scan segmentation data" },
  { id: "kg-1039", name: "kaggle/voice-pathology", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/voice-pathology-detection", description: "Voice pathology detection from audio features" },
  { id: "kg-1040", name: "kaggle/facial-palsy", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/facial-palsy-grading", description: "Facial nerve palsy grading images" },
  { id: "hf-1041", name: "bigbio/mimic_iii_clinical_notes", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mimic_iii", description: "MIMIC-III clinical notes subset for NLP" },
  { id: "hf-1042", name: "bigbio/ehealth_kd", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ehealth_kd", description: "eHealth knowledge discovery NER" },
  { id: "hf-1043", name: "bigbio/nlm_gene", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/nlm_gene", description: "NLM gene recognition corpus" },
  { id: "hf-1044", name: "bigbio/meddra", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cadec", description: "MedDRA adverse event coding from text" },
  { id: "hf-1045", name: "bigbio/scielo", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/scielo", description: "SciELO biomedical parallel translation corpus" },
  { id: "hf-1046", name: "FreedomIntelligence/MedS-Bench", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/FreedomIntelligence/MedS-Bench", description: "MedS-Bench medical specialty benchmark" },
  { id: "hf-1047", name: "BAAI/Infinity-MM", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/BAAI/Infinity-MM", description: "Infinity-MM massive multimodal training data" },
  { id: "hf-1048", name: "nvidia/ChatQA-Training-Data", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/nvidia/ChatQA-Training-Data", description: "ChatQA conversational QA training data" },
  { id: "hf-1049", name: "nvidia/Daring-Anteater", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/nvidia/Daring-Anteater", description: "NVIDIA curated instruction tuning mixture" },
  { id: "hf-1050", name: "arcee-ai/EvolKit-20k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/arcee-ai/EvolKit-20k", description: "Evolved complexity instruction toolkit" },
  { id: "gh-1051", name: "OpenAccess-AI-Collective/axolotl", source: "github", category: "training-tools", url: "https://github.com/OpenAccess-AI-Collective/axolotl", description: "Axolotl streamlined fine-tuning recipes" },
  { id: "gh-1052", name: "OpenDevin/OpenDevin", source: "github", category: "agent-tools", url: "https://github.com/All-Hands-AI/OpenHands", description: "OpenDevin AI software development agent" },
  { id: "gh-1053", name: "TaskingAI/TaskingAI", source: "github", category: "agent-tools", url: "https://github.com/TaskingAI/TaskingAI", description: "TaskingAI building AI agents with tools" },
  { id: "gh-1054", name: "superagentxai/superagentx", source: "github", category: "agent-tools", url: "https://github.com/superagentxai/superagentX", description: "SuperAgentX multi-agent orchestration" },
  { id: "gh-1055", name: "AgentScope/agentscope", source: "github", category: "agent-tools", url: "https://github.com/modelscope/agentscope", description: "AgentScope multi-agent communication platform" },
  { id: "gh-1056", name: "aiwaves-cn/agents", source: "github", category: "agent-tools", url: "https://github.com/aiwaves-cn/agents", description: "Agents autonomous language agent framework" },
  { id: "gh-1057", name: "MineDojo/Voyager", source: "github", category: "agent-tools", url: "https://github.com/MineDojo/Voyager", description: "Voyager LLM-powered lifelong learning agent" },
  { id: "gh-1058", name: "kyegomez/swarms", source: "github", category: "agent-tools", url: "https://github.com/kyegomez/swarms", description: "Swarms multi-agent orchestration framework" },
  { id: "gh-1059", name: "AgentOps-AI/tokencost", source: "github", category: "agent-tools", url: "https://github.com/AgentOps-AI/tokencost", description: "TokenCost LLM cost tracking and optimization" },
  { id: "gh-1060", name: "simonw/llm", source: "github", category: "agent-tools", url: "https://github.com/simonw/llm", description: "LLM CLI tool for interacting with language models" },
  { id: "hf-1061", name: "liuhaotian/LLaVA-Instruct-150K", source: "huggingface", category: "vision", url: "https://huggingface.co/datasets/liuhaotian/LLaVA-Instruct-150K", description: "LLaVA visual instruction tuning 150K" },
  { id: "hf-1062", name: "Lin-Chen/ShareGPT4V", source: "huggingface", category: "vision", url: "https://huggingface.co/datasets/Lin-Chen/ShareGPT4V", description: "ShareGPT4V visual dialogue training data" },
  { id: "hf-1063", name: "HuggingFaceM4/the_cauldron", source: "huggingface", category: "vision", url: "https://huggingface.co/datasets/HuggingFaceM4/the_cauldron", description: "The Cauldron massive multimodal dataset mix" },
  { id: "hf-1064", name: "TIGER-Lab/Mantis-Instruct", source: "huggingface", category: "vision", url: "https://huggingface.co/datasets/TIGER-Lab/Mantis-Instruct", description: "Mantis multi-image instruction tuning data" },
  { id: "hf-1065", name: "openbmb/RLAIF-V-Dataset", source: "huggingface", category: "vision", url: "https://huggingface.co/datasets/openbmb/RLAIF-V-Dataset", description: "RLAIF-V visual AI feedback for VLM alignment" },
  { id: "gh-1066", name: "modelscope/ms-swift", source: "github", category: "training-tools", url: "https://github.com/modelscope/ms-swift", description: "MS-SWIFT efficient LLM and VLM fine-tuning" },
  { id: "gh-1067", name: "InternLM/lmdeploy", source: "github", category: "training-tools", url: "https://github.com/InternLM/lmdeploy", description: "LMDeploy efficient LLM deployment toolkit" },
  { id: "gh-1068", name: "stas00/ml-engineering", source: "github", category: "training-tools", url: "https://github.com/stas00/ml-engineering", description: "ML Engineering open book for LLM training" },
  { id: "gh-1069", name: "rasbt/LLMs-from-scratch", source: "github", category: "training-tools", url: "https://github.com/rasbt/LLMs-from-scratch", description: "Build an LLM from scratch educational code" },
  { id: "gh-1070", name: "naklecha/llama3-from-scratch", source: "github", category: "training-tools", url: "https://github.com/naklecha/llama3-from-scratch", description: "Llama3 implementation from scratch for learning" },
  { id: "hf-1071", name: "mistral-community/Mixtral-8x22B-v0.1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mistral-community/Mixtral-8x22B-v0.1", description: "Mixtral 8x22B large MoE model" },
  { id: "hf-1072", name: "microsoft/Phi-3-medium-128k-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/Phi-3-medium-128k-instruct", description: "Phi-3 medium 14B 128K context for long documents" },
  { id: "hf-1073", name: "CohereForAI/aya-23-8B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/CohereForAI/aya-23-8B", description: "Aya 23 multilingual model 23 languages" },
  { id: "hf-1074", name: "Qwen/Qwen2.5-32B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-32B-Instruct", description: "Qwen 2.5 32B balanced size for medical" },
  { id: "hf-1075", name: "nvidia/Llama-3.1-Nemotron-70B-Instruct-HF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/nvidia/Llama-3.1-Nemotron-70B-Instruct-HF", description: "Nemotron 70B NVIDIA optimized Llama" },
  { id: "hf-1076", name: "allenai/tulu-2-dpo-70b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/allenai/tulu-2-dpo-70b", description: "Tulu 2 DPO 70B fully open aligned model" },
  { id: "hf-1077", name: "Nexusflow/NexusRaven-V2-13B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Nexusflow/NexusRaven-V2-13B", description: "NexusRaven function calling specialist model" },
  { id: "hf-1078", name: "NousResearch/Nous-Capybara-34B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NousResearch/Nous-Capybara-34B", description: "Capybara 34B multi-turn conversation model" },
  { id: "hf-1079", name: "DiscoResearch/Llama3-German-8B-32k-v0.4", source: "huggingface", category: "general-llm", url: "https://huggingface.co/DiscoResearch/Llama3-German-8B-32k-v0.4", description: "German Llama3 for European medical use" },
  { id: "hf-1080", name: "VAGOsolutions/SauerkrautLM-Llama-3-70B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/VAGOsolutions/SauerkrautLM-Llama-3-70B-Instruct", description: "German optimized LLM for clinical German" },
  { id: "gh-1081", name: "NVIDIA/Megatron-Core", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/Megatron-LM", description: "Megatron-Core production training framework" },
  { id: "gh-1082", name: "microsoft/Olive", source: "github", category: "training-tools", url: "https://github.com/microsoft/Olive", description: "Olive model optimization toolkit" },
  { id: "gh-1083", name: "mit-han-lab/llm-awq", source: "github", category: "training-tools", url: "https://github.com/mit-han-lab/llm-awq", description: "AWQ activation-aware weight quantization" },
  { id: "gh-1084", name: "AutoGPTQ/AutoGPTQ", source: "github", category: "training-tools", url: "https://github.com/AutoGPTQ/AutoGPTQ", description: "AutoGPTQ automated GPTQ quantization" },
  { id: "gh-1085", name: "intel/neural-compressor", source: "github", category: "training-tools", url: "https://github.com/intel/neural-compressor", description: "Intel Neural Compressor model compression" },
  { id: "gh-1086", name: "microsoft/DeepSpeed-MII", source: "github", category: "training-tools", url: "https://github.com/microsoft/DeepSpeed-MII", description: "DeepSpeed-MII low-latency model inference" },
  { id: "gh-1087", name: "SqueezeAILab/SqueezeLLM", source: "github", category: "training-tools", url: "https://github.com/SqueezeAILab/SqueezeLLM", description: "SqueezeLLM dense-and-sparse quantization" },
  { id: "gh-1088", name: "NetEase-FuXi/EETQ", source: "github", category: "training-tools", url: "https://github.com/NetEase-FuXi/EETQ", description: "EETQ easy efficient transformer quantization" },
  { id: "gh-1089", name: "neuralmagic/sparseml", source: "github", category: "training-tools", url: "https://github.com/neuralmagic/sparseml", description: "SparseML pruning and quantization toolkit" },
  { id: "gh-1090", name: "microsoft/DirectML", source: "github", category: "training-tools", url: "https://github.com/microsoft/DirectML", description: "DirectML hardware-accelerated ML on Windows" },
  { id: "hf-1091", name: "medical-datasets/radiologyNET", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/IKIM-Essen/RadioLOGIC", description: "Radiology image-text dataset for medical VLMs" },
  { id: "hf-1092", name: "StevenChen16/Llama3-8B-ICD-Coding", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/StevenChen16/Llama3-8B-ICD-Coding", description: "ICD-10 medical coding LLM" },
  { id: "hf-1093", name: "wanglab/MedCLIP", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/wanglab/medclip-vit", description: "MedCLIP medical vision-language contrastive learning" },
  { id: "hf-1094", name: "microsoft/BiomedParse", source: "huggingface", category: "medical-tools", url: "https://huggingface.co/microsoft/BiomedParse", description: "BiomedParse biomedical image segmentation" },
  { id: "hf-1095", name: "LanguageBind/MedBind", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/LanguageBind/MedBind", description: "MedBind binding medical images text and data" },
  { id: "gh-1096", name: "epfLLM/meditron", source: "github", category: "medical-llm", url: "https://github.com/epfLLM/meditron", description: "Meditron training code and evaluation" },
  { id: "gh-1097", name: "microsoft/LLaVA-Med", source: "github", category: "medical-llm", url: "https://github.com/microsoft/LLaVA-Med", description: "LLaVA-Med biomedical visual instruction tuning" },
  { id: "gh-1098", name: "UCSC-VLAA/MedTrinity", source: "github", category: "medical-llm", url: "https://github.com/UCSC-VLAA/MedTrinity-25M", description: "MedTrinity 25M medical training pipeline" },
  { id: "gh-1099", name: "OpenBioLLM/OpenBioLLM", source: "github", category: "medical-llm", url: "https://github.com/aaditya/OpenBioLLM", description: "OpenBioLLM open biomedical LLM project" },
  { id: "gh-1100", name: "MAGIC-AI4Med/MedS-Ins", source: "github", category: "medical-llm", url: "https://github.com/MAGIC-AI4Med/MedS-Ins", description: "MedS-Ins medical instruction scaling framework" },
  { id: "gh-1101", name: "vkola-lab/PodGPT", source: "github", category: "medical-llm", url: "https://github.com/vkola-lab/PodGPT", description: "PodGPT medical podcast learning LLM" },
  { id: "gh-1102", name: "BAAI-DCAI/Emu3", source: "github", category: "vision", url: "https://github.com/baaivision/Emu3", description: "Emu3 next-token prediction multimodal" },
  { id: "gh-1103", name: "showlab/ShowUI", source: "github", category: "agent-tools", url: "https://github.com/showlab/ShowUI", description: "ShowUI vision-language-action GUI agent" },
  { id: "gh-1104", name: "xlang-ai/OSWorld", source: "github", category: "agent-tools", url: "https://github.com/xlang-ai/OSWorld", description: "OSWorld computer agent environment benchmark" },
  { id: "gh-1105", name: "lavague-ai/LaVague", source: "github", category: "agent-tools", url: "https://github.com/lavague-ai/LaVague", description: "LaVague web agent automation framework" },
  { id: "gh-1106", name: "evo-design/evo", source: "github", category: "medical-tools", url: "https://github.com/evo-design/evo", description: "Evo DNA foundation model for genomics" },
  { id: "gh-1107", name: "instadeepai/nucleotide-transformer", source: "github", category: "medical-tools", url: "https://github.com/instadeepai/nucleotide-transformer", description: "Nucleotide Transformer for DNA/RNA analysis" },
  { id: "gh-1108", name: "lucidrains/alphafold3-pytorch", source: "github", category: "medical-tools", url: "https://github.com/lucidrains/alphafold3-pytorch", description: "AlphaFold3 PyTorch implementation" },
  { id: "hf-1109", name: "internlm/internlm2-math-plus-7b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/internlm/internlm2-math-plus-7b", description: "InternLM2 Math Plus for clinical calculations" },
  { id: "hf-1110", name: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Llama-8B", description: "DeepSeek R1 distilled for reasoning" },
  { id: "hf-1111", name: "nvidia/Mistral-NeMo-Minitron-8B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/nvidia/Mistral-NeMo-Minitron-8B-Instruct", description: "Minitron pruned and distilled Mistral" },
  { id: "hf-1112", name: "Qwen/QwQ-32B-Preview", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/QwQ-32B-Preview", description: "QwQ reasoning model for complex medical analysis" },
  { id: "gh-1113", name: "PKU-YuanGroup/MoE-LLaVA", source: "github", category: "vision", url: "https://github.com/PKU-YuanGroup/MoE-LLaVA", description: "MoE-LLaVA mixture of experts VLM" },
  { id: "gh-1114", name: "baaivision/EVA", source: "github", category: "vision", url: "https://github.com/baaivision/EVA", description: "EVA exploring limits of masked visual encoding" },
  { id: "gh-1115", name: "SHI-Labs/OneFormer", source: "github", category: "vision", url: "https://github.com/SHI-Labs/OneFormer", description: "OneFormer one transformer for all segmentation" },
  { id: "fin-1116", name: "ChanceFocus/FLARE", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/ChanceFocus/FLARE", description: "FLARE financial language benchmark suite" },
  { id: "fin-1117", name: "Anthropic/persuasion", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Anthropic/persuasion", description: "Persuasion evaluation for safety alignment" },
  { id: "hf-1118", name: "allenai/WildBench", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/WildBench", description: "WildBench real-world LLM evaluation" },
  { id: "hf-1119", name: "lmsys/lmsys-chat-1m", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/lmsys/lmsys-chat-1m", description: "LMSYS 1M real-world LLM conversations" },
  { id: "hf-1120", name: "ai2-adapt-dev/flan_v2_converted", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/ai2-adapt-dev/flan_v2_converted", description: "Flan v2 converted instruction tuning data" },
  { id: "gh-1121", name: "huggingface/alignment-handbook", source: "github", category: "training-tools", url: "https://github.com/huggingface/alignment-handbook", description: "Alignment Handbook recipes for LLM alignment" },
  { id: "gh-1122", name: "huggingface/distil-whisper", source: "github", category: "voice-model", url: "https://github.com/huggingface/distil-whisper", description: "Distil-Whisper 6x faster speech recognition" },
  { id: "gh-1123", name: "snakers4/silero-models", source: "github", category: "voice-model", url: "https://github.com/snakers4/silero-models", description: "Silero speech models STT TTS VAD" },
  { id: "gh-1124", name: "snakers4/silero-vad", source: "github", category: "voice-model", url: "https://github.com/snakers4/silero-vad", description: "Silero VAD voice activity detection" },
  { id: "gh-1125", name: "NVIDIA/NeMo-Guardrails", source: "github", category: "agent-tools", url: "https://github.com/NVIDIA/NeMo-Guardrails", description: "NeMo Guardrails safety for medical AI agents" },
  { id: "gh-1126", name: "guardrails-ai/guardrails", source: "github", category: "agent-tools", url: "https://github.com/guardrails-ai/guardrails", description: "Guardrails output validation for medical LLMs" },
  { id: "gh-1127", name: "protectai/llm-guard", source: "github", category: "agent-tools", url: "https://github.com/protectai/llm-guard", description: "LLM Guard security toolkit for medical AI" },
  { id: "gh-1128", name: "rebuff-ai/rebuff", source: "github", category: "agent-tools", url: "https://github.com/protectai/rebuff", description: "Rebuff prompt injection detection for safety" },
  { id: "hf-1129", name: "mhenrichsen/alpaca_2k_test", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/mhenrichsen/alpaca_2k_test", description: "Small Alpaca test set for rapid evaluation" },
  { id: "hf-1130", name: "jondurbin/truthy-dpo-v0.1", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/jondurbin/truthy-dpo-v0.1", description: "Truthfulness DPO preference training" },
  { id: "gh-1131", name: "mistralai/mistral-finetune", source: "github", category: "training-tools", url: "https://github.com/mistralai/mistral-finetune", description: "Mistral official fine-tuning codebase" },
  { id: "gh-1132", name: "pytorch/torchtune", source: "github", category: "training-tools", url: "https://github.com/pytorch/torchtune", description: "TorchTune PyTorch native LLM fine-tuning" },
  { id: "gh-1133", name: "pytorch/torchchat", source: "github", category: "training-tools", url: "https://github.com/pytorch/torchchat", description: "TorchChat run LLMs locally with PyTorch" },
  { id: "gh-1134", name: "janhq/jan", source: "github", category: "agent-tools", url: "https://github.com/janhq/jan", description: "Jan open-source ChatGPT alternative local" },
  { id: "gh-1135", name: "continuedev/continue", source: "github", category: "agent-tools", url: "https://github.com/continuedev/continue", description: "Continue open-source AI code assistant" },
  { id: "hf-1136", name: "bigbio/living_ner", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/living_ner", description: "Living NER species mention recognition" },
  { id: "hf-1137", name: "bigbio/seth_corpus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/seth_corpus", description: "SETH SNP and mutation extraction" },
  { id: "hf-1138", name: "bigbio/variome", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/variome", description: "Variome biomedical variation extraction" },
  { id: "hf-1139", name: "bigbio/scicite_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/allenai/scicite", description: "SciCite v2 citation intent classification" },
  { id: "hf-1140", name: "bigbio/bc4chemd", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bc4chemd", description: "BioCreative IV chemical NER and indexing" },
  { id: "gh-1141", name: "mediar-ai/screenpipe", source: "github", category: "agent-tools", url: "https://github.com/mediar-ai/screenpipe", description: "ScreenPipe AI screen and audio capture" },
  { id: "gh-1142", name: "significant-gravitas/autogpt-forge", source: "github", category: "agent-tools", url: "https://github.com/Significant-Gravitas/AutoGPT", description: "AutoGPT Forge agent building framework" },
  { id: "gh-1143", name: "eth-sri/lmql", source: "github", category: "training-tools", url: "https://github.com/eth-sri/lmql", description: "LMQL query language for language models" },
  { id: "gh-1144", name: "NVIDIA/GenerativeAI-TRT", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/TensorRT-LLM", description: "TensorRT-LLM optimized inference engine" },
  { id: "gh-1145", name: "tensorchord/pgvecto.rs", source: "github", category: "rag-tools", url: "https://github.com/tensorchord/pgvecto.rs", description: "pgvecto.rs Rust vector extension for PostgreSQL" },
  { id: "gh-1146", name: "lancedb/lancedb", source: "github", category: "rag-tools", url: "https://github.com/lancedb/lancedb", description: "LanceDB serverless vector database" },
  { id: "gh-1147", name: "marqo-ai/marqo", source: "github", category: "rag-tools", url: "https://github.com/marqo-ai/marqo", description: "Marqo tensor search for multimodal retrieval" },
  { id: "gh-1148", name: "vespa-engine/vespa", source: "github", category: "rag-tools", url: "https://github.com/vespa-engine/vespa", description: "Vespa big data serving and search engine" },
  { id: "gh-1149", name: "typesense/typesense", source: "github", category: "rag-tools", url: "https://github.com/typesense/typesense", description: "Typesense fast search engine with vector support" },
  { id: "gh-1150", name: "meilisearch/meilisearch", source: "github", category: "rag-tools", url: "https://github.com/meilisearch/meilisearch", description: "Meilisearch fast search for medical records" },
  { id: "hf-1151", name: "deepset/roberta-base-squad2", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepset/roberta-base-squad2", description: "RoBERTa for extractive medical QA" },
  { id: "hf-1152", name: "deepset/tinyroberta-squad2", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepset/tinyroberta-squad2", description: "TinyRoBERTa efficient extractive QA" },
  { id: "hf-1153", name: "Intel/dynamic_tinybert", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Intel/dynamic_tinybert", description: "Dynamic TinyBERT for edge medical deployment" },
  { id: "hf-1154", name: "cross-encoder/ms-marco-MiniLM-L-12-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/cross-encoder/ms-marco-MiniLM-L-12-v2", description: "Cross-encoder for medical passage reranking" },
  { id: "hf-1155", name: "BAAI/bge-reranker-v2-m3", source: "huggingface", category: "embedding", url: "https://huggingface.co/BAAI/bge-reranker-v2-m3", description: "BGE reranker for medical document relevance" },
  { id: "hf-1156", name: "jinaai/jina-reranker-v2-base-multilingual", source: "huggingface", category: "embedding", url: "https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual", description: "Jina multilingual reranker for medical search" },
  { id: "hf-1157", name: "Cohere/rerank-english-v3.0", source: "huggingface", category: "embedding", url: "https://huggingface.co/Cohere/rerank-english-v3.0", description: "Cohere reranker for precision medical retrieval" },
  { id: "gh-1158", name: "FlashInfer/flashinfer", source: "github", category: "training-tools", url: "https://github.com/flashinfer-ai/flashinfer", description: "FlashInfer kernel library for LLM serving" },
  { id: "gh-1159", name: "punica-ai/punica", source: "github", category: "training-tools", url: "https://github.com/punica-ai/punica", description: "Punica multi-LoRA serving for multiple adapters" },
  { id: "gh-1160", name: "S-LoRA/S-LoRA", source: "github", category: "training-tools", url: "https://github.com/S-LoRA/S-LoRA", description: "S-LoRA scalable serving of many LoRA adapters" },
  { id: "gh-1161", name: "SJTU-IPADS/PowerInfer", source: "github", category: "training-tools", url: "https://github.com/SJTU-IPADS/PowerInfer", description: "PowerInfer fast LLM inference on consumer GPUs" },
  { id: "gh-1162", name: "InternLM/InternLM", source: "github", category: "general-llm", url: "https://github.com/InternLM/InternLM", description: "InternLM open-source LLM for tool use" },
  { id: "gh-1163", name: "togethercomputer/RedPajama-Data", source: "github", category: "general-dataset", url: "https://github.com/togethercomputer/RedPajama-Data", description: "RedPajama data recipes for pre-training" },
  { id: "hf-1164", name: "cerebras/btlm-3b-8k-base", source: "huggingface", category: "general-llm", url: "https://huggingface.co/cerebras/btlm-3b-8k-base", description: "BTLM 3B efficient model from Cerebras" },
  { id: "hf-1165", name: "TinyLlama/TinyLlama-1.1B-Chat-v1.0", source: "huggingface", category: "general-llm", url: "https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0", description: "TinyLlama 1.1B for lightweight medical chat" },
  { id: "hf-1166", name: "HuggingFaceTB/SmolLM2-1.7B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct", description: "SmolLM2 tiny model for edge medical devices" },
  { id: "hf-1167", name: "Qwen/Qwen2.5-0.5B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct", description: "Qwen 2.5 0.5B for ultra-lightweight medical" },
  { id: "hf-1168", name: "Qwen/Qwen2.5-1.5B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct", description: "Qwen 2.5 1.5B for mobile medical inference" },
  { id: "hf-1169", name: "microsoft/Phi-3.5-MoE-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/Phi-3.5-MoE-instruct", description: "Phi 3.5 MoE for efficient medical reasoning" },
  { id: "hf-1170", name: "google/gemma-2-2b-it", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-2-2b-it", description: "Gemma 2 2B tiny model for rapid prototyping" },
  { id: "gh-1171", name: "THUDM/CogAgent", source: "github", category: "agent-tools", url: "https://github.com/THUDM/CogAgent", description: "CogAgent visual language GUI agent" },
  { id: "gh-1172", name: "OpenBMB/XAgent", source: "github", category: "agent-tools", url: "https://github.com/OpenBMB/XAgent", description: "XAgent autonomous agent for complex tasks" },
  { id: "gh-1173", name: "normal-computing/fuyu-8b", source: "github", category: "vision", url: "https://github.com/adept-ai/fuyu-heavy", description: "Fuyu multimodal understanding without adapters" },
  { id: "gh-1174", name: "apple/ml-4m", source: "github", category: "vision", url: "https://github.com/apple/ml-4m", description: "4M massively multimodal masked modeling" },
  { id: "gh-1175", name: "OpenGVLab/LLaMA-Adapter", source: "github", category: "vision", url: "https://github.com/OpenGVLab/LLaMA-Adapter", description: "LLaMA-Adapter efficient visual instruction tuning" },
  { id: "fin-1176", name: "SALT-NLP/FLARE", source: "github", category: "finance-tools", url: "https://github.com/SALT-NLP/FLARE", description: "FLARE financial language assessment and reasoning" },
  { id: "fin-1177", name: "FinancialSupport/FinanceBench", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/PatronusAI/financebench", description: "FinanceBench open financial QA benchmark" },
  { id: "fin-1178", name: "ChanceFocus/PIXIU-v2", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/ChanceFocus/PIXIU", description: "PIXIU v2 comprehensive financial benchmark" },
  { id: "gh-1179", name: "openai/tiktoken", source: "github", category: "training-tools", url: "https://github.com/openai/tiktoken", description: "Tiktoken fast BPE tokenizer for OpenAI models" },
  { id: "gh-1180", name: "google/sentencepiece", source: "github", category: "training-tools", url: "https://github.com/google/sentencepiece", description: "SentencePiece unsupervised text tokenizer" },
  { id: "hf-1181", name: "FreedomIntelligence/ReasoningMedQA", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/FreedomIntelligence/medical_o1_reasoning_SFT", description: "Medical reasoning QA with chain of thought" },
  { id: "hf-1182", name: "AGBonnet/augmented_clinical_notes", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/AGBonnet/augmented_clinical_notes", description: "Augmented clinical notes for training" },
  { id: "hf-1183", name: "UCSD-AI4H/drugbank", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/UCSD-AI4H/drugbank", description: "DrugBank drug information for pharma NLP" },
  { id: "hf-1184", name: "Tessa1/IU-Xray", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/Tessa1/IU-Xray", description: "Indiana University chest X-ray reports" },
  { id: "hf-1185", name: "alkzar90/NIH-Chest-X-ray-dataset", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/alkzar90/NIH-Chest-X-ray-dataset", description: "NIH chest X-ray 14 classification labels" },
  { id: "gh-1186", name: "bowang-lab/scGPT", source: "github", category: "medical-tools", url: "https://github.com/bowang-lab/scGPT", description: "scGPT single-cell foundation model" },
  { id: "gh-1187", name: "microsoft/BioGPT", source: "github", category: "medical-llm", url: "https://github.com/microsoft/BioGPT", description: "BioGPT training and inference code" },
  { id: "gh-1188", name: "WongKinYiu/yolov9", source: "github", category: "vision", url: "https://github.com/WongKinYiu/yolov9", description: "YOLOv9 for real-time endoscopic detection" },
  { id: "gh-1189", name: "SysCV/sam-hq", source: "github", category: "vision", url: "https://github.com/SysCV/sam-hq", description: "SAM-HQ high quality segment anything" },
  { id: "gh-1190", name: "IDEA-Research/Grounded-Segment-Anything", source: "github", category: "vision", url: "https://github.com/IDEA-Research/Grounded-Segment-Anything", description: "Grounded SAM detect and segment anything" },
  { id: "hf-1191", name: "mosaicml/mpt-7b-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mosaicml/mpt-7b-instruct", description: "MPT-7B instruction-tuned model" },
  { id: "hf-1192", name: "lmsys/vicuna-13b-v1.5", source: "huggingface", category: "general-llm", url: "https://huggingface.co/lmsys/vicuna-13b-v1.5", description: "Vicuna 13B conversational model" },
  { id: "hf-1193", name: "THUDM/chatglm3-6b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/THUDM/chatglm3-6b", description: "ChatGLM3 bilingual language model" },
  { id: "hf-1194", name: "baichuan-inc/Baichuan2-13B-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/baichuan-inc/Baichuan2-13B-Chat", description: "Baichuan2 Chinese-English medical model" },
  { id: "hf-1195", name: "FlagAlpha/Llama2-Chinese-13b-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/FlagAlpha/Llama2-Chinese-13b-Chat", description: "Chinese Llama2 for multilingual medical" },
  { id: "hf-1196", name: "RWKV/rwkv-5-world-3b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/RWKV/rwkv-5-world-3b", description: "RWKV-5 linear transformer for efficient inference" },
  { id: "hf-1197", name: "state-spaces/mamba-2.8b-hf", source: "huggingface", category: "general-llm", url: "https://huggingface.co/state-spaces/mamba-2.8b-hf", description: "Mamba state space model for long sequences" },
  { id: "hf-1198", name: "microsoft/phi-1_5", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/phi-1_5", description: "Phi-1.5 textbook quality small model" },
  { id: "hf-1199", name: "trl-lib/ultrafeedback_binarized", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/trl-lib/ultrafeedback_binarized", description: "UltraFeedback for TRL DPO training" },
  { id: "hf-1200", name: "tatsu-lab/alpaca_eval", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/tatsu-lab/alpaca_eval", description: "AlpacaEval automatic LLM evaluation" },
  { id: "gh-1201", name: "tatsu-lab/alpaca_eval", source: "github", category: "training-tools", url: "https://github.com/tatsu-lab/alpaca_eval", description: "AlpacaEval automated evaluation framework" },
  { id: "gh-1202", name: "bigcode-project/bigcode-evaluation-harness", source: "github", category: "training-tools", url: "https://github.com/bigcode-project/bigcode-evaluation-harness", description: "BigCode evaluation for code generation" },
  { id: "gh-1203", name: "GAIR-NLP/factool", source: "github", category: "training-tools", url: "https://github.com/GAIR-NLP/factool", description: "FacTool factuality detection for medical LLMs" },
  { id: "gh-1204", name: "vectara/hallucination-leaderboard", source: "github", category: "training-tools", url: "https://github.com/vectara/hallucination-leaderboard", description: "Hallucination evaluation for medical safety" },
  { id: "gh-1205", name: "project-baize/baize-chatbot", source: "github", category: "medical-llm", url: "https://github.com/project-baize/baize-chatbot", description: "Baize self-chat for medical dialogue training" },
  { id: "gh-1206", name: "lucidrains/DALLE2-pytorch", source: "github", category: "vision", url: "https://github.com/lucidrains/DALLE2-pytorch", description: "DALL-E 2 for synthetic medical image generation" },
  { id: "gh-1207", name: "NVlabs/edm2", source: "github", category: "vision", url: "https://github.com/NVlabs/edm2", description: "EDM2 diffusion for high-quality image synthesis" },
  { id: "hf-1208", name: "bigbio/blurb_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/blurb", description: "BLURB v2 biomedical NLP benchmark update" },
  { id: "hf-1209", name: "bigbio/chem_prot_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/chemprot", description: "ChemProt v2 chemical-protein interactions" },
  { id: "hf-1210", name: "bigbio/bc5cdr_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bc5cdr", description: "BC5CDR v2 chemical disease relation update" },
  { id: "gh-1211", name: "vllm-project/production-stack", source: "github", category: "training-tools", url: "https://github.com/vllm-project/production-stack", description: "vLLM production deployment stack" },
  { id: "gh-1212", name: "ray-project/ray-llm", source: "github", category: "training-tools", url: "https://github.com/ray-project/ray-llm", description: "Ray LLM serving and scaling" },
  { id: "hf-1213", name: "Qwen/Qwen2.5-Coder-32B-Instruct", source: "huggingface", category: "code-model", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct", description: "Qwen Coder 32B for complex medical software" },
  { id: "hf-1214", name: "deepseek-ai/DeepSeek-V3", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-V3", description: "DeepSeek V3 MoE 685B params flagship model" },
  { id: "gh-1215", name: "stanford-oval/storm", source: "github", category: "agent-tools", url: "https://github.com/stanford-oval/storm", description: "STORM automated Wikipedia-style article writing" },
  { id: "gh-1216", name: "BradyFU/Awesome-Multimodal-Large-Language-Models", source: "github", category: "vision", url: "https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models", description: "Curated list of multimodal LLMs" },
  { id: "hf-1217", name: "HuggingFaceH4/zephyr-7b-gemma-v0.1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/HuggingFaceH4/zephyr-7b-gemma-v0.1", description: "Zephyr Gemma aligned chat model" },
  { id: "hf-1218", name: "mlx-community/Llama-3.2-3B-Instruct-4bit", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mlx-community/Llama-3.2-3B-Instruct-4bit", description: "MLX quantized Llama for Apple Silicon medical" },
  { id: "hf-1219", name: "unsloth/Llama-3.2-3B-Instruct-bnb-4bit", source: "huggingface", category: "general-llm", url: "https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-bnb-4bit", description: "Unsloth quantized Llama for efficient training" },
  { id: "hf-1220", name: "unsloth/Mistral-7B-Instruct-v0.3-bnb-4bit", source: "huggingface", category: "general-llm", url: "https://huggingface.co/unsloth/Mistral-7B-Instruct-v0.3-bnb-4bit", description: "Unsloth quantized Mistral for QLoRA" },
  { id: "gh-1221", name: "meta-llama/llama-stack", source: "github", category: "training-tools", url: "https://github.com/meta-llama/llama-stack", description: "Llama Stack standardized LLM components" },
  { id: "gh-1222", name: "meta-llama/llama-models", source: "github", category: "training-tools", url: "https://github.com/meta-llama/llama-models", description: "Llama model weights and utilities" },
  { id: "gh-1223", name: "google-deepmind/penzai", source: "github", category: "training-tools", url: "https://github.com/google-deepmind/penzai", description: "Penzai JAX neural network toolkit" },
  { id: "gh-1224", name: "huggingface/nanotron", source: "github", category: "training-tools", url: "https://github.com/huggingface/nanotron", description: "Nanotron efficient LLM pre-training" },
  { id: "gh-1225", name: "databricks/megablocks", source: "github", category: "training-tools", url: "https://github.com/databricks/megablocks", description: "MegaBlocks efficient MoE training" },
  { id: "hf-1226", name: "Nexusflow/Athene-V2-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Nexusflow/Athene-V2-Chat", description: "Athene V2 advanced reasoning model" },
  { id: "hf-1227", name: "NovaSky-AI/Sky-T1-32B-Preview", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NovaSky-AI/Sky-T1-32B-Preview", description: "Sky-T1 reasoning model for complex tasks" },
  { id: "gh-1228", name: "FlagOpen/FlagEmbedding", source: "github", category: "embedding", url: "https://github.com/FlagOpen/FlagEmbedding", description: "FlagEmbedding BGE models training and evaluation" },
  { id: "gh-1229", name: "UKPLab/sentence-transformers", source: "github", category: "embedding", url: "https://github.com/UKPLab/sentence-transformers", description: "Sentence Transformers framework for embeddings" },
  { id: "gh-1230", name: "FlagOpen/FlagPerf", source: "github", category: "training-tools", url: "https://github.com/FlagOpen/FlagPerf", description: "FlagPerf AI hardware performance benchmark" },
  { id: "hf-1231", name: "medical/ENT-audiogram-dataset", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/audiogram-classification", description: "Audiogram classification for hearing assessment" },
  { id: "hf-1232", name: "medical/vestibular-nystagmus", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/nystagmus-tracking", description: "Vestibular nystagmus eye tracking data" },
  { id: "hf-1233", name: "medical/cochlear-implant-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/cochlear-outcomes", description: "Cochlear implant outcome prediction data" },
  { id: "hf-1234", name: "medical/rhinosinusitis-ct", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/sinus-ct-scoring", description: "Rhinosinusitis CT scoring Lund-Mackay data" },
  { id: "hf-1235", name: "medical/tonsillectomy-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/tonsillectomy-outcomes", description: "Tonsillectomy surgical outcomes dataset" },
  { id: "hf-1236", name: "medical/OSAS-polysomnography", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/osa-severity", description: "Obstructive sleep apnea severity classification" },
  { id: "hf-1237", name: "medical/dysphagia-classification", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/dysphagia-grading", description: "Dysphagia severity grading from FEES" },
  { id: "hf-1238", name: "medical/head-neck-lymph-node", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/lymph-node-classification", description: "Head neck lymph node metastasis classification" },
  { id: "hf-1239", name: "medical/parotid-tumor-mri", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/parotid-mri", description: "Parotid gland tumor MRI classification" },
  { id: "hf-1240", name: "medical/sinonasal-polyp-scoring", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/nasal-polyp-scoring", description: "Sinonasal polyp endoscopic scoring dataset" },
  { id: "gh-1241", name: "bowang-lab/U-Mamba", source: "github", category: "medical-tools", url: "https://github.com/bowang-lab/U-Mamba", description: "U-Mamba state space model for medical segmentation" },
  { id: "gh-1242", name: "ge-xing/SegMamba", source: "github", category: "medical-tools", url: "https://github.com/ge-xing/SegMamba", description: "SegMamba long-range 3D medical segmentation" },
  { id: "gh-1243", name: "Project-MONAI/GenerativeModels", source: "github", category: "medical-tools", url: "https://github.com/Project-MONAI/GenerativeModels", description: "MONAI Generative for medical image synthesis" },
  { id: "gh-1244", name: "microsoft/Med-Flamingo", source: "github", category: "medical-llm", url: "https://github.com/snap-stanford/med-flamingo", description: "Med-Flamingo few-shot medical VQA" },
  { id: "gh-1245", name: "haotian-liu/LLaVA-Med", source: "github", category: "medical-llm", url: "https://github.com/microsoft/LLaVA-Med", description: "LLaVA-Med large language and vision assistant" },
  { id: "hf-1246", name: "xmcmic/PMC-VQA-v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/xmcmic/PMC-VQA", description: "PMC-VQA v2 expanded medical visual QA" },
  { id: "hf-1247", name: "axiong/pmc_oa_beta", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/axiong/pmc_oa_beta", description: "PMC Open Access beta image-text pairs" },
  { id: "hf-1248", name: "openbmb/OmniMedVQA", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/openbmb/OmniMedVQA", description: "OmniMedVQA comprehensive medical VQA benchmark" },
  { id: "hf-1249", name: "derek-thomas/ScienceQA-Medical", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/derek-thomas/ScienceQA", description: "ScienceQA medical subset for reasoning" },
  { id: "hf-1250", name: "MMMU/MMMU-Medical", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/MMMU/MMMU", description: "MMMU medical subset multimodal understanding" },
  { id: "gh-1251", name: "bids-standard/bids-specification", source: "github", category: "medical-tools", url: "https://github.com/bids-standard/bids-specification", description: "BIDS brain imaging data structure standard" },
  { id: "gh-1252", name: "dipy/dipy", source: "github", category: "medical-tools", url: "https://github.com/dipy/dipy", description: "DIPY diffusion imaging for brain studies" },
  { id: "gh-1253", name: "ANTsX/ANTsPy", source: "github", category: "medical-tools", url: "https://github.com/ANTsX/ANTsPy", description: "ANTsPy image registration and segmentation" },
  { id: "gh-1254", name: "freesurfer/freesurfer", source: "github", category: "medical-tools", url: "https://github.com/freesurfer/freesurfer", description: "FreeSurfer brain MRI analysis suite" },
  { id: "gh-1255", name: "MASILab/SyntheticTumor", source: "github", category: "medical-tools", url: "https://github.com/MASILab/SyntheticTumor", description: "Synthetic tumor generation for data augmentation" },
  { id: "hf-1256", name: "emreyalcin/turkish-medical-qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/emreyalcin/turkish-medical-qa", description: "Turkish medical QA dataset" },
  { id: "hf-1257", name: "FreedomIntelligence/MMedC", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/FreedomIntelligence/MMedC", description: "Massive multilingual medical corpus" },
  { id: "hf-1258", name: "FreedomIntelligence/MMedBench", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/FreedomIntelligence/MMedBench", description: "Multilingual medical benchmark evaluation" },
  { id: "hf-1259", name: "BAAI/Aquila2-34B-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/BAAI/Aquila2-34B", description: "Aquila2 bilingual model from BAAI" },
  { id: "hf-1260", name: "deepseek-ai/DeepSeek-R1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1", description: "DeepSeek R1 reasoning model 671B MoE" },
  { id: "gh-1261", name: "bigscience-workshop/Megatron-DeepSpeed", source: "github", category: "training-tools", url: "https://github.com/bigscience-workshop/Megatron-DeepSpeed", description: "Megatron-DeepSpeed distributed training" },
  { id: "gh-1262", name: "facebookresearch/llama", source: "github", category: "general-llm", url: "https://github.com/facebookresearch/llama", description: "LLaMA original model code and inference" },
  { id: "gh-1263", name: "EleutherAI/gpt-neox", source: "github", category: "general-llm", url: "https://github.com/EleutherAI/gpt-neox", description: "GPT-NeoX open-source LLM training library" },
  { id: "hf-1264", name: "BioMistral/BioMistral-MedNER-7B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/BioMistral/BioMistral-7B", description: "BioMistral fine-tuned for medical NER" },
  { id: "hf-1265", name: "ContactDoctor/Bio-Medical-MultiModal-Llama-3-8B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/ContactDoctor/Bio-Medical-MultiModal-Llama-3-8B", description: "Multimodal Bio-Medical Llama 3" },
  { id: "gh-1266", name: "MedCAI/InternMedical", source: "github", category: "medical-llm", url: "https://github.com/OpenGVLab/InternVL", description: "InternMedical specialized medical VLM" },
  { id: "gh-1267", name: "shibing624/MedicalGPT", source: "github", category: "medical-llm", url: "https://github.com/shibing624/MedicalGPT", description: "MedicalGPT training pipeline for medical LLMs" },
  { id: "gh-1268", name: "FreedomIntelligence/HuatuoGPT-II", source: "github", category: "medical-llm", url: "https://github.com/FreedomIntelligence/HuatuoGPT-II", description: "HuatuoGPT-II one-stage medical LLM training" },
  { id: "hf-1269", name: "microsoft/table-transformer-detection", source: "huggingface", category: "vision", url: "https://huggingface.co/microsoft/table-transformer-detection", description: "Table detection for medical document parsing" },
  { id: "hf-1270", name: "google/owlv2-base-patch16-ensemble", source: "huggingface", category: "vision", url: "https://huggingface.co/google/owlv2-base-patch16-ensemble", description: "OWLv2 open-vocabulary object detection" },
  { id: "hf-1271", name: "IDEA-Research/grounding-dino-base", source: "huggingface", category: "vision", url: "https://huggingface.co/IDEA-Research/grounding-dino-base", description: "Grounding DINO open-set object detection" },
  { id: "gh-1272", name: "IDEA-Research/GroundingDINO", source: "github", category: "vision", url: "https://github.com/IDEA-Research/GroundingDINO", description: "Grounding DINO text-guided object detection" },
  { id: "gh-1273", name: "openai/CLIP", source: "github", category: "vision", url: "https://github.com/openai/CLIP", description: "CLIP contrastive language-image pre-training" },
  { id: "gh-1274", name: "mlfoundations/open_clip", source: "github", category: "vision", url: "https://github.com/mlfoundations/open_clip", description: "OpenCLIP open-source CLIP training" },
  { id: "hf-1275", name: "jinaai/jina-clip-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/jinaai/jina-clip-v2", description: "Jina CLIP v2 for medical image-text matching" },
  { id: "gh-1276", name: "AILab-CVC/YOLO-World", source: "github", category: "vision", url: "https://github.com/AILab-CVC/YOLO-World", description: "YOLO-World open-vocabulary real-time detection" },
  { id: "gh-1277", name: "ashawkey/stable-dreamfusion", source: "github", category: "vision", url: "https://github.com/ashawkey/stable-dreamfusion", description: "Stable DreamFusion text-to-3D for medical viz" },
  { id: "hf-1278", name: "stabilityai/stable-video-diffusion-img2vid-xt", source: "huggingface", category: "vision", url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt", description: "Stable Video Diffusion for medical animations" },
  { id: "gh-1279", name: "Tencent/HunyuanVideo", source: "github", category: "vision", url: "https://github.com/Tencent/HunyuanVideo", description: "HunyuanVideo text-to-video generation" },
  { id: "hf-1280", name: "black-forest-labs/FLUX.1-dev", source: "huggingface", category: "vision", url: "https://huggingface.co/black-forest-labs/FLUX.1-dev", description: "FLUX.1 state-of-the-art image generation" },
  { id: "gh-1281", name: "NVIDIA/NeMo-Run", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/NeMo-Run", description: "NeMo Run experiment management and scaling" },
  { id: "hf-1282", name: "deepseek-ai/Janus-Pro-7B", source: "huggingface", category: "vision", url: "https://huggingface.co/deepseek-ai/Janus-Pro-7B", description: "Janus Pro multimodal understanding and generation" },
  { id: "gh-1283", name: "deepseek-ai/Janus", source: "github", category: "vision", url: "https://github.com/deepseek-ai/Janus", description: "Janus unified visual generation and understanding" },
  { id: "hf-1284", name: "Qwen/Qwen2.5-VL-72B-Instruct", source: "huggingface", category: "vision", url: "https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct", description: "Qwen2.5 VL 72B flagship vision-language model" },
  { id: "gh-1285", name: "QwenLM/Qwen2.5-VL", source: "github", category: "vision", url: "https://github.com/QwenLM/Qwen2.5-VL", description: "Qwen2.5-VL training and inference code" },
  { id: "hf-1286", name: "google/gemma-3-27b-it", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-3-27b-it", description: "Gemma 3 27B latest Google open model" },
  { id: "hf-1287", name: "mistralai/Mistral-Small-24B-Instruct-2501", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mistralai/Mistral-Small-24B-Instruct-2501", description: "Mistral Small 24B for efficient deployment" },
  { id: "gh-1288", name: "unslothai/unsloth-zoo", source: "github", category: "training-tools", url: "https://github.com/unslothai/unsloth-zoo", description: "Unsloth Zoo collection of fine-tuning examples" },
  { id: "hf-1289", name: "unsloth/gemma-3-27b-it-bnb-4bit", source: "huggingface", category: "general-llm", url: "https://huggingface.co/unsloth/gemma-3-27b-it-bnb-4bit", description: "Unsloth quantized Gemma 3 27B for QLoRA" },
  { id: "hf-1290", name: "unsloth/Qwen2.5-32B-Instruct-bnb-4bit", source: "huggingface", category: "general-llm", url: "https://huggingface.co/unsloth/Qwen2.5-32B-Instruct-bnb-4bit", description: "Unsloth quantized Qwen 32B for training" },
  { id: "gh-1291", name: "lucidrains/x-transformers", source: "github", category: "training-tools", url: "https://github.com/lucidrains/x-transformers", description: "X-Transformers concise transformer implementations" },
  { id: "gh-1292", name: "lucidrains/ring-attention-pytorch", source: "github", category: "training-tools", url: "https://github.com/lucidrains/ring-attention-pytorch", description: "Ring Attention for unlimited context length" },
  { id: "gh-1293", name: "Significant-Gravitas/AutoGPT-Plugins", source: "github", category: "agent-tools", url: "https://github.com/Significant-Gravitas/AutoGPT", description: "AutoGPT plugins for agent extension" },
  { id: "gh-1294", name: "smol-ai/developer", source: "github", category: "agent-tools", url: "https://github.com/smol-ai/developer", description: "Smol Developer personal AI assistant" },
  { id: "gh-1295", name: "AntonOsika/gpt-engineer", source: "github", category: "agent-tools", url: "https://github.com/AntonOsika/gpt-engineer", description: "GPT Engineer specify what you want it to build" },
  { id: "hf-1296", name: "CohereForAI/aya-101", source: "huggingface", category: "general-llm", url: "https://huggingface.co/CohereForAI/aya-101", description: "Aya 101 massively multilingual model" },
  { id: "gh-1297", name: "CohereForAI/aya_dataset", source: "github", category: "general-dataset", url: "https://github.com/for-ai/aya_dataset", description: "Aya multilingual instruction dataset 65 languages" },
  { id: "hf-1298", name: "nvidia/Hymba-1.5B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/nvidia/Hymba-1.5B-Instruct", description: "Hymba hybrid mamba transformer architecture" },
  { id: "hf-1299", name: "ai21labs/Jamba-v0.1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/ai21labs/Jamba-v0.1", description: "Jamba SSM-transformer hybrid model" },
  { id: "hf-1300", name: "allenai/OLMoE-1B-7B-0924-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/allenai/OLMoE-1B-7B-0924-Instruct", description: "OLMoE fully open MoE from Allen AI" },
  { id: "gh-1301", name: "state-spaces/mamba", source: "github", category: "training-tools", url: "https://github.com/state-spaces/mamba", description: "Mamba linear-time sequence modeling" },
  { id: "gh-1302", name: "sustcsonglin/flash-linear-attention", source: "github", category: "training-tools", url: "https://github.com/sustcsonglin/flash-linear-attention", description: "Flash Linear Attention efficient training" },
  { id: "gh-1303", name: "BlinkDL/RWKV-LM", source: "github", category: "general-llm", url: "https://github.com/BlinkDL/RWKV-LM", description: "RWKV linear transformer for efficient inference" },
  { id: "gh-1304", name: "ridgerchu/matmulfreellm", source: "github", category: "training-tools", url: "https://github.com/ridgerchu/matmulfreellm", description: "MatMul-Free LLM for efficient medical AI" },
  { id: "gh-1305", name: "huggingface/lerobot", source: "github", category: "agent-tools", url: "https://github.com/huggingface/lerobot", description: "LeRobot real-world robotics with AI" },
  { id: "hf-1306", name: "Medical-AI/CheXagent", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/StanfordAIMI/CheXagent-8b", description: "CheXagent chest X-ray AI analysis agent" },
  { id: "hf-1307", name: "StanfordAIMI/RadBERT-2", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/StanfordAIMI/RadBERT-2", description: "RadBERT-2 improved radiology BERT model" },
  { id: "gh-1308", name: "StanfordAIMI/chexpert-model", source: "github", category: "medical-tools", url: "https://github.com/stanfordmlgroup/CheXpert", description: "CheXpert chest radiograph interpretation" },
  { id: "gh-1309", name: "google-health/imaging-research", source: "github", category: "medical-tools", url: "https://github.com/Google-Health/imaging-research", description: "Google Health medical imaging research" },
  { id: "hf-1310", name: "TencentARC/LLaMA-Pro-8B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/TencentARC/LLaMA-Pro-8B-Instruct", description: "LLaMA-Pro block expansion for progressive learning" },
  { id: "hf-1311", name: "sambanovasystems/SambaLingo-Thai-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/sambanovasystems/SambaLingo-Thai-Chat", description: "SambaLingo multilingual language adaptation" },
  { id: "hf-1312", name: "KnutJaegerworworworwor/Deita-7B-v1.0-sft", source: "huggingface", category: "general-llm", url: "https://huggingface.co/hkust-nlp/deita-7b-v1.0-sft", description: "DEITA data-efficient instruction tuning" },
  { id: "gh-1313", name: "jxnl/openai-function-call", source: "github", category: "agent-tools", url: "https://github.com/jxnl/instructor", description: "OpenAI function calling structured extraction" },
  { id: "gh-1314", name: "modal-labs/modal-examples", source: "github", category: "training-tools", url: "https://github.com/modal-labs/modal-examples", description: "Modal serverless GPU for model training" },
  { id: "gh-1315", name: "skypilot-org/skypilot", source: "github", category: "training-tools", url: "https://github.com/skypilot-org/skypilot", description: "SkyPilot run LLMs on any cloud cheaply" },
  { id: "gh-1316", name: "leptonai/leptonai", source: "github", category: "training-tools", url: "https://github.com/leptonai/leptonai", description: "Lepton AI serverless AI application platform" },
  { id: "gh-1317", name: "replicate/cog", source: "github", category: "training-tools", url: "https://github.com/replicate/cog", description: "Cog container for ML model deployment" },
  { id: "hf-1318", name: "NousResearch/Meta-Llama-3.1-8B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NousResearch/Meta-Llama-3.1-8B-Instruct", description: "NousResearch Llama 3.1 8B finetune base" },
  { id: "hf-1319", name: "cognitivecomputations/dolphin-2.9-llama3-8b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/cognitivecomputations/dolphin-2.9-llama3-8b", description: "Dolphin Llama3 uncensored for research" },
  { id: "hf-1320", name: "teknium/OpenHermes-2.5-Mistral-7B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/teknium/OpenHermes-2.5-Mistral-7B", description: "OpenHermes 2.5 1M instruction model" },
  { id: "gh-1321", name: "abacaj/mamba-chat", source: "github", category: "general-llm", url: "https://github.com/havenhq/mamba-chat", description: "Mamba Chat SSM-based language model chat" },
  { id: "gh-1322", name: "allenai/OLMo", source: "github", category: "general-llm", url: "https://github.com/allenai/OLMo", description: "OLMo fully open language model and training" },
  { id: "gh-1323", name: "stanford-crfm/helm", source: "github", category: "training-tools", url: "https://github.com/stanford-crfm/helm", description: "HELM holistic evaluation of language models" },
  { id: "hf-1324", name: "Open-Orca/Mistral-7B-OpenOrca", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Open-Orca/Mistral-7B-OpenOrca", description: "Mistral 7B fine-tuned on OpenOrca data" },
  { id: "hf-1325", name: "WizardLM/WizardLM-13B-V1.2", source: "huggingface", category: "general-llm", url: "https://huggingface.co/WizardLM/WizardLM-13B-V1.2", description: "WizardLM evolved complexity instructions" },
  { id: "gh-1326", name: "OpenBioML/chemnlp", source: "github", category: "medical-tools", url: "https://github.com/OpenBioML/chemnlp", description: "ChemNLP NLP for chemistry and biomedicine" },
  { id: "gh-1327", name: "NVIDIA/BioNeMo", source: "github", category: "medical-tools", url: "https://github.com/NVIDIA/BioNeMo", description: "NVIDIA BioNeMo drug discovery framework" },
  { id: "hf-1328", name: "mistralai/Codestral-22B-v0.1", source: "huggingface", category: "code-model", url: "https://huggingface.co/mistralai/Codestral-22B-v0.1", description: "Codestral 22B for medical software development" },
  { id: "hf-1329", name: "Qwen/Qwen2.5-Coder-14B-Instruct", source: "huggingface", category: "code-model", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct", description: "Qwen Coder 14B balanced code model" },
  { id: "hf-1330", name: "bigcode/starcoder2-7b", source: "huggingface", category: "code-model", url: "https://huggingface.co/bigcode/starcoder2-7b", description: "StarCoder2 7B efficient code generation" },
  { id: "gh-1331", name: "NExT-GPT/NExT-GPT", source: "github", category: "vision", url: "https://github.com/NExT-GPT/NExT-GPT", description: "NExT-GPT any-to-any multimodal model" },
  { id: "gh-1332", name: "kyutai-labs/moshi", source: "github", category: "voice-model", url: "https://github.com/kyutai-labs/moshi", description: "Moshi real-time speech dialogue model" },
  { id: "gh-1333", name: "fishaudio/fish-speech", source: "github", category: "voice-model", url: "https://github.com/fishaudio/fish-speech", description: "Fish Speech multilingual TTS framework" },
  { id: "gh-1334", name: "2noise/ChatTTS", source: "github", category: "voice-model", url: "https://github.com/2noise/ChatTTS", description: "ChatTTS for conversational text-to-speech" },
  { id: "gh-1335", name: "myshell-ai/OpenVoice", source: "github", category: "voice-model", url: "https://github.com/myshell-ai/OpenVoice", description: "OpenVoice instant voice cloning TTS" },
  { id: "hf-1336", name: "myshell-ai/OpenVoiceV2", source: "huggingface", category: "voice-model", url: "https://huggingface.co/myshell-ai/OpenVoiceV2", description: "OpenVoice V2 improved voice cloning" },
  { id: "hf-1337", name: "amphion/Vevo", source: "huggingface", category: "voice-model", url: "https://huggingface.co/amphion/Vevo", description: "Vevo controllable speech generation" },
  { id: "gh-1338", name: "Zyphra/Zyda-2", source: "github", category: "general-dataset", url: "https://github.com/Zyphra/Zyda-2", description: "Zyda-2 5T token pre-training dataset" },
  { id: "hf-1339", name: "Zyphra/Zyda-2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Zyphra/Zyda-2", description: "Zyda-2 curated open pre-training corpus" },
  { id: "gh-1340", name: "apple/corenet", source: "github", category: "training-tools", url: "https://github.com/apple/corenet", description: "CoreNet Apple deep neural network training library" },
  { id: "hf-1341", name: "apple/OpenELM-3B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/apple/OpenELM-3B-Instruct", description: "OpenELM Apple efficient language model" },
  { id: "gh-1342", name: "biobootloader/mentat", source: "github", category: "agent-tools", url: "https://github.com/AbanteAI/mentat", description: "Mentat AI coding assistant for development" },
  { id: "gh-1343", name: "paul-gauthier/aider", source: "github", category: "agent-tools", url: "https://github.com/paul-gauthier/aider", description: "Aider AI pair programming for medical software" },
  { id: "gh-1344", name: "Pythagora-io/gpt-pilot", source: "github", category: "agent-tools", url: "https://github.com/Pythagora-io/gpt-pilot", description: "GPT Pilot AI developer for full apps" },
  { id: "gh-1345", name: "stitionai/devika", source: "github", category: "agent-tools", url: "https://github.com/stitionai/devika", description: "Devika agentic AI software engineer" },
  { id: "hf-1346", name: "nvidia/Llama-3_1-Nemotron-51B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/nvidia/Llama-3_1-Nemotron-51B-Instruct", description: "Nemotron 51B NVIDIA balanced performance model" },
  { id: "hf-1347", name: "Cohere-AI/c4ai-command-r7b-12-2024", source: "huggingface", category: "general-llm", url: "https://huggingface.co/CohereForAI/c4ai-command-r7b-12-2024", description: "Command R 7B efficient RAG model" },
  { id: "hf-1348", name: "tencent/Tencent-Hunyuan-Large", source: "huggingface", category: "general-llm", url: "https://huggingface.co/tencent/Tencent-Hunyuan-Large", description: "Hunyuan Large MoE from Tencent" },
  { id: "hf-1349", name: "databricks/dbrx-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/databricks/dbrx-instruct", description: "DBRX Instruct open MoE model" },
  { id: "hf-1350", name: "Qwen/Qwen2.5-3B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct", description: "Qwen 2.5 3B compact medical model" },
  { id: "gh-1351", name: "MoonshotAI/Moonlight", source: "github", category: "general-llm", url: "https://github.com/MoonshotAI/Moonlight", description: "Moonlight muon optimizer for LLM training" },
  { id: "hf-1352", name: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", description: "DeepSeek R1 distilled 32B reasoning" },
  { id: "gh-1353", name: "linkedin/Liger-Kernel", source: "github", category: "training-tools", url: "https://github.com/linkedin/Liger-Kernel", description: "Liger-Kernel efficient transformer kernels" },
  { id: "gh-1354", name: "GaParmar/img2img-turbo", source: "github", category: "vision", url: "https://github.com/GaParmar/img2img-turbo", description: "img2img-turbo one-step image translation" },
  { id: "gh-1355", name: "THU-MIG/RepViT", source: "github", category: "vision", url: "https://github.com/THU-MIG/RepViT", description: "RepViT lightweight ViT for mobile medical" },
  { id: "hf-1356", name: "timm/efficientnet_b0.ra_in1k", source: "huggingface", category: "vision", url: "https://huggingface.co/timm/efficientnet_b0.ra_in1k", description: "EfficientNet B0 for efficient medical classification" },
  { id: "hf-1357", name: "timm/convnext_base.fb_in22k_ft_in1k_384", source: "huggingface", category: "vision", url: "https://huggingface.co/timm/convnext_base.fb_in22k_ft_in1k_384", description: "ConvNeXt for modern CNN medical imaging" },
  { id: "gh-1358", name: "huggingface/pytorch-image-models", source: "github", category: "vision", url: "https://github.com/huggingface/pytorch-image-models", description: "timm PyTorch image models collection" },
  { id: "hf-1359", name: "CompVis/stable-diffusion-v1-4", source: "huggingface", category: "vision", url: "https://huggingface.co/CompVis/stable-diffusion-v1-4", description: "Stable Diffusion v1.4 for medical augmentation" },
  { id: "hf-1360", name: "stabilityai/stable-diffusion-xl-base-1.0", source: "huggingface", category: "vision", url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0", description: "SDXL base for high-quality medical image synthesis" },
  { id: "gh-1361", name: "facebookresearch/DiT", source: "github", category: "vision", url: "https://github.com/facebookresearch/DiT", description: "Diffusion Transformers for image generation" },
  { id: "gh-1362", name: "THUDM/ImageReward", source: "github", category: "vision", url: "https://github.com/THUDM/ImageReward", description: "ImageReward learning for image generation quality" },
  { id: "hf-1363", name: "medical-ENT/otoscope-classification-v2", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/otoscope-v2", description: "Otoscope image classification v2 expanded" },
  { id: "hf-1364", name: "medical-ENT/stroboscopy-frames", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/stroboscopy-frames", description: "Laryngeal stroboscopy video frames dataset" },
  { id: "hf-1365", name: "medical-ENT/hearing-aid-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/hearing-aid-outcomes", description: "Hearing aid fitting and outcome data" },
  { id: "hf-1366", name: "medical-ENT/temporal-bone-ct", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/temporal-bone-ct", description: "Temporal bone CT segmentation for otology" },
  { id: "hf-1367", name: "medical-ENT/epistaxis-classification", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/epistaxis-grading", description: "Epistaxis severity classification and management" },
  { id: "hf-1368", name: "medical-ENT/neck-mass-ultrasound", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/neck-mass-us", description: "Neck mass ultrasound classification dataset" },
  { id: "hf-1369", name: "medical-ENT/sialendoscopy-images", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/sialendoscopy", description: "Sialendoscopy salivary gland imaging dataset" },
  { id: "hf-1370", name: "medical-ENT/DISE-classification", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/drug-induced-sleep-endoscopy", description: "Drug-induced sleep endoscopy classification" },
  { id: "gh-1371", name: "alibaba/FunAudioLLM", source: "github", category: "voice-model", url: "https://github.com/FunAudioLLM/SenseVoice", description: "SenseVoice multilingual speech understanding" },
  { id: "hf-1372", name: "FunAudioLLM/SenseVoiceSmall", source: "huggingface", category: "voice-model", url: "https://huggingface.co/FunAudioLLM/SenseVoiceSmall", description: "SenseVoice Small efficient speech recognition" },
  { id: "gh-1373", name: "FunAudioLLM/CosyVoice", source: "github", category: "voice-model", url: "https://github.com/FunAudioLLM/CosyVoice", description: "CosyVoice multilingual speech synthesis" },
  { id: "hf-1374", name: "FunAudioLLM/CosyVoice2-0.5B", source: "huggingface", category: "voice-model", url: "https://huggingface.co/FunAudioLLM/CosyVoice2-0.5B", description: "CosyVoice2 compact speech synthesis model" },
  { id: "gh-1375", name: "Plachtaa/VALL-E-X", source: "github", category: "voice-model", url: "https://github.com/Plachtaa/VALL-E-X", description: "VALL-E X multilingual text-to-speech synthesis" },
  { id: "hf-1376", name: "WhisperSpeech/WhisperSpeech", source: "huggingface", category: "voice-model", url: "https://huggingface.co/WhisperSpeech/WhisperSpeech", description: "WhisperSpeech inverse text to speech model" },
  { id: "gh-1377", name: "RVC-Boss/GPT-SoVITS", source: "github", category: "voice-model", url: "https://github.com/RVC-Boss/GPT-SoVITS", description: "GPT-SoVITS few-shot voice conversion TTS" },
  { id: "hf-1378", name: "espnet/owsm_v3.1_ebf", source: "huggingface", category: "voice-model", url: "https://huggingface.co/espnet/owsm_v3.1_ebf", description: "Open Whisper-Style Model multilingual ASR" },
  { id: "gh-1379", name: "modelscope/ClearerVoice-Studio", source: "github", category: "voice-model", url: "https://github.com/modelscope/ClearerVoice-Studio", description: "ClearerVoice speech enhancement and separation" },
  { id: "hf-1380", name: "nvidia/parakeet-tdt-0.6b-v2", source: "huggingface", category: "voice-model", url: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2", description: "NVIDIA Parakeet TDT compact ASR model" },
  { id: "gh-1381", name: "AI4Finance-Foundation/FinAgent", source: "github", category: "finance-tools", url: "https://github.com/AI4Finance-Foundation/FinAgent", description: "FinAgent multimodal financial trading agent" },
  { id: "gh-1382", name: "TradingAgents-AI/TradingAgents", source: "github", category: "finance-tools", url: "https://github.com/TradingAgents-AI/TradingAgents", description: "TradingAgents multi-agent stock trading" },
  { id: "fin-1383", name: "Multilingual-Multimodal-NLP/FinTruthQA", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/Multilingual-Multimodal-NLP/FinTruthQA", description: "Financial truthfulness QA benchmark" },
  { id: "fin-1384", name: "NousResearch/finance-alpaca", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/NousResearch/finance-alpaca", description: "Finance instruction tuning dataset" },
  { id: "fin-1385", name: "virattt/financial-qa-10K", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/virattt/financial-qa-10K", description: "Financial 10-K document QA dataset" },
  { id: "gh-1386", name: "microsoft/BitNet", source: "github", category: "training-tools", url: "https://github.com/microsoft/BitNet", description: "BitNet 1-bit LLM inference framework" },
  { id: "gh-1387", name: "ggerganov/whisper.cpp", source: "github", category: "voice-model", url: "https://github.com/ggerganov/whisper.cpp", description: "Whisper.cpp efficient C++ speech recognition" },
  { id: "gh-1388", name: "ggerganov/ggml", source: "github", category: "training-tools", url: "https://github.com/ggerganov/ggml", description: "GGML tensor library for machine learning" },
  { id: "hf-1389", name: "medical-datasets/anatomy-qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/anatomy-qa", description: "Human anatomy QA for medical education" },
  { id: "hf-1390", name: "medical-datasets/surgical-notes", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/surgical-notes-nlp", description: "Surgical operative note NLP dataset" },
  { id: "hf-1391", name: "medical-datasets/icd10-coding", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/icd10-coding", description: "ICD-10 automated coding from clinical text" },
  { id: "hf-1392", name: "medical-datasets/radiology-report-gen", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/radiology-report-generation", description: "Radiology report generation from images" },
  { id: "hf-1393", name: "medical-datasets/clinical-trial-matching", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/clinical-trial-matching", description: "Clinical trial patient matching dataset" },
  { id: "hf-1394", name: "medical-datasets/drug-interaction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/drug-interaction-prediction", description: "Drug-drug interaction prediction dataset" },
  { id: "hf-1395", name: "medical-datasets/patient-discharge-summary", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/discharge-summary-generation", description: "Patient discharge summary generation data" },
  { id: "gh-1396", name: "huggingface/smolagents", source: "github", category: "agent-tools", url: "https://github.com/huggingface/smolagents", description: "SmolAgents minimal AI agent framework" },
  { id: "gh-1397", name: "browser-use/browser-use", source: "github", category: "agent-tools", url: "https://github.com/browser-use/browser-use", description: "Browser Use AI web automation agent" },
  { id: "gh-1398", name: "webai-dev/web-agent", source: "github", category: "agent-tools", url: "https://github.com/anthropics/anthropic-quickstarts", description: "Anthropic web agent quickstart examples" },
  { id: "gh-1399", name: "roboflow/maestro", source: "github", category: "vision", url: "https://github.com/roboflow/maestro", description: "Maestro computer vision workflow builder" },
  { id: "gh-1400", name: "opendatalab/MinerU", source: "github", category: "rag-tools", url: "https://github.com/opendatalab/MinerU", description: "MinerU PDF to markdown for document processing" },
  { id: "gh-1401", name: "allenai/papermage", source: "github", category: "rag-tools", url: "https://github.com/allenai/papermage", description: "PaperMage scientific document parsing" },
  { id: "hf-1402", name: "microsoft/Phi-4", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/phi-4", description: "Phi-4 14B advanced reasoning model" },
  { id: "gh-1403", name: "abacaj/fine-tuning", source: "github", category: "training-tools", url: "https://github.com/abacaj/fine-tuning", description: "Fine-tuning examples and best practices" },
  { id: "gh-1404", name: "mlabonne/llm-course", source: "github", category: "training-tools", url: "https://github.com/mlabonne/llm-course", description: "LLM course practical fine-tuning guide" },
  { id: "hf-1405", name: "arcee-ai/SuperNova-Medius", source: "huggingface", category: "general-llm", url: "https://huggingface.co/arcee-ai/SuperNova-Medius", description: "SuperNova MoE merged model" },
  { id: "hf-1406", name: "NousResearch/Hermes-3-Llama-3.1-70B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-70B", description: "Hermes 3 70B advanced tool calling" },
  { id: "hf-1407", name: "cfahlgren1/react-artifacts", source: "huggingface", category: "code-model", url: "https://huggingface.co/spaces/cfahlgren1/react-artifacts", description: "React artifact generation for medical UIs" },
  { id: "gh-1408", name: "marimo-team/marimo", source: "github", category: "training-tools", url: "https://github.com/marimo-team/marimo", description: "Marimo reactive Python notebook for data analysis" },
  { id: "gh-1409", name: "jupyter/jupyter", source: "github", category: "training-tools", url: "https://github.com/jupyter/jupyter", description: "Jupyter notebooks for medical ML research" },
  { id: "gh-1410", name: "streamlit/streamlit", source: "github", category: "training-tools", url: "https://github.com/streamlit/streamlit", description: "Streamlit for medical AI dashboards" },
  { id: "gh-1411", name: "gradio-app/gradio", source: "github", category: "training-tools", url: "https://github.com/gradio-app/gradio", description: "Gradio ML model demo interfaces" },
  { id: "hf-1412", name: "Qwen/Qwen3-8B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen3-8B", description: "Qwen3 latest generation model" },
  { id: "hf-1413", name: "meta-llama/Llama-4-Scout-17B-16E-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct", description: "Llama 4 Scout MoE model" },
  { id: "hf-1414", name: "google/gemma-3-12b-it", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-3-12b-it", description: "Gemma 3 12B balanced model" },
  { id: "hf-1415", name: "mistralai/Mistral-Small-3.1-24B-Instruct-2503", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503", description: "Mistral Small 3.1 latest with vision" },
  { id: "gh-1416", name: "Dao-AILab/flash-attention-3", source: "github", category: "training-tools", url: "https://github.com/Dao-AILab/flash-attention", description: "Flash Attention 3 latest attention optimization" },
  { id: "gh-1417", name: "microsoft/torchscale", source: "github", category: "training-tools", url: "https://github.com/microsoft/torchscale", description: "TorchScale foundation architecture library" },
  { id: "gh-1418", name: "conceptofmind/toolformer", source: "github", category: "agent-tools", url: "https://github.com/lucidrains/toolformer-pytorch", description: "Toolformer LLM that uses tools autonomously" },
  { id: "gh-1419", name: "openai/evals", source: "github", category: "training-tools", url: "https://github.com/openai/evals", description: "OpenAI Evals evaluation framework for LLMs" },
  { id: "hf-1420", name: "FreedomIntelligence/Apollo-7B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/FreedomIntelligence/Apollo-7B", description: "Apollo multilingual medical LLM 6 languages" },
  { id: "gh-1421", name: "FreedomIntelligence/Apollo", source: "github", category: "medical-llm", url: "https://github.com/FreedomIntelligence/Apollo", description: "Apollo medical LLM training and evaluation" },
  { id: "hf-1422", name: "m42-health/Llama3-Med42-8B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/m42-health/Llama3-Med42-8B", description: "Med42 Llama3 clinical-grade medical model" },
  { id: "hf-1423", name: "ReFuelLabs/Refuel-Llama-3-Annotator", source: "huggingface", category: "training-tools", url: "https://huggingface.co/refuel-ai/Llama-3-Annotator", description: "Refuel Llama3 automated data annotation" },
  { id: "gh-1424", name: "refuel-ai/autolabel", source: "github", category: "training-tools", url: "https://github.com/refuel-ai/autolabel", description: "Autolabel LLM-powered data labeling" },
  { id: "gh-1425", name: "run-llama/create-llama", source: "github", category: "rag-tools", url: "https://github.com/run-llama/create-llama", description: "Create LlamaIndex app for RAG applications" },
  { id: "gh-1426", name: "run-llama/llama-parse", source: "github", category: "rag-tools", url: "https://github.com/run-llama/llama_parse", description: "LlamaParse document parsing for RAG" },
  { id: "gh-1427", name: "ollama/ollama-python", source: "github", category: "training-tools", url: "https://github.com/ollama/ollama-python", description: "Ollama Python client library" },
  { id: "gh-1428", name: "ollama/ollama-js", source: "github", category: "training-tools", url: "https://github.com/ollama/ollama-js", description: "Ollama JavaScript client library" },
  { id: "hf-1429", name: "distil-whisper/distil-large-v3", source: "huggingface", category: "voice-model", url: "https://huggingface.co/distil-whisper/distil-large-v3", description: "Distil-Whisper v3 6x faster transcription" },
  { id: "hf-1430", name: "openai/whisper-large-v3-turbo", source: "huggingface", category: "voice-model", url: "https://huggingface.co/openai/whisper-large-v3-turbo", description: "Whisper v3 Turbo fast accurate ASR" },
  { id: "gh-1431", name: "vanna-ai/vanna-streamlit", source: "github", category: "agent-tools", url: "https://github.com/vanna-ai/vanna-streamlit", description: "Vanna text-to-SQL with Streamlit UI" },
  { id: "gh-1432", name: "weaviate/weaviate-python-client", source: "github", category: "rag-tools", url: "https://github.com/weaviate/weaviate-python-client", description: "Weaviate Python client for vector search" },
  { id: "hf-1433", name: "sentence-transformers/all-MiniLM-L12-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2", description: "MiniLM L12 compact embedding for speed" },
  { id: "hf-1434", name: "intfloat/multilingual-e5-large-instruct", source: "huggingface", category: "embedding", url: "https://huggingface.co/intfloat/multilingual-e5-large-instruct", description: "Multilingual E5 for cross-language medical search" },
  { id: "gh-1435", name: "FlashAttention/FlashMLA", source: "github", category: "training-tools", url: "https://github.com/deepseek-ai/FlashMLA", description: "FlashMLA efficient multi-head latent attention" },
  { id: "hf-1436", name: "deepseek-ai/DeepSeek-Prover-V2-671B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-Prover-V2-671B", description: "DeepSeek Prover formal mathematical reasoning" },
  { id: "gh-1437", name: "QwenLM/Qwen-Agent", source: "github", category: "agent-tools", url: "https://github.com/QwenLM/Qwen-Agent", description: "Qwen Agent framework for tool-using AI" },
  { id: "gh-1438", name: "microsoft/TaskWeaver", source: "github", category: "agent-tools", url: "https://github.com/microsoft/TaskWeaver", description: "TaskWeaver code-first agent framework" },
  { id: "gh-1439", name: "google-deepmind/gemma_pytorch", source: "github", category: "general-llm", url: "https://github.com/google/gemma_pytorch", description: "Gemma PyTorch implementation" },
  { id: "hf-1440", name: "Qwen/Qwen2.5-Coder-3B-Instruct", source: "huggingface", category: "code-model", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct", description: "Qwen Coder 3B lightweight code model" },
  { id: "hf-1441", name: "bigcode/starcoder2-3b", source: "huggingface", category: "code-model", url: "https://huggingface.co/bigcode/starcoder2-3b", description: "StarCoder2 3B for efficient code generation" },
  { id: "gh-1442", name: "ultralytics/yolov5", source: "github", category: "vision", url: "https://github.com/ultralytics/yolov5", description: "YOLOv5 for endoscopic instrument detection" },
  { id: "gh-1443", name: "facebookresearch/detr", source: "github", category: "vision", url: "https://github.com/facebookresearch/detr", description: "DETR end-to-end detection with transformers" },
  { id: "gh-1444", name: "IDEA-Research/detrex", source: "github", category: "vision", url: "https://github.com/IDEA-Research/detrex", description: "detrex DETR-based detection research toolbox" },
  { id: "gh-1445", name: "WongKinYiu/yolov7", source: "github", category: "vision", url: "https://github.com/WongKinYiu/yolov7", description: "YOLOv7 trainable bag-of-freebies detection" },
  { id: "hf-1446", name: "facebook/detr-resnet-50", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/detr-resnet-50", description: "DETR ResNet-50 for detection tasks" },
  { id: "hf-1447", name: "facebook/detr-resnet-101", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/detr-resnet-101", description: "DETR ResNet-101 for high-accuracy detection" },
  { id: "gh-1448", name: "facebookresearch/sam2", source: "github", category: "vision", url: "https://github.com/facebookresearch/sam2", description: "SAM 2 segment anything in images and video" },
  { id: "hf-1449", name: "facebook/sam2-hiera-large", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/sam2-hiera-large", description: "SAM 2 Hiera large for medical segmentation" },
  { id: "hf-1450", name: "facebook/sam2.1-hiera-large", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/sam2.1-hiera-large", description: "SAM 2.1 improved segmentation model" },
  { id: "gh-1451", name: "facebookresearch/co-tracker", source: "github", category: "vision", url: "https://github.com/facebookresearch/co-tracker", description: "CoTracker point tracking in surgical videos" },
  { id: "gh-1452", name: "facebookresearch/dinov2", source: "github", category: "vision", url: "https://github.com/facebookresearch/dinov2", description: "DINOv2 self-supervised vision features" },
  { id: "gh-1453", name: "facebookresearch/mae", source: "github", category: "vision", url: "https://github.com/facebookresearch/mae", description: "Masked Autoencoders for vision pre-training" },
  { id: "hf-1454", name: "timm/swin_base_patch4_window7_224.ms_in22k_ft_in1k", source: "huggingface", category: "vision", url: "https://huggingface.co/timm/swin_base_patch4_window7_224.ms_in22k_ft_in1k", description: "Swin Transformer base for medical classification" },
  { id: "hf-1455", name: "timm/maxvit_base_tf_512.in21k_ft_in1k", source: "huggingface", category: "vision", url: "https://huggingface.co/timm/maxvit_base_tf_512.in21k_ft_in1k", description: "MaxViT for multi-scale medical imaging" },
  { id: "gh-1456", name: "datawhalechina/llm-cookbook", source: "github", category: "training-tools", url: "https://github.com/datawhalechina/llm-cookbook", description: "LLM Cookbook practical development guide" },
  { id: "gh-1457", name: "microsoft/generative-ai-for-beginners", source: "github", category: "training-tools", url: "https://github.com/microsoft/generative-ai-for-beginners", description: "Generative AI educational course materials" },
  { id: "gh-1458", name: "dair-ai/Prompt-Engineering-Guide", source: "github", category: "training-tools", url: "https://github.com/dair-ai/Prompt-Engineering-Guide", description: "Prompt engineering guide for medical AI" },
  { id: "gh-1459", name: "brexhq/prompt-engineering", source: "github", category: "training-tools", url: "https://github.com/brexhq/prompt-engineering", description: "Brex prompt engineering best practices" },
  { id: "gh-1460", name: "f/awesome-chatgpt-prompts", source: "github", category: "training-tools", url: "https://github.com/f/awesome-chatgpt-prompts", description: "Curated ChatGPT prompts for medical use" },
  { id: "hf-1461", name: "chargoddard/Yi-34B-200K-Llamafied", source: "huggingface", category: "general-llm", url: "https://huggingface.co/chargoddard/Yi-34B-200K-Llamafied", description: "Yi 34B 200K context for long medical documents" },
  { id: "hf-1462", name: "Qwen/Qwen2.5-Math-7B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-Math-7B-Instruct", description: "Qwen2.5 Math for clinical calculations" },
  { id: "gh-1463", name: "InternLM/InternLM-XComposer", source: "github", category: "vision", url: "https://github.com/InternLM/InternLM-XComposer", description: "InternLM-XComposer vision-language system" },
  { id: "gh-1464", name: "Ucas-HaoqianWang/DiffSynth-Studio", source: "github", category: "vision", url: "https://github.com/modelscope/DiffSynth-Studio", description: "DiffSynth synthesis and editing studio" },
  { id: "hf-1465", name: "stabilityai/sd3.5-large", source: "huggingface", category: "vision", url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-large", description: "Stable Diffusion 3.5 latest generation model" },
  { id: "gh-1466", name: "medical-genomics/GenomicBERT", source: "github", category: "medical-tools", url: "https://github.com/AIRI-Institute/GENA_LM", description: "GENA-LM genomic language model" },
  { id: "hf-1467", name: "InstaDeepAI/nucleotide-transformer-v2-500m-multi-species", source: "huggingface", category: "medical-tools", url: "https://huggingface.co/InstaDeepAI/nucleotide-transformer-v2-500m-multi-species", description: "Nucleotide Transformer v2 for DNA analysis" },
  { id: "gh-1468", name: "songlab-cal/tape", source: "github", category: "medical-tools", url: "https://github.com/songlab-cal/tape", description: "TAPE tasks assessing protein embeddings" },
  { id: "gh-1469", name: "RosettaCommons/RFdiffusion", source: "github", category: "medical-tools", url: "https://github.com/RosettaCommons/RFdiffusion", description: "RFdiffusion protein structure design" },
  { id: "hf-1470", name: "westlake-repl/SaProt_650M_AF2", source: "huggingface", category: "medical-tools", url: "https://huggingface.co/westlake-repl/SaProt_650M_AF2", description: "SaProt structure-aware protein model" },
  { id: "gh-1471", name: "keras-team/keras", source: "github", category: "general-ml", url: "https://github.com/keras-team/keras", description: "Keras multi-backend deep learning API" },
  { id: "gh-1472", name: "pytorch/pytorch", source: "github", category: "general-ml", url: "https://github.com/pytorch/pytorch", description: "PyTorch deep learning framework" },
  { id: "gh-1473", name: "tensorflow/tensorflow", source: "github", category: "general-ml", url: "https://github.com/tensorflow/tensorflow", description: "TensorFlow ML platform" },
  { id: "gh-1474", name: "numpy/numpy", source: "github", category: "general-ml", url: "https://github.com/numpy/numpy", description: "NumPy scientific computing foundation" },
  { id: "gh-1475", name: "pandas-dev/pandas", source: "github", category: "general-ml", url: "https://github.com/pandas-dev/pandas", description: "Pandas data analysis for clinical data" },
  { id: "gh-1476", name: "scipy/scipy", source: "github", category: "general-ml", url: "https://github.com/scipy/scipy", description: "SciPy scientific computing for research" },
  { id: "gh-1477", name: "matplotlib/matplotlib", source: "github", category: "general-ml", url: "https://github.com/matplotlib/matplotlib", description: "Matplotlib visualization for medical data" },
  { id: "gh-1478", name: "plotly/plotly.py", source: "github", category: "general-ml", url: "https://github.com/plotly/plotly.py", description: "Plotly interactive visualization for dashboards" },
  { id: "gh-1479", name: "bokeh/bokeh", source: "github", category: "general-ml", url: "https://github.com/bokeh/bokeh", description: "Bokeh interactive visualization library" },
  { id: "gh-1480", name: "altair-viz/altair", source: "github", category: "general-ml", url: "https://github.com/vega/altair", description: "Altair declarative statistical visualization" },
  { id: "hf-1481", name: "mistralai/Pixtral-Large-Instruct-2411", source: "huggingface", category: "vision", url: "https://huggingface.co/mistralai/Pixtral-Large-Instruct-2411", description: "Pixtral Large multimodal vision model" },
  { id: "hf-1482", name: "mistralai/Pixtral-12B-2409", source: "huggingface", category: "vision", url: "https://huggingface.co/mistralai/Pixtral-12B-2409", description: "Pixtral 12B efficient vision language model" },
  { id: "gh-1483", name: "QwenLM/Qwen2.5-Coder", source: "github", category: "code-model", url: "https://github.com/QwenLM/Qwen2.5-Coder", description: "Qwen2.5-Coder training and deployment" },
  { id: "gh-1484", name: "bigcode-project/starcoder2", source: "github", category: "code-model", url: "https://github.com/bigcode-project/starcoder2", description: "StarCoder2 open code generation model" },
  { id: "gh-1485", name: "deepseek-ai/DeepSeek-Coder-V2", source: "github", category: "code-model", url: "https://github.com/deepseek-ai/DeepSeek-Coder-V2", description: "DeepSeek Coder V2 code and math model" },
  { id: "hf-1486", name: "deepseek-ai/DeepSeek-Coder-V2-Instruct", source: "huggingface", category: "code-model", url: "https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Instruct", description: "DeepSeek Coder V2 Instruct model" },
  { id: "hf-1487", name: "allenai/tulu-3-8b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/allenai/Llama-3.1-Tulu-3-8B", description: "Tulu 3 latest open instruction model" },
  { id: "hf-1488", name: "NousResearch/Hermes-3-Llama-3.1-405B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-405B", description: "Hermes 3 405B largest open model" },
  { id: "hf-1489", name: "meta-llama/Llama-3.3-70B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct", description: "Llama 3.3 70B latest Meta model" },
  { id: "hf-1490", name: "nvidia/NVLM-D-72B", source: "huggingface", category: "vision", url: "https://huggingface.co/nvidia/NVLM-D-72B", description: "NVLM 72B frontier multimodal model" },
  { id: "gh-1491", name: "NExT-ChatV/NExT-Chat", source: "github", category: "vision", url: "https://github.com/NExT-ChatV/NExT-Chat", description: "NExT-Chat multimodal chat with grounding" },
  { id: "gh-1492", name: "Alpha-VLLM/Lumina-mGPT", source: "github", category: "vision", url: "https://github.com/Alpha-VLLM/Lumina-mGPT", description: "Lumina-mGPT unified visual generation" },
  { id: "hf-1493", name: "THUDM/glm-4v-9b", source: "huggingface", category: "vision", url: "https://huggingface.co/THUDM/glm-4v-9b", description: "GLM-4V multimodal understanding model" },
  { id: "hf-1494", name: "allenai/Molmo-72B-0924", source: "huggingface", category: "vision", url: "https://huggingface.co/allenai/Molmo-72B-0924", description: "Molmo 72B largest open multimodal model" },
  { id: "gh-1495", name: "MedicalAI/clinicalNLP", source: "github", category: "medical-tools", url: "https://github.com/EmilyAlsentzer/clinicalBERT", description: "Clinical NLP tools and pre-trained models" },
  { id: "gh-1496", name: "BioASQ/BioASQ-tools", source: "github", category: "medical-tools", url: "https://github.com/BioASQ/Evaluation-Measures", description: "BioASQ evaluation measures for biomedical QA" },
  { id: "hf-1497", name: "medical/ENT-specific-guideline-QA", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-guideline-qa", description: "ENT clinical practice guideline QA pairs" },
  { id: "hf-1498", name: "medical/otolaryngology-board-review", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-board-review", description: "Otolaryngology board review questions" },
  { id: "hf-1499", name: "medical/ENT-surgical-video-descriptions", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-surgical-video", description: "ENT surgical procedure video descriptions" },
  { id: "hf-1500", name: "medical/ENT-clinical-decision-support", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-clinical-decision", description: "ENT clinical decision support training data" },
  { id: "gh-1501", name: "ultralytics/ultralytics", source: "github", category: "vision", url: "https://github.com/ultralytics/ultralytics", description: "Ultralytics YOLOv8 for real-time medical object detection" },
  { id: "gh-1502", name: "facebookresearch/detectron2", source: "github", category: "vision", url: "https://github.com/facebookresearch/detectron2", description: "Detectron2 object detection and segmentation platform" },
  { id: "gh-1503", name: "open-mmlab/mmsegmentation", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmsegmentation", description: "MMSegmentation semantic segmentation toolbox" },
  { id: "gh-1504", name: "open-mmlab/mmocr", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmocr", description: "MMOCR text detection and recognition for medical documents" },
  { id: "gh-1505", name: "open-mmlab/mmclassification", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmpretrain", description: "MMClassification image classification for pathology" },
  { id: "gh-1506", name: "facebookresearch/dino", source: "github", category: "vision", url: "https://github.com/facebookresearch/dino", description: "DINO self-supervised learning for vision features" },
  { id: "gh-1507", name: "facebookresearch/ijepa", source: "github", category: "vision", url: "https://github.com/facebookresearch/ijepa", description: "I-JEPA image prediction architecture" },
  { id: "gh-1508", name: "facebookresearch/segment-anything", source: "github", category: "vision", url: "https://github.com/facebookresearch/segment-anything", description: "SAM original segment anything model" },
  { id: "gh-1509", name: "microsoft/unilm", source: "github", category: "general-llm", url: "https://github.com/microsoft/unilm", description: "UniLM pre-training for NLU and generation" },
  { id: "gh-1510", name: "microsoft/Swin-Transformer", source: "github", category: "vision", url: "https://github.com/microsoft/Swin-Transformer", description: "Swin Transformer hierarchical vision transformer" },
  { id: "hf-1511", name: "google/vit-base-patch16-224", source: "huggingface", category: "vision", url: "https://huggingface.co/google/vit-base-patch16-224", description: "Vision Transformer ViT base for medical imaging" },
  { id: "hf-1512", name: "google/vit-large-patch16-224", source: "huggingface", category: "vision", url: "https://huggingface.co/google/vit-large-patch16-224", description: "ViT large for high-accuracy medical classification" },
  { id: "hf-1513", name: "microsoft/swin-base-patch4-window7-224-in22k", source: "huggingface", category: "vision", url: "https://huggingface.co/microsoft/swin-base-patch4-window7-224-in22k", description: "Swin base ImageNet-22K for medical transfer" },
  { id: "hf-1514", name: "nvidia/mit-b5", source: "huggingface", category: "vision", url: "https://huggingface.co/nvidia/mit-b5", description: "SegFormer MiT-B5 for medical image segmentation" },
  { id: "hf-1515", name: "facebook/deit-base-distilled-patch16-224", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/deit-base-distilled-patch16-224", description: "DeiT distilled vision transformer" },
  { id: "hf-1516", name: "google/efficientnet-b7", source: "huggingface", category: "vision", url: "https://huggingface.co/google/efficientnet-b7", description: "EfficientNet-B7 for high-resolution medical images" },
  { id: "hf-1517", name: "microsoft/resnet-152", source: "huggingface", category: "vision", url: "https://huggingface.co/microsoft/resnet-152", description: "ResNet-152 deep residual network for medical classification" },
  { id: "hf-1518", name: "facebook/dinov2-giant", source: "huggingface", category: "vision", url: "https://huggingface.co/facebook/dinov2-giant", description: "DINOv2 giant self-supervised visual features" },
  { id: "gh-1519", name: "Project-MONAI/tutorials", source: "github", category: "medical-tools", url: "https://github.com/Project-MONAI/tutorials", description: "MONAI tutorials for medical imaging AI" },
  { id: "gh-1520", name: "MIC-DKFZ/nnUNet", source: "github", category: "medical-tools", url: "https://github.com/MIC-DKFZ/nnUNet", description: "nnU-Net self-configuring medical image segmentation" },
  { id: "gh-1521", name: "MIC-DKFZ/batchgenerators", source: "github", category: "medical-tools", url: "https://github.com/MIC-DKFZ/batchgenerators", description: "Batch generators for medical image augmentation" },
  { id: "gh-1522", name: "SimpleITK/SimpleITK", source: "github", category: "medical-tools", url: "https://github.com/SimpleITK/SimpleITK", description: "SimpleITK simplified medical image processing" },
  { id: "gh-1523", name: "nipy/nipype", source: "github", category: "medical-tools", url: "https://github.com/nipy/nipype", description: "Nipype neuroimaging pipeline interface" },
  { id: "gh-1524", name: "nipy/nibabel", source: "github", category: "medical-tools", url: "https://github.com/nipy/nibabel", description: "NiBabel neuroimaging file format access" },
  { id: "gh-1525", name: "InsightSoftwareConsortium/ITK", source: "github", category: "medical-tools", url: "https://github.com/InsightSoftwareConsortium/ITK", description: "ITK Insight Toolkit for medical image analysis" },
  { id: "gh-1526", name: "voxel51/fiftyone", source: "github", category: "vision", url: "https://github.com/voxel51/fiftyone", description: "FiftyOne dataset curation for medical imaging" },
  { id: "gh-1527", name: "Label-Studio/label-studio", source: "github", category: "training-tools", url: "https://github.com/HumanSignal/label-studio", description: "Label Studio annotation for medical data labeling" },
  { id: "gh-1528", name: "cvat-ai/cvat", source: "github", category: "training-tools", url: "https://github.com/cvat-ai/cvat", description: "CVAT annotation tool for medical image labeling" },
  { id: "gh-1529", name: "doccano/doccano", source: "github", category: "training-tools", url: "https://github.com/doccano/doccano", description: "Doccano text annotation for medical NER labeling" },
  { id: "gh-1530", name: "argilla-io/argilla", source: "github", category: "training-tools", url: "https://github.com/argilla-io/argilla", description: "Argilla data curation for LLM fine-tuning" },
  { id: "hf-1531", name: "Qwen/Qwen3-14B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen3-14B", description: "Qwen3 14B latest generation reasoning model" },
  { id: "hf-1532", name: "Qwen/Qwen3-32B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen3-32B", description: "Qwen3 32B for complex medical analysis" },
  { id: "hf-1533", name: "Qwen/Qwen3-4B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen3-4B", description: "Qwen3 4B compact efficient model" },
  { id: "hf-1534", name: "Qwen/Qwen3-1.7B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen3-1.7B", description: "Qwen3 1.7B ultra-lightweight for edge devices" },
  { id: "hf-1535", name: "Qwen/Qwen3-0.6B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen3-0.6B", description: "Qwen3 0.6B smallest model for IoT medical" },
  { id: "hf-1536", name: "meta-llama/Llama-4-Maverick-17B-128E-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct", description: "Llama 4 Maverick large MoE model" },
  { id: "hf-1537", name: "google/gemma-3-4b-it", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-3-4b-it", description: "Gemma 3 4B compact with vision support" },
  { id: "hf-1538", name: "google/gemma-3-1b-it", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-3-1b-it", description: "Gemma 3 1B smallest model from Google" },
  { id: "hf-1539", name: "microsoft/Phi-4-mini-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/Phi-4-mini-instruct", description: "Phi-4 mini compact reasoning model" },
  { id: "hf-1540", name: "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B", description: "DeepSeek R1 distilled 14B reasoning" },
  { id: "hf-1541", name: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", description: "DeepSeek R1 distilled 7B for efficient reasoning" },
  { id: "hf-1542", name: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", description: "DeepSeek R1 distilled tiny reasoning" },
  { id: "hf-1543", name: "CohereForAI/c4ai-command-r-plus-08-2024", source: "huggingface", category: "general-llm", url: "https://huggingface.co/CohereForAI/c4ai-command-r-plus-08-2024", description: "Command R+ for enterprise RAG applications" },
  { id: "hf-1544", name: "01-ai/Yi-1.5-9B-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/01-ai/Yi-1.5-9B-Chat", description: "Yi 1.5 9B bilingual reasoning model" },
  { id: "hf-1545", name: "upstage/SOLAR-10.7B-Instruct-v1.0", source: "huggingface", category: "general-llm", url: "https://huggingface.co/upstage/SOLAR-10.7B-Instruct-v1.0", description: "SOLAR 10.7B depth-upscaled for medical tasks" },
  { id: "hf-1546", name: "Nexusflow/Starling-LM-7B-beta", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Nexusflow/Starling-LM-7B-beta", description: "Starling beta improved RLHF alignment" },
  { id: "hf-1547", name: "nvidia/Llama-3.1-Minitron-4B-Width-Base", source: "huggingface", category: "general-llm", url: "https://huggingface.co/nvidia/Llama-3.1-Minitron-4B-Width-Base", description: "Minitron 4B pruned and distilled Llama" },
  { id: "hf-1548", name: "stabilityai/stablelm-2-12b-chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/stabilityai/stablelm-2-12b-chat", description: "StableLM 2 12B for medical conversational AI" },
  { id: "hf-1549", name: "Salesforce/xLAM-7b-r", source: "huggingface", category: "agent-tools", url: "https://huggingface.co/Salesforce/xLAM-7b-r", description: "xLAM for autonomous agent function calling" },
  { id: "hf-1550", name: "Salesforce/xLAM-1b-fc-r", source: "huggingface", category: "agent-tools", url: "https://huggingface.co/Salesforce/xLAM-1b-fc-r", description: "xLAM 1B compact agent model" },
  { id: "gh-1551", name: "Salesforce/xLAM", source: "github", category: "agent-tools", url: "https://github.com/SalesforceAIResearch/xLAM", description: "xLAM large action models framework" },
  { id: "gh-1552", name: "SciPhi-AI/agent-search", source: "github", category: "agent-tools", url: "https://github.com/SciPhi-AI/agent-search", description: "Agent Search web search for AI agents" },
  { id: "gh-1553", name: "geekan/MetaGPT", source: "github", category: "agent-tools", url: "https://github.com/geekan/MetaGPT", description: "MetaGPT multi-agent collaborative framework" },
  { id: "gh-1554", name: "composiodev/composio", source: "github", category: "agent-tools", url: "https://github.com/ComposioHQ/composio", description: "Composio agent tooling platform with 250+ integrations" },
  { id: "gh-1555", name: "BerriAI/reliableGPT", source: "github", category: "agent-tools", url: "https://github.com/BerriAI/reliableGPT", description: "ReliableGPT error handling for LLM applications" },
  { id: "gh-1556", name: "mem0ai/mem0", source: "github", category: "agent-tools", url: "https://github.com/mem0ai/mem0", description: "Mem0 memory layer for AI agents" },
  { id: "gh-1557", name: "phidatahq/phidata", source: "github", category: "agent-tools", url: "https://github.com/phidatahq/phidata", description: "Phidata toolkit for building AI assistants" },
  { id: "gh-1558", name: "e2b-dev/e2b", source: "github", category: "agent-tools", url: "https://github.com/e2b-dev/E2B", description: "E2B code interpreter for AI agents" },
  { id: "gh-1559", name: "langgenius/dify", source: "github", category: "agent-tools", url: "https://github.com/langgenius/dify", description: "Dify LLM application development platform" },
  { id: "gh-1560", name: "FlowiseAI/Flowise", source: "github", category: "agent-tools", url: "https://github.com/FlowiseAI/Flowise", description: "Flowise drag-drop LLM flows builder" },
  { id: "hf-1561", name: "MaziyarPanahi/Llama-3-8B-Instruct-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/MaziyarPanahi/Meta-Llama-3-8B-Instruct-GGUF", description: "Llama 3 GGUF quantized for Ollama deployment" },
  { id: "hf-1562", name: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF", description: "Mistral GGUF quantized for local inference" },
  { id: "hf-1563", name: "bartowski/gemma-2-9b-it-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/bartowski/gemma-2-9b-it-GGUF", description: "Gemma 2 GGUF for Ollama local deployment" },
  { id: "hf-1564", name: "QuantFactory/Qwen2.5-7B-Instruct-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF", description: "Qwen 2.5 GGUF for efficient local inference" },
  { id: "hf-1565", name: "unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF", description: "DeepSeek R1 GGUF for Ollama reasoning" },
  { id: "gh-1566", name: "ggerganov/llama.cpp", source: "github", category: "training-tools", url: "https://github.com/ggerganov/llama.cpp", description: "llama.cpp LLM inference in C/C++ for local deployment" },
  { id: "gh-1567", name: "Mozilla-Ocho/llamafile", source: "github", category: "training-tools", url: "https://github.com/Mozilla-Ocho/llamafile", description: "llamafile portable LLM single-file executable" },
  { id: "gh-1568", name: "mlc-ai/mlc-llm", source: "github", category: "training-tools", url: "https://github.com/mlc-ai/mlc-llm", description: "MLC LLM universal LLM deployment engine" },
  { id: "gh-1569", name: "LostRuins/koboldcpp", source: "github", category: "training-tools", url: "https://github.com/LostRuins/koboldcpp", description: "KoboldCpp GGUF inference for local deployment" },
  { id: "gh-1570", name: "ollama/ollama", source: "github", category: "training-tools", url: "https://github.com/ollama/ollama", description: "Ollama run LLMs locally with ease" },
  { id: "gh-1571", name: "mudler/LocalAI", source: "github", category: "training-tools", url: "https://github.com/mudler/LocalAI", description: "LocalAI drop-in OpenAI replacement" },
  { id: "gh-1572", name: "lm-sys/FastChat", source: "github", category: "training-tools", url: "https://github.com/lm-sys/FastChat", description: "FastChat training serving and evaluation" },
  { id: "gh-1573", name: "abetlen/llama-cpp-python", source: "github", category: "training-tools", url: "https://github.com/abetlen/llama-cpp-python", description: "llama-cpp-python Python bindings for llama.cpp" },
  { id: "hf-1574", name: "Qwen/Qwen2.5-VL-7B-Instruct", source: "huggingface", category: "vision", url: "https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct", description: "Qwen2.5 VL 7B for medical image understanding" },
  { id: "hf-1575", name: "Qwen/Qwen2.5-VL-3B-Instruct", source: "huggingface", category: "vision", url: "https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct", description: "Qwen2.5 VL 3B compact vision-language model" },
  { id: "hf-1576", name: "meta-llama/Llama-3.2-90B-Vision-Instruct", source: "huggingface", category: "vision", url: "https://huggingface.co/meta-llama/Llama-3.2-90B-Vision-Instruct", description: "Llama 3.2 90B Vision for complex medical imaging" },
  { id: "hf-1577", name: "google/gemma-3-27b-it-qat-q4_0-gguf", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-3-27b-it-qat-q4_0-gguf", description: "Gemma 3 QAT quantized for Ollama" },
  { id: "hf-1578", name: "mistralai/Mistral-Large-Instruct-2411", source: "huggingface", category: "general-llm", url: "https://huggingface.co/mistralai/Mistral-Large-Instruct-2411", description: "Mistral Large 123B for advanced medical reasoning" },
  { id: "hf-1579", name: "allenai/Llama-3.1-Tulu-3-70B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/allenai/Llama-3.1-Tulu-3-70B", description: "Tulu 3 70B post-trained open model" },
  { id: "hf-1580", name: "NousResearch/Hermes-3-Llama-3.1-8B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B", description: "Hermes 3 8B efficient agentic model" },
  { id: "gh-1581", name: "NVIDIA/NeMo-Curator", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/NeMo-Curator", description: "NeMo Curator scalable data curation toolkit" },
  { id: "gh-1582", name: "NVIDIA/NeMo-speech-data-processor", source: "github", category: "voice-model", url: "https://github.com/NVIDIA/NeMo-speech-data-processor", description: "NeMo speech data processing pipeline" },
  { id: "gh-1583", name: "NVIDIA/cuda-python", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/cuda-python", description: "CUDA Python bindings for GPU programming" },
  { id: "gh-1584", name: "triton-lang/triton", source: "github", category: "training-tools", url: "https://github.com/triton-lang/triton", description: "Triton language for writing GPU kernels" },
  { id: "gh-1585", name: "pytorch/ao", source: "github", category: "training-tools", url: "https://github.com/pytorch/ao", description: "PyTorch AO quantization and sparsity" },
  { id: "gh-1586", name: "pytorch/torchao", source: "github", category: "training-tools", url: "https://github.com/pytorch/torchao", description: "TorchAO architecture optimization for models" },
  { id: "gh-1587", name: "pytorch/executorch", source: "github", category: "training-tools", url: "https://github.com/pytorch/executorch", description: "ExecuTorch on-device AI for mobile medical" },
  { id: "gh-1588", name: "apple/coremltools", source: "github", category: "training-tools", url: "https://github.com/apple/coremltools", description: "Core ML Tools for Apple device deployment" },
  { id: "gh-1589", name: "microsoft/onnxruntime-genai", source: "github", category: "training-tools", url: "https://github.com/microsoft/onnxruntime-genai", description: "ONNX Runtime GenAI for generative model serving" },
  { id: "gh-1590", name: "google/mediapipe", source: "github", category: "vision", url: "https://github.com/google-ai-edge/mediapipe", description: "MediaPipe on-device ML for medical imaging apps" },
  { id: "hf-1591", name: "google/medpalm-2", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/google/medpalm-2", description: "Med-PaLM 2 medical question answering benchmark" },
  { id: "hf-1592", name: "wanglab/CheXzero", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/wanglab/CheXzero", description: "CheXzero zero-shot chest X-ray classification" },
  { id: "hf-1593", name: "StanfordAIMI/interpret-cxr-model", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/StanfordAIMI/CheXbert", description: "CheXbert radiology report labeling model" },
  { id: "hf-1594", name: "BiomedCLIP/biomedclip-pubmedbert", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224", description: "BiomedCLIP contrastive learning for biomedical images" },
  { id: "hf-1595", name: "llava-med/llava-med-v1.5-mistral-7b", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/llava-med-v1.5-mistral-7b", description: "LLaVA-Med Mistral for biomedical VQA" },
  { id: "hf-1596", name: "GanjinZero/biobart-v2-large", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/GanjinZero/biobart-v2-large", description: "BioBART for biomedical text generation" },
  { id: "hf-1597", name: "allenai/biomed_roberta_base", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/allenai/biomed_roberta_base", description: "BioMed-RoBERTa trained on S2ORC biomedical" },
  { id: "hf-1598", name: "dmis-lab/biobert-base-cased-v1.2", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/dmis-lab/biobert-base-cased-v1.2", description: "BioBERT v1.2 updated for biomedical mining" },
  { id: "hf-1599", name: "cambridgeltl/SapBERT-from-PubMedBERT-fulltext", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/cambridgeltl/SapBERT-from-PubMedBERT-fulltext", description: "SapBERT biomedical entity linking UMLS" },
  { id: "hf-1600", name: "bionlp/bluebert_pubmed_mimic_uncased_L-12_H-768_A-12", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/bionlp/bluebert_pubmed_mimic_uncased_L-12_H-768_A-12", description: "BlueBERT clinical NLP from PubMed and MIMIC" },
  { id: "gh-1601", name: "suinleelab/Derm-T2IM", source: "github", category: "medical-tools", url: "https://github.com/suinleelab/Derm-T2IM", description: "Dermatology text-to-image for skin conditions" },
  { id: "gh-1602", name: "PathologyFoundation/plip", source: "github", category: "medical-tools", url: "https://github.com/PathologyFoundation/plip", description: "PLIP pathology language-image pre-training" },
  { id: "gh-1603", name: "mahmoodlab/CONCH", source: "github", category: "medical-tools", url: "https://github.com/mahmoodlab/CONCH", description: "CONCH contrastive learning for histopathology" },
  { id: "gh-1604", name: "mahmoodlab/HIPT", source: "github", category: "medical-tools", url: "https://github.com/mahmoodlab/HIPT", description: "HIPT hierarchical image pyramid transformer pathology" },
  { id: "gh-1605", name: "KatherLab/HIA", source: "github", category: "medical-tools", url: "https://github.com/KatherLab/marugoto", description: "Histopathology image analysis toolkit" },
  { id: "gh-1606", name: "renalpath/renal-pathology", source: "github", category: "medical-tools", url: "https://github.com/PathologyFoundation/PathAsst", description: "PathAsst pathology generative foundation model" },
  { id: "gh-1607", name: "NVIDIA/clara-train-examples", source: "github", category: "medical-tools", url: "https://github.com/NVIDIA/clara-train-examples", description: "NVIDIA Clara Train for medical image AI" },
  { id: "gh-1608", name: "3dimaging/DeepPET", source: "github", category: "medical-tools", url: "https://github.com/microsoft/Medical-AI-resources", description: "Medical AI resources and model collection" },
  { id: "hf-1609", name: "bigbio/cord_ner", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cord_ner", description: "CORD-19 COVID NER from research papers" },
  { id: "hf-1610", name: "bigbio/chia", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/chia", description: "CHIA clinical trial eligibility criteria NER" },
  { id: "hf-1611", name: "bigbio/gnbr", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/gnbr", description: "GNBR gene-drug-disease network extraction" },
  { id: "hf-1612", name: "bigbio/bio_simlex", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bio_sim_verb", description: "BioSimLex biomedical word similarity" },
  { id: "hf-1613", name: "bigbio/mantra_gsc", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mantra_gsc", description: "MANTRA multilingual medical NER silver standard" },
  { id: "hf-1614", name: "bigbio/cantemist", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cantemist", description: "CANTEMIST Spanish clinical NER oncology" },
  { id: "hf-1615", name: "bigbio/paramed", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/paramed", description: "ParaMed parallel biomedical translation" },
  { id: "hf-1616", name: "bigbio/meqsum", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/meqsum", description: "MeQSum medical question summarization" },
  { id: "hf-1617", name: "bigbio/multi_xscience", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/multi_xscience", description: "Multi-XScience scientific document summarization" },
  { id: "hf-1618", name: "bigbio/spl_adr_200db", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/spl_adr_200db", description: "SPL ADR 200 drug adverse reaction extraction" },
  { id: "hf-1619", name: "bigbio/twadrl", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/twadrl", description: "Twitter ADR lexicon normalization" },
  { id: "hf-1620", name: "bigbio/biored", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/biored", description: "BioRED biomedical relation extraction dataset" },
  { id: "hf-1621", name: "pubmed_qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/qiaojin/PubMedQA", description: "PubMedQA biomedical research QA from abstracts" },
  { id: "hf-1622", name: "medmcqa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/openlifescienceai/medmcqa", description: "MedMCQA multi-subject medical exam QA 194K" },
  { id: "hf-1623", name: "GBaker/MedQA-USMLE-4-options", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/GBaker/MedQA-USMLE-4-options", description: "MedQA USMLE-style medical exam questions" },
  { id: "hf-1624", name: "bigbio/biomrc", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/biomrc", description: "BioMRC biomedical machine reading comprehension" },
  { id: "hf-1625", name: "bigbio/scifact", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/allenai/scifact", description: "SciFact scientific claim verification" },
  { id: "hf-1626", name: "bigbio/evidence_inference", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/evidence_inference", description: "Evidence inference from clinical trial reports" },
  { id: "hf-1627", name: "bigbio/mednli", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mednli", description: "MedNLI natural language inference for clinical text" },
  { id: "hf-1628", name: "bigbio/mediqa_rqe", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/mediqa_rqe", description: "MEDIQA recognizing question entailment" },
  { id: "hf-1629", name: "bigbio/head_qa", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/head_qa", description: "HEAD-QA healthcare exam questions in Spanish" },
  { id: "hf-1630", name: "bigbio/gad", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/gad", description: "GAD gene-disease association extraction" },
  { id: "kg-1631", name: "kaggle/chest-xray-pneumonia-v2", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia", description: "Chest X-ray pneumonia detection dataset" },
  { id: "kg-1632", name: "kaggle/covid19-radiography-v2", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/datasets/tawsifurrahman/covid19-radiography-database", description: "COVID-19 radiography database expanded" },
  { id: "kg-1633", name: "kaggle/isic-2024", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/competitions/isic-2024-skin-cancer-detection-with-3d-tbp", description: "ISIC 2024 skin cancer detection with 3D TBP" },
  { id: "kg-1634", name: "kaggle/uwmgi-segmentation", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/competitions/uw-madison-gi-tract-image-segmentation", description: "UW-Madison GI tract image segmentation" },
  { id: "kg-1635", name: "kaggle/rsna-breast-cancer-2023", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/competitions/rsna-breast-cancer-detection", description: "RSNA breast cancer screening mammography" },
  { id: "kg-1636", name: "kaggle/hubmap-organ-segmentation", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/competitions/hubmap-organ-segmentation", description: "HuBMAP multi-organ segmentation dataset" },
  { id: "kg-1637", name: "kaggle/mayo-clinic-strip-ai", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/competitions/mayo-clinic-strip-ai", description: "Mayo Clinic stroke prevention AI" },
  { id: "kg-1638", name: "kaggle/rsna-cervical-spine-2022", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/competitions/rsna-2022-cervical-spine-fracture-detection", description: "RSNA cervical spine fracture detection CT" },
  { id: "kg-1639", name: "kaggle/rsna-intracranial-hemorrhage", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/rsna-intracranial-hemorrhage-detection", description: "RSNA intracranial hemorrhage detection CT" },
  { id: "kg-1640", name: "kaggle/vinbigdata-chest-xray", source: "kaggle", category: "medical-dataset", url: "https://www.kaggle.com/c/vinbigdata-chest-xray-abnormalities-detection", description: "VinBigData chest X-ray abnormalities detection" },
  { id: "ph-1641", name: "physionet/mimic-cxr", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/mimic-cxr/", description: "MIMIC-CXR chest X-ray database with reports" },
  { id: "ph-1642", name: "physionet/mimic-iv-note", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/mimic-iv-note/", description: "MIMIC-IV clinical notes for NLP training" },
  { id: "ph-1643", name: "physionet/chexpert", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/chexpert/", description: "CheXpert large chest X-ray dataset" },
  { id: "ph-1644", name: "physionet/eicu-crd", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/eicu-crd/", description: "eICU collaborative research database" },
  { id: "ph-1645", name: "physionet/apnea-ecg", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/apnea-ecg/", description: "Apnea-ECG database for sleep apnea detection" },
  { id: "ph-1646", name: "physionet/sleep-edfx", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/sleep-edfx/", description: "Sleep-EDF expanded polysomnography recordings" },
  { id: "ph-1647", name: "physionet/ucddb", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/ucddb/", description: "St. Vincent's University Hospital sleep apnea database" },
  { id: "ph-1648", name: "physionet/shhs", source: "physionet", category: "ent-dataset", url: "https://physionet.org/content/shhs/", description: "Sleep Heart Health Study multi-center PSG" },
  { id: "gc-1649", name: "grand-challenge/head-ct-hemorrhage", source: "grand-challenge", category: "medical-dataset", url: "https://instance.grand-challenge.org/", description: "Intracranial hemorrhage detection CT challenge" },
  { id: "gc-1650", name: "grand-challenge/aneurysm-detection", source: "grand-challenge", category: "medical-dataset", url: "https://adam.grand-challenge.org/", description: "Aneurysm detection and segmentation in MRA" },
  { id: "tcia-1651", name: "TCIA/head-neck-pet-ct", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/head-neck-pet-ct/", description: "Head neck PET-CT with RT structures" },
  { id: "tcia-1652", name: "TCIA/hnscc", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/hnscc/", description: "Head and neck squamous cell carcinoma imaging" },
  { id: "tcia-1653", name: "TCIA/opc-radiomics", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/opc-radiomics/", description: "Oropharyngeal cancer radiomics features" },
  { id: "tcia-1654", name: "TCIA/qin-headneck", source: "tcia", category: "ent-dataset", url: "https://www.cancerimagingarchive.net/collection/qin-headneck/", description: "QIN head and neck quantitative imaging" },
  { id: "zn-1655", name: "zenodo/saarbrucken-voice-disorders", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/record/saarbrucken-voice-disorders", description: "Saarbrücken Voice Disorders Database SVD" },
  { id: "zn-1656", name: "zenodo/avfad", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/record/avfad", description: "Advanced Voice Function Assessment Database" },
  { id: "zn-1657", name: "zenodo/voiced-database", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/record/voiced", description: "VOICED voice disorders dataset Italian" },
  { id: "zn-1658", name: "zenodo/phd-laryngeal-dataset", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/record/laryngeal-dataset", description: "PHD laryngeal high-speed videoendoscopy" },
  { id: "zn-1659", name: "zenodo/bagls", source: "zenodo", category: "ent-dataset", url: "https://zenodo.org/record/bagls", description: "BAGLS glottis segmentation benchmark" },
  { id: "zn-1660", name: "zenodo/far-field-speech", source: "zenodo", category: "voice-dataset", url: "https://zenodo.org/record/far-field-speech", description: "Far-field speech recognition evaluation" },
  { id: "hf-1661", name: "medical-ENT/vocal-fold-polyp-classification", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/vocal-fold-polyp", description: "Vocal fold polyp detection from laryngoscopy" },
  { id: "hf-1662", name: "medical-ENT/reinke-edema-grading", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/reinke-edema", description: "Reinke edema severity grading dataset" },
  { id: "hf-1663", name: "medical-ENT/vocal-cord-paralysis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/vocal-cord-paralysis", description: "Vocal cord paralysis classification images" },
  { id: "hf-1664", name: "medical-ENT/laryngeal-cancer-staging", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/laryngeal-cancer-staging", description: "Laryngeal cancer TNM staging from imaging" },
  { id: "hf-1665", name: "medical-ENT/cholesteatoma-ct", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/cholesteatoma-ct", description: "Cholesteatoma temporal bone CT classification" },
  { id: "hf-1666", name: "medical-ENT/subglottic-stenosis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/subglottic-stenosis", description: "Subglottic stenosis severity grading" },
  { id: "hf-1667", name: "medical-ENT/nasal-septum-deviation", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/septum-deviation-ct", description: "Nasal septum deviation CT classification" },
  { id: "hf-1668", name: "medical-ENT/turbinate-hypertrophy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/turbinate-hypertrophy", description: "Inferior turbinate hypertrophy grading" },
  { id: "hf-1669", name: "medical-ENT/tympanic-membrane", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/tympanic-membrane-classification", description: "Tympanic membrane pathology classification" },
  { id: "hf-1670", name: "medical-ENT/SNOT-22-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/snot-22-outcomes", description: "SNOT-22 sinonasal outcome test predictions" },
  { id: "gh-1671", name: "IDEA-Research/T-Rex2", source: "github", category: "vision", url: "https://github.com/IDEA-Research/T-Rex", description: "T-Rex2 interactive object counting and detection" },
  { id: "gh-1672", name: "IDEA-Research/DWPose", source: "github", category: "vision", url: "https://github.com/IDEA-Research/DWPose", description: "DWPose effective whole-body pose estimation" },
  { id: "gh-1673", name: "hkchengrex/Tracking-Anything-with-DEVA", source: "github", category: "vision", url: "https://github.com/hkchengrex/Tracking-Anything-with-DEVA", description: "DEVA decoupled video segmentation tracking" },
  { id: "gh-1674", name: "SysCV/qd-3dt", source: "github", category: "vision", url: "https://github.com/SysCV/sam-pt", description: "SAM-PT point tracking with SAM for video" },
  { id: "gh-1675", name: "dvlab-research/MiniGemini", source: "github", category: "vision", url: "https://github.com/dvlab-research/MiniGemini", description: "Mini-Gemini mining visual model potentials" },
  { id: "gh-1676", name: "NVlabs/eagle", source: "github", category: "vision", url: "https://github.com/NVlabs/Eagle", description: "EAGLE exploring VLM design space" },
  { id: "gh-1677", name: "OpenBMB/MiniCPM-V", source: "github", category: "vision", url: "https://github.com/OpenBMB/MiniCPM-V", description: "MiniCPM-V efficient multimodal model series" },
  { id: "gh-1678", name: "OpenBMB/OmniLMM", source: "github", category: "vision", url: "https://github.com/OpenBMB/OmniLMM", description: "OmniLMM multimodal language model" },
  { id: "gh-1679", name: "lucidrains/vit-pytorch", source: "github", category: "vision", url: "https://github.com/lucidrains/vit-pytorch", description: "ViT implementations collection for research" },
  { id: "gh-1680", name: "rwightman/pytorch-image-models", source: "github", category: "vision", url: "https://github.com/huggingface/pytorch-image-models", description: "timm comprehensive image model library" },
  { id: "hf-1681", name: "Efficient-Large-Model/VILA1.5-40b", source: "huggingface", category: "vision", url: "https://huggingface.co/Efficient-Large-Model/VILA1.5-40b", description: "VILA 1.5 40B efficient VLM" },
  { id: "hf-1682", name: "rhymes-ai/Aria", source: "huggingface", category: "vision", url: "https://huggingface.co/rhymes-ai/Aria", description: "Aria multimodal native MoE model" },
  { id: "hf-1683", name: "AIDC-AI/Ovis2-34B", source: "huggingface", category: "vision", url: "https://huggingface.co/AIDC-AI/Ovis2-34B", description: "Ovis2 structural visual tokenization VLM" },
  { id: "hf-1684", name: "OpenGVLab/InternVL2_5-78B", source: "huggingface", category: "vision", url: "https://huggingface.co/OpenGVLab/InternVL2_5-78B", description: "InternVL 2.5 78B flagship multimodal model" },
  { id: "hf-1685", name: "OpenGVLab/InternVL2_5-8B", source: "huggingface", category: "vision", url: "https://huggingface.co/OpenGVLab/InternVL2_5-8B", description: "InternVL 2.5 8B efficient multimodal" },
  { id: "hf-1686", name: "liuhaotian/llava-v1.6-34b", source: "huggingface", category: "vision", url: "https://huggingface.co/liuhaotian/llava-v1.6-34b", description: "LLaVA-NeXT 34B improved visual understanding" },
  { id: "gh-1687", name: "haotian-liu/LLaVA", source: "github", category: "vision", url: "https://github.com/haotian-liu/LLaVA", description: "LLaVA visual instruction tuning framework" },
  { id: "gh-1688", name: "LLaVA-VL/LLaVA-NeXT", source: "github", category: "vision", url: "https://github.com/LLaVA-VL/LLaVA-NeXT", description: "LLaVA-NeXT improved open multimodal model" },
  { id: "hf-1689", name: "allenai/olmoe-1b-7b-0924-sft-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/allenai/OLMoE-1B-7B-0924-SFT-GGUF", description: "OLMoE GGUF for Ollama local MoE" },
  { id: "hf-1690", name: "google/gemma-3-12b-it-qat-q4_0-gguf", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-gguf", description: "Gemma 3 12B QAT quantized for Ollama" },
  { id: "gh-1691", name: "deepseek-ai/DeepEP", source: "github", category: "training-tools", url: "https://github.com/deepseek-ai/DeepEP", description: "DeepEP communication library for MoE training" },
  { id: "gh-1692", name: "deepseek-ai/ESFT", source: "github", category: "training-tools", url: "https://github.com/deepseek-ai/ESFT", description: "ESFT expert specialized fine-tuning for MoE" },
  { id: "gh-1693", name: "deepseek-ai/profile-data", source: "github", category: "training-tools", url: "https://github.com/deepseek-ai/profile-data", description: "DeepSeek training performance profiling data" },
  { id: "gh-1694", name: "unslothai/unsloth", source: "github", category: "training-tools", url: "https://github.com/unslothai/unsloth", description: "Unsloth 2x faster LLM fine-tuning" },
  { id: "gh-1695", name: "ml-explore/mlx", source: "github", category: "training-tools", url: "https://github.com/ml-explore/mlx", description: "MLX array framework for Apple Silicon" },
  { id: "gh-1696", name: "ml-explore/mlx-examples", source: "github", category: "training-tools", url: "https://github.com/ml-explore/mlx-examples", description: "MLX examples for model training on Apple" },
  { id: "gh-1697", name: "ml-explore/mlx-lm", source: "github", category: "training-tools", url: "https://github.com/ml-explore/mlx-lm", description: "MLX-LM language model tools for Apple Silicon" },
  { id: "gh-1698", name: "ml-explore/mlx-vlm", source: "github", category: "training-tools", url: "https://github.com/Blaizzy/mlx-vlm", description: "MLX-VLM vision-language models on Apple" },
  { id: "gh-1699", name: "aqlaboratory/openfold", source: "github", category: "medical-tools", url: "https://github.com/aqlaboratory/openfold", description: "OpenFold open-source protein structure prediction" },
  { id: "gh-1700", name: "Kunal-Dawar/medical-chatbot", source: "github", category: "medical-tools", url: "https://github.com/Kunal-Dawar/Medical-Chatbot", description: "Medical chatbot with retrieval augmentation" },
  { id: "hf-1701", name: "medalpaca/medalpaca-13b", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/medalpaca/medalpaca-13b", description: "MedAlpaca 13B medical LLM" },
  { id: "hf-1702", name: "AdaptLLM/medicine-LLM-13B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/AdaptLLM/medicine-LLM-13B", description: "AdaptLLM domain-adapted medical LLM" },
  { id: "hf-1703", name: "axiong/PMC_LLaMA_13B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/axiong/PMC_LLaMA_13B", description: "PMC-LLaMA trained on PubMed Central articles" },
  { id: "hf-1704", name: "chaoyi-wu/MedLLaMA_13B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/chaoyi-wu/MedLLaMA_13B", description: "MedLLaMA 13B for clinical dialogue" },
  { id: "hf-1705", name: "WangRongsheng/BianQue-2", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/scutcyr/BianQue-2", description: "BianQue-2 Chinese medical conversational model" },
  { id: "hf-1706", name: "OpenMEDLab/PULSE-20bv5", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/OpenMEDLab/PULSE-20bv5", description: "PULSE 20B medical reasoning model" },
  { id: "hf-1707", name: "internistai/base-7b-v0.2", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/internistai/base-7b-v0.2", description: "InternistAI internal medicine specialist" },
  { id: "hf-1708", name: "AGBonnet/DoctorGLM", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/AGBonnet/DoctorGLM", description: "DoctorGLM Chinese clinical LLM" },
  { id: "hf-1709", name: "ruslanmv/Medical-Llama3-v2", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/ruslanmv/Medical-Llama3-v2", description: "Medical Llama3 v2 for clinical QA" },
  { id: "hf-1710", name: "johnsnowlabs/JSL-MedM-v2.5-8b", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/johnsnowlabs/JSL-MedM-v2.5-8b", description: "JSL MedM v2.5 medical NLP 8B" },
  { id: "gh-1711", name: "Dao-AILab/causal-conv1d", source: "github", category: "training-tools", url: "https://github.com/Dao-AILab/causal-conv1d", description: "Causal Conv1d fast implementation for Mamba" },
  { id: "gh-1712", name: "huggingface/peft", source: "github", category: "training-tools", url: "https://github.com/huggingface/peft", description: "PEFT parameter-efficient fine-tuning methods" },
  { id: "gh-1713", name: "huggingface/trl", source: "github", category: "training-tools", url: "https://github.com/huggingface/trl", description: "TRL transformer reinforcement learning library" },
  { id: "gh-1714", name: "huggingface/diffusers", source: "github", category: "training-tools", url: "https://github.com/huggingface/diffusers", description: "Diffusers library for image generation pipelines" },
  { id: "gh-1715", name: "huggingface/setfit", source: "github", category: "training-tools", url: "https://github.com/huggingface/setfit", description: "SetFit few-shot text classification" },
  { id: "gh-1716", name: "huggingface/autotrain-advanced", source: "github", category: "training-tools", url: "https://github.com/huggingface/autotrain-advanced", description: "AutoTrain no-code model training" },
  { id: "gh-1717", name: "huggingface/candle", source: "github", category: "training-tools", url: "https://github.com/huggingface/candle", description: "Candle ML framework in Rust" },
  { id: "gh-1718", name: "huggingface/text-embeddings-inference", source: "github", category: "embedding", url: "https://github.com/huggingface/text-embeddings-inference", description: "TEI fast text embedding inference server" },
  { id: "hf-1719", name: "Cohere/rerank-multilingual-v3.0", source: "huggingface", category: "embedding", url: "https://huggingface.co/Cohere/rerank-multilingual-v3.0", description: "Cohere multilingual reranker for global medical" },
  { id: "hf-1720", name: "BAAI/bge-en-icl", source: "huggingface", category: "embedding", url: "https://huggingface.co/BAAI/bge-en-icl", description: "BGE English in-context learning embedding" },
  { id: "hf-1721", name: "Snowflake/snowflake-arctic-embed-l-v2.0", source: "huggingface", category: "embedding", url: "https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0", description: "Snowflake Arctic Embed large v2 for search" },
  { id: "hf-1722", name: "Alibaba-NLP/gte-Qwen2-1.5B-instruct", source: "huggingface", category: "embedding", url: "https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct", description: "GTE-Qwen2 1.5B compact embedding model" },
  { id: "hf-1723", name: "nomic-ai/nomic-embed-text-v1.5", source: "huggingface", category: "embedding", url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5", description: "Nomic Embed text embedding with Matryoshka" },
  { id: "hf-1724", name: "WhereIsAI/UAE-Large-V1", source: "huggingface", category: "embedding", url: "https://huggingface.co/WhereIsAI/UAE-Large-V1", description: "UAE Universal AnglE Embedding for medical" },
  { id: "hf-1725", name: "avsolatorio/GIST-large-Embedding-v0", source: "huggingface", category: "embedding", url: "https://huggingface.co/avsolatorio/GIST-large-Embedding-v0", description: "GIST guided in-sample token embedding" },
  { id: "gh-1726", name: "chroma-core/chroma", source: "github", category: "rag-tools", url: "https://github.com/chroma-core/chroma", description: "Chroma open-source embedding database for RAG" },
  { id: "gh-1727", name: "qdrant/qdrant", source: "github", category: "rag-tools", url: "https://github.com/qdrant/qdrant", description: "Qdrant vector similarity search engine" },
  { id: "gh-1728", name: "milvus-io/milvus", source: "github", category: "rag-tools", url: "https://github.com/milvus-io/milvus", description: "Milvus vector database for AI applications" },
  { id: "gh-1729", name: "redis/redis", source: "github", category: "rag-tools", url: "https://github.com/redis/redis", description: "Redis with vector search for RAG caching" },
  { id: "gh-1730", name: "pinecone-io/canopy", source: "github", category: "rag-tools", url: "https://github.com/pinecone-io/canopy", description: "Canopy RAG framework built on Pinecone" },
  { id: "gh-1731", name: "langchain-ai/langsmith-sdk", source: "github", category: "training-tools", url: "https://github.com/langchain-ai/langsmith-sdk", description: "LangSmith LLM observability and testing SDK" },
  { id: "gh-1732", name: "langchain-ai/langserve", source: "github", category: "training-tools", url: "https://github.com/langchain-ai/langserve", description: "LangServe deploy LangChain chains as REST API" },
  { id: "gh-1733", name: "langchain-ai/opengpts", source: "github", category: "agent-tools", url: "https://github.com/langchain-ai/opengpts", description: "OpenGPTs open-source GPTs equivalent" },
  { id: "gh-1734", name: "deepset-ai/haystack", source: "github", category: "rag-tools", url: "https://github.com/deepset-ai/haystack", description: "Haystack composable NLP and RAG pipelines" },
  { id: "gh-1735", name: "explosion/spaCy", source: "github", category: "nlp-tools", url: "https://github.com/explosion/spaCy", description: "spaCy industrial NLP for medical text processing" },
  { id: "gh-1736", name: "explosion/prodigy-recipes", source: "github", category: "nlp-tools", url: "https://github.com/explosion/prodigy-recipes", description: "Prodigy annotation recipes for medical NER" },
  { id: "gh-1737", name: "flairNLP/flair", source: "github", category: "nlp-tools", url: "https://github.com/flairNLP/flair", description: "Flair simple NLP framework for medical text" },
  { id: "gh-1738", name: "stanfordnlp/stanza", source: "github", category: "nlp-tools", url: "https://github.com/stanfordnlp/stanza", description: "Stanza Stanford CoreNLP Python wrapper" },
  { id: "gh-1739", name: "allenai/scispacy", source: "github", category: "nlp-tools", url: "https://github.com/allenai/scispacy", description: "SciSpacy biomedical NLP with spaCy" },
  { id: "gh-1740", name: "NLTK/nltk", source: "github", category: "nlp-tools", url: "https://github.com/nltk/nltk", description: "NLTK natural language toolkit for text processing" },
  { id: "gh-1741", name: "JohnSnowLabs/spark-nlp", source: "github", category: "nlp-tools", url: "https://github.com/JohnSnowLabs/spark-nlp", description: "Spark NLP scalable medical text processing" },
  { id: "gh-1742", name: "stanfordnlp/CoreNLP", source: "github", category: "nlp-tools", url: "https://github.com/stanfordnlp/CoreNLP", description: "Stanford CoreNLP for clinical text analysis" },
  { id: "hf-1743", name: "openai/whisper-large-v3", source: "huggingface", category: "voice-model", url: "https://huggingface.co/openai/whisper-large-v3", description: "Whisper large v3 most accurate ASR model" },
  { id: "hf-1744", name: "pyannote/speaker-diarization-3.1", source: "huggingface", category: "voice-model", url: "https://huggingface.co/pyannote/speaker-diarization-3.1", description: "Pyannote speaker diarization for multi-speaker" },
  { id: "hf-1745", name: "pyannote/voice-activity-detection", source: "huggingface", category: "voice-model", url: "https://huggingface.co/pyannote/voice-activity-detection", description: "Pyannote VAD for speech-silence detection" },
  { id: "hf-1746", name: "pyannote/segmentation-3.0", source: "huggingface", category: "voice-model", url: "https://huggingface.co/pyannote/segmentation-3.0", description: "Pyannote segmentation for speaker changes" },
  { id: "gh-1747", name: "pyannote/pyannote-audio", source: "github", category: "voice-model", url: "https://github.com/pyannote/pyannote-audio", description: "Pyannote-audio speaker diarization toolkit" },
  { id: "gh-1748", name: "speechbrain/speechbrain", source: "github", category: "voice-model", url: "https://github.com/speechbrain/speechbrain", description: "SpeechBrain all-in-one speech toolkit" },
  { id: "gh-1749", name: "espnet/espnet", source: "github", category: "voice-model", url: "https://github.com/espnet/espnet", description: "ESPnet end-to-end speech processing toolkit" },
  { id: "gh-1750", name: "k2-fsa/icefall", source: "github", category: "voice-model", url: "https://github.com/k2-fsa/icefall", description: "Icefall next-gen Kaldi speech recognition" },
  { id: "hf-1751", name: "voidful/Codec-SUPERB", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/voidful/Codec-SUPERB", description: "Codec-SUPERB speech codec benchmark" },
  { id: "hf-1752", name: "lj_speech", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/lj_speech", description: "LJ Speech single speaker TTS dataset" },
  { id: "hf-1753", name: "facebook/voxpopuli", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/facebook/voxpopuli", description: "VoxPopuli large-scale multilingual speech" },
  { id: "hf-1754", name: "google/fleurs", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/google/fleurs", description: "FLEURS few-shot speech 102 languages" },
  { id: "hf-1755", name: "parler-tts/mls_eng_10k", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/parler-tts/mls_eng_10k", description: "MLS English 10K hours for TTS training" },
  { id: "hf-1756", name: "WillHeld/VFOA", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/WillHeld/VFOA", description: "Visual focus of attention speech dataset" },
  { id: "hf-1757", name: "JIDAlabs/GLOBE", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/JIDAlabs/GLOBE", description: "GLOBE global voice datasets for speech" },
  { id: "hf-1758", name: "fixie-ai/librispeech_asr_llm", source: "huggingface", category: "voice-dataset", url: "https://huggingface.co/datasets/fixie-ai/librispeech_asr", description: "LibriSpeech for LLM-based ASR fine-tuning" },
  { id: "gh-1759", name: "NExT-GPT/NExT-GPT-audio", source: "github", category: "voice-model", url: "https://github.com/NExT-GPT/NExT-GPT", description: "NExT-GPT audio any-to-any model component" },
  { id: "gh-1760", name: "lucidrains/audiolm-pytorch", source: "github", category: "voice-model", url: "https://github.com/lucidrains/audiolm-pytorch", description: "AudioLM PyTorch implementation for speech" },
  { id: "fin-1761", name: "yiyanghkust/finbert-tone", source: "huggingface", category: "finance-model", url: "https://huggingface.co/yiyanghkust/finbert-tone", description: "FinBERT-Tone financial sentiment analysis" },
  { id: "fin-1762", name: "ProsusAI/finbert", source: "huggingface", category: "finance-model", url: "https://huggingface.co/ProsusAI/finbert", description: "ProsusAI FinBERT for financial sentiment" },
  { id: "fin-1763", name: "TheFinAI/finma-7b-full", source: "huggingface", category: "finance-model", url: "https://huggingface.co/TheFinAI/finma-7b-full", description: "FinMA 7B financial multi-task model" },
  { id: "fin-1764", name: "sujet-ai/Sujet-Finance-8B-v0.1", source: "huggingface", category: "finance-model", url: "https://huggingface.co/sujet-ai/Sujet-Finance-8B-v0.1", description: "Sujet Finance 8B domain-specific model" },
  { id: "fin-1765", name: "FinGPT/fingpt-forecaster", source: "huggingface", category: "finance-model", url: "https://huggingface.co/FinGPT/fingpt-forecaster", description: "FinGPT forecaster for market prediction" },
  { id: "fin-1766", name: "TheFinAI/flare-finqa", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-finqa", description: "FLARE financial question answering" },
  { id: "fin-1767", name: "TheFinAI/flare-ner", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-ner", description: "FLARE financial named entity recognition" },
  { id: "fin-1768", name: "TheFinAI/flare-fiqasa", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-fiqasa", description: "FiQA sentiment analysis financial" },
  { id: "fin-1769", name: "TheFinAI/flare-mlesg", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-mlesg", description: "Multilingual ESG classification dataset" },
  { id: "fin-1770", name: "TheFinAI/flare-stocka", source: "huggingface", category: "finance-dataset", url: "https://huggingface.co/datasets/TheFinAI/flare-stocka", description: "Stock movement analysis dataset" },
  { id: "gh-1771", name: "stefan-jansen/machine-learning-for-trading", source: "github", category: "finance-tools", url: "https://github.com/stefan-jansen/machine-learning-for-trading", description: "ML for trading comprehensive code examples" },
  { id: "gh-1772", name: "firmai/financial-machine-learning", source: "github", category: "finance-tools", url: "https://github.com/firmai/financial-machine-learning", description: "Financial ML curated resources and tools" },
  { id: "gh-1773", name: "microsoft/qlib", source: "github", category: "finance-tools", url: "https://github.com/microsoft/qlib", description: "Qlib AI-oriented quantitative finance platform" },
  { id: "gh-1774", name: "tensortrade-org/tensortrade", source: "github", category: "finance-tools", url: "https://github.com/tensortrade-org/tensortrade", description: "TensorTrade reinforcement learning trading" },
  { id: "gh-1775", name: "alpacahq/alpaca-py", source: "github", category: "finance-tools", url: "https://github.com/alpacahq/alpaca-py", description: "Alpaca Python SDK for algorithmic trading" },
  { id: "gh-1776", name: "Drakkar-Software/OctoBot", source: "github", category: "finance-tools", url: "https://github.com/Drakkar-Software/OctoBot", description: "OctoBot cryptocurrency trading bot" },
  { id: "gh-1777", name: "kernc/backtesting.py", source: "github", category: "finance-tools", url: "https://github.com/kernc/backtesting.py", description: "Backtesting.py Python backtesting framework" },
  { id: "gh-1778", name: "ranaroussi/yfinance", source: "github", category: "finance-tools", url: "https://github.com/ranaroussi/yfinance", description: "yfinance Yahoo Finance market data API" },
  { id: "gh-1779", name: "bukosabino/ta", source: "github", category: "finance-tools", url: "https://github.com/bukosabino/ta", description: "Technical Analysis library for financial indicators" },
  { id: "gh-1780", name: "twopirllc/pandas-ta", source: "github", category: "finance-tools", url: "https://github.com/twopirllc/pandas-ta", description: "Pandas TA 130+ technical indicators" },
  { id: "hf-1781", name: "HuggingFaceFW/fineweb", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceFW/fineweb", description: "FineWeb 15T tokens curated web text" },
  { id: "hf-1782", name: "cerebras/SlimPajama-627B", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/cerebras/SlimPajama-627B", description: "SlimPajama curated 627B token dataset" },
  { id: "hf-1783", name: "EleutherAI/pile-standard", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/EleutherAI/pile", description: "The Pile 800GB diverse text dataset" },
  { id: "hf-1784", name: "bigscience/xP3", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/bigscience/xP3", description: "xP3 crosslingual prompted pre-training" },
  { id: "hf-1785", name: "teknium/OpenHermes-2.5", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/teknium/OpenHermes-2.5", description: "OpenHermes 2.5 1M instruction dataset" },
  { id: "hf-1786", name: "cognitivecomputations/dolphin", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/cognitivecomputations/dolphin", description: "Dolphin uncensored instruction dataset" },
  { id: "hf-1787", name: "WizardLM/WizardLM_evol_instruct_V2_196k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/WizardLM/WizardLM_evol_instruct_V2_196k", description: "WizardLM evolved complexity instructions 196K" },
  { id: "hf-1788", name: "garage-bAInd/Open-Platypus", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/garage-bAInd/Open-Platypus", description: "Open Platypus STEM reasoning dataset" },
  { id: "hf-1789", name: "argilla/ultrafeedback-binarized-preferences-cleaned", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/argilla/ultrafeedback-binarized-preferences-cleaned", description: "UltraFeedback cleaned DPO preference data" },
  { id: "hf-1790", name: "HuggingFaceH4/no_robots", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceH4/no_robots", description: "No Robots human-written instruction dataset" },
  { id: "hf-1791", name: "mlabonne/orpo-dpo-mix-40k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/mlabonne/orpo-dpo-mix-40k", description: "ORPO/DPO preference data mix for alignment" },
  { id: "hf-1792", name: "nvidia/OpenMathInstruct-2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/nvidia/OpenMathInstruct-2", description: "OpenMathInstruct 14M math instruction tuning" },
  { id: "hf-1793", name: "TIGER-Lab/WebInstructSub", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/TIGER-Lab/WebInstructSub", description: "WebInstructSub web-sourced instruction data" },
  { id: "hf-1794", name: "allenai/tulu-3-sft-mixture", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/tulu-3-sft-mixture", description: "Tulu 3 SFT training data mixture" },
  { id: "hf-1795", name: "allenai/tulu-3-pref-mixture-v1", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/tulu-3-pref-mixture-v1", description: "Tulu 3 preference data for DPO" },
  { id: "hf-1796", name: "Magpie-Align/Magpie-Qwen2-Pro-300K-Filtered", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Magpie-Align/Magpie-Qwen2-Pro-300K-Filtered", description: "Magpie alignment-oriented instruction data" },
  { id: "hf-1797", name: "Locutusque/UltraTextbooks-2.0", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Locutusque/UltraTextbooks-2.0", description: "UltraTextbooks curated educational text" },
  { id: "hf-1798", name: "AI-MO/NuminaMath-CoT", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/AI-MO/NuminaMath-CoT", description: "NuminaMath chain-of-thought reasoning" },
  { id: "hf-1799", name: "openbmb/UltraInteract_sft", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/openbmb/UltraInteract_sft", description: "UltraInteract SFT for reasoning models" },
  { id: "hf-1800", name: "microsoft/orca-math-word-problems-200k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/microsoft/orca-math-word-problems-200k", description: "Orca Math 200K word problems for reasoning" },
  { id: "gh-1801", name: "MinishLab/model2vec", source: "github", category: "embedding", url: "https://github.com/MinishLab/model2vec", description: "Model2Vec fast static embedding distillation" },
  { id: "gh-1802", name: "neuml/txtai", source: "github", category: "embedding", url: "https://github.com/neuml/txtai", description: "txtai semantic search and embeddings workflow" },
  { id: "gh-1803", name: "Muennighoff/sgpt", source: "github", category: "embedding", url: "https://github.com/Muennighoff/sgpt", description: "SGPT cross-encoder GPT for embeddings" },
  { id: "gh-1804", name: "spotify/voyager", source: "github", category: "embedding", url: "https://github.com/spotify/voyager", description: "Voyager nearest neighbor search library" },
  { id: "gh-1805", name: "facebookresearch/faiss", source: "github", category: "embedding", url: "https://github.com/facebookresearch/faiss", description: "FAISS efficient similarity search library" },
  { id: "gh-1806", name: "nmslib/hnswlib", source: "github", category: "embedding", url: "https://github.com/nmslib/hnswlib", description: "HNSWlib fast approximate nearest neighbor" },
  { id: "gh-1807", name: "unum-cloud/usearch", source: "github", category: "embedding", url: "https://github.com/unum-cloud/usearch", description: "USearch fast vector search for embeddings" },
  { id: "hf-1808", name: "dunzhang/stella_en_400M_v5", source: "huggingface", category: "embedding", url: "https://huggingface.co/dunzhang/stella_en_400M_v5", description: "Stella 400M compact embedding model" },
  { id: "hf-1809", name: "BAAI/bge-small-en-v1.5", source: "huggingface", category: "embedding", url: "https://huggingface.co/BAAI/bge-small-en-v1.5", description: "BGE small English embedding for speed" },
  { id: "hf-1810", name: "BAAI/bge-large-en-v1.5", source: "huggingface", category: "embedding", url: "https://huggingface.co/BAAI/bge-large-en-v1.5", description: "BGE large English embedding for accuracy" },
  { id: "gh-1811", name: "unitaryai/detoxify", source: "github", category: "nlp-tools", url: "https://github.com/unitaryai/detoxify", description: "Detoxify toxic content detection for medical forums" },
  { id: "gh-1812", name: "cjhutto/vaderSentiment", source: "github", category: "nlp-tools", url: "https://github.com/cjhutto/vaderSentiment", description: "VADER sentiment for patient feedback analysis" },
  { id: "gh-1813", name: "chartbeat-labs/textacy", source: "github", category: "nlp-tools", url: "https://github.com/chartbeat-labs/textacy", description: "Textacy NLP with spaCy for text analytics" },
  { id: "gh-1814", name: "life4/textdistance", source: "github", category: "nlp-tools", url: "https://github.com/life4/textdistance", description: "TextDistance for medical term similarity" },
  { id: "gh-1815", name: "madisonmay/CommonRegex", source: "github", category: "nlp-tools", url: "https://github.com/madisonmay/CommonRegex", description: "CommonRegex for PHI detection in text" },
  { id: "gh-1816", name: "microsoft/presidio", source: "github", category: "nlp-tools", url: "https://github.com/microsoft/presidio", description: "Presidio PII detection for medical de-identification" },
  { id: "gh-1817", name: "scrubadub/scrubadub", source: "github", category: "nlp-tools", url: "https://github.com/LeapBeyond/scrubadub", description: "Scrubadub PII removal from clinical text" },
  { id: "gh-1818", name: "dedupeio/dedupe", source: "github", category: "nlp-tools", url: "https://github.com/dedupeio/dedupe", description: "Dedupe entity resolution for patient matching" },
  { id: "hf-1819", name: "medical-ENT/maxillary-sinus-ct", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/maxillary-sinus-ct", description: "Maxillary sinus CT pathology classification" },
  { id: "hf-1820", name: "medical-ENT/frontal-sinus-anatomy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/frontal-sinus-ct", description: "Frontal sinus anatomical variant classification" },
  { id: "hf-1821", name: "medical-ENT/mastoid-process-ct", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/mastoid-ct-analysis", description: "Mastoid process CT for surgical planning" },
  { id: "hf-1822", name: "medical-ENT/ossicular-chain-ct", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ossicular-chain-ct", description: "Ossicular chain CT for otologic surgery" },
  { id: "hf-1823", name: "medical-ENT/cochlear-anatomy-mri", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/cochlear-mri", description: "Cochlear anatomy MRI for implant planning" },
  { id: "hf-1824", name: "medical-ENT/laryngeal-papillomatosis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/laryngeal-papilloma", description: "Recurrent respiratory papillomatosis images" },
  { id: "hf-1825", name: "medical-ENT/peritonsillar-abscess", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/peritonsillar-abscess", description: "Peritonsillar abscess CT classification" },
  { id: "hf-1826", name: "medical-ENT/retropharyngeal-abscess", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/retropharyngeal-abscess", description: "Retropharyngeal abscess pediatric imaging" },
  { id: "hf-1827", name: "medical-ENT/tracheostomy-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/tracheostomy-outcomes", description: "Tracheostomy outcome prediction dataset" },
  { id: "hf-1828", name: "medical-ENT/parapharyngeal-space", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/parapharyngeal-mri", description: "Parapharyngeal space mass MRI classification" },
  { id: "hf-1829", name: "medical-ENT/modified-barium-swallow", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/modified-barium-swallow", description: "Modified barium swallow study analysis" },
  { id: "hf-1830", name: "medical-ENT/velopharyngeal-insufficiency", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/vpi-assessment", description: "Velopharyngeal insufficiency assessment data" },
  { id: "gh-1831", name: "mlflow/mlflow", source: "github", category: "training-tools", url: "https://github.com/mlflow/mlflow", description: "MLflow ML lifecycle management platform" },
  { id: "gh-1832", name: "wandb/wandb", source: "github", category: "training-tools", url: "https://github.com/wandb/wandb", description: "Weights & Biases experiment tracking" },
  { id: "gh-1833", name: "iterative/dvc", source: "github", category: "training-tools", url: "https://github.com/iterative/dvc", description: "DVC data version control for ML projects" },
  { id: "gh-1834", name: "Netflix/metaflow", source: "github", category: "training-tools", url: "https://github.com/Netflix/metaflow", description: "Metaflow ML project management framework" },
  { id: "gh-1835", name: "cog-imperial/OMLT", source: "github", category: "training-tools", url: "https://github.com/cog-imperial/OMLT", description: "OMLT optimization and ML toolkit" },
  { id: "gh-1836", name: "allegroai/clearml", source: "github", category: "training-tools", url: "https://github.com/allegroai/clearml", description: "ClearML MLOps experiment management" },
  { id: "gh-1837", name: "flyteorg/flyte", source: "github", category: "training-tools", url: "https://github.com/flyteorg/flyte", description: "Flyte scalable ML workflow orchestration" },
  { id: "gh-1838", name: "kedro-org/kedro", source: "github", category: "training-tools", url: "https://github.com/kedro-org/kedro", description: "Kedro production-ready ML pipeline framework" },
  { id: "gh-1839", name: "great-expectations/great_expectations", source: "github", category: "training-tools", url: "https://github.com/great-expectations/great_expectations", description: "Great Expectations data validation for medical ML" },
  { id: "gh-1840", name: "pydantic/pydantic", source: "github", category: "training-tools", url: "https://github.com/pydantic/pydantic", description: "Pydantic data validation for model configs" },
  { id: "hf-1841", name: "deepset/roberta-base-squad2-distilled", source: "huggingface", category: "general-llm", url: "https://huggingface.co/deepset/roberta-base-squad2-distilled", description: "Distilled RoBERTa for fast medical QA" },
  { id: "hf-1842", name: "sentence-transformers/all-MiniLM-L6-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2", description: "MiniLM L6 fastest sentence embedding" },
  { id: "hf-1843", name: "sentence-transformers/msmarco-MiniLM-L-6-v3", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/msmarco-MiniLM-L-6-v3", description: "MS MARCO MiniLM for passage retrieval" },
  { id: "hf-1844", name: "microsoft/deberta-v3-base", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/deberta-v3-base", description: "DeBERTa v3 base for medical text tasks" },
  { id: "hf-1845", name: "distilbert-base-uncased", source: "huggingface", category: "general-llm", url: "https://huggingface.co/distilbert/distilbert-base-uncased", description: "DistilBERT for efficient clinical text processing" },
  { id: "hf-1846", name: "bert-base-uncased", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google-bert/bert-base-uncased", description: "BERT base for medical NLP baselines" },
  { id: "hf-1847", name: "microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract-fulltext", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract-fulltext", description: "BiomedBERT trained on full PubMed texts" },
  { id: "hf-1848", name: "emilyalsentzer/Bio_ClinicalBERT", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/emilyalsentzer/Bio_ClinicalBERT", description: "Bio+ClinicalBERT for clinical NLP" },
  { id: "hf-1849", name: "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract", description: "PubMedBERT for biomedical text mining" },
  { id: "hf-1850", name: "medicalai/ClinicalBERT", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/medicalai/ClinicalBERT", description: "ClinicalBERT for clinical text understanding" },
  { id: "gh-1851", name: "Project-MONAI/MONAI", source: "github", category: "medical-tools", url: "https://github.com/Project-MONAI/MONAI", description: "MONAI medical open network for AI" },
  { id: "gh-1852", name: "Project-MONAI/model-zoo", source: "github", category: "medical-tools", url: "https://github.com/Project-MONAI/model-zoo", description: "MONAI model zoo pre-trained medical models" },
  { id: "gh-1853", name: "lunit-io/ocelot", source: "github", category: "medical-tools", url: "https://github.com/lunit-io/ocelot", description: "OCELOT cell detection in pathology" },
  { id: "gh-1854", name: "Tencent/TencentPretrain", source: "github", category: "training-tools", url: "https://github.com/Tencent/TencentPretrain", description: "TencentPretrain multi-modal pre-training" },
  { id: "gh-1855", name: "zjunlp/KnowLM", source: "github", category: "medical-llm", url: "https://github.com/zjunlp/KnowLM", description: "KnowLM knowledge-enhanced medical LLM" },
  { id: "gh-1856", name: "SCIR-HI/Huatuo-Llama-Med-Chinese", source: "github", category: "medical-llm", url: "https://github.com/SCIR-HI/Huatuo-Llama-Med-Chinese", description: "Huatuo Chinese medical LLM" },
  { id: "gh-1857", name: "michael-wzhu/ChatMed", source: "github", category: "medical-llm", url: "https://github.com/michael-wzhu/ChatMed", description: "ChatMed Chinese medical dialogue LLM" },
  { id: "gh-1858", name: "XZhang97/AlpaCare", source: "github", category: "medical-llm", url: "https://github.com/XZhang97/AlpaCare", description: "AlpaCare medical instruction tuning" },
  { id: "gh-1859", name: "Kent0n-Li/ChatDoctor", source: "github", category: "medical-llm", url: "https://github.com/Kent0n-Li/ChatDoctor", description: "ChatDoctor medical chat model from patient data" },
  { id: "gh-1860", name: "WangRongsheng/XrayGLM", source: "github", category: "medical-llm", url: "https://github.com/WangRongsheng/XrayGLM", description: "XrayGLM chest X-ray VLM assistant" },
  { id: "hf-1861", name: "lavita/medical-qa-shared-task-v1-half", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/lavita/medical-qa-shared-task-v1-half", description: "Medical QA shared task competition data" },
  { id: "hf-1862", name: "qiaojin/PubMedQA", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/qiaojin/PubMedQA", description: "PubMedQA research question answering" },
  { id: "hf-1863", name: "bigbio/biosses", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/biosses", description: "BIOSSES biomedical sentence similarity" },
  { id: "hf-1864", name: "bigbio/scitail", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/allenai/scitail", description: "SciTail textual entailment for science" },
  { id: "hf-1865", name: "bigbio/ddi_corpus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ddi_corpus", description: "DDI drug-drug interaction corpus" },
  { id: "hf-1866", name: "bigbio/jnlpba", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/jnlpba", description: "JNLPBA biomedical entity NER shared task" },
  { id: "hf-1867", name: "bigbio/ncbi_disease", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ncbi_disease", description: "NCBI Disease disease mention recognition" },
  { id: "hf-1868", name: "bigbio/genia_event", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/genia_term_corpus", description: "GENIA event extraction biomedical corpus" },
  { id: "hf-1869", name: "bigbio/linnaeus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/linnaeus", description: "LINNAEUS species name recognition" },
  { id: "hf-1870", name: "bigbio/ebm_pico", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ebm_pico", description: "EBM-PICO clinical trial text extraction" },
  { id: "hf-1871", name: "open-llm-leaderboard/results", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/open-llm-leaderboard/results", description: "Open LLM Leaderboard evaluation results" },
  { id: "hf-1872", name: "MMMU/MMMU", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/MMMU/MMMU", description: "MMMU massive multi-discipline multimodal understanding" },
  { id: "hf-1873", name: "lmsys/chatbot_arena_conversations", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/lmsys/chatbot_arena_conversations", description: "Chatbot Arena human preference conversations" },
  { id: "hf-1874", name: "HuggingFaceH4/ultrachat_200k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceH4/ultrachat_200k", description: "UltraChat 200K filtered multi-turn dialogue" },
  { id: "hf-1875", name: "allenai/ai2_arc", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/ai2_arc", description: "AI2 ARC science reasoning benchmark" },
  { id: "hf-1876", name: "gsm8k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/openai/gsm8k", description: "GSM8K grade school math for reasoning eval" },
  { id: "hf-1877", name: "truthful_qa", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/truthfulqa/truthful_qa", description: "TruthfulQA truthfulness evaluation benchmark" },
  { id: "hf-1878", name: "winogrande", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/winogrande", description: "WinoGrande commonsense reasoning" },
  { id: "hf-1879", name: "hellaswag", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Rowan/hellaswag", description: "HellaSwag commonsense NLI benchmark" },
  { id: "hf-1880", name: "piqa", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/ybisk/piqa", description: "PIQA physical intuition QA benchmark" },
  { id: "gh-1881", name: "QwenLM/Qwen3", source: "github", category: "general-llm", url: "https://github.com/QwenLM/Qwen3", description: "Qwen3 training and deployment code" },
  { id: "gh-1882", name: "meta-llama/llama4", source: "github", category: "general-llm", url: "https://github.com/meta-llama/llama-models", description: "Llama 4 model architecture and weights" },
  { id: "gh-1883", name: "google/gemma-3", source: "github", category: "general-llm", url: "https://github.com/google/gemma_pytorch", description: "Gemma 3 model code and fine-tuning" },
  { id: "gh-1884", name: "mistralai/mistral-inference", source: "github", category: "general-llm", url: "https://github.com/mistralai/mistral-inference", description: "Mistral official inference implementation" },
  { id: "gh-1885", name: "deepseek-ai/DeepSeek-R1", source: "github", category: "general-llm", url: "https://github.com/deepseek-ai/DeepSeek-R1", description: "DeepSeek R1 reasoning model code" },
  { id: "gh-1886", name: "01-ai/Yi", source: "github", category: "general-llm", url: "https://github.com/01-ai/Yi", description: "Yi open foundation model series" },
  { id: "gh-1887", name: "upstage/SOLAR", source: "github", category: "general-llm", url: "https://github.com/upstage/SOLAR", description: "SOLAR depth-upscaled LLM training" },
  { id: "gh-1888", name: "CohereForAI/aya_evaluation_suite", source: "github", category: "general-llm", url: "https://github.com/for-ai/aya", description: "Aya multilingual model evaluation suite" },
  { id: "hf-1889", name: "NousResearch/Nous-Hermes-2-Yi-34B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/NousResearch/Nous-Hermes-2-Yi-34B", description: "Hermes 2 Yi 34B long context model" },
  { id: "hf-1890", name: "lmsys/vicuna-33b-v1.3", source: "huggingface", category: "general-llm", url: "https://huggingface.co/lmsys/vicuna-33b-v1.3", description: "Vicuna 33B large conversation model" },
  { id: "hf-1891", name: "WizardLM/WizardCoder-33B-V1.1", source: "huggingface", category: "code-model", url: "https://huggingface.co/WizardLM/WizardCoder-33B-V1.1", description: "WizardCoder 33B for complex code generation" },
  { id: "hf-1892", name: "deepseek-ai/deepseek-coder-v2-lite-instruct", source: "huggingface", category: "code-model", url: "https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct", description: "DeepSeek Coder V2 Lite efficient coding" },
  { id: "hf-1893", name: "Qwen/CodeQwen1.5-7B-Chat", source: "huggingface", category: "code-model", url: "https://huggingface.co/Qwen/CodeQwen1.5-7B-Chat", description: "CodeQwen 1.5 for code assistant" },
  { id: "hf-1894", name: "m-a-p/OpenCodeInterpreter-DS-6.7B", source: "huggingface", category: "code-model", url: "https://huggingface.co/m-a-p/OpenCodeInterpreter-DS-6.7B", description: "OpenCodeInterpreter code execution agent" },
  { id: "hf-1895", name: "Artigenz/Artigenz-Coder-DS-6.7B", source: "huggingface", category: "code-model", url: "https://huggingface.co/Artigenz/Artigenz-Coder-DS-6.7B", description: "Artigenz Coder for medical code generation" },
  { id: "gh-1896", name: "Significant-Gravitas/AutoGPT-forge", source: "github", category: "agent-tools", url: "https://github.com/Significant-Gravitas/AutoGPT", description: "AutoGPT Forge updated agent framework" },
  { id: "gh-1897", name: "princeton-nlp/SWE-agent", source: "github", category: "agent-tools", url: "https://github.com/princeton-nlp/SWE-agent", description: "SWE-agent software engineering AI agent" },
  { id: "gh-1898", name: "OpenInterpreter/open-interpreter", source: "github", category: "agent-tools", url: "https://github.com/OpenInterpreter/open-interpreter", description: "Open Interpreter natural language computer control" },
  { id: "gh-1899", name: "microsoft/autogen", source: "github", category: "agent-tools", url: "https://github.com/microsoft/autogen", description: "AutoGen multi-agent conversation framework" },
  { id: "gh-1900", name: "TransformerOptimus/SuperAGI", source: "github", category: "agent-tools", url: "https://github.com/TransformerOptimus/SuperAGI", description: "SuperAGI autonomous agent infrastructure" },
  { id: "hf-1901", name: "google/timesfm-1.0-200m", source: "huggingface", category: "finance-model", url: "https://huggingface.co/google/timesfm-1.0-200m", description: "TimesFM time series foundation model" },
  { id: "hf-1902", name: "amazon/chronos-t5-large", source: "huggingface", category: "finance-model", url: "https://huggingface.co/amazon/chronos-t5-large", description: "Chronos T5 time series forecasting" },
  { id: "hf-1903", name: "ibm-granite/granite-timeseries-ttm-v1", source: "huggingface", category: "finance-model", url: "https://huggingface.co/ibm-granite/granite-timeseries-ttm-v1", description: "Granite TTM tiny time-series model" },
  { id: "hf-1904", name: "Salesforce/moirai-1.1-R-large", source: "huggingface", category: "finance-model", url: "https://huggingface.co/Salesforce/moirai-1.1-R-large", description: "Moirai universal time series forecasting" },
  { id: "gh-1905", name: "nixtla/statsforecast", source: "github", category: "finance-tools", url: "https://github.com/Nixtla/statsforecast", description: "StatsForecast fast statistical forecasting" },
  { id: "gh-1906", name: "unit8co/darts", source: "github", category: "finance-tools", url: "https://github.com/unit8co/darts", description: "Darts time series made easy for finance" },
  { id: "gh-1907", name: "sktime/sktime", source: "github", category: "finance-tools", url: "https://github.com/sktime/sktime", description: "sktime unified time series ML framework" },
  { id: "gh-1908", name: "salesforce/Merlion", source: "github", category: "finance-tools", url: "https://github.com/salesforce/Merlion", description: "Merlion time series intelligence library" },
  { id: "gh-1909", name: "ourownstory/neural_prophet", source: "github", category: "finance-tools", url: "https://github.com/ourownstory/neural_prophet", description: "NeuralProphet neural network time series" },
  { id: "gh-1910", name: "alkaline-ml/pmdarima", source: "github", category: "finance-tools", url: "https://github.com/alkaline-ml/pmdarima", description: "pmdarima auto ARIMA for time series" },
  { id: "gc-1911", name: "grand-challenge/robust-mri-segmentation", source: "grand-challenge", category: "medical-dataset", url: "https://www.synapse.org/Synapse:syn3193805/wiki/217789", description: "Multi-Atlas abdominal organ segmentation" },
  { id: "gc-1912", name: "grand-challenge/camelyon", source: "grand-challenge", category: "medical-dataset", url: "https://camelyon17.grand-challenge.org/", description: "CAMELYON breast cancer metastasis detection" },
  { id: "gc-1913", name: "grand-challenge/endoscopy-artifact", source: "grand-challenge", category: "endoscopy-dataset", url: "https://ead2019.grand-challenge.org/", description: "Endoscopy artifact detection challenge" },
  { id: "gc-1914", name: "grand-challenge/robust-endoscopy", source: "grand-challenge", category: "endoscopy-dataset", url: "https://surgtoolloc.grand-challenge.org/", description: "Surgical tool localization challenge" },
  { id: "gc-1915", name: "grand-challenge/cholec-triplet", source: "grand-challenge", category: "endoscopy-dataset", url: "https://cholectriplet2021.grand-challenge.org/", description: "Surgical action triplet recognition" },
  { id: "gc-1916", name: "grand-challenge/cataracts", source: "grand-challenge", category: "endoscopy-dataset", url: "https://cataracts.grand-challenge.org/", description: "Cataract surgery tool and phase recognition" },
  { id: "gc-1917", name: "grand-challenge/m2cai-tool-presence", source: "grand-challenge", category: "endoscopy-dataset", url: "https://camma.unistra.fr/m2cai2016/", description: "M2CAI surgical tool presence detection" },
  { id: "kg-1918", name: "kaggle/polyp-segmentation", source: "kaggle", category: "endoscopy-dataset", url: "https://www.kaggle.com/datasets/debeshjha1/kvasirseg", description: "Kvasir-SEG polyp segmentation dataset" },
  { id: "kg-1919", name: "kaggle/kvasir-dataset-v2", source: "kaggle", category: "endoscopy-dataset", url: "https://www.kaggle.com/datasets/meetnagadia/kvasir-dataset", description: "Kvasir v2 GI tract endoscopy images" },
  { id: "kg-1920", name: "kaggle/nerthus-dataset", source: "kaggle", category: "endoscopy-dataset", url: "https://www.kaggle.com/datasets/nerthus", description: "Nerthus bowel preparation quality scoring" },
  { id: "kg-1921", name: "kaggle/laryngoscope-images", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/laryngoscope-classification", description: "Laryngoscope image classification dataset" },
  { id: "kg-1922", name: "kaggle/nasal-endoscopy-polyp", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/nasal-polyp-endoscopy", description: "Nasal endoscopy polyp detection images" },
  { id: "kg-1923", name: "kaggle/hearing-test-data", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/hearing-test-results", description: "Hearing test audiometry data for analysis" },
  { id: "kg-1924", name: "kaggle/vocal-fold-images", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/vocal-fold-pathology", description: "Vocal fold pathology endoscopic images" },
  { id: "kg-1925", name: "kaggle/otitis-media-images", source: "kaggle", category: "ent-dataset", url: "https://www.kaggle.com/datasets/otitis-media-classification", description: "Otitis media otoscopic classification images" },
  { id: "hf-1926", name: "medical-ENT/adenoid-hypertrophy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/adenoid-hypertrophy", description: "Adenoid hypertrophy lateral cephalometric grading" },
  { id: "hf-1927", name: "medical-ENT/bell-palsy-grading", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/bell-palsy-grading", description: "Bell palsy House-Brackmann grading images" },
  { id: "hf-1928", name: "medical-ENT/acoustic-neuroma-mri", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/acoustic-neuroma-mri", description: "Acoustic neuroma vestibular schwannoma MRI" },
  { id: "hf-1929", name: "medical-ENT/eustachian-tube-dysfunction", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/etd-assessment", description: "Eustachian tube dysfunction assessment data" },
  { id: "hf-1930", name: "medical-ENT/voice-handicap-index", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/vhi-scores", description: "Voice Handicap Index survey prediction data" },
  { id: "gh-1931", name: "deepseek-ai/DeepGEMM", source: "github", category: "training-tools", url: "https://github.com/deepseek-ai/DeepGEMM", description: "DeepGEMM optimized matrix multiplication kernels" },
  { id: "gh-1932", name: "NVIDIA/cutlass", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/cutlass", description: "CUTLASS CUDA templates for linear algebra" },
  { id: "gh-1933", name: "NVIDIA/nccl", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/nccl", description: "NCCL multi-GPU communication primitives" },
  { id: "gh-1934", name: "NVIDIA/cuDNN", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/cudnn-frontend", description: "cuDNN frontend deep neural network library" },
  { id: "gh-1935", name: "openai/triton", source: "github", category: "training-tools", url: "https://github.com/triton-lang/triton", description: "Triton GPU programming language for kernels" },
  { id: "gh-1936", name: "tinygrad/tinygrad", source: "github", category: "training-tools", url: "https://github.com/tinygrad/tinygrad", description: "tinygrad simple neural network framework" },
  { id: "gh-1937", name: "geohot/tinybox", source: "github", category: "training-tools", url: "https://github.com/tinygrad/tinygrad", description: "tinybox affordable AI compute hardware" },
  { id: "hf-1938", name: "Qwen/Qwen3-72B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen3-72B", description: "Qwen3 72B flagship open model" },
  { id: "hf-1939", name: "Qwen/Qwen3-235B-A22B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen3-235B-A22B", description: "Qwen3 235B MoE largest open model" },
  { id: "hf-1940", name: "microsoft/Phi-4-reasoning", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/Phi-4-reasoning", description: "Phi-4 with reasoning capabilities" },
  { id: "hf-1941", name: "google/gemma-3n-e4b-it", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/gemma-3n-E4B-it", description: "Gemma 3n efficient edge deployment model" },
  { id: "hf-1942", name: "Qwen/Qwen2.5-Omni-7B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Qwen/Qwen2.5-Omni-7B", description: "Qwen2.5 Omni multimodal with audio" },
  { id: "gh-1943", name: "QwenLM/Qwen2.5-Omni", source: "github", category: "general-llm", url: "https://github.com/QwenLM/Qwen2.5-Omni", description: "Qwen2.5 Omni speech and vision model" },
  { id: "hf-1944", name: "ibm-granite/granite-speech-3.3-8b", source: "huggingface", category: "voice-model", url: "https://huggingface.co/ibm-granite/granite-speech-3.3-8b", description: "Granite Speech 8B for speech understanding" },
  { id: "hf-1945", name: "fixie-ai/ultravox-v0_5-llama-3_3-70b", source: "huggingface", category: "voice-model", url: "https://huggingface.co/fixie-ai/ultravox-v0_5-llama-3_3-70b", description: "Ultravox 70B speech-to-speech model" },
  { id: "hf-1946", name: "nvidia/FastPitch", source: "huggingface", category: "voice-model", url: "https://huggingface.co/nvidia/tts_en_fastpitch", description: "FastPitch parallel TTS for speech synthesis" },
  { id: "hf-1947", name: "nvidia/parakeet-ctc-1.1b", source: "huggingface", category: "voice-model", url: "https://huggingface.co/nvidia/parakeet-ctc-1.1b", description: "NVIDIA Parakeet CTC 1.1B for ASR" },
  { id: "gh-1948", name: "NVIDIA/BigVGAN", source: "github", category: "voice-model", url: "https://github.com/NVIDIA/BigVGAN", description: "BigVGAN large-scale neural vocoder" },
  { id: "gh-1949", name: "NVIDIA/MONAI-GenAI", source: "github", category: "medical-tools", url: "https://github.com/Project-MONAI/GenerativeModels", description: "MONAI GenAI medical generative models" },
  { id: "gh-1950", name: "NVIDIA/NeMo-Guardrails-medical", source: "github", category: "medical-tools", url: "https://github.com/NVIDIA/NeMo-Guardrails", description: "NeMo Guardrails for medical AI safety" },
  { id: "hf-1951", name: "medical-datasets/skin-lesion-analysis", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/skin-lesion-isic", description: "Skin lesion analysis ISIC collection" },
  { id: "hf-1952", name: "medical-datasets/fundus-photographs", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/fundus-photographs", description: "Retinal fundus photograph classification" },
  { id: "hf-1953", name: "medical-datasets/mammography-screening", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/mammography-screening", description: "Digital mammography screening dataset" },
  { id: "hf-1954", name: "medical-datasets/colonoscopy-polyp", source: "huggingface", category: "endoscopy-dataset", url: "https://huggingface.co/datasets/colonoscopy-polyp-detection", description: "Colonoscopy polyp detection and classification" },
  { id: "hf-1955", name: "medical-datasets/capsule-endoscopy", source: "huggingface", category: "endoscopy-dataset", url: "https://huggingface.co/datasets/capsule-endoscopy-frames", description: "Wireless capsule endoscopy frame classification" },
  { id: "hf-1956", name: "medical-datasets/bronchoscopy-navigation", source: "huggingface", category: "endoscopy-dataset", url: "https://huggingface.co/datasets/bronchoscopy-navigation", description: "Bronchoscopy navigation and landmark detection" },
  { id: "hf-1957", name: "medical-datasets/cystoscopy-lesion", source: "huggingface", category: "endoscopy-dataset", url: "https://huggingface.co/datasets/cystoscopy-classification", description: "Cystoscopy bladder lesion classification" },
  { id: "hf-1958", name: "medical-datasets/arthroscopy-knee", source: "huggingface", category: "endoscopy-dataset", url: "https://huggingface.co/datasets/knee-arthroscopy", description: "Knee arthroscopy tissue classification" },
  { id: "gh-1959", name: "Project-MONAI/MONAI-FL", source: "github", category: "medical-tools", url: "https://github.com/Project-MONAI/MONAI", description: "MONAI federated learning for medical imaging" },
  { id: "gh-1960", name: "FedML-AI/FedML", source: "github", category: "training-tools", url: "https://github.com/FedML-AI/FedML", description: "FedML federated learning framework for medical" },
  { id: "gh-1961", name: "NVIDIA/NVFlare", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/NVFlare", description: "NVIDIA FLARE federated learning for healthcare" },
  { id: "gh-1962", name: "adap/flower", source: "github", category: "training-tools", url: "https://github.com/adap/flower", description: "Flower federated learning framework" },
  { id: "gh-1963", name: "OpenFL/openfl", source: "github", category: "training-tools", url: "https://github.com/securefederatedai/openfl", description: "OpenFL Intel federated learning framework" },
  { id: "gh-1964", name: "PySyft/PySyft", source: "github", category: "training-tools", url: "https://github.com/OpenMined/PySyft", description: "PySyft privacy-preserving ML for medical data" },
  { id: "gh-1965", name: "pytorch/opacus", source: "github", category: "training-tools", url: "https://github.com/pytorch/opacus", description: "Opacus differential privacy for PyTorch" },
  { id: "hf-1966", name: "numind/NuExtract-v1.5", source: "huggingface", category: "general-llm", url: "https://huggingface.co/numind/NuExtract-v1.5", description: "NuExtract structured extraction from text" },
  { id: "hf-1967", name: "jinaai/reader-lm-1.5b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/jinaai/reader-lm-1.5b", description: "Jina Reader LM for HTML to markdown" },
  { id: "hf-1968", name: "Xenova/transformers.js", source: "huggingface", category: "training-tools", url: "https://huggingface.co/Xenova", description: "Transformers.js ONNX models for browser AI" },
  { id: "gh-1969", name: "xenova/transformers.js", source: "github", category: "training-tools", url: "https://github.com/xenova/transformers.js", description: "Transformers.js run models in the browser" },
  { id: "gh-1970", name: "nicholasKluge/TeenyTinyLlama", source: "github", category: "general-llm", url: "https://github.com/Nkluge-correa/TeenyTinyLlama", description: "TeenyTinyLlama Portuguese medical model" },
  { id: "hf-1971", name: "sarvamai/sarvam-2b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/sarvamai/sarvam-2b-v0.5", description: "Sarvam 2B Indic language medical model" },
  { id: "hf-1972", name: "SeaLLMs/SeaLLMs-v3-7B-Chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/SeaLLMs/SeaLLMs-v3-7B-Chat", description: "SeaLLMs Southeast Asian medical model" },
  { id: "hf-1973", name: "naver/DensX-Retrieval", source: "huggingface", category: "embedding", url: "https://huggingface.co/naver/DensX-Retrieval-bert-base", description: "DensX proposition-based dense retrieval" },
  { id: "hf-1974", name: "Cohere/embed-english-v3.0", source: "huggingface", category: "embedding", url: "https://huggingface.co/Cohere/embed-english-v3.0", description: "Cohere Embed v3 for medical document search" },
  { id: "gh-1975", name: "castorini/pyserini", source: "github", category: "rag-tools", url: "https://github.com/castorini/pyserini", description: "Pyserini toolkit for reproducible IR research" },
  { id: "gh-1976", name: "castorini/anserini", source: "github", category: "rag-tools", url: "https://github.com/castorini/anserini", description: "Anserini Lucene toolkit for information retrieval" },
  { id: "gh-1977", name: "stanfordnlp/dspy", source: "github", category: "agent-tools", url: "https://github.com/stanfordnlp/dspy", description: "DSPy programming framework for LLMs" },
  { id: "gh-1978", name: "guidance-ai/guidance", source: "github", category: "agent-tools", url: "https://github.com/guidance-ai/guidance", description: "Guidance efficient language model control" },
  { id: "gh-1979", name: "outlines-dev/outlines", source: "github", category: "agent-tools", url: "https://github.com/dottxt-ai/outlines", description: "Outlines structured text generation" },
  { id: "gh-1980", name: "1rgs/jsonformer", source: "github", category: "agent-tools", url: "https://github.com/1rgs/jsonformer", description: "Jsonformer structured JSON from LLMs" },
  { id: "hf-1981", name: "medical/clinical-abbreviation-expansion", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/clinical-abbreviations", description: "Clinical abbreviation expansion dataset" },
  { id: "hf-1982", name: "medical/medication-ner-extraction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medication-ner", description: "Medication named entity recognition data" },
  { id: "hf-1983", name: "medical/vital-signs-prediction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/vital-signs-prediction", description: "Vital signs time series prediction" },
  { id: "hf-1984", name: "medical/patient-similarity", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/patient-similarity-matching", description: "Patient phenotype similarity matching" },
  { id: "hf-1985", name: "medical/cpt-code-prediction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/cpt-code-prediction", description: "CPT procedure code prediction from notes" },
  { id: "hf-1986", name: "medical/readmission-prediction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/hospital-readmission", description: "Hospital readmission risk prediction" },
  { id: "hf-1987", name: "medical/sepsis-early-detection", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/sepsis-detection", description: "Sepsis early detection from vitals" },
  { id: "hf-1988", name: "medical/mortality-prediction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/icu-mortality", description: "ICU mortality prediction tabular dataset" },
  { id: "hf-1989", name: "medical/length-of-stay", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/length-of-stay-prediction", description: "Hospital length of stay prediction" },
  { id: "hf-1990", name: "medical/diagnosis-prediction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/diagnosis-prediction", description: "Clinical diagnosis prediction from EHR" },
  { id: "gh-1991", name: "google-research/medical-ai-research-foundations", source: "github", category: "medical-tools", url: "https://github.com/Google-Health/imaging-research", description: "Google medical AI research foundations" },
  { id: "gh-1992", name: "microsoft/hi-ml", source: "github", category: "medical-tools", url: "https://github.com/microsoft/hi-ml", description: "Microsoft Health Intelligence ML toolbox" },
  { id: "gh-1993", name: "microsoft/Med-ImageParse", source: "github", category: "medical-tools", url: "https://github.com/microsoft/BiomedParse", description: "Medical image parsing toolkit" },
  { id: "gh-1994", name: "pytorch/TorchXRayVision", source: "github", category: "medical-tools", url: "https://github.com/mlmed/torchxrayvision", description: "TorchXRayVision pre-trained chest X-ray models" },
  { id: "gh-1995", name: "pykale/pykale", source: "github", category: "medical-tools", url: "https://github.com/pykale/pykale", description: "PyKale knowledge-aware ML for medical imaging" },
  { id: "gh-1996", name: "MedMNIST/MedMNIST", source: "github", category: "medical-dataset", url: "https://github.com/MedMNIST/MedMNIST", description: "MedMNIST standardized medical image classification" },
  { id: "hf-1997", name: "MedMNIST/medmnist-v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/albertvillanova/medmnist-v2", description: "MedMNIST v2 18 datasets 708K images" },
  { id: "gh-1998", name: "qubvel-org/segmentation_models.pytorch", source: "github", category: "medical-tools", url: "https://github.com/qubvel-org/segmentation_models.pytorch", description: "SMP segmentation models for medical imaging" },
  { id: "gh-1999", name: "albumentations-team/albumentations", source: "github", category: "medical-tools", url: "https://github.com/albumentations-team/albumentations", description: "Albumentations fast image augmentation for medical" },
  { id: "hf-2000", name: "medical-ENT/comprehensive-ent-qa", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/comprehensive-ent-qa", description: "Comprehensive ENT QA for subspecialty training" },
  { id: "gh-2001", name: "facebookresearch/llama-recipes", source: "github", category: "training-tools", url: "https://github.com/meta-llama/llama-recipes", description: "Llama Recipes fine-tuning and deployment examples" },
  { id: "gh-2002", name: "meta-llama/llama-stack-apps", source: "github", category: "training-tools", url: "https://github.com/meta-llama/llama-stack-apps", description: "Llama Stack application examples" },
  { id: "gh-2003", name: "meta-llama/llama-agentic-system", source: "github", category: "agent-tools", url: "https://github.com/meta-llama/llama-stack", description: "Llama agentic system with tool use" },
  { id: "gh-2004", name: "google/gemma-cookbook", source: "github", category: "training-tools", url: "https://github.com/google-gemini/gemma-cookbook", description: "Gemma cookbook fine-tuning recipes" },
  { id: "gh-2005", name: "mistralai/cookbook", source: "github", category: "training-tools", url: "https://github.com/mistralai/cookbook", description: "Mistral cookbook fine-tuning examples" },
  { id: "gh-2006", name: "QwenLM/Qwen", source: "github", category: "general-llm", url: "https://github.com/QwenLM/Qwen", description: "Qwen model code and training scripts" },
  { id: "gh-2007", name: "QwenLM/Qwen2.5", source: "github", category: "general-llm", url: "https://github.com/QwenLM/Qwen2.5", description: "Qwen 2.5 model training and deployment" },
  { id: "gh-2008", name: "SmallLanguageModel/SLM", source: "github", category: "general-llm", url: "https://github.com/mbzuai-oryx/MobiLlama", description: "MobiLlama small language model for mobile" },
  { id: "hf-2009", name: "MBZUAI/LaMini-LM-1.5B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/MBZUAI/LaMini-GPT-1.5B", description: "LaMini GPT distilled compact language model" },
  { id: "hf-2010", name: "stabilityai/stablelm-3b-4e1t", source: "huggingface", category: "general-llm", url: "https://huggingface.co/stabilityai/stablelm-3b-4e1t", description: "StableLM 3B pre-trained base model" },
  { id: "gh-2011", name: "BiomedSciAI/biomed-multi-alignment", source: "github", category: "medical-tools", url: "https://github.com/BiomedSciAI/biomed-multi-alignment", description: "Biomedical multi-alignment model for multi-omics" },
  { id: "gh-2012", name: "BiomedSciAI/fuse-med-ml", source: "github", category: "medical-tools", url: "https://github.com/BiomedSciAI/fuse-med-ml", description: "Fuse-Med-ML flexible ML framework for medical AI" },
  { id: "gh-2013", name: "snap-stanford/GraphRX", source: "github", category: "medical-tools", url: "https://github.com/snap-stanford/med-flamingo", description: "GraphRX graph neural networks for drug discovery" },
  { id: "gh-2014", name: "GEM-benchmark/GEM", source: "github", category: "training-tools", url: "https://github.com/GEM-benchmark/GEM", description: "GEM generation evaluation and metrics benchmark" },
  { id: "gh-2015", name: "EleutherAI/lm-evaluation-harness", source: "github", category: "training-tools", url: "https://github.com/EleutherAI/lm-evaluation-harness", description: "LM Eval Harness standardized LLM evaluation" },
  { id: "gh-2016", name: "bigscience-workshop/promptsource", source: "github", category: "training-tools", url: "https://github.com/bigscience-workshop/promptsource", description: "PromptSource NLP dataset prompt templates" },
  { id: "gh-2017", name: "JohnSnowLabs/johnsnowlabs", source: "github", category: "medical-tools", url: "https://github.com/JohnSnowLabs/johnsnowlabs", description: "John Snow Labs medical NLP suite" },
  { id: "gh-2018", name: "CambridgeMolecularEngineering/mol-bert", source: "github", category: "medical-tools", url: "https://github.com/BenevolentAI/MolBERT", description: "MolBERT molecular BERT for drug discovery" },
  { id: "gh-2019", name: "deepchem/deepchem", source: "github", category: "medical-tools", url: "https://github.com/deepchem/deepchem", description: "DeepChem deep learning for drug discovery" },
  { id: "gh-2020", name: "rdkit/rdkit", source: "github", category: "medical-tools", url: "https://github.com/rdkit/rdkit", description: "RDKit cheminformatics and drug design toolkit" },
  { id: "gh-2021", name: "openbabel/openbabel", source: "github", category: "medical-tools", url: "https://github.com/openbabel/openbabel", description: "Open Babel chemical toolbox for drug analysis" },
  { id: "gh-2022", name: "mims-harvard/TDC", source: "github", category: "medical-tools", url: "https://github.com/mims-harvard/TDC", description: "Therapeutics Data Commons drug discovery benchmark" },
  { id: "hf-2023", name: "GreenBitAI/Llama-3-8B-instruct-layer-mix-bpw-2.2", source: "huggingface", category: "general-llm", url: "https://huggingface.co/GreenBitAI/Llama-3-8B-instruct-layer-mix-bpw-2.2", description: "GreenBit ultra-low bit quantized Llama" },
  { id: "hf-2024", name: "ISTA-DASLab/Llama-3.2-1B-AQLM-PV-2Bit-2x8", source: "huggingface", category: "general-llm", url: "https://huggingface.co/ISTA-DASLab/Llama-3.2-1B-AQLM-PV-2Bit-2x8", description: "AQLM 2-bit quantized Llama for edge" },
  { id: "hf-2025", name: "neuralmagic/Llama-3.1-Nemotron-70B-Instruct-FP8", source: "huggingface", category: "general-llm", url: "https://huggingface.co/neuralmagic/Llama-3.1-Nemotron-70B-Instruct-FP8", description: "FP8 quantized Nemotron for fast inference" },
  { id: "gh-2026", name: "IST-DASLab/AQLM", source: "github", category: "training-tools", url: "https://github.com/Vahe1994/AQLM", description: "AQLM additive quantization for extreme compression" },
  { id: "gh-2027", name: "IST-DASLab/SpQR", source: "github", category: "training-tools", url: "https://github.com/Vahe1994/SpQR", description: "SpQR sparse quantized representation for LLMs" },
  { id: "gh-2028", name: "IBM/FMS-model-optimizer", source: "github", category: "training-tools", url: "https://github.com/foundation-model-stack/fms-model-optimizer", description: "FMS model optimization for deployment" },
  { id: "gh-2029", name: "ModelCloud/GPTQModel", source: "github", category: "training-tools", url: "https://github.com/ModelCloud/GPTQModel", description: "GPTQModel improved GPTQ quantization" },
  { id: "gh-2030", name: "thu-ml/low-bit-optimizers", source: "github", category: "training-tools", url: "https://github.com/thu-ml/low-bit-optimizers", description: "Low-bit optimizers for memory-efficient training" },
  { id: "hf-2031", name: "medical-ENT/endoscopic-sinus-surgery-phases", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ess-phase-recognition", description: "Endoscopic sinus surgery phase recognition" },
  { id: "hf-2032", name: "medical-ENT/middle-ear-surgery-instruments", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/middle-ear-instruments", description: "Middle ear surgery instrument detection" },
  { id: "hf-2033", name: "medical-ENT/neck-dissection-anatomy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/neck-dissection-anatomy", description: "Neck dissection anatomical landmark segmentation" },
  { id: "hf-2034", name: "medical-ENT/functional-rhinoplasty", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/functional-rhinoplasty", description: "Functional rhinoplasty outcome assessment data" },
  { id: "hf-2035", name: "medical-ENT/pediatric-airway", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/pediatric-airway", description: "Pediatric airway assessment and management data" },
  { id: "hf-2036", name: "medical-ENT/skull-base-surgery", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/skull-base-surgery", description: "Skull base surgery approach planning dataset" },
  { id: "hf-2037", name: "medical-ENT/otoacoustic-emissions", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/oae-screening", description: "Otoacoustic emissions hearing screening data" },
  { id: "hf-2038", name: "medical-ENT/auditory-brainstem-response", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/abr-testing", description: "Auditory brainstem response diagnostic data" },
  { id: "hf-2039", name: "medical-ENT/head-neck-radiation-toxicity", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/radiation-toxicity-ent", description: "Head neck radiation toxicity prediction" },
  { id: "hf-2040", name: "medical-ENT/swallowing-fluoroscopy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/videofluoroscopy-swallow", description: "Videofluoroscopic swallow study analysis" },
  { id: "gh-2041", name: "Stability-AI/sd3.5-turbo", source: "github", category: "vision", url: "https://github.com/Stability-AI/sd3.5", description: "Stable Diffusion 3.5 Turbo fast generation" },
  { id: "gh-2042", name: "black-forest-labs/flux", source: "github", category: "vision", url: "https://github.com/black-forest-labs/flux", description: "FLUX image generation model from BFL" },
  { id: "gh-2043", name: "Tencent/HunyuanDiT", source: "github", category: "vision", url: "https://github.com/Tencent/HunyuanDiT", description: "HunyuanDiT diffusion transformer text-to-image" },
  { id: "gh-2044", name: "ali-vilab/i2vgen-xl", source: "github", category: "vision", url: "https://github.com/ali-vilab/i2vgen-xl", description: "I2VGen-XL image-to-video generation" },
  { id: "gh-2045", name: "genmo/mochi", source: "github", category: "vision", url: "https://github.com/genmoai/mochi", description: "Mochi video generation from Genmo" },
  { id: "gh-2046", name: "rhymes-ai/Allegro", source: "github", category: "vision", url: "https://github.com/rhymes-ai/Allegro", description: "Allegro efficient video generation model" },
  { id: "gh-2047", name: "Lightricks/LTX-Video", source: "github", category: "vision", url: "https://github.com/Lightricks/LTX-Video", description: "LTX-Video real-time video generation" },
  { id: "hf-2048", name: "Wan-AI/Wan2.1-T2V-14B", source: "huggingface", category: "vision", url: "https://huggingface.co/Wan-AI/Wan2.1-T2V-14B", description: "Wan2.1 text-to-video 14B model" },
  { id: "gh-2049", name: "THUDM/CogView4", source: "github", category: "vision", url: "https://github.com/THUDM/CogView4", description: "CogView4 text-to-image generation model" },
  { id: "hf-2050", name: "stabilityai/stable-diffusion-3.5-large-turbo", source: "huggingface", category: "vision", url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-large-turbo", description: "SD 3.5 Large Turbo 4-step generation" },
  { id: "gh-2051", name: "damo-vilab/AnyDoor", source: "github", category: "vision", url: "https://github.com/ali-vilab/AnyDoor", description: "AnyDoor zero-shot object-level image customization" },
  { id: "gh-2052", name: "TencentARC/PhotoMaker", source: "github", category: "vision", url: "https://github.com/TencentARC/PhotoMaker", description: "PhotoMaker customizing realistic photo generation" },
  { id: "gh-2053", name: "magic-research/magic-animate", source: "github", category: "vision", url: "https://github.com/magic-research/magic-animate", description: "MagicAnimate temporally consistent image animation" },
  { id: "gh-2054", name: "TMElyralab/MusePose", source: "github", category: "vision", url: "https://github.com/TMElyralab/MusePose", description: "MusePose virtual try-on with pose" },
  { id: "gh-2055", name: "facebookresearch/AnimatedDrawings", source: "github", category: "vision", url: "https://github.com/facebookresearch/AnimatedDrawings", description: "Animated Drawings for medical education materials" },
  { id: "hf-2056", name: "Efficient-Large-Model/Sana", source: "huggingface", category: "vision", url: "https://huggingface.co/Efficient-Large-Model/Sana_1600M_1024px", description: "Sana efficient high-resolution image synthesis" },
  { id: "gh-2057", name: "NVlabs/Sana", source: "github", category: "vision", url: "https://github.com/NVlabs/Sana", description: "Sana linear DiT for fast image generation" },
  { id: "hf-2058", name: "playgroundai/playground-v2.5-1024px-aesthetic", source: "huggingface", category: "vision", url: "https://huggingface.co/playgroundai/playground-v2.5-1024px-aesthetic", description: "Playground v2.5 aesthetic image generation" },
  { id: "gh-2059", name: "THU-MIG/yolov10", source: "github", category: "vision", url: "https://github.com/THU-MIG/yolov10", description: "YOLOv10 real-time end-to-end detection" },
  { id: "gh-2060", name: "ultralytics/yolo11", source: "github", category: "vision", url: "https://github.com/ultralytics/ultralytics", description: "YOLO11 latest real-time detection model" },
  { id: "hf-2061", name: "microsoft/Florence-2-base-ft", source: "huggingface", category: "vision", url: "https://huggingface.co/microsoft/Florence-2-base-ft", description: "Florence-2 base fine-tuned vision foundation" },
  { id: "hf-2062", name: "google/owlvit-base-patch32", source: "huggingface", category: "vision", url: "https://huggingface.co/google/owlvit-base-patch32", description: "OWL-ViT open-vocabulary detection for medical images" },
  { id: "gh-2063", name: "mmpose-lab/mmpose3d", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmpose", description: "MMPose 3D body pose for surgical ergonomics" },
  { id: "gh-2064", name: "open-mmlab/mmaction2-v2", source: "github", category: "vision", url: "https://github.com/open-mmlab/mmaction2", description: "MMAction2 v2 for surgical video understanding" },
  { id: "hf-2065", name: "LanguageBind/Video-LLaVA-7B", source: "huggingface", category: "vision", url: "https://huggingface.co/LanguageBind/Video-LLaVA-7B", description: "Video-LLaVA for surgical video understanding" },
  { id: "gh-2066", name: "OpenGVLab/Ask-Anything", source: "github", category: "vision", url: "https://github.com/OpenGVLab/Ask-Anything", description: "Ask-Anything video understanding chatbot" },
  { id: "gh-2067", name: "PKU-YuanGroup/Video-LLaVA", source: "github", category: "vision", url: "https://github.com/PKU-YuanGroup/Video-LLaVA", description: "Video-LLaVA unified visual representation" },
  { id: "hf-2068", name: "openbmb/MiniCPM-o-2_6", source: "huggingface", category: "vision", url: "https://huggingface.co/openbmb/MiniCPM-o-2_6", description: "MiniCPM-o omni-modal understanding" },
  { id: "gh-2069", name: "OpenBMB/MiniCPM-o", source: "github", category: "vision", url: "https://github.com/OpenBMB/MiniCPM-o", description: "MiniCPM-o end-to-end multimodal model" },
  { id: "hf-2070", name: "THUDM/glm-4-9b-chat", source: "huggingface", category: "general-llm", url: "https://huggingface.co/THUDM/glm-4-9b-chat", description: "GLM-4 9B bilingual chat model" },
  { id: "gh-2071", name: "THUDM/ChatGLM-6B", source: "github", category: "general-llm", url: "https://github.com/THUDM/ChatGLM-6B", description: "ChatGLM open bilingual dialogue model" },
  { id: "gh-2072", name: "THUDM/GLM-4", source: "github", category: "general-llm", url: "https://github.com/THUDM/GLM-4", description: "GLM-4 series model training and inference" },
  { id: "hf-2073", name: "THUDM/codegeex4-all-9b", source: "huggingface", category: "code-model", url: "https://huggingface.co/THUDM/codegeex4-all-9b", description: "CodeGeeX4 multilingual code model" },
  { id: "gh-2074", name: "THUDM/CodeGeeX4", source: "github", category: "code-model", url: "https://github.com/THUDM/CodeGeeX4", description: "CodeGeeX4 all-in-one code generation" },
  { id: "hf-2075", name: "ibm-granite/granite-3.3-8b-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/ibm-granite/granite-3.3-8b-instruct", description: "Granite 3.3 latest IBM enterprise model" },
  { id: "hf-2076", name: "ibm-granite/granite-3.3-2b-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/ibm-granite/granite-3.3-2b-instruct", description: "Granite 3.3 2B compact enterprise model" },
  { id: "hf-2077", name: "ibm-granite/granite-3.2-8b-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/ibm-granite/granite-3.2-8b-instruct", description: "Granite 3.2 thinking model with reasoning" },
  { id: "hf-2078", name: "ibm-granite/granite-embedding-278m-multilingual", source: "huggingface", category: "embedding", url: "https://huggingface.co/ibm-granite/granite-embedding-278m-multilingual", description: "Granite embedding multilingual for search" },
  { id: "gh-2079", name: "ibm-granite/granite-code-models", source: "github", category: "code-model", url: "https://github.com/ibm-granite/granite-code-models", description: "Granite Code models for enterprise coding" },
  { id: "hf-2080", name: "ibm-granite/granite-3.3-8b-instruct-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/ibm-granite/granite-3.3-8b-instruct-GGUF", description: "Granite GGUF for Ollama deployment" },
  { id: "gh-2081", name: "CIDAS/PubMedCLIP", source: "github", category: "medical-tools", url: "https://github.com/sarahESL/PubMedCLIP", description: "PubMedCLIP biomedical vision-language model" },
  { id: "gh-2082", name: "m3-org/m3-embedding", source: "github", category: "embedding", url: "https://github.com/FlagOpen/FlagEmbedding", description: "M3 multi-lingual multi-func multi-gran embedding" },
  { id: "hf-2083", name: "jinaai/jina-embeddings-v2-base-en", source: "huggingface", category: "embedding", url: "https://huggingface.co/jinaai/jina-embeddings-v2-base-en", description: "Jina v2 base English 8K context embedding" },
  { id: "hf-2084", name: "intfloat/e5-large-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/intfloat/e5-large-v2", description: "E5 large v2 text embedding for retrieval" },
  { id: "hf-2085", name: "mixedbread-ai/mxbai-rerank-large-v1", source: "huggingface", category: "embedding", url: "https://huggingface.co/mixedbread-ai/mxbai-rerank-large-v1", description: "MixedBread reranker for document relevance" },
  { id: "hf-2086", name: "nvidia/NV-Retriever-v1", source: "huggingface", category: "embedding", url: "https://huggingface.co/nvidia/NV-Retriever-v1", description: "NVIDIA Retriever for accurate document search" },
  { id: "hf-2087", name: "Salesforce/SFR-Embedding-2_R", source: "huggingface", category: "embedding", url: "https://huggingface.co/Salesforce/SFR-Embedding-2_R", description: "SFR Embedding for research retrieval" },
  { id: "hf-2088", name: "Alibaba-NLP/gte-multilingual-base", source: "huggingface", category: "embedding", url: "https://huggingface.co/Alibaba-NLP/gte-multilingual-base", description: "GTE multilingual base for cross-language search" },
  { id: "gh-2089", name: "biomedical-signal-processing/icbhi-respiratory", source: "github", category: "medical-tools", url: "https://github.com/SJTU-YONGFU-RESEARCH-GRP/ICBHI_RespiratoryDatabase", description: "ICBHI respiratory sound classification" },
  { id: "gh-2090", name: "bearpelican/musicautobot", source: "github", category: "voice-model", url: "https://github.com/bearpelican/musicautobot", description: "MusicAutobot audio generation for therapy" },
  { id: "hf-2091", name: "nvidia/stt_en_conformer_transducer_large", source: "huggingface", category: "voice-model", url: "https://huggingface.co/nvidia/stt_en_conformer_transducer_large", description: "NVIDIA Conformer transducer for ASR" },
  { id: "hf-2092", name: "speechbrain/asr-wav2vec2-librispeech", source: "huggingface", category: "voice-model", url: "https://huggingface.co/speechbrain/asr-wav2vec2-librispeech", description: "SpeechBrain wav2vec2 for ASR baseline" },
  { id: "hf-2093", name: "speechbrain/emotion-recognition-wav2vec2-IEMOCAP", source: "huggingface", category: "voice-model", url: "https://huggingface.co/speechbrain/emotion-recognition-wav2vec2-IEMOCAP", description: "Emotion recognition from speech for patient monitoring" },
  { id: "hf-2094", name: "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim", source: "huggingface", category: "voice-model", url: "https://huggingface.co/audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim", description: "Wav2vec2 emotion dimensions for patient voice" },
  { id: "hf-2095", name: "Systran/faster-whisper-large-v3", source: "huggingface", category: "voice-model", url: "https://huggingface.co/Systran/faster-whisper-large-v3", description: "Faster Whisper v3 CTranslate2 optimized" },
  { id: "gh-2096", name: "SYSTRAN/faster-whisper", source: "github", category: "voice-model", url: "https://github.com/SYSTRAN/faster-whisper", description: "Faster Whisper reimplementation with CTranslate2" },
  { id: "gh-2097", name: "m-bain/whisperX", source: "github", category: "voice-model", url: "https://github.com/m-bain/whisperX", description: "WhisperX word-level timestamps and diarization" },
  { id: "gh-2098", name: "openai/whisper", source: "github", category: "voice-model", url: "https://github.com/openai/whisper", description: "OpenAI Whisper robust speech recognition" },
  { id: "gh-2099", name: "guillaumekln/faster-whisper-server", source: "github", category: "voice-model", url: "https://github.com/fedirz/faster-whisper-server", description: "Faster Whisper Server OpenAI-compatible ASR API" },
  { id: "gh-2100", name: "livekit/agents-js", source: "github", category: "voice-model", url: "https://github.com/livekit/agents-js", description: "LiveKit Agents JS for voice AI applications" },
  { id: "fin-2101", name: "kaggle/jane-street-market-2025", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/competitions/jane-street-real-time-market-data-forecasting", description: "Jane Street real-time market data forecasting" },
  { id: "fin-2102", name: "kaggle/optiver-realized-volatility", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/competitions/optiver-realized-volatility-prediction", description: "Optiver realized volatility prediction" },
  { id: "fin-2103", name: "kaggle/jpx-stock-prediction", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/competitions/jpx-tokyo-stock-exchange-prediction", description: "JPX Tokyo stock exchange prediction" },
  { id: "fin-2104", name: "kaggle/ubiquant-market-prediction", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/competitions/ubiquant-market-prediction", description: "Ubiquant market prediction competition" },
  { id: "fin-2105", name: "kaggle/g-research-crypto", source: "kaggle", category: "finance-dataset", url: "https://www.kaggle.com/competitions/g-research-crypto-forecasting", description: "G-Research cryptocurrency forecasting" },
  { id: "gh-2106", name: "AI4Finance-Foundation/FinRL-Tutorials", source: "github", category: "finance-tools", url: "https://github.com/AI4Finance-Foundation/FinRL-Tutorials", description: "FinRL tutorials for financial RL agents" },
  { id: "gh-2107", name: "AI4Finance-Foundation/FinNLP", source: "github", category: "finance-tools", url: "https://github.com/AI4Finance-Foundation/FinNLP", description: "FinNLP financial NLP data processing" },
  { id: "gh-2108", name: "AI4Finance-Foundation/FinRL-Live-Trading", source: "github", category: "finance-tools", url: "https://github.com/AI4Finance-Foundation/FinRL-Live-Trading", description: "FinRL live trading deployment framework" },
  { id: "gh-2109", name: "OpenBBTerminal/OpenBBTerminal", source: "github", category: "finance-tools", url: "https://github.com/OpenBB-finance/OpenBB", description: "OpenBB investment research terminal" },
  { id: "gh-2110", name: "robcarver17/pysystemtrade", source: "github", category: "finance-tools", url: "https://github.com/robcarver17/pysystemtrade", description: "PySystemTrade systematic trading engine" },
  { id: "hf-2111", name: "FreedomIntelligence/HuatuoGPT-II-13B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/FreedomIntelligence/HuatuoGPT-II-13B", description: "HuatuoGPT-II 13B one-stage medical LLM" },
  { id: "hf-2112", name: "m42-health/Llama3-Med42-70B", source: "huggingface", category: "medical-llm", url: "https://huggingface.co/m42-health/Llama3-Med42-70B", description: "Med42 70B clinical-grade large model" },
  { id: "hf-2113", name: "microsoft/phi-2", source: "huggingface", category: "general-llm", url: "https://huggingface.co/microsoft/phi-2", description: "Phi-2 2.7B efficient reasoning model" },
  { id: "hf-2114", name: "OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5", source: "huggingface", category: "general-llm", url: "https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5", description: "OpenAssistant conversation model" },
  { id: "hf-2115", name: "OpenAssistant/oasst1", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/OpenAssistant/oasst1", description: "OpenAssistant human-annotated conversations" },
  { id: "hf-2116", name: "Open-Orca/OpenOrca", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Open-Orca/OpenOrca", description: "OpenOrca GPT-4 augmented instruction data" },
  { id: "hf-2117", name: "BAAI/Infinity-Instruct", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/BAAI/Infinity-Instruct", description: "Infinity-Instruct large-scale instruction data" },
  { id: "hf-2118", name: "tiiuae/falcon-refinedweb", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/tiiuae/falcon-refinedweb", description: "RefinedWeb filtered web text for pre-training" },
  { id: "hf-2119", name: "databricks/databricks-dolly-15k", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/databricks/databricks-dolly-15k", description: "Dolly 15K instruction-following dataset" },
  { id: "hf-2120", name: "stingning/ultrachat", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/stingning/ultrachat", description: "UltraChat 1.5M multi-turn conversations" },
  { id: "gh-2121", name: "hazyresearch/based", source: "github", category: "training-tools", url: "https://github.com/HazyResearch/based", description: "Based efficient linear attention models" },
  { id: "gh-2122", name: "hazyresearch/ThunderKittens", source: "github", category: "training-tools", url: "https://github.com/HazyResearch/ThunderKittens", description: "ThunderKittens tile-level GPU kernels" },
  { id: "gh-2123", name: "google-deepmind/recurrentgemma", source: "github", category: "general-llm", url: "https://github.com/google-deepmind/recurrentgemma", description: "RecurrentGemma Griffin architecture model" },
  { id: "gh-2124", name: "jzhang38/TinyLlama", source: "github", category: "general-llm", url: "https://github.com/jzhang38/TinyLlama", description: "TinyLlama pre-training recipe 1.1B model" },
  { id: "gh-2125", name: "microsoft/phi-2", source: "github", category: "general-llm", url: "https://github.com/microsoft/phi-2", description: "Phi-2 training and inference code" },
  { id: "hf-2126", name: "bigbio/anat_em", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/anat_em", description: "AnatEM anatomical entity mention corpus" },
  { id: "hf-2127", name: "bigbio/an_em", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/an_em", description: "AnEM anatomical entity NER corpus" },
  { id: "hf-2128", name: "bigbio/ask_a_patient", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ask_a_patient", description: "AskAPatient ADR from social media" },
  { id: "hf-2129", name: "bigbio/chemdner", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/chemdner", description: "CHEMDNER chemical NER from patents" },
  { id: "hf-2130", name: "bigbio/i2b2_2010", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/n2c2_2010", description: "i2b2 2010 clinical concept extraction" },
  { id: "hf-2131", name: "bigbio/hallmarks_of_cancer", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/hallmarks_of_cancer", description: "Hallmarks of cancer text classification" },
  { id: "hf-2132", name: "bigbio/bionlp_st_2013_ge", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2013_ge", description: "BioNLP 2013 GENIA event extraction" },
  { id: "hf-2133", name: "bigbio/ade_corpus_v2", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ade_corpus_v2", description: "ADE Corpus v2 adverse drug event extraction" },
  { id: "hf-2134", name: "bigbio/euadr", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/euadr", description: "EU-ADR drug safety signal detection" },
  { id: "hf-2135", name: "bigbio/scai_chemical", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/scai_chemical", description: "SCAI chemical entity recognition" },
  { id: "gh-2136", name: "LibreTranslate/LibreTranslate", source: "github", category: "nlp-tools", url: "https://github.com/LibreTranslate/LibreTranslate", description: "LibreTranslate self-hosted translation for multilingual medical" },
  { id: "gh-2137", name: "facebookresearch/NLLB", source: "github", category: "nlp-tools", url: "https://github.com/facebookresearch/fairseq/tree/nllb", description: "NLLB No Language Left Behind translation 200 languages" },
  { id: "hf-2138", name: "facebook/nllb-200-3.3B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/facebook/nllb-200-3.3B", description: "NLLB-200 machine translation 200 languages" },
  { id: "hf-2139", name: "facebook/mbart-large-50-many-to-many-mmt", source: "huggingface", category: "general-llm", url: "https://huggingface.co/facebook/mbart-large-50-many-to-many-mmt", description: "mBART-50 many-to-many translation for global health" },
  { id: "hf-2140", name: "Helsinki-NLP/opus-mt-en-de", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Helsinki-NLP/opus-mt-en-de", description: "OPUS-MT English-German medical translation" },
  { id: "gh-2141", name: "biocore/biopython", source: "github", category: "medical-tools", url: "https://github.com/biopython/biopython", description: "Biopython tools for biological computation" },
  { id: "gh-2142", name: "openmm/openmm", source: "github", category: "medical-tools", url: "https://github.com/openmm/openmm", description: "OpenMM molecular dynamics simulation" },
  { id: "gh-2143", name: "schrodinger/pymol-open-source", source: "github", category: "medical-tools", url: "https://github.com/schrodinger/pymol-open-source", description: "PyMOL molecular visualization for drug design" },
  { id: "gh-2144", name: "openstructure/ost", source: "github", category: "medical-tools", url: "https://github.com/openstructure/openstructure", description: "OpenStructure computational structural biology" },
  { id: "gh-2145", name: "EleutherAI/gpt-neo", source: "github", category: "general-llm", url: "https://github.com/EleutherAI/gpt-neo", description: "GPT-Neo open-source GPT alternative" },
  { id: "hf-2146", name: "EleutherAI/gpt-neo-2.7B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/EleutherAI/gpt-neo-2.7B", description: "GPT-Neo 2.7B for domain fine-tuning" },
  { id: "hf-2147", name: "EleutherAI/gpt-j-6b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/EleutherAI/gpt-j-6b", description: "GPT-J 6B for efficient medical inference" },
  { id: "hf-2148", name: "EleutherAI/pythia-6.9b-deduped", source: "huggingface", category: "general-llm", url: "https://huggingface.co/EleutherAI/pythia-6.9b-deduped", description: "Pythia 6.9B deduped for clean fine-tuning" },
  { id: "hf-2149", name: "EleutherAI/llemma_34b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/EleutherAI/llemma_34b", description: "Llemma 34B mathematical reasoning model" },
  { id: "hf-2150", name: "allenai/tulu-2-70b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/allenai/tulu-2-70b", description: "Tulu 2 70B instruction-tuned model" },
  { id: "gh-2151", name: "crewAIInc/crewAI", source: "github", category: "agent-tools", url: "https://github.com/crewAIInc/crewAI", description: "CrewAI multi-agent orchestration framework" },
  { id: "gh-2152", name: "chatchat-space/Langchain-Chatchat", source: "github", category: "rag-tools", url: "https://github.com/chatchat-space/Langchain-Chatchat", description: "LangChain-Chatchat local knowledge base chat" },
  { id: "gh-2153", name: "PromtEngineer/localGPT", source: "github", category: "rag-tools", url: "https://github.com/PromtEngineer/localGPT", description: "LocalGPT chat with documents privately" },
  { id: "gh-2154", name: "imartinez/privateGPT", source: "github", category: "rag-tools", url: "https://github.com/zylon-ai/private-gpt", description: "PrivateGPT private document interaction" },
  { id: "gh-2155", name: "arc53/DocsGPT", source: "github", category: "rag-tools", url: "https://github.com/arc53/DocsGPT", description: "DocsGPT documentation assistant for medical docs" },
  { id: "gh-2156", name: "h2oai/h2ogpt", source: "github", category: "rag-tools", url: "https://github.com/h2oai/h2ogpt", description: "h2oGPT private document chat and RAG" },
  { id: "gh-2157", name: "Mintplex-Labs/anything-llm", source: "github", category: "rag-tools", url: "https://github.com/Mintplex-Labs/anything-llm", description: "AnythingLLM all-in-one AI desktop app" },
  { id: "gh-2158", name: "jmorganca/ollama-js-api", source: "github", category: "training-tools", url: "https://github.com/ollama/ollama-js", description: "Ollama JavaScript API client" },
  { id: "hf-2159", name: "unsloth/Qwen3-8B-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/unsloth/Qwen3-8B-GGUF", description: "Qwen3 GGUF quantized for Ollama" },
  { id: "hf-2160", name: "unsloth/gemma-3-27b-it-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/unsloth/gemma-3-27b-it-GGUF", description: "Gemma 3 27B GGUF for local deployment" },
  { id: "hf-2161", name: "unsloth/Phi-4-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/unsloth/Phi-4-GGUF", description: "Phi-4 GGUF for Ollama reasoning tasks" },
  { id: "hf-2162", name: "bartowski/Qwen2.5-14B-Instruct-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF", description: "Qwen 2.5 14B GGUF for local deployment" },
  { id: "hf-2163", name: "bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF", description: "DeepSeek R1 32B GGUF for local reasoning" },
  { id: "hf-2164", name: "bartowski/Llama-3.3-70B-Instruct-GGUF", source: "huggingface", category: "general-llm", url: "https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF", description: "Llama 3.3 70B GGUF for Ollama" },
  { id: "gh-2165", name: "InternLM/xtuner", source: "github", category: "training-tools", url: "https://github.com/InternLM/xtuner", description: "XTuner efficient fine-tuning toolkit" },
  { id: "gh-2166", name: "InternLM/InternEvo", source: "github", category: "training-tools", url: "https://github.com/InternLM/InternEvo", description: "InternEvo efficient large model training" },
  { id: "gh-2167", name: "hiyouga/ChatGLM-Efficient-Tuning", source: "github", category: "training-tools", url: "https://github.com/hiyouga/ChatGLM-Efficient-Tuning", description: "ChatGLM efficient parameter tuning" },
  { id: "gh-2168", name: "hiyouga/LLaMA-Factory", source: "github", category: "training-tools", url: "https://github.com/hiyouga/LLaMA-Factory", description: "LLaMA-Factory unified fine-tuning of 100+ LLMs" },
  { id: "gh-2169", name: "FlagAI-Open/FlagAI", source: "github", category: "training-tools", url: "https://github.com/FlagAI-Open/FlagAI", description: "FlagAI AI model training and deployment" },
  { id: "gh-2170", name: "cloneofsimo/lora", source: "github", category: "training-tools", url: "https://github.com/cloneofsimo/lora", description: "LoRA training implementation for Stable Diffusion" },
  { id: "hf-2171", name: "medical-ENT/ent-icd10-codes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-icd10-coding", description: "ENT-specific ICD-10 procedure coding data" },
  { id: "hf-2172", name: "medical-ENT/ent-surgical-complications", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-complications", description: "ENT surgical complication prediction data" },
  { id: "hf-2173", name: "medical-ENT/ent-medication-prescribing", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-medication-patterns", description: "ENT medication prescribing patterns data" },
  { id: "hf-2174", name: "medical-ENT/sinonasal-tumors-ct", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/sinonasal-tumors", description: "Sinonasal tumor CT classification dataset" },
  { id: "hf-2175", name: "medical-ENT/cochlear-implant-mapping", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ci-mapping-data", description: "Cochlear implant electrode mapping optimization" },
  { id: "hf-2176", name: "medical-ENT/obstructive-sleep-apnea-ml", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/osa-ml-prediction", description: "OSA ML prediction from clinical features" },
  { id: "hf-2177", name: "medical-ENT/laryngopharyngeal-reflux", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/lpr-diagnosis", description: "Laryngopharyngeal reflux diagnosis data" },
  { id: "hf-2178", name: "medical-ENT/vocal-tremor-analysis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/vocal-tremor", description: "Vocal tremor analysis from acoustic features" },
  { id: "hf-2179", name: "medical-ENT/spasmodic-dysphonia", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/spasmodic-dysphonia", description: "Spasmodic dysphonia voice analysis dataset" },
  { id: "hf-2180", name: "medical-ENT/ent-telehealth-encounters", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-telehealth", description: "ENT telehealth encounter classification" },
  { id: "gh-2181", name: "OthersideAI/self-operating-computer", source: "github", category: "agent-tools", url: "https://github.com/OthersideAI/self-operating-computer", description: "Self-Operating Computer multimodal framework" },
  { id: "gh-2182", name: "CopilotKit/CopilotKit", source: "github", category: "agent-tools", url: "https://github.com/CopilotKit/CopilotKit", description: "CopilotKit in-app AI copilots framework" },
  { id: "gh-2183", name: "lastmile-ai/aiconfig", source: "github", category: "agent-tools", url: "https://github.com/lastmile-ai/aiconfig", description: "AIConfig source control for AI prompts" },
  { id: "gh-2184", name: "BerriAI/litellm", source: "github", category: "agent-tools", url: "https://github.com/BerriAI/litellm", description: "LiteLLM unified proxy for 100+ LLM providers" },
  { id: "gh-2185", name: "letta-ai/letta", source: "github", category: "agent-tools", url: "https://github.com/letta-ai/letta", description: "Letta stateful AI agents with memory" },
  { id: "gh-2186", name: "cpacker/MemGPT", source: "github", category: "agent-tools", url: "https://github.com/cpacker/MemGPT", description: "MemGPT LLM agents with long-term memory" },
  { id: "gh-2187", name: "ShishirPatil/gorilla", source: "github", category: "agent-tools", url: "https://github.com/ShishirPatil/gorilla", description: "Gorilla LLM connected to massive APIs" },
  { id: "gh-2188", name: "langchain-ai/chat-langchain", source: "github", category: "rag-tools", url: "https://github.com/langchain-ai/chat-langchain", description: "Chat LangChain documentation RAG chatbot" },
  { id: "gh-2189", name: "Unstructured-IO/unstructured-api", source: "github", category: "rag-tools", url: "https://github.com/Unstructured-IO/unstructured-api", description: "Unstructured API document processing service" },
  { id: "gh-2190", name: "danny-avila/LibreChat", source: "github", category: "agent-tools", url: "https://github.com/danny-avila/LibreChat", description: "LibreChat enhanced ChatGPT clone for local LLMs" },
  { id: "hf-2191", name: "bigbio/bc2gm_corpus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bc2gm_corpus", description: "BioCreative II gene mention NER" },
  { id: "hf-2192", name: "bigbio/craft_v4", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/craft", description: "CRAFT full-text biomedical annotation corpus" },
  { id: "hf-2193", name: "bigbio/medmentions", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/medmentions", description: "MedMentions semantic annotation of PubMed" },
  { id: "hf-2194", name: "bigbio/bioinfer", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bioinfer", description: "BioInfer protein interaction extraction" },
  { id: "hf-2195", name: "bigbio/hprd50", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/hprd50", description: "HPRD50 protein interaction extraction" },
  { id: "hf-2196", name: "bigbio/aimed", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/aimed", description: "AIMed protein-protein interaction corpus" },
  { id: "hf-2197", name: "bigbio/genetag", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/genetag", description: "GENETAG gene/protein NER tagging corpus" },
  { id: "hf-2198", name: "bigbio/pico_extraction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/pico_extraction", description: "PICO element extraction from clinical text" },
  { id: "hf-2199", name: "bigbio/cadec", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/cadec", description: "CADEC clinical adverse drug event corpus" },
  { id: "hf-2200", name: "bigbio/twi_adr", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/twi_adr_corpus", description: "Twitter ADR adverse drug reaction corpus" },
  { id: "ph-2201", name: "physionet/ptb-xl", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/ptb-xl/", description: "PTB-XL large 12-lead ECG dataset" },
  { id: "ph-2202", name: "physionet/mimic-iv", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/mimiciv/", description: "MIMIC-IV clinical database 2008-2019" },
  { id: "ph-2203", name: "physionet/chest-imagenome", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/chest-imagenome/", description: "Chest ImaGenome scene graph annotations" },
  { id: "ph-2204", name: "physionet/vindr-cxr", source: "physionet", category: "medical-dataset", url: "https://physionet.org/content/vindr-cxr/", description: "VinDr-CXR chest X-ray with radiologist annotations" },
  { id: "tcia-2205", name: "TCIA/nsclc-radiomics", source: "tcia", category: "medical-dataset", url: "https://www.cancerimagingarchive.net/collection/nsclc-radiomics/", description: "NSCLC lung cancer radiomics features" },
  { id: "tcia-2206", name: "TCIA/lndb", source: "tcia", category: "medical-dataset", url: "https://www.cancerimagingarchive.net/collection/lndb/", description: "LNDb lung nodule detection CT dataset" },
  { id: "gc-2207", name: "grand-challenge/flare-2022", source: "grand-challenge", category: "medical-dataset", url: "https://flare22.grand-challenge.org/", description: "FLARE 2022 abdominal organ segmentation" },
  { id: "gc-2208", name: "grand-challenge/amos", source: "grand-challenge", category: "medical-dataset", url: "https://amos22.grand-challenge.org/", description: "AMOS abdominal multi-organ segmentation" },
  { id: "gc-2209", name: "grand-challenge/kits", source: "grand-challenge", category: "medical-dataset", url: "https://kits-challenge.org/kits23/", description: "KiTS kidney tumor segmentation" },
  { id: "gc-2210", name: "grand-challenge/picai", source: "grand-challenge", category: "medical-dataset", url: "https://pi-cai.grand-challenge.org/", description: "PI-CAI prostate cancer AI detection MRI" },
  { id: "hf-2211", name: "bigbio/medal", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/medal", description: "MedAL medical abbreviation disambiguation" },
  { id: "hf-2212", name: "bigbio/genia_relation_corpus", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/genia_relation_corpus", description: "GENIA relation extraction biological events" },
  { id: "hf-2213", name: "bigbio/bionlp_st_2011_ge", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2011_ge", description: "BioNLP 2011 GENIA event extraction" },
  { id: "hf-2214", name: "bigbio/bionlp_st_2013_cg", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2013_cg", description: "BioNLP 2013 cancer genetics extraction" },
  { id: "hf-2215", name: "bigbio/saber", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2019_bb", description: "SABER sequence annotator biomedical entities" },
  { id: "gh-2216", name: "AstraZeneca/chemicalx", source: "github", category: "medical-tools", url: "https://github.com/AstraZeneca/chemicalx", description: "ChemicalX drug pair synergy prediction" },
  { id: "gh-2217", name: "mims-harvard/Raild", source: "github", category: "medical-tools", url: "https://github.com/mims-harvard/graphcg", description: "GraphCG controllable molecular generation" },
  { id: "gh-2218", name: "pytorch-geometric/pytorch_geometric", source: "github", category: "training-tools", url: "https://github.com/pyg-team/pytorch_geometric", description: "PyTorch Geometric for graph neural networks" },
  { id: "gh-2219", name: "dmlc/dgl", source: "github", category: "training-tools", url: "https://github.com/dmlc/dgl", description: "DGL deep graph library for biomedical graphs" },
  { id: "gh-2220", name: "snap-stanford/ogb", source: "github", category: "training-tools", url: "https://github.com/snap-stanford/ogb", description: "OGB open graph benchmark for molecular data" },
  { id: "hf-2221", name: "medical-ENT/endoscopic-dcr-surgery", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/endoscopic-dcr", description: "Endoscopic dacryocystorhinostomy surgery data" },
  { id: "hf-2222", name: "medical-ENT/transoral-robotic-surgery", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/tors-outcomes", description: "Transoral robotic surgery TORS outcomes" },
  { id: "hf-2223", name: "medical-ENT/sialoendoscopy-stones", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/sialolithiasis", description: "Sialoendoscopy salivary stone detection" },
  { id: "hf-2224", name: "medical-ENT/laryngeal-electromyography", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/laryngeal-emg", description: "Laryngeal EMG nerve function assessment" },
  { id: "hf-2225", name: "medical-ENT/pediatric-hearing-screening", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/pediatric-hearing", description: "Pediatric hearing screening outcome data" },
  { id: "gh-2226", name: "lm-sys/RouteLLM", source: "github", category: "agent-tools", url: "https://github.com/lm-sys/RouteLLM", description: "RouteLLM cost-effective model routing framework" },
  { id: "gh-2227", name: "vllm-project/vllm", source: "github", category: "training-tools", url: "https://github.com/vllm-project/vllm", description: "vLLM high-throughput LLM serving engine" },
  { id: "gh-2228", name: "ray-project/ray", source: "github", category: "training-tools", url: "https://github.com/ray-project/ray", description: "Ray distributed computing for AI workloads" },
  { id: "gh-2229", name: "dask/distributed", source: "github", category: "training-tools", url: "https://github.com/dask/distributed", description: "Dask distributed computing for large datasets" },
  { id: "gh-2230", name: "horovod/horovod", source: "github", category: "training-tools", url: "https://github.com/horovod/horovod", description: "Horovod distributed deep learning training" },
  { id: "hf-2231", name: "naver/splade-v3", source: "huggingface", category: "embedding", url: "https://huggingface.co/naver/splade-v3", description: "SPLADE v3 sparse neural retrieval model" },
  { id: "hf-2232", name: "castorini/monot5-base-msmarco", source: "huggingface", category: "embedding", url: "https://huggingface.co/castorini/monot5-base-msmarco", description: "MonoT5 reranker for medical document search" },
  { id: "hf-2233", name: "nvidia/NV-RerankQA-Mistral-4B-v3", source: "huggingface", category: "embedding", url: "https://huggingface.co/nvidia/NV-RerankQA-Mistral-4B-v3", description: "NVIDIA reranker 4B for quality retrieval" },
  { id: "gh-2234", name: "InternLM/MindSearch", source: "github", category: "agent-tools", url: "https://github.com/InternLM/MindSearch", description: "MindSearch deep AI search engine agent" },
  { id: "gh-2235", name: "Cinnamon/kotaemon-v2", source: "github", category: "rag-tools", url: "https://github.com/Cinnamon/kotaemon", description: "Kotaemon v2 improved document RAG chat" },
  { id: "hf-2236", name: "nvidia/dragon-multiturn-query-encoder", source: "huggingface", category: "embedding", url: "https://huggingface.co/nvidia/dragon-multiturn-query-encoder", description: "DRAGON multi-turn query embedding" },
  { id: "hf-2237", name: "facebook/contriever-msmarco", source: "huggingface", category: "embedding", url: "https://huggingface.co/facebook/contriever-msmarco", description: "Contriever unsupervised dense retrieval" },
  { id: "gh-2238", name: "michaelfeil/infinity", source: "github", category: "embedding", url: "https://github.com/michaelfeil/infinity", description: "Infinity fast embedding inference server" },
  { id: "gh-2239", name: "AnswerDotAI/RAGatouille", source: "github", category: "rag-tools", url: "https://github.com/AnswerDotAI/RAGatouille", description: "RAGatouille ColBERT-based retrieval for RAG" },
  { id: "gh-2240", name: "bclavie/RAGatouille", source: "github", category: "rag-tools", url: "https://github.com/bclavie/RAGatouille", description: "RAGatouille late interaction retrieval" },
  { id: "hf-2241", name: "colbert-ir/colbertv2.0", source: "huggingface", category: "embedding", url: "https://huggingface.co/colbert-ir/colbertv2.0", description: "ColBERTv2 for efficient neural retrieval" },
  { id: "gh-2242", name: "stanford-futuredata/ColBERT", source: "github", category: "rag-tools", url: "https://github.com/stanford-futuredata/ColBERT", description: "ColBERT fast passage retrieval via contextualized" },
  { id: "hf-2243", name: "medical-ENT/speech-audiometry-data", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/speech-audiometry", description: "Speech audiometry word recognition scores" },
  { id: "hf-2244", name: "medical-ENT/tympanometry-data", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/tympanometry-data", description: "Tympanometry middle ear function assessment" },
  { id: "hf-2245", name: "medical-ENT/videonystagmography", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/vng-data", description: "Videonystagmography vestibular testing data" },
  { id: "hf-2246", name: "medical-ENT/coblation-tonsillectomy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/coblation-outcomes", description: "Coblation tonsillectomy outcome prediction" },
  { id: "hf-2247", name: "medical-ENT/balloon-sinuplasty", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/balloon-sinuplasty", description: "Balloon sinuplasty outcomes versus FESS" },
  { id: "hf-2248", name: "medical-ENT/image-guided-sinus-surgery", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/igs-navigation", description: "Image-guided sinus surgery navigation data" },
  { id: "hf-2249", name: "medical-ENT/cerebrospinal-fluid-leak", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/csf-leak-repair", description: "CSF leak endoscopic repair outcomes" },
  { id: "hf-2250", name: "medical-ENT/orbital-decompression", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/orbital-decompression", description: "Endoscopic orbital decompression outcomes" },
  { id: "gh-2251", name: "huggingface/open-llm-leaderboard", source: "github", category: "training-tools", url: "https://github.com/huggingface/open_llm_leaderboard", description: "Open LLM Leaderboard evaluation codebase" },
  { id: "gh-2252", name: "embedding-benchmark/mteb", source: "github", category: "embedding", url: "https://github.com/embeddings-benchmark/mteb", description: "MTEB massive text embedding benchmark" },
  { id: "gh-2253", name: "huggingface/evaluate", source: "github", category: "training-tools", url: "https://github.com/huggingface/evaluate", description: "Evaluate metrics library for ML models" },
  { id: "gh-2254", name: "huggingface/transformers", source: "github", category: "training-tools", url: "https://github.com/huggingface/transformers", description: "HuggingFace Transformers core library" },
  { id: "gh-2255", name: "huggingface/hub-docs", source: "github", category: "training-tools", url: "https://github.com/huggingface/hub-docs", description: "HuggingFace Hub documentation and guides" },
  { id: "hf-2256", name: "medical/clinical-pathway-optimization", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/clinical-pathway", description: "Clinical pathway optimization dataset" },
  { id: "hf-2257", name: "medical/adverse-event-prediction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/adverse-event-prediction", description: "Perioperative adverse event prediction" },
  { id: "hf-2258", name: "medical/postop-complication", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/postop-complication", description: "Postoperative complication risk prediction" },
  { id: "hf-2259", name: "medical/antibiotic-resistance", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/antibiotic-resistance", description: "Antibiotic resistance pattern prediction" },
  { id: "hf-2260", name: "medical/wound-healing-assessment", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/wound-healing", description: "Wound healing progress image assessment" },
  { id: "gh-2261", name: "microsoft/UFO", source: "github", category: "agent-tools", url: "https://github.com/microsoft/UFO", description: "UFO Windows OS agentic framework" },
  { id: "gh-2262", name: "AgentTuning/AgentTuning", source: "github", category: "agent-tools", url: "https://github.com/THUDM/AgentTuning", description: "AgentTuning generalist agent instruction tuning" },
  { id: "gh-2263", name: "THUDM/AgentBench", source: "github", category: "agent-tools", url: "https://github.com/THUDM/AgentBench", description: "AgentBench multi-dimensional LLM agent evaluation" },
  { id: "gh-2264", name: "aiwaves-cn/RecurrentGPT", source: "github", category: "agent-tools", url: "https://github.com/aiwaves-cn/RecurrentGPT", description: "RecurrentGPT interactive long-text generation" },
  { id: "gh-2265", name: "microsoft/JARVIS", source: "github", category: "agent-tools", url: "https://github.com/microsoft/JARVIS", description: "JARVIS HuggingGPT connecting AI models" },
  { id: "gh-2266", name: "Yifan-Song793/RestGPT", source: "github", category: "agent-tools", url: "https://github.com/Yifan-Song793/RestGPT", description: "RestGPT autonomous REST API agent" },
  { id: "gh-2267", name: "SamurAIGPT/EmbedAI", source: "github", category: "rag-tools", url: "https://github.com/SamurAIGPT/EmbedAI", description: "EmbedAI chat with documents using AI" },
  { id: "gh-2268", name: "agiresearch/AIOS", source: "github", category: "agent-tools", url: "https://github.com/agiresearch/AIOS", description: "AIOS LLM agent operating system" },
  { id: "hf-2269", name: "sentence-transformers/paraphrase-MiniLM-L6-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/paraphrase-MiniLM-L6-v2", description: "MiniLM paraphrase for fast semantic matching" },
  { id: "hf-2270", name: "sentence-transformers/all-distilroberta-v1", source: "huggingface", category: "embedding", url: "https://huggingface.co/sentence-transformers/all-distilroberta-v1", description: "DistilRoBERTa sentence embedding baseline" },
  { id: "hf-2271", name: "thenlper/gte-base", source: "huggingface", category: "embedding", url: "https://huggingface.co/thenlper/gte-base", description: "GTE base general text embedding model" },
  { id: "hf-2272", name: "BAAI/bge-base-en-v1.5", source: "huggingface", category: "embedding", url: "https://huggingface.co/BAAI/bge-base-en-v1.5", description: "BGE base v1.5 balanced embedding model" },
  { id: "hf-2273", name: "intfloat/e5-base-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/intfloat/e5-base-v2", description: "E5 base v2 for medical text search" },
  { id: "hf-2274", name: "nomic-ai/nomic-embed-text-v1", source: "huggingface", category: "embedding", url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1", description: "Nomic Embed v1 long context embedding" },
  { id: "hf-2275", name: "jinaai/jina-embeddings-v2-small-en", source: "huggingface", category: "embedding", url: "https://huggingface.co/jinaai/jina-embeddings-v2-small-en", description: "Jina v2 small for fast embedding" },
  { id: "gh-2276", name: "SWivid/F5-TTS", source: "github", category: "voice-model", url: "https://github.com/SWivid/F5-TTS", description: "F5-TTS fairytaler flow-matching text-to-speech" },
  { id: "hf-2277", name: "SWivid/F5-TTS", source: "huggingface", category: "voice-model", url: "https://huggingface.co/SWivid/F5-TTS", description: "F5-TTS model weights for voice generation" },
  { id: "gh-2278", name: "metavoiceio/metavoice-src", source: "github", category: "voice-model", url: "https://github.com/metavoiceio/metavoice-src", description: "MetaVoice 1B human-like speech generation" },
  { id: "hf-2279", name: "metavoiceio/metavoice-1B-v0.1", source: "huggingface", category: "voice-model", url: "https://huggingface.co/metavoiceio/metavoice-1B-v0.1", description: "MetaVoice 1B foundational TTS model" },
  { id: "gh-2280", name: "nari-labs/dia", source: "github", category: "voice-model", url: "https://github.com/nari-labs/dia", description: "Dia dialogue-focused TTS model" },
  { id: "hf-2281", name: "nari-labs/Dia-1.6B", source: "huggingface", category: "voice-model", url: "https://huggingface.co/nari-labs/Dia-1.6B", description: "Dia 1.6B dialogue speech synthesis" },
  { id: "gh-2282", name: "sesame-TTS/csm", source: "github", category: "voice-model", url: "https://github.com/SesameAI/csm", description: "CSM conversational speech model from Sesame" },
  { id: "hf-2283", name: "sesame/csm-1b", source: "huggingface", category: "voice-model", url: "https://huggingface.co/sesame/csm-1b", description: "CSM 1B conversational speech model" },
  { id: "gh-2284", name: "bytedance/seed-tts-eval", source: "github", category: "voice-model", url: "https://github.com/BytedanceSpeech/seed-tts-eval", description: "Seed-TTS evaluation for speech synthesis" },
  { id: "gh-2285", name: "lifeiteng/vall-e", source: "github", category: "voice-model", url: "https://github.com/lifeiteng/vall-e", description: "VALL-E neural codec language model TTS" },
  { id: "hf-2286", name: "medical-ENT/paranasal-sinus-anatomy-atlas", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/paranasal-sinus-atlas", description: "Paranasal sinus 3D anatomical atlas" },
  { id: "hf-2287", name: "medical-ENT/endolymphatic-hydrops-mri", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/endolymphatic-hydrops", description: "Endolymphatic hydrops MRI for Meniere disease" },
  { id: "hf-2288", name: "medical-ENT/nasal-airflow-analysis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/nasal-airflow-cfd", description: "Nasal airflow computational fluid dynamics" },
  { id: "hf-2289", name: "medical-ENT/taste-disorder-assessment", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/taste-disorder", description: "Taste disorder assessment and classification" },
  { id: "hf-2290", name: "medical-ENT/smell-disorder-assessment", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/anosmia-assessment", description: "Olfactory disorder assessment and testing" },
  { id: "gh-2291", name: "deepseek-ai/open-infra", source: "github", category: "training-tools", url: "https://github.com/deepseek-ai/open-infra", description: "DeepSeek open infrastructure tools" },
  { id: "gh-2292", name: "nvidia/TensorRT-Model-Optimizer", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/TensorRT-Model-Optimizer", description: "TensorRT Model Optimizer for quantization" },
  { id: "gh-2293", name: "NVIDIA/nvidia-container-toolkit", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/nvidia-container-toolkit", description: "NVIDIA Container Toolkit for GPU containers" },
  { id: "gh-2294", name: "NVIDIA/cuda-samples", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/cuda-samples", description: "CUDA programming samples and examples" },
  { id: "gh-2295", name: "pytorch/FBGEMM", source: "github", category: "training-tools", url: "https://github.com/pytorch/FBGEMM", description: "FBGEMM Facebook matrix multiplication for CPU" },
  { id: "hf-2296", name: "medical-ENT/ent-patient-satisfaction", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-satisfaction", description: "ENT patient satisfaction survey prediction" },
  { id: "hf-2297", name: "medical-ENT/ent-emergency-triage", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-emergency-triage", description: "ENT emergency triage severity classification" },
  { id: "hf-2298", name: "medical-ENT/ent-follow-up-prediction", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-follow-up", description: "ENT follow-up appointment need prediction" },
  { id: "hf-2299", name: "medical-ENT/ent-referral-appropriateness", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-referral", description: "ENT referral appropriateness classification" },
  { id: "hf-2300", name: "medical-ENT/ent-quality-of-life-prediction", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-qol-prediction", description: "ENT disease quality of life prediction models" },
  { id: "gh-2301", name: "THUDM/WebGLM", source: "github", category: "agent-tools", url: "https://github.com/THUDM/WebGLM", description: "WebGLM web-enhanced question answering" },
  { id: "gh-2302", name: "anthropics/courses", source: "github", category: "training-tools", url: "https://github.com/anthropics/courses", description: "Anthropic educational courses for AI development" },
  { id: "gh-2303", name: "anthropics/anthropic-sdk-python", source: "github", category: "agent-tools", url: "https://github.com/anthropics/anthropic-sdk-python", description: "Anthropic Python SDK for Claude API" },
  { id: "gh-2304", name: "openai/openai-python", source: "github", category: "agent-tools", url: "https://github.com/openai/openai-python", description: "OpenAI Python client library" },
  { id: "gh-2305", name: "openai/openai-cookbook", source: "github", category: "training-tools", url: "https://github.com/openai/openai-cookbook", description: "OpenAI API usage examples and guides" },
  { id: "gh-2306", name: "google-gemini/cookbook", source: "github", category: "training-tools", url: "https://github.com/google-gemini/cookbook", description: "Gemini API cookbook and examples" },
  { id: "gh-2307", name: "google-gemini/generative-ai-python", source: "github", category: "agent-tools", url: "https://github.com/google-gemini/generative-ai-python", description: "Google Generative AI Python SDK" },
  { id: "hf-2308", name: "medical/clinical-note-generation", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/clinical-note-gen", description: "Clinical note automated generation training" },
  { id: "hf-2309", name: "medical/prior-authorization-prediction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/prior-auth-prediction", description: "Prior authorization approval prediction" },
  { id: "hf-2310", name: "medical/medical-image-captioning", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/medical-image-caption", description: "Medical image captioning training data" },
  { id: "hf-2311", name: "medical/symptom-checker", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/symptom-checker-qa", description: "Symptom checker QA for triage chatbots" },
  { id: "hf-2312", name: "medical/patient-education-materials", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/patient-education", description: "Patient education material generation data" },
  { id: "gh-2313", name: "bio-ontology-research-group/deepgo", source: "github", category: "medical-tools", url: "https://github.com/bio-ontology-research-group/deepgo", description: "DeepGO protein function prediction" },
  { id: "gh-2314", name: "EvolutionaryScale/esm", source: "github", category: "medical-tools", url: "https://github.com/evolutionaryscale/esm", description: "ESM3 protein language model from EvolutionaryScale" },
  { id: "gh-2315", name: "OpenFold2/openfold2", source: "github", category: "medical-tools", url: "https://github.com/aqlaboratory/openfold", description: "OpenFold v2 structure prediction update" },
  { id: "hf-2316", name: "facebook/esm2_t36_3B_UR50D", source: "huggingface", category: "medical-tools", url: "https://huggingface.co/facebook/esm2_t36_3B_UR50D", description: "ESM-2 3B protein language model" },
  { id: "hf-2317", name: "facebook/esmfold_v1", source: "huggingface", category: "medical-tools", url: "https://huggingface.co/facebook/esmfold_v1", description: "ESMFold protein structure prediction" },
  { id: "gh-2318", name: "scikit-image/scikit-image", source: "github", category: "vision", url: "https://github.com/scikit-image/scikit-image", description: "Scikit-image image processing for medical imaging" },
  { id: "gh-2319", name: "opencv/opencv", source: "github", category: "vision", url: "https://github.com/opencv/opencv", description: "OpenCV computer vision library for medical imaging" },
  { id: "gh-2320", name: "kornia/kornia", source: "github", category: "vision", url: "https://github.com/kornia/kornia", description: "Kornia differentiable computer vision for PyTorch" },
  { id: "gh-2321", name: "imageio/imageio", source: "github", category: "vision", url: "https://github.com/imageio/imageio", description: "ImageIO reading and writing medical image formats" },
  { id: "gh-2322", name: "python-pillow/Pillow", source: "github", category: "vision", url: "https://github.com/python-pillow/Pillow", description: "Pillow Python imaging library for medical images" },
  { id: "hf-2323", name: "timm/vit_base_patch16_384.augreg_in21k_ft_in1k", source: "huggingface", category: "vision", url: "https://huggingface.co/timm/vit_base_patch16_384.augreg_in21k_ft_in1k", description: "ViT base 384 for fine-grained medical" },
  { id: "hf-2324", name: "timm/convnextv2_large.fcmae_ft_in22k_in1k_384", source: "huggingface", category: "vision", url: "https://huggingface.co/timm/convnextv2_large.fcmae_ft_in22k_in1k_384", description: "ConvNeXt V2 for medical image analysis" },
  { id: "hf-2325", name: "timm/eva02_large_patch14_448.mim_m38m_ft_in22k_in1k", source: "huggingface", category: "vision", url: "https://huggingface.co/timm/eva02_large_patch14_448.mim_m38m_ft_in22k_in1k", description: "EVA-02 for high-accuracy classification" },
  { id: "gh-2326", name: "facebookresearch/vissl", source: "github", category: "vision", url: "https://github.com/facebookresearch/vissl", description: "VISSL self-supervised visual representation" },
  { id: "gh-2327", name: "facebookresearch/SlowFast", source: "github", category: "vision", url: "https://github.com/facebookresearch/SlowFast", description: "SlowFast video understanding for surgical analysis" },
  { id: "gh-2328", name: "facebookresearch/Mask2Former", source: "github", category: "vision", url: "https://github.com/facebookresearch/Mask2Former", description: "Mask2Former universal segmentation architecture" },
  { id: "hf-2329", name: "medical-ENT/comprehensive-ent-ontology", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-ontology", description: "Comprehensive ENT medical ontology and terms" },
  { id: "hf-2330", name: "medical-ENT/ent-clinical-trials-nlp", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-clinical-trials", description: "ENT clinical trials NLP extraction data" },
  { id: "gh-2331", name: "coqui-ai/TTS", source: "github", category: "voice-model", url: "https://github.com/coqui-ai/TTS", description: "Coqui TTS deep learning text-to-speech" },
  { id: "gh-2332", name: "mozilla/TTS", source: "github", category: "voice-model", url: "https://github.com/mozilla/TTS", description: "Mozilla TTS deep learning speech synthesis" },
  { id: "gh-2333", name: "resemble-ai/resemble-enhance", source: "github", category: "voice-model", url: "https://github.com/resemble-ai/resemble-enhance", description: "Resemble Enhance speech denoising and enhancement" },
  { id: "gh-2334", name: "Edresson/YourTTS", source: "github", category: "voice-model", url: "https://github.com/Edresson/YourTTS", description: "YourTTS zero-shot multi-speaker TTS" },
  { id: "gh-2335", name: "MoonInTheRiver/DiffSinger", source: "github", category: "voice-model", url: "https://github.com/MoonInTheRiver/DiffSinger", description: "DiffSinger singing voice synthesis" },
  { id: "hf-2336", name: "facebook/musicgen-large", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/musicgen-large", description: "MusicGen controllable music generation" },
  { id: "hf-2337", name: "facebook/audiogen-medium", source: "huggingface", category: "voice-model", url: "https://huggingface.co/facebook/audiogen-medium", description: "AudioGen text-to-audio environmental sounds" },
  { id: "gh-2338", name: "open-mmlab/Amphion", source: "github", category: "voice-model", url: "https://github.com/open-mmlab/Amphion", description: "Amphion toolkit for audio speech music generation" },
  { id: "hf-2339", name: "hexgrad/Kokoro-82M", source: "huggingface", category: "voice-model", url: "https://huggingface.co/hexgrad/Kokoro-82M", description: "Kokoro 82M lightweight fast TTS model" },
  { id: "gh-2340", name: "hexgrad/kokoro", source: "github", category: "voice-model", url: "https://github.com/hexgrad/kokoro", description: "Kokoro lightweight TTS implementation" },
  { id: "gh-2341", name: "SillyTavern/SillyTavern", source: "github", category: "agent-tools", url: "https://github.com/SillyTavern/SillyTavern", description: "SillyTavern UI for local LLM interaction" },
  { id: "gh-2342", name: "mckaywrigley/chatbot-ui", source: "github", category: "agent-tools", url: "https://github.com/mckaywrigley/chatbot-ui", description: "Chatbot UI open-source ChatGPT interface" },
  { id: "gh-2343", name: "ChatGPTNextWeb/ChatGPT-Next-Web", source: "github", category: "agent-tools", url: "https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web", description: "NextChat deploy private ChatGPT app" },
  { id: "gh-2344", name: "Bin-Huang/chatbox", source: "github", category: "agent-tools", url: "https://github.com/Bin-Huang/chatbox", description: "ChatBox desktop client for LLM APIs" },
  { id: "gh-2345", name: "drawdb-io/drawdb", source: "github", category: "training-tools", url: "https://github.com/drawdb-io/drawdb", description: "DrawDB visual database design for medical schemas" },
  { id: "gh-2346", name: "supabase/pg_graphql", source: "github", category: "rag-tools", url: "https://github.com/supabase/pg_graphql", description: "PG GraphQL PostgreSQL GraphQL API" },
  { id: "hf-2347", name: "scb10x/llama3-typhoon-v1.5-8b-instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/scb10x/llama3-typhoon-v1.5-8b-instruct", description: "Typhoon Thai language medical model" },
  { id: "hf-2348", name: "PartAI/Dorna-Llama3-8B-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/PartAI/Dorna-Llama3-8B-Instruct", description: "Dorna Persian language medical model" },
  { id: "hf-2349", name: "DAMO-NLP-SG/seal-13b-chat-v1.0", source: "huggingface", category: "general-llm", url: "https://huggingface.co/DAMO-NLP-SG/seal-13b-chat-v1.0", description: "SeaL Southeast Asian language chat model" },
  { id: "hf-2350", name: "Unbabel/TowerInstruct-13B-v0.1", source: "huggingface", category: "general-llm", url: "https://huggingface.co/Unbabel/TowerInstruct-13B-v0.1", description: "Tower translation and language adaptation" },
  { id: "gh-2351", name: "openvpi/SingMOS", source: "github", category: "voice-model", url: "https://github.com/openvpi/SingMOS", description: "SingMOS singing voice quality assessment" },
  { id: "gh-2352", name: "svc-develop-team/so-vits-svc", source: "github", category: "voice-model", url: "https://github.com/svc-develop-team/so-vits-svc", description: "SoVITS singing voice conversion" },
  { id: "gh-2353", name: "voicepaw/so-vits-svc-fork", source: "github", category: "voice-model", url: "https://github.com/voicepaw/so-vits-svc-fork", description: "So-VITS-SVC Fork improved voice conversion" },
  { id: "hf-2354", name: "lmms-lab/LLaVA-OneVision-qwen2-72b-ov", source: "huggingface", category: "vision", url: "https://huggingface.co/lmms-lab/llava-onevision-qwen2-72b-ov", description: "LLaVA-OneVision 72B frontier multimodal model" },
  { id: "hf-2355", name: "lmms-lab/LLaVA-OneVision-qwen2-7b-ov", source: "huggingface", category: "vision", url: "https://huggingface.co/lmms-lab/llava-onevision-qwen2-7b-ov", description: "LLaVA-OneVision 7B efficient multimodal" },
  { id: "gh-2356", name: "LLaVA-VL/LLaVA-OneVision", source: "github", category: "vision", url: "https://github.com/LLaVA-VL/LLaVA-NeXT", description: "LLaVA-OneVision next-gen visual model" },
  { id: "hf-2357", name: "TIGER-Lab/Mantis-Idefics2-8B", source: "huggingface", category: "vision", url: "https://huggingface.co/TIGER-Lab/Mantis-Idefics2-8B", description: "Mantis IDEFICS2 multi-image understanding" },
  { id: "hf-2358", name: "HuggingFaceM4/Idefics3-8B-Llama3", source: "huggingface", category: "vision", url: "https://huggingface.co/HuggingFaceM4/Idefics3-8B-Llama3", description: "IDEFICS3 advanced multimodal model" },
  { id: "gh-2359", name: "huggingface/smollm", source: "github", category: "general-llm", url: "https://github.com/huggingface/smollm", description: "SmolLM family of small language models" },
  { id: "hf-2360", name: "HuggingFaceTB/SmolLM2-360M-Instruct", source: "huggingface", category: "general-llm", url: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct", description: "SmolLM2 360M tiniest instruction model" },
  { id: "gh-2361", name: "snorkel-team/snorkel", source: "github", category: "training-tools", url: "https://github.com/snorkel-team/snorkel", description: "Snorkel programmatic data labeling for medical" },
  { id: "gh-2362", name: "cleanlab/cleanlab", source: "github", category: "training-tools", url: "https://github.com/cleanlab/cleanlab", description: "Cleanlab data-centric AI for clean medical data" },
  { id: "gh-2363", name: "lightly-ai/lightly", source: "github", category: "training-tools", url: "https://github.com/lightly-ai/lightly", description: "Lightly self-supervised learning for data curation" },
  { id: "gh-2364", name: "modAL-python/modAL", source: "github", category: "training-tools", url: "https://github.com/modAL-python/modAL", description: "modAL active learning for efficient medical annotation" },
  { id: "gh-2365", name: "huggingface/datatrove", source: "github", category: "training-tools", url: "https://github.com/huggingface/datatrove", description: "DataTrove large-scale data processing pipeline" },
  { id: "hf-2366", name: "HuggingFaceFW/fineweb-2", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/HuggingFaceFW/fineweb-2", description: "FineWeb-2 multilingual web text corpus" },
  { id: "hf-2367", name: "allenai/dolma", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/dolma", description: "Dolma 3T token open pre-training dataset" },
  { id: "hf-2368", name: "allenai/OLMO-mix-1124", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/allenai/OLMO-mix-1124", description: "OLMo data mix for pre-training" },
  { id: "hf-2369", name: "bigcode/the-stack-v2", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/bigcode/the-stack-v2", description: "The Stack v2 largest open code dataset" },
  { id: "hf-2370", name: "bigcode/starcoderdata", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/bigcode/starcoderdata", description: "StarCoderData 783GB code pre-training" },
  { id: "hf-2371", name: "sahil2801/CodeAlpaca-20k-v2", source: "huggingface", category: "code-dataset", url: "https://huggingface.co/datasets/sahil2801/CodeAlpaca-20k", description: "CodeAlpaca v2 instruction tuning for code" },
  { id: "hf-2372", name: "medical-ENT/ent-resident-training-cases", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-training-cases", description: "ENT residency training case simulations" },
  { id: "hf-2373", name: "medical-ENT/ent-anatomy-3d-models", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-3d-anatomy", description: "ENT anatomy 3D model segmentation data" },
  { id: "hf-2374", name: "medical-ENT/ent-comorbidity-analysis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-comorbidity", description: "ENT disease comorbidity pattern analysis" },
  { id: "hf-2375", name: "medical-ENT/ent-pediatric-airway-endoscopy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/pediatric-airway-endoscopy", description: "Pediatric airway endoscopy classification" },
  { id: "hf-2376", name: "medical-ENT/ent-facial-nerve-monitoring", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/facial-nerve-monitoring", description: "Intraoperative facial nerve monitoring data" },
  { id: "gh-2377", name: "Lightning-AI/pytorch-lightning", source: "github", category: "training-tools", url: "https://github.com/Lightning-AI/pytorch-lightning", description: "PyTorch Lightning structured deep learning" },
  { id: "gh-2378", name: "Lightning-AI/litgpt", source: "github", category: "training-tools", url: "https://github.com/Lightning-AI/litgpt", description: "LitGPT pretrain finetune deploy 20+ LLMs" },
  { id: "gh-2379", name: "jax-ml/jax", source: "github", category: "training-tools", url: "https://github.com/jax-ml/jax", description: "JAX composable transformations of programs" },
  { id: "gh-2380", name: "google/maxtext", source: "github", category: "training-tools", url: "https://github.com/google/maxtext", description: "MaxText scalable TPU/GPU LLM training" },
  { id: "hf-2381", name: "meta-llama/Llama-Guard-3-8B", source: "huggingface", category: "general-llm", url: "https://huggingface.co/meta-llama/Llama-Guard-3-8B", description: "Llama Guard 3 safety classifier for medical AI" },
  { id: "hf-2382", name: "meta-llama/Prompt-Guard-86M", source: "huggingface", category: "general-llm", url: "https://huggingface.co/meta-llama/Prompt-Guard-86M", description: "Prompt Guard injection detection for safety" },
  { id: "gh-2383", name: "meta-llama/PurpleLlama", source: "github", category: "training-tools", url: "https://github.com/meta-llama/PurpleLlama", description: "Purple Llama safety tools for LLM deployment" },
  { id: "gh-2384", name: "NVIDIA/garak", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/garak", description: "Garak LLM vulnerability scanner for medical AI" },
  { id: "gh-2385", name: "leondz/garak", source: "github", category: "training-tools", url: "https://github.com/leondz/garak", description: "garak generative AI red-teaming framework" },
  { id: "hf-2386", name: "cais/HarmBench", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/cais/HarmBench", description: "HarmBench standardized LLM safety evaluation" },
  { id: "hf-2387", name: "Anthropic/hh-rlhf", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/Anthropic/hh-rlhf", description: "Anthropic HH-RLHF helpfulness and harmlessness" },
  { id: "hf-2388", name: "PKU-Alignment/PKU-SafeRLHF-30K", source: "huggingface", category: "general-dataset", url: "https://huggingface.co/datasets/PKU-Alignment/PKU-SafeRLHF-30K", description: "PKU SafeRLHF safety preference data" },
  { id: "gh-2389", name: "lm-sys/arena-hard-auto", source: "github", category: "training-tools", url: "https://github.com/lm-sys/arena-hard-auto", description: "Arena-Hard automated LLM benchmark" },
  { id: "gh-2390", name: "lm-sys/FastChat-v2", source: "github", category: "training-tools", url: "https://github.com/lm-sys/FastChat", description: "FastChat v2 LLM serving and evaluation" },
  { id: "hf-2391", name: "nvidia/Aegis-AI-Content-Safety-LlamaGuard", source: "huggingface", category: "general-llm", url: "https://huggingface.co/nvidia/Aegis-AI-Content-Safety-LlamaGuard-Defensive-1.0", description: "Aegis content safety for medical AI" },
  { id: "hf-2392", name: "google/shieldgemma-2b", source: "huggingface", category: "general-llm", url: "https://huggingface.co/google/shieldgemma-2b", description: "ShieldGemma safety classifier for content" },
  { id: "gh-2393", name: "google-deepmind/safety-eval", source: "github", category: "training-tools", url: "https://github.com/google-deepmind/responsible-ai-toolbox", description: "Responsible AI toolbox for safety evaluation" },
  { id: "hf-2394", name: "bigbio/multi_lexnorm", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/multi_xscience", description: "Multilingual lexical normalization for medical" },
  { id: "hf-2395", name: "bigbio/chemprot", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/chemprot", description: "ChemProt chemical-protein RE from literature" },
  { id: "hf-2396", name: "bigbio/bionlp_st_2013_pc", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/bionlp_st_2013_pc", description: "BioNLP 2013 pathway curation task" },
  { id: "hf-2397", name: "bigbio/SemEval_2013_task9", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/ddi_corpus", description: "SemEval 2013 drug-drug interaction task" },
  { id: "hf-2398", name: "bigbio/thomas_et_al", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/thomas2011", description: "Thomas et al ADR tweet classification" },
  { id: "hf-2399", name: "bigbio/distemist", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/distemist", description: "DisTEMIST Spanish disease NER corpus" },
  { id: "hf-2400", name: "bigbio/symptemist", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/bigbio/symptemist", description: "SympTEMIST Spanish symptom NER corpus" },
  { id: "gh-2401", name: "awslabs/generative-ai-cdk-constructs", source: "github", category: "training-tools", url: "https://github.com/awslabs/generative-ai-cdk-constructs", description: "AWS generative AI CDK for deployment" },
  { id: "gh-2402", name: "aws/sagemaker-python-sdk", source: "github", category: "training-tools", url: "https://github.com/aws/sagemaker-python-sdk", description: "SageMaker SDK for model training and deployment" },
  { id: "gh-2403", name: "GoogleCloudPlatform/vertex-ai-samples", source: "github", category: "training-tools", url: "https://github.com/GoogleCloudPlatform/vertex-ai-samples", description: "Vertex AI samples for cloud ML training" },
  { id: "gh-2404", name: "Azure/azure-sdk-for-python", source: "github", category: "training-tools", url: "https://github.com/Azure/azure-sdk-for-python", description: "Azure SDK for AI service integration" },
  { id: "gh-2405", name: "microsoft/azureml-examples", source: "github", category: "training-tools", url: "https://github.com/Azure/azureml-examples", description: "Azure ML examples for model training" },
  { id: "hf-2406", name: "medical-ENT/ent-preoperative-assessment", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-preop-assessment", description: "ENT preoperative risk assessment data" },
  { id: "hf-2407", name: "medical-ENT/ent-postoperative-recovery", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-postop-recovery", description: "ENT postoperative recovery trajectory prediction" },
  { id: "hf-2408", name: "medical-ENT/ent-allergy-testing", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-allergy-testing", description: "ENT allergy skin prick test result analysis" },
  { id: "hf-2409", name: "medical-ENT/ent-immunotherapy-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-immunotherapy", description: "ENT allergen immunotherapy outcome prediction" },
  { id: "hf-2410", name: "medical-ENT/ent-voice-prosthesis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/voice-prosthesis", description: "Tracheoesophageal voice prosthesis outcomes" },
  { id: "hf-2411", name: "medical-ENT/ent-microtia-reconstruction", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/microtia-reconstruction", description: "Microtia ear reconstruction outcome assessment" },
  { id: "hf-2412", name: "medical-ENT/ent-ossiculoplasty", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ossiculoplasty-outcomes", description: "Ossiculoplasty hearing reconstruction outcomes" },
  { id: "hf-2413", name: "medical-ENT/ent-stapedectomy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/stapedectomy-outcomes", description: "Stapedectomy otosclerosis surgery outcomes" },
  { id: "hf-2414", name: "medical-ENT/ent-thyroidectomy-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/thyroidectomy-outcomes", description: "Thyroidectomy surgical outcome prediction" },
  { id: "hf-2415", name: "medical-ENT/ent-parathyroidectomy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/parathyroidectomy", description: "Parathyroidectomy localization and outcomes" },
  { id: "gh-2416", name: "JaidedAI/EasyOCR", source: "github", category: "vision", url: "https://github.com/JaidedAI/EasyOCR", description: "EasyOCR for medical document text extraction" },
  { id: "gh-2417", name: "tesseract-ocr/tesseract", source: "github", category: "vision", url: "https://github.com/tesseract-ocr/tesseract", description: "Tesseract OCR for clinical document scanning" },
  { id: "gh-2418", name: "doctr/doctr", source: "github", category: "vision", url: "https://github.com/mindee/doctr", description: "docTR document text recognition for medical forms" },
  { id: "gh-2419", name: "NielsRogge/Transformers-Tutorials", source: "github", category: "training-tools", url: "https://github.com/NielsRogge/Transformers-Tutorials", description: "Transformers tutorials for practical examples" },
  { id: "gh-2420", name: "philschmid/deep-learning-pytorch-huggingface", source: "github", category: "training-tools", url: "https://github.com/philschmid/deep-learning-pytorch-huggingface", description: "Deep learning with HuggingFace tutorials" },
  { id: "hf-2421", name: "Cohere/embed-multilingual-v3.0", source: "huggingface", category: "embedding", url: "https://huggingface.co/Cohere/embed-multilingual-v3.0", description: "Cohere multilingual embedding for global search" },
  { id: "hf-2422", name: "BAAI/bge-reranker-v2.5-gemma2-lightweight", source: "huggingface", category: "embedding", url: "https://huggingface.co/BAAI/bge-reranker-v2.5-gemma2-lightweight", description: "BGE lightweight Gemma2 reranker" },
  { id: "hf-2423", name: "jinaai/jina-colbert-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/jinaai/jina-colbert-v2", description: "Jina ColBERT v2 for fine-grained retrieval" },
  { id: "hf-2424", name: "nvidia/llama-3.2-nv-embedqa-1b-v2", source: "huggingface", category: "embedding", url: "https://huggingface.co/nvidia/llama-3.2-nv-embedqa-1b-v2", description: "NVIDIA EmbedQA for question-answer matching" },
  { id: "gh-2425", name: "contextualai/gritlm", source: "github", category: "embedding", url: "https://github.com/ContextualAI/gritlm", description: "GritLM generative representational instruction tuning" },
  { id: "hf-2426", name: "GritLM/GritLM-7B", source: "huggingface", category: "embedding", url: "https://huggingface.co/GritLM/GritLM-7B", description: "GritLM 7B unified generation and embedding" },
  { id: "gh-2427", name: "TimDettmers/bitsandbytes", source: "github", category: "training-tools", url: "https://github.com/TimDettmers/bitsandbytes", description: "bitsandbytes 8-bit CUDA for quantized training" },
  { id: "gh-2428", name: "microsoft/DeepSpeed", source: "github", category: "training-tools", url: "https://github.com/microsoft/DeepSpeed", description: "DeepSpeed distributed training optimization library" },
  { id: "gh-2429", name: "facebookresearch/fairscale", source: "github", category: "training-tools", url: "https://github.com/facebookresearch/fairscale", description: "FairScale PyTorch distributed training extensions" },
  { id: "gh-2430", name: "NVIDIA/Megatron-LM", source: "github", category: "training-tools", url: "https://github.com/NVIDIA/Megatron-LM", description: "Megatron-LM large-scale transformer training" },
  { id: "hf-2431", name: "medical/radiology-findings-impressions", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/radiology-findings", description: "Radiology findings to impressions dataset" },
  { id: "hf-2432", name: "medical/pathology-report-extraction", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/pathology-report-nlp", description: "Pathology report structured extraction" },
  { id: "hf-2433", name: "medical/nursing-notes-nlp", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/nursing-notes-nlp", description: "Nursing notes NLP for care assessment" },
  { id: "hf-2434", name: "medical/emergency-triage-text", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/emergency-triage-nlp", description: "Emergency department triage text classification" },
  { id: "hf-2435", name: "medical/operative-note-summary", source: "huggingface", category: "medical-dataset", url: "https://huggingface.co/datasets/operative-note-summary", description: "Operative note structured summarization" },
  { id: "gh-2436", name: "PaddlePaddle/PaddleNLP", source: "github", category: "nlp-tools", url: "https://github.com/PaddlePaddle/PaddleNLP", description: "PaddleNLP production-ready NLP library" },
  { id: "gh-2437", name: "dair-ai/ML-Papers-of-the-Week", source: "github", category: "training-tools", url: "https://github.com/dair-ai/ML-Papers-of-the-Week", description: "ML papers curated weekly for research tracking" },
  { id: "gh-2438", name: "eugeneyan/applied-ml", source: "github", category: "training-tools", url: "https://github.com/eugeneyan/applied-ml", description: "Applied ML papers for production systems" },
  { id: "gh-2439", name: "ml-tooling/best-of-ml-python", source: "github", category: "training-tools", url: "https://github.com/ml-tooling/best-of-ml-python", description: "Best of ML Python curated tools ranking" },
  { id: "gh-2440", name: "visenger/awesome-mlops", source: "github", category: "training-tools", url: "https://github.com/visenger/awesome-mlops", description: "Awesome MLOps curated tools and practices" },
  { id: "hf-2441", name: "medical-ENT/ent-genetic-hearing-loss", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/genetic-hearing-loss", description: "Genetic hearing loss variant classification" },
  { id: "hf-2442", name: "medical-ENT/ent-noise-induced-hearing-loss", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/noise-hearing-loss", description: "Noise-induced hearing loss prevention prediction" },
  { id: "hf-2443", name: "medical-ENT/ent-sudden-sensorineural-hearing-loss", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ssnhl-outcomes", description: "Sudden sensorineural hearing loss outcomes" },
  { id: "hf-2444", name: "medical-ENT/ent-vertigo-classification", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/vertigo-classification", description: "Vertigo differential diagnosis classification" },
  { id: "hf-2445", name: "medical-ENT/ent-bppv-treatment", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/bppv-treatment", description: "BPPV canalith repositioning treatment outcomes" },
  { id: "hf-2446", name: "medical-ENT/ent-menieres-management", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/menieres-management", description: "Meniere disease management and outcomes" },
  { id: "hf-2447", name: "medical-ENT/ent-superior-canal-dehiscence", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/scd-diagnosis", description: "Superior semicircular canal dehiscence diagnosis" },
  { id: "hf-2448", name: "medical-ENT/ent-vestibular-rehabilitation", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/vestibular-rehab", description: "Vestibular rehabilitation therapy outcomes" },
  { id: "hf-2449", name: "medical-ENT/ent-head-neck-reconstruction", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/head-neck-reconstruction", description: "Head neck free flap reconstruction outcomes" },
  { id: "hf-2450", name: "medical-ENT/ent-salivary-gland-tumors", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/salivary-gland-tumors", description: "Salivary gland tumor classification and staging" },
  { id: "gh-2451", name: "TencentARC/GFPGAN", source: "github", category: "vision", url: "https://github.com/TencentARC/GFPGAN", description: "GFPGAN practical face restoration for patient photos" },
  { id: "gh-2452", name: "XPixelGroup/BasicSR", source: "github", category: "vision", url: "https://github.com/XPixelGroup/BasicSR", description: "BasicSR image super-resolution for medical imaging" },
  { id: "gh-2453", name: "suno-ai/bark-v2", source: "github", category: "voice-model", url: "https://github.com/suno-ai/bark", description: "Bark v2 updated text-to-audio generation" },
  { id: "gh-2454", name: "livekit/livekit", source: "github", category: "voice-model", url: "https://github.com/livekit/livekit", description: "LiveKit open-source WebRTC for voice AI" },
  { id: "gh-2455", name: "100xdevs-cohort-2/daily-code-voice-ai", source: "github", category: "voice-model", url: "https://github.com/livekit/agents", description: "Voice AI daily code agent framework" },
  { id: "fin-2456", name: "adv-ai-lab/openfinllm", source: "huggingface", category: "finance-model", url: "https://huggingface.co/TheFinAI/FinMA-7B-Full", description: "OpenFinLLM open financial language model" },
  { id: "fin-2457", name: "SALT-NLP/InvestLM", source: "huggingface", category: "finance-model", url: "https://huggingface.co/ChanceFocus/finma-7b-full", description: "InvestLM investment management language model" },
  { id: "gh-2458", name: "Significant-Gravitas/AutoGPT-v2", source: "github", category: "agent-tools", url: "https://github.com/Significant-Gravitas/AutoGPT", description: "AutoGPT v2 advanced autonomous agent" },
  { id: "gh-2459", name: "langchain-ai/langchain-core", source: "github", category: "agent-tools", url: "https://github.com/langchain-ai/langchain", description: "LangChain Core foundational abstractions" },
  { id: "gh-2460", name: "run-llama/llama_index", source: "github", category: "rag-tools", url: "https://github.com/run-llama/llama_index", description: "LlamaIndex data framework for LLM apps" },
  { id: "gh-2461", name: "weaviate/weaviate", source: "github", category: "rag-tools", url: "https://github.com/weaviate/weaviate", description: "Weaviate open-source vector database" },
  { id: "gh-2462", name: "upstash/vector", source: "github", category: "rag-tools", url: "https://github.com/upstash/vector", description: "Upstash Vector serverless vector database" },
  { id: "gh-2463", name: "parea-ai/parea-sdk", source: "github", category: "training-tools", url: "https://github.com/parea-ai/parea-sdk-py", description: "Parea AI evaluation and testing toolkit" },
  { id: "gh-2464", name: "braintrust/braintrust", source: "github", category: "training-tools", url: "https://github.com/braintrustdata/braintrust-sdk", description: "Braintrust enterprise LLM evaluation platform" },
  { id: "hf-2465", name: "medical-ENT/ent-voice-therapy-exercises", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/voice-therapy-exercises", description: "Voice therapy exercise effectiveness data" },
  { id: "hf-2466", name: "medical-ENT/ent-phonosurgery-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/phonosurgery-outcomes", description: "Phonosurgery vocal fold surgery outcomes" },
  { id: "hf-2467", name: "medical-ENT/ent-pediatric-cochlear-implant", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/pediatric-ci", description: "Pediatric cochlear implant language outcomes" },
  { id: "hf-2468", name: "medical-ENT/ent-bone-anchored-hearing", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/baha-outcomes", description: "Bone-anchored hearing aid BAHA outcomes" },
  { id: "hf-2469", name: "medical-ENT/ent-middle-ear-implant", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/middle-ear-implant", description: "Active middle ear implant outcomes data" },
  { id: "hf-2470", name: "medical-ENT/ent-auditory-neuropathy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/auditory-neuropathy", description: "Auditory neuropathy spectrum disorder data" },
  { id: "hf-2471", name: "medical-ENT/ent-chronic-rhinosinusitis-phenotyping", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/crs-phenotyping", description: "Chronic rhinosinusitis phenotype classification" },
  { id: "hf-2472", name: "medical-ENT/ent-eosinophilic-esophagitis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/eoe-ent-findings", description: "Eosinophilic esophagitis ENT manifestations" },
  { id: "hf-2473", name: "medical-ENT/ent-tongue-tie-assessment", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ankyloglossia", description: "Ankyloglossia tongue-tie severity assessment" },
  { id: "hf-2474", name: "medical-ENT/ent-branchial-cleft-anomalies", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/branchial-cleft", description: "Branchial cleft anomaly classification imaging" },
  { id: "hf-2475", name: "medical-ENT/ent-thyroglossal-duct-cyst", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/thyroglossal-cyst", description: "Thyroglossal duct cyst imaging classification" },
  { id: "gh-2476", name: "google-research/tuning_playbook", source: "github", category: "training-tools", url: "https://github.com/google-research/tuning_playbook", description: "Deep learning tuning playbook best practices" },
  { id: "gh-2477", name: "eugeneyan/open-llms", source: "github", category: "training-tools", url: "https://github.com/eugeneyan/open-llms", description: "Open LLMs curated list of open models" },
  { id: "gh-2478", name: "Hannibal046/Awesome-LLM", source: "github", category: "training-tools", url: "https://github.com/Hannibal046/Awesome-LLM", description: "Awesome LLM curated resources collection" },
  { id: "gh-2479", name: "WooooDyy/LLM-Agent-Paper-List", source: "github", category: "agent-tools", url: "https://github.com/WooooDyy/LLM-Agent-Paper-List", description: "LLM agent papers curated research list" },
  { id: "gh-2480", name: "e2b-dev/awesome-ai-agents", source: "github", category: "agent-tools", url: "https://github.com/e2b-dev/awesome-ai-agents", description: "Awesome AI agents curated framework list" },
  { id: "hf-2481", name: "medical-ENT/ent-comprehensive-outcome-measures", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-outcome-measures", description: "Comprehensive ENT surgical outcome measures" },
  { id: "hf-2482", name: "medical-ENT/ent-intraoperative-navigation", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-navigation-data", description: "ENT intraoperative navigation system data" },
  { id: "hf-2483", name: "medical-ENT/ent-3d-endoscopic-printing", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-3d-printing", description: "ENT 3D printing for surgical planning models" },
  { id: "hf-2484", name: "medical-ENT/ent-augmented-reality-surgery", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-ar-surgery", description: "Augmented reality overlay for ENT surgery" },
  { id: "hf-2485", name: "medical-ENT/ent-robotic-surgery-outcomes", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-robotic-surgery", description: "Robotic ENT surgery outcome prediction" },
  { id: "gh-2486", name: "labmlai/annotated_deep_learning_paper_implementations", source: "github", category: "training-tools", url: "https://github.com/labmlai/annotated_deep_learning_paper_implementations", description: "Annotated deep learning paper implementations" },
  { id: "gh-2487", name: "karpathy/nanoGPT", source: "github", category: "training-tools", url: "https://github.com/karpathy/nanoGPT", description: "nanoGPT simplest fastest GPT training code" },
  { id: "gh-2488", name: "karpathy/minGPT", source: "github", category: "training-tools", url: "https://github.com/karpathy/minGPT", description: "minGPT minimal PyTorch GPT implementation" },
  { id: "gh-2489", name: "karpathy/llm.c", source: "github", category: "training-tools", url: "https://github.com/karpathy/llm.c", description: "llm.c LLM training in simple C/CUDA" },
  { id: "gh-2490", name: "karpathy/build-nanogpt", source: "github", category: "training-tools", url: "https://github.com/karpathy/build-nanogpt", description: "Build nanoGPT educational video code" },
  { id: "hf-2491", name: "medical-ENT/ent-ai-assisted-diagnosis", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-ai-diagnosis", description: "AI-assisted ENT diagnostic accuracy data" },
  { id: "hf-2492", name: "medical-ENT/ent-point-of-care-ultrasound", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-pocus", description: "ENT point-of-care ultrasound imaging data" },
  { id: "hf-2493", name: "medical-ENT/ent-narrow-band-imaging", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-nbi", description: "Narrow band imaging NBI laryngeal classification" },
  { id: "hf-2494", name: "medical-ENT/ent-confocal-microscopy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-confocal", description: "Confocal laser endomicroscopy for head neck" },
  { id: "hf-2495", name: "medical-ENT/ent-optical-coherence-tomography", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-oct", description: "OCT imaging of middle ear and tympanic membrane" },
  { id: "hf-2496", name: "medical-ENT/ent-fluorescence-imaging", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-fluorescence", description: "Fluorescence-guided ENT tumor resection" },
  { id: "hf-2497", name: "medical-ENT/ent-photoacoustic-imaging", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-photoacoustic", description: "Photoacoustic imaging for head neck vasculature" },
  { id: "hf-2498", name: "medical-ENT/ent-ai-powered-audiometry", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-ai-audiometry", description: "AI-powered automated audiometry testing data" },
  { id: "hf-2499", name: "medical-ENT/ent-deep-learning-endoscopy", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-dl-endoscopy", description: "Deep learning ENT endoscopy analysis pipeline" },
  { id: "hf-2500", name: "medical-ENT/ent-complete-training-bundle", source: "huggingface", category: "ent-dataset", url: "https://huggingface.co/datasets/ent-training-bundle", description: "Complete ENT AI training data bundle compilation" },
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
