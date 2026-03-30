import { Router } from "express";
import { requireAdmin } from "../middlewares/rateLimiter";
import { getAuditLogs, getAuditStats } from "../middlewares/auditLog";
import { pool } from "@workspace/db";

const router = Router();

const HIPAA_DOCUMENTS = [
  {
    id: "baa",
    title: "Business Associate Agreement (BAA)",
    category: "Administrative Safeguards",
    description: "Template agreement between covered entities and business associates who handle PHI",
    lastUpdated: "2026-03-28",
    status: "template",
    sections: [
      {
        title: "1. Definitions",
        content: `**"Business Associate"** means [BUSINESS ASSOCIATE NAME], which creates, receives, maintains, or transmits Protected Health Information on behalf of the Covered Entity.

**"Covered Entity"** means [ORGANIZATION NAME], a covered entity under HIPAA.

**"Protected Health Information (PHI)"** means individually identifiable health information transmitted or maintained in any form or medium, as defined in 45 CFR § 160.103.

**"Electronic Protected Health Information (ePHI)"** means PHI that is transmitted or maintained in electronic media, as defined in 45 CFR § 160.103.

**"Security Incident"** means the attempted or successful unauthorized access, use, disclosure, modification, or destruction of information or interference with system operations in an information system.

**"Breach"** means the acquisition, access, use, or disclosure of PHI in a manner not permitted by the HIPAA Privacy Rule that compromises the security or privacy of the PHI, as defined in 45 CFR § 164.402.`
      },
      {
        title: "2. Obligations of Business Associate",
        content: `The Business Associate agrees to:

a) **Use and Disclosure Limitations**: Not use or disclose PHI other than as permitted or required by this Agreement or as required by law.

b) **Safeguards**: Use appropriate administrative, physical, and technical safeguards, and comply with Subpart C of 45 CFR Part 164 (Security Rule) with respect to ePHI, to prevent use or disclosure of PHI other than as provided for by this Agreement.

c) **Reporting**: Report to Covered Entity any use or disclosure of PHI not provided for by this Agreement of which it becomes aware, including breaches of unsecured PHI as required by 45 CFR § 164.410, and any security incident of which it becomes aware.

d) **Breach Notification Timeline**: Report any breach of unsecured PHI to the Covered Entity without unreasonable delay and in no case later than **30 calendar days** after discovery of the breach.

e) **Subcontractors**: In accordance with 45 CFR §§ 164.502(e)(1)(ii) and 164.308(b)(2), ensure that any subcontractors that create, receive, maintain, or transmit PHI on behalf of the Business Associate agree to the same restrictions, conditions, and requirements.

f) **Access to PHI**: Make available PHI in a Designated Record Set to the Covered Entity or, as directed by the Covered Entity, to an individual, as necessary to satisfy the Covered Entity's obligations under 45 CFR § 164.524.

g) **Amendment of PHI**: Make any amendment(s) to PHI in a Designated Record Set as directed or agreed to by the Covered Entity pursuant to 45 CFR § 164.526.

h) **Accounting of Disclosures**: Maintain and make available the information required to provide an accounting of disclosures to the Covered Entity as necessary to satisfy the Covered Entity's obligations under 45 CFR § 164.528.

i) **Government Access**: Make its internal practices, books, and records available to the Secretary of HHS for purposes of determining compliance with the HIPAA Rules.`
      },
      {
        title: "3. Permitted Uses and Disclosures",
        content: `The Business Associate may use or disclose PHI:

a) As necessary to perform services set forth in the underlying service agreement between the parties.

b) As required by law.

c) For the proper management and administration of the Business Associate, provided that:
   - Disclosures are required by law; or
   - Business Associate obtains reasonable assurances from the person to whom the information is disclosed that the information will remain confidential and will be used or further disclosed only as required by law or for the purposes for which it was disclosed.

d) To provide data aggregation services to the Covered Entity as permitted by 45 CFR § 164.504(e)(2)(i)(B).

e) To de-identify PHI in accordance with 45 CFR § 164.514(a)-(c).`
      },
      {
        title: "4. Term and Termination",
        content: `a) **Term**: This Agreement shall be effective as of [EFFECTIVE DATE] and shall terminate when all PHI provided by Covered Entity to Business Associate, or created or received by Business Associate on behalf of Covered Entity, is destroyed or returned to Covered Entity.

b) **Termination for Cause**: Upon Covered Entity's knowledge of a material breach by Business Associate, Covered Entity shall provide an opportunity for Business Associate to cure the breach or end the violation. If Business Associate does not cure the breach or end the violation within **30 days**, Covered Entity may terminate this Agreement.

c) **Obligations of Business Associate Upon Termination**: Upon termination, Business Associate shall return or destroy all PHI received from Covered Entity. If return or destruction is not feasible, Business Associate shall extend the protections of this Agreement to the PHI and limit further uses and disclosures to those purposes that make the return or destruction of the PHI infeasible.`
      },
      {
        title: "5. Miscellaneous",
        content: `a) **Regulatory References**: A reference in this Agreement to a section in the HIPAA Rules means the section as in effect or as amended.

b) **Amendment**: The Parties agree to take such action as is necessary to amend this Agreement from time to time as is necessary for compliance with HIPAA Rules.

c) **Survival**: The respective rights and obligations of Business Associate under Section 4(c) shall survive the termination of this Agreement.

d) **Interpretation**: Any ambiguity in this Agreement shall be interpreted to permit compliance with the HIPAA Rules.

---

**COVERED ENTITY:**
Signature: _______________________
Name: ___________________________
Title: ___________________________
Date: ___________________________

**BUSINESS ASSOCIATE:**
Signature: _______________________
Name: ___________________________
Title: ___________________________
Date: ___________________________`
      },
    ],
  },
  {
    id: "risk-assessment",
    title: "Security Risk Assessment",
    category: "Administrative Safeguards",
    description: "Template for conducting periodic security risk assessments as required by HIPAA",
    lastUpdated: "2026-03-28",
    status: "template",
    sections: [
      {
        title: "1. Scope and Purpose",
        content: `**Purpose**: This Security Risk Assessment (SRA) evaluates the potential risks and vulnerabilities to the confidentiality, integrity, and availability of electronic protected health information (ePHI) held by [ORGANIZATION NAME], in compliance with 45 CFR § 164.308(a)(1)(ii)(A).

**Scope**: This assessment covers all systems, applications, and processes that create, receive, maintain, or transmit ePHI, including:
- LLM Hub platform and all connected services
- VPS infrastructure (72.60.167.64) hosting Ollama LLM server
- PostgreSQL database systems
- Third-party integrations (OpenAI, Google services)
- User workstations and mobile devices
- Network infrastructure

**Assessment Period**: [START DATE] to [END DATE]
**Assessment Conducted By**: [NAME/TITLE]
**Date Completed**: [DATE]`
      },
      {
        title: "2. Asset Inventory",
        content: `| Asset | Type | Location | ePHI Stored? | Owner |
|-------|------|----------|--------------|-------|
| LLM Hub Application | Web Application | Replit Cloud | Yes | [OWNER] |
| Ollama LLM Server | AI Server | VPS 72.60.167.64 | Yes (in prompts) | [OWNER] |
| PostgreSQL Database | Database | Replit Cloud | Yes | [OWNER] |
| Audit Log System | Logging | Replit Cloud | Yes (metadata) | [OWNER] |
| Backup Storage | Storage | [LOCATION] | Yes | [OWNER] |
| Admin Workstations | Endpoints | [LOCATION] | Transient | [OWNER] |
| API Gateway | Network | Replit Cloud | Yes (transit) | [OWNER] |
| Voice Agent System | Application | Replit Cloud | Yes (audio PHI) | [OWNER] |
| Clinical AI Module | Application | Replit Cloud | Yes | [OWNER] |
| RAG Knowledge Base | Database | Replit Cloud | Potentially | [OWNER] |`
      },
      {
        title: "3. Threat Identification",
        content: `**3.1 Natural Threats**
- Power outages affecting VPS or cloud infrastructure
- Natural disasters impacting data centers

**3.2 Human Threats — Intentional**
- Unauthorized access attempts via stolen credentials
- SQL injection or API exploitation
- Insider threats from authorized users exceeding access privileges
- Social engineering / phishing targeting admin accounts
- Ransomware or malware targeting server infrastructure

**3.3 Human Threats — Unintentional**
- Accidental exposure of PHI in LLM prompts or responses
- Misconfigured access controls
- Failure to revoke access for departed employees
- Inadvertent sharing of API keys or credentials
- Unencrypted data transmission

**3.4 Environmental Threats**
- Hardware failure on VPS
- Cloud service provider outage
- Network connectivity interruptions`
      },
      {
        title: "4. Vulnerability Assessment",
        content: `| # | Vulnerability | Current Control | Gap? | Risk Level |
|---|--------------|-----------------|------|------------|
| V1 | Weak authentication | Replit Auth (OIDC PKCE), role-based access | Review MFA options | Medium |
| V2 | Unencrypted data at rest | PostgreSQL encryption, TLS in transit | Verify column-level encryption for PHI | Medium |
| V3 | Excessive user permissions | Admin/user roles, requireAuth middleware | Implement least-privilege audit | Low |
| V4 | Insufficient audit logging | Global audit middleware, PHI flagging | ✓ Implemented | Low |
| V5 | No session timeout | 15-min auto-logout with warning | ✓ Implemented | Low |
| V6 | Unpatched software | Regular dependency updates | Formalize patch schedule | Medium |
| V7 | PHI in LLM responses | PHI route tracking, clinical data isolation | Add PHI detection in outputs | High |
| V8 | Third-party data handling | API proxies with timeout controls | Need BAA with OpenAI, Google | High |
| V9 | Backup and recovery | Replit checkpoints | Document RTO/RPO, test restoration | Medium |
| V10 | Physical access to VPS | Data center security (provider-managed) | Verify provider compliance | Low |`
      },
      {
        title: "5. Risk Evaluation Matrix",
        content: `**Risk Rating Scale:**
- **Critical** (Score 9-10): Immediate action required. Risk of large-scale PHI breach.
- **High** (Score 7-8): Action required within 30 days. Significant vulnerability.
- **Medium** (Score 4-6): Action required within 90 days. Moderate risk.
- **Low** (Score 1-3): Monitor and address during regular maintenance cycles.

| Risk | Likelihood (1-5) | Impact (1-5) | Score | Rating | Mitigation Plan |
|------|------------------|--------------|-------|--------|----------------|
| Unauthorized API access | 2 | 4 | 8 | High | Enhance rate limiting, add IP allowlisting |
| PHI exposure in LLM output | 3 | 4 | 12 | Critical | Implement PHI detection/redaction filters |
| Third-party data breach | 2 | 5 | 10 | Critical | Execute BAA with all vendors |
| Session hijacking | 1 | 4 | 4 | Medium | Session timeout ✓, add CSRF tokens |
| Insider data theft | 1 | 5 | 5 | Medium | Audit logging ✓, access reviews |
| Database compromise | 1 | 5 | 5 | Medium | Encryption at rest, regular backups |
| Unpatched vulnerability | 2 | 3 | 6 | Medium | Monthly patch review cycle |`
      },
      {
        title: "6. Remediation Plan",
        content: `| Priority | Action Item | Owner | Target Date | Status |
|----------|------------|-------|-------------|--------|
| 1 | Execute BAA with OpenAI | [OWNER] | [DATE] | Pending |
| 2 | Execute BAA with Google (Drive, Gmail) | [OWNER] | [DATE] | Pending |
| 3 | Implement PHI detection in LLM responses | [OWNER] | [DATE] | Pending |
| 4 | Enable column-level encryption for clinical data | [OWNER] | [DATE] | Pending |
| 5 | Formalize patch management schedule | [OWNER] | [DATE] | Pending |
| 6 | Conduct workforce HIPAA training | [OWNER] | [DATE] | Pending |
| 7 | Document and test disaster recovery procedures | [OWNER] | [DATE] | Pending |
| 8 | Implement IP allowlisting for admin access | [OWNER] | [DATE] | Pending |
| 9 | Review and update incident response plan | [OWNER] | [DATE] | Pending |
| 10 | Schedule next risk assessment (annual) | [OWNER] | [DATE + 1 year] | Pending |

---

**Assessment Approved By:**
Name: ___________________________
Title: ___________________________
Date: ___________________________`
      },
    ],
  },
  {
    id: "incident-response",
    title: "Incident Response Plan",
    category: "Administrative Safeguards",
    description: "Procedures for identifying, responding to, and reporting security incidents and breaches",
    lastUpdated: "2026-03-28",
    status: "template",
    sections: [
      {
        title: "1. Purpose and Scope",
        content: `This Incident Response Plan (IRP) establishes procedures for [ORGANIZATION NAME] to identify, contain, investigate, and recover from security incidents involving protected health information (PHI), in compliance with the HIPAA Breach Notification Rule (45 CFR §§ 164.400-414).

**Scope**: This plan applies to all workforce members, contractors, and business associates who access, process, or manage PHI through the LLM Hub platform and related systems.

**Incident Response Team (IRT):**
| Role | Name | Contact | Responsibilities |
|------|------|---------|-----------------|
| Incident Commander | [NAME] | [PHONE/EMAIL] | Overall incident coordination |
| Privacy Officer | [NAME] | [PHONE/EMAIL] | PHI breach assessment |
| Security Officer | [NAME] | [PHONE/EMAIL] | Technical investigation |
| Legal Counsel | [NAME] | [PHONE/EMAIL] | Legal and regulatory guidance |
| Communications Lead | [NAME] | [PHONE/EMAIL] | Internal/external communications |`
      },
      {
        title: "2. Incident Classification",
        content: `**Level 1 — Critical (Breach of Unsecured PHI)**
- Confirmed unauthorized access to, or disclosure of, unsecured PHI
- Ransomware affecting systems containing PHI
- Stolen devices containing unencrypted PHI
- Response time: Immediate (within 1 hour)

**Level 2 — High (Potential Breach)**
- Suspicious access patterns in audit logs
- Unauthorized user accounts discovered
- Phishing attack targeting admin credentials
- Anomalous data export or API access volumes
- Response time: Within 4 hours

**Level 3 — Medium (Security Incident, No PHI Impact)**
- Failed intrusion attempts
- Malware detected and contained
- Policy violation by workforce member
- System misconfiguration discovered
- Response time: Within 24 hours

**Level 4 — Low (Minor Event)**
- Routine security alerts
- Unsuccessful phishing attempts (no compromise)
- Minor policy deviations
- Response time: Within 72 hours`
      },
      {
        title: "3. Response Procedures",
        content: `**Phase 1: Detection and Reporting**
1. Any workforce member who suspects or discovers a security incident must report it immediately to the Security Officer at [CONTACT].
2. The Security Officer reviews the LLM Hub audit logs (\`/compliance\` → Audit Log tab) to assess scope.
3. Document the initial report using the Incident Report Form (Section 7).

**Phase 2: Containment**
1. Isolate affected systems (disable compromised accounts, revoke API keys).
2. Preserve audit logs and system logs as evidence.
3. If PHI is involved, engage the Privacy Officer immediately.
4. Short-term containment: Block unauthorized access while maintaining operations.
5. Long-term containment: Apply permanent fixes (patches, access control changes).

**Phase 3: Investigation**
1. Determine the root cause and full scope of the incident.
2. Identify all PHI potentially compromised (types, volume, individuals affected).
3. Review audit logs for: who accessed what, when, from which IP.
4. Use the PHI Access Report (\`/compliance\` → PHI Access tab) for affected period.
5. Document all findings in the Incident Investigation Report.

**Phase 4: Notification** (for confirmed breaches of unsecured PHI)
1. **Individual Notification**: Written notice to affected individuals within **60 days** of breach discovery. Must include: description of breach, types of information involved, steps individuals should take, what the organization is doing, and contact information.
2. **HHS Notification**: If breach affects 500+ individuals, notify HHS within **60 days**. If fewer than 500, notify HHS within 60 days of end of calendar year.
3. **Media Notification**: If breach affects 500+ residents of a state/jurisdiction, notify prominent media outlets.

**Phase 5: Recovery**
1. Restore affected systems from verified clean backups.
2. Implement additional security controls to prevent recurrence.
3. Monitor systems for signs of continued unauthorized activity.
4. Update access controls and credentials as necessary.

**Phase 6: Post-Incident Review**
1. Conduct a post-incident review within 14 days of incident closure.
2. Document lessons learned and update this IRP accordingly.
3. Update the Security Risk Assessment with new findings.
4. Provide additional workforce training if needed.`
      },
      {
        title: "4. Breach Risk Assessment",
        content: `Per 45 CFR § 164.402, conduct a risk assessment considering these factors to determine if a breach occurred:

**Factor 1: Nature and Extent of PHI Involved**
- What types of identifiers were involved? (names, SSN, diagnoses, etc.)
- What is the potential for re-identification?

**Factor 2: Unauthorized Person Who Used or Received the PHI**
- Was it a workforce member or external party?
- Did they have any legitimate access to PHI?
- Is there a reasonable basis to believe they will misuse the information?

**Factor 3: Whether PHI Was Actually Acquired or Viewed**
- Was the PHI actually accessed or viewed?
- Was the disclosure limited (e.g., documents were in a sealed envelope)?

**Factor 4: Extent of Risk Mitigation**
- Were satisfactory assurances obtained from the recipient?
- Was the PHI returned or destroyed?
- What containment steps were taken?

**Determination**: If the risk assessment demonstrates a **low probability** that the PHI has been compromised, it does NOT constitute a breach requiring notification. Document this determination thoroughly.`
      },
      {
        title: "5. Communication Templates",
        content: `**5.1 Individual Breach Notification Letter**

[DATE]

Dear [INDIVIDUAL NAME],

We are writing to inform you of an incident that may have involved some of your health information. We take the privacy and security of your information very seriously and want to provide you with information about the incident, what we are doing about it, and steps you can take to protect yourself.

**What Happened**: On [DATE OF DISCOVERY], we discovered that [BRIEF DESCRIPTION OF INCIDENT]. The incident occurred on or about [DATE OF INCIDENT].

**What Information Was Involved**: The types of information that may have been involved include: [LIST TYPES — e.g., name, date of birth, medical record number, diagnosis information, treatment information].

**What We Are Doing**: Upon learning of this incident, we immediately [DESCRIBE RESPONSE ACTIONS]. We have also [DESCRIBE PREVENTIVE MEASURES].

**What You Can Do**: We recommend that you [SPECIFIC STEPS — e.g., monitor your explanation of benefits statements, review your medical records for accuracy, consider placing a fraud alert on your credit files].

**For More Information**: If you have questions or need additional information, please contact [CONTACT NAME] at [PHONE] or [EMAIL]. You may also file a complaint with the Secretary of Health and Human Services at www.hhs.gov/hipaa/filing-a-complaint.

Sincerely,
[PRIVACY OFFICER NAME]
[TITLE]

---

**5.2 HHS Breach Report Checklist**
Submit via https://ocrportal.hhs.gov/ocr/breach/wizard_breach.jsf

Required information:
☐ Covered entity name and contact information
☐ Business associate involved (if applicable)
☐ Date of breach and date of discovery
☐ Number of individuals affected
☐ Type of breach (theft, loss, unauthorized access, hacking, etc.)
☐ Location of breached information (laptop, email, server, etc.)
☐ Types of PHI involved
☐ Description of the breach
☐ Safeguards in place at time of breach
☐ Actions taken in response`
      },
      {
        title: "6. Escalation Matrix",
        content: `| Timeframe | Action | Responsible |
|-----------|--------|-------------|
| 0-1 hour | Initial detection and containment | Security Officer |
| 1-4 hours | Incident classification and IRT activation | Incident Commander |
| 4-24 hours | Investigation and scope determination | IRT |
| 24-48 hours | Breach risk assessment completion | Privacy Officer |
| 48-72 hours | Executive notification and legal review | Legal Counsel |
| Within 60 days | Individual and HHS notification (if breach confirmed) | Privacy Officer |
| Within 14 days post-closure | Post-incident review and plan updates | IRT |

**After-Hours Emergency Contact Chain:**
1. Security Officer: [PHONE]
2. Incident Commander: [PHONE]
3. Privacy Officer: [PHONE]
4. Legal Counsel: [PHONE]`
      },
      {
        title: "7. Incident Report Form",
        content: `**SECURITY INCIDENT REPORT**

**Report Date**: _______________
**Report Time**: _______________
**Reported By**: _______________
**Contact Info**: _______________

**Incident Details:**
Date/Time Discovered: _______________
Date/Time Occurred (if known): _______________
Location/System: _______________

**Incident Type** (check all that apply):
☐ Unauthorized access   ☐ Unauthorized disclosure
☐ Theft/loss of device  ☐ Hacking/IT incident
☐ Ransomware/malware    ☐ Phishing compromise
☐ Improper disposal     ☐ Other: _______________

**Description of Incident:**
________________________________________
________________________________________
________________________________________

**PHI Involvement:**
☐ Yes  ☐ No  ☐ Unknown
If yes, describe types of PHI: _______________
Estimated number of individuals affected: _______________

**Immediate Actions Taken:**
________________________________________
________________________________________

**Systems/Data Affected:**
________________________________________

**Reported to Supervisor?** ☐ Yes ☐ No
**Reported to Security Officer?** ☐ Yes ☐ No

---
**FOR OFFICIAL USE ONLY:**
Incident #: _______________
Classification Level: ☐ 1-Critical ☐ 2-High ☐ 3-Medium ☐ 4-Low
Assigned To: _______________
Resolution Date: _______________
Root Cause: _______________`
      },
    ],
  },
  {
    id: "workforce-training",
    title: "Workforce HIPAA Training Policy",
    category: "Administrative Safeguards",
    description: "Training requirements and curriculum for all workforce members handling PHI",
    lastUpdated: "2026-03-28",
    status: "template",
    sections: [
      {
        title: "1. Training Policy",
        content: `**Policy Statement**: All workforce members of [ORGANIZATION NAME] who have access to protected health information (PHI) shall receive HIPAA privacy and security training, in compliance with 45 CFR § 164.530(b) and 45 CFR § 164.308(a)(5).

**Applicability**: This policy applies to all employees, contractors, volunteers, and any other persons whose conduct, in the performance of work for [ORGANIZATION NAME], is under the direct control of the entity, whether or not they are paid.

**Training Requirements:**
- **New Hire Training**: Within **30 days** of beginning work that involves PHI access
- **Annual Refresher**: All workforce members, annually
- **Role Change Training**: Within **30 days** when job functions change to require PHI access
- **Incident-Based Training**: As needed when policies change or incidents occur

**Documentation**: Training completion records shall be maintained for a minimum of **6 years** from the date of creation or the date when the policy was last in effect, whichever is later.`
      },
      {
        title: "2. Core Training Curriculum",
        content: `**Module 1: HIPAA Fundamentals** (30 minutes)
- What is HIPAA and why it matters
- Key definitions: PHI, ePHI, covered entity, business associate
- The Privacy Rule, Security Rule, and Breach Notification Rule
- Patient rights under HIPAA
- Penalties for non-compliance (civil and criminal)

**Module 2: Identifying and Protecting PHI** (30 minutes)
- The 18 HIPAA identifiers
- Recognizing PHI in different contexts (paper, electronic, verbal)
- Minimum Necessary standard
- De-identification methods (Safe Harbor, Expert Determination)
- PHI in AI/LLM contexts: prompts, responses, training data

**Module 3: Security Awareness** (45 minutes)
- Password policies and multi-factor authentication
- Recognizing phishing emails and social engineering
- Secure use of the LLM Hub platform
- Session timeout requirements (15-minute auto-logout)
- Proper handling of API keys and credentials
- Secure workstation practices (lock screen, clean desk)
- Incident reporting procedures

**Module 4: Platform-Specific Training** (45 minutes)
- LLM Hub access controls and role-based permissions
- Understanding audit logging (what is tracked)
- Proper use of Clinical AI module with patient data
- PHI handling in Voice Agent conversations
- Safe use of Memory and RAG features with sensitive data
- How to review your own audit trail
- Reporting suspected incidents via the platform

**Module 5: Breach Response** (30 minutes)
- What constitutes a breach
- Workforce member responsibilities when a breach is suspected
- How to report incidents (who to contact, when)
- Containment actions workforce members can take
- Communication dos and don'ts during an incident`
      },
      {
        title: "3. Training Acknowledgment Form",
        content: `**HIPAA TRAINING ACKNOWLEDGMENT**

I, _________________________________ (print name), acknowledge that:

1. I have completed the HIPAA Privacy and Security training provided by [ORGANIZATION NAME].

2. I understand my obligations regarding the protection of Protected Health Information (PHI).

3. I understand that I must:
   - Only access PHI that is necessary for my job functions
   - Report any suspected security incidents or breaches immediately
   - Follow all privacy and security policies and procedures
   - Lock my workstation when stepping away
   - Never share my login credentials
   - Log out of the LLM Hub platform when not actively using it

4. I understand that violations of HIPAA policies may result in disciplinary action, up to and including termination of employment, and may also result in civil or criminal penalties.

5. I understand that I must complete annual refresher training and any additional training when policies change.

**Employee Signature**: _______________________
**Date**: _______________
**Department**: _______________
**Supervisor**: _______________

**Training Completion Record:**
| Module | Date Completed | Score | Instructor |
|--------|---------------|-------|------------|
| HIPAA Fundamentals | _____ | ___/100 | _________ |
| Identifying PHI | _____ | ___/100 | _________ |
| Security Awareness | _____ | ___/100 | _________ |
| Platform-Specific | _____ | ___/100 | _________ |
| Breach Response | _____ | ___/100 | _________ |`
      },
      {
        title: "4. Training Compliance Tracking",
        content: `**Annual Training Compliance Report**

Organization: [ORGANIZATION NAME]
Reporting Period: [START DATE] to [END DATE]
Privacy Officer: [NAME]

| Metric | Count | Percentage |
|--------|-------|-----------|
| Total workforce members requiring training | ___ | 100% |
| Training completed on time | ___ | ___% |
| Training overdue (< 30 days) | ___ | ___% |
| Training overdue (> 30 days) | ___ | ___% |
| Exemptions granted | ___ | ___% |

**Non-Compliance Follow-up Actions:**
| Employee | Department | Days Overdue | Action Taken | Resolution Date |
|----------|-----------|-------------|-------------|----------------|
| ________ | _________ | ___________ | ___________ | _______________ |

**Training Program Improvements:**
- Feedback from participants: _______________
- Content updates needed: _______________
- Delivery method changes: _______________
- Next review date: _______________`
      },
    ],
  },
  {
    id: "physical-safeguards",
    title: "Physical Safeguards Policy",
    category: "Physical Safeguards",
    description: "Policies for physical access controls, workstation security, and device management",
    lastUpdated: "2026-03-28",
    status: "template",
    sections: [
      {
        title: "1. Facility Access Controls",
        content: `**Policy**: [ORGANIZATION NAME] shall implement policies and procedures to limit physical access to its electronic information systems and the facility or facilities in which they are housed, while ensuring that properly authorized access is allowed, in compliance with 45 CFR § 164.310(a)(1).

**1.1 Facility Security Plan**
- All areas containing servers, networking equipment, or workstations that access ePHI shall be designated as restricted areas.
- Access to restricted areas shall require [SPECIFY: key card, biometric, PIN code, etc.].
- Visitor access to restricted areas requires escort by authorized personnel.
- Visitor log maintained at each restricted area entry point.

**1.2 Access Authorization**
| Area | Access Level | Authorized Personnel |
|------|-------------|---------------------|
| Server Room / Data Center | Restricted | IT Administrator, Security Officer |
| Admin Office | Controlled | Admin staff, Management |
| General Office | Standard | All workforce members |
| Remote Access | Monitored | Authorized remote workers |

**1.3 VPS / Cloud Infrastructure**
- VPS hosting Ollama (72.60.167.64): Physical security managed by hosting provider
- Verify hosting provider's SOC 2 Type II compliance annually
- Replit Cloud: Physical security managed by Replit/Google Cloud
- Request and maintain copies of provider security certifications`
      },
      {
        title: "2. Workstation Use and Security",
        content: `**Policy**: [ORGANIZATION NAME] shall implement policies and procedures that specify the proper functions to be performed, the manner in which those functions are to be performed, and the physical attributes of the surroundings of a specific workstation or class of workstation that can access ePHI, in compliance with 45 CFR § 164.310(b).

**2.1 Workstation Configuration Requirements**
- Operating system must be kept current with security patches
- Automatic screen lock after **5 minutes** of inactivity
- Full-disk encryption enabled (BitLocker / FileVault)
- Antivirus/anti-malware software installed and updated
- Personal firewall enabled
- No unauthorized software installations
- LLM Hub session timeout: **15 minutes** of inactivity (platform-enforced)

**2.2 Workstation Physical Security**
- Workstations must not be left unattended while logged into systems containing ePHI
- Screens must be positioned so that ePHI is not visible to unauthorized persons
- Clean desk policy: No PHI left on desks when area is unattended
- Portable devices must be physically secured when not in use (cable lock, locked drawer)

**2.3 Remote Workstation Requirements**
- VPN or secure connection required for remote access to ePHI
- Private workspace required (no public areas such as coffee shops)
- Screen privacy filter recommended
- Same security configuration requirements as on-site workstations
- No printing of PHI on home/shared printers without approval`
      },
      {
        title: "3. Device and Media Controls",
        content: `**Policy**: [ORGANIZATION NAME] shall implement policies and procedures that govern the receipt and removal of hardware and electronic media that contain ePHI into and out of a facility, and the movement of these items within the facility, in compliance with 45 CFR § 164.310(d)(1).

**3.1 Device Inventory**
Maintain a current inventory of all devices that store or access ePHI:

| Device Type | Identifier | Assigned To | Encryption | Last Audited |
|------------|-----------|------------|-----------|-------------|
| Laptop | _________ | _________ | ☐ Yes ☐ No | _________ |
| Desktop | _________ | _________ | ☐ Yes ☐ No | _________ |
| Mobile Phone | _________ | _________ | ☐ Yes ☐ No | _________ |
| USB Drive | _________ | _________ | ☐ Yes ☐ No | _________ |
| Server | _________ | _________ | ☐ Yes ☐ No | _________ |

**3.2 Media Disposal**
- Hard drives: NIST SP 800-88 compliant destruction (degaussing, shredding, or verified overwrite)
- SSDs: Cryptographic erasure or physical destruction
- Paper PHI: Cross-cut shredding
- Backup media: Secure destruction with certificate of destruction
- Document all disposal activities with date, method, witness, and certificate

**3.3 Device Reuse**
- All ePHI must be removed using approved sanitization methods before reuse
- Sanitization must be verified and documented
- Follow NIST SP 800-88 Guidelines for Media Sanitization

**3.4 Lost or Stolen Devices**
1. Report immediately to Security Officer (within 1 hour)
2. Initiate remote wipe if device management software is installed
3. Assess whether ePHI was encrypted (if yes, not a breach per HIPAA Safe Harbor)
4. Document incident and follow Incident Response Plan
5. Replace device and restore access via new credentials`
      },
      {
        title: "4. Environmental Controls",
        content: `**4.1 Server/Equipment Room**
- Temperature monitoring: 64-75°F (18-24°C)
- Humidity monitoring: 40-60% relative humidity
- Fire suppression: [TYPE — e.g., clean agent, sprinkler]
- UPS / backup power: Minimum 30-minute runtime
- Generator backup: [YES/NO]
- Water detection sensors installed: [YES/NO]
- Surveillance cameras: [YES/NO]
- Intrusion detection/alarm: [YES/NO]

**4.2 Maintenance Records**
| System | Last Inspection | Next Inspection | Responsible |
|--------|----------------|-----------------|-------------|
| Fire suppression | _________ | _________ | _________ |
| HVAC | _________ | _________ | _________ |
| UPS / Battery | _________ | _________ | _________ |
| Security cameras | _________ | _________ | _________ |
| Access control system | _________ | _________ | _________ |

**4.3 Emergency Procedures**
- Power failure: UPS provides bridging power; critical systems on generator
- Fire: Evacuate personnel; automatic suppression activates; contact fire department
- Flood/water: Power down affected systems; contact facilities management
- Unauthorized access: Contact Security Officer; review surveillance footage`
      },
    ],
  },
  {
    id: "privacy-policy",
    title: "Notice of Privacy Practices",
    category: "Administrative Safeguards",
    description: "Patient-facing notice explaining how PHI is used and protected",
    lastUpdated: "2026-03-28",
    status: "template",
    sections: [
      {
        title: "Notice of Privacy Practices",
        content: `**[ORGANIZATION NAME]
NOTICE OF PRIVACY PRACTICES**

Effective Date: [DATE]

**THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.**

---

**Our Pledge Regarding Your Health Information**

We understand that health information about you is personal. We are committed to protecting your health information. We create a record of the care and services you receive through our AI-assisted clinical platform. We need this record to provide quality care and to comply with certain legal requirements.

This notice tells you about the ways we may use and share your health information. It also describes your rights and certain obligations we have regarding the use and disclosure of your health information.

---

**How We May Use and Disclose Your Health Information**

**For Treatment**: We may use your health information to provide you with clinical decision support, diagnostic assistance, and treatment recommendations through our AI platform. For example, clinical information entered into the Clinical AI module may be analyzed to provide evidence-based recommendations.

**For Payment**: We may use and disclose your health information so that treatment and services may be billed and payment collected.

**For Health Care Operations**: We may use and disclose your health information for operations purposes, including quality improvement, training, and administrative functions.

**AI-Specific Disclosures**: Your health information may be processed by artificial intelligence systems, including:
- Clinical AI decision support tools
- Voice-based health interactions
- Natural language processing for medical documentation
- Research synthesis involving your clinical data

All AI processing is subject to the same privacy protections as other uses of your PHI.`
      },
      {
        title: "Your Rights",
        content: `**Your Rights Regarding Your Health Information**

You have the following rights regarding your health information:

**Right to Inspect and Copy**: You have the right to inspect and copy your health information maintained by us. To inspect and copy your information, submit your request in writing to the Privacy Officer.

**Right to Amend**: If you feel that health information we have about you is incorrect or incomplete, you may ask us to amend the information. To request an amendment, submit your request in writing to the Privacy Officer.

**Right to an Accounting of Disclosures**: You have the right to request a list of disclosures we have made of your health information. Our platform's audit logging system maintains detailed records of all access to your health information. To request an accounting, contact the Privacy Officer.

**Right to Request Restrictions**: You have the right to request a restriction or limitation on the health information we use or disclose about you.

**Right to Request Confidential Communications**: You have the right to request that we communicate with you about health matters in a certain way or at a certain location.

**Right to a Paper Copy of This Notice**: You have the right to a paper copy of this notice at any time.

**Right to Be Notified of a Breach**: You have the right to be notified in the event of a breach of your unsecured PHI.`
      },
      {
        title: "Contact Information",
        content: `**Our Responsibilities**

We are required by law to:
- Maintain the privacy of your health information
- Provide you with this notice of our legal duties and privacy practices
- Follow the terms of the notice currently in effect
- Notify you if we are unable to agree to a requested restriction

We will not use or disclose your information without your authorization, except as described in this notice. If we do use or disclose your information for other purposes, we will obtain your written authorization first. You may revoke your authorization at any time in writing.

**Changes to This Notice**: We reserve the right to change this notice. A revised notice will apply to health information we already have about you as well as any information we receive in the future.

**Complaints**: If you believe your privacy rights have been violated, you may file a complaint with:

[ORGANIZATION NAME]
Privacy Officer: [NAME]
Address: [ADDRESS]
Phone: [PHONE]
Email: [EMAIL]

You may also file a complaint with the Secretary of the U.S. Department of Health and Human Services. You will not be retaliated against for filing a complaint.

**HHS Office for Civil Rights**
Website: www.hhs.gov/hipaa/filing-a-complaint
Phone: 1-877-696-6775`
      },
    ],
  },
  {
    id: "data-backup-recovery",
    title: "Data Backup & Disaster Recovery Plan",
    category: "Technical Safeguards",
    description: "Procedures for data backup, retention, and disaster recovery to ensure ePHI availability",
    lastUpdated: "2026-03-30",
    status: "template",
    sections: [
      {
        title: "1. Purpose and Scope",
        content: `**Purpose**: This plan establishes procedures for creating and maintaining retrievable exact copies of electronic protected health information (ePHI), and for restoring any loss of data, in compliance with 45 CFR § 164.308(a)(7) (Contingency Plan) and 45 CFR § 164.312(a)(2)(ii) (Data Backup Plan).

**Scope**: All systems containing ePHI including:
- LLM Hub PostgreSQL database (audit logs, prompts, memory, cost data)
- Ollama LLM server configuration and model data (VPS 72.60.167.64)
- Application configuration and environment variables
- RAG knowledge base and embeddings
- Voice agent recordings and transcripts
- Clinical AI data and research sessions`
      },
      {
        title: "2. Backup Schedule",
        content: `| Data Type | Backup Method | Frequency | Retention | Storage Location | Encryption |
|-----------|--------------|-----------|-----------|-----------------|------------|
| PostgreSQL Database | Automated pg_dump | Daily | 90 days | [BACKUP LOCATION] | AES-256 |
| Audit Logs | Database backup + log export | Daily | 6 years (HIPAA req) | [BACKUP LOCATION] | AES-256 |
| Application Code | Git repository | On every change | Indefinite | Git remote | TLS in transit |
| Ollama Models | Model export | Weekly | 30 days | [BACKUP LOCATION] | AES-256 |
| RAG Embeddings | Database backup | Daily | 90 days | [BACKUP LOCATION] | AES-256 |
| Configuration/Secrets | Encrypted export | Weekly | 90 days | [SECURE LOCATION] | AES-256 |
| Voice Recordings | File system backup | Daily | Per retention policy | [BACKUP LOCATION] | AES-256 |

**Backup Verification**: Test backup restoration at least **quarterly** to ensure backups are complete and usable.`
      },
      {
        title: "3. Recovery Time and Point Objectives",
        content: `**Recovery Time Objective (RTO)**: Maximum acceptable downtime before systems must be restored.

| System | RTO | Priority |
|--------|-----|----------|
| LLM Hub Application | 4 hours | Critical |
| PostgreSQL Database | 2 hours | Critical |
| Audit Log System | 4 hours | Critical |
| Ollama LLM Server | 8 hours | High |
| RAG Knowledge Base | 12 hours | Medium |
| Voice Agent | 8 hours | High |

**Recovery Point Objective (RPO)**: Maximum acceptable data loss measured in time.

| System | RPO | Justification |
|--------|-----|---------------|
| PostgreSQL Database | 24 hours | Daily backups |
| Audit Logs | 24 hours | Daily backups, 6-year retention requirement |
| Application Config | 0 (no loss) | Version controlled |
| Ollama Models | 7 days | Weekly backups, models can be re-downloaded |`
      },
      {
        title: "4. Disaster Recovery Procedures",
        content: `**Scenario 1: Database Corruption or Loss**
1. Identify the extent of data loss from audit logs and monitoring
2. Stop application services to prevent further data writes
3. Restore PostgreSQL from most recent verified backup
4. Verify data integrity: row counts, audit log continuity, PHI data intact
5. Restart application services
6. Document the incident and recovery in the Incident Report

**Scenario 2: VPS Server Failure (72.60.167.64)**
1. Provision replacement VPS with same security configuration
2. Install Ollama and restore model configurations from backup
3. Update DNS/IP references in LLM Hub configuration
4. Verify Ollama connectivity and model availability
5. Run test queries to confirm functionality

**Scenario 3: Complete Platform Failure**
1. Activate incident response team
2. Deploy application from Git repository to backup environment
3. Restore database from most recent backup
4. Restore Ollama server (Scenario 2 procedure)
5. Verify all integrations (OpenAI, Google, AgentFlow)
6. Conduct full system test before restoring user access
7. Notify affected users per incident response plan

**Scenario 4: Ransomware Attack**
1. Immediately isolate affected systems from network
2. Do NOT pay ransom — contact law enforcement
3. Assess scope using audit logs (check for PHI breach)
4. Wipe and rebuild affected systems from clean backups
5. Follow Incident Response Plan for breach notification if PHI involved`
      },
      {
        title: "5. Testing and Maintenance",
        content: `**Quarterly Backup Restoration Test**:
1. Select a random backup from the past quarter
2. Restore to an isolated test environment
3. Verify data integrity and completeness
4. Document test results and any issues discovered
5. Update procedures if problems are found

| Test Date | Backup Date | Restore Successful? | Issues Found | Tester |
|-----------|-------------|--------------------|--------------| -------|
| [DATE] | [DATE] | ☐ Yes ☐ No | ____________ | ______ |
| [DATE] | [DATE] | ☐ Yes ☐ No | ____________ | ______ |
| [DATE] | [DATE] | ☐ Yes ☐ No | ____________ | ______ |
| [DATE] | [DATE] | ☐ Yes ☐ No | ____________ | ______ |

**Annual Plan Review**: This plan must be reviewed and updated annually or after any significant infrastructure change.

Reviewed By: _______________
Date: _______________
Next Review Date: _______________`
      },
    ],
  },
  {
    id: "encryption-policy",
    title: "Encryption & Data Protection Policy",
    category: "Technical Safeguards",
    description: "Standards for encrypting ePHI at rest and in transit per HIPAA Security Rule",
    lastUpdated: "2026-03-30",
    status: "template",
    sections: [
      {
        title: "1. Policy Statement",
        content: `**Purpose**: This policy establishes requirements for encrypting electronic protected health information (ePHI) to guard against unauthorized access, in compliance with 45 CFR § 164.312(a)(2)(iv) (Encryption and Decryption) and 45 CFR § 164.312(e)(2)(ii) (Transmission Security — Encryption).

**Scope**: All ePHI created, received, maintained, or transmitted by [ORGANIZATION NAME] through the LLM Hub platform and associated systems.

**Policy**: All ePHI must be encrypted both in transit and at rest using industry-standard encryption algorithms. Unencrypted ePHI is considered "unsecured PHI" under the HIPAA Breach Notification Rule, meaning any unauthorized access constitutes a reportable breach.`
      },
      {
        title: "2. Encryption Standards",
        content: `**2.1 Data in Transit**
| Connection | Protocol | Minimum Standard | Current Status |
|-----------|----------|-----------------|---------------|
| User ↔ LLM Hub | HTTPS (TLS 1.2+) | AES-128-GCM or higher | ✓ Enforced |
| LLM Hub ↔ PostgreSQL | TLS 1.2+ | AES-256 | ✓ Enforced |
| LLM Hub ↔ Ollama VPS | HTTPS or SSH tunnel | AES-256 | [VERIFY] |
| LLM Hub ↔ OpenAI API | HTTPS (TLS 1.2+) | AES-128-GCM | ✓ Enforced |
| LLM Hub ↔ Google APIs | HTTPS (TLS 1.2+) | AES-128-GCM | ✓ Enforced |
| Internal API calls | HTTPS | AES-128-GCM | ✓ Enforced |

**2.2 Data at Rest**
| Data Store | Encryption Method | Key Management | Status |
|-----------|------------------|---------------|--------|
| PostgreSQL Database | Transparent Data Encryption | Provider-managed | [VERIFY] |
| PHI Database Columns | Column-level encryption | Application-managed | [IMPLEMENT] |
| Backup Files | AES-256 file encryption | Dedicated backup key | [IMPLEMENT] |
| Audit Logs | Database encryption | Provider-managed | [VERIFY] |
| Ollama Model Data | Disk encryption | OS-level | [VERIFY] |
| Voice Recordings | AES-256 file encryption | Application-managed | [IMPLEMENT] |

**2.3 Approved Algorithms**
- Symmetric: AES-128, AES-256 (preferred)
- Hashing: SHA-256, SHA-384, SHA-512
- Key Exchange: RSA-2048+, ECDHE
- TLS: Version 1.2 minimum, 1.3 preferred
- **Prohibited**: DES, 3DES, RC4, MD5, SHA-1, TLS 1.0/1.1`
      },
      {
        title: "3. Key Management",
        content: `**3.1 Key Generation**
- Encryption keys must be generated using cryptographically secure random number generators
- Key length must meet or exceed algorithm requirements (AES-256 = 256-bit key)
- Keys must never be hardcoded in source code or stored in plaintext

**3.2 Key Storage**
- Production encryption keys stored in: [KEY MANAGEMENT SYSTEM — e.g., AWS KMS, HashiCorp Vault, environment secrets]
- API keys and secrets stored in Replit Secrets (environment variables)
- Never store keys in version control, log files, or unencrypted configuration files

**3.3 Key Rotation Schedule**
| Key Type | Rotation Frequency | Last Rotated | Next Rotation |
|----------|-------------------|-------------|---------------|
| Database encryption key | Annual | [DATE] | [DATE] |
| TLS certificates | Annual (or on expiry) | [DATE] | [DATE] |
| API keys (OpenAI, etc.) | Annual or on compromise | [DATE] | [DATE] |
| Backup encryption key | Annual | [DATE] | [DATE] |
| Application signing keys | Annual | [DATE] | [DATE] |

**3.4 Key Revocation**
- Immediately revoke and rotate any key suspected of compromise
- Document the reason for revocation and the replacement key details
- Re-encrypt affected data with the new key if feasible`
      },
      {
        title: "4. Compliance Verification",
        content: `**Quarterly Encryption Audit Checklist**:

☐ All external connections use TLS 1.2 or higher
☐ No plaintext PHI transmitted over unencrypted channels
☐ Database encryption is active and verified
☐ Backup files are encrypted before storage
☐ Key rotation schedule is current
☐ No encryption keys stored in source code or logs
☐ TLS certificates are valid and not near expiration
☐ Deprecated algorithms (DES, RC4, SHA-1, TLS 1.0/1.1) are not in use
☐ Mobile/remote access uses encrypted connections
☐ Third-party vendor encryption compliance verified

**Audit Performed By**: _______________
**Date**: _______________
**Findings**: _______________
**Corrective Actions**: _______________`
      },
    ],
  },
  {
    id: "sanctions-policy",
    title: "Sanctions Policy",
    category: "Administrative Safeguards",
    description: "Policy for disciplinary actions against workforce members who violate HIPAA policies",
    lastUpdated: "2026-03-30",
    status: "template",
    sections: [
      {
        title: "1. Policy Statement",
        content: `**Purpose**: To establish a sanctions policy for workforce members who fail to comply with the security policies and procedures of [ORGANIZATION NAME], in compliance with 45 CFR § 164.308(a)(1)(ii)(C) (Sanction Policy).

**Scope**: This policy applies to all workforce members, including employees, contractors, volunteers, and any individual whose conduct in the performance of work for [ORGANIZATION NAME] is under the direct control of the entity.

**Policy**: [ORGANIZATION NAME] shall apply appropriate sanctions against workforce members who fail to comply with its HIPAA privacy and security policies and procedures. Sanctions shall be applied consistently and proportionally to the severity of the violation.`
      },
      {
        title: "2. Violation Categories and Sanctions",
        content: `**Level 1 — Minor Violation (Unintentional/First Offense)**
Examples:
- Failing to log out of LLM Hub session before leaving workstation
- Leaving PHI visible on screen in a shared area
- Forgetting to use encrypted email for PHI transmission (no actual breach)

Sanctions:
- Verbal warning with documentation
- Mandatory refresher training within 14 days
- Notation in personnel file

---

**Level 2 — Moderate Violation (Negligence/Repeated Minor)**
Examples:
- Repeated failure to follow session timeout procedures
- Sharing login credentials with another workforce member
- Accessing PHI beyond minimum necessary for job function
- Failure to complete required HIPAA training on time

Sanctions:
- Written warning
- Mandatory re-training within 7 days
- Increased monitoring of system access (audit log review)
- Possible suspension of PHI access privileges

---

**Level 3 — Serious Violation (Knowing/Pattern of Negligence)**
Examples:
- Unauthorized disclosure of PHI to unauthorized persons
- Accessing patient records without legitimate purpose (snooping)
- Failure to report a known security incident
- Disabling or circumventing security controls

Sanctions:
- Final written warning or suspension without pay
- Mandatory comprehensive HIPAA re-training
- Revocation of PHI access privileges
- Possible termination of employment

---

**Level 4 — Severe Violation (Willful/Malicious)**
Examples:
- Intentional unauthorized disclosure of PHI for personal gain
- Selling or distributing PHI
- Deliberate sabotage of security systems
- Identity theft using patient information

Sanctions:
- Immediate termination of employment
- Referral to law enforcement
- Report to applicable licensing boards
- Civil and criminal prosecution as applicable`
      },
      {
        title: "3. Investigation and Due Process",
        content: `**3.1 Reporting Violations**
- Any workforce member who becomes aware of a potential HIPAA violation must report it to the Privacy Officer or Security Officer immediately
- Reports may be made anonymously
- No retaliation shall be taken against individuals who report violations in good faith

**3.2 Investigation Process**
1. Privacy/Security Officer receives and documents the report
2. Preliminary review to determine if investigation is warranted (within 48 hours)
3. Formal investigation if warranted:
   a. Review relevant audit logs from the LLM Hub platform
   b. Interview involved parties
   c. Gather and preserve evidence
   d. Determine whether a violation occurred and its severity level
4. Investigation findings documented in writing
5. Sanctions determination made in consultation with HR and legal counsel
6. Workforce member notified of findings and sanctions
7. Appeal process (if applicable per employment agreement)

**3.3 Documentation Requirements**
All sanctions must be documented, including:
- Date of violation and date of discovery
- Description of the violation
- Evidence reviewed (including audit log references)
- Sanction applied
- Corrective actions required
- Follow-up verification dates

Records retained for minimum **6 years** per HIPAA requirements.`
      },
      {
        title: "4. Sanctions Log",
        content: `**SANCTIONS TRACKING LOG**

| Date | Employee | Violation Level | Description | Sanction Applied | Training Required | Follow-up Date | Resolved |
|------|----------|----------------|-------------|-----------------|------------------|----------------|----------|
| ____ | ________ | ☐1 ☐2 ☐3 ☐4 | ____________ | ____________ | ☐ Yes ☐ No | _________ | ☐ Yes ☐ No |
| ____ | ________ | ☐1 ☐2 ☐3 ☐4 | ____________ | ____________ | ☐ Yes ☐ No | _________ | ☐ Yes ☐ No |
| ____ | ________ | ☐1 ☐2 ☐3 ☐4 | ____________ | ____________ | ☐ Yes ☐ No | _________ | ☐ Yes ☐ No |

**Annual Review**: This policy and all sanctions records shall be reviewed annually by the Privacy Officer.

Reviewed By: _______________
Date: _______________
Next Review: _______________`
      },
    ],
  },
  {
    id: "contingency-plan",
    title: "Contingency Plan",
    category: "Administrative Safeguards",
    description: "Emergency mode operation and procedures for responding to system failures or disasters",
    lastUpdated: "2026-03-30",
    status: "template",
    sections: [
      {
        title: "1. Purpose and Scope",
        content: `**Purpose**: To establish procedures for responding to an emergency or other occurrence (e.g., fire, vandalism, system failure, natural disaster) that damages systems containing ePHI, in compliance with 45 CFR § 164.308(a)(7)(i) (Contingency Plan).

**Required Components** (per HIPAA Security Rule):
- Data Backup Plan — 45 CFR § 164.308(a)(7)(ii)(A)
- Disaster Recovery Plan — 45 CFR § 164.308(a)(7)(ii)(B)
- Emergency Mode Operation Plan — 45 CFR § 164.308(a)(7)(ii)(C)
- Testing and Revision Procedures — 45 CFR § 164.308(a)(7)(ii)(D)
- Applications and Data Criticality Analysis — 45 CFR § 164.308(a)(7)(ii)(E)`
      },
      {
        title: "2. Applications and Data Criticality Analysis",
        content: `| Application/Data | Criticality | Contains ePHI? | Recovery Priority | Max Downtime |
|-----------------|------------|---------------|-------------------|-------------|
| LLM Hub Web Application | Critical | Yes | 1 | 4 hours |
| PostgreSQL Database | Critical | Yes | 1 | 2 hours |
| Audit Logging System | Critical | Yes (metadata) | 1 | 4 hours |
| Authentication System | Critical | No | 1 | 1 hour |
| Clinical AI Module | High | Yes | 2 | 8 hours |
| Voice Agent System | High | Yes (audio) | 2 | 8 hours |
| Ollama LLM Server | High | Yes (in prompts) | 2 | 8 hours |
| RAG Knowledge Base | Medium | Potentially | 3 | 24 hours |
| Analytics Dashboard | Medium | No | 3 | 24 hours |
| AgentFlow Integration | Low | No | 4 | 48 hours |
| Training Pipeline | Low | No | 4 | 48 hours |`
      },
      {
        title: "3. Emergency Mode Operation Plan",
        content: `**When to Activate**: Emergency mode is activated when normal system operations cannot be maintained and there is a risk to ePHI availability, integrity, or confidentiality.

**Emergency Operations Procedures**:

1. **Immediate Actions** (First 30 minutes):
   - Incident Commander assesses the situation and declares emergency mode
   - Notify all workforce members of emergency status
   - Activate backup communication channels (phone tree, personal email)
   - Begin incident documentation

2. **System Triage** (30 minutes - 2 hours):
   - Assess which systems are affected
   - Prioritize restoration based on criticality analysis above
   - If database is compromised: activate read-only mode if possible
   - If authentication is down: disable all external access until restored

3. **Interim Operations** (During downtime):
   - Critical clinical functions: Revert to manual/paper-based processes
   - Document all PHI handled manually during emergency
   - Maintain paper audit trail of all PHI access
   - No new user accounts or access changes until systems restored

4. **Communication Protocol**:
   - Internal updates: Every 2 hours to affected workforce members
   - External updates: As needed to affected patients/partners
   - Regulatory notifications: As required (see Incident Response Plan)

5. **Return to Normal Operations**:
   - Verify all systems operational and data integrity confirmed
   - Enter any manual records into electronic systems
   - Conduct post-emergency review within 7 days
   - Update contingency plan based on lessons learned`
      },
      {
        title: "4. Testing Schedule",
        content: `Contingency plan testing must be conducted at least **annually**, with tabletop exercises **quarterly**.

**Testing Types**:
- **Tabletop Exercise**: Walk through scenarios verbally (quarterly)
- **Functional Test**: Actually restore from backup and verify (annually)
- **Full-Scale Test**: Simulate complete system failure and recovery (every 2 years)

| Test Type | Scheduled Date | Completed Date | Results | Issues Found | Corrective Actions |
|-----------|---------------|---------------|---------|-------------|-------------------|
| Tabletop — Q1 | [DATE] | _______ | _______ | _______ | _______ |
| Tabletop — Q2 | [DATE] | _______ | _______ | _______ | _______ |
| Tabletop — Q3 | [DATE] | _______ | _______ | _______ | _______ |
| Tabletop — Q4 | [DATE] | _______ | _______ | _______ | _______ |
| Functional Test | [DATE] | _______ | _______ | _______ | _______ |
| Full-Scale Test | [DATE] | _______ | _______ | _______ | _______ |

**Plan Review and Update**:
This plan must be reviewed and revised:
- Annually (at minimum)
- After any emergency activation
- After any significant infrastructure change
- After contingency plan testing reveals deficiencies

Last Reviewed: _______________
Reviewed By: _______________
Next Review: _______________`
      },
    ],
  },
  {
    id: "disposal-policy",
    title: "Data Disposal & Media Sanitization Policy",
    category: "Physical Safeguards",
    description: "Procedures for secure disposal of ePHI when no longer needed",
    lastUpdated: "2026-03-30",
    status: "template",
    sections: [
      {
        title: "1. Policy Statement",
        content: `**Purpose**: To establish procedures for the final disposition of ePHI and the hardware or electronic media on which it is stored, in compliance with 45 CFR § 164.310(d)(2)(i) (Disposal) and 45 CFR § 164.310(d)(2)(ii) (Media Re-use).

**Policy**: All ePHI must be rendered unreadable, indecipherable, and otherwise irretrievable before disposal or re-use of electronic media. [ORGANIZATION NAME] shall use NIST SP 800-88 (Guidelines for Media Sanitization) as the baseline standard for all data destruction activities.`
      },
      {
        title: "2. Sanitization Methods by Media Type",
        content: `| Media Type | Sanitization Method | Standard | Verification |
|-----------|-------------------|---------|-------------|
| Hard Disk Drives (HDD) | Degaussing + physical destruction OR 3-pass overwrite | NIST SP 800-88 (Purge) | Certificate of destruction |
| Solid State Drives (SSD) | Cryptographic erase OR physical destruction | NIST SP 800-88 (Purge) | Certificate of destruction |
| USB Flash Drives | Cryptographic erase OR physical destruction | NIST SP 800-88 (Purge) | Certificate of destruction |
| Optical Media (CD/DVD) | Physical destruction (shredding) | NIST SP 800-88 (Destroy) | Witnessed destruction |
| Paper Records | Cross-cut shredding (DIN 66399 Level P-4+) | Cross-cut ≤ 2mm x 15mm | Witnessed or contracted |
| Cloud/Virtual Storage | Cryptographic deletion + provider certification | Cloud provider SLA | Written confirmation |
| Database Records | Secure DELETE + VACUUM (PostgreSQL) | Application-level | Audit log verification |
| Backup Tapes | Degaussing OR physical destruction | NIST SP 800-88 (Purge) | Certificate of destruction |
| Mobile Devices | Factory reset + cryptographic erase | NIST SP 800-88 (Clear) | Verification scan |
| Photocopiers/Fax | Clear internal storage/hard drive | Manufacturer guidelines | Service documentation |

**Important**: Simple file deletion or formatting is NOT sufficient for HIPAA compliance. Data must be rendered irretrievable.`
      },
      {
        title: "3. Data Retention Schedule",
        content: `| Data Type | Minimum Retention | Legal Basis | Disposal Method |
|-----------|------------------|------------|----------------|
| HIPAA Audit Logs | **6 years** | 45 CFR § 164.530(j) | Secure database deletion |
| HIPAA Policies & Procedures | **6 years** from last effective date | 45 CFR § 164.530(j) | Secure file deletion |
| Training Records | **6 years** | 45 CFR § 164.530(j) | Secure file deletion |
| BAA Agreements | **6 years** after termination | 45 CFR § 164.530(j) | Cross-cut shredding / secure deletion |
| Patient Medical Records | Per state law (typically **7-10 years**) | State medical records retention law | Certified destruction |
| Risk Assessments | **6 years** | 45 CFR § 164.530(j) | Secure file deletion |
| Incident Response Records | **6 years** | 45 CFR § 164.530(j) | Secure file deletion |
| Sanctions Records | **6 years** | 45 CFR § 164.530(j) | Secure file deletion |
| LLM Conversation Logs | [DEFINE based on business need] | Business policy | Secure database deletion |
| Voice Agent Recordings | [DEFINE based on business need] | Business policy | Secure file deletion |
| Backup Media | Until superseded by retention schedule | Business continuity | Certified destruction |`
      },
      {
        title: "4. Disposal Documentation",
        content: `**DATA DISPOSAL RECORD**

| Date | Media Type | Description | Serial #/ID | Sanitization Method | Performed By | Witnessed By | Certificate # |
|------|-----------|-------------|------------|-------------------|-------------|-------------|---------------|
| ____ | _________ | ___________ | __________ | _________________ | ___________ | ___________ | ____________ |
| ____ | _________ | ___________ | __________ | _________________ | ___________ | ___________ | ____________ |
| ____ | _________ | ___________ | __________ | _________________ | ___________ | ___________ | ____________ |

**Third-Party Destruction Services**: If using an external vendor for media destruction:
- Vendor must sign a BAA
- Vendor must provide Certificates of Destruction
- Verify vendor's NAID AAA certification (preferred)

Vendor Name: _______________
BAA on File: ☐ Yes ☐ No
NAID Certified: ☐ Yes ☐ No
Contract Expiration: _______________`
      },
    ],
  },
  {
    id: "access-management",
    title: "Access Management & Termination Procedures",
    category: "Administrative Safeguards",
    description: "Procedures for granting, modifying, and revoking access to ePHI systems",
    lastUpdated: "2026-03-30",
    status: "template",
    sections: [
      {
        title: "1. Access Authorization Policy",
        content: `**Purpose**: To establish procedures for authorizing access to ePHI based on job function (minimum necessary standard), in compliance with 45 CFR § 164.308(a)(4) (Information Access Management) and 45 CFR § 164.312(a)(1) (Access Control).

**Principle of Minimum Necessary Access**: Workforce members shall only be granted access to the ePHI that is minimally necessary to perform their job functions. Access beyond minimum necessary requires documented justification and supervisory approval.

**LLM Hub Role Definitions**:
| Role | Access Level | PHI Access | Modules Accessible |
|------|------------|-----------|-------------------|
| Admin | Full platform access | Full | All modules including Compliance, Admin panel |
| Clinical User | Clinical modules only | Clinical data | Clinical AI, Voice Agent, Chat, Memory |
| Research User | Research modules only | De-identified only | Research, RAG, PubMed, Benchmarks |
| Standard User | General features | None | Chat, Prompts, Compare, Playground, Team |
| API Consumer | API endpoints only | As configured | Platform API with scoped keys |
| Read-Only | View access only | As role permits | View-only access to assigned modules |`
      },
      {
        title: "2. Access Request and Provisioning",
        content: `**ACCESS REQUEST FORM**

**Requestor Information**:
Name: _______________
Title/Position: _______________
Department: _______________
Start Date: _______________
Supervisor: _______________

**Access Requested**:
☐ Admin ☐ Clinical User ☐ Research User ☐ Standard User ☐ API Consumer ☐ Read-Only

**Specific Module Access** (check all that apply):
☐ Clinical AI ☐ Voice Agent ☐ Research ☐ RAG Knowledge Base
☐ Chat ☐ Memory ☐ Analytics ☐ Training Pipeline
☐ Agents ☐ Automations ☐ AgentFlow ☐ Platform API
☐ Prompts ☐ Compare ☐ Costs ☐ Team Collaboration
☐ Data Agent ☐ Social AI ☐ Finance AI ☐ Compliance (Admin only)

**Justification for Access**:
________________________________________

**Approvals**:
Supervisor: _________________ Date: _______
Security Officer: _________________ Date: _______
Privacy Officer (if PHI access): _________________ Date: _______

**Provisioning**:
Account Created By: _________________ Date: _______
Access Verified By: _________________ Date: _______`
      },
      {
        title: "3. Access Modification and Review",
        content: `**Access Modification Triggers**:
- Job role or department change
- Project assignment change
- Promotion or demotion
- Return from extended leave
- Security incident involving the user's account

**Quarterly Access Review**:
Every quarter, the Security Officer must review all user access to ensure:
1. Each user's access matches their current job function
2. No orphaned accounts (former employees/contractors still active)
3. No excessive privileges beyond minimum necessary
4. All admin accounts are justified and documented
5. API keys are still needed and properly scoped

| Review Period | Reviewer | Users Reviewed | Issues Found | Actions Taken | Date Completed |
|--------------|----------|---------------|-------------|---------------|---------------|
| Q1 20__ | ________ | _____ | _________ | _________ | _________ |
| Q2 20__ | ________ | _____ | _________ | _________ | _________ |
| Q3 20__ | ________ | _____ | _________ | _________ | _________ |
| Q4 20__ | ________ | _____ | _________ | _________ | _________ |`
      },
      {
        title: "4. Access Termination Procedures",
        content: `**Immediate Termination Checklist** (complete within 24 hours of separation):

☐ Disable LLM Hub user account
☐ Revoke all API keys issued to the individual
☐ Remove from all team collaboration workspaces
☐ Change any shared passwords the individual had access to
☐ Revoke VPN/remote access credentials
☐ Collect and sanitize all company devices (see Disposal Policy)
☐ Remove from email distribution lists
☐ Revoke access to third-party services (OpenAI, Google, AgentFlow)
☐ Review audit logs for the individual's last 30 days of access
☐ Transfer ownership of any shared resources/agents/automations
☐ Update the access roster and notify affected team members
☐ If involuntary termination: complete all above BEFORE notifying the employee

**Termination Record**:
Employee Name: _______________
Termination Date: _______________
Termination Type: ☐ Voluntary ☐ Involuntary
All Access Revoked By: _______________
Date Access Revoked: _______________
Devices Returned: ☐ Yes ☐ No ☐ N/A
Audit Log Review Completed: ☐ Yes — No issues ☐ Yes — Issues found (document) ☐ Pending

Signed: _______________ Date: _______________`
      },
    ],
  },
  {
    id: "minimum-necessary",
    title: "Minimum Necessary Standard Policy",
    category: "Administrative Safeguards",
    description: "Policy ensuring PHI access and disclosure is limited to the minimum necessary for job function",
    lastUpdated: "2026-03-30",
    status: "template",
    sections: [
      {
        title: "1. Policy Statement",
        content: `**Purpose**: To establish procedures ensuring that when using or disclosing PHI, or when requesting PHI from another covered entity or business associate, [ORGANIZATION NAME] makes reasonable efforts to limit PHI to the minimum necessary to accomplish the intended purpose, in compliance with 45 CFR § 164.502(b) and 45 CFR § 164.514(d).

**Exceptions** (Minimum Necessary does NOT apply to):
- Disclosures to or requests by a health care provider for treatment purposes
- Disclosures to the individual who is the subject of the information
- Uses or disclosures made pursuant to a valid authorization
- Disclosures required by law
- Disclosures to HHS for compliance investigations`
      },
      {
        title: "2. Implementation in LLM Hub Platform",
        content: `**2.1 Role-Based Access Controls**
The LLM Hub platform enforces minimum necessary through role-based access:
- Standard users cannot access Clinical AI or patient data modules
- Research users receive de-identified data only
- API consumers receive scoped access based on their API key permissions
- Audit logging tracks all access for accountability review

**2.2 PHI in AI Prompts and Responses**
- Users must not include more PHI in AI prompts than is necessary for the clinical task
- The platform flags PHI-containing routes for enhanced monitoring
- Clinical AI module should use structured inputs to limit unnecessary PHI exposure
- Users must not copy/paste full patient records into general chat or research modules

**2.3 Internal Requests for PHI**
When requesting PHI for operational purposes:
1. Identify the specific PHI elements needed (not entire records)
2. Document the purpose for the request
3. Obtain supervisor approval for bulk PHI access
4. Use de-identified data when the purpose can be achieved without identifiers

**2.4 Disclosures to Third Parties**
- Verify the identity and authority of any person requesting PHI
- Limit disclosure to the specific PHI requested (no more)
- Document all external disclosures in the audit log
- When in doubt, consult the Privacy Officer before disclosing`
      },
      {
        title: "3. Annual Minimum Necessary Review",
        content: `**Annual Review Checklist**:

☐ Review each role's access level against current job descriptions
☐ Verify that role assignments in LLM Hub match approved access levels
☐ Review audit logs for access patterns that suggest excessive access
☐ Identify any new modules or features that need access restrictions
☐ Update role definitions if job functions have changed
☐ Verify that API key scopes match their intended purpose
☐ Review any exceptions granted and determine if they are still justified
☐ Update this policy as needed

**Review Record**:
| Year | Reviewer | Roles Reviewed | Changes Made | Date |
|------|----------|---------------|-------------|------|
| 20__ | ________ | _____________ | ___________ | ____ |
| 20__ | ________ | _____________ | ___________ | ____ |
| 20__ | ________ | _____________ | ___________ | ____ |`
      },
    ],
  },
];

