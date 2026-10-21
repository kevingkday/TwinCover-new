import logging
from sqlalchemy.orm import Session
from app.core.database import Base, engine, SessionLocal
from app.core.security import get_password_hash
from app.models.entities import User, Client, LetterTemplate, Policy, ExtractedFields

logger = logging.getLogger(__name__)

TEMPLATE_1_CONTENT = """# COMMERCIAL POLICY RENEWAL SUMMARY

**Date:** {{current_date}}  
**To:** {{insured_name}}  
**From:** {{broker_name}}, {{agency_name}}  
**Subject:** Annual Commercial Policy Renewal Review — Policy # {{policy_number}}

---

Dear Client Management Team,

We have completed the comprehensive review of your commercial insurance renewal package issued by **{{insurer}}** for the upcoming policy term (**{{effective_date}}** through **{{expiry_date}}**).

### 1. Executive Summary of Coverage Schedule

Below is a consolidated summary of the primary limits, deductibles, and annual premium terms under the renewed policy:

| Coverage Line | Policy Limit | Deductible / Retention | Underwriting Carrier |
| :--- | :--- | :--- | :--- |
| **Commercial General Liability (CGL)** | {{cgl_limit}} | Standard Occurrence | {{insurer}} |
| **Commercial Property & Real Estate** | {{property_limit}} | Standard ($10,000) | {{insurer}} |
| **Cyber Liability & Network Security** | {{cyber_limit}} | {{cyber_deductible}} | {{insurer}} |
| **Total Annual Renewal Premium** | — | — | **{{total_premium}}** |

### 2. Key Observations & Underwriting Commentary
- **Cyber Risk Retention:** Please note that the cyber deductible is set at **{{cyber_deductible}}**. Multi-factor authentication (MFA) and immutable cloud backups must remain strictly active across your network to maintain full coverage validity without coinsurance penalties.
- **Operations & Equipment:** The property schedule includes current real estate valuations and equipment floater terms reflecting current market replacement costs.
- **Exclusion Verification:** War, radioactive contamination, and unmitigated sanctions exclusions remain standard as underwritten.

### 3. Broker Recommendations & Next Steps
1. Verify that all newly acquired vehicles or secondary warehouse locations have been reported to our office for schedule endorsement.
2. Sign the attached carrier renewal acceptance binder and return it before the **{{effective_date}}** renewal inception.

Please contact me directly at {{broker_email}} should you have any questions or require modifications to these scheduled limits.

Warm regards,  

**{{broker_name}}**  
{{agency_name}}  
{{broker_email}}
"""

TEMPLATE_2_CONTENT = """# CYBER RISK & SECURITY ENDORSEMENT ADVISORY

**Date:** {{current_date}}  
**Insured:** {{insured_name}}  
**Policy #:** {{policy_number}}  
**Insurer:** {{insurer}}  
**Brokerage:** {{agency_name}}  

---

Dear {{insured_name}} Leadership,

In conjunction with your renewal under policy **{{policy_number}}**, this memorandum highlights critical cyber liability terms, deductibles, and mandatory technical warranties.

### Coverage & Retention Specifics
- **Policy Term:** {{effective_date}} to {{expiry_date}}
- **Cyber Liability Aggregate Limit:** {{cyber_limit}}
- **Cyber Incident Deductible (Each Occurrence):** {{cyber_deductible}}
- **Carrier:** {{insurer}}

### Security Controls Warranty
Underwriters have conditioned coverage under the Cyber Endorsement upon strict adherence to standard cyber controls:
1. **Multi-Factor Authentication (MFA):** Enforced across email, VPN, remote desktop, and administrative access points.
2. **Offline / Immutable Backups:** Regular testing of restore procedures within 48 hours.
3. **Employee Phishing Simulations:** Documented annual or quarterly staff security training.

Failure to maintain these controls may result in a denial of coverage or an elevated deductible in the event of ransomware or wire fraud claims.

Please reach out if you would like us to review your incident response plan or discuss higher excess liability layers.

Sincerely,  
**{{broker_name}}**  
{{agency_name}}
"""

