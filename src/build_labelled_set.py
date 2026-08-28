# Builds the 4-class labelled set (1000 total): baseline / hard_negative /
# full_indicator / partial_indicator. Reuses prior positives and injects the
# rest via the local LLM.
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.llm_client import chat_completion  # noqa: E402
from src.inject_indicators import (  # noqa: E402
    DEMOGRAPHIC_FIELDS,
    LABELLED_CSV,
    REWRITE_FIELDS,
    load_sample,
    normalise_factors,
    parse_output,
)

DATA_DIR = PROJECT_ROOT / "data"
PROMPTS = {
    "full_indicator": PROJECT_ROOT / "prompts" / "indicator_injection.md",
    "hard_negative": PROJECT_ROOT / "prompts" / "hard_negative_injection.md",
    "partial_indicator": PROJECT_ROOT / "prompts" / "partial_indicator_injection.md",
}


def rewrite_persona(row, class_name: str, temperature: float = 0.5) -> dict:
    system = PROMPTS[class_name].read_text(encoding="utf-8")

    def _jsonable(v):
        # numpy scalars (e.g. int64 age) are not JSON-serializable
        return v.item() if hasattr(v, "item") else v

    payload = {
        "task": "Rewrite this synthetic persona.",
        "original_persona": {f: _jsonable(row[f]) for f in REWRITE_FIELDS},
        "demographics": {f: _jsonable(row[f]) for f in DEMOGRAPHIC_FIELDS},
    }
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, indent=2)},
    ]
    raw = chat_completion(messages, temperature=temperature)
    return parse_output(raw)


def _reuse_existing_positives(df: pd.DataFrame) -> dict[str, dict]:
    reuse: dict[str, dict] = {}
    if LABELLED_CSV.exists():
        old = pd.read_csv(LABELLED_CSV)
        if "label" in old.columns:
            for _, r in old[old["label"] == 1].iterrows():
                reuse[r["uuid"]] = {f: r[f] for f in REWRITE_FIELDS} | {
                    "injected_factors": str(r["injected_factors"])
                }
    for uuid, fields in reuse.items():
        idx = df.index[df["uuid"] == uuid][0]
        df.loc[idx, "class_label"] = "full_indicator"
        df.loc[idx, "label"] = 1
        for f in REWRITE_FIELDS:
            df.loc[idx, f] = fields[f]
        df.loc[idx, "injected_factors"] = fields["injected_factors"]
    return reuse


def _plan_split(df, reuse, n_full, n_hard, n_partial, seed) -> tuple[dict, list]:
    remaining = [i for i in df.index if df.loc[i, "class_label"] == "baseline"]
    # Seeded shuffle for a reproducible split - not security-sensitive.
    rng = random.Random(seed)  # NOSONAR
    rng.shuffle(remaining)  # NOSONAR

    n_full_new = max(0, n_full - len(reuse))
    full_new = remaining[:n_full_new]
    remaining = remaining[n_full_new:]
    hard = remaining[:n_hard]
    remaining = remaining[n_hard:]
    partial = remaining[:n_partial]
    baseline = remaining[n_partial:]

    plan = {
        "full_indicator": full_new,
        "hard_negative": hard,
        "partial_indicator": partial,
    }
    return plan, baseline


def _inject_one(df, cls, idx) -> bool:
    # Rewrite one persona row; returns True on success.
    row = df.loc[idx]
    try:
        out = rewrite_persona(row, cls)
    except Exception as err:  # noqa: BLE001
        print(f"  {cls} {row['uuid'][:8]}: failed ({err})", flush=True)
        return False
    for f in REWRITE_FIELDS:
        if isinstance(out.get(f), str):
            df.loc[idx, f] = out[f]
    df.loc[idx, "class_label"] = cls
    df.loc[idx, "label"] = 1 if cls in ("full_indicator", "partial_indicator") else 0
    factors = out.get("injected_factors", [])
    df.loc[idx, "injected_factors"] = (
        ",".join(normalise_factors(factors)) if isinstance(factors, list) else ""
    )
    return True


def _inject_plan(df, plan) -> int:
    total = sum(len(v) for v in plan.values())
    done = 0
    for cls, idxs in plan.items():
        for i, idx in enumerate(idxs, start=1):
            if _inject_one(df, cls, idx):
                done += 1
            if done % 10 == 0 or done == total:
                df.to_csv(LABELLED_CSV, index=False)
                print(f"  [{done}/{total}] done -> {LABELLED_CSV.name}", flush=True)
    return done


def main(n_full: int, n_hard: int, n_partial: int, seed: int = 42) -> None:
    df = load_sample()
    df["class_label"] = "baseline"
    df["label"] = 0
    df["injected_factors"] = ""

    # 1) Reuse existing positives as full_indicator (saves LLM calls).
    reuse = _reuse_existing_positives(df)
    print(f"reusing {len(reuse)} existing positives as full indicators", flush=True)

    # 2) Plan the split over remaining baseline rows (seed-deterministic).
    plan, baseline = _plan_split(df, reuse, n_full, n_hard, n_partial, seed)
    for cls, idxs in plan.items():
        print(f"{cls}: {len(idxs)} to inject", flush=True)
    print(f"baseline: {len(baseline)}", flush=True)

    # 3) Inject via the local LLM (incremental writes for observability).
    _inject_plan(df, plan)
    df.to_csv(LABELLED_CSV, index=False)

    print("\nclass distribution:", flush=True)
    print(df["class_label"].value_counts().to_string(), flush=True)
    print(f"\nwrote {LABELLED_CSV}", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build the 4-class labelled set")
    ap.add_argument("--full", type=int, default=150)
    ap.add_argument("--hard", type=int, default=100)
    ap.add_argument("--partial", type=int, default=50)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    main(args.full, args.hard, args.partial, args.seed)
