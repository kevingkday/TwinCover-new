# TwinCover — Cloudflare D1 & Pages Deployment Guide

TwinCover uses standard SQLite for local execution and is 100% compatible with **Cloudflare D1**, Cloudflare's serverless edge SQLite database.

---

## 1. Cloudflare D1 Database Provisioning

### Step 1: Install Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### Step 2: Create the D1 Database
```bash
wrangler d1 create twincover-db
```
*Take note of the output `database_id` and update `wrangler.toml` with this ID.*

### Step 3: Apply the TwinCover Schema
Execute the initial migration DDL script directly onto Cloudflare D1:
```bash
wrangler d1 execute twincover-db --file=./backend/migrations/cloudflare_d1_schema.sql
```

To test querying your D1 tables:
```bash
wrangler d1 execute twincover-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

---

## 2. Frontend Deployment to Cloudflare Pages

### Step 1: Build the React + Vite Production Bundle
```bash
cd frontend
npm run build
```

### Step 2: Deploy to Cloudflare Pages
```bash
wrangler pages deploy dist --project-name=twincover
```
Your TwinCover single-page application will be live at `https://twincover.pages.dev`.

---

## 3. Hybrid AI Inference Architecture

Commercial insurance documents require high-security, local zero-data-retention AI models:
- **Local LLM**: Ollama (`qwen2.5:7b-instruct`)
- **Local Embeddings**: Ollama (`nomic-embed-text`)
- **Client-Scoped Vector Store**: ChromaDB (`./chroma_data`)

To connect your Cloudflare deployment to your local or private cloud inference engine:
1. Run a secure Cloudflare Tunnel from your broker workstation:
   ```bash
   cloudflared tunnel run twincover-backend
   ```
2. Set the `VITE_API_URL` environment variable in Cloudflare Pages to point to your secure tunnel endpoint.