TEMPLATE_3_CONTENT = """# COMMERCIAL INSURANCE COVERAGE & LIMITS REVIEW

**Client:** {{insured_name}}  
**Policy Number:** {{policy_number}}  
**Carrier:** {{insurer}}  
**Effective Window:** {{effective_date}} — {{expiry_date}}  
**Prepared by:** {{broker_name}} | {{agency_name}}  

---

### Coverage Overview

| Line of Coverage | Scheduled Limit | Retention / Deductible |
| :--- | :--- | :--- |
| **Commercial General Liability** | {{cgl_limit}} | None |
| **Commercial Property & Real Estate** | {{property_limit}} | Standard ($10,000) |
| **Cyber Risk & Privacy Liability** | {{cyber_limit}} | {{cyber_deductible}} |
| **Total Annual Premium** | **{{total_premium}}** | Payable as scheduled |

### Analysis
All operational risk disclosures provided during your underwriting renewal survey have been reconciled with the policy declarations. No unexpected gaps in general liability or business interruption were identified.

Respectfully submitted,  
**{{broker_name}}**  
{{agency_name}}
"""


def init_db():
    """Create tables and seed initial templates and demo accounts."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 1. Seed Templates
        if db.query(LetterTemplate).count() == 0:
            templates = [
                LetterTemplate(
                    name="Commercial Policy Renewal Summary",
                    description="Standard executive broker summary of commercial renewal terms, limits, deductibles, and premium.",
                    category="Renewal",
                    content=TEMPLATE_1_CONTENT,
                    is_system=True
                ),
                LetterTemplate(
                    name="Cyber Risk & Security Advisory",
                    description="Formal advisory detailing cyber policy deductible, retention, and mandatory MFA warranties.",
                    category="Cyber Liability",
                    content=TEMPLATE_2_CONTENT,
                    is_system=True
                ),
                LetterTemplate(
                    name="Coverage Limits & Deductible Comparison",
                    description="Side-by-side breakdown of scheduled limits and deductibles for client board review.",
                    category="Coverage Review",
                    content=TEMPLATE_3_CONTENT,
                    is_system=True
                ),
            ]
            db.add_all(templates)
            db.commit()
            logger.info("Default letter templates successfully seeded.")

        # Check if Word (.docx) system template exists
        docx_tmpl = db.query(LetterTemplate).filter(LetterTemplate.template_type == "docx").first()
        if not docx_tmpl:
            import os
            docx_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "sample_templates", "Apex_Broker_Standard_Letterhead.docx"))
            if os.path.exists(docx_path):
                docx_tmpl = LetterTemplate(
                    name="Apex Brokerage Letterhead (.docx)",
                    description="Official brokerage corporate letterhead with full logo, navy headers, contact bar, and dynamic coverages schedule table.",
                    category="Broker Letterhead",
                    content=TEMPLATE_1_CONTENT,
                    template_type="docx",
                    file_path=docx_path,
                    original_filename="Apex_Broker_Standard_Letterhead.docx",
                    is_system=True
                )
                db.add(docx_tmpl)
                db.commit()
                logger.info("Default Word (.docx) letterhead template seeded.")

        # 2. Seed Demo Broker User
        demo_email = "broker@twincover.com"
        demo_user = db.query(User).filter(User.email == demo_email).first()
        if not demo_user:
            demo_user = User(
                email=demo_email,
                hashed_password=get_password_hash("TwinCover2026!"),
                full_name="Kevin Day, Senior Principal",
                agency_name="Apex Commercial Brokerage Partners"
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)
            logger.info(f"Demo broker user seeded: {demo_email}")

        # 3. Seed Demo Client if none exists
        if db.query(Client).filter(Client.user_id == demo_user.id).count() == 0:
            demo_client = Client(
                user_id=demo_user.id,
                name="Apex Logistics Ltd",
                account_number="APX-84920",
                primary_contact="Marcus Vance, VP Finance & Risk",
                email="mvance@apexlogistics.demo",
                phone="(415) 890-4412",
                notes="Regional fleet logistics and cold-chain warehousing across 3 interstate distribution hubs. Policy renewal pending verification.",
                status="active"
            )
            db.add(demo_client)
            db.commit()
            db.refresh(demo_client)
            logger.info(f"Demo client seeded: {demo_client.name}")

    finally:
        db.close()
