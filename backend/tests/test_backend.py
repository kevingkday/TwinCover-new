import os
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


def test_rule_based_policy_field_extraction():
    sample_text = """
    # COMMON POLICY DECLARATIONS
    Policy Number: APX-2026-COMM-7789
    Named Insured: Apex Logistics Ltd
    Insurer: Chubb Commercial Casualty Co.
    Effective Date: November 01, 2026 to November 01, 2027
    Commercial General Liability: $5,000,000 Each Occurrence
    Commercial Property: $10,000,000 Real Property
    Cyber Liability: $2,000,000 Annual Aggregate
    Cyber Deductible: $50,000 Each Incident
    Total Annual Premium: $42,850.00
    """
    fields = ollama_client._regex_extract(sample_text)
    assert fields["insured_name"] == "Apex Logistics Ltd"
    assert fields["policy_number"] == "APX-2026-COMM-7789"
    assert "Chubb" in fields["insurer"]
    assert "$5,000,000" in fields["cgl_limit"]
    assert "$10,000,000" in fields["property_limit"]
    assert "$2,000,000" in fields["cyber_limit"]
    assert "$50,000" in fields["cyber_deductible"]
    assert "$42,850" in fields["total_premium"]


def test_export_docx_and_pdf():
    title = "Test Renewal Letter"
    content = "# RENEWAL NOTICE\n\nDear Client,\n\nYour cyber deductible is **$50,000**."
    
    docx_bytes = export_service.export_to_docx(title, content)
    assert len(docx_bytes) > 500

    pdf_bytes = export_service.export_to_pdf(title, content)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF")


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
