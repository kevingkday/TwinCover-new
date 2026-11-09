import io
import logging
import re
from typing import Dict, Any, Optional, Tuple
from pypdf import PdfReader
from app.core.config import settings

logger = logging.getLogger(__name__)

DOCUMENT_TYPE_LABELS: Dict[str, str] = {
    "policy": "Commercial Insurance Policy",
    "binder": "Insurance Binder / Cover Note",
    "certificate": "Certificate of Insurance (COI)",
    "endorsement": "Policy Endorsement / Amendment",
    "quote": "Insurance Quote / Proposal",
    "other": "Other Insurance Document",
}

DOCUMENT_TYPE_CRITERIA: Dict[str, str] = {
    "policy": (
        "Full Commercial Insurance Policy, Policy Declarations Schedule, or Renewal Policy Package "
        "specifying policy number, named insured, policy period, scheduled coverages, limits, deductibles, and annual premium."
    ),
    "binder": (
        "Temporary Insurance Binder, Confirmation of Insurance, or Cover Note confirming that coverage "
        "has been bound pending issuance of the final policy, often listing binder validity dates and subjectivities."
    ),
    "certificate": (
        "Certificate of Liability Insurance, Certificate of Property Insurance, Evidence of Coverage, or ACORD 25 / 27 / 28 "
        "form issued to a third-party Certificate Holder as proof of active insurance without conferring policy rights."
    ),
    "endorsement": (
        "Policy Endorsement, Rider, Schedule Amendment, or Policy Change Request modifying terms, limits, "
        "named insureds, locations, or exclusions on an existing insurance policy."
    ),
    "quote": (
        "Commercial Insurance Quote, Underwriting Proposal, Indication, or Renewal Terms Offer presenting proposed "
        "limits and premium pricing prior to binding."
    ),
}


