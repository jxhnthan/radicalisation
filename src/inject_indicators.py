"""Phase 2: LLM-based indicator injection.

Selects N personas from the 1,000-persona sample and asks an LLM to rewrite them
so they carry radicalisation-vulnerability indicators (CVE literature). The
result is a labelled dataset: originals (label=0) plus rewritten (label=1).

Writes:
  data/labelled_personas.csv   - all 1,000 rows (900 label=0 + 100 label=1)
  data/injection_log.jsonl     - audit log per rewritten persona (prompt, raw output, factors)

Usage:
  LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=... python -m src.inject_indicators --n 100
  python -m src.inject_indicators --dry-run   # no API call; verifies the pipeline
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import pandas as pd

from src import llm_client

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
SAMPLE_CSV = DATA_DIR / "personas_sample_1000.csv"
LABELLED_CSV = DATA_DIR / "labelled_personas.csv"
LOG_PATH = DATA_DIR / "injection_log.jsonl"
PROMPT_PATH = PROJECT_ROOT / "prompts" / "indicator_injection.md"

# Text fields the LLM rewrites; demographics are preserved as-is.
REWRITE_FIELDS = [
    "persona",
    "cultural_background",
    "hobbies_and_interests",
    "career_goals_and_ambitions",
]

DEMOGRAPHIC_FIELDS = [
    "age",
    "sex",
    "marital_status",
    "education_level",
    "occupation",
    "planning_area",
]

# Canonical factor names; the LLM may return variants, normalise them.
CANONICAL_FACTORS = [
    "grievance",
    "us_vs_them",
    "identity_seeking",
    "social_isolation",
    "institutional_distrust",
    "moral_outrage",
]
FACTOR_ALIASES = {
    "grievance": "grievance",
    "personal_grievance": "grievance",
    "group_grievance": "grievance",
    "us_vs_them": "us_vs_them",
    "us-vs-them": "us_vs_them",
    "identity_seeking": "identity_seeking",
    "identity seeking": "identity_seeking",
    "social_isolation": "social_isolation",
    "social isolation": "social_isolation",
    "institutional_distrust": "institutional_distrust",
    "institutional distrust": "institutional_distrust",
    "moral_outrage": "moral_outrage",
    "moral outrage": "moral_outrage",
}


def normalise_factors(factors) -> list[str]:
    """Map LLM factor names to canonical keys, dropping unknowns."""
    if not isinstance(factors, list):
        return []
    out: list[str] = []
    for f in factors:
        key = FACTOR_ALIASES.get(str(f).strip().lower(), "")
        if key and key not in out:
            out.append(key)
    return out


def load_sample() -> pd.DataFrame:
    if not SAMPLE_CSV.exists():
        raise FileNotFoundError(
            f"{SAMPLE_CSV} not found. Run notebooks/01_explore_personas.ipynb first."
        )
    return pd.read_csv(SAMPLE_CSV)


def build_messages(persona_row: dict) -> list[dict]:
    system = PROMPT_PATH.read_text(encoding="utf-8")
    user_payload = {
        "task": "Rewrite this synthetic persona so it exhibits radicalisation-vulnerability indicators.",
        "original_persona": {f: persona_row[f] for f in REWRITE_FIELDS},
        "demographics": {f: persona_row[f] for f in DEMOGRAPHIC_FIELDS},
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False, indent=2)},
    ]


def parse_output(raw: str) -> dict:
    """Parse the LLM response as JSON, tolerating markdown code fences."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    return json.loads(raw)


def select_subset(df: pd.DataFrame, n: int, seed: int) -> list[int]:
    return random.Random(seed).sample(list(df.index), n)


