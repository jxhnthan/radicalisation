"""Rebuild the app persona pool from the final 4-class labelled set.

Selects a balanced pool (all positives + all hard negatives + a baseline
sample), reuses existing judge analyses where the persona text is unchanged,
and runs the LLM judge only for rows that need it. Writes:
  data/analyses.json   - merged {uuid: analysis} (existing + newly judged)
  data/app_pool.csv    - the final pool the app serves (has class_label)

Why incremental: analyses computed before the 4-class build are only valid
where the persona text did not change. The 100 old positives were reused as
full indicators (unchanged), and old-negative analyses are only valid for rows
that stayed baseline. Any row later rewritten into hard/full/partial must be
re-judged.

Usage:
  .venv/bin/python -m src.rebuild_app_pool --baseline 100
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.llm_client import chat_completion  # noqa: E402

DATA_DIR = PROJECT_ROOT / "data"
LABELLED_CSV = DATA_DIR / "labelled_personas.csv"
OLD_POOL_CSV = DATA_DIR / "app_pool.csv"
ANALYSES_PATH = DATA_DIR / "analyses.json"
APP_POOL_CSV = DATA_DIR / "app_pool.csv"
JUDGE_PROMPT = PROJECT_ROOT / "prompts" / "indicator_judge.md"

TEXT_FIELDS = [
    "persona",
    "cultural_background",
    "hobbies_and_interests",
    "career_goals_and_ambitions",
]


def judge_persona(row) -> dict:
    """Run the indicator judge on one persona row, returning parsed JSON."""
    persona_text = "\n".join(f"{f}: {row[f]}" for f in TEXT_FIELDS)
    system = JUDGE_PROMPT.read_text(encoding="utf-8")
    user = f"Persona:\n{persona_text}\n\nAnalyse this persona and return JSON."
    raw = chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
        max_tokens=350,
    )
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    return json.loads(raw)


def main(baseline_n: int, seed: int = 42) -> None:
    df = pd.read_csv(LABELLED_CSV)
    analyses: dict[str, dict] = {}
    if ANALYSES_PATH.exists():
        analyses = json.loads(ANALYSES_PATH.read_text(encoding="utf-8"))
    old_pos_uuids: set[str] = set()
    if OLD_POOL_CSV.exists():
        old_pool = pd.read_csv(OLD_POOL_CSV)
        if "label" in old_pool.columns:
            old_pos_uuids = set(old_pool[old_pool["label"] == 1]["uuid"])

    def valid_reuse(uuid: str) -> bool:
        """Existing analysis is still valid if the text did not change."""
        if uuid not in analyses:
            return False
        cls = df.set_index("uuid").at[uuid, "class_label"]
        # Old positives were reused as full indicators (text unchanged).
        # Otherwise the text only stays unchanged for baseline rows.
        return uuid in old_pos_uuids or cls == "baseline"

    # --- deterministic pool selection -------------------------------
    full = df[df["class_label"] == "full_indicator"]
    partial = df[df["class_label"] == "partial_indicator"]
    hard = df[df["class_label"] == "hard_negative"]
    base = df[df["class_label"] == "baseline"]

    # Prefer already-analysed baseline rows, top up with a seeded sample.
    have = base[base["uuid"].isin(analyses)]
    need = baseline_n - len(have)
    if need > 0:
        rest = base[~base["uuid"].isin(analyses)].sample(
            n=min(need, len(base[~base["uuid"].isin(analyses)])), random_state=seed
        )
        have = pd.concat([have, rest])
    baseline_pick = have.head(baseline_n)

    pool = pd.concat([full, partial, hard, baseline_pick]).reset_index(drop=True)
    pool = pool.drop_duplicates(subset="uuid")
    print(
        f"pool: {len(pool)} rows "
        f"(full {len(full)}, partial {len(partial)}, hard {len(hard)}, "
        f"baseline {len(baseline_pick)})",
        flush=True,
    )

    to_judge = [u for u in pool["uuid"] if not valid_reuse(u)]
    print(f"reusing {len(pool) - len(to_judge)} existing analyses; "
          f"judging {len(to_judge)} new", flush=True)

    for i, uuid in enumerate(to_judge, start=1):
        row = df[df["uuid"] == uuid].iloc[0]
        try:
            analyses[uuid] = judge_persona(row)
        except Exception as err:  # noqa: BLE001 - network/model errors are heterogeneous
            print(f"  [{i}/{len(to_judge)}] {uuid[:8]}: failed ({err})", flush=True)
            continue
        if i % 10 == 0 or i == len(to_judge):
            print(f"  [{i}/{len(to_judge)}] done", flush=True)
        if i % 25 == 0:
            with open(ANALYSES_PATH, "w", encoding="utf-8") as f:
                json.dump(analyses, f)

    with open(ANALYSES_PATH, "w", encoding="utf-8") as f:
        json.dump(analyses, f)
    pool.to_csv(APP_POOL_CSV, index=False)
    print(f"wrote {ANALYSES_PATH.name} ({len(analyses)} analyses)", flush=True)
    print(f"wrote {APP_POOL_CSV.name} ({len(pool)} personas)", flush=True)
    print("class distribution:")
    print(pool["class_label"].value_counts().to_string(), flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Rebuild app pool incrementally")
    ap.add_argument("--baseline", type=int, default=100, help="baseline rows in the pool")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    main(args.baseline, args.seed)