class JevClassifierClient:
    """
    Document Type Determination Engine powered by TypeSafe AI's Jev (System One) model.
    Evaluates the opening pages of an uploaded PDF using typed Choice and Noul primitives,
    returning deterministic classification and calibrated probability distributions.
    Falls back to calibrated insurance document heuristics if TYPESAFE_API_KEY is not configured.
    """

    def __init__(self):
        self.api_key = settings.TYPESAFE_API_KEY
        self.model = settings.TYPESAFE_MODEL

    def _get_api_key(self) -> Optional[str]:
        return settings.TYPESAFE_API_KEY or self.api_key

    async def check_health(self) -> Tuple[bool, str]:
        """Check status of Jev System One classifier configuration."""
        api_key = self._get_api_key()
        try:
            import typesafe_sdk  # noqa: F401
            sdk_installed = True
        except ImportError:
            sdk_installed = False

        if api_key and sdk_installed:
            return True, "Jev (System One) API key configured & SDK ready"
        elif sdk_installed:
            return True, "typesafe-sdk ready (Local System-1 Fallback active — set TYPESAFE_API_KEY for cloud Jev)"
        return False, "typesafe-sdk not installed"

    def extract_opening_pages_text(self, pdf_bytes: bytes, max_pages: int = 2) -> Tuple[str, int]:
        """
        Rapidly extract text from the first 1-2 pages of a PDF for fast intake classification.
        Returns (extracted_text, total_page_count).
        """
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            total_pages = len(reader.pages)
            pages_to_read = min(total_pages, max_pages)
            extracted_chunks = []
            for idx in range(pages_to_read):
                page_text = reader.pages[idx].extract_text() or ""
                if page_text.strip():
                    extracted_chunks.append(f"--- PAGE {idx + 1} ---\n{page_text.strip()}")
            return "\n\n".join(extracted_chunks), total_pages
        except Exception as exc:
            logger.warning(f"Fast opening-page PDF read failed ({exc}); using raw byte snippet.")
            try:
                decoded = pdf_bytes[:8192].decode("latin-1", errors="ignore")
                return decoded, 1
            except Exception:
                return "", 1

    async def classify_with_jev(
        self,
        opening_text: str,
        filename: str,
        total_pages: int
    ) -> Optional[Dict[str, Any]]:
        """
        Execute TypeSafe AI's Jev (System One) model in a single parallel pass using
        Choice and Noul primitives.
        """
        api_key = self._get_api_key()
        if not api_key:
            return None

        try:
            from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul, ChoiceAnswer, NoulAnswer

            state_payload = {
                "filename": filename,
                "total_pages": total_pages,
                "opening_pages_content": opening_text[:4500] if opening_text else filename,
            }

            client_kwargs: Dict[str, Any] = {"api_key": api_key, "timeout": 15.0}
            if self.model:
                client_kwargs["model"] = self.model

            async with AsyncTypeSafeClient(**client_kwargs) as client:
                response = await client.system_one(
                    state=state_payload,
                    questions={
                        "document_type": Choice(
                            instructions=(
                                "Determine the exact commercial insurance document type from the "
                                "document filename, page count, and opening pages."
                            ),
                            criteria=DOCUMENT_TYPE_CRITERIA,
                        ),
                        "is_insurance_document": Noul(
                            instructions=(
                                "Is this document a legitimate insurance policy, binder, certificate, "
                                "endorsement, or underwriting quote?"
                            )
                        ),
                        "has_coverage_schedule": Noul(
                            instructions=(
                                "Does the document contain a declarations schedule or table of insurance "
                                "coverages, policy limits, or deductibles?"
                            )
                        ),
                    },
                )

            doc_ans = response.answers.get("document_type")
            ins_ans = response.answers.get("is_insurance_document")
            sched_ans = response.answers.get("has_coverage_schedule")

            if isinstance(doc_ans, ChoiceAnswer):
                chosen_type = doc_ans.choice
                confidence = round(float(doc_ans.confidence), 4)
                probabilities = {k: round(float(v), 4) for k, v in doc_ans.probabilities.items()}
            else:
                return None

            is_ins_prob = round(float(ins_ans.noul), 4) if isinstance(ins_ans, NoulAnswer) else 0.95
            has_sched_prob = round(float(sched_ans.noul), 4) if isinstance(sched_ans, NoulAnswer) else 0.85

            if is_ins_prob < 0.25:
                chosen_type = "other"

            label = DOCUMENT_TYPE_LABELS.get(chosen_type, "Commercial Insurance Document")
            reason = self._build_summary_reason(
                chosen_type=chosen_type,
                confidence=confidence,
                total_pages=total_pages,
                opening_text=opening_text,
                filename=filename,
                engine="Jev System One"
            )

            return {
                "filename": filename,
                "document_type": chosen_type,
                "document_type_label": label,
                "confidence": confidence,
                "probabilities": probabilities,
                "is_insurance_document": is_ins_prob,
                "has_coverage_schedule": has_sched_prob,
                "total_pages": total_pages,
                "summary_reason": reason,
                "engine": f"Jev ({response.model})",
            }

        except Exception as exc:
            logger.warning(f"TypeSafe Jev API call failed ({exc}). Falling back to local System-1 classifier.")
            return None

    def classify_with_local_fallback(
        self,
        opening_text: str,
        filename: str,
        total_pages: int
    ) -> Dict[str, Any]:
        """
        Deterministic System-1 calibrated probability classifier for offline / local execution
        when TYPESAFE_API_KEY is not set. Mirrors Jev's Choice + Noul output structure.
        """
        combined = f"{filename}\n{opening_text}".lower()
        fn_lower = filename.lower()

        scores: Dict[str, float] = {
            "policy": 1.0,
            "binder": 0.4,
            "certificate": 0.4,
            "endorsement": 0.4,
            "quote": 0.4,
        }

        # 1. Certificate of Insurance (COI / ACORD) signals
        if any(k in combined for k in ["certificate of liability insurance", "certificate of insurance", "acord 25", "acord 27", "acord 28", "certificate holder", "this certificate is issued as a matter of information only"]):
            scores["certificate"] += 8.5
        if any(k in fn_lower for k in ["coi", "certificate", "acord", "cert_"]):
            scores["certificate"] += 5.0

        # 2. Insurance Binder / Cover Note signals
        if any(k in combined for k in ["insurance binder", "coverage binder", "confirmation of bound coverage", "temporary insurance binder", "cover note", "binder number", "subjectivities", "bound pending"]):
            scores["binder"] += 8.0
        if any(k in fn_lower for k in ["binder", "cover_note", "covernote", "bound"]):
            scores["binder"] += 5.5

        # 3. Endorsement / Rider signals
        if any(k in combined for k in ["this endorsement changes the policy", "endorsement #", "endorsement number", "policy change endorsement", "amendatory endorsement", "additional premium for endorsement"]):
            scores["endorsement"] += 8.0
        if any(k in fn_lower for k in ["endorsement", "rider", "amendment", "end_"]):
            scores["endorsement"] += 5.5

        # 4. Quote / Proposal / Indication signals
        if any(k in combined for k in ["insurance proposal", "coverage quotation", "commercial insurance quote", "premium indication", "quote valid until", "proposed coverage", "this quote is valid"]):
            scores["quote"] += 7.5
        if any(k in fn_lower for k in ["quote", "proposal", "indication"]):
            scores["quote"] += 5.5

        # 5. Full Insurance Policy / Declarations Schedule signals
        if any(k in combined for k in ["coverage declarations schedule", "common policy declarations", "policy declarations", "renewal policy", "policy number", "named insured", "general conditions and exclusions", "insuring agreement"]):
            scores["policy"] += 6.5
        if any(k in fn_lower for k in ["policy", "renewal", "declarations", "schedule"]):
            scores["policy"] += 4.5
        if total_pages >= 5 and scores["policy"] >= 3.0:
            scores["policy"] += 2.5

        total_score = sum(scores.values())
        probabilities = {k: round(v / total_score, 4) for k, v in scores.items()}

        chosen_type = max(probabilities, key=probabilities.get)
        confidence = probabilities[chosen_type]

        # Calibrate top confidence when strong domain keywords matched
        max_raw = scores[chosen_type]
        if max_raw >= 7.0 and confidence < 0.88:
            boost = min(0.96, 0.82 + (max_raw / 100.0))
            remainder = max(0.0, 1.0 - boost)
            other_keys = [k for k in probabilities if k != chosen_type]
            other_sum = sum(probabilities[k] for k in other_keys) or 1.0
            probabilities[chosen_type] = round(boost, 4)
            for k in other_keys:
                probabilities[k] = round(remainder * (probabilities[k] / other_sum), 4)
            confidence = probabilities[chosen_type]

        # Noul 1: Is this a valid insurance document?
        insurance_keywords = [
            "insured", "policy", "insurer", "coverage", "deductible", "premium",
            "liability", "underwriter", "binder", "certificate", "acord", "endorsement",
            "indemnity", "occurrence", "aggregate", "limit"
        ]
        kw_hits = sum(1 for kw in insurance_keywords if kw in combined)
        is_insurance_prob = round(min(0.99, max(0.20, 0.45 + kw_hits * 0.08)), 4)

        # Noul 2: Does it contain a coverage/limits schedule?
        schedule_keywords = ["limit", "deductible", "premium", "schedule", "declarations", "$", "occurrence", "aggregate"]
        sched_hits = sum(1 for kw in schedule_keywords if kw in combined)
        has_schedule_prob = round(min(0.98, max(0.15, 0.30 + sched_hits * 0.10)), 4)

        label = DOCUMENT_TYPE_LABELS.get(chosen_type, "Commercial Insurance Document")
        reason = self._build_summary_reason(
            chosen_type=chosen_type,
            confidence=confidence,
            total_pages=total_pages,
            opening_text=opening_text,
            filename=filename,
            engine="Jev System-1 Local Engine"
        )

        return {
            "filename": filename,
            "document_type": chosen_type,
            "document_type_label": label,
            "confidence": confidence,
            "probabilities": probabilities,
            "is_insurance_document": is_insurance_prob,
            "has_coverage_schedule": has_schedule_prob,
            "total_pages": total_pages,
            "summary_reason": reason,
            "engine": "Jev System-1 (Local Calibrated Engine)",
        }

    def _build_summary_reason(
        self,
        chosen_type: str,
        confidence: float,
        total_pages: int,
        opening_text: str,
        filename: str,
        engine: str
    ) -> str:
        pct = int(round(confidence * 100))
        snippets = []
        text_lower = f"{filename} {opening_text}".lower()

        if chosen_type == "certificate":
            if "acord" in text_lower:
                snippets.append("ACORD standard certificate header")
            if "certificate holder" in text_lower:
                snippets.append("Certificate Holder block")
            snippets.append("third-party coverage verification structure")
        elif chosen_type == "binder":
            if "subjectivit" in text_lower:
                snippets.append("binding subjectivities")
            snippets.append("temporary bound coverage confirmation terms")
        elif chosen_type == "endorsement":
            snippets.append("policy amendment / endorsement clauses")
        elif chosen_type == "quote":
            snippets.append("pre-bind coverage quotation and premium proposal terms")
        else:
            if "declarations" in text_lower or "schedule" in text_lower:
                snippets.append("Coverage Declarations Schedule header")
            if "limit" in text_lower or "deductible" in text_lower:
                snippets.append("scheduled coverage limits & deductibles")
            if "exclusions" in text_lower or "conditions" in text_lower:
                snippets.append("policy conditions & exclusions sections")

        detected_features = ", ".join(snippets[:3]) if snippets else "opening page structure and terminology"
        return (
            f"Classified as {DOCUMENT_TYPE_LABELS.get(chosen_type, chosen_type)} ({pct}% confidence) "
            f"across {total_pages} page(s) based on {detected_features}."
        )

    async def classify_pdf(self, pdf_bytes: bytes, filename: str = "document.pdf") -> Dict[str, Any]:
        """
        Determine the commercial insurance document type from raw PDF bytes.
        1. Extracts Page 1-2 text rapidly.
        2. Calls TypeSafe AI's Jev model if TYPESAFE_API_KEY is configured.
        3. Falls back to local System-1 calibrated classifier if offline or unconfigured.
        """
        opening_text, total_pages = self.extract_opening_pages_text(pdf_bytes, max_pages=2)

        jev_result = await self.classify_with_jev(opening_text, filename, total_pages)
        if jev_result is not None:
            return jev_result

        return self.classify_with_local_fallback(opening_text, filename, total_pages)


jev_classifier = JevClassifierClient()

