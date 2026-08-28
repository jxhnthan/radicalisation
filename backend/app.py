"""FastAPI backend for the Radicalisation Awareness app.

Runs fully locally: serves synthetic personas from the labelled dataset and uses
the local Ollama LLM to produce an indicator analysis for the "reveal" step.
The app is a public-education exercise on synthetic data, not an assessment of
real people.

Run (from the project root):
    .venv/bin/uvicorn backend.app:app --reload --port 8000
"""
from __future__ import annotations

import json
import os
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scipy import stats as scipy_stats

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.llm_client import chat_completion  # noqa: E402
from src.scoring import evidence  # noqa: E402

LABELLED_CSV = PROJECT_ROOT / "data" / "labelled_personas.csv"
APP_POOL_CSV = PROJECT_ROOT / "data" / "app_pool.csv"
ANALYSES_PATH = PROJECT_ROOT / "data" / "analyses.json"
JUDGE_PROMPT = PROJECT_ROOT / "prompts" / "indicator_judge.md"

# Opt-in, anonymized session uploads (no PII) + admin summary.
ADMIN_DIR = PROJECT_ROOT / "data" / "admin"
SESSIONS_PATH = ADMIN_DIR / "sessions.jsonl"

TEXT_FIELDS = [
    "persona",
    "cultural_background",
    "hobbies_and_interests",
    "career_goals_and_ambitions",
]

app = FastAPI(title="Radicalisation Awareness", version="0.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local dev/demo only
    allow_methods=["*"],
    allow_headers=["*"],
)

_pool: pd.DataFrame | None = None
_analysis_cache: dict[str, dict] = {}


def _load_analyses() -> None:
    """Load precomputed judge analyses so reveal is instant and offline."""
    if ANALYSES_PATH.exists():
        with open(ANALYSES_PATH, encoding="utf-8") as f:
            _analysis_cache.update(json.load(f))


_load_analyses()


def load_pool() -> pd.DataFrame:
    global _pool
    if _pool is None:
        path = APP_POOL_CSV if APP_POOL_CSV.exists() else LABELLED_CSV
        if not path.exists():
            raise RuntimeError(
                f"{path} not found - generate the labelled set first "
                "(see README, section 6)."
            )
        _pool = pd.read_csv(path)
    return _pool


def persona_public(row) -> dict:
    """Persona fields shown to the user (no label / injected factors)."""
    return {"uuid": row["uuid"], **{f: row[f] for f in TEXT_FIELDS}}


