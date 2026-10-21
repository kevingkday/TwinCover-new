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
        "full_name": "Kevin Broker",
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


def teardown_module(module):
    if os.path.exists("./test_twincover.db"):
        try:
            os.remove("./test_twincover.db")
        except Exception:
            pass
