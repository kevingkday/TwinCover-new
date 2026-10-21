import json
import logging
import re
from typing import Dict, Any, Optional, List, Tuple
import httpx
from fastapi import HTTPException, status
from jinja2 import Template
from app.core.config import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    """Client for local Ollama LLM and Embeddings."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.llm_model = settings.LLM_MODEL
        self.embed_model = settings.EMBED_MODEL

    def _get_headers(self) -> Dict[str, str]:
        headers = {}
        if settings.CF_ACCESS_CLIENT_ID and settings.CF_ACCESS_CLIENT_SECRET:
            headers["CF-Access-Client-Id"] = settings.CF_ACCESS_CLIENT_ID
            headers["CF-Access-Client-Secret"] = settings.CF_ACCESS_CLIENT_SECRET
        return headers

    async def check_health(self) -> Tuple[bool, str]:
        """Check if local or tunneled Ollama server is running."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags", headers=self._get_headers())
                if resp.status_code == 200:
                    models = [m.get("name") for m in resp.json().get("models", [])]
                    has_llm = any(self.llm_model in m for m in models)
                    status_text = f"Online ({len(models)} models ready" + (f", {self.llm_model} loaded)" if has_llm else ")")
                    return True, status_text
                return False, f"HTTP {resp.status_code}"
        except Exception as e:
            return False, f"Offline ({type(e).__name__})"

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        json_format: bool = False,
        temperature: float = 0.0,
        timeout: float = 60.0
    ) -> Optional[str]:
        """Send prompt to Ollama generate API with explicit temperature control."""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.llm_model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "top_p": 0.9,
            }
        }
        if system:
            payload["system"] = system
        if json_format:
            payload["format"] = "json"

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload, headers=self._get_headers())
                if resp.status_code == 200:
                    return resp.json().get("response")
                logger.warning(f"Ollama returned HTTP {resp.status_code}: {resp.text}")
        except Exception as exc:
            logger.error(f"Ollama inference error: {exc}")
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
                resp = await client.post(url, json=payload, headers=self._get_headers())
                if resp.status_code == 200:
                    return resp.json().get("embedding")
        except Exception as exc:
            logger.debug(f"Ollama embeddings unavailable ({exc}).")
        return None

    def extract_declarations_block(self, policy_markdown: str) -> str:
        """
        Extract ONLY the declarations schedule markdown block (under 2,000 tokens).
        The MicroNode extractor on port 5005 outputs a structured Markdown block titled:
        '# COVERAGE DECLARATIONS SCHEDULE (PAGE 1)'
        """
        stop_pattern = r"(?=\n\s*#{1,3}\s+(?:(?:GENERAL\s+)?CONDITIONS\s+AND\s+EXCLUSIONS|EXCLUSIONS\s+AND\s+CONDITIONS|EXCLUSIONS|GENERAL\s+CONDITIONS|STATUTORY\s+CONDITIONS|COMMON\s+POLICY\s+CONDITIONS|CONDITIONS\b|WAR\s+AND)|\Z)"

        # Primary pattern: starting from COVERAGE DECLARATIONS SCHEDULE
        pattern1 = r"(#\s*COVERAGE\s+DECLARATIONS\s+SCHEDULE[\s\S]*?)" + stop_pattern
        match1 = re.search(pattern1, policy_markdown, re.IGNORECASE)
        if match1:
            return match1.group(1)[:7000].strip()

        # Secondary pattern: variations of declarations schedule header
        pattern2 = r"(#+\s*(?:COMMON\s+POLICY\s+)?DECLARATIONS(?:\s+SCHEDULE)?[\s\S]*?)" + stop_pattern
        match2 = re.search(pattern2, policy_markdown, re.IGNORECASE)
        if match2:
            return match2.group(1)[:7000].strip()

        # Fallback window under 2,000 tokens (~6,500 chars)
        return policy_markdown[:6500].strip()

    async def extract_policy_fields(self, policy_text: str) -> Dict[str, Any]:
        """
        Extract structured JSON from ONLY the Declarations block using qwen2.5:7b-instruct
        at temperature 0.0. No silent scraping or regex fallback.
        """
        # Restrict field extraction input strictly to the Declarations section (under 2,000 tokens)
        declarations_markdown = self.extract_declarations_block(policy_text)

        prompt = f"""Extract the following fields from this insurance declarations table into JSON:
Extract the policy header details and all dynamic coverage lines from this commercial insurance policy declarations schedule into JSON.

Standardized Header Fields:
- insured_name: Legal business or individual name
- policy_number: Official policy or schedule reference number
- insurer: Issuing insurance company / carrier (e.g., Lloyd's Underwriters, Chubb, Tokio Marine, etc.)
- effective_date: Policy start date (YYYY-MM-DD or Month DD, YYYY)
- expiry_date: Policy expiration date. Note: Commercial policies run on a standard 12-month annual term from the effective date unless specified otherwise (e.g. if effective is OCT 05, 2026, expiry is OCT 05, 2027)
- total_premium: Total policy annual premium / total amount due

Dynamic Coverages:
- coverages: An array of all insurance coverage lines, sections, or endorsements present in this specific policy (e.g. Commercial General Liability, Errors & Omissions, Cyber Risk / Privacy Breach, Tenants Legal Liability, Non-Owned Automobile, Property, Employee Benefits, Legal Helpline, etc.). Each item should include:
  * name: Name of the coverage line
  * limit: Liability limit or sum insured (e.g. $2,000,000, or N/A)
  * deductible: Deductible or self-insured retention if specified (e.g. $1,000, $5,000, or null)

Declarations Table:
{declarations_markdown}

Return ONLY a valid JSON dictionary.
Format:
{{
  "insured_name": "...",
  "policy_number": "...",
  "insurer": "...",
  "effective_date": "...",
  "expiry_date": "...",
  "total_premium": "...",
  "coverages": [
    {{
      "name": "...",
      "limit": "...",
      "deductible": "..."
    }}
  ]
}}"""

        system = "You are a specialized commercial insurance data extractor. Output strictly valid JSON."

        llm_response = await self.generate(
            prompt=prompt,
            system=system,
            json_format=True,
            temperature=0.0,
            timeout=120.0
        )

        if llm_response:
            try:
                clean_json_str = llm_response.strip()
                if clean_json_str.startswith("```"):
                    clean_json_str = re.sub(r"^```(?:json)?", "", clean_json_str)
                    clean_json_str = re.sub(r"```$", "", clean_json_str).strip()
                parsed = json.loads(clean_json_str)
                if isinstance(parsed, dict):
                    # In case the model wrapped the result in a nested dictionary
                    if not any(k in parsed for k in ["insured_name", "policy_number", "insurer", "coverages"]):
                        for sub in parsed.values():
                            if isinstance(sub, dict) and any(k in sub for k in ["insured_name", "policy_number", "coverages"]):
                                parsed = sub
                                break

                    def clean_val(v):
                        if v is None:
                            return None
                        s = str(v).strip()
                        if not s or s.lower() in ("null", "none", "n/a", "pending"):
                            return None
                        return s

                    def format_currency(v):
                        s = clean_val(v)
                        if not s:
                            return None
                        try:
                            cleaned = s.replace("$", "").replace(",", "")
                            num = float(cleaned)
                            if num.is_integer():
                                return f"${int(num):,}"
                            else:
                                return f"${num:,.2f}"
                        except (ValueError, TypeError):
                            return s

                    result = {
                        "insured_name": clean_val(parsed.get("insured_name")),
                        "policy_number": clean_val(parsed.get("policy_number")),
                        "insurer": clean_val(parsed.get("insurer")),
                        "effective_date": clean_val(parsed.get("effective_date")),
                        "expiry_date": clean_val(parsed.get("expiry_date")),
                        "total_premium": format_currency(parsed.get("total_premium")),
                        "cgl_limit": format_currency(parsed.get("cgl_limit")),
                        "property_limit": format_currency(parsed.get("property_limit")),
                        "cyber_limit": format_currency(parsed.get("cyber_limit")),
                        "cyber_deductible": format_currency(parsed.get("cyber_deductible")),
                        "coverages": []
                    }

                    raw_coverages = parsed.get("coverages") or []
                    if isinstance(raw_coverages, list):
                        formatted_coverages = []
                        for cov in raw_coverages:
                            if isinstance(cov, dict):
                                c_name = clean_val(cov.get("name"))
                                if not c_name:
                                    continue
                                c_limit = format_currency(cov.get("limit")) or clean_val(cov.get("limit")) or "Included"
                                c_ded = format_currency(cov.get("deductible")) or clean_val(cov.get("deductible")) or "Nil"
                                formatted_coverages.append({
                                    "name": c_name,
                                    "limit": c_limit,
                                    "deductible": c_ded,
                                    "notes": clean_val(cov.get("notes"))
                                })
                        result["coverages"] = formatted_coverages

                        # Derive legacy coverage fields if not explicitly provided at the root
                        for cov in formatted_coverages:
                            n_lower = cov["name"].lower()
                            if not result["cgl_limit"] and any(w in n_lower for w in ["general liability", "cgl"]):
                                result["cgl_limit"] = cov["limit"]
                            if not result["property_limit"] and any(w in n_lower for w in ["property", "building"]):
                                result["property_limit"] = cov["limit"]
                            if any(w in n_lower for w in ["cyber", "privacy breach"]):
                                if not result["cyber_limit"] and cov["limit"] != "Included":
                                    result["cyber_limit"] = cov["limit"]
                                if not result["cyber_deductible"] and cov["deductible"] != "Nil":
                                    result["cyber_deductible"] = cov["deductible"]

                    return result
            except Exception as e:
                logger.error(f"Failed to parse LLM JSON response: {e}. Output was: {llm_response[:300]}")

        # Fail explicitly if Ollama extraction failed
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Local LLM ({self.llm_model}) failed to extract structured fields from declarations table."
        )

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
        # Format dynamic coverages schedule table
        coverages_list = fields.get("coverages") or []
        if isinstance(coverages_list, str):
            try:
                coverages_list = json.loads(coverages_list)
            except Exception:
                coverages_list = []

        if coverages_list and isinstance(coverages_list, list):
            table_lines = [
                "| Coverage Line | Policy Limit | Deductible / Retention |",
                "| :--- | :--- | :--- |"
            ]
            for c in coverages_list:
                c_name = c.get("name") or "Standard Coverage"
                c_limit = c.get("limit") or "Included"
                c_ded = c.get("deductible") or "Standard / Nil"
                table_lines.append(f"| **{c_name}** | {c_limit} | {c_ded} |")
            coverages_table_md = "\n".join(table_lines)
        else:
            coverages_table_md = f"| Coverage Line | Policy Limit | Deductible / Retention |\n| :--- | :--- | :--- |\n| **Commercial General Liability** | {fields.get('cgl_limit') or '$2,000,000'} | Standard |\n| **Cyber Deductible** | As Scheduled | {fields.get('cyber_deductible') or '$5,000'} |"

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
            "coverages_table": coverages_table_md,
            "broker_name": broker_info.get("full_name") or "Commercial Insurance Account Executive",
            "agency_name": broker_info.get("agency_name") or "TwinCover Commercial Advisory Group",
            "broker_email": broker_info.get("email") or "broker@twincover.com",
            "current_date": broker_info.get("current_date") or "October 20, 2026",
        }

        try:
            template = Template(template_content)
            rendered_draft = template.render(**context)
        except Exception as e:
            logger.warning(f"Template rendering error: {e}. Performing simple token replacement.")
            rendered_draft = template_content
            for k, v in context.items():
                rendered_draft = rendered_draft.replace(f"{{{{{k}}}}}", str(v))

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
            polished = await self.generate(prompt=prompt, system=system, temperature=0.2, timeout=60.0)
            if polished and len(polished.strip()) > 100:
                return polished.strip()

        return rendered_draft


ollama_client = OllamaClient()
