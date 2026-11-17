import os
import io
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.services.extractor_client import extractor_client
from app.services.ollama_client import ollama_client
from app.services.export_service import export_service
from app.services.rag_service import rag_service
from main import app

# Test SQLite in-memory database
TEST_DB_URL = "sqlite:///./test_twincover.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
Base.metadata.drop_all(bind=test_engine)
Base.metadata.create_all(bind=test_engine)
client = TestClient(app)


def test_root_endpoint():
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "online"


def test_auth_workflow():
    # Register
    email = f"testbroker_{os.urandom(4).hex()}@twincover.com"
    payload = {
        "email": email,
        "password": "TestPassword123!",
        "full_name": "Test Broker",
        "agency_name": "Acme Insurance Advisory"
    }
    reg_resp = client.post("/api/auth/register", json=payload)
    assert reg_resp.status_code == 201
    token = reg_resp.json()["access_token"]
    assert token is not None

    # Login
    login_resp = client.post("/api/auth/login", json={"email": email, "password": "TestPassword123!"})
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()

    # Protected me endpoint
    headers = {"Authorization": f"Bearer {token}"}
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email


def test_client_crud():
    # Register isolated broker for this test
    email = f"crudbroker_{os.urandom(4).hex()}@twincover.com"
    reg_resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "TwinCover2026!",
        "full_name": "Morgan Broker",
        "agency_name": "Apex Commercial Brokerage"
    })
    assert reg_resp.status_code == 201
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create client
    new_client = {
        "name": "Pacific Freight Logistics",
        "account_number": "PAC-9921",
        "primary_contact": "Sarah Connor, CFO",
        "email": "sarah@pacificfreight.demo",
        "phone": "(510) 555-0199",
        "notes": "Regional line-haul operations"
    }
    create_resp = client.post("/api/clients/", json=new_client, headers=headers)
    assert create_resp.status_code == 201
    c_id = create_resp.json()["id"]

    # Get client
    get_resp = client.get(f"/api/clients/{c_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Pacific Freight Logistics"

    # List with search
    list_resp = client.get("/api/clients/?q=Pacific", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1


def test_declarations_block_extraction():
    sample_text = """
    # COVERAGE DECLARATIONS SCHEDULE (PAGE 1)
    Policy Number: APX-2026-COMM-7789
    Named Insured: Apex Logistics Ltd
    Insurer: Chubb Commercial Casualty Co.
    Effective Date: November 01, 2026 to November 01, 2027
    Commercial General Liability: $5,000,000 Each Occurrence
    Commercial Property: $10,000,000 Real Property
    Cyber Liability: $2,000,000 Annual Aggregate
    Cyber Deductible: $50,000 Each Incident
    Total Annual Premium: $42,850.00

    # GENERAL CONDITIONS AND EXCLUSIONS
    War and military action exclusion applies across all sections...
    """
    block = ollama_client.extract_declarations_block(sample_text)
    assert "# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)" in block
    assert "War and military action exclusion" not in block
    assert "APX-2026-COMM-7789" in block


@pytest.mark.anyio
async def test_extractor_unreachable_raises_502(monkeypatch):
    from fastapi import HTTPException
    import requests

    def mock_put_unreachable(*args, **kwargs):
        raise requests.exceptions.ConnectionError("Failed to connect to 127.0.0.1:5005")

    monkeypatch.setattr(requests, "put", mock_put_unreachable)
    with pytest.raises(HTTPException) as exc_info:
        await extractor_client.extract_markdown_from_pdf(b"%PDF-test", "sample.pdf")
    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "MicroNode Extractor at port 5005 is not running."


@pytest.mark.anyio
async def test_extractor_http_error_raises_502(monkeypatch):
    from fastapi import HTTPException
    import requests

    # Mock put to return a 500 error response
    class MockResponse:
        status_code = 500
        text = "Internal Server Error"
        def json(self):
            return {}

    def mock_put_error(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(requests, "put", mock_put_error)
    with pytest.raises(HTTPException) as exc_info:
        await extractor_client.extract_markdown_from_pdf(b"%PDF-test", "sample.pdf")
    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "MicroNode Extractor at port 5005 is not running."


@pytest.mark.anyio
async def test_extractor_success(monkeypatch):
    import requests

    captured = {}
    class MockSuccessResponse:
        status_code = 200
        text = '{"page_content": "# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)"}'
        def json(self):
            return {"page_content": "# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)"}

    def mock_put_success(url, data=None, headers=None, timeout=None):
        captured["url"] = url
        captured["data"] = data
        captured["headers"] = headers
        captured["timeout"] = timeout
        return MockSuccessResponse()

    monkeypatch.setattr(requests, "put", mock_put_success)
    result = await extractor_client.extract_markdown_from_pdf(b"%PDF-sample", "policy.pdf")
    assert "# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)" in result
    assert captured["url"] == "http://127.0.0.1:5005/process"
    assert captured["data"] == b"%PDF-sample"
    assert captured["headers"]["Authorization"] == "Bearer micronode-secret-key"
    assert captured["timeout"] == 120.0


def test_declarations_block_truncates_huge_policy():
    # Simulate a 216,000 character policy
    huge_policy = "# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)\n"
    huge_policy += "Policy Number: APX-999\nInsured: Acme Corp\n"
    huge_policy += "# EXCLUSIONS AND CONDITIONS\n"
    huge_policy += "Detailed clause " * 15000  # ~240,000 characters
    
    assert len(huge_policy) > 200000
    block = ollama_client.extract_declarations_block(huge_policy)
    assert "# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)" in block
    assert "Detailed clause" not in block
    assert len(block) < 7000  # Well under 2,000 tokens


@pytest.mark.anyio
async def test_extract_policy_fields_prompt_and_temperature(monkeypatch):
    captured_kwargs = {}

    async def mock_generate(self, prompt, system=None, json_format=False, temperature=0.0, timeout=60.0):
        captured_kwargs["prompt"] = prompt
        captured_kwargs["temperature"] = temperature
        captured_kwargs["json_format"] = json_format
        return json.dumps({
            "insured_name": "Apex Logistics Ltd",
            "policy_number": "APX-2026-COMM-7789",
            "insurer": "Chubb Commercial Casualty Co.",
            "effective_date": "2026-11-01",
            "expiry_date": "2027-11-01",
            "cgl_limit": "$5,000,000",
            "property_limit": "$10,000,000",
            "cyber_limit": "$2,000,000",
            "cyber_deductible": "$50,000",
            "total_premium": "$42,850"
        })

    monkeypatch.setattr(ollama_client, "generate", mock_generate.__get__(ollama_client, type(ollama_client)))

    huge_policy = "# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)\nPolicy Number: APX-2026-COMM-7789\nNamed Insured: Apex Logistics Ltd\nInsurer: Chubb Commercial Casualty Co.\n# CONDITIONS\n" + ("x" * 200000)
    data = await ollama_client.extract_policy_fields(huge_policy)
    
    assert data["policy_number"] == "APX-2026-COMM-7789"
    assert data["insured_name"] == "Apex Logistics Ltd"
    assert captured_kwargs["temperature"] == 0.0
    assert captured_kwargs["json_format"] is True
    # Verify the prompt does NOT contain the 200,000 character policy body
    assert "xxxx" not in captured_kwargs["prompt"]
    assert "Extract the following fields from this insurance declarations table into JSON:" in captured_kwargs["prompt"]
    assert "Declarations Table:" in captured_kwargs["prompt"]
    assert "Return ONLY a valid JSON dictionary." in captured_kwargs["prompt"]


@pytest.mark.anyio
async def test_extract_policy_fields_failure_raises_502(monkeypatch):
    from fastapi import HTTPException

    async def mock_generate(self, prompt, **kwargs):
        return None

    monkeypatch.setattr(ollama_client, "generate", mock_generate.__get__(ollama_client, type(ollama_client)))

    with pytest.raises(HTTPException) as exc_info:
        await ollama_client.extract_policy_fields("# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)\nTest")
    assert exc_info.value.status_code == 502
    assert "failed to extract structured fields" in exc_info.value.detail


def test_export_docx_and_pdf():
    title = "Test Renewal Letter"
    content = "# RENEWAL NOTICE\n\nDear Client,\n\nYour cyber deductible is **$50,000**."
    
    docx_bytes = export_service.export_to_docx(title, content)
    assert len(docx_bytes) > 500

    pdf_bytes = export_service.export_to_pdf(title, content)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF")


def test_render_docx_template():
    template_path = os.path.abspath("data/sample_templates/Apex_Broker_Standard_Letterhead.docx")
    assert os.path.exists(template_path)
    fields = {
        "insured_name": "Acme Widgets Ltd",
        "policy_number": "POL-2026-991",
        "insurer": "Travelers Insurance",
        "effective_date": "2026-12-01",
        "expiry_date": "2027-12-01",
        "total_premium": "$65,000",
        "coverages": [
            {"name": "Commercial General Liability", "limit": "$5,000,000", "deductible": "$2,500"},
            {"name": "Cyber Risk", "limit": "$3,000,000", "deductible": "$25,000"}
        ]
    }
    broker_info = {
        "full_name": "Jane Broker",
        "agency_name": "Apex Partners",
        "email": "jane@apex.demo",
        "current_date": "October 20, 2026"
    }
    rendered_bytes = export_service.render_docx_template(template_path, fields, broker_info)
    assert len(rendered_bytes) > 1000
    from docx import Document
    doc = Document(io.BytesIO(rendered_bytes))
    all_text = " ".join([p.text for p in doc.paragraphs])
    assert "Acme Widgets Ltd" in all_text
    assert "POL-2026-991" in all_text
    assert "Commercial General Liability" in all_text
    assert "$65,000" in all_text


def test_rag_chunking():
    text = "# Section 1\nThis is paragraph 1.\n\n## Section 2\nThis is cyber terms."
    chunks = rag_service.chunk_policy_text(text, policy_id=1, client_id=1, filename="policy.pdf")
    assert len(chunks) >= 2
    assert chunks[0]["metadata"]["policy_id"] == 1
    assert chunks[0]["metadata"]["client_id"] == 1


@pytest.mark.anyio
async def test_jev_classifier_local_fallback_types():
    from app.services.jev_classifier import jev_classifier

    # 1. Certificate of Insurance (COI / ACORD 25)
    coi_res = jev_classifier.classify_with_local_fallback(
        opening_text="ACORD 25 CERTIFICATE OF LIABILITY INSURANCE\nCertificate Holder: Pacific Port Authority\nThis certificate is issued as a matter of information only.",
        filename="Apex_ACORD_25_COI.pdf",
        total_pages=1
    )
    assert coi_res["document_type"] == "certificate"
    assert coi_res["confidence"] >= 0.80
    assert "certificate" in coi_res["probabilities"]

    # 2. Insurance Binder
    binder_res = jev_classifier.classify_with_local_fallback(
        opening_text="TEMPORARY INSURANCE BINDER\nConfirmation of Bound Coverage\nSubjectivities: Signed application within 15 days.",
        filename="Chubb_Binder_2026.pdf",
        total_pages=3
    )
    assert binder_res["document_type"] == "binder"
    assert binder_res["confidence"] >= 0.80

    # 3. Commercial Policy
    policy_res = jev_classifier.classify_with_local_fallback(
        opening_text="# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)\nNamed Insured: Apex Logistics Ltd\nPolicy Number: APX-2026\nGeneral Conditions and Exclusions",
        filename="Apex_Renewal_Policy_2026.pdf",
        total_pages=62
    )
    assert policy_res["document_type"] == "policy"
    assert policy_res["confidence"] >= 0.80


@pytest.mark.anyio
async def test_local_sovereign_ollama_classifier_integration(monkeypatch):
    import httpx
    from app.services.jev_classifier import jev_classifier

    class MockResponse:
        status_code = 200
        def json(self):
            return {
                "response": json.dumps({
                    "document_type": "binder",
                    "confidence": 0.95,
                    "is_insurance_document": 0.99,
                    "has_coverage_schedule": 0.91,
                })
            }

    async def mock_post(self, url, **kwargs):
        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    # Ambiguous filename/text triggers the local Ollama semantic verification pass
    res = await jev_classifier.classify_pdf(b"%PDF-1.4 ambiguous document", "Document_2026.pdf")
    assert res["document_type"] == "binder"
    assert res["confidence"] >= 0.90
    assert "Local Sovereign" in res["engine"]


def test_classify_endpoint():
    email = f"classifybroker_{os.urandom(4).hex()}@twincover.com"
    reg_resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "TwinCover2026!",
        "full_name": "Classify Tester",
        "agency_name": "Apex Commercial"
    })
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    sample_pdf_path = os.path.abspath("data/sample_policies/Apex_Logistics_Renewal_Policy_2026.pdf")
    with open(sample_pdf_path, "rb") as f:
        pdf_bytes = f.read()

    resp = client.post(
        "/api/policies/classify",
        files={"file": ("Apex_Logistics_Renewal_Policy_2026.pdf", pdf_bytes, "application/pdf")},
        headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["document_type"] == "policy"
    assert body["confidence"] > 0.5
    assert "probabilities" in body
    assert body["is_insurance_document"] > 0.5


def test_phase1_vram_consolidation_and_whisper_transcription():
    from app.core.config import settings
    from app.services.ollama_client import ollama_client
    from app.services.transcription_service import transcription_service

    # Verify VRAM consolidation onto qwen2.5vl:7b + nomic-embed-text
    assert "qwen2.5vl" in settings.LLM_MODEL or "qwen2.5-vl" in settings.LLM_MODEL
    assert settings.EMBED_MODEL == "nomic-embed-text"
    assert ollama_client.llm_model == settings.LLM_MODEL

    # Verify local voice memo transcription returns timestamped segments
    sample_audio = b"Built in 2019, full steel frame, wet sprinklered throughout. Requesting $10,000,000 Wrap-Up limit."
    res = transcription_service.transcribe_bytes(
        sample_audio,
        filename="site_walkthrough.m4a",
        specialty_line="construction"
    )
    assert "segments" in res
    assert len(res["segments"]) >= 1
    first_seg = res["segments"][0]
    assert "start" in first_seg and "end" in first_seg and "text" in first_seg
    assert "reference" in first_seg and " - " in first_seg["reference"]


def test_phase1_submissions_evidence_vault_and_cited_extraction():
    email = f"producer_{os.urandom(4).hex()}@twincover.com"
    reg_resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "TwinCover2026!",
        "full_name": "Canadian Specialty Producer",
        "agency_name": "WestCoast Specialty Risks"
    })
    assert reg_resp.status_code == 201
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a commercial client
    cli_resp = client.post("/api/clients/", json={
        "name": "BC Timber & Steel Structures Inc.",
        "account_number": "BCT-2026",
        "primary_contact": "Liam MacLeod, VP Operations",
        "email": "liam@bctimber.ca"
    }, headers=headers)
    assert cli_resp.status_code == 201
    client_id = cli_resp.json()["id"]

    # 2. Create a pre-bind Construction submission
    sub_resp = client.post("/api/submissions/", json={
        "client_id": client_id,
        "title": "Burnaby Industrial Logistics Hub — Wrap-Up & Builders Risk",
        "specialty_line": "construction",
        "status": "field_capture"
    }, headers=headers)
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["id"]

    # 3. Upload multi-artifact capture (site photo + voice memo + field note)
    photo_bytes = b"\xff\xd8\xff\xe0JFIF-test-sprinkler-riser-photo"
    audio_bytes = b"Built in 2019, full steel frame, wet sprinklered throughout. Total project value $14,500,000 CAD."

    cap_resp = client.post(
        f"/api/submissions/{sub_id}/capture",
        files=[
            ("files", ("site_photo_02.jpg", photo_bytes, "image/jpeg")),
            ("files", ("walkthrough_voice.m4a", audio_bytes, "audio/mp4")),
        ],
        data={
            "text_note": "Hot works welding permit enforced with 60-minute thermal fire watch.",
            "note_title": "field_inspection_note.txt",
            "run_sync": "true",
        },
        headers=headers,
    )
    assert cap_resp.status_code == 202
    job_data = cap_resp.json()
    assert job_data["receipt"] == "Processing Capture"
    job_id = job_data["id"]

    # 4. Poll GET /api/jobs/{job_id}
    poll_resp = client.get(f"/api/jobs/{job_id}", headers=headers)
    assert poll_resp.status_code == 200
    assert poll_resp.json()["status"] == "completed"
    assert poll_resp.json()["progress"] == 100

    # 5. Fetch updated submission and verify Immutable Evidence Vault + Source-Cited Risk Profile
    detail_resp = client.get(f"/api/submissions/{sub_id}", headers=headers)
    assert detail_resp.status_code == 200
    sub_detail = detail_resp.json()
    assert sub_detail["artifact_count"] == 3
    assert len(sub_detail["evidence_artifacts"]) == 3

    # Check immutability metadata on stored artifacts
    for art in sub_detail["evidence_artifacts"]:
        assert art["metadata_json"]["is_immutable"] is True
        assert len(art["metadata_json"]["sha256_hash"]) == 64
        assert os.path.exists(art["file_path"])

    # Check source-cited underwriting fields (Task C schema)
    risk_profile = sub_detail["structured_risk_profile"]
    assert len(risk_profile) >= 3
    for field in risk_profile:
        assert "field_key" in field
        assert "label" in field
        assert "value" in field and field["value"]
        assert "confidence" in field and 0.0 <= field["confidence"] <= 1.0
        assert "citations" in field and len(field["citations"]) >= 1
        first_cit = field["citations"][0]
        assert first_cit["artifact_id"].startswith("art_")
        assert first_cit["artifact_type"] in ("photo", "audio", "pdf", "spreadsheet", "text_note")
        assert first_cit["reference"]
        assert first_cit["excerpt"]

    # 6. Add & update a Canadian Carrier Market Placement
    mp_resp = client.post(
        f"/api/submissions/{sub_id}/placements",
        json={
            "carrier_name": "Intact Specialty Solutions",
            "target_line": "Wrap-Up Liability & Builders Risk",
            "status": "submitted",
            "quoted_premium": "$58,400 CAD",
            "notes": "Lead market for BC steel & timber industrial risks"
        },
        headers=headers
    )
    assert mp_resp.status_code == 201
    mp_id = mp_resp.json()["id"]

    mp_upd = client.put(
        f"/api/submissions/{sub_id}/placements/{mp_id}",
        json={"status": "quote_received", "quoted_premium": "$56,900 CAD"},
        headers=headers
    )
    assert mp_upd.status_code == 200
    assert mp_upd.json()["status"] == "quote_received"
    assert mp_upd.json()["quoted_premium"] == "$56,900 CAD"


