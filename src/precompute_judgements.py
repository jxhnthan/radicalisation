# Precomputes LLM-judge analyses for the app persona pool so the "reveal" step
# is instant and offline. Writes data/analyses.json + data/app_pool.csv.
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


def main(pos_n: int, neg_n: int, seed: int = 42) -> None:
    df = pd.read_csv(LABELLED_CSV)
    pos = df[df["label"] == 1]
    neg = df[df["label"] == 0]
    pos_pick = pos.sample(n=min(pos_n, len(pos)), random_state=seed)
    neg_pick = neg.sample(n=min(neg_n, len(neg)), random_state=seed)
    pool = pd.concat([pos_pick, neg_pick]).reset_index(drop=True)
    print(f"precomputing judge for {len(pool)} personas "
          f"(pos {len(pos_pick)}, neg {len(neg_pick)})", flush=True)

    analyses: dict[str, dict] = {}
    for i, (_, row) in enumerate(pool.iterrows(), start=1):
        uuid = row["uuid"]
        try:
            analyses[uuid] = judge_persona(row)
        except Exception as err:  # noqa: BLE001 - network/model errors are heterogeneous
            print(f"  [{i}/{len(pool)}] {uuid[:8]}: failed ({err})", flush=True)
            continue
        if i % 10 == 0 or i == len(pool):
            print(f"  [{i}/{len(pool)}] done", flush=True)
        if i % 25 == 0:
            with open(ANALYSES_PATH, "w", encoding="utf-8") as f:
                json.dump(analyses, f)

    with open(ANALYSES_PATH, "w", encoding="utf-8") as f:
        json.dump(analyses, f)
    pool.to_csv(APP_POOL_CSV, index=False)
    print(f"wrote {ANALYSES_PATH.name} ({len(analyses)} analyses)", flush=True)
    print(f"wrote {APP_POOL_CSV.name} ({len(pool)} personas)", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Precompute LLM-judge analyses for the app pool")
    ap.add_argument("--pos", type=int, default=100, help="number of positive personas to include")
    ap.add_argument("--neg", type=int, default=100, help="number of negative personas to include")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    main(args.pos, args.neg, args.seed)