def judge_persona(row) -> dict:
    """Run the LLM judge on a persona, caching by uuid."""
    uuid = row["uuid"]
    if uuid in _analysis_cache:
        return _analysis_cache[uuid]

    persona_text = "\n".join(f"{f}: {row[f]}" for f in TEXT_FIELDS)
    system = JUDGE_PROMPT.read_text(encoding="utf-8")
    user = f"Persona:\n{persona_text}\n\nAnalyse this persona and return JSON."
    try:
        raw = chat_completion(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.2,
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.strip("`").strip()
            if raw.startswith("json"):
                raw = raw[4:].strip()
        analysis = json.loads(raw)
    except Exception:  # noqa: BLE001 - any judge failure degrades gracefully
        analysis = {
            "scores": {},
            "signal": 0,
            "flagged": False,
            "summary": "Analysis unavailable (local model offline).",
            "unavailable": True,
        }
    _analysis_cache[uuid] = analysis
    return analysis


class RevealRequest(BaseModel):
    uuid: str
    guess: int  # 1-5 likelihood the user would report


def educational_note() -> str:
    return (
        "These personas are fully synthetic. The indicators shown come from "
        "countering-violent-extremism research; they are not a diagnosis and "
        "not a judgment about any real person. If you are ever genuinely "
        "concerned about someone, contact the authorities or a support line "
        "rather than relying on this tool."
    )


# Probability of serving a positive (injected) persona vs a negative one.
# Env-configurable, e.g. POSITIVE_PROB=0.4 -> ~40% of personas shown are positives.
POSITIVE_PROB = float(os.environ.get("POSITIVE_PROB", "0.4"))

# Track served uuids per client session id so a demo does not repeat personas.
_seen: dict[str, set[str]] = {}


@app.get("/api/persona")
def get_persona(session: str = "") -> dict:
    pool = load_pool()
    seen = _seen.setdefault(session, set())
    unseen = pool[~pool["uuid"].isin(seen)]
    if len(unseen) == 0:  # pool exhausted for this session -> reset
        seen.clear()
        unseen = pool
    pos = unseen[unseen["label"] == 1]
    neg = unseen[unseen["label"] == 0]
    if random.random() < POSITIVE_PROB and len(pos) > 0:
        row = pos.sample(1).iloc[0]
    elif len(neg) > 0:
        row = neg.sample(1).iloc[0]
    else:
        row = unseen.sample(1).iloc[0]
    seen.add(str(row["uuid"]))
    return persona_public(row)


@app.post("/api/reveal")
def reveal(req: RevealRequest) -> dict:
    pool = load_pool()
    match = pool[pool["uuid"] == req.uuid]
    if match.empty:
        raise HTTPException(status_code=404, detail="persona not found")
    row = match.iloc[0]

    analysis = judge_persona(row)
    injected = str(row["injected_factors"]).split(",") if int(row["label"]) == 1 else []
    ground_truth = {
        "label": int(row["label"]),
        "class_label": str(row.get("class_label", "unknown")),
        "injected_factors": [f for f in injected if f],
    }
    return {
        "persona": persona_public(row),
        "ground_truth": ground_truth,
        "ai": analysis,
        "rule_evidence": evidence({f: row[f] for f in TEXT_FIELDS}),
        "user_guess": req.guess,
        "note": educational_note(),
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/performance")
def performance() -> dict:
    """Measured detector accuracy on the synthetic labelled set.

    Served read-only from the evaluation output for in-app transparency.
    """
    path = PROJECT_ROOT / "data" / "evaluation_results.json"
    if not path.exists():
        return {"available": False}
    data = json.loads(path.read_text(encoding="utf-8"))
    data["available"] = True
    return data


class SessionPayload(BaseModel):
    """Anonymized, opt-in session upload. No PII - just counts and quiz scores."""

    session_id: str = ""
    stats: dict = {}
    vouchers: dict = {}
    quiz_pre: dict | None = None
    quiz_post: dict | None = None
    pre_score: float | None = None
    post_score: float | None = None
    submitted_at: str = ""


@app.post("/api/sessions")
def submit_session(payload: SessionPayload) -> dict:
    """Upsert one anonymized session keyed by session_id (idempotent).

    Auto-uploading from the same browser session repeatedly replaces the
    earlier row rather than appending, so the store keeps one row per session.
    """
    ADMIN_DIR.mkdir(parents=True, exist_ok=True)
    row = payload.model_dump()
    sid = str(row.get("session_id") or "")
    rows = _load_sessions()
    if sid:
        rows = [r for r in rows if str(r.get("session_id") or "") != sid]
    rows.append(row)
    with open(SESSIONS_PATH, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    return {"ok": True}


def _load_sessions() -> list[dict]:
    if not SESSIONS_PATH.exists():
        return []
    rows: list[dict] = []
    with open(SESSIONS_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


@app.get("/api/admin/summary")
def admin_summary() -> dict:
    """Aggregate uploaded sessions and test whether quiz knowledge change is
    significant (paired pre/post scores, Wilcoxon signed-rank with a paired-t
    fallback, plus Cohen's d effect size).
    """
    rows = _load_sessions()
    n = len(rows)
    rated = sum(int(r.get("stats", {}).get("rated", 0) or 0) for r in rows)
    correct = sum(int(r.get("stats", {}).get("correct", 0) or 0) for r in rows)
    false_alarm = sum(int(r.get("stats", {}).get("falseAlarm", 0) or 0) for r in rows)
    missed = sum(int(r.get("stats", {}).get("miss", 0) or 0) for r in rows)

    pairs: list[tuple[float, float]] = []
    for r in rows:
        pre, post = r.get("pre_score"), r.get("post_score")
        if isinstance(pre, (int, float)) and isinstance(post, (int, float)):
            pairs.append((float(pre), float(post)))

    quiz: dict | None = None
    if len(pairs) >= 2:
        pre_arr = np.array([p[0] for p in pairs])
        post_arr = np.array([p[1] for p in pairs])
        diff = post_arr - pre_arr
        mean_diff = float(diff.mean())
        sd_diff = float(diff.std(ddof=1)) if len(diff) > 1 else 0.0
        p_value: float | None = None
        test: str | None = None
        if (diff != 0).sum() > 0:
            try:
                _, p_value = scipy_stats.wilcoxon(diff, zero_method="wilcox")
                test = "wilcoxon"
            except ValueError:
                _, p_value = scipy_stats.ttest_rel(post_arr, pre_arr)
                test = "paired t"
        quiz = {
            "n_pairs": len(pairs),
            "mean_pre": round(float(pre_arr.mean()), 2),
            "mean_post": round(float(post_arr.mean()), 2),
            "mean_diff": round(mean_diff, 2),
            "sd_diff": round(sd_diff, 2),
            "p_value": round(float(p_value), 4) if p_value is not None else None,
            "test": test,
            "cohens_d": round(mean_diff / sd_diff, 2) if sd_diff > 0 else None,
            "significant": bool(p_value is not None and p_value < 0.05 and mean_diff > 0),
            "direction": "improvement" if mean_diff > 0 else "decline" if mean_diff < 0 else "no change",
            "pairs": [[round(a, 1), round(b, 1)] for a, b in pairs],
        }

    return {
        "n_sessions": n,
        "simulated": sum(
            1 for r in rows if str(r.get("session_id", "")).startswith("sim-")
        ),
        "total_rated": rated,
        "total_correct": correct,
        "total_false_alarm": false_alarm,
        "total_missed": missed,
        "correct_rate": round(correct / rated, 3) if rated else None,
        "quiz": quiz,
    }


def _sample_sessions(n: int) -> list[dict]:
    """Deterministic, clearly-marked sample sessions for demo purposes.

    Pre scores hover around 4-5/8 and post around 6-7/8 so the paired test
    shows a clear improvement - a reviewer can see the populated dashboard.
    """
    rng = random.Random(42)
    rows: list[dict] = []
    for i in range(n):
        pre = round(min(8, max(0, 4.0 + rng.uniform(-1.0, 1.5))), 1)
        post = round(min(8, max(0, 6.4 + rng.uniform(-0.8, 1.0))), 1)
        rated = rng.randint(5, 12)
        correct = min(rated, rng.randint(2, max(3, rated)))
        rows.append(
            {
                "session_id": f"sim-{i}",
                "stats": {
                    "rated": rated,
                    "correct": correct,
                    "falseAlarm": rng.randint(0, 2),
                    "miss": max(0, rated - correct),
                    "streak": 0,
                    "bestStreak": 0,
                },
                "vouchers": {},
                "quiz_pre": {"answers": [], "at": ""},
                "quiz_post": {"answers": [], "at": ""},
                "pre_score": pre,
                "post_score": post,
                "submitted_at": "simulated",
            }
        )
    return rows


@app.post("/api/admin/simulate")
def admin_simulate(n: int = 15) -> dict:
    """Seed the store with sample sessions (ids prefixed 'sim-'). Idempotent."""
    existing = {r.get("session_id") for r in _load_sessions()}
    ADMIN_DIR.mkdir(parents=True, exist_ok=True)
    added = 0
    with open(SESSIONS_PATH, "a", encoding="utf-8") as f:
        for row in _sample_sessions(n):
            if row["session_id"] in existing:
                continue
            f.write(json.dumps(row) + "\n")
            added += 1
    return {"ok": True, "added": added}


@app.post("/api/admin/clear-simulated")
def admin_clear_simulated() -> dict:
    """Remove only the simulated sessions (keep real uploads)."""
    rows = _load_sessions()
    keep = [r for r in rows if not str(r.get("session_id", "")).startswith("sim-")]
    ADMIN_DIR.mkdir(parents=True, exist_ok=True)
    with open(SESSIONS_PATH, "w", encoding="utf-8") as f:
        for row in keep:
            f.write(json.dumps(row) + "\n")
    return {"ok": True, "removed": len(rows) - len(keep)}
