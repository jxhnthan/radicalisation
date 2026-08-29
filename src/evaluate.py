# Evaluates indicator detection on the labelled set: rule-based vs LLM-judge
# metrics plus agreement. Writes data/evaluation_results.json and prints a report.
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import pearsonr
from sklearn.metrics import (
    cohen_kappa_score,
    precision_recall_fscore_support,
    roc_auc_score,
    roc_curve,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.scoring import TEXT_FIELDS, score_persona  # noqa: E402

DATA_DIR = PROJECT_ROOT / "data"
LABELLED_CSV = DATA_DIR / "labelled_personas.csv"
ANALYSES_PATH = DATA_DIR / "analyses.json"
RESULTS_PATH = DATA_DIR / "evaluation_results.json"


def _metrics(y, flag, signal) -> dict:
    y = np.asarray(y, dtype=int)
    flag = np.asarray([bool(x) for x in flag])
    prec, rec, f1, _ = precision_recall_fscore_support(
        y, flag, average="binary", zero_division=0
    )
    auc = roc_auc_score(y, signal) if len(set(y)) > 1 else float("nan")
    return {
        "n": int(len(y)),
        "positives": int(y.sum()),
        "precision": round(float(prec), 3),
        "recall": round(float(rec), 3),
        "f1": round(float(f1), 3),
        "roc_auc": round(float(auc), 3) if not np.isnan(auc) else None,
        "roc": _roc_curve(y, signal) if len(set(y)) > 1 else None,
    }


def _roc_curve(y, signal, n=101) -> dict | None:
    # ROC curve interpolated onto a fixed FPR grid so the admin dashboard can
    # render a smooth, lightweight, interactive curve. None when only one
    # class is present (AUC is undefined).
    y = np.asarray(y, dtype=int)
    signal = np.asarray(signal, dtype=float)
    if len(set(y)) < 2:
        return None
    fpr, tpr, _ = roc_curve(y, signal)
    grid = np.linspace(0.0, 1.0, n)
    tpr_grid = np.interp(grid, fpr, tpr)
    tpr_grid[0] = 0.0
    tpr_grid[-1] = 1.0
    return {
        "fpr": [round(float(v), 4) for v in grid],
        "tpr": [round(float(v), 4) for v in tpr_grid],
        "auc": round(float(roc_auc_score(y, signal)), 3),
    }


def _pearson(a, b) -> float:
    r = pearsonr(np.asarray(a, dtype=float), np.asarray(b, dtype=float))
    return float(getattr(r, "statistic", r[0]))


def _class_rates(df: pd.DataFrame, uuid_fn) -> dict:
    # Per-class detection rates; hard-negative is the over-firing check (how
    # often ordinary discontent is wrongly flagged).
    rates = {}
    classes = df["class_label"].unique() if "class_label" in df.columns else ["all"]
    for cls in classes:
        sub = df[df["class_label"] == cls]
        flagged = sum(1 for u in sub["uuid"] if uuid_fn(u))
        rates[str(cls)] = {"n": int(len(sub)), "flagged": int(flagged)}
    return rates


def _llm_judge(df: pd.DataFrame, rule_by_uuid: dict) -> dict | None:
    # Metrics on the precomputed LLM pool plus rule/judge agreement. Returns
    # None when analyses.json is not ready so run() can report a pending status.
    if not ANALYSES_PATH.exists():
        return None
    analyses = json.loads(ANALYSES_PATH.read_text(encoding="utf-8"))
    sub = df[df["uuid"].isin(analyses)]
    sub_y = sub["label"].astype(int).values
    sub_sig = np.array([analyses[u].get("signal", 0) for u in sub["uuid"]])
    sub_flag = np.array([analyses[u].get("flagged", False) for u in sub["uuid"]])
    rule_sig_sub = np.array([rule_by_uuid[u]["signal"] for u in sub["uuid"]])
    rule_flag_sub = np.array([rule_by_uuid[u]["flagged"] for u in sub["uuid"]])

    llm = _metrics(sub_y, sub_flag, sub_sig)
    llm["per_class"] = _class_rates(
        df, lambda u: analyses.get(u, {}).get("flagged", False)
    )
    hn = llm["per_class"].get("hard_negative")
    hn_fp = round(hn["flagged"] / max(1, hn["n"]), 3) if hn else None
    agreement = {
        "n": int(len(sub)),
        "signal_pearson": round(_pearson(sub_sig, rule_sig_sub), 3),
        "flag_cohens_kappa": round(
            float(cohen_kappa_score(sub_flag, rule_flag_sub)), 3
        ),
    }
    return {"llm_judge": llm, "agreement": agreement, "hn_fp": hn_fp}


def run() -> dict:
    df = pd.read_csv(LABELLED_CSV)
    uuids = df["uuid"].tolist()
    y = df["label"].astype(int).values

    rule_by_uuid = {
        row["uuid"]: score_persona({f: row[f] for f in TEXT_FIELDS})
        for _, row in df.iterrows()
    }
    rule_signal = np.array([rule_by_uuid[u]["signal"] for u in uuids])
    rule_flag = np.array([rule_by_uuid[u]["flagged"] for u in uuids])

    results: dict = {
        "rule_based": _metrics(y, rule_flag, rule_signal),
        "note": "Precision/recall are at the flag threshold (signal >= 3).",
    }
    results["rule_based"]["per_class"] = _class_rates(
        df, lambda u: rule_by_uuid[u]["flagged"]
    )
    results["hard_negative_fp_rate"] = {}
    rule_hn = results["rule_based"]["per_class"].get("hard_negative")
    if rule_hn:
        results["hard_negative_fp_rate"]["rule_based"] = round(
            rule_hn["flagged"] / max(1, rule_hn["n"]), 3
        )

    llm = _llm_judge(df, rule_by_uuid)
    if llm is not None:
        results["llm_judge"] = llm["llm_judge"]
        results["agreement"] = llm["agreement"]
        if llm["hn_fp"] is not None:
            results["hard_negative_fp_rate"]["llm_judge"] = llm["hn_fp"]
    else:
        results["llm_judge"] = "pending (analyses.json not ready)"

    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("=== Evaluation ===")
    for key in ("rule_based", "llm_judge"):
        print(f"\n{key}:")
        v = results[key]
        if isinstance(v, str):
            print("  ", v)
            continue
        for k, val in v.items():
            print(f"  {k}: {val}")
    if "agreement" in results:
        print("\nagreement (rule vs LLM):")
        for k, val in results["agreement"].items():
            print(f"  {k}: {val}")
    print(f"\nwrote {RESULTS_PATH.name}")
    return results


if __name__ == "__main__":
    run()
