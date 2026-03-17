import { Router, type IRouter } from "express";
import { db, documentsTable, documentChunksTable, llmConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const ENT_KNOWLEDGE_BASE = [
  {
    title: "Pure Tone Audiometry - Complete Guide",
    category: "ent-audiometry",
    content: `Pure Tone Audiometry (PTA) is the gold standard for hearing assessment. It measures hearing sensitivity across frequencies from 250Hz to 8000Hz.

PROCEDURE:
1. Patient sits in a sound-treated booth wearing calibrated headphones (supra-aural or insert earphones)
2. Air conduction (AC) thresholds tested first: Present tones at each frequency, starting at 1000Hz, then 2000, 4000, 8000, then 500, 250Hz
3. Use modified Hughson-Westlake technique: decrease by 10dB after response, increase by 5dB after no response. Threshold = lowest level with 2/3 correct responses
4. Bone conduction (BC) tested with oscillator on mastoid process at 250-4000Hz
5. Masking applied to non-test ear when needed (plateau method)

AUDIOGRAM INTERPRETATION:
- Normal hearing: 0-25 dB HL across all frequencies
- Mild loss: 26-40 dB HL
- Moderate loss: 41-55 dB HL
- Moderately severe: 56-70 dB HL
- Severe loss: 71-90 dB HL
- Profound loss: >90 dB HL

HEARING LOSS TYPES:
1. Conductive: Air-bone gap ≥15dB, BC normal. Causes: otitis media, otosclerosis, TM perforation, ossicular discontinuity, cerumen impaction
2. Sensorineural (SNHL): AC and BC equally depressed, no air-bone gap. Causes: presbycusis, noise-induced, Meniere's disease, acoustic neuroma, ototoxicity
3. Mixed: Both conductive and sensorineural components. BC elevated + air-bone gap present

AUDIOGRAM CONFIGURATIONS:
- Flat: Equal loss across frequencies (otosclerosis, middle ear effusion)
- Sloping: Worse at high frequencies (presbycusis, noise-induced)
- Rising: Worse at low frequencies (Meniere's disease)
- Cookie-bite: Worse at mid frequencies (genetic SNHL)
- Notch at 4kHz: Noise-induced hearing loss (NIHL)
- Corner audiogram: Profound loss, residual hearing only at 250-500Hz

SYMBOLS:
- Right ear AC: O (red), BC: < or [
- Left ear AC: X (blue), BC: > or ]
- Masked AC: Triangle (right), Square (left)
- No response: Arrow pointing down from symbol

SPEECH AUDIOMETRY:
- Speech Reception Threshold (SRT): Lowest level at which 50% of spondee words recognized. Should agree within ±10dB of PTA (average of 500, 1000, 2000Hz)
- Word Recognition Score (WRS): Percentage of phonetically balanced words correctly repeated at suprathreshold level. >92% = excellent, 76-92% = good, 60-76% = fair, <60% = poor

CLINICAL PEARLS:
- Always compare SRT to PTA for internal consistency
- Asymmetric SNHL (>15dB difference) requires MRI to rule out vestibular schwannoma
- Conductive loss rarely exceeds 60dB (maximum air-bone gap)
- Carhart's notch at 2kHz on BC suggests otosclerosis
- Progressive unilateral SNHL: consider retrocochlear pathology`,
  },
  {
    title: "Tympanometry and Impedance Audiometry",
    category: "ent-audiometry",
    content: `Tympanometry measures middle ear compliance (admittance) as a function of air pressure changes in the ear canal. Essential for diagnosing middle ear pathology.

PROCEDURE:
1. Otoscopic examination first to ensure no cerumen occlusion or TM perforation
2. Select appropriate probe tip for airtight seal
3. Probe delivers 226Hz probe tone (or 1000Hz for infants <6 months)
4. Air pressure swept from +200 to -400 daPa
5. Compliance measured at each pressure point

TYMPANOGRAM TYPES (JERGER CLASSIFICATION):
Type A (Normal):
- Peak compliance at 0 to -100 daPa
- Amplitude: 0.3-1.5 mL (adults)
- Indicates normal middle ear function

Type As (Shallow):
- Normal peak pressure, reduced amplitude (<0.3 mL)
- Suggests stiffened system: otosclerosis, tympanosclerosis, or ossicular fixation

Type Ad (Deep):
- Normal peak pressure, excessive amplitude (>1.5 mL)
- Suggests hypermobile TM: ossicular discontinuity, healed perforation, thin TM

Type B (Flat):
- No identifiable peak
- WITH normal ear canal volume (0.6-1.5 mL): middle ear effusion
- WITH large ear canal volume (>2.0 mL): TM perforation or patent PE tube
- WITH small ear canal volume (<0.6 mL): cerumen occlusion or probe against canal wall

Type C (Negative Pressure):
- Peak shifted to negative pressure (<-100 daPa)
- Indicates Eustachian tube dysfunction
- May precede effusion development

ACOUSTIC REFLEXES:
- Contraction of stapedius muscle in response to loud sound (70-100dB above threshold)
- Ipsilateral and contralateral reflexes tested
- Absent reflexes: conductive hearing loss, severe SNHL, retrocochlear pathology, facial nerve lesion (VII)
- Elevated reflexes: mild-moderate cochlear pathology
- Reflex decay: >50% amplitude decrease in 10 seconds suggests retrocochlear lesion

ACOUSTIC REFLEX PATTERNS:
- Normal: Present bilaterally (ipsi and contra) at 70-100dB SL
- Conductive loss (right): Absent with probe in right ear (ipsi R, contra R), present with probe in left (ipsi L, contra L)
- Cochlear loss: Present but may show recruitment (reduced reflex threshold)
- Retrocochlear: Absent or elevated + reflex decay positive
- Facial nerve lesion: Absent reflexes with probe in affected ear

CLINICAL APPLICATIONS:
- Essential for diagnosing otitis media with effusion (OME) in children
- Screening for otosclerosis (Type As + absent reflexes)
- Cross-check principle: always correlate with PTA findings
- Monitor PE tube patency (Type B + large volume = patent tube)
- Eustachian tube function assessment with serial tympanograms`,
  },
  {
    title: "Flexible Nasopharyngolaryngoscopy (FNL)",
    category: "ent-endoscopy",
    content: `Flexible Nasopharyngolaryngoscopy (FNL) is the primary office-based endoscopic procedure for evaluating the upper aerodigestive tract. Also called flexible laryngoscopy or transnasal flexible laryngoscopy.

INDICATIONS:
- Dysphonia/hoarseness >2 weeks
- Dysphagia or odynophagia
- Globus sensation
- Chronic cough
- Stridor or airway concerns
- Nasal obstruction
- Epistaxis evaluation
- Post-operative follow-up
- Screening for head and neck malignancy
- Velopharyngeal insufficiency assessment

EQUIPMENT:
- Flexible fiberoptic or chip-tip distal sensor endoscope (3.2-4.0mm diameter)
- Light source (LED or xenon)
- Video recording system
- Topical anesthesia: 4% lidocaine spray or Pontocaine
- Topical decongestant: oxymetazoline 0.05% spray
- Anti-fog solution

PROCEDURE:
1. Informed consent obtained
2. Apply topical decongestant and anesthetic to more patent nasal cavity
3. Wait 3-5 minutes for effect
4. Insert scope along floor of nose, inferior to inferior turbinate
5. Systematic examination:
   a. Nasal cavity: septum, turbinates, mucosa, polyps, masses
   b. Nasopharynx: adenoid pad, Eustachian tube orifices, Rosenmuller fossa
   c. Oropharynx: base of tongue, vallecula, lingual tonsils
   d. Hypopharynx: pyriform sinuses, posterior pharyngeal wall, post-cricoid region
   e. Larynx: epiglottis, aryepiglottic folds, false vocal folds, true vocal folds, arytenoids, subglottis (if visible)
6. Assess vocal fold mobility during phonation (/i:/ sustained), sniffing, cough
7. Document findings with video/photo

FINDINGS - VOCAL FOLD PATHOLOGY:
- Nodules: Bilateral, symmetric, at junction of anterior 1/3 and posterior 2/3. Associated with vocal abuse
- Polyps: Usually unilateral, broad-based or pedunculated. Various types: hemorrhagic, hyaline, fibrous
- Cysts: Submucosal, unilateral. Epidermoid or retention cysts
- Reinke's edema: Bilateral diffuse polypoid degeneration. Strongly associated with smoking
- Leukoplakia: White mucosal patches. Must biopsy to rule out dysplasia/carcinoma
- Papilloma: HPV-related (types 6, 11). Recurrent respiratory papillomatosis
- Granuloma: Contact granuloma over vocal process. Associated with reflux, intubation
- Sulcus vocalis: Groove along medial surface of vocal fold
- Vocal fold paralysis: Unilateral (breathy voice, aspiration) or bilateral (stridor, airway compromise)
- Laryngeal carcinoma: Irregular mass, often at glottis. Requires biopsy

FINDINGS - LARYNGEAL FUNCTION:
- Vocal fold mobility: Symmetric abduction/adduction
- Glottic closure pattern: Complete, anterior gap, posterior gap, hourglass, irregular
- Mucosal wave: Assessed with stroboscopy
- Supraglottic compression: Anterior-posterior or lateral squeeze (muscle tension dysphonia)
- Laryngeal penetration/aspiration: Pooling in vallecula or pyriform sinuses

COMPLICATIONS (rare):
- Epistaxis
- Vasovagal episode
- Laryngospasm (very rare)
- Allergic reaction to topical anesthetic`,
  },
  {
    title: "Otoscopy and Otoscopic Findings",
    category: "ent-otoscopy",
    content: `Otoscopy is the visual examination of the external auditory canal (EAC) and tympanic membrane (TM) using an otoscope or otoendoscope.

NORMAL ANATOMY:
- External auditory canal: S-shaped, ~2.5cm long. Lateral 1/3 cartilaginous (hair follicles, cerumen glands), medial 2/3 osseous
- Tympanic membrane: Pearly gray, translucent, concave. Diameter ~8-10mm
- Landmarks: Cone of light (5 o'clock right, 7 o'clock left), umbo, handle of malleus, pars tensa, pars flaccida (Shrapnell's membrane), annulus

TECHNIQUE:
1. Pull pinna up, back, and out (adults) or down and back (children)
2. Use largest speculum that fits comfortably
3. Pneumatic otoscopy: Apply positive and negative pressure via insufflation bulb to assess TM mobility

ABNORMAL FINDINGS:

Acute Otitis Media (AOM):
- Bulging TM, erythematous or yellow
- Decreased mobility on pneumatic otoscopy
- Air-fluid levels may be visible
- TM may be perforated with purulent drainage

Otitis Media with Effusion (OME):
- Retracted TM, amber/yellow color
- Air-fluid levels or bubbles behind TM
- Decreased mobility
- No signs of acute infection

Chronic Suppurative Otitis Media (CSOM):
- TM perforation (central or marginal)
- Chronic ear drainage (otorrhea) >6 weeks
- Mucosal changes in middle ear if visible

Cholesteatoma:
- White, pearly mass behind or through TM
- Often in pars flaccida (attic retraction pocket)
- May erode ossicles, mastoid, tegmen
- Marginal perforation or retraction pocket filled with keratin debris
- Foul-smelling discharge
- Requires surgical intervention (tympanomastoidectomy)

Tympanic Membrane Perforation:
- Central: Usually from infection or trauma. May heal spontaneously
- Marginal: Higher risk of cholesteatoma. Involves annulus
- Attic: Pars flaccida involvement. Associated with cholesteatoma

Tympanosclerosis:
- White, chalky deposits on TM or in middle ear
- Calcium and collagen deposits from previous inflammation
- Usually incidental finding, mild conductive loss if involving ossicles

Otosclerosis:
- TM usually appears normal
- May see Schwartze sign: pink/red blush through TM (active otospongiosis)
- Diagnosis primarily by audiometry (Carhart's notch, absent reflexes) and history

External Otitis (Swimmer's Ear):
- Edematous, erythematous EAC
- Debris, discharge in canal
- Pain with tragal pressure or pinna manipulation
- TM may be difficult to visualize

Cerumen Impaction:
- Partial or complete occlusion of EAC
- May cause conductive hearing loss
- Removal by curette, irrigation, or suction

Foreign Body:
- Common in children (beads, insects, food)
- May require removal under microscopy
- Button batteries require URGENT removal (caustic injury)`,
  },
  {
    title: "Vestibular Testing and Balance Assessment",
    category: "ent-vestibular",
    content: `Vestibular testing evaluates the peripheral and central vestibular system for patients presenting with dizziness, vertigo, or imbalance.

VIDEONYSTAGMOGRAPHY (VNG):
1. Oculomotor tests: Saccade, smooth pursuit, optokinetic nystagmus
   - Abnormal = central pathology (brainstem, cerebellum)
2. Positional/positioning tests: Dix-Hallpike maneuver
   - Positive = BPPV (torsional upbeating nystagmus with latency, fatigue)
   - Posterior canal BPPV: most common (85-90%)
   - Horizontal canal BPPV: geotropic or apogeotropic nystagmus in supine roll test
3. Caloric testing: Warm (44°C) and cool (30°C) water or air irrigation
   - COWS mnemonic: Cold Opposite Warm Same (direction of fast phase)
   - Unilateral weakness >25%: peripheral vestibular hypofunction on weak side
   - Bilateral weakness: bilateral vestibular loss (ototoxicity, bilateral Meniere's)
   - Directional preponderance >30%: may suggest central compensation pattern

BENIGN PAROXYSMAL POSITIONAL VERTIGO (BPPV):
- Most common cause of peripheral vertigo
- Otoconia displaced into semicircular canals (canalithiasis) or adhered to cupula (cupulolithiasis)
- Posterior canal: Epley or Semont maneuver for treatment
- Horizontal canal: BBQ roll (Lempert maneuver) or Gufoni maneuver
- Anterior canal: Rare, deep head-hanging maneuver

VESTIBULAR EVOKED MYOGENIC POTENTIALS (VEMP):
- cVEMP (cervical): Tests saccule and inferior vestibular nerve
  - Electrode on SCM muscle, stimulate with loud clicks/tone bursts
  - Absent = inferior vestibular neuritis
  - Enhanced = superior canal dehiscence
- oVEMP (ocular): Tests utricle and superior vestibular nerve
  - Electrode under eye, stimulate with bone vibration
  - Enhanced amplitude = superior semicircular canal dehiscence (SSCD)

ELECTROCOCHLEOGRAPHY (ECochG):
- Measures summating potential (SP) and action potential (AP)
- SP/AP ratio >0.4 = endolymphatic hydrops (Meniere's disease)
- Useful for confirming Meniere's diagnosis

ROTARY CHAIR TESTING:
- Gold standard for bilateral vestibular loss
- Measures VOR gain, phase, and asymmetry
- Sinusoidal harmonic acceleration at 0.01-0.64 Hz
- Reduced gain with phase lead = bilateral hypofunction

HEAD IMPULSE TEST (HIT) / vHIT:
- Quick head thrust while patient fixates on target
- Presence of corrective saccade = peripheral vestibular deficit on that side
- Tests individual semicircular canal function
- Negative HIT with severe vertigo = central cause (stroke must be ruled out — HINTS protocol)

COMMON VESTIBULAR DIAGNOSES:
1. BPPV: Brief positional vertigo, + Dix-Hallpike, normal hearing
2. Vestibular neuritis: Acute prolonged vertigo, + HIT, normal hearing, no other neurological signs
3. Meniere's disease: Episodic vertigo (20min-12hrs) + fluctuating SNHL + tinnitus + aural fullness. Diagnosis: ≥2 episodes of vertigo lasting 20min-12hrs, audiometrically documented low-mid frequency SNHL, fluctuating aural symptoms
4. Superior canal dehiscence (SSCD): Sound/pressure-induced vertigo, autophony, pulsatile tinnitus. CT temporal bone shows dehiscence. Enhanced VEMPs, air-bone gap on audiogram without middle ear pathology
5. Vestibular migraine: Episodic vestibular symptoms with migraine features. Most common cause of spontaneous episodic vertigo
6. Acoustic neuroma (vestibular schwannoma): Progressive unilateral SNHL, tinnitus, imbalance. MRI with gadolinium for diagnosis`,
  },
  {
    title: "Nasal Endoscopy and Sinonasal Examination",
    category: "ent-endoscopy",
    content: `Nasal endoscopy is the standard office-based procedure for evaluating sinonasal anatomy and pathology. Uses rigid (0°, 30°, 45°, 70° Hopkins rod) or flexible endoscopes.

PREPARATION:
- Topical decongestant: oxymetazoline or phenylephrine spray
- Topical anesthetic: 4% lidocaine on cotton pledgets or spray
- Wait 5-10 minutes for optimal vasoconstriction and anesthesia

THREE-PASS TECHNIQUE:
Pass 1 (Floor/Inferior):
- Along floor of nose between septum and inferior turbinate
- Examine inferior meatus (nasolacrimal duct opening)
- Advance to nasopharynx: adenoid pad, Eustachian tube orifices, fossa of Rosenmuller
- Assess for nasopharyngeal masses

Pass 2 (Middle Meatus):
- Between middle turbinate and lateral nasal wall
- Key area: ostiomeatal complex (OMC)
- Examine: uncinate process, ethmoid bulla, hiatus semilunaris
- Look for: polyps, purulent drainage, mucosal edema, accessory ostia
- Middle meatus is drainage pathway for maxillary, anterior ethmoid, and frontal sinuses

Pass 3 (Superior/Sphenoethmoid):
- Medialize middle turbinate gently
- Examine: superior turbinate, sphenoethmoid recess
- Sphenoid sinus ostium: medial to superior turbinate
- Olfactory cleft: between septum and superior/middle turbinate

COMMON FINDINGS:

Chronic Rhinosinusitis (CRS):
- Mucosal edema, purulent drainage from sinus ostia
- Two subtypes: CRS with nasal polyps (CRSwNP) and CRS without nasal polyps (CRSsNP)
- Diagnosis: ≥12 weeks of ≥2 symptoms (nasal obstruction, drainage, facial pain/pressure, hyposmia) + objective evidence (endoscopy or CT)

Nasal Polyps:
- Grape-like, translucent, insensate masses
- Usually bilateral (if unilateral, must rule out inverted papilloma or malignancy)
- Originate from ethmoid sinuses, prolapse into nasal cavity
- Grading: Grade 1 (limited to middle meatus), Grade 2 (below middle turbinate), Grade 3 (massive, reaching floor of nose)
- Associated conditions: asthma, aspirin-exacerbated respiratory disease (AERD/Samter's triad), allergic fungal rhinosinusitis (AFRS), cystic fibrosis

Septal Deviation:
- Anterior cartilaginous or posterior bony deviation
- C-shaped (single curve) or S-shaped (double curve)
- Spurs: sharp bony projections contacting lateral wall
- May contribute to ostiomeatal obstruction

Turbinate Hypertrophy:
- Inferior turbinate: most common, responds to decongestant
- Middle turbinate: concha bullosa (pneumatized middle turbinate), paradoxical curvature

Inverted Papilloma:
- Benign but locally aggressive
- Unilateral, originates from lateral nasal wall
- Lobulated, irregular surface (different from polyps)
- 5-15% malignant transformation risk
- Requires wide surgical excision (medial maxillectomy approach)

Epistaxis Sources:
- Anterior: Kiesselbach's plexus (Little's area) — most common
- Posterior: Sphenopalatine artery branches
- Identify bleeding site, assess for masses, friable mucosa

FUNCTIONAL ENDOSCOPIC SINUS SURGERY (FESS) LANDMARKS:
- Uncinate process: First structure removed (uncinectomy)
- Natural maxillary ostium: Posterior to uncinate
- Ethmoid bulla: Posterior to hiatus semilunaris
- Basal lamella of middle turbinate: Boundary between anterior and posterior ethmoids
- Skull base (fovea ethmoidalis): Superior limit — CRITICAL to identify to avoid CSF leak
- Lamina papyracea: Lateral limit — thin bone separating ethmoids from orbit
- Anterior ethmoid artery: Runs along skull base, landmark for frontal recess`,
  },
  {
    title: "Common ENT Surgical Procedures",
    category: "ent-procedures",
    content: `TONSILLECTOMY AND ADENOIDECTOMY (T&A):
Indications for tonsillectomy:
- Recurrent tonsillitis: ≥7 episodes in 1 year, ≥5/year for 2 years, ≥3/year for 3 years (Paradise criteria)
- Peritonsillar abscess (quinsy) — recurrent or failure of drainage
- Obstructive sleep apnea (most common indication in children)
- Suspected malignancy (asymmetric tonsil, rapid enlargement)
Techniques: Cold steel, electrocautery, coblation, harmonic scalpel
Post-op: #1 complication is hemorrhage (primary <24hrs, secondary 5-10 days)

MYRINGOTOMY WITH TUBE INSERTION (BMT):
- Most common pediatric ambulatory surgery
- Indications: Recurrent AOM (≥3 in 6 months or ≥4 in 12 months), chronic OME >3 months with hearing loss, eustachian tube dysfunction
- PE tubes: Short-term (Shepard, Armstrong — extrude in 6-12 months) vs long-term (T-tube — for revision, cleft palate)
- Water precautions: Controversial; surface swimming generally acceptable

TYMPANOPLASTY:
- Surgical repair of TM perforation
- Types (Wullstein classification): Type I (myringoplasty — TM repair only), Type II-V (ossicular chain reconstruction)
- Graft materials: Temporalis fascia, tragal perichondrium, cartilage (palisade technique for high-risk perforations)
- Approaches: Transcanal, endaural, postauricular

MASTOIDECTOMY:
- Canal wall up (CWU): Preserves posterior canal wall, lower recurrence visibility
- Canal wall down (CWD): Removes posterior canal wall, creates mastoid cavity/bowl. Better disease clearance but requires lifelong cavity care
- Indications: Cholesteatoma, complicated otitis media, coalescent mastoiditis

SEPTOPLASTY:
- Correction of deviated nasal septum
- Indications: Nasal obstruction refractory to medical management, access for sinus surgery, recurrent epistaxis from spur
- Cottle's areas of septum: 1-5 (anterior to posterior)
- Approach: Hemitransfixion incision, subperichondrial/subperiosteal dissection

FUNCTIONAL ENDOSCOPIC SINUS SURGERY (FESS):
- Stepwise approach: Uncinectomy → maxillary antrostomy → anterior ethmoidectomy → posterior ethmoidectomy → sphenoidotomy → frontal sinusotomy (Draf I, II, III)
- Key danger zones: Lamina papyracea (orbit), skull base (CSF leak), anterior ethmoid artery, optic nerve (posterior ethmoid/sphenoid)
- Image-guided surgery (IGS): Used for revision cases, skull base proximity, extensive polyposis

TRACHEOSTOMY:
- Indications: Prolonged intubation (>10-14 days), upper airway obstruction, pulmonary toilet, anticipated long-term ventilation
- Landmarks: Between 2nd-4th tracheal rings
- Types: Open surgical vs percutaneous dilational tracheostomy (PDT)
- Complications: Hemorrhage, pneumothorax, false passage, tracheal stenosis (late)

NECK DISSECTION:
- Selective: Removes specific levels based on primary site
- Modified radical: Levels I-V with preservation of ≥1 non-lymphatic structure (SCM, IJV, CN XI)
- Radical: All 5 levels + SCM + IJV + CN XI
- Levels: I (submental/submandibular), II (upper jugular), III (mid jugular), IV (lower jugular), V (posterior triangle), VI (central/pretracheal)

DIRECT LARYNGOSCOPY AND MICROLARYNGOSCOPY:
- Suspension laryngoscopy under general anesthesia
- Microscopic or endoscopic visualization
- Procedures: Biopsy, excision of vocal fold lesions, injection laryngoplasty, laser surgery
- CO2 laser: Precise excision of laryngeal papillomas, leukoplakia, early glottic cancer`,
  },
  {
    title: "Hearing Aid and Cochlear Implant Criteria",
    category: "ent-audiometry",
    content: `HEARING AID SELECTION:
Hearing aids amplify sound and are the primary treatment for sensorineural hearing loss.

Types:
- Behind-the-ear (BTE): Most versatile, all degrees of loss, pediatric standard
- Receiver-in-canal (RIC): Most popular adult style, mild-severe loss
- In-the-ear (ITE): Custom molded, mild-severe loss
- In-the-canal (ITC) / Completely-in-canal (CIC): Cosmetic preference, mild-moderate loss
- Bone-anchored hearing aid (BAHA/Osia): Conductive/mixed loss, single-sided deafness

Fitting criteria:
- PTA >25dB HL with communication difficulty
- WRS should be >40% for meaningful benefit from amplification
- If WRS <40%, consider cochlear implant evaluation

COCHLEAR IMPLANT (CI) CRITERIA:
FDA-approved criteria for adults:
- Moderate-to-profound SNHL bilaterally (≥60dB PTA)
- Limited benefit from optimally fitted hearing aids
- Sentence recognition score ≤50% in best-aided condition (ear to be implanted)
- Sentence recognition score ≤60% in contralateral ear or binaurally
- No medical contraindications (absent cochlear nerve, active infection)

FDA-approved criteria for children:
- 9-24 months: Profound SNHL bilaterally (≥90dB)
- 2-17 years: Severe-to-profound SNHL (≥70dB), limited benefit from hearing aids
- Trial of appropriately fitted hearing aids for 3-6 months required
- Enrollment in auditory-oral rehabilitation program

Expanded indications (evolving):
- Single-sided deafness (SSD) with CI
- Asymmetric hearing loss
- Hybrid/electroacoustic stimulation (EAS) for high-frequency severe loss with preserved low-frequency hearing

Workup:
- Complete audiometric evaluation including aided testing
- CT temporal bone: Cochlear anatomy, inner ear malformations, cochlear patency
- MRI IAC/brain: Cochlear nerve presence, rule out retrocochlear pathology
- Vestibular testing if indicated
- Speech-language evaluation
- Counseling and realistic expectations

BONE-ANCHORED HEARING DEVICES:
- Indications: Chronic ear disease with conductive loss, aural atresia, single-sided deafness
- Types: Percutaneous (BAHA Connect), transcutaneous active (Osia, Bonebridge), transcutaneous passive (BAHA Attract)
- Audiometric criteria: BC thresholds ≤55dB (Osia 2), ≤45dB (most processors)
- SSD criteria: Normal hearing in contralateral ear, profound loss in implant ear`,
  },
  {
    title: "Pediatric ENT - Common Conditions",
    category: "ent-pediatric",
    content: `OTITIS MEDIA IN CHILDREN:
Acute Otitis Media (AOM):
- Peak age: 6-24 months
- Risk factors: Daycare attendance, bottle feeding (supine), secondhand smoke, pacifier use, craniofacial anomalies (cleft palate, Down syndrome)
- Diagnosis: Acute onset symptoms + middle ear effusion + TM inflammation
- First-line treatment: Amoxicillin 80-90mg/kg/day for 10 days (<2 years) or 5-7 days (≥2 years)
- Second-line: Amoxicillin-clavulanate (if failed first-line, recent antibiotics)
- Observation option: Age ≥2, unilateral, non-severe symptoms

Otitis Media with Effusion (OME):
- Fluid without acute infection
- Common after AOM (may persist 1-3 months)
- Watch and wait for 3 months if bilateral
- PE tubes if bilateral OME >3 months with hearing loss ≥20dB or bilateral
- Language delay concerns warrant earlier intervention

PEDIATRIC HEARING LOSS:
Screening:
- Universal newborn hearing screening (OAE or ABR)
- Failed screening → diagnostic ABR by 3 months
- Intervention by 6 months (1-3-6 plan)

Congenital SNHL:
- Genetic (50-60%): GJB2 mutation most common (connexin 26), syndromic (Pendred, Usher, Waardenburg, Treacher Collins, Jervell & Lange-Nielsen)
- CMV infection: Most common non-genetic cause of congenital SNHL. May be progressive
- Inner ear malformation: Mondini, cochlear aplasia, large vestibular aqueduct syndrome (LVAS/EVA)

PEDIATRIC AIRWAY:
Laryngomalacia:
- Most common cause of stridor in infants
- Inspiratory stridor, worse with feeding, crying, supine position
- Omega-shaped or tubular epiglottis, short aryepiglottic folds, prolapsing cuneiform cartilages
- Usually self-resolves by 12-18 months
- Supraglottoplasty if severe (failure to thrive, apnea, significant feeding difficulty)

Subglottic stenosis:
- Congenital or acquired (post-intubation)
- Myer-Cotton grading: Grade I (<50% obstruction) to Grade IV (complete obstruction)
- Treatment: Observation (mild), endoscopic dilation/laser, laryngotracheal reconstruction (LTR), cricotracheal resection

Croup (Laryngotracheobronchitis):
- Age 6 months to 3 years, parainfluenza virus most common
- Barky cough, inspiratory stridor, hoarseness
- Steeple sign on AP X-ray
- Treatment: Dexamethasone 0.6mg/kg (single dose), nebulized racemic epinephrine if moderate-severe

PEDIATRIC NECK MASSES:
Congenital:
- Thyroglossal duct cyst: Midline, moves with swallowing/tongue protrusion. Sistrunk procedure (cyst + central hyoid bone + tract to foramen cecum)
- Branchial cleft anomaly: Lateral neck. 2nd cleft most common (anterior to SCM, deep to CN XII and external carotid)
- Dermoid cyst: Midline, does not move with swallowing
- Lymphatic malformation (cystic hygroma): Posterior triangle, transilluminates

Inflammatory:
- Reactive lymphadenopathy: Most common pediatric neck mass
- Peritonsillar abscess: Trismus, uvula deviation, "hot potato" voice
- Deep neck space infection: Retropharyngeal abscess (widened prevertebral space on lateral X-ray)

FOREIGN BODIES:
Ear: Button batteries = emergency (alkali burn in 2-4 hours). Insects: kill first with mineral oil then remove
Nose: Unilateral foul-smelling discharge in child = FB until proven otherwise. Button battery = emergency
Airway: Right main bronchus most common site. Rigid bronchoscopy for removal`,
  },
  {
    title: "Head and Neck Oncology - ENT",
    category: "ent-oncology",
    content: `HEAD AND NECK SQUAMOUS CELL CARCINOMA (HNSCC):
Risk factors: Tobacco, alcohol (synergistic effect), HPV (oropharyngeal SCC — better prognosis), betel nut, occupational exposures

SUBSITES:
Oral cavity: Lip, oral tongue (anterior 2/3), floor of mouth, buccal mucosa, hard palate, alveolar ridge, retromolar trigone
- Treatment: Surgery primary, +/- adjuvant radiation
- Oral tongue SCC: Most common oral cavity cancer, early nodal metastasis

Oropharynx: Base of tongue, tonsil, soft palate, posterior pharyngeal wall
- HPV+ oropharyngeal SCC: Younger patients, non-smokers, tonsil/BOT, cystic nodal metastasis, better survival
- Treatment: Primary radiation + chemotherapy (organ preservation) or transoral robotic surgery (TORS)

Larynx:
- Glottic: True vocal folds, early hoarseness, late metastasis
  - T1-T2: Radiation or transoral laser microsurgery
  - T3-T4: Chemoradiation (organ preservation) or total laryngectomy
- Supraglottic: Epiglottis, AE folds, false VFs, ventricle
  - Rich lymphatic drainage → early nodal metastasis
  - Treatment: Radiation +/- chemo, or supraglottic laryngectomy
- Subglottic: Rare (<5% of laryngeal cancers), poor prognosis

Hypopharynx: Pyriform sinus (most common), posterior pharyngeal wall, post-cricoid
- Often presents at advanced stage
- High rate of nodal metastasis
- Treatment: Chemoradiation or surgery + reconstruction (free flap)

Nasopharynx: Strong association with EBV, endemic in Southern China/Southeast Asia
- Undifferentiated carcinoma (WHO Type III) most common
- Treatment: Radiation + concurrent cisplatin (not surgical)

STAGING:
- TNM system (AJCC 8th edition)
- HPV-positive oropharyngeal cancer has separate staging (better prognosis reflected)
- Depth of invasion (DOI) important for oral cavity staging

WORKUP:
- Complete head and neck examination with flexible laryngoscopy
- Biopsy: FNA of neck mass, direct biopsy of primary
- CT neck with contrast: Assess primary and nodal disease
- MRI: Better for soft tissue detail, perineural invasion, tongue base
- PET/CT: Staging, detection of distant metastasis, unknown primary
- Panendoscopy (triple endoscopy): Direct laryngoscopy + esophagoscopy + bronchoscopy to rule out synchronous primary (field cancerization)

RECONSTRUCTION:
- Primary closure or local flap (small defects)
- Regional flap: Pectoralis major myocutaneous flap
- Free flap: Radial forearm free flap (RFFF), anterolateral thigh (ALT), fibula free flap (mandible reconstruction), jejunal free flap (circumferential pharyngeal defects)
- Microvascular anastomosis: >95% success rate at experienced centers

SALIVARY GLAND TUMORS:
- Rule of 80s: 80% in parotid, 80% of parotid tumors are benign, 80% of benign are pleomorphic adenoma
- Parotid: Pleomorphic adenoma (most common benign), Warthin tumor (2nd), mucoepidermoid carcinoma (most common malignant)
- Submandibular: 50% benign/50% malignant
- Minor salivary glands: 75% malignant (most common: adenoid cystic carcinoma — perineural invasion)
- Facial nerve management: Preserve if not directly invaded by tumor`,
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

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

router.get("/ent-training/knowledge", async (_req, res): Promise<void> => {
  const categories = [
    "ent-audiometry",
    "ent-endoscopy",
    "ent-otoscopy",
    "ent-vestibular",
    "ent-procedures",
    "ent-pediatric",
    "ent-oncology",
  ];

  const existingDocs = await db
    .select({ id: documentsTable.id, title: documentsTable.title, category: documentsTable.category, chunksCount: documentsTable.chunksCount })
    .from(documentsTable);

  const entDocs = existingDocs.filter((d) => categories.includes(d.category));
  const availableTopics = ENT_KNOWLEDGE_BASE.map((kb) => ({
    title: kb.title,
    category: kb.category,
    contentLength: kb.content.length,
    alreadyLoaded: entDocs.some((d) => d.title === kb.title),
  }));

  res.json({
    totalAvailable: ENT_KNOWLEDGE_BASE.length,
    alreadyLoaded: entDocs.length,
    topics: availableTopics,
    loadedDocs: entDocs,
    categories,
  });
});

router.post("/ent-training/ingest", async (req, res): Promise<void> => {
  const { topics } = req.body as { topics?: string[] };

  const toIngest = topics
    ? ENT_KNOWLEDGE_BASE.filter((kb) => topics.includes(kb.title))
    : ENT_KNOWLEDGE_BASE;

  if (toIngest.length === 0) {
    res.status(400).json({ error: "No matching topics found" });
    return;
  }

  const existingDocs = await db
    .select({ title: documentsTable.title })
    .from(documentsTable);
  const existingTitles = new Set(existingDocs.map((d) => d.title));

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

  const ingested = results.filter((r) => r.status === "ingested").length;
  const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);

  res.json({
    ingested,
    skipped: results.filter((r) => r.status.startsWith("skipped")).length,
    errors: results.filter((r) => r.status.startsWith("error")).length,
    totalChunks,
    results,
  });
});

router.post("/ent-training/generate-pairs", async (req, res): Promise<void> => {
  const { category, count } = req.body as { category?: string; count?: number };
  const pairCount = Math.min(count || 10, 50);

  const [config] = await db.select().from(llmConfigTable).limit(1);
  const ollamaUrl = config?.serverUrl;
  if (!ollamaUrl) {
    res.status(503).json({ error: "Ollama server not configured" });
    return;
  }

  const entCategories = [
    "ent-audiometry", "ent-endoscopy", "ent-otoscopy",
    "ent-vestibular", "ent-procedures", "ent-pediatric", "ent-oncology",
  ];

  let chunks;
  if (category && entCategories.includes(category)) {
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

    chunks = chunks.filter((c) =>
      entCategories.some((cat) => c.content.toLowerCase().includes("audiom") ||
        c.content.toLowerCase().includes("tympan") ||
        c.content.toLowerCase().includes("laryngo") ||
        c.content.toLowerCase().includes("otoscop") ||
        c.content.toLowerCase().includes("vestibul") ||
        c.content.toLowerCase().includes("hearing"))
    );
  }

  if (chunks.length === 0) {
    res.status(404).json({ error: "No ENT knowledge found. Please ingest ENT knowledge first." });
    return;
  }

  const selectedChunks = chunks
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(5, chunks.length))
    .map((c) => c.content)
    .join("\n\n");

  const prompt = `You are an expert otolaryngologist and medical educator. Based on the following ENT medical knowledge, generate exactly ${pairCount} high-quality question-answer training pairs suitable for fine-tuning a medical AI model.

KNOWLEDGE:
${selectedChunks}

REQUIREMENTS:
- Questions should be clinically relevant and specific
- Answers should be detailed, accurate, and educational
- Mix difficulty levels: medical student, resident, and attending level
- Include clinical scenarios, diagnostic reasoning, and management questions
- Cover the specific content provided

Return ONLY a valid JSON array of objects with "instruction" and "output" fields.
Example: [{"instruction": "What is the most common cause of conductive hearing loss in children?", "output": "Otitis media with effusion (OME) is the most common cause..."}]

Return ONLY the JSON array, no other text.`;

  try {
    const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meditron:7b",
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
      res.json({
        pairs: [],
        raw: responseText,
        error: "Could not parse JSON from model response",
      });
      return;
    }

    let pairs: Array<{ instruction: string; output: string }>;
    try {
      pairs = JSON.parse(jsonMatch[0]);
    } catch {
      res.json({
        pairs: [],
        raw: responseText,
        error: "Invalid JSON from model",
      });
      return;
    }

    res.json({
      pairs: pairs.filter((p) => p.instruction && p.output),
      count: pairs.length,
      category: category || "all-ent",
      model: "meditron:7b",
    });
  } catch (err: any) {
    res.status(500).json({
      error: `Generation failed: ${err?.message ?? "Unknown error"}`,
    });
  }
});

export default router;
