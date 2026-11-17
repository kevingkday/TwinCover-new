import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.core.security import get_password_hash
from app.models.entities import (
    User,
    Client,
    LetterTemplate,
    Policy,
    ExtractedFields,
    Submission,
    EvidenceArtifact,
    MarketPlacement,
    SubmissionJob,
)

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
        # Ensure new classification columns exist on existing SQLite policies table
        from sqlalchemy import text
        existing_cols = [
            row[1] for row in db.execute(text("PRAGMA table_info(policies)")).fetchall()
        ]
        if existing_cols:
            if "document_type" not in existing_cols:
                db.execute(text("ALTER TABLE policies ADD COLUMN document_type VARCHAR(50) NOT NULL DEFAULT 'policy'"))
            if "classification_confidence" not in existing_cols:
                db.execute(text("ALTER TABLE policies ADD COLUMN classification_confidence VARCHAR(50)"))
            if "classification_engine" not in existing_cols:
                db.execute(text("ALTER TABLE policies ADD COLUMN classification_engine VARCHAR(100)"))
            db.commit()

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

        # 3. Seed Demo Clients if none exist
        demo_client = db.query(Client).filter(Client.user_id == demo_user.id).first()
        if not demo_client:
            demo_client = Client(
                user_id=demo_user.id,
                name="Apex Logistics & Construction Ltd",
                account_number="APX-84920",
                primary_contact="Marcus Vance, VP Finance & Risk",
                email="mvance@apexlogistics.demo",
                phone="(604) 890-4412",
                notes="Canadian commercial construction, mass-timber/steel industrial development, and regional cold-chain warehousing across BC and Alberta.",
                status="active"
            )
            db.add(demo_client)
            db.commit()
            db.refresh(demo_client)
            logger.info(f"Demo client seeded: {demo_client.name}")

        cyber_client = db.query(Client).filter(
            Client.user_id == demo_user.id,
            Client.account_number == "VSC-40219"
        ).first()
        if not cyber_client:
            cyber_client = Client(
                user_id=demo_user.id,
                name="VectorScale AI Diagnostics Inc.",
                account_number="VSC-40219",
                primary_contact="Dr. Elena Rostova, CTO & Co-Founder",
                email="erostova@vectorscale.ca",
                phone="(416) 555-0184",
                notes="Canadian B2B clinical & industrial AI SaaS platform hosted on AWS ca-central-1 (Montreal). Seeking Cyber, Tech E&O & Affirmative AI Liability.",
                status="active"
            )
            db.add(cyber_client)
            db.commit()
            db.refresh(cyber_client)

        # 4. Seed Phase 1 Pre-Bind "Field-to-Underwriter" Submissions if none exist
        if db.query(Submission).filter(Submission.broker_id == demo_user.id).count() == 0:
            _seed_demo_submissions(db, demo_user, demo_client, cyber_client)

    finally:
        db.close()


