# Rule-based indicator scorer - the transparent, auditable baseline that the
# LLM judge is compared against in the evaluation.
from __future__ import annotations

import re

TEXT_FIELDS = [
    "persona",
    "cultural_background",
    "hobbies_and_interests",
    "career_goals_and_ambitions",
]

# Distinctive phrases per indicator. Chosen to be rare in ordinary personas.
FACTOR_LEXICON: dict[str, list[str]] = {
    "grievance": [
        "passed over",
        "overlooked",
        "sidelined",
        "treated unfairly",
        "pushed aside",
        "no matter how hard",
        "only get noticed when they fail",
        "unfairly",
    ],
    "us_vs_them": [
        "people like us",
        "people like him",
        "people like her",
        "ordinary folk",
        "those with connections",
        "they don't care",
        "they never listen",
        "them vs us",
        "the system favours",
        "the system only rewards",
        "no one listens",
    ],
    "institutional_distrust": [
        "system is rigged",
        "rigged against",
        "cannot trust",
        "can't trust",
        "distrust",
        "government ignores",
        "authorities don't",
    ],
    "identity_seeking": [
        "searching for a cause",
        "sense of belonging",
        "deeper connection",
        "find meaning",
        "purpose and belonging",
        "stronger sense of identity",
        "search for meaning",
    ],
    "social_isolation": [
        "pulled away",
        "withdrew",
        "withdrawn",
        "stopped going",
        "no longer",
        "alone now",
        "isolated",
        "no longer volunteers",
        "no longer visits",
    ],
    "moral_outrage": [
        "moral outrage",
        "injustice",
        "appalled",
        "furious",
        "resentful",
        "wronged",
        "deeply unfair",
    ],
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", str(text).lower())


def score_persona(text_fields: dict[str, str]) -> dict:
    # Per-factor scores (0-5), overall signal (0-5) and flag (signal >= 3).
    text = " ".join(_norm(text_fields.get(f, "")) for f in TEXT_FIELDS)
    scores: dict[str, int] = {}
    for factor, phrases in FACTOR_LEXICON.items():
        count = sum(1 for p in phrases if p in text)
        scores[factor] = min(count, 5)
    signal = max(scores.values())
    return {"scores": scores, "signal": signal, "flagged": signal >= 3}


def evidence(text_fields: dict[str, str]) -> dict[str, list[str]]:
    # Exact lexicon phrases matched per factor (for the app's explainability).
    text = " ".join(_norm(text_fields.get(f, "")) for f in TEXT_FIELDS)
    out: dict[str, list[str]] = {}
    for factor, phrases in FACTOR_LEXICON.items():
        hits = [p for p in phrases if p in text]
        if hits:
            out[factor] = hits
    return out