def test_phase2_signoff_gate_packet_export_and_quote_diffing():
    email = f"phase2_{os.urandom(4).hex()}@twincover.com"
    reg_resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "TwinCover2026!",
        "full_name": "Phase 2 Producer",
        "agency_name": "Ocean Falls Insurance Services"
    })
    assert reg_resp.status_code == 201
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    cli_resp = client.post("/api/clients/", json={
        "name": "Pacific Marine & AI Systems Ltd.",
        "account_number": "PMI-9910",
        "primary_contact": "Sarah Chen, CFO"
    }, headers=headers)
    assert cli_resp.status_code == 201
    client_id = cli_resp.json()["id"]

    sub_resp = client.post("/api/submissions/", json={
        "client_id": client_id,
        "title": "Pacific Tech & Warehouse Placement",
        "specialty_line": "cyber_ai",
        "status": "drafted",
        "initial_note": "Expiring policy has $5,000,000 limit and $10,000 deductible with full AI coverage."
    }, headers=headers)
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["id"]

    # 1. Sign-off gate: unverified submission MUST block packet export with 403 Forbidden
    unverified_pdf = client.get(f"/api/submissions/{sub_id}/export?format=pdf", headers=headers)
    assert unverified_pdf.status_code == 403
    unverified_docx = client.get(f"/api/submissions/{sub_id}/export?format=docx", headers=headers)
    assert unverified_docx.status_code == 403

    # 2. Verify submission (sets verified_at) and set structured_risk_profile baseline
    verify_resp = client.put(f"/api/submissions/{sub_id}", json={
        "verified": True,
        "structured_risk_profile": [
            {
                "field_key": "requested_cyber_limit",
                "label": "Requested Limit & Retention",
                "value": "$5,000,000 Limit | $10,000 Deductible",
                "confidence": 0.95,
                "citations": []
            }
        ]
    }, headers=headers)
    assert verify_resp.status_code == 200
    assert verify_resp.json()["verified_at"] is not None

    # 3. Verified submission exports .pdf and .docx successfully
    verified_pdf = client.get(f"/api/submissions/{sub_id}/export?format=pdf", headers=headers)
    assert verified_pdf.status_code == 200
    assert verified_pdf.content.startswith(b"%PDF")

    verified_docx = client.get(f"/api/submissions/{sub_id}/export?format=docx", headers=headers)
    assert verified_docx.status_code == 200
    assert len(verified_docx.content) > 1000

    # 4. Cover Email generation
    mp1 = client.post(f"/api/submissions/{sub_id}/placements", json={
        "carrier_name": "CFC Underwriting (Canada)",
        "target_line": "Cyber & AI Liability ($5M)",
        "status": "submitted"
    }, headers=headers).json()

    mp2 = client.post(f"/api/submissions/{sub_id}/placements", json={
        "carrier_name": "Beazley Canada",
        "target_line": "Cyber & Tech E&O ($5M)",
        "status": "submitted"
    }, headers=headers).json()

    cover_resp = client.post(
        f"/api/submissions/{sub_id}/cover-email",
        json={"placement_id": mp1["id"]},
        headers=headers
    )
    assert cover_resp.status_code == 200
    assert "CFC Underwriting" in cover_resp.json()["body"]
    assert cover_resp.json()["verified"] is True

    # 5. Async Quote PDF ingestion on Placement 1 (includes higher deductible + AI Exclusion)
    quote1_text = (
        "CARRIER QUOTE: CFC Underwriting\n"
        "Total Annual Premium: $42,500 CAD\n"
        "Limit: $5,000,000\n"
        "Deductible: $50,000\n"
        "Endorsement: Absolute Artificial Intelligence Exclusion applies.\n"
        "Subject to: Signed MFA attestation prior to binding."
    ).encode("utf-8")

    q1_resp = client.post(
        f"/api/submissions/{sub_id}/placements/{mp1['id']}/quote",
        files={"file": ("CFC_Quote_2026.pdf", quote1_text, "application/pdf")},
        data={"run_sync": "true"},
        headers=headers
    )
    assert q1_resp.status_code == 202
    assert q1_resp.json()["status"] == "completed"

    # Async Quote PDF ingestion on Placement 2 (narrowed limit + water exclusion)
    quote2_text = (
        "CARRIER QUOTE: Beazley Canada\n"
        "Total Annual Premium: $36,000 CAD\n"
        "Limit: $2,000,000\n"
        "Deductible: $10,000\n"
        "Endorsement: Surface Water Exclusion.\n"
    ).encode("utf-8")

    q2_resp = client.post(
        f"/api/submissions/{sub_id}/placements/{mp2['id']}/quote",
        files={"file": ("Beazley_Quote_2026.pdf", quote2_text, "application/pdf")},
        data={"run_sync": "true"},
        headers=headers
    )
    assert q2_resp.status_code == 202
    assert q2_resp.json()["status"] == "completed"

    # 6. Run Quote Diff Analysis (quote_vs_expiring & quote_vs_quote)
    comp_resp = client.post(f"/api/submissions/{sub_id}/compare-quotes", headers=headers)
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert comp_data["quotes_compared"] == 2
    flag_types = {f["flag_type"] for f in comp_data["diff_flags"]}
    scopes = {f["comparison_scope"] for f in comp_data["diff_flags"]}
    assert "higher_deductible" in flag_types
    assert "narrowed_limit" in flag_types
    assert "new_exclusion" in flag_types
    assert "quote_vs_expiring" in scopes
    assert "quote_vs_quote" in scopes

    # 7. Export Client Quote Comparison Proposal (.pdf & .docx)
    prop_pdf = client.get(f"/api/submissions/{sub_id}/quote-comparison/export?format=pdf", headers=headers)
    assert prop_pdf.status_code == 200
    assert prop_pdf.content.startswith(b"%PDF")

    prop_docx = client.get(f"/api/submissions/{sub_id}/quote-comparison/export?format=docx", headers=headers)
    assert prop_docx.status_code == 200
    assert len(prop_docx.content) > 1000


def teardown_module(module):
    if os.path.exists("./test_twincover.db"):
        try:
            os.remove("./test_twincover.db")
        except Exception:
            pass
