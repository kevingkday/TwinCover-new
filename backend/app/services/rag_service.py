import logging
import re
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings
from app.services.ollama_client import ollama_client
from app.schemas.schemas import RagSourceChunk

logger = logging.getLogger(__name__)


class RagService:
    """
    Client-isolated RAG service powered by persistent ChromaDB.
    Strictly isolates vector spaces per client: collection name = client_{client_id}.
    """

    def __init__(self):
        self.persist_directory = settings.CHROMA_PERSIST_DIRECTORY
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = chromadb.PersistentClient(
                path=self.persist_directory,
                settings=ChromaSettings(anonymized_telemetry=False)
            )
        return self._client

    def _get_collection_name(self, client_id: int) -> str:
        return f"client_{client_id}"

    def get_or_create_client_collection(self, client_id: int):
        collection_name = self._get_collection_name(client_id)
        return self.client.get_or_create_collection(
            name=collection_name,
            metadata={"client_id": client_id, "hnsw:space": "cosine"}
        )

    def chunk_policy_text(self, text: str, policy_id: int, client_id: int, filename: str) -> List[Dict[str, Any]]:
        """
        Segment policy text into logical sections based on markdown headings and paragraphs.
        """
        chunks = []
        sections = re.split(r"(^#{1,3}\s+[^\n]+)", text, flags=re.MULTILINE)

        current_heading = "General Policy Schedule"
        buffer = ""
        chunk_idx = 0

        for part in sections:
            part = part.strip()
            if not part:
                continue

            if part.startswith("#"):
                # Flush previous buffer
                if buffer:
                    chunks.append({
                        "id": f"p{policy_id}_c{chunk_idx}",
                        "text": buffer.strip(),
                        "metadata": {
                            "policy_id": policy_id,
                            "client_id": client_id,
                            "filename": filename,
                            "section_title": current_heading,
                            "chunk_index": chunk_idx
                        }
                    })
                    chunk_idx += 1
                    buffer = ""
                current_heading = part.lstrip("#").strip()
            else:
                # If part is very large, split into 1000 char windows
                if len(part) > 1200:
                    sub_paras = part.split("\n\n")
                    for p in sub_paras:
                        if len(buffer) + len(p) > 1000:
                            if buffer:
                                chunks.append({
                                    "id": f"p{policy_id}_c{chunk_idx}",
                                    "text": buffer.strip(),
                                    "metadata": {
                                        "policy_id": policy_id,
                                        "client_id": client_id,
                                        "filename": filename,
                                        "section_title": current_heading,
                                        "chunk_index": chunk_idx
                                    }
                                })
                                chunk_idx += 1
                                buffer = p
                        else:
                            buffer = (buffer + "\n\n" + p).strip()
                else:
                    buffer = (buffer + "\n\n" + part).strip()

        if buffer:
            chunks.append({
                "id": f"p{policy_id}_c{chunk_idx}",
                "text": buffer.strip(),
                "metadata": {
                    "policy_id": policy_id,
                    "client_id": client_id,
                    "filename": filename,
                    "section_title": current_heading,
                    "chunk_index": chunk_idx
                }
            })

        return chunks

    async def index_policy(self, client_id: int, policy_id: int, filename: str, raw_text: str):
        """
        Index policy text chunks into the client's isolated Chroma collection.
        """
        collection = self.get_or_create_client_collection(client_id)
        chunks = self.chunk_policy_text(raw_text, policy_id, client_id, filename)

        if not chunks:
            logger.warning(f"No chunks created for policy {policy_id}")
            return

        ids = [c["id"] for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]

        # Check if Ollama embeddings are accessible
        test_embed = await ollama_client.get_embedding("test")
        if test_embed:
            embeddings = []
            for doc in documents:
                emb = await ollama_client.get_embedding(doc[:2000])
                embeddings.append(emb or test_embed)
            collection.upsert(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)
        else:
            # Let ChromaDB use default sentence-transformers or text search
            collection.upsert(ids=ids, documents=documents, metadatas=metadatas)

        logger.info(f"Indexed {len(chunks)} chunks into client_{client_id} collection for {filename}")

    async def query(self, client_id: int, query_text: str, top_k: int = 4) -> Dict[str, Any]:
        """
        Query strictly within client_{client_id} collection and generate an insurance answer.
        """
        collection_name = self._get_collection_name(client_id)
        try:
            collection = self.client.get_collection(name=collection_name)
        except Exception:
            return {
                "query": query_text,
                "client_id": client_id,
                "answer": "No policy documents have been uploaded for this client yet. Please upload a policy schedule to ask questions.",
                "sources": [],
                "model_used": "system"
            }

        count = collection.count()
        if count == 0:
            return {
                "query": query_text,
                "client_id": client_id,
                "answer": "No indexed sections found for this client.",
                "sources": [],
                "model_used": "system"
            }

        k = min(top_k, count)
        query_embed = await ollama_client.get_embedding(query_text)

        if query_embed:
            results = collection.query(query_embeddings=[query_embed], n_results=k)
        else:
            results = collection.query(query_texts=[query_text], n_results=k)

        source_chunks: List[RagSourceChunk] = []
        context_blocks: List[str] = []

        if results and "documents" in results and results["documents"]:
            docs = results["documents"][0]
            metas = results["metadatas"][0] if "metadatas" in results and results["metadatas"] else []
            distances = results["distances"][0] if "distances" in results and results["distances"] else []

            for i, doc in enumerate(docs):
                meta = metas[i] if i < len(metas) else {}
                dist = distances[i] if i < len(distances) else None
                # Cosine distance to similarity score
                score = round(1.0 - (dist if dist is not None else 0.5), 3) if dist is not None else 0.85

                chunk_obj = RagSourceChunk(
                    policy_id=meta.get("policy_id", 0),
                    filename=meta.get("filename", "Policy Document"),
                    section_title=meta.get("section_title", "General"),
                    chunk_index=meta.get("chunk_index", i),
                    content=doc,
                    score=score
                )
                source_chunks.append(chunk_obj)
                context_blocks.append(f"--- Section: {chunk_obj.section_title} (Policy: {chunk_obj.filename}) ---\n{doc}")

        context_str = "\n\n".join(context_blocks)

        # Synthesize answer using Ollama LLM
        prompt = f"""
You are an insurance policy assistant assisting a commercial broker.
Answer the user's question accurately based STRICTLY on the policy excerpts provided below.
If the excerpts do not contain the answer, say "Based on the uploaded policy documents, this information is not explicitly specified."
Cite the section or schedule name where applicable. Be concise, precise, and professional.

User Question: {query_text}

Policy Excerpts:
\"\"\"
{context_str}
\"\"\"
"""
        system = "You are a specialized commercial insurance policy analyst. Answer with clarity and cite specific sections."
        llm_answer = await ollama_client.generate(prompt=prompt, system=system, timeout=45.0)

        if not llm_answer:
            # Fallback direct answer generation from top chunk
            if source_chunks:
                top = source_chunks[0]
                llm_answer = f"Relevant clause found in **{top.section_title}** ({top.filename}):\n\n> {top.content[:350]}..."
            else:
                llm_answer = "No matching policy terms found for this query."

        return {
            "query": query_text,
            "client_id": client_id,
            "answer": llm_answer.strip(),
            "sources": source_chunks,
            "model_used": settings.LLM_MODEL if llm_answer else "fallback_retrieval"
        }


rag_service = RagService()
