# TwinCover — Commercial Insurance Policy Verification & Renewal Platform

**TwinCover** is a vertical software suite purpose-built for commercial insurance brokers (e.g., account executives, principals, and risk managers).

When an insurance carrier sends a multi-page renewal policy PDF (60+ pages), brokers no longer have to manually sift through dense declarations schedules or type out client letters from scratch. TwinCover automates ingestion, extracts structured coverage schedules, provides a side-by-side verification workflow, drafts formal client letters with one-click `.docx`/`.pdf` export, and powers client-isolated RAG question answering.

---

## Key Capabilities

1. **Authentication & Broker Isolation**: JWT Bearer token authentication, bcrypt password hashing, and strict tenant-partitioned client data.
2. **Commercial Client Accounts**: Searchable client portfolio with policy counts, risk notes, and verification statuses.
3. **Policy Ingestion Pipeline**:
   - Drag-and-drop intake accepting multi-page policy PDFs.
   - Microservice integration with `http://localhost:5005/process` (with seamless built-in PyPDF fallback if microservice is offline).
   - Automated extraction via local Ollama LLM (`qwen2.5:7b-instruct`) or high-precision rule engine for key declarations:
     - Named Insured, Policy #, Insurer, Effective/Expiry Dates, CGL Limit, Property Limit, Cyber Limit, Cyber Deductible, and Total Premium.
4. **Side-by-Side Review & Verification Screen**:
   - Left Pane: Extracted policy text / schedule viewer with search filter.
   - Right Pane: Clean confirmation form to verify and edit extracted fields.
   - "Pending Verification" (Amber) vs "Verified & Audited" (Emerald) status tracking.
5. **Client Renewal Letter Generation**:
   - Markdown letter template engine with variable token interpolation (`{{insured_name}}`, `{{policy_number}}`, `{{cyber_deductible}}`, `{{total_premium}}`, etc.).
   - Pre-seeded with:
     - *Commercial Policy Renewal Summary*
     - *Cyber Risk & Security Advisory*
     - *Coverage Limits & Deductible Comparison*
   - Local LLM executive polish with professional broker tone.
   - Dual-view live Markdown editor & formatted preview.
   - One-click export to **DOCX** (via `python-docx`) and **PDF** (via `reportlab`).
6. **Client-Scoped Q&A (RAG)**:
   - Dedicated policy intelligence drawer.
   - Persistent ChromaDB vector store strictly isolated to `client_{client_id}`.
   - Returns concise, authoritative coverage answers citing specific policy sections and clauses.
7. **Cloudflare D1 & Pages Readiness**:
   - SQLite schema 100% compatible with Cloudflare D1 serverless database.
   - Includes `cloudflare_d1_schema.sql` migration script and `wrangler.toml` configuration.

---

## Architecture

```
twincover/
├── backend/
│   ├── app/
│   │   ├── api/          # Routers for auth, clients, policies, letters, rag, system
│   │   ├── core/         # Config, database, security, schema initialization
│   │   ├── models/       # SQLAlchemy models (User, Client, Policy, ExtractedFields, etc.)
│   │   ├── schemas/      # Pydantic v2 schemas
│   │   └── services/     # Extractor client, Ollama client, RAG service, DOCX/PDF export
│   ├── data/             # Generated sample commercial policies
│   ├── migrations/       # Cloudflare D1 schema (cloudflare_d1_schema.sql)
│   ├── tests/            # Pytest unit and integration test suite
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios/Fetch API client & service wrappers
│   │   ├── components/   # Navbar, DragDropUpload, SideBySideReview, LetterGenerator, ClientRagDrawer
│   │   ├── pages/        # Login, Register, ClientsList, ClientWorkspace, TemplateEditor
│   │   ├── App.jsx
│   │   └── index.css     # Premium insurance SaaS design system
│   ├── package.json
│   └── vite.config.js
├── wrangler.toml         # Cloudflare Pages & D1 binding configuration
├── CLOUDFLARE_DEPLOYMENT.md
├── start.bat             # Windows one-click launcher
└── run.sh                # Linux/macOS launcher
```

---

## Quickstart

### 1. Windows (One-Click)
Double-click `start.bat` or run:
```bat
start.bat
```

### 2. Linux / macOS
```bash
chmod +x run.sh
./run.sh
```

### 3. Manual Boot
**Backend:**
```bash
python -m venv .venv
source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
pip install -r backend/requirements.txt
cd backend
python -c "import app.core.init_db; app.core.init_db.init_db()"
python create_sample_pdf.py
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open your browser to: **`http://localhost:5173`**

---

## Default Demo Credentials

The database automatically seeds an initial commercial account executive user on first boot:
- **Email:** `broker@twincover.com`
- **Password:** `TwinCover2026!`
- *(Or click the "Fill Demo Principal Account" button on the login screen)*

---

## External Services & Local AI Configuration

Configured in `backend/.env`:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `sqlite:///./twincover.db` | Local SQLite or Cloudflare D1 connection |
| `EXTRACTOR_URL` | `http://localhost:5005/process` | Microservice document parser endpoint |
| `EXTRACTOR_TOKEN` | `micronode-secret-key` | Bearer token for extractor service |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama inference server |
| `LLM_MODEL` | `qwen2.5:7b-instruct` | LLM model for schedule extraction & letter drafting |
| `EMBED_MODEL` | `nomic-embed-text` | Vector embeddings model for ChromaDB |
| `CHROMA_PERSIST_DIRECTORY` | `./chroma_data` | Persistent client-isolated vector store |

*Note: If external microservices or Ollama are offline, TwinCover seamlessly falls back to its built-in high-fidelity PyPDF parser, deterministic insurance regex extraction engine, and local similarity search, ensuring zero disruption.*

---

## Cloudflare D1 Deployment

To migrate to Cloudflare D1 and host on Cloudflare Pages:
1. Run `wrangler d1 create twincover-db`
2. Run `wrangler d1 execute twincover-db --file=./backend/migrations/cloudflare_d1_schema.sql`
3. Deploy frontend: `cd frontend && npm run build && wrangler pages deploy dist --project-name=twincover`
*(See [CLOUDFLARE_DEPLOYMENT.md](file:///c:/Users/kevin/source/repos/kevingkday/TwinCover-new/CLOUDFLARE_DEPLOYMENT.md) for full details).*