def run(n: int, seed: int = 42, dry_run: bool = False) -> None:
    df = load_sample()
    if len(df) < n:
        raise ValueError(f"sample has {len(df)} rows; need at least {n}")

    idx = select_subset(df, n, seed)

    # Initialise label columns up front (avoids pandas 3.0 setitem issues).
    df["label"] = 0
    df["injected_factors"] = ""

    log = open(LOG_PATH, "w", encoding="utf-8")
    n_ok = 0
    for i, row_idx in enumerate(idx, start=1):
        row = df.loc[row_idx].to_dict()

        if dry_run:
            out = {f: row[f] for f in REWRITE_FIELDS} | {"injected_factors": ["(dry-run)"]}
        else:
            messages = build_messages(row)
            raw = llm_client.chat_completion(messages)
            try:
                out = parse_output(raw)
            except json.JSONDecodeError:
                print(f"  [{i}/{n}] {row['uuid'][:8]}: unparseable output, skipped", flush=True)
                continue
            log.write(json.dumps({"uuid": row["uuid"], "prompt": messages, "raw": raw, "parsed": out}, ensure_ascii=False) + "\n")
            log.flush()

        for f in REWRITE_FIELDS:
            if isinstance(out.get(f), str):
                df.loc[row_idx, f] = out[f]
        df.loc[row_idx, "label"] = 1
        df.loc[row_idx, "injected_factors"] = ",".join(normalise_factors(out.get("injected_factors")))
        n_ok += 1

        # Persist after every rewrite so the dataset is visible while running.
        df.to_csv(LABELLED_CSV, index=False)
        if i % 5 == 0 or i == n:
            print(f"  [{i}/{n}] done ({n_ok} labelled) -> {LABELLED_CSV.name}", flush=True)

    log.close()
    print(f"\nfinished: {n_ok} labelled 1, {len(df) - n_ok} labelled 0", flush=True)
    print(f"wrote {LABELLED_CSV}", flush=True)
    print(f"wrote {LOG_PATH}  ({n_ok} entries)", flush=True)


def fix_noops() -> None:
    """Re-inject label-1 personas whose rewritten text was returned unchanged."""
    df = load_sample()
    labelled = pd.read_csv(LABELLED_CSV)
    if "label" not in labelled.columns:
        raise RuntimeError(f"{LABELLED_CSV.name} has no label column - run injection first")

    noops = [
        idx
        for idx in labelled.index[labelled["label"] == 1]
        if all(df.iloc[idx][f] == labelled.iloc[idx][f] for f in REWRITE_FIELDS)
    ]
    print(f"no-op positives to re-inject: {len(noops)}")
    if not noops:
        print("nothing to fix")
        return

    with open(LOG_PATH, "a", encoding="utf-8") as log:
        for i, idx in enumerate(noops, start=1):
            row = df.iloc[idx].to_dict()
            messages = build_messages(row)
            messages[-1]["content"] += (
                "\n\nNote: an earlier attempt returned the text unchanged. "
                "The rewritten fields MUST differ from the originals and express "
                "at least two indicators explicitly."
            )
            raw = llm_client.chat_completion(messages)
            try:
                out = parse_output(raw)
            except json.JSONDecodeError:
                print(f"  [{i}/{len(noops)}] {row['uuid'][:8]}: unparseable, skipped")
                continue
            for f in REWRITE_FIELDS:
                if isinstance(out.get(f), str):
                    labelled.loc[idx, f] = out[f]
            labelled.loc[idx, "injected_factors"] = ",".join(normalise_factors(out.get("injected_factors")))
            log.write(json.dumps({"uuid": row["uuid"], "prompt": messages, "raw": raw, "parsed": out}, ensure_ascii=False) + "\n")
            log.flush()
            still_same = all(df.iloc[idx][f] == labelled.iloc[idx][f] for f in REWRITE_FIELDS)
            print(f"  [{i}/{len(noops)}] {'still unchanged!' if still_same else 'fixed'} {row['uuid'][:8]}")

    labelled.to_csv(LABELLED_CSV, index=False)
    print(f"saved {LABELLED_CSV}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="LLM indicator injection (labelled test set)")
    ap.add_argument("--n", type=int, default=100, help="number of personas to rewrite")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--dry-run", action="store_true", help="skip the LLM call")
    ap.add_argument("--fix-noops", action="store_true", help="re-inject label-1 personas whose text was returned unchanged")
    args = ap.parse_args()
    if args.fix_noops:
        fix_noops()
    else:
        run(args.n, args.seed, args.dry_run)