const COMPLIANCE_DEADLINES = [
  {
    id: "q-review",
    title: "Quarterly Compliance Review",
    category: "Administrative",
    frequency: "quarterly",
    description: "Comprehensive review of all HIPAA controls, access rights, audit logs, and policy compliance",
    tasks: [
      "Review all user access rights (minimum necessary verification)",
      "Audit PHI access logs for anomalies",
      "Verify all BAAs are current and signed",
      "Test backup restoration from a random backup",
      "Review and update risk assessment scores",
      "Verify encryption standards are maintained",
      "Check for any unresolved sanctions or incidents",
      "Update compliance documentation as needed",
      "Review API key access and scoping",
      "Conduct contingency plan tabletop exercise",
    ],
  },
  {
    id: "annual-risk",
    title: "Annual Security Risk Assessment",
    category: "Administrative",
    frequency: "annual",
    description: "Full security risk assessment per 45 CFR § 164.308(a)(1)(ii)(A)",
    tasks: [
      "Update asset inventory with any new systems",
      "Re-evaluate all threats and vulnerabilities",
      "Score all risks with current likelihood and impact",
      "Create/update remediation plan with owners and deadlines",
      "Document assessment findings and get executive sign-off",
      "Archive previous year's assessment for 6-year retention",
    ],
  },
  {
    id: "annual-training",
    title: "Annual Workforce HIPAA Training",
    category: "Administrative",
    frequency: "annual",
    description: "Mandatory refresher training for all workforce members per 45 CFR § 164.530(b)",
    tasks: [
      "Schedule training sessions for all workforce members",
      "Update training materials with any policy changes",
      "Include platform-specific updates (new features, security changes)",
      "Collect signed acknowledgment forms from all attendees",
      "Document completion rates and follow up on non-compliance",
      "File training records (retain for 6 years minimum)",
    ],
  },
  {
    id: "annual-policy",
    title: "Annual Policy Review & Update",
    category: "Administrative",
    frequency: "annual",
    description: "Review and update all HIPAA policies and procedures",
    tasks: [
      "Review all 12 HIPAA template documents for accuracy",
      "Update policies to reflect any regulatory changes",
      "Update policies to reflect any platform/infrastructure changes",
      "Get legal review of any material policy changes",
      "Distribute updated policies to workforce members",
      "Update the Notice of Privacy Practices if needed",
      "Archive previous versions (retain for 6 years)",
    ],
  },
  {
    id: "annual-contingency",
    title: "Annual Contingency Plan Functional Test",
    category: "Technical",
    frequency: "annual",
    description: "Full functional test of disaster recovery procedures",
    tasks: [
      "Perform full backup restoration to test environment",
      "Verify data integrity after restoration",
      "Test emergency mode operation procedures",
      "Verify communication chain works correctly",
      "Document test results and update plan as needed",
      "Update RTO/RPO targets based on test results",
    ],
  },
  {
    id: "monthly-audit",
    title: "Monthly Audit Log Review",
    category: "Technical",
    frequency: "monthly",
    description: "Regular review of audit logs for suspicious activity and PHI access patterns",
    tasks: [
      "Review PHI access report for unusual patterns",
      "Check for failed authentication attempts",
      "Review admin-level actions for appropriateness",
      "Verify no orphaned or unauthorized accounts exist",
      "Document findings and any corrective actions taken",
    ],
  },
  {
    id: "annual-baa",
    title: "Annual BAA Review",
    category: "Administrative",
    frequency: "annual",
    description: "Review all Business Associate Agreements for currency and compliance",
    tasks: [
      "Inventory all business associates handling PHI",
      "Verify BAA is in place and current for each",
      "Check for any new vendors that need BAAs",
      "Verify vendor compliance certifications are current",
      "Terminate or update BAAs for changed relationships",
    ],
  },
  {
    id: "key-rotation",
    title: "Annual Encryption Key Rotation",
    category: "Technical",
    frequency: "annual",
    description: "Rotate all encryption keys and certificates per encryption policy",
    tasks: [
      "Rotate database encryption keys",
      "Renew TLS certificates",
      "Rotate API keys (OpenAI, Google, AgentFlow)",
      "Rotate backup encryption keys",
      "Update key management records",
      "Verify all systems function after rotation",
    ],
  },
];

