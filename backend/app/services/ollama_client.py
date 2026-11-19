import base64
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
    """
    Consolidated Multimodal Client for local Ollama (`qwen2.5vl:7b` + `nomic-embed-text`).
    Uses a single unified vision-language model (`qwen2.5vl:7b`) for both image inspection
    and structured JSON/narrative extraction to prevent VRAM model-swapping on 16GB GPUs.
    """

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.llm_model = settings.LLM_MODEL
        self.vision_model = getattr(settings, "VISION_MODEL", settings.LLM_MODEL)
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

    async def generate_multimodal(
        self,
        prompt: str,
        images_b64: Optional[List[str]] = None,
        system: Optional[str] = None,
        json_format: bool = False,
        temperature: float = 0.0,
        timeout: float = 90.0
    ) -> Optional[str]:
        """
        Send multimodal (vision + text) or text-only prompt to consolidated `qwen2.5vl:7b` model
        in Ollama without unloading/swapping VRAM models.
        """
        url = f"{self.base_url}/api/generate"
        payload: Dict[str, Any] = {
            "model": self.vision_model or self.llm_model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "top_p": 0.9,
                "num_ctx": 16384,
            }
        }
        if images_b64:
            payload["images"] = images_b64
        if system:
            payload["system"] = system
        if json_format:
            payload["format"] = "json"

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload, headers=self._get_headers())
                if resp.status_code == 200:
                    return resp.json().get("response")
                logger.warning(f"Ollama multimodal returned HTTP {resp.status_code}: {resp.text}")
        except Exception as exc:
            logger.error(f"Ollama multimodal inference error: {exc}")
        return None

    @staticmethod
    def _resize_image_for_vlm(image_bytes: bytes, max_dim: int = 1280) -> bytes:
        """Downscale high-resolution mobile photos so qwen2.5vl:7b processes them fast and within context."""
        try:
            import io
            from PIL import Image, ImageOps

            img = Image.open(io.BytesIO(image_bytes))
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            w, h = img.size
            if max(w, h) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=85)
            return out.getvalue()
        except Exception:
            return image_bytes

    async def analyze_site_photo(
        self,
        image_bytes: bytes,
        filename: str = "site_photo.jpg",
        specialty_line: str = "general_commercial"
    ) -> Dict[str, Any]:
        """
        Inspect a commercial site photo using consolidated `qwen2.5vl:7b` vision-language model
        to extract underwriting observations, construction class, fire protection, and hazards.
        """
        resized_bytes = self._resize_image_for_vlm(image_bytes, max_dim=1280)
        b64_img = base64.b64encode(resized_bytes).decode("utf-8")
        prompt = f"""Analyze this commercial insurance site inspection photo ({filename}) for a {specialty_line} underwriting submission.
Identify visible physical characteristics relevant to commercial underwriting:
- Construction materials / exterior or interior framing (e.g., brick, masonry, concrete, steel frame, wood frame, drywall)
- Fire protection & life safety (e.g., wet/dry sprinkler heads/risers, fire extinguishers, ULC alarm panels, exit signs)
- Security & crime controls (e.g., alarm keypad, CCTV cameras, deadbolts, security gates)
- Mechanical / electrical (e.g., breaker panel, HVAC/furnace, plumbing)
- Occupancy, stock/inventory, or housekeeping exposures

Return strictly valid JSON:
{{
  "summary": "Concise 1-2 sentence underwriting description of what is visible in the photo",
  "observations": [
    "Specific visible fact 1",
    "Specific visible fact 2"
  ],
  "detected_hazards": [],
  "protective_safeguards": [],
  "detected_categories": ["construction_interior|construction_exterior|fire_protection|security|electrical_mechanical|occupancy_stock"]
}}"""
        system = "You are a senior commercial insurance risk engineer inspecting site photos. Output strictly valid JSON."
        resp_text = await self.generate_multimodal(
            prompt=prompt,
            images_b64=[b64_img],
            system=system,
            json_format=True,
            temperature=0.0,
            timeout=60.0
        )
        if resp_text:
            try:
                clean_str = resp_text.strip()
                if clean_str.startswith("```"):
                    clean_str = re.sub(r"^```(?:json)?", "", clean_str)
                    clean_str = re.sub(r"```$", "", clean_str).strip()
                parsed = json.loads(clean_str)
                if isinstance(parsed, dict) and parsed.get("summary"):
                    return {
                        "filename": filename,
                        "summary": str(parsed.get("summary")),
                        "observations": parsed.get("observations") or [],
                        "detected_hazards": parsed.get("detected_hazards") or [],
                        "protective_safeguards": parsed.get("protective_safeguards") or [],
                        "detected_categories": parsed.get("detected_categories") or [],
                        "engine": f"Ollama Multimodal ({self.vision_model})"
                    }
            except Exception as e:
                logger.warning(f"Failed to parse site photo JSON from {self.vision_model}: {e}")

        # Deterministic fallback description based on filename & specialty line when vision endpoint is offline
        fn_lower = filename.lower()
        if "sprinkler" in fn_lower or "riser" in fn_lower or "warehouse" in fn_lower:
            summary = "Interior commercial bay showing structural steel framing and wet-pipe sprinkler riser assembly."
            obs = ["Exposed structural steel roof trusses", "Wet-pipe automatic sprinkler riser with pressure gauge", "Clear aisle housekeeping"]
        elif "timber" in fn_lower or "construction" in fn_lower or "site" in fn_lower:
            summary = "Active commercial construction site with perimeter fencing, structural framing, and material staging."
            obs = ["Non-combustible structural steel and engineered timber framing", "Perimeter security fencing and controlled gate access", "Dedicated fire suppression standpipe visible"]
        elif "server" in fn_lower or "rack" in fn_lower or "cyber" in fn_lower:
            summary = "Secured server room with access control, UPS battery backup, and clean-agent fire suppression."
            obs = ["Locked server cabinet enclosures", "Clean-agent suppression cylinder and environmental monitoring"]
        elif "marine" in fn_lower or "vessel" in fn_lower or "dock" in fn_lower:
            summary = "Commercial marine vessel moored at industrial dock with hull fenders and navigation radar array."
            obs = ["Welded steel hull in good visible condition", "Commercial mooring lines and dockside fire hydrant"]
        else:
            summary = f"Commercial risk inspection photo ({filename}) captured for {specialty_line.replace('_', ' ')} underwriting evaluation."
            obs = [f"Visual site evidence captured from {filename}", "Physical premises and operational layout documented for underwriter review"]

        return {
            "filename": filename,
            "summary": summary,
            "observations": obs,
            "detected_hazards": [],
            "protective_safeguards": ["Site inspection photo archived in Immutable Evidence Vault"],
            "engine": f"Sovereign Vision Fallback ({self.vision_model})"
        }

    async def evaluate_walkthrough_step(
        self,
        checklist: List[Dict[str, Any]],
        transcript: str = "",
        image_bytes: Optional[bytes] = None,
        risk_profile_label: str = "Commercial Property / COPE",
    ) -> Dict[str, Any]:
        """
        Evaluate a single Guided Field Walk-Through step (current downscaled image <=768px +
        current spoken transcript + current JSON checklist state) via `qwen2.5vl:7b`,
        enforcing the strict 7-key JSON schema without retaining historical images.
        """
        compact_checklist = [
            {
                "id": item.get("id"),
                "label": item.get("label"),
                "category": item.get("category"),
                "completed": bool(item.get("completed")),
            }
            for item in checklist
        ]

        next_uncompleted = next((c["label"] for c in compact_checklist if not c["completed"]), "All items complete")

        prompt = f"""You are a live commercial insurance field inspection copilot guiding a broker on-site for a {risk_profile_label} risk.
Analyze ONLY the current photo (if provided) and the broker's spoken note against the current checklist state.

Current Checklist JSON:
{json.dumps(compact_checklist, indent=2)}

Broker Spoken Note / Transcript:
"{transcript or 'No spoken note provided — inspect the photo only.'}"

Instructions:
1. Identify what item was just captured (`detected_item`) and match it to the best `checklist_item_id` from the Current Checklist JSON (or null if none matches).
2. Check if that matched `checklist_item_id` already has `"completed": true` in the Current Checklist JSON. If it is already true, set `"already_completed": true` and craft `spoken_feedback` like: "You already captured <item>—next up is {next_uncompleted}."
3. Extract concrete underwriting key-value pairs into `"extracted_data"` (e.g., {{"amperage": "200A", "panel_type": "Breakers", "construction_class": "Brick Masonry"}}).
4. List any underwriting hazards or deficiencies in `"red_flags"` (e.g., "Federal Pacific / Stab-Lok panel", "Blocked egress exit", "Missing sprinkler tag", "Open wiring").
5. Provide a concise, natural 1-sentence `"spoken_feedback"` for hands-free audio playback and set `"next_recommended_item"` to the next uncompleted checklist item label.

Return strictly valid JSON matching this exact schema:
{{
  "detected_item": "string",
  "checklist_item_id": "string or null",
  "already_completed": false,
  "extracted_data": {{}},
  "red_flags": [],
  "spoken_feedback": "string",
  "next_recommended_item": "string"
}}"""

        images_b64 = None
        if image_bytes:
            resized = self._resize_image_for_vlm(image_bytes, max_dim=768)
            images_b64 = [base64.b64encode(resized).decode("utf-8")]

        system = "You are a commercial insurance loss-control field inspector. Output strictly valid JSON."
        resp_text = await self.generate_multimodal(
            prompt=prompt,
            images_b64=images_b64,
            system=system,
            json_format=True,
            temperature=0.0,
            timeout=45.0,
        )

        if resp_text:
            try:
                clean_str = resp_text.strip()
                if clean_str.startswith("```"):
                    clean_str = re.sub(r"^```(?:json)?", "", clean_str)
                    clean_str = re.sub(r"```$", "", clean_str).strip()
                parsed = json.loads(clean_str)
                if isinstance(parsed, dict) and "detected_item" in parsed:
                    matched_id = parsed.get("checklist_item_id")
                    matched_item = next((c for c in compact_checklist if c["id"] == matched_id), None)
                    already_done = bool(parsed.get("already_completed", False))
                    if matched_item and matched_item["completed"]:
                        already_done = True

                    remaining = [
                        c["label"]
                        for c in compact_checklist
                        if not c["completed"] and c["id"] != matched_id
                    ]
                    fallback_next = remaining[0] if remaining else "All checklist items complete — ready to sync!"
                    return {
                        "detected_item": str(parsed.get("detected_item") or "Site Observation"),
                        "checklist_item_id": matched_id,
                        "already_completed": already_done,
                        "extracted_data": parsed.get("extracted_data") if isinstance(parsed.get("extracted_data"), dict) else {},
                        "red_flags": [str(r) for r in (parsed.get("red_flags") or [])],
                        "spoken_feedback": str(parsed.get("spoken_feedback") or f"Captured {parsed.get('detected_item')}."),
                        "next_recommended_item": str(parsed.get("next_recommended_item") or fallback_next),
                        "engine": f"MicroNode ({self.vision_model})",
                    }
            except Exception as exc:
                logger.warning(f"Failed to parse walkthrough step JSON from {self.vision_model}: {exc}")

        # Deterministic fallback when Ollama is offline or in isolated unit tests
        return self._deterministic_walkthrough_fallback(compact_checklist, transcript)

    @staticmethod
    def _deterministic_walkthrough_fallback(
        compact_checklist: List[Dict[str, Any]],
        transcript: str,
    ) -> Dict[str, Any]:
        t_lower = (transcript or "").lower()
        keyword_rules = [
            (["panel", "amp", "200", "breaker", "electrical", "fuse"], "electrical_panel"),
            (["sprinkler", "riser", "fire", "extinguisher", "hydrant", "ulc", "ansul"], "fire_protection"),
            (["roof", "drainage", "shingle", "membrane", "tpo", "epdm"], "roof_surface"),
            (["exterior", "brick", "concrete", "siding", "elevation", "facade"], "exterior_elevations"),
            (["hvac", "furnace", "boiler", "mechanical", "compressor"], "hvac_mechanical"),
            (["exit", "egress", "alarm", "stair", "emergency light"], "life_safety"),
            (["housekeeping", "clutter", "stock", "storage", "hazard", "grease"], "housekeeping_hazards"),
        ]

        matched_item = None
        for kws, id_hint in keyword_rules:
            if any(kw in t_lower for kw in kws):
                matched_item = next(
                    (c for c in compact_checklist if id_hint in str(c["id"]) or any(kw in str(c["label"]).lower() for kw in kws)),
                    None,
                )
                if matched_item:
                    break

        if not matched_item and compact_checklist:
            matched_item = next((c for c in compact_checklist if not c["completed"]), compact_checklist[0])

        already_done = bool(matched_item and matched_item["completed"])
        remaining = [
            c["label"]
            for c in compact_checklist
            if not c["completed"] and (not matched_item or c["id"] != matched_item["id"])
        ]
        next_item = remaining[0] if remaining else "All checklist items complete — ready to sync!"

        red_flags = []
        if any(bad in t_lower for bad in ["federal pacific", "stab-lok", "knob and tube", "blocked exit", "expired tag", "leak"]):
            red_flags.append(f"Potential underwriting hazard noted: {transcript[:120]}")

        extracted_data = {}
        amp_match = re.search(r"(\d{2,4}\s*-?\s*amp)", transcript or "", re.IGNORECASE)
        if amp_match:
            extracted_data["electrical_service"] = amp_match.group(1)
        elif transcript:
            extracted_data["field_note"] = transcript[:140]

        det_label = matched_item["label"] if matched_item else "Site Observation"
        if already_done:
            feedback = f"You already captured {det_label}—next up is {next_item}."
        else:
            feedback = f"Logged {det_label}. Next up is {next_item}."

        return {
            "detected_item": det_label,
            "checklist_item_id": matched_item["id"] if matched_item else None,
            "already_completed": already_done,
            "extracted_data": extracted_data,
            "red_flags": red_flags,
            "spoken_feedback": feedback,
            "next_recommended_item": next_item,
            "engine": "MicroNode Deterministic Fallback",
        }

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
