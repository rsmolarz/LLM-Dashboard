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
  '"otomycosis"[MeSH Terms]',
  '"ear neoplasms"[MeSH Terms]',
  '"tympanic membrane perforation"[MeSH Terms]',
  '"hearing loss, mixed conductive-sensorineural"[MeSH Terms]',
  '"hearing loss, central"[MeSH Terms]',
  '"hearing loss, functional"[MeSH Terms]',
  '"hearing loss, bilateral"[MeSH Terms]',
  '"hearing loss, unilateral"[MeSH Terms]',
  '"deafness"[MeSH Terms] AND "rehabilitation"[MeSH Terms]',
  '"cochlear diseases"[MeSH Terms]',
  '"endolymphatic sac"[MeSH Terms] AND "surgery"[All Fields]',
  '"round window"[All Fields] AND "membrane"[All Fields] AND "ear"[All Fields]',
  '"auditory cortex"[MeSH Terms] AND "plasticity"[All Fields]',
  '"stapes surgery"[All Fields]',
  '"stapes"[MeSH Terms] AND "prosthesis"[All Fields]',
  '"ear protective devices"[MeSH Terms]',
  '"otologic surgical procedures"[MeSH Terms]',
  '"ear, middle"[MeSH Terms] AND "ventilation"[All Fields]',
  '"tympanosclerosis"[MeSH Terms]',
  '"aural rehabilitation"[All Fields]',
  '"audiometry, pure-tone"[MeSH Terms]',
  '"audiometry, speech"[MeSH Terms]',
  '"audiometry, evoked response"[MeSH Terms]',
  '"electrocochleography"[MeSH Terms]',
  '"electronystagmography"[MeSH Terms]',
  '"videonystagmography"[All Fields]',
  '"caloric tests"[MeSH Terms]',
  '"vestibular function tests"[MeSH Terms]',
  '"posturography"[MeSH Terms]',
  '"vestibular evoked myogenic potentials"[All Fields]',
  '"nystagmus, pathologic"[MeSH Terms]',
  '"motion sickness"[MeSH Terms]',
  '"cochlear microphonics"[MeSH Terms]',
  '"hair cells, auditory"[MeSH Terms]',
  '"spiral ganglion"[MeSH Terms]',
  '"gene therapy"[MeSH Terms] AND "hearing loss"[MeSH Terms]',
  '"stem cells"[MeSH Terms] AND "inner ear"[All Fields]',
  '"otoprotection"[All Fields]',
  '"aminoglycoside"[All Fields] AND "ototoxicity"[All Fields]',
  '"cisplatin"[MeSH Terms] AND "hearing loss"[MeSH Terms]',
  '"loop diuretics"[All Fields] AND "ototoxicity"[All Fields]',
  '"sudden deafness"[MeSH Terms] AND "treatment"[All Fields]',
  '"idiopathic sudden sensorineural hearing loss"[All Fields]',
  '"congenital hearing loss"[All Fields] AND "genetics"[All Fields]',
  '"connexin 26"[All Fields] AND "hearing loss"[All Fields]',
  '"pendred syndrome"[MeSH Terms]',
  '"usher syndromes"[MeSH Terms]',
  '"waardenburg syndrome"[MeSH Terms]',
  '"branchio-oto-renal syndrome"[All Fields]',
  '"CHARGE syndrome"[MeSH Terms]',
  '"enlarged vestibular aqueduct"[All Fields]',
  '"mondini dysplasia"[All Fields]',
  '"cochlear malformation"[All Fields]',
  '"common cavity deformity"[All Fields] AND "cochlea"[All Fields]',
  '"semicircular canals"[MeSH Terms] AND "aplasia"[All Fields]',
  '"otoscope"[MeSH Terms] AND "artificial intelligence"[All Fields]',
  '"hearing screening"[All Fields] AND "newborn"[All Fields]',
  '"universal newborn hearing screening"[All Fields]',
  '"tympanometry"[MeSH Terms]',
  '"acoustic impedance tests"[MeSH Terms]',
  '"acoustic reflex"[MeSH Terms]',
  '"eardrum"[All Fields] AND "retraction"[All Fields]',
  '"attic retraction"[All Fields] AND "cholesteatoma"[All Fields]',
  '"tympanic membrane"[MeSH Terms] AND "grafting"[All Fields]',
  '"cartilage tympanoplasty"[All Fields]',
  '"ossicular erosion"[All Fields]',
  '"incudostapedial joint"[All Fields] AND "discontinuity"[All Fields]',
  '"malleus"[MeSH Terms] AND "fixation"[All Fields]',
  '"partial ossicular replacement prosthesis"[All Fields]',
  '"total ossicular replacement prosthesis"[All Fields]',
  '"active middle ear implant"[All Fields]',
  '"transcranial bone conduction"[All Fields]',
  '"softband bone conduction"[All Fields]',
  '"atresiaplasty"[All Fields]',
  '"canaloplasty"[All Fields] AND "ear"[All Fields]',
  '"meatoplasty"[All Fields]',
  '"cochlear implant"[All Fields] AND "bilateral"[All Fields]',
  '"cochlear implant"[All Fields] AND "single sided deafness"[All Fields]',
  '"electric acoustic stimulation"[All Fields]',
  '"hybrid cochlear implant"[All Fields]',
  '"auditory brainstem implant"[MeSH Terms] AND "neurofibromatosis"[All Fields]',
  '"middle cranial fossa approach"[All Fields]',
  '"retrosigmoid approach"[All Fields] AND "acoustic neuroma"[All Fields]',
  '"translabyrinthine approach"[All Fields]',
  '"stereotactic radiosurgery"[MeSH Terms] AND "acoustic neuroma"[All Fields]',
  '"gamma knife"[All Fields] AND "vestibular schwannoma"[All Fields]',
  '"facial nerve monitoring"[All Fields] AND "surgery"[All Fields]',
  '"facial nerve grading"[All Fields]',
  '"house-brackmann"[All Fields]',
  '"sunnybrook facial grading"[All Fields]',
  '"synkinesis"[All Fields] AND "facial nerve"[All Fields]',
  '"facial nerve transfer"[All Fields]',
  '"masseteric nerve"[All Fields] AND "facial reanimation"[All Fields]',
  '"temporalis muscle transfer"[All Fields] AND "facial paralysis"[All Fields]',
  '"gracilis free flap"[All Fields] AND "facial reanimation"[All Fields]',
  '"gold weight"[All Fields] AND "eyelid"[All Fields]',
  '"lower lip reanimation"[All Fields]',
  '"nasal obstruction"[MeSH Terms]',
  '"nasal valve"[All Fields] AND "stenosis"[All Fields]',
  '"spreader grafts"[All Fields] AND "rhinoplasty"[All Fields]',
  '"alar batten grafts"[All Fields]',
  '"revision rhinoplasty"[All Fields]',
  '"functional rhinoplasty"[All Fields]',
  '"dorsal hump reduction"[All Fields]',
  '"tip rhinoplasty"[All Fields]',
  '"cleft lip rhinoplasty"[All Fields]',
  '"saddle nose deformity"[All Fields] AND "reconstruction"[All Fields]',
  '"costal cartilage"[All Fields] AND "rhinoplasty"[All Fields]',
  '"nasal reconstruction"[All Fields] AND "Mohs"[All Fields]',
  '"forehead flap"[All Fields] AND "nasal reconstruction"[All Fields]',
  '"bilobed flap"[All Fields] AND "nose"[All Fields]',
  '"nasal dermoid"[All Fields]',
  '"nasal glioma"[All Fields]',
  '"nasal encephalocele"[All Fields]',
  '"pyriform aperture stenosis"[All Fields]',
  '"turbinate surgery"[All Fields]',
  '"submucous resection turbinate"[All Fields]',
  '"inferior turbinectomy"[All Fields]',
  '"middle turbinate"[All Fields] AND "concha bullosa"[All Fields]',
  '"paradoxical middle turbinate"[All Fields]',
  '"Haller cell"[All Fields]',
  '"agger nasi cell"[All Fields]',
  '"Onodi cell"[All Fields]',
  '"sphenoid sinus"[MeSH Terms] AND "surgery"[All Fields]',
  '"frontal recess"[All Fields] AND "anatomy"[All Fields]',
  '"maxillary sinus"[MeSH Terms] AND "surgery"[All Fields]',
  '"ethmoid sinus"[MeSH Terms] AND "surgery"[All Fields]',
  '"antral lavage"[All Fields]',
  '"inferior meatal antrostomy"[All Fields]',
  '"endoscopic medial maxillectomy"[All Fields]',
  '"modified endoscopic Lothrop procedure"[All Fields]',
  '"nasofrontal outflow tract"[All Fields]',
  '"frontal sinus stent"[All Fields]',
  '"frontal sinus obliteration"[All Fields]',
  '"osteoplastic flap"[All Fields] AND "frontal sinus"[All Fields]',
  '"sinus mucocele"[All Fields]',
  '"sinus barotrauma"[All Fields]',
  '"sinogenic complications"[All Fields] AND "orbital"[All Fields]',
  '"subperiosteal abscess"[All Fields] AND "orbital"[All Fields]',
  '"Chandler classification"[All Fields]',
  '"cavernous sinus thrombosis"[MeSH Terms] AND "sinusitis"[All Fields]',
  '"Pott puffy tumor"[All Fields]',
  '"intracranial complications"[All Fields] AND "sinusitis"[All Fields]',
  '"meningitis"[MeSH Terms] AND "sinusitis"[All Fields]',
  '"brain abscess"[MeSH Terms] AND "sinusitis"[All Fields]',
  '"fungal ball"[All Fields] AND "paranasal sinuses"[All Fields]',
  '"invasive fungal sinusitis"[All Fields]',
  '"mucormycosis"[MeSH Terms] AND "sinonasal"[All Fields]',
  '"granulomatosis with polyangiitis"[MeSH Terms] AND "nose"[All Fields]',
  '"sarcoidosis"[MeSH Terms] AND "sinonasal"[All Fields]',
  '"rhinoscleroma"[MeSH Terms]',
  '"atrophic rhinitis"[MeSH Terms]',
  '"rhinocerebral mucormycosis"[All Fields]',
  '"eosinophilic chronic rhinosinusitis"[All Fields]',
  '"type 2 inflammation"[All Fields] AND "chronic rhinosinusitis"[All Fields]',
  '"mepolizumab"[All Fields] AND "nasal polyps"[All Fields]',
  '"benralizumab"[All Fields] AND "eosinophilic"[All Fields] AND "sinusitis"[All Fields]',
  '"tezepelumab"[All Fields] AND "nasal polyps"[All Fields]',
  '"smell training"[All Fields]',
  '"parosmia"[All Fields]',
  '"phantosmia"[All Fields]',
  '"anosmia"[MeSH Terms] AND "COVID-19"[All Fields]',
  '"nasal airflow"[All Fields] AND "computational fluid dynamics"[All Fields]',
  '"rhinomanometry"[MeSH Terms]',
  '"acoustic rhinometry"[All Fields]',
  '"NOSE score"[All Fields] AND "nasal obstruction"[All Fields]',
  '"SNOT-22"[All Fields]',
  '"sinonasal outcome test"[All Fields]',
  '"oropharyngeal neoplasms"[MeSH Terms]',
  '"tonsil neoplasms"[MeSH Terms]',
  '"base of tongue neoplasms"[All Fields]',
  '"palatal neoplasms"[MeSH Terms]',
  '"lip neoplasms"[MeSH Terms]',
  '"buccal mucosa neoplasms"[All Fields]',
  '"floor of mouth neoplasms"[All Fields]',
  '"retromolar trigone"[All Fields] AND "carcinoma"[All Fields]',
  '"hard palate"[All Fields] AND "neoplasms"[All Fields]',
  '"soft palate"[All Fields] AND "neoplasms"[All Fields]',
  '"maxillary sinus neoplasms"[All Fields]',
  '"ethmoid sinus neoplasms"[All Fields]',
  '"sphenoid sinus neoplasms"[All Fields]',
  '"frontal sinus neoplasms"[All Fields]',
  '"nasal cavity neoplasms"[All Fields]',
  '"melanoma"[MeSH Terms] AND "sinonasal"[All Fields]',
  '"neuroendocrine carcinoma"[MeSH Terms] AND "sinonasal"[All Fields]',
  '"chondrosarcoma"[MeSH Terms] AND "skull base"[All Fields]',
  '"chordoma"[MeSH Terms] AND "skull base"[All Fields]',
  '"rhabdomyosarcoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"hemangiopericytoma"[All Fields] AND "sinonasal"[All Fields]',
  '"acinic cell carcinoma"[MeSH Terms]',
  '"polymorphous adenocarcinoma"[All Fields]',
  '"salivary duct carcinoma"[All Fields]',
  '"carcinoma ex pleomorphic adenoma"[All Fields]',
  '"myoepithelial carcinoma"[All Fields]',
  '"secretory carcinoma"[All Fields] AND "salivary"[All Fields]',
  '"warthin tumor"[All Fields]',
  '"oncocytoma"[MeSH Terms] AND "salivary"[All Fields]',
  '"submandibular gland neoplasms"[MeSH Terms]',
  '"sublingual gland neoplasms"[All Fields]',
  '"minor salivary gland tumors"[All Fields]',
  '"sialadenitis"[MeSH Terms]',
  '"parotitis"[MeSH Terms]',
  '"sialography"[MeSH Terms]',
  '"sialendoscopy"[All Fields]',
  '"salivary gland calculi"[All Fields] AND "lithotripsy"[All Fields]',
  '"radioiodine sialadenitis"[All Fields]',
  '"IgG4-related disease"[All Fields] AND "salivary"[All Fields]',
  '"sjogren syndrome"[MeSH Terms] AND "salivary"[All Fields]',
  '"HIV salivary gland disease"[All Fields]',
  '"cystic hygroma"[MeSH Terms]',
  '"lymphatic malformations"[MeSH Terms] AND "head and neck"[All Fields]',
  '"hemangioma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"vascular malformations"[MeSH Terms] AND "head and neck"[All Fields]',
  '"arteriovenous malformations"[MeSH Terms] AND "head and neck"[All Fields]',
  '"venous malformation"[All Fields] AND "head and neck"[All Fields]',
  '"dermoid cyst"[MeSH Terms] AND "head and neck"[All Fields]',
  '"teratoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"lipoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"schwannoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"neurofibroma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"pilomatrixoma"[MeSH Terms]',
  '"keratoacanthoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"basal cell carcinoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"squamous cell carcinoma"[MeSH Terms] AND "cutaneous"[All Fields] AND "head and neck"[All Fields]',
  '"merkel cell carcinoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"dermatofibrosarcoma protuberans"[MeSH Terms] AND "head and neck"[All Fields]',
  '"angiosarcoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"melanoma"[MeSH Terms] AND "head and neck"[All Fields]',
  '"sentinel lymph node"[MeSH Terms] AND "melanoma"[All Fields] AND "head and neck"[All Fields]',
  '"Mohs surgery"[All Fields] AND "head and neck"[All Fields]',
  '"radiation therapy"[MeSH Terms] AND "head and neck neoplasms"[MeSH Terms]',
  '"intensity-modulated radiation therapy"[All Fields] AND "head and neck"[All Fields]',
  '"proton therapy"[All Fields] AND "head and neck"[All Fields]',
  '"brachytherapy"[MeSH Terms] AND "head and neck"[All Fields]',
  '"cetuximab"[MeSH Terms] AND "head and neck"[All Fields]',
  '"pembrolizumab"[All Fields] AND "head and neck squamous"[All Fields]',
  '"nivolumab"[All Fields] AND "head and neck"[All Fields]',
  '"immunotherapy"[MeSH Terms] AND "head and neck neoplasms"[MeSH Terms]',
  '"checkpoint inhibitors"[All Fields] AND "head and neck cancer"[All Fields]',
  '"chemotherapy"[MeSH Terms] AND "head and neck neoplasms"[MeSH Terms]',
  '"cisplatin"[MeSH Terms] AND "head and neck"[All Fields]',
  '"induction chemotherapy"[All Fields] AND "larynx"[All Fields]',
  '"concurrent chemoradiation"[All Fields] AND "head and neck"[All Fields]',
  '"targeted therapy"[All Fields] AND "head and neck"[All Fields]',
  '"positron emission tomography"[MeSH Terms] AND "head and neck neoplasms"[All Fields]',
  '"sentinel lymph node"[MeSH Terms] AND "oral cavity"[All Fields]',
  '"elective neck dissection"[All Fields] AND "oral cancer"[All Fields]',
  '"selective neck dissection"[All Fields] AND "levels"[All Fields]',
  '"reconstructive surgical procedures"[MeSH Terms] AND "head and neck"[All Fields]',
  '"radial forearm free flap"[All Fields]',
  '"anterolateral thigh flap"[All Fields]',
  '"fibula free flap"[All Fields] AND "mandible"[All Fields]',
  '"scapula free flap"[All Fields]',
  '"jejunal free flap"[All Fields] AND "pharynx"[All Fields]',
  '"pectoralis major flap"[All Fields]',
  '"submental flap"[All Fields]',
  '"supraclavicular flap"[All Fields]',
  '"deltopectoral flap"[All Fields]',
  '"platysma flap"[All Fields]',
  '"virtual surgical planning"[All Fields] AND "mandible"[All Fields]',
  '"3D printing"[All Fields] AND "head and neck reconstruction"[All Fields]',
  '"patient-specific implants"[All Fields] AND "craniofacial"[All Fields]',
  '"dental rehabilitation"[All Fields] AND "head and neck cancer"[All Fields]',
  '"speech rehabilitation"[All Fields] AND "head and neck cancer"[All Fields]',
  '"swallowing rehabilitation"[All Fields] AND "head and neck cancer"[All Fields]',
  '"survivorship"[All Fields] AND "head and neck cancer"[All Fields]',
  '"quality of life"[MeSH Terms] AND "head and neck neoplasms"[MeSH Terms]',
  '"palliative care"[MeSH Terms] AND "head and neck"[All Fields]',
  '"feeding tube"[All Fields] AND "head and neck cancer"[All Fields]',
  '"gastrostomy"[MeSH Terms] AND "head and neck"[All Fields]',
  '"lymphedema"[MeSH Terms] AND "head and neck"[All Fields]',
  '"shoulder dysfunction"[All Fields] AND "neck dissection"[All Fields]',
  '"spinal accessory nerve"[MeSH Terms] AND "preservation"[All Fields]',
  '"chyle leak"[All Fields] AND "neck dissection"[All Fields]',
  '"thoracic duct"[MeSH Terms] AND "injury"[All Fields] AND "neck"[All Fields]',
  '"carotid blowout syndrome"[All Fields]',
  '"pharyngocutaneous fistula"[All Fields]',
  '"wound dehiscence"[All Fields] AND "head and neck"[All Fields]',
  '"flap failure"[All Fields] AND "head and neck"[All Fields]',
  '"frey syndrome"[All Fields]',
  '"first bite syndrome"[All Fields]',
  '"gustatory sweating"[All Fields]',
  '"neck hematoma"[All Fields] AND "thyroidectomy"[All Fields]',
  '"hypocalcemia"[MeSH Terms] AND "thyroidectomy"[All Fields]',
  '"recurrent laryngeal nerve monitoring"[All Fields]',
  '"superior laryngeal nerve"[MeSH Terms] AND "injury"[All Fields]',
  '"thyroid lobectomy"[All Fields]',
  '"completion thyroidectomy"[All Fields]',
  '"central compartment neck dissection"[All Fields]',
  '"lateral neck dissection"[All Fields] AND "thyroid"[All Fields]',
  '"thyroid incidentaloma"[All Fields]',
  '"Bethesda system"[All Fields] AND "thyroid cytology"[All Fields]',
  '"fine needle aspiration"[MeSH Terms] AND "thyroid"[MeSH Terms]',
  '"molecular testing"[All Fields] AND "thyroid nodule"[All Fields]',
  '"Afirma"[All Fields] AND "thyroid"[All Fields]',
  '"ThyroSeq"[All Fields]',
  '"differentiated thyroid cancer"[All Fields]',
  '"papillary thyroid carcinoma"[MeSH Terms]',
  '"follicular thyroid carcinoma"[All Fields]',
  '"hurthle cell carcinoma"[All Fields]',
  '"anaplastic thyroid carcinoma"[MeSH Terms]',
  '"thyroid lymphoma"[All Fields]',
  '"thyroglobulin"[MeSH Terms] AND "surveillance"[All Fields]',
  '"RAI refractory"[All Fields] AND "thyroid cancer"[All Fields]',
  '"lenvatinib"[All Fields] AND "thyroid"[All Fields]',
  '"sorafenib"[All Fields] AND "thyroid"[All Fields]',
  '"parathyroidectomy"[MeSH Terms]',
  '"primary hyperparathyroidism"[MeSH Terms] AND "surgery"[All Fields]',
  '"secondary hyperparathyroidism"[MeSH Terms] AND "surgery"[All Fields]',
  '"minimally invasive parathyroidectomy"[All Fields]',
  '"intraoperative PTH monitoring"[All Fields]',
  '"parathyroid autotransplantation"[All Fields]',
  '"parathyroid carcinoma"[MeSH Terms]',
  '"four-dimensional CT"[All Fields] AND "parathyroid"[All Fields]',
  '"sestamibi scan"[All Fields] AND "parathyroid"[All Fields]',
  '"ectopic parathyroid"[All Fields]',
  '"laryngeal electromyography"[All Fields]',
  '"stroboscopy"[MeSH Terms]',
  '"videostroboscopy"[All Fields]',
  '"high-speed laryngeal imaging"[All Fields]',
  '"narrow band imaging"[All Fields] AND "larynx"[All Fields]',
  '"laryngeal leukoplakia"[All Fields]',
  '"laryngeal papilloma"[All Fields]',
  '"vocal fold cyst"[All Fields]',
  '"vocal fold polyp"[All Fields]',
  '"vocal fold nodule"[All Fields]',
  '"vocal fold hemorrhage"[All Fields]',
  '"vocal fold scar"[All Fields]',
  '"sulcus vocalis"[All Fields]',
  '"laryngeal web"[All Fields]',
  '"subglottic hemangioma"[All Fields]',
  '"posterior glottic stenosis"[All Fields]',
  '"bilateral vocal fold paralysis"[All Fields]',
  '"arytenoid adduction"[All Fields]',
  '"injection laryngoplasty"[All Fields]',
  '"type I thyroplasty"[All Fields]',
  '"medialization laryngoplasty"[All Fields]',
  '"posterior cordotomy"[All Fields]',
  '"arytenoidectomy"[All Fields]',
  '"cricoid split"[All Fields]',
  '"laryngeal transplantation"[All Fields]',
  '"phonosurgery"[All Fields]',
  '"laser arytenoidectomy"[All Fields]',
  '"office-based laryngeal procedures"[All Fields]',
  '"awake laryngeal surgery"[All Fields]',
  '"KTP laser"[All Fields] AND "larynx"[All Fields]',
  '"pulsed dye laser"[All Fields] AND "larynx"[All Fields]',
  '"CO2 laser"[All Fields] AND "laryngeal surgery"[All Fields]',
  '"blue laser"[All Fields] AND "larynx"[All Fields]',
  '"transoral laser microsurgery"[All Fields]',
  '"transoral robotic surgery"[All Fields] AND "oropharynx"[All Fields]',
  '"transoral robotic surgery"[All Fields] AND "supraglottis"[All Fields]',
  '"endoscopic laryngopharyngeal surgery"[All Fields]',
  '"cricopharyngeal myotomy"[All Fields]',
  '"zenker diverticulum"[All Fields] AND "endoscopic"[All Fields]',
  '"pharyngeal pouch"[All Fields] AND "treatment"[All Fields]',
  '"killian-jamieson diverticulum"[All Fields]',
  '"eosinophilic esophagitis"[MeSH Terms] AND "ENT"[All Fields]',
  '"gastroesophageal reflux"[MeSH Terms] AND "laryngitis"[All Fields]',
  '"pH monitoring"[All Fields] AND "laryngopharyngeal"[All Fields]',
  '"impedance testing"[All Fields] AND "reflux"[All Fields]',
  '"pepsin"[All Fields] AND "laryngopharyngeal reflux"[All Fields]',
  '"proton pump inhibitors"[MeSH Terms] AND "laryngopharyngeal reflux"[All Fields]',
  '"Nissen fundoplication"[All Fields] AND "laryngopharyngeal reflux"[All Fields]',
  '"laryngeal mask airway"[MeSH Terms]',
  '"jet ventilation"[All Fields] AND "laryngeal surgery"[All Fields]',
  '"apneic oxygenation"[All Fields] AND "laryngoscopy"[All Fields]',
  '"THRIVE"[All Fields] AND "airway"[All Fields]',
  '"high-flow nasal oxygen"[All Fields] AND "laryngoscopy"[All Fields]',
  '"difficult airway"[All Fields] AND "head and neck"[All Fields]',
  '"awake intubation"[All Fields] AND "head and neck"[All Fields]',
  '"emergency airway"[All Fields] AND "head and neck"[All Fields]',
  '"cricothyrotomy"[MeSH Terms]',
  '"percutaneous tracheostomy"[All Fields]',
  '"open tracheostomy"[All Fields] AND "technique"[All Fields]',
  '"tracheostomy tube"[All Fields] AND "management"[All Fields]',
  '"speaking valve"[All Fields] AND "tracheostomy"[All Fields]',
  '"Passy-Muir valve"[All Fields]',
  '"tracheal stenosis"[MeSH Terms]',
  '"tracheal resection"[All Fields] AND "anastomosis"[All Fields]',
  '"tracheal reconstruction"[All Fields]',
  '"tracheal stent"[All Fields]',
  '"Montgomery T-tube"[All Fields]',
  '"laryngeal stent"[All Fields]',
  '"double lumen endotracheal"[All Fields] AND "airway"[All Fields]',
  '"balloon dilation"[All Fields] AND "subglottic stenosis"[All Fields]',
  '"mitomycin C"[All Fields] AND "laryngotracheal stenosis"[All Fields]',
  '"posterior cricoid split"[All Fields]',
  '"laryngotracheoplasty"[All Fields]',
  '"single-stage laryngotracheal reconstruction"[All Fields]',
  '"double-stage laryngotracheal reconstruction"[All Fields]',
  '"slide tracheoplasty"[All Fields]',
  '"complete tracheal rings"[All Fields]',
  '"tracheoesophageal fistula"[MeSH Terms]',
  '"laryngeal atresia"[All Fields]',
  '"congenital high airway obstruction syndrome"[All Fields]',
  '"EXIT procedure"[All Fields] AND "airway"[All Fields]',
  '"microlaryngoscopy"[All Fields]',
  '"suspension laryngoscopy"[All Fields]',
  '"direct laryngoscopy"[MeSH Terms] AND "pediatric"[All Fields]',
  '"airway fluoroscopy"[All Fields]',
  '"sleep nasendoscopy"[All Fields]',
  '"cine MRI"[All Fields] AND "airway"[All Fields]',
  '"dynamic airway CT"[All Fields]',
  '"pediatric tracheostomy"[All Fields]',
  '"neonatal stridor"[All Fields]',
  '"vallecular cyst"[All Fields]',
  '"lingual thyroid"[MeSH Terms]',
  '"ectopic thyroid"[All Fields]',
  '"thyroid hemiagenesis"[All Fields]',
  '"congenital neck mass"[All Fields]',
  '"second branchial cleft cyst"[All Fields]',
  '"third branchial pouch sinus"[All Fields]',
  '"fourth branchial pouch sinus"[All Fields]',
  '"preauricular sinus"[All Fields]',
  '"preauricular pit"[All Fields]',
  '"first branchial cleft anomaly"[All Fields]',
  '"torticollis"[MeSH Terms] AND "pediatric"[All Fields]',
  '"sternocleidomastoid tumor"[All Fields]',
  '"fibromatosis colli"[All Fields]',
  '"ranula"[MeSH Terms] AND "plunging"[All Fields]',
  '"deep neck space anatomy"[All Fields]',
  '"parapharyngeal space"[All Fields] AND "tumors"[All Fields]',
  '"infratemporal fossa"[All Fields] AND "surgery"[All Fields]',
  '"pterygopalatine fossa"[All Fields] AND "approach"[All Fields]',
  '"middle ear effusion"[All Fields] AND "nasopharyngeal carcinoma"[All Fields]',
  '"congenital subglottic stenosis"[All Fields]',
  '"acquired subglottic stenosis"[All Fields]',
  '"idiopathic subglottic stenosis"[All Fields]',
  '"cotton-myer grading"[All Fields]',
  '"anterior cricoid split"[All Fields]',
  '"tongue tie"[All Fields] AND "ankyloglossia"[All Fields]',
  '"ankyloglossia"[MeSH Terms]',
  '"frenuloplasty"[All Fields]',
  '"neonatal tongue tie"[All Fields] AND "breastfeeding"[All Fields]',
  '"upper lip tie"[All Fields]',
  '"short frenulum"[All Fields] AND "speech"[All Fields]',
  '"macroglossia"[MeSH Terms]',
  '"beckwith-wiedemann"[All Fields] AND "macroglossia"[All Fields]',
  '"geographic tongue"[MeSH Terms]',
  '"oral hairy leukoplakia"[MeSH Terms]',
  '"oral candidiasis"[MeSH Terms] AND "management"[All Fields]',
  '"aphthous stomatitis"[MeSH Terms]',
  '"angular cheilitis"[MeSH Terms]',
  '"burning mouth syndrome"[MeSH Terms]',
  '"taste disorders"[MeSH Terms]',
  '"ageusia"[MeSH Terms]',
  '"dysgeusia"[MeSH Terms]',
  '"oral submucous fibrosis"[MeSH Terms]',
  '"leukoplakia, oral"[MeSH Terms]',
  '"erythroplakia"[All Fields]',
  '"oral lichen planus"[MeSH Terms]',
  '"pemphigus"[MeSH Terms] AND "oral"[All Fields]',
  '"granular cell tumor"[MeSH Terms] AND "tongue"[All Fields]',
  '"mucosal melanoma"[All Fields] AND "oral cavity"[All Fields]',
  '"ameloblastoma"[MeSH Terms]',
  '"keratocystic odontogenic tumor"[All Fields]',
  '"giant cell granuloma"[All Fields] AND "jaw"[All Fields]',
  '"dentigerous cyst"[MeSH Terms]',
  '"periapical cyst"[MeSH Terms]',
  '"osteoradionecrosis"[All Fields] AND "jaw"[All Fields]',
  '"medication-related osteonecrosis jaw"[All Fields]',
  '"mandibular osteoradionecrosis"[All Fields] AND "hyperbaric oxygen"[All Fields]',
  '"facial bone fractures"[MeSH Terms]',
  '"naso-orbital-ethmoid fracture"[All Fields]',
  '"frontal sinus fracture"[All Fields]',
  '"temporal bone fracture"[All Fields] AND "facial nerve"[All Fields]',
  '"condylar fracture"[All Fields] AND "mandible"[All Fields]',
  '"subcondylar fracture"[All Fields]',
  '"panfacial fracture"[All Fields]',
  '"midface fracture"[All Fields] AND "reconstruction"[All Fields]',
  '"blow-in fracture"[All Fields] AND "orbit"[All Fields]',
  '"medial wall fracture"[All Fields] AND "orbit"[All Fields]',
  '"zygomatic arch fracture"[All Fields]',
  '"tripod fracture"[All Fields]',
  '"maxillary buttress"[All Fields] AND "fracture"[All Fields]',
  '"dentoalveolar fracture"[All Fields]',
  '"palatal fracture"[All Fields]',
  '"laryngeal fracture"[All Fields]',
  '"tracheal injury"[All Fields] AND "trauma"[All Fields]',
  '"penetrating neck trauma"[All Fields]',
  '"blunt neck trauma"[All Fields]',
  '"vascular injury"[All Fields] AND "neck"[All Fields]',
  '"zone classification"[All Fields] AND "neck trauma"[All Fields]',
  '"carotid injury"[All Fields] AND "trauma"[All Fields]',
  '"esophageal perforation"[All Fields] AND "neck"[All Fields]',
  '"Zenker diverticulum"[All Fields] AND "stapler"[All Fields]',
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
  "otomycosis fungal otitis externa treatment",
  "malignant otitis externa skull base osteomyelitis",
  "tympanic membrane perforation closure paper patch",
  "mixed hearing loss ossicular chain discontinuity",
  "single sided deafness management options",
  "bilateral cochlear implantation outcomes adults",
  "bilateral cochlear implantation children sequential",
  "electric acoustic stimulation hybrid cochlear implant",
  "cochlear implant MRI compatibility safety",
  "cochlear implant electrode array perimodiolar",
  "endolymphatic sac decompression Meniere outcomes",
  "vestibular migraine prophylaxis treatment",
  "benign paroxysmal positional vertigo horizontal canal",
  "Semont maneuver BPPV posterior canal",
  "Lempert maneuver horizontal canal BPPV",
  "persistent postural perceptual dizziness PPPD",
  "motion sickness vestibular habituation",
  "mal de debarquement syndrome",
  "bilateral vestibulopathy diagnosis rehabilitation",
  "oscillopsia vestibular loss bilateral",
  "superior canal dehiscence autophony",
  "tullio phenomenon sound induced vertigo",
  "perilymph fistula stapes surgery complication",
  "round window membrane rupture",
  "temporal bone histopathology otosclerosis",
  "otosclerosis fenestral retrofenestral CT",
  "stapes prosthesis fluoroplastic titanium",
  "revision stapedectomy stapes surgery",
  "labyrinthine fistula cholesteatoma management",
  "congenital cholesteatoma petrous bone",
  "canal wall up vs down cholesteatoma recidivism",
  "second look surgery cholesteatoma",
  "diffusion weighted MRI cholesteatoma recurrence",
  "tympanoplasty cartilage vs fascia graft",
  "type III tympanoplasty columella",
  "PORP TORP ossicular prosthesis outcomes",
  "chronic suppurative otitis media management",
  "aural polyp granulation tissue middle ear",
  "tuberculous otitis media",
  "acute mastoiditis complications pediatric",
  "coalescent mastoiditis Bezold abscess",
  "Gradenigo syndrome petrous apicitis",
  "sigmoid sinus thrombosis otitis",
  "otitic hydrocephalus",
  "brain abscess otogenic origin",
  "labyrinthine ossificans cochlear implant",
  "far advanced otosclerosis cochlear implant",
  "connexin 26 GJB2 hearing loss genetics",
  "CMV congenital cytomegalovirus hearing loss",
  "enlarged vestibular aqueduct SLC26A4 Pendred",
  "auditory processing disorder dichotic listening",
  "frequency following response speech ABR",
  "extended high frequency audiometry ototoxicity",
  "distortion product otoacoustic emissions DPOAE",
  "transient evoked otoacoustic emissions TEOAE",
  "electrocochleography summating potential Meniere",
  "cervical VEMP saccule function",
  "ocular VEMP utricle function",
  "video head impulse test vHIT",
  "rotary chair testing vestibular function",
  "computerized dynamic posturography balance",
  "caloric testing irrigation technique",
  "videonystagmography spontaneous positional",
  "Dix-Hallpike maneuver technique",
  "tinnitus sound therapy masking",
  "tinnitus neuromodulation treatment",
  "tinnitus questionnaire assessment THI",
  "pulsatile tinnitus sigmoid sinus dehiscence",
  "pulsatile tinnitus dural arteriovenous fistula",
  "objective tinnitus palatal myoclonus",
  "ear fullness aural pressure treatment",
  "patulous eustachian tube diagnosis",
  "eustachian tube function testing Valsalva",
  "myringotomy ventilation tube types",
  "T-tube long term ventilation ear",
  "granulation tissue ventilation tube otorrhea",
  "eardrum perforation spontaneous closure rate",
  "fat plug myringoplasty office procedure",
  "endoscopic myringoplasty transcanal",
  "endoscopic tympanoplasty advantages limitations",
  "endoscopic stapedotomy transcanal approach",
  "endoscopic cholesteatoma surgery outcomes",
  "powered endoscopic ear surgery drill",
  "fully endoscopic ear surgery FEES",
  "otoendoscopy training simulation",
  "3D endoscopic ear surgery",
  "gene therapy inner ear hair cell regeneration",
  "stem cell therapy sensorineural hearing loss",
  "hair cell regeneration Atoh1 gene",
  "ribbon synapse cochlear synaptopathy hidden hearing loss",
  "noise notch audiogram 4kHz dip",
  "occupational noise exposure hearing conservation",
  "hearing protection devices noise reduction rating",
  "military blast exposure hearing loss tinnitus",
  "recreational noise hearing loss earbuds",
  "age-related hearing loss central presbycusis",
  "cognitive decline hearing loss association",
  "hearing aid fitting verification real ear measurement",
  "open fit hearing aid dome receiver canal",
  "completely-in-canal hearing aid CIC",
  "implantable hearing device active middle ear",
  "bone conduction spectacles hearing aid",
  "contralateral routing of signal CROS BiCROS",
  "frequency lowering hearing aid technology",
  "telehealth audiology remote hearing aid",
  "aural rehabilitation communication strategies",
  "auditory verbal therapy children hearing loss",
  "sign language cochlear implant bilingual",
  "hearing assistive technology FM system Roger",
  "captioning assistive listening devices",
  "hearing loop induction system telecoil",
  "Baha Connect Attract transcutaneous percutaneous",
  "Osia 2 active transcutaneous bone conduction",
  "Bonebridge active bone conduction implant",
  "vibrant soundbridge round window application",
  "Esteem totally implantable hearing device",
  "Envoy Acclaim fully implantable",
  "auditory brainstem implant NF2 outcomes",
  "auditory midbrain implant",
  "nasal septal hematoma abscess management",
  "nasal packing alternatives epistaxis",
  "posterior epistaxis sphenopalatine artery ligation",
  "anterior ethmoidal artery ligation epistaxis",
  "embolization epistaxis interventional radiology",
  "hereditary hemorrhagic telangiectasia Osler Weber Rendu",
  "juvenile nasopharyngeal angiofibroma embolization staging",
  "nasal dermoid sinus cyst pediatric",
  "nasal glioma heterotopic brain tissue",
  "pyriform aperture stenosis congenital",
  "congenital nasal piriform aperture stenosis",
  "dacryocystorhinostomy endoscopic external",
  "nasolacrimal duct obstruction management",
  "functional endoscopic sinus surgery technique",
  "powered instrumentation microdebrider sinus",
  "coblation turbinate reduction outcomes",
  "radiofrequency turbinate volumetric reduction",
  "vibratory knife turbinate outfracture submucosal",
  "concha bullosa middle turbinate pneumatization",
  "paradoxical middle turbinate contact point headache",
  "sinus headache vs migraine rhinogenic",
  "contact point headache Sluder neuralgia",
  "sinonasal fibrous dysplasia ossifying fibroma",
  "sinonasal osteoma frontal ethmoid",
  "antrochoanal polyp Killian polyp",
  "ethmoidal polyp bilateral CRS pathology",
  "biofilm chronic rhinosinusitis treatment",
  "topical antibiotics chronic rhinosinusitis",
  "culture directed therapy chronic sinusitis",
  "sinus surgery navigation electromagnetic optical",
  "CT sinus anatomy Lund-Mackay scoring",
  "cone beam CT sinus imaging office",
  "MRI sinonasal tumor vs polyps differentiation",
  "sinonasal papilloma Krouse staging inverted",
  "adenocarcinoma sinonasal woodworker exposure",
  "sinonasal hemangiopericytoma glomangiopericytoma",
  "olfactory neuroblastoma Kadish staging",
  "skull base defect reconstruction nasoseptal flap",
  "Hadad-Bassagasteguy flap skull base repair",
  "pericranial flap skull base reconstruction",
  "intrathecal fluorescein CSF leak localization",
  "lumbar drain skull base surgery CSF",
  "spontaneous CSF leak skull base obesity",
  "tegmen defect encephalocele middle ear",
  "lateral skull base surgery infratemporal fossa",
  "middle fossa approach acoustic neuroma hearing",
  "retrosigmoid craniotomy vestibular schwannoma",
  "translabyrinthine approach vestibular schwannoma",
  "radiosurgery Gamma Knife vestibular schwannoma",
  "CyberKnife stereotactic radiotherapy acoustic neuroma",
  "wait and scan vestibular schwannoma conservative",
  "NF2 neurofibromatosis bilateral vestibular schwannoma",
  "facial nerve schwannoma management dilemma",
  "jugular foramen tumor surgery approach",
  "vagal paraganglioma glomus vagale",
  "carotid body tumor Shamblin classification",
  "temporal bone malignancy squamous cell carcinoma",
  "external auditory canal carcinoma Pittsburg staging",
  "middle ear adenoma neuroendocrine",
  "endolymphatic sac tumor von Hippel-Lindau",
  "petrous apex lesion differential diagnosis",
  "cholesterol granuloma petrous apex approach",
  "petrous apex cephalocele",
  "encephalocele temporal bone tegmen repair",
  "meningioma cerebellopontine angle management",
  "epidermoid cyst cerebellopontine angle",
  "arachnoid cyst posterior fossa hearing",
  "microvascular decompression hemifacial spasm",
  "hemifacial spasm botulinum toxin treatment",
  "trigeminal neuralgia ENT differential diagnosis",
  "glossopharyngeal neuralgia treatment",
  "superior laryngeal neuralgia diagnosis",
  "occipital neuralgia greater occipital nerve",
  "Eagle syndrome stylohyoid ligament calcification",
  "styloid process elongation symptoms",
  "temporomandibular joint disorder ENT overlap",
  "TMJ dysfunction ear pain otalgia referred",
  "otalgia referred pain differential diagnosis",
  "ear pain without otologic cause evaluation",
  "preauricular sinus infection management",
  "preauricular tag removal cosmetic functional",
  "accessory tragus first branchial arch",
  "microtia Nagata technique costal cartilage",
  "microtia Medpor implant reconstruction",
  "ear prosthesis osseointegrated implant auricular",
  "prominent ear otoplasty correction technique",
  "cryptotia buried ear deformity correction",
  "Stahl ear surgical correction",
  "constricted ear lop ear surgery",
  "ear keloid treatment prevention",
  "auricular hematoma cauliflower ear drainage",
  "auricular perichondritis relapsing polychondritis",
  "external ear burns frostbite reconstruction",
  "skin cancer pinna Mohs reconstruction",
  "conchal bowl resection local flap",
  "total auriculectomy prosthetic rehabilitation",
  "nasal tip reconstruction bilobed flap",
  "nasal ala reconstruction melolabial flap",
  "nasal dorsum reconstruction paramedian forehead flap",
  "full thickness skin graft nasal defect",
  "composite graft alar rim reconstruction",
  "septal pivot flap nasal reconstruction",
  "blepharoplasty upper lower eyelid surgery",
  "browlift endoscopic coronal direct",
  "facelift rhytidectomy deep plane SMAS",
  "neck lift platysmaplasty cervicoplasty",
  "chin augmentation genioplasty mentoplasty",
  "malar augmentation cheek implant",
  "fat grafting facial rejuvenation",
  "botulinum toxin cosmetic facial wrinkles",
  "filler injection hyaluronic acid face",
  "thread lift facial rejuvenation outcomes",
  "chemical peel facial resurfacing depth",
  "laser skin resurfacing CO2 erbium",
  "fractional laser therapy facial scarring",
  "microneedling platelet-rich plasma facial",
  "scar revision facial laceration keloid",
  "dermabrasion facial scar treatment",
  "tissue expansion facial reconstruction",
  "local flap facial reconstruction advancement rotation",
  "free flap facial defect reconstruction",
  "teeth-in-a-day zygomatic implants maxillectomy",
  "palatal obturator maxillectomy prosthesis",
  "total maxillectomy orbital floor reconstruction",
  "infrastructure maxillectomy medial wall",
  "extended maxillectomy skull base approach",
  "craniofacial resection anterior skull base tumor",
  "orbital exenteration indication technique",
  "enucleation evisceration orbital tumor",
  "transconjunctival approach orbital floor",
  "subciliary approach orbital fracture",
  "lynch incision frontoethmoidectomy",
  "Caldwell-Luc antrostomy maxillary sinus",
  "canine fossa puncture maxillary sinus",
  "inferior meatal antrostomy nasolacrimal duct",
  "vidian neurectomy vasomotor rhinitis",
  "posterior nasal nerve resection rhinitis",
  "cryotherapy posterior nasal nerve",
  "clarifix cryotherapy rhinitis device",
  "posterior nasal nerve ablation allergic rhinitis",
  "sublingual immunotherapy grass pollen",
  "subcutaneous immunotherapy venom allergy",
  "allergen specific immunotherapy dust mite rhinitis",
  "omalizumab allergic rhinitis asthma",
  "anti-IgE therapy allergic rhinitis",
  "aeroallergen sensitization patterns geographic",
  "unified airway disease rhinitis asthma",
  "aspirin desensitization AERD protocol",
  "Samter triad aspirin sensitivity nasal polyps",
  "eosinophilic esophagitis aerodigestive",
  "laryngeal sensory neuropathy chronic cough",
  "chronic cough laryngeal hypersensitivity",
  "paradoxical vocal fold movement dysfunction",
  "exercise induced laryngeal obstruction EILO",
  "inducible laryngeal obstruction diagnosis",
  "continuous laryngoscopy exercise test CLE",
  "supraglottic collapse exercise laryngeal",
  "laryngeal botulinum toxin injection adductor",
  "abductor spasmodic dysphonia treatment",
  "essential voice tremor treatment",
  "puberphonia mutational falsetto treatment",
  "transgender voice therapy surgery",
  "voice feminization surgery glottoplasty",
  "voice masculinization testosterone effects",
  "singing voice specialist vocal pedagogy",
  "performer voice care occupational",
  "teacher voice disorder occupational dysphonia",
  "voice rest guidelines postoperative vocal fold",
  "steroid injection vocal fold edema",
  "hyaluronic acid injection vocal fold augmentation",
  "calcium hydroxylapatite vocal fold injection",
  "fat injection vocal fold paralysis",
  "collagen injection vocal fold medialization",
  "Gore-Tex thyroplasty medialization",
  "Montgomery implant thyroplasty",
  "arytenoid adduction suture technique",
  "cricoarytenoid joint arthrodesis fixation",
  "posterior cordotomy CO2 laser bilateral paralysis",
  "botulinum toxin vocal fold granuloma",
  "laryngeal granuloma intubation contact",
  "postcricoid web iron deficiency Plummer Vinson",
  "Plummer-Vinson syndrome Patterson-Kelly",
  "cricopharyngeal bar prominent cricopharyngeus",
  "Zenker diverticulum open vs endoscopic",
  "Zenker diverticulum stapler diverticulotomy",
  "flexible endoscopic Zenker diverticulum",
  "killian dehiscence Zenker pathophysiology",
  "lateral pharyngeal diverticulum",
  "pharyngeal constrictor spasm",
  "cricopharyngeal botulinum toxin injection dysphagia",
  "FEES fiberoptic endoscopic evaluation swallowing",
  "videofluoroscopic swallowing study VFSS",
  "high resolution manometry pharyngeal swallowing",
  "pharyngeal manometry esophageal motility",
  "aspiration pneumonia prevention head neck cancer",
  "silent aspiration detection penetration scale",
  "supraglottic swallow compensatory strategy",
  "Mendelsohn maneuver swallowing exercise",
  "Shaker exercise head lift swallowing",
  "pharyngeal electrical stimulation dysphagia",
  "neuromuscular electrical stimulation swallowing",
  "expiratory muscle strength training swallowing",
  "Provox voice prosthesis maintenance",
  "tracheoesophageal speech alaryngeal communication",
  "total laryngectomy quality of life outcomes",
  "partial laryngectomy organ preservation",
  "supraglottic laryngectomy open endoscopic",
  "supracricoid partial laryngectomy CHP CHEP",
  "vertical partial laryngectomy hemilaryngectomy",
  "near total laryngectomy Pearson",
  "laryngopharyngectomy circumferential defect",
  "neopharynx reconstruction gastric pull-up",
  "jejunal free flap pharyngeal reconstruction",
  "tubed radial forearm flap neopharynx",
  "voice outcomes transoral laser microsurgery",
  "swallowing outcomes transoral robotic surgery",
  "functional outcomes primary vs salvage laryngectomy",
  "stomal recurrence laryngectomy prevention",
  "hypothyroidism post radiation head neck",
  "dysphagia post radiation head neck fibrosis",
  "xerostomia salivary gland transfer submandibular",
  "intensity modulated radiation therapy parotid sparing",
  "proton therapy dosimetry head neck reduction toxicity",
  "osteoradionecrosis pentoxifylline tocopherol",
  "hyperbaric oxygen therapy osteoradionecrosis jaw",
  "mandibular reconstruction plate vs fibula criteria",
  "dental implants irradiated mandible fibula flap",
  "obturator prosthesis maxillary defect classification",
  "speech intelligibility head neck cancer treatment",
  "PEG gastrostomy tube management head neck",
  "prophylactic gastrostomy head neck chemoradiation",
  "nutrition support head neck cancer treatment",
  "weight loss cachexia head neck cancer",
  "shoulder rehabilitation accessory nerve sacrifice",
  "internal jugular vein ligation bilateral safety",
  "chylous fistula thoracic duct neck surgery",
  "marginal mandibular nerve injury neck dissection",
  "great auricular nerve preservation parotidectomy",
  "sternocleidomastoid muscle flap reconstruction",
  "platysma muscle flap oral cavity",
  "supraclavicular artery island flap head neck",
  "internal mammary artery perforator flap",
  "anterolateral thigh perforator flap chimeric",
  "scapular parascapular flap oromandibular",
  "iliac crest free flap mandible reconstruction",
  "osteocutaneous radial forearm free flap",
  "medial sural artery perforator flap",
  "gracilis free functional muscle transfer",
  "latissimus dorsi flap scalp reconstruction",
  "temporoparietal fascia flap ear reconstruction",
  "fascial flap skull base reconstruction",
  "AlloDerm acellular dermal matrix head neck",
  "titanium mesh cranioplasty reconstruction",
  "polyetheretherketone PEEK craniofacial implant",
  "computer aided design manufacturing CAD CAM jaw",
  "surgical navigation intraoperative CT head neck",
  "fluorescence guided surgery head neck ICG",
  "narrow band imaging NBI laryngeal lesion detection",
  "transnasal esophagoscopy TNE office based",
  "unsedated office endoscopy laryngeal biopsy",
  "office based laser laryngeal surgery KTP",
  "in-office balloon dilation subglottic stenosis",
  "in-office vocal fold injection medialization",
  "awake tracheoscopy subglottic stenosis assessment",
  "sleep apnea hypopnea index AHI severity",
  "polysomnography scoring AASM rules",
  "home sleep apnea testing HSAT limitations",
  "DISE drug induced sleep endoscopy VOTE classification",
  "Muller maneuver nasopharyngoscopy sleep apnea",
  "upper airway stimulation therapy outcomes long term",
  "expansion sphincter pharyngoplasty ESP outcomes",
  "lateral pharyngoplasty sleep apnea Cahali",
  "relocation pharyngoplasty technique outcomes",
  "palatal advancement pharyngoplasty sleep apnea",
  "pillar implant palatal stiffening sleep apnea",
  "radiofrequency ablation soft palate sleep apnea",
  "transpalatal advancement pharyngoplasty",
  "genioglossus advancement sleep apnea outcomes",
  "hyoid myotomy suspension sleep disordered breathing",
  "tongue base suspension Repose system",
  "lingual tonsillectomy sleep apnea TORS coblation",
  "epiglottic collapse sleep apnea epiglottopexy",
  "partial epiglottectomy sleep apnea",
  "bariatric surgery sleep apnea resolution",
  "positional therapy sleep apnea device",
  "myofunctional therapy orofacial sleep apnea",
  "oral appliance mandibular advancement efficacy",
  "combination therapy CPAP oral appliance",
  "pediatric sleep disordered breathing behavior cognition",
  "pediatric OSA polysomnography criteria diagnosis",
  "adenotonsillectomy pediatric OSA persistent residual",
  "drug induced sleep endoscopy children persistent OSA",
  "rapid maxillary expansion pediatric sleep apnea",
  "orthodontic treatment mandibular advancement pediatric",
  "Down syndrome obstructive sleep apnea management",
  "Pierre Robin airway management neonatal",
  "Treacher Collins syndrome airway management",
  "craniofacial microsomia hemifacial microsomia Goldenhar",
  "CHARGE syndrome choanal atresia management",
  "Apert Crouzon craniosynostosis midface advancement",
  "laryngeal cleft type 1 2 3 4 classification",
  "posterior laryngeal cleft injection augmentation",
  "laryngeal cleft endoscopic repair injection",
  "congenital subglottic hemangioma propranolol",
  "infantile hemangioma propranolol airway",
  "recurrent croup subglottic stenosis evaluation",
  "caustic ingestion esophageal stricture pediatric",
  "button battery esophageal injury management",
  "coin ingestion esophageal foreign body pediatric",
  "airway foreign body rigid bronchoscopy removal",
  "peanut aspiration foreign body management",
  "organic vs inorganic foreign body airway",
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