function generateSchedule() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3) + 1;
  const schedule: any[] = [];

  COMPLIANCE_DEADLINES.forEach(deadline => {
    if (deadline.frequency === "quarterly") {
      for (let q = 1; q <= 4; q++) {
        const month = (q * 3) - 1;
        const dueDate = new Date(currentYear, month, 15);
        const isPast = dueDate < now;
        schedule.push({
          ...deadline,
          scheduleId: `${deadline.id}-Q${q}-${currentYear}`,
          quarter: `Q${q}`,
          year: currentYear,
          dueDate: dueDate.toISOString(),
          status: isPast ? (q < currentQuarter ? "overdue" : "due-now") : "upcoming",
          urgency: isPast ? "high" : (q === currentQuarter ? "medium" : "low"),
        });
      }
    } else if (deadline.frequency === "monthly") {
      for (let m = 0; m < 12; m++) {
        const dueDate = new Date(currentYear, m, 28);
        const isPast = dueDate < now;
        const isCurrentMonth = m === currentMonth;
        schedule.push({
          ...deadline,
          scheduleId: `${deadline.id}-M${m + 1}-${currentYear}`,
          month: m + 1,
          year: currentYear,
          dueDate: dueDate.toISOString(),
          status: isPast && !isCurrentMonth ? "overdue" : isCurrentMonth ? "due-now" : "upcoming",
          urgency: isPast && !isCurrentMonth ? "high" : isCurrentMonth ? "medium" : "low",
        });
      }
    } else if (deadline.frequency === "annual") {
      const dueDate = new Date(currentYear, 11, 31);
      const isPast = dueDate < now;
      schedule.push({
        ...deadline,
        scheduleId: `${deadline.id}-${currentYear}`,
        year: currentYear,
        dueDate: dueDate.toISOString(),
        status: isPast ? "overdue" : currentMonth >= 9 ? "due-soon" : "upcoming",
        urgency: isPast ? "high" : currentMonth >= 9 ? "medium" : "low",
      });
    }
  });

  return schedule.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

