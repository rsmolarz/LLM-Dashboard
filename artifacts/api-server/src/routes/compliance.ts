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
];

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

export default router;
