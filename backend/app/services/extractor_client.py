import logging
from typing import Tuple
import requests
from fastapi import HTTPException, status
from app.core.config import settings

logger = logging.getLogger(__name__)


class ExtractorClient:
    """Client for external MicroNode Document Extractor microservice at port 5005."""

    def __init__(self):
        self.url = settings.EXTRACTOR_URL.replace("localhost", "127.0.0.1")
        self.token = settings.EXTRACTOR_TOKEN or "micronode-secret-key"

    async def check_health(self) -> Tuple[bool, str]:
        """Check if external extractor microservice is reachable."""
        try:
            base_url = self.url.rsplit("/", 1)[0]
            resp = requests.get(
                f"{base_url}/health",
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=3.0
            )
            if resp.status_code in (200, 404):
                return True, "Microservice reachable"
            return False, f"Returned status {resp.status_code}"
        except Exception as e:
            return False, f"Offline ({type(e).__name__})"

    async def extract_markdown_from_pdf(
        self,
        file_bytes: bytes = None,
        filename: str = "document.pdf",
        pdf_bytes: bytes = None
    ) -> str:
        """
        Forward raw PDF bytes directly in request body via HTTP PUT to MicroNode Extractor at port 5005.
        Target URL: http://127.0.0.1:5005/process
        Headers: {"Authorization": "Bearer micronode-secret-key"}
        Request Body: data=file_bytes
        Timeout: 120
        Error Handling: Catch requests.exceptions.RequestException and log the exact response status code
        and response body before raising 502 error.
        """
        raw_bytes = file_bytes if file_bytes is not None else pdf_bytes
        if raw_bytes is None:
            raise ValueError("No PDF file bytes provided for extraction")

        target_url = "http://127.0.0.1:5005/process"
        token = self.token or "micronode-secret-key"
        headers = {
            "Authorization": f"Bearer {token}"
        }

        try:
            logger.info(
                f"Sending PUT request to {target_url} for {filename} ({len(raw_bytes)} bytes) with timeout=120"
            )
            response = requests.put(
                target_url,
                data=raw_bytes,
                headers=headers,
                timeout=120
            )

            # Raise HTTPError for 4xx/5xx responses if raise_for_status is supported
            if hasattr(response, "raise_for_status"):
                response.raise_for_status()
            elif getattr(response, "status_code", 200) != 200:
                logger.error(
                    f"MicroNode Extractor at port 5005 returned HTTP {response.status_code}: {getattr(response, 'text', '')}"
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="MicroNode Extractor at port 5005 is not running."
                )

            # Parse markdown or page content from successful response
            if response.status_code == 200:
                try:
                    data = response.json()
                    if isinstance(data, dict):
                        if "markdown" in data and data["markdown"]:
                            return data["markdown"]
                        elif "page_content" in data and data["page_content"]:
                            return data["page_content"]
                        elif "text" in data and data["text"]:
                            return data["text"]
                        elif "content" in data and data["content"]:
                            return data["content"]
                except Exception:
                    pass

                if response.text and response.text.strip():
                    return response.text.strip()

            return ""

        except HTTPException:
            raise
        except requests.exceptions.RequestException as exc:
            resp_code = exc.response.status_code if getattr(exc, "response", None) is not None else "No response"
            resp_body = exc.response.text if getattr(exc, "response", None) is not None else str(exc)
            logger.error(
                f"MicroNode Extractor at port 5005 request failed. Status: {resp_code}, Body: {resp_body}"
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="MicroNode Extractor at port 5005 is not running."
            ) from exc


extractor_client = ExtractorClient()
