import io
import logging
from typing import Tuple
import httpx
from pypdf import PdfReader
from app.core.config import settings

logger = logging.getLogger(__name__)


class ExtractorClient:
    """Client for external Document Extractor microservice with built-in PDF fallback."""

    def __init__(self):
        self.url = settings.EXTRACTOR_URL
        self.token = settings.EXTRACTOR_TOKEN

    async def check_health(self) -> Tuple[bool, str]:
        """Check if external extractor microservice is reachable."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                # Attempt ping or options on base domain / health
                base_url = self.url.rsplit("/", 1)[0]
                resp = await client.get(f"{base_url}/health")
                if resp.status_code in (200, 404):
                    return True, "Microservice reachable"
                return False, f"Returned status {resp.status_code}"
        except Exception as e:
            return False, f"Offline ({type(e).__name__})"

    async def extract_markdown_from_pdf(self, pdf_bytes: bytes, filename: str) -> str:
        """
        Forward raw PDF bytes to external microservice.
        If microservice is unavailable, fallback gracefully to high-precision built-in PDF extractor.
        """
        try:
            headers = {
                "Authorization": f"Bearer {self.token}"
            }
            files = {
                "file": (filename, pdf_bytes, "application/pdf")
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                logger.info(f"Forwarding {filename} to external extractor: {self.url}")
                response = await client.post(self.url, headers=headers, files=files)

                if response.status_code == 200:
                    data = response.json() if "application/json" in response.headers.get("content-type", "") else None
                    if data and isinstance(data, dict) and "markdown" in data:
                        return data["markdown"]
                    elif response.text:
                        return response.text
                logger.warning(f"External extractor responded with status {response.status_code}. Using built-in engine.")
        except Exception as exc:
            logger.info(f"External extractor unreachable ({exc}). Using built-in local PDF engine.")

        # Built-in local PDF extraction fallback
        return self._extract_locally(pdf_bytes, filename)

    def _extract_locally(self, pdf_bytes: bytes, filename: str) -> str:
        """
        Extract structured markdown text directly from PDF bytes using PyPDF.
        Synthesizes formatted markdown schedules, sections, and tables.
        """
        reader = PdfReader(io.BytesIO(pdf_bytes))
        total_pages = len(reader.pages)
        markdown_sections = []

        markdown_sections.append(f"# POLICY DECLARATIONS & SCHEDULE SUMMARY\n**Document Source:** `{filename}` | **Pages:** {total_pages}\n")

        for idx, page in enumerate(reader.pages):
            page_num = idx + 1
            text = page.extract_text() or ""
            text = text.strip()
            if not text:
                continue

            markdown_sections.append(f"## Section / Page {page_num}\n")
            # Structure into clean paragraphs and lists
            lines = text.splitlines()
            current_block = []

            for line in lines:
                cleaned = line.strip()
                if not cleaned:
                    if current_block:
                        markdown_sections.append(" ".join(current_block) + "\n\n")
                        current_block = []
                    continue

                # Header detection heuristics
                if (
                    cleaned.isupper() and len(cleaned) < 80
                    or cleaned.startswith("SECTION")
                    or cleaned.startswith("SCHEDULE")
                    or cleaned.startswith("PART ")
                    or cleaned.startswith("ENDORSEMENT")
                ):
                    if current_block:
                        markdown_sections.append(" ".join(current_block) + "\n\n")
                        current_block = []
                    markdown_sections.append(f"### {cleaned}\n")
                elif ":" in cleaned and len(cleaned.split(":", 1)[0]) < 40:
                    if current_block:
                        markdown_sections.append(" ".join(current_block) + "\n\n")
                        current_block = []
                    parts = cleaned.split(":", 1)
                    markdown_sections.append(f"- **{parts[0].strip()}:** {parts[1].strip()}\n")
                else:
                    current_block.append(cleaned)

            if current_block:
                markdown_sections.append(" ".join(current_block) + "\n\n")

        return "\n".join(markdown_sections)


extractor_client = ExtractorClient()