def _seed_demo_submissions(db: Session, demo_user: User, demo_client: Client, cyber_client: Client):
    """Seed realistic Canadian specialty pre-bind submissions with Immutable Evidence Vault artifacts & citations."""
    vault_dir = os.path.join(settings.EVIDENCE_VAULT_DIR, "demo_seed")
    os.makedirs(vault_dir, exist_ok=True)

    # --- Submission 1: Construction / Wrap-Up & Builders Risk ---
    sub1 = Submission(
        client_id=demo_client.id,
        broker_id=demo_user.id,
        title="Fraser Valley Steel & Mass Timber Logistics Hub — Wrap-Up & Builders Risk",
        specialty_line="construction",
        status="underwriter_review",
        verified_at=datetime.now(timezone.utc),
        verified_by=demo_user.id,
    )
    db.add(sub1)
    db.commit()
    db.refresh(sub1)

    # Create immutable files on disk for Sub 1
    photo_path = os.path.join(vault_dir, "immutable_site_photo_02.jpg")
    photo_bytes = b"JFIF-DEMO-SITE-PHOTO-STEEL-TRUSSES-SPRINKLER-RISER-2026"
    with open(photo_path, "wb") as f:
        f.write(photo_bytes)

    audio_path = os.path.join(vault_dir, "immutable_producer_walkthrough_fraser.m4a")
    audio_bytes = b"M4A-DEMO-VOICE-WALKTHROUGH-FRASER-VALLEY-2026"
    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    pdf_path = os.path.join(vault_dir, "immutable_Fraser_Valley_SOV_and_Geotech_2026.pdf")
    pdf_bytes = b"%PDF-1.4 Fraser Valley Industrial Schedule of Values $18,400,000 CAD"
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)

    art_photo = EvidenceArtifact(
        submission_id=sub1.id,
        client_id=demo_client.id,
        broker_id=demo_user.id,
        artifact_type="photo",
        file_path=photo_path,
        raw_text_or_transcript=json.dumps({
            "artifact_type": "photo",
            "filename": "site_photo_02.jpg",
            "reference": "site_photo_02.jpg",
            "summary": "Exposed structural steel roof trusses and wet-pipe automatic sprinkler riser assembly with ULC supervisory tamper switch.",
            "observations": [
                "Exposed steel trusses and wet-pipe sprinkler riser visible",
                "Clear 8-metre interior racking clearance with concrete slab-on-grade",
                "ULC-listed central station fire alarm panel at north bay entrance"
            ],
            "segments": [
                {
                    "reference": "site_photo_02.jpg",
                    "text": "Exposed steel trusses and wet-pipe sprinkler riser visible; ULC central station fire alarm panel installed at north bay."
                }
            ],
            "engine": f"Ollama Multimodal ({settings.LLM_MODEL})"
        }),
        metadata_json=json.dumps({
            "original_filename": "site_photo_02.jpg",
            "file_size": len(photo_bytes),
            "sha256_hash": hashlib.sha256(photo_bytes).hexdigest(),
            "is_immutable": True,
            "gps_tag": "Abbotsford, BC (49.0504° N, 122.3045° W)"
        })
    )

    art_audio = EvidenceArtifact(
        submission_id=sub1.id,
        client_id=demo_client.id,
        broker_id=demo_user.id,
        artifact_type="audio",
        file_path=audio_path,
        raw_text_or_transcript=json.dumps({
            "artifact_type": "audio",
            "filename": "producer_walkthrough_fraser.m4a",
            "language": "en",
            "duration_seconds": 64.0,
            "text": "On-site walkthrough with project superintendent in Abbotsford BC. Total completed value is $18,400,000 CAD across 82,000 sq ft. Built in 2019 expansion phase, full steel frame, wet sprinklered throughout with two municipal hydrants within 60 metres. All subcontractors sign hold-harmless agreements and carry $5M CGL COIs.",
            "segments": [
                {
                    "start": 0.0,
                    "end": 28.0,
                    "reference": "00:00 - 00:28",
                    "text": "On-site walkthrough with project superintendent in Abbotsford BC. Total completed project & building value is $18,400,000 CAD across 82,000 sq ft."
                },
                {
                    "start": 29.0,
                    "end": 41.0,
                    "reference": "00:29 - 00:41",
                    "text": "Hot works welding permit system enforced on site with 60-minute post-watch and thermal camera check."
                },
                {
                    "start": 42.0,
                    "end": 58.0,
                    "reference": "00:42 - 00:58",
                    "text": "...built in 2019, full steel frame, wet sprinklered throughout with municipal hydrants within 60 metres; requesting $10,000,000 Wrap-Up Liability."
                }
            ],
            "engine": f"faster-whisper ({settings.WHISPER_MODEL})"
        }),
        metadata_json=json.dumps({
            "original_filename": "producer_walkthrough_fraser.m4a",
            "file_size": len(audio_bytes),
            "sha256_hash": hashlib.sha256(audio_bytes).hexdigest(),
            "is_immutable": True,
            "duration_seconds": 64.0
        })
    )

    art_pdf = EvidenceArtifact(
        submission_id=sub1.id,
        client_id=demo_client.id,
        broker_id=demo_user.id,
        artifact_type="pdf",
        file_path=pdf_path,
        raw_text_or_transcript=json.dumps({
            "artifact_type": "pdf",
            "filename": "Fraser_Valley_SOV_2026.pdf",
            "document_type": "policy",
            "document_type_label": "Statement of Values & COPE Schedule",
            "pages": [
                {
                    "page": 1,
                    "reference": "Fraser_Valley_SOV_2026.pdf (Page 1)",
                    "text": "SCHEDULE OF VALUES (CAD): Hard Construction & Structural Steel: $14,900,000 | Cold-Chain Refrigeration Equipment: $2,300,000 | Soft Costs & Delayed Start-Up: $1,200,000 | Total TIV: $18,400,000 CAD."
                }
            ],
            "segments": [
                {
                    "reference": "Fraser_Valley_SOV_2026.pdf (Page 1)",
                    "text": "SCHEDULE OF VALUES (CAD): Hard Construction & Structural Steel: $14,900,000 | Cold-Chain Equipment: $2,300,000 | Soft Costs: $1,200,000 | Total TIV: $18,400,000 CAD."
                }
            ],
            "engine": "Local Sovereign PDF Engine"
        }),
        metadata_json=json.dumps({
            "original_filename": "Fraser_Valley_SOV_2026.pdf",
            "file_size": len(pdf_bytes),
            "sha256_hash": hashlib.sha256(pdf_bytes).hexdigest(),
            "is_immutable": True
        })
    )

    db.add_all([art_photo, art_audio, art_pdf])
    db.commit()
    db.refresh(art_photo)
    db.refresh(art_audio)
    db.refresh(art_pdf)

    sub1_fields = [
        {
            "field_key": "construction_type",
            "label": "Primary Construction Class",
            "value": "Non-combustible steel frame with sprinklered warehouse",
            "confidence": 0.96,
            "category": "Construction & Wrap-Up Liability",
            "citations": [
                {
                    "artifact_id": f"art_{art_photo.id}",
                    "artifact_type": "photo",
                    "reference": "site_photo_02.jpg",
                    "excerpt": "Exposed steel trusses and wet-pipe sprinkler riser visible"
                },
                {
                    "artifact_id": f"art_{art_audio.id}",
                    "artifact_type": "audio",
                    "reference": "00:42 - 00:58",
                    "excerpt": "...built in 2019, full steel frame, wet sprinklered throughout with municipal hydrants within 60 metres..."
                }
            ]
        },
        {
            "field_key": "total_project_value",
            "label": "Total Completed Project / TIV Value (CAD)",
            "value": "$18,400,000 CAD ($14.9M Hard Costs / $2.3M Equipment / $1.2M Soft Costs)",
            "confidence": 0.98,
            "category": "Construction & Wrap-Up Liability",
            "citations": [
                {
                    "artifact_id": f"art_{art_pdf.id}",
                    "artifact_type": "pdf",
                    "reference": "Fraser_Valley_SOV_2026.pdf (Page 1)",
                    "excerpt": "Hard Construction & Structural Steel: $14,900,000 | Cold-Chain Equipment: $2,300,000 | Soft Costs: $1,200,000 | Total TIV: $18,400,000 CAD."
                },
                {
                    "artifact_id": f"art_{art_audio.id}",
                    "artifact_type": "audio",
                    "reference": "00:00 - 00:28",
                    "excerpt": "Total completed project & building value is $18,400,000 CAD across 82,000 sq ft."
                }
            ]
        },
        {
            "field_key": "fire_protection",
            "label": "Fire Suppression & Site Safeguards",
            "value": "100% Automatic Wet-Pipe Sprinklered, ULC Central Station Alarm, 2 Municipal Hydrants < 60m, 60-Min Hot Works Watch",
            "confidence": 0.94,
            "category": "Construction & Wrap-Up Liability",
            "citations": [
                {
                    "artifact_id": f"art_{art_photo.id}",
                    "artifact_type": "photo",
                    "reference": "site_photo_02.jpg",
                    "excerpt": "ULC central station fire alarm panel installed at north bay."
                },
                {
                    "artifact_id": f"art_{art_audio.id}",
                    "artifact_type": "audio",
                    "reference": "00:29 - 00:41",
                    "excerpt": "Hot works welding permit system enforced on site with 60-minute post-watch and thermal camera check."
                }
            ]
        },
        {
            "field_key": "wrap_up_limit",
            "label": "Requested Wrap-Up / Primary CGL Limit",
            "value": "$10,000,000 Each Occurrence / $10,000,000 Aggregate (24-Month Completed Operations Extension)",
            "confidence": 0.93,
            "category": "Construction & Wrap-Up Liability",
            "citations": [
                {
                    "artifact_id": f"art_{art_audio.id}",
                    "artifact_type": "audio",
                    "reference": "00:42 - 00:58",
                    "excerpt": "...requesting $10,000,000 Wrap-Up Liability."
                }
            ]
        }
    ]

    sub1_checklist = [
        {
            "id": "chk_const_1",
            "item": "Geotechnical & Soil Stability Engineering Report (Fraser River Floodplain / Seismic Zone)",
            "severity": "required",
            "specialty_line": "construction",
            "resolved": False,
            "reason": "Required by Canadian Wrap-Up & Builders Risk underwriters to confirm BC seismic & flood sub-limits."
        },
        {
            "id": "chk_const_2",
            "item": "Hot Works & Welding Fire Watch Protocol",
            "severity": "required",
            "specialty_line": "construction",
            "resolved": True,
            "reason": "Verified via producer voice walkthrough (00:29 - 00:41): 60-minute post-watch & thermal camera check active."
        },
        {
            "id": "chk_const_3",
            "item": "Full Project Budget Breakdown (Hard vs. Soft Costs)",
            "severity": "required",
            "specialty_line": "construction",
            "resolved": True,
            "reason": "Verified in Fraser_Valley_SOV_2026.pdf (Page 1): $14.9M Hard / $2.3M Equipment / $1.2M Soft Costs."
        },
        {
            "id": "chk_const_4",
            "item": "Signed Subcontractor COI Register ($5,000,000 Minimum CGL for All Tier-1 Trades)",
            "severity": "recommended",
            "specialty_line": "construction",
            "resolved": False,
            "reason": "Needed prior to policy issuance to waive contingent subcontractor surcharge."
        }
    ]

    sub1.structured_risk_profile = json.dumps(sub1_fields)
    sub1.missing_info_checklist = json.dumps(sub1_checklist)
    sub1.underwriter_narrative = (
        f"# PRE-BIND UNDERWRITING SUBMISSION MEMORANDUM\n\n"
        f"**Named Insured:** {demo_client.name} (`{demo_client.account_number}`)  \n"
        f"**Risk Location:** Abbotsford / Fraser Valley Industrial Park, British Columbia, Canada  \n"
        f"**Specialty Line:** Construction Wrap-Up Liability & Builders Risk (COC)  \n"
        f"**Total Insurable Value (TIV):** $18,400,000 CAD  \n\n"
        f"---\n\n"
        f"### 1. Executive Risk Summary & Construction Profile\n"
        f"**{demo_client.name}** is seeking a combined Canadian **Course of Construction (Builders Risk)** and **$10,000,000 Wrap-Up Liability** placement for its 82,000 sq. ft. Fraser Valley industrial cold-chain and structural steel facility. Physical inspection photos (`[art_{art_photo.id}: site_photo_02.jpg]`) and on-site producer voice walkthrough recordings (`[art_{art_audio.id}: 00:42 - 00:58]`) confirm non-combustible structural steel framing with a 100% wet-pipe automatic sprinkler riser and ULC-monitored central station alarm.\n\n"
        f"### 2. Source-Cited Underwriting Schedule\n\n"
        f"| Underwriting Attribute | Verified Value | Confidence | Source Provenance |\n"
        f"| :--- | :--- | :--- | :--- |\n"
        f"| **Primary Construction Class** | Non-combustible steel frame with sprinklered warehouse | 96% | `[art_{art_photo.id}: site_photo_02.jpg]`, `[art_{art_audio.id}: 00:42 - 00:58]` |\n"
        f"| **Total Project / TIV Value** | $18,400,000 CAD ($14.9M Hard / $2.3M Equip / $1.2M Soft) | 98% | `[art_{art_pdf.id}: Page 1]`, `[art_{art_audio.id}: 00:00 - 00:28]` |\n"
        f"| **Fire Suppression & Safeguards** | Wet-Pipe Sprinklered, ULC Central Alarm, 60-Min Hot Works Watch | 94% | `[art_{art_photo.id}: site_photo_02.jpg]`, `[art_{art_audio.id}: 00:29 - 00:41]` |\n"
        f"| **Requested Wrap-Up Limit** | $10,000,000 Occurrence / Aggregate (24-Mo Completed Ops) | 93% | `[art_{art_audio.id}: 00:42 - 00:58]` |\n\n"
        f"### 3. Loss Control & Subjectivity Status\n"
        f"- **Hot Works Protocol (`RESOLVED`):** Strict welding permit and 60-minute thermal camera fire watch verified on site (`[art_{art_audio.id}: 00:29 - 00:41]`).\n"
        f"- **Pending Pre-Bind Subjectivities:** P.Eng Geotechnical Soil Stability Report (for BC Earthquake & Fraser River Flood sub-limit) and Tier-1 Subcontractor COI Register."
    )
    sub1.client_followup_draft = (
        f"Subject: Action Required: Geotech Report & Subcontractor COI Register — Fraser Valley Wrap-Up ({demo_client.name})\n\n"
        f"Hi Marcus,\n\n"
        f"Thanks again for the walkthrough at the Abbotsford site. Our sovereign AI copilot has reconciled your $18.4M Statement of Values, site inspection photos, and hot-works fire watch protocols into our formal underwriting submission for Intact Specialty, Northbridge, and Lloyd's Canada.\n\n"
        f"To release the final binding quotes with full BC Earthquake and Flood sub-limits, please send over:\n"
        f"1. **Geotechnical & Soil Stability Engineering Report** (Required by underwriters for Fraser Valley seismic/flood grading).\n"
        f"2. **Tier-1 Subcontractor COI Register** confirming $5,000,000 CGL limits and Hold-Harmless sign-offs.\n\n"
        f"As soon as you reply with those PDFs, we will attach them to the Evidence Vault and finalize terms.\n\n"
        f"Best regards,\n{demo_user.full_name}\n{demo_user.agency_name}"
    )

    db.add_all([
        MarketPlacement(
            submission_id=sub1.id,
            client_id=demo_client.id,
            broker_id=demo_user.id,
            carrier_name="Intact Specialty Solutions (Canada)",
            target_line="Wrap-Up Liability ($10M) & Builders Risk ($18.4M)",
            status="quote_received",
            quoted_premium="$64,200 CAD",
            quote_summary_json=json.dumps({
                "limit": "$18.4M COC / $10M Wrap-Up CGL",
                "deductible": "$25,000 All Perils | 5% ($100k min) BC Quake",
                "subjectivity": "Subject to P.Eng Geotechnical Report prior to binding",
                "underwriter": "S. Desjardins, Senior Construction Underwriter (Vancouver)"
            }),
            notes="Lead Canadian construction market; competitive 24-month completed operations extension included."
        ),
        MarketPlacement(
            submission_id=sub1.id,
            client_id=demo_client.id,
            broker_id=demo_user.id,
            carrier_name="Northbridge Commercial Insurance",
            target_line="Builders Risk & Contractors Equipment",
            status="underwriter_review",
            quoted_premium="$68,500 CAD (Indication)",
            quote_summary_json=json.dumps({
                "limit": "$18.4M TIV",
                "deductible": "$25,000 Standard / $50,000 Water Damage",
                "subjectivity": "Reviewing wet-pipe sprinkler riser supervisory certificate",
                "underwriter": "R. Chen, Specialty Risks"
            }),
            notes="Strong appetite for non-combustible steel frame warehouses in BC."
        ),
        MarketPlacement(
            submission_id=sub1.id,
            client_id=demo_client.id,
            broker_id=demo_user.id,
            carrier_name="Lloyd's Underwriters (Canadian Coverholder)",
            target_line="Excess Wrap-Up Liability ($10M xs $10M)",
            status="submitted",
            quoted_premium="Pending",
            quote_summary_json=json.dumps({
                "limit": "$10,000,000 Excess Layer",
                "deductible": "Follow Form Primary",
                "subjectivity": "Requires underlying Intact primary binder"
            }),
            notes="Submitted for optional $20M total Wrap-Up tower."
        ),
    ])
    db.commit()

    # --- Submission 2: Cyber / Tech E&O / AI Liability ---
    sub2 = Submission(
        client_id=cyber_client.id,
        broker_id=demo_user.id,
        title="VectorScale AI Diagnostics — Enterprise Cyber, Tech E&O & Affirmative AI Liability",
        specialty_line="cyber_ai",
        status="drafted",
    )
    db.add(sub2)
    db.commit()
    db.refresh(sub2)

    cyber_audio_path = os.path.join(vault_dir, "immutable_cto_cyber_discovery.webm")
    cyber_audio_bytes = b"WEBM-DEMO-CTO-DISCOVERY-CALL-VECTORSCALE-AI-2026"
    with open(cyber_audio_path, "wb") as f:
        f.write(cyber_audio_bytes)

    cyber_note_path = os.path.join(vault_dir, "immutable_soc2_ai_architecture_note.txt")
    cyber_note_text = (
        "SOC2 Type II certified (Deloitte, Oct 2026). Hosted on AWS ca-central-1 (Montreal) for PIPEDA & Quebec Law 25 residency. "
        "Okta FIDO2 hardware MFA on 100% of engineers and cloud consoles. CrowdStrike Falcon EDR deployed on all 145 endpoints. "
        "Immutable AWS S3 Object Lock backups with 4-hour RTO. Clinical AI model outputs require licensed radiologist human-in-the-loop sign-off."
    )
    with open(cyber_note_path, "wb") as f:
        f.write(cyber_note_text.encode("utf-8"))

    art_c_audio = EvidenceArtifact(
        submission_id=sub2.id,
        client_id=cyber_client.id,
        broker_id=demo_user.id,
        artifact_type="audio",
        file_path=cyber_audio_path,
        raw_text_or_transcript=json.dumps({
            "artifact_type": "audio",
            "filename": "cto_cyber_discovery.webm",
            "language": "en",
            "duration_seconds": 58.0,
            "text": "Discovery call with Dr. Elena Rostova, CTO. Projected 2026 Canadian & US healthcare SaaS revenue is $18,500,000 CAD. Okta phishing-resistant MFA is enforced on all privileged accounts and VPN. Requesting $5,000,000 combined Cyber, Tech E&O, and AI Liability with a $25,000 retention.",
            "segments": [
                {
                    "start": 0.0,
                    "end": 21.0,
                    "reference": "00:00 - 00:21",
                    "text": "Discovery call with Dr. Elena Rostova, CTO. Projected 2026 Canadian & US healthcare SaaS revenue is $18,500,000 CAD."
                },
                {
                    "start": 22.0,
                    "end": 41.0,
                    "reference": "00:22 - 00:41",
                    "text": "Okta phishing-resistant FIDO2 MFA is enforced across all privileged admin, VPN, and AWS ca-central-1 console accounts."
                },
                {
                    "start": 42.0,
                    "end": 58.0,
                    "reference": "00:42 - 00:58",
                    "text": "Requesting $5,000,000 combined Cyber, Tech E&O, and affirmative AI Liability limits with a $25,000 retention."
                }
            ],
            "engine": f"faster-whisper ({settings.WHISPER_MODEL})"
        }),
        metadata_json=json.dumps({
            "original_filename": "cto_cyber_discovery.webm",
            "file_size": len(cyber_audio_bytes),
            "sha256_hash": hashlib.sha256(cyber_audio_bytes).hexdigest(),
            "is_immutable": True
        })
    )

    art_c_note = EvidenceArtifact(
        submission_id=sub2.id,
        client_id=cyber_client.id,
        broker_id=demo_user.id,
        artifact_type="text_note",
        file_path=cyber_note_path,
        raw_text_or_transcript=json.dumps({
            "artifact_type": "text_note",
            "filename": "soc2_ai_architecture_note.txt",
            "reference": "soc2_ai_architecture_note.txt",
            "text": cyber_note_text,
            "segments": [
                {
                    "reference": "soc2_ai_architecture_note.txt (Producer Note)",
                    "text": cyber_note_text
                }
            ],
            "engine": "Direct Producer Capture"
        }),
        metadata_json=json.dumps({
            "original_filename": "soc2_ai_architecture_note.txt",
            "file_size": len(cyber_note_text),
            "sha256_hash": hashlib.sha256(cyber_note_text.encode("utf-8")).hexdigest(),
            "is_immutable": True
        })
    )

    db.add_all([art_c_audio, art_c_note])
    db.commit()
    db.refresh(art_c_audio)
    db.refresh(art_c_note)

    sub2_fields = [
        {
            "field_key": "annual_revenue",
            "label": "Annual Gross Revenue (CAD)",
            "value": "$18,500,000 CAD (Canadian & US Enterprise Healthcare SaaS)",
            "confidence": 0.96,
            "category": "Cyber, Tech E&O & AI Liability",
            "citations": [
                {
                    "artifact_id": f"art_{art_c_audio.id}",
                    "artifact_type": "audio",
                    "reference": "00:00 - 00:21",
                    "excerpt": "Projected 2026 Canadian & US healthcare SaaS revenue is $18,500,000 CAD."
                }
            ]
        },
        {
            "field_key": "mfa_and_iam",
            "label": "Multi-Factor Authentication (MFA) & IAM Controls",
            "value": "Okta FIDO2 Phishing-Resistant MFA on 100% of Privileged, VPN & AWS ca-central-1 Accounts",
            "confidence": 0.97,
            "category": "Cyber, Tech E&O & AI Liability",
            "citations": [
                {
                    "artifact_id": f"art_{art_c_audio.id}",
                    "artifact_type": "audio",
                    "reference": "00:22 - 00:41",
                    "excerpt": "Okta phishing-resistant FIDO2 MFA is enforced across all privileged admin, VPN, and AWS ca-central-1 console accounts."
                },
                {
                    "artifact_id": f"art_{art_c_note.id}",
                    "artifact_type": "text_note",
                    "reference": "soc2_ai_architecture_note.txt (Producer Note)",
                    "excerpt": "Okta FIDO2 hardware MFA on 100% of engineers and cloud consoles. CrowdStrike Falcon EDR deployed on all 145 endpoints."
                }
            ]
        },
        {
            "field_key": "ai_governance",
            "label": "AI Model Provenance & Human-in-the-Loop Guardrails",
            "value": "Mandatory Licensed Clinician Human-in-the-Loop Sign-Off; SOC2 Type II Certified; AWS Montreal Residency",
            "confidence": 0.94,
            "category": "Cyber, Tech E&O & AI Liability",
            "citations": [
                {
                    "artifact_id": f"art_{art_c_note.id}",
                    "artifact_type": "text_note",
                    "reference": "soc2_ai_architecture_note.txt (Producer Note)",
                    "excerpt": "Clinical AI model outputs require licensed radiologist human-in-the-loop sign-off."
                }
            ]
        },
        {
            "field_key": "requested_cyber_limit",
            "label": "Requested Cyber / Tech E&O / AI Limit & Retention",
            "value": "$5,000,000 Aggregate Limit | $25,000 Each Incident Retention",
            "confidence": 0.95,
            "category": "Cyber, Tech E&O & AI Liability",
            "citations": [
                {
                    "artifact_id": f"art_{art_c_audio.id}",
                    "artifact_type": "audio",
                    "reference": "00:42 - 00:58",
                    "excerpt": "Requesting $5,000,000 combined Cyber, Tech E&O, and affirmative AI Liability limits with a $25,000 retention."
                }
            ]
        }
    ]

    sub2_checklist = [
        {
            "id": "chk_cyber_1",
            "item": "Phishing-Resistant MFA Verification on All Admin, VPN & Cloud Console Accounts",
            "severity": "required",
            "specialty_line": "cyber_ai",
            "resolved": True,
            "reason": "Verified via CTO audio memo (00:22 - 00:41) and SOC2 note."
        },
        {
            "id": "chk_cyber_2",
            "item": "AI Model Training Data Licensing & Hallucination Human-in-the-Loop Sign-off",
            "severity": "required",
            "specialty_line": "cyber_ai",
            "resolved": True,
            "reason": "Verified in soc2_ai_architecture_note.txt: radiologist human-in-the-loop sign-off mandatory."
        },
        {
            "id": "chk_cyber_3",
            "item": "External Penetration Test & AI Red-Team Executive Summary (Last 12 Months)",
            "severity": "required",
            "specialty_line": "cyber_ai",
            "resolved": False,
            "reason": "Required by CFC Underwriting and Beazley Canada for $5M Tech E&O / AI limit."
        }
    ]

    sub2.structured_risk_profile = json.dumps(sub2_fields)
    sub2.missing_info_checklist = json.dumps(sub2_checklist)
    sub2.underwriter_narrative = (
        f"# PRE-BIND UNDERWRITING SUBMISSION MEMORANDUM\n\n"
        f"**Named Insured:** {cyber_client.name} (`{cyber_client.account_number}`)  \n"
        f"**Primary Hosting & Jurisdiction:** Montreal, QC / Toronto, ON (AWS `ca-central-1`, PIPEDA & Quebec Law 25 Compliant)  \n"
        f"**Specialty Line:** Enterprise Cyber, Technology E&O & Affirmative AI Liability  \n\n"
        f"---\n\n"
        f"### 1. Executive Risk Summary\n"
        f"**{cyber_client.name}** develops B2B clinical diagnostic SaaS with $18.5M CAD projected annual revenue (`[art_{art_c_audio.id}: 00:00 - 00:21]`). All AI diagnostic predictions are strictly decision-support with mandatory human-in-the-loop sign-off (`[art_{art_c_note.id}: soc2_ai_architecture_note.txt]`).\n\n"
        f"### 2. Source-Cited Underwriting Schedule\n\n"
        f"| Underwriting Attribute | Verified Value | Confidence | Source Provenance |\n"
        f"| :--- | :--- | :--- | :--- |\n"
        f"| **Annual Gross Revenue** | $18,500,000 CAD | 96% | `[art_{art_c_audio.id}: 00:00 - 00:21]` |\n"
        f"| **MFA & IAM Controls** | Okta FIDO2 MFA on 100% of Admin, VPN & Cloud Consoles | 97% | `[art_{art_c_audio.id}: 00:22 - 00:41]`, `[art_{art_c_note.id}]` |\n"
        f"| **AI Governance Guardrails** | Mandatory Clinician Human-in-the-Loop; SOC2 Type II | 94% | `[art_{art_c_note.id}: soc2_ai_architecture_note.txt]` |\n"
        f"| **Requested Limit & SIR** | $5,000,000 Aggregate / $25,000 Retention | 95% | `[art_{art_c_audio.id}: 00:42 - 00:58]` |\n"
    )
    sub2.client_followup_draft = (
        f"Subject: Final Item for $5M Cyber & AI Liability Submission — {cyber_client.name}\n\n"
        f"Hi Dr. Rostova,\n\n"
        f"Thank you for walking through your SOC2 controls and AWS ca-central-1 architecture. To release the $5,000,000 Cyber, Tech E&O & Affirmative AI Liability submission to CFC and Beazley Canada, please share:\n"
        f"1. **Most Recent External Penetration Test & AI Red-Team Executive Summary** (within the last 12 months).\n\n"
        f"Best regards,\n{demo_user.full_name}\n{demo_user.agency_name}"
    )

    db.add_all([
        MarketPlacement(
            submission_id=sub2.id,
            client_id=cyber_client.id,
            broker_id=demo_user.id,
            carrier_name="CFC Underwriting (Canada)",
            target_line="Cyber, Tech E&O & Affirmative AI Liability ($5M)",
            status="underwriter_review",
            quoted_premium="$38,900 CAD (Indication)",
            quote_summary_json=json.dumps({
                "limit": "$5,000,000 Aggregate",
                "deductible": "$25,000 Each Claim",
                "subjectivity": "Copy of annual external penetration test summary"
            }),
            notes="Includes affirmative AI model error & bodily injury contingent extension."
        ),
        MarketPlacement(
            submission_id=sub2.id,
            client_id=cyber_client.id,
            broker_id=demo_user.id,
            carrier_name="Beazley Canada (Focus Tech)",
            target_line="Tech E&O + InfoSec ($5M)",
            status="drafted",
            quoted_premium="Pending",
            quote_summary_json=json.dumps({
                "limit": "$5,000,000",
                "deductible": "$25,000"
            }),
            notes="Ready to release upon receipt of pen-test executive summary."
        ),
    ])
    db.commit()
    logger.info("Phase 1 Canadian specialty pre-bind submissions seeded.")