router.get("/compliance/audit-logs", requireAdmin, async (req, res): Promise<void> => {
  try {
    const result = await getAuditLogs({
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
      userId: req.query.userId as string,
      phiOnly: req.query.phiOnly === "true",
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/audit-stats", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const stats = await getAuditStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/phi-access-report", requireAdmin, async (req, res): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const result = await pool.query(`
      SELECT
        user_id,
        user_email,
        COUNT(*) AS access_count,
        COUNT(DISTINCT resource) AS unique_resources,
        MIN(created_at) AS first_access,
        MAX(created_at) AS last_access
      FROM audit_logs
      WHERE phi_accessed = TRUE
        AND created_at > NOW() - ($1 || ' days')::INTERVAL
        AND user_id IS NOT NULL
      GROUP BY user_id, user_email
      ORDER BY access_count DESC
    `, [days]);
    res.json({
      period: `${days} days`,
      users: result.rows,
      totalPHIAccesses: result.rows.reduce((s: number, r: any) => s + parseInt(r.access_count), 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/status", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const stats = await getAuditStats();

    const checks = [
      {
        id: "audit-logging",
        name: "Audit Logging",
        description: "All API access is logged with user identity, action, timestamp, and PHI flag",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "access-control",
        name: "Role-Based Access Control",
        description: "Admin and user roles with middleware enforcement on protected routes",
        status: "compliant" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "session-timeout",
        name: "Automatic Session Timeout",
        description: "Sessions auto-expire after 15 minutes of inactivity",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "encryption-transit",
        name: "Encryption in Transit",
        description: "All connections use HTTPS/TLS encryption",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "phi-tracking",
        name: "PHI Access Tracking",
        description: "All access to protected health information is tracked and auditable",
        status: stats.phiAccessEvents > 0 ? "compliant" as const : "warning" as const,
        category: "Technical Safeguards",
      },
      {
        id: "data-persistence",
        name: "Data Persistence & Backup",
        description: "Critical data stored in PostgreSQL with automatic backups",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "unique-user-id",
        name: "Unique User Identification",
        description: "Each user has a unique ID for accountability and audit trail",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "rate-limiting",
        name: "Rate Limiting",
        description: "Per-user rate limiting prevents abuse and unauthorized bulk access",
        status: "compliant" as const,
        category: "Technical Safeguards",
      },
      {
        id: "baa",
        name: "Business Associate Agreement",
        description: "BAA must be in place with all third-party service providers handling PHI",
        status: "action-required" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "risk-assessment",
        name: "Risk Assessment",
        description: "Regular security risk assessments should be conducted",
        status: "action-required" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "workforce-training",
        name: "Workforce Training",
        description: "All employees must complete HIPAA training",
        status: "action-required" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "incident-response",
        name: "Incident Response Plan",
        description: "Documented procedures for breach notification within 60 days",
        status: "action-required" as const,
        category: "Administrative Safeguards",
      },
      {
        id: "physical-safeguards",
        name: "Physical Safeguards",
        description: "Server room access controls, workstation security policies",
        status: "action-required" as const,
        category: "Physical Safeguards",
      },
    ];

    const compliant = checks.filter(c => c.status === "compliant").length;
    const warnings = checks.filter(c => c.status === "warning").length;
    const actionRequired = checks.filter(c => c.status === "action-required").length;

    res.json({
      overallScore: Math.round((compliant / checks.length) * 100),
      summary: { compliant, warnings, actionRequired, total: checks.length },
      checks,
      auditStats: stats,
      lastChecked: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/documents", requireAdmin, (_req, res): void => {
  res.json(HIPAA_DOCUMENTS);
});

router.get("/compliance/documents/:id", requireAdmin, (req, res): void => {
  const doc = HIPAA_DOCUMENTS.find(d => d.id === req.params.id);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  res.json(doc);
});

router.get("/compliance/activity-timeline", requireAdmin, async (req, res): Promise<void> => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const result = await pool.query(`
      SELECT
        DATE_TRUNC('hour', created_at) AS hour,
        COUNT(*) AS total_events,
        COUNT(CASE WHEN phi_accessed THEN 1 END) AS phi_events,
        COUNT(DISTINCT user_id) AS unique_users
      FROM audit_logs
      WHERE created_at > NOW() - ($1 || ' hours')::INTERVAL
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour ASC
    `, [hours]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compliance/schedule", requireAdmin, (_req, res): void => {
  res.json({
    deadlines: COMPLIANCE_DEADLINES,
    schedule: generateSchedule(),
  });
});

router.get("/compliance/reviews", requireAdmin, async (req, res): Promise<void> => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const result = await pool.query(
      `SELECT * FROM compliance_reviews WHERE year = $1 ORDER BY due_date ASC`,
      [year]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/compliance/reviews", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { review_type, title, description, due_date, quarter, year, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO compliance_reviews (review_type, title, description, due_date, quarter, year, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
      [review_type, title, description, due_date, quarter, year, notes]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/compliance/reviews/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { status, notes, completed_by } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(notes); }
    if (completed_by) { updates.push(`completed_by = $${idx++}`); values.push(completed_by); }
    if (status === "completed") { updates.push(`completed_date = NOW()`); }
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE compliance_reviews SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) { res.status(404).json({ error: "Review not found" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/compliance/schedule/seed", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const existing = await pool.query(`SELECT COUNT(*) FROM compliance_reviews`);
    if (parseInt(existing.rows[0].count) > 0) {
      res.json({ message: "Schedule already seeded", count: parseInt(existing.rows[0].count) });
      return;
    }
    const schedule = generateSchedule();
    let count = 0;
    for (const item of schedule) {
      await pool.query(
        `INSERT INTO compliance_reviews (review_type, title, description, due_date, quarter, year, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.id, item.title, item.description, item.dueDate, item.quarter || null, item.year, "pending"]
      );
      count++;
    }
    res.json({ message: "Schedule seeded", count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
