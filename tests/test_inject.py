# Unit tests for the injection helpers.
import json
import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.inject_indicators import (  # noqa: E402
    normalise_factors,
    parse_output,
    select_subset,
)


def test_normalise_factors():
    assert normalise_factors(
        ["grievance", "us_vs_them", "institutional_distrust"]
    ) == ["grievance", "us_vs_them", "institutional_distrust"]
    # variants collapse to canonical names
    assert normalise_factors(
        ["Grievance", "us-vs-them", "institutional distrust"]
    ) == ["grievance", "us_vs_them", "institutional_distrust"]
    # unknown names are dropped, not kept
    assert normalise_factors(["unknown_thing", "grievance"]) == ["grievance"]
    # non-list input -> empty
    assert normalise_factors(None) == []
    # duplicates removed
    assert normalise_factors(["grievance", "grievance"]) == ["grievance"]


def test_parse_output():
    raw = json.dumps({"persona": "x", "injected_factors": ["grievance"]})
    assert parse_output(raw) == {"persona": "x", "injected_factors": ["grievance"]}
    # markdown fences are tolerated
    fenced = "```json\n" + raw + "\n```"
    assert parse_output(fenced) == {"persona": "x", "injected_factors": ["grievance"]}


def test_select_subset_deterministic():
    df = pd.DataFrame({"uuid": [f"u{i}" for i in range(100)]})
    a = select_subset(df, 10, seed=42)
    b = select_subset(df, 10, seed=42)
    c = select_subset(df, 10, seed=1)
    assert a == b
    assert a != c
    assert len(a) == 10
    # No duplicates.
    assert len(set(a)) == 10
