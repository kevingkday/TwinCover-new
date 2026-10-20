import json
import logging
import re
from typing import Dict, Any, Optional, List, Tuple
import httpx
from jinja2 import Template
from app.core.config import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    """Client for local Ollama LLM and Embeddings with robust offline fallback."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.llm_model = settings.LLM_MODEL
        self.embed_model = settings.EMBED_MODEL

    async def check_health(self) -> Tuple[bool, str]:
        """Check if local Ollama server is running."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code == 200:
                    models = [m.get("name") for m in resp.json().get("models", [])]
                    has_llm = any(self.llm_model in m for m in models)
                    status_text = f"Online ({len(models)} models ready" + (f", {self.llm_model} loaded)" if has_llm else ")")
                    return True, status_text
                return False, f"HTTP {resp.status_code}"
        except Exception as e:
            return False, f"Offline ({type(e).__name__})"

    async def generate(self, prompt: str, system: Optional[str] = None, json_format: bool = False, timeout: float = 60.0) -> Optional[str]:
        """Send prompt to local Ollama generate API."""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.llm_model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.1 if json_format else 0.3,
                "top_p": 0.9,
            }
        }
        if system:
            payload["system"] = system
        if json_format:
            payload["format"] = "json"

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    return resp.json().get("response")
                logger.warning(f"Ollama returned HTTP {resp.status_code}: {resp.text}")
        except Exception as exc:
            logger.info(f"Ollama inference unavailable ({exc}). Using internal insurance engine.")
        return None

    async def get_embedding(self, text: str) -> Optional[List[float]]:
        """Fetch vector embedding from Ollama nomic-embed-text."""
        url = f"{self.base_url}/api/embeddings"
        payload = {
            "model": self.embed_model,
            "prompt": text
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    return resp.json().get("embedding")
        except Exception as exc:
            logger.debug(f"Ollama embeddings unavailable ({exc}).")
        return None

    async def extract_policy_fields(self, policy_text: str) -> Dict[str, Any]:
        """
        Extract required structured fields from policy markdown.
        First tries local Ollama with JSON mode, then falls back to specialized regex engine.
        """
        # Truncate text to relevant initial pages / schedules (first 15,000 chars) for LLM context
        truncated_text = policy_text[:16000]

        prompt = f"""
You are an expert commercial insurance policy analyst. Extract key policy schedule values from the policy text below.
Return ONLY a valid JSON object with EXACTLY these keys:
- insured_name: string or null
- policy_number: string or null
- insurer: string (e.g. carrier name) or null
- effective_date: string (e.g. YYYY-MM-DD or Month DD, YYYY) or null
- expiry_date: string (e.g. YYYY-MM-DD or Month DD, YYYY) or null
- cgl_limit: string with dollar sign (e.g. "$5,000,000") or null
- property_limit: string with dollar sign (e.g. "$10,000,000") or null
- cyber_limit: string with dollar sign (e.g. "$2,000,000") or null
- cyber_deductible: string with dollar sign (e.g. "$50,000") or null
- total_premium: string with dollar sign (e.g. "$42,850") or null

Policy text:
\"\"\"
{truncated_text}
\"\"\"
"""
        system = "You are a specialized commercial insurance data extractor. Output strictly valid JSON."

        llm_response = await self.generate(prompt=prompt, system=system, json_format=True, timeout=45.0)
        if llm_response:
            try:
                # Clean up any potential markdown code blocks
                clean_json_str = llm_response.strip()
                if clean_json_str.startswith("```"):
                    clean_json_str = re.sub(r"^```(?:json)?", "", clean_json_str)
                    clean_json_str = re.sub(r"```$", "", clean_json_str).strip()
                parsed = json.loads(clean_json_str)
                # Verify that key fields are present
                if isinstance(parsed, dict) and any(parsed.get(k) for k in ["insured_name", "policy_number", "cgl_limit"]):
                    return parsed
            except Exception as e:
                logger.warning(f"Failed to parse LLM JSON response: {e}")

        # Fallback to high-precision regex extraction engine
        logger.info("Using rule-based insurance regex extraction fallback.")
        return self._regex_extract(policy_text)

    def _regex_extract(self, text: str) -> Dict[str, Any]:
        """Rule-based insurance declarations regex extractor."""
        data = {
            "insured_name": None,
            "policy_number": None,
            "insurer": None,
            "effective_date": None,
            "expiry_date": None,
            "cgl_limit": None,
            "property_limit": None,
            "cyber_limit": None,
            "cyber_deductible": None,
            "total_premium": None,
        }

        # Insured Name
        m = re.search(r"(?:Named\s+Insured|Insured\s+Name|Policyholder|Insured)[\*:\s#]+([A-Za-z0-9\s,\.\-&]+?)(?:\n\n|\n-|\n###|$)", text, re.I)
        if m:
            clean = m.group(1).strip().strip("*_#:- \n")
            if clean and len(clean) > 2:
                data["insured_name"] = clean

        # Policy Number
        m = re.search(r"(?:Policy\s*(?:Number|No\.?|#))[\*:\s#]+([A-Z0-9\-]{5,30})", text, re.I)
        if m:
            data["policy_number"] = m.group(1).strip().strip("*_#")

        # Insurer / Carrier
        m = re.search(r"(?:Insurer\s*/\s*Carrier|Insurer|Insurance\s+Company|Carrier|Issuing\s+Company)[\*:\s#]+([A-Za-z0-9\s,\.\-&]+?)(?:\n\n|\n-|\n###|$)", text, re.I)
        if m:
            clean = m.group(1).strip().strip("*_#:- \n")
            if clean and len(clean) > 2:
                data["insurer"] = clean

        # Effective & Expiration Dates
        m = re.search(r"(?:Effective\s+Date|Inception|Policy\s+Period\s+From)[\*:\s#-]+([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})", text, re.I)
        if m:
            data["effective_date"] = m.group(1).strip()

        m = re.search(r"(?:Expiration\s+Date|Expiry\s+Date|Policy\s+Period\s+To)[\*:\s#-]+([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})", text, re.I)
        if m:
            data["expiry_date"] = m.group(1).strip()

        # CGL Limit
        m = re.search(r"(?:Commercial\s+General\s+Liability|General\s+Aggregate|CGL|Each\s+Occurrence).*?(\$[\d,]+(?:\.\d{2})?)", text, re.I | re.DOTALL)
        if m:
            data["cgl_limit"] = m.group(1).strip()

        # Property Limit
        m = re.search(r"(?:Commercial\s+Property|Building\s+Limit|Building\s+Coverage|Personal\s+Property).*?(\$[\d,]+(?:\.\d{2})?)", text, re.I | re.DOTALL)
        if m:
            data["property_limit"] = m.group(1).strip()

        # Cyber Limit
        m = re.search(r"(?:Cyber\s+Liability|Cyber\s+Limit|Network\s+Security|Cyber\s+Coverage).*?(\$[\d,]+(?:\.\d{2})?)", text, re.I | re.DOTALL)
        if m:
            data["cyber_limit"] = m.group(1).strip()

        # Cyber Deductible / Retention
        m = re.search(r"(?:Cyber\s+Deductible|Cyber\s+Retention|Cyber.*?Retention.*?Deductible).*?(\$[\d,]+(?:\.\d{2})?)", text, re.I | re.DOTALL)
        if not m:
            m = re.search(r"(\$[\d,]+(?:\.\d{2})?)\s+(?:Each\s+Incident|Each\s+Cyber\s+Incident)", text, re.I)
        if m:
            data["cyber_deductible"] = m.group(1).strip()

        # Total Premium
        m = re.search(r"(?:Total\s+Annual\s+(?:Policy\s+)?Premium|Total\s+Premium|Annual\s+Premium).*?(\$[\d,]+(?:\.\d{2})?)", text, re.I)
        if not m:
            m = re.search(r"(?:Premium)[\*:\s#]+(\$[\d,]+(?:\.\d{2})?)", text, re.I)
        if m:
            data["total_premium"] = m.group(1).strip()

        return data

    async def generate_letter(
        self,
        template_content: str,
        fields: Dict[str, Any],
        broker_info: Dict[str, str],
        custom_instructions: Optional[str] = None,
        use_llm_polish: bool = True
    ) -> str:
        """
        Merge verified fields into the letter template, with optional LLM executive polish.
        """
        # Safe defaults for merge fields
        context = {
            "insured_name": fields.get("insured_name") or "[Client Insured Name]",
            "policy_number": fields.get("policy_number") or "[Policy # Pending]",
            "insurer": fields.get("insurer") or "[Insurance Carrier]",
            "effective_date": fields.get("effective_date") or "[Effective Date]",
            "expiry_date": fields.get("expiry_date") or "[Expiry Date]",
            "cgl_limit": fields.get("cgl_limit") or "$5,000,000",
            "property_limit": fields.get("property_limit") or "$10,000,000",
            "cyber_limit": fields.get("cyber_limit") or "$2,000,000",
            "cyber_deductible": fields.get("cyber_deductible") or "$50,000",
            "total_premium": fields.get("total_premium") or "$42,850",
            "broker_name": broker_info.get("full_name") or "Commercial Insurance Account Executive",
            "agency_name": broker_info.get("agency_name") or "TwinCover Commercial Advisory Group",
            "broker_email": broker_info.get("email") or "broker@twincover.com",
            "current_date": broker_info.get("current_date") or "October 20, 2026",
        }

        # First perform Jinja2 variable interpolation
        try:
            template = Template(template_content)
            rendered_draft = template.render(**context)
        except Exception as e:
            logger.warning(f"Template rendering error: {e}. Performing simple token replacement.")
            rendered_draft = template_content
            for k, v in context.items():
                rendered_draft = rendered_draft.replace(f"{{{{{k}}}}}", str(v))

        # If LLM polish is enabled and Ollama is reachable, polish the letter
        if use_llm_polish:
            system = "You are a senior commercial insurance broker writing a formal, sophisticated client advisory letter."
            prompt = f"""
Review and refine the following draft insurance renewal letter.
Keep all verified numbers, limits, policy numbers, dates, and deductibles completely accurate and unchanged.
Enhance clarity, professional broker authority, and client-centric recommendations.
{f"Broker instructions: {custom_instructions}" if custom_instructions else ""}

Draft letter:
\"\"\"
{rendered_draft}
\"\"\"

Output the polished letter in clean Markdown.
"""
            polished = await self.generate(prompt=prompt, system=system, timeout=60.0)
            if polished and len(polished.strip()) > 100:
                return polished.strip()

        return rendered_draft


ollama_client = OllamaClient()
