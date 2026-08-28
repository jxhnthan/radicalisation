"""Integration tests for the FastAPI backend (LLM mocked)."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import backend.app as app  # noqa: E402

CANNED = {
    "scores": {
        "grievance": 4,
        "us_vs_them": 3,
        "identity_seeking": 2,
        "social_isolation": 1,
        "institutional_distrust": 4,
        "moral_outrage": 2,
    },
    "signal": 4,
    "flagged": True,
    "summary": "test summary",
}


@pytest.fixture()
def client(monkeypatch):
    # Replace the LLM judge so tests never hit Ollama.
    monkeypatch.setattr(app, "judge_persona", lambda row: CANNED)
    return TestClient(app.app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_persona_shape(client):
    r = client.get("/api/persona")
    assert r.status_code == 200
    data = r.json()
    for f in [
        "uuid",
        "persona",
        "cultural_background",
        "hobbies_and_interests",
        "career_goals_and_ambitions",
    ]:
        assert f in data
    # the label / injected factors must NOT leak to the client
    assert "label" not in data
    assert "injected_factors" not in data


def test_reveal_known_persona(client):
    pool = app.load_pool()
    uuid = pool.iloc[0]["uuid"]
    r = client.post("/api/reveal", json={"uuid": uuid, "guess": 3})
    assert r.status_code == 200
    data = r.json()
    assert data["user_guess"] == 3
    assert data["ai"]["signal"] == 4
    assert data["ai"]["flagged"] is True
    assert "ground_truth" in data
    assert data["ground_truth"]["label"] in (0, 1)


def test_reveal_unknown_persona_404(client):
    r = client.post("/api/reveal", json={"uuid": "does-not-exist", "guess": 3})
    assert r.status_code == 404


def test_performance_endpoint(client):
    r = client.get("/api/performance")
    assert r.status_code == 200
    data = r.json()
    assert data.get("available") is True
    # Rule-based metrics should be present and well-formed.
    rb = data.get("rule_based")
    assert rb is not None
    for k in ("precision", "recall", "roc_auc"):
        assert k in rb


def test_persona_no_repeat_in_session(client):
    seen = set()
    for _ in range(30):
        r = client.get("/api/persona?session=test-session-no-repeat")
        assert r.status_code == 200
        uuid = r.json()["uuid"]
        assert uuid not in seen, f"persona repeated: {uuid}"
        seen.add(uuid)


def test_submit_session_and_summary(client, tmp_path, monkeypatch):
    monkeypatch.setattr(app, "SESSIONS_PATH", tmp_path / "sessions.jsonl")
    for i, (pre, post) in enumerate([(4.0, 6.0), (5.0, 7.0)]):
        r = client.post(
            "/api/sessions",
            json={
                "session_id": f"t{i}",
                "stats": {"rated": 5, "correct": 3},
                "quiz_pre": {"answers": []},
                "quiz_post": {"answers": []},
                "pre_score": pre,
                "post_score": post,
            },
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True
    s = client.get("/api/admin/summary").json()
    assert s["n_sessions"] == 2
    assert s["total_rated"] == 10
    assert s["quiz"]["n_pairs"] == 2
    assert s["quiz"]["mean_diff"] == 2.0
    assert s["quiz"]["p_value"] is not None


def test_submit_session_upserts_by_session_id(client, tmp_path, monkeypatch):
    monkeypatch.setattr(app, "SESSIONS_PATH", tmp_path / "sessions.jsonl")
    for rated in (3, 7):
        r = client.post(
            "/api/sessions",
            json={
                "session_id": "same-session",
                "stats": {"rated": rated, "correct": 2},
                "quiz_pre": {"answers": []},
                "quiz_post": {"answers": []},
                "pre_score": 4.0,
                "post_score": 6.0,
            },
        )
        assert r.status_code == 200
    s = client.get("/api/admin/summary").json()
    assert s["n_sessions"] == 1
    assert s["total_rated"] == 7


def test_admin_summary_empty(client, tmp_path, monkeypatch):
    monkeypatch.setattr(app, "SESSIONS_PATH", tmp_path / "sessions.jsonl")
    s = client.get("/api/admin/summary").json()
    assert s["n_sessions"] == 0
    assert s["quiz"] is None


def test_admin_simulate_and_clear(client, tmp_path, monkeypatch):
    monkeypatch.setattr(app, "SESSIONS_PATH", tmp_path / "sessions.jsonl")
    r = client.post("/api/admin/simulate")
    assert r.status_code == 200
    assert r.json()["added"] == 15
    s = client.get("/api/admin/summary").json()
    assert s["simulated"] == 15
    assert s["quiz"]["n_pairs"] == 15
    # idempotent - a second call adds nothing new
    assert client.post("/api/admin/simulate").json()["added"] == 0
    # clear removes only the simulated sessions
    assert client.post("/api/admin/clear-simulated").json()["removed"] == 15
    assert client.get("/api/admin/summary").json()["simulated"] == 0

