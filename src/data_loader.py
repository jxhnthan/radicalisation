"""Data loader for the radicalisation prototype.

Uses the Hugging Face **datasets-server HTTP API** (lightweight, on-demand) instead
of downloading the full 278 MB dataset, and caches what we fetch into a growable
local parquet cache.

API reference: https://huggingface.co/docs/datasets-server
Endpoints used:
  GET /statistics  -> total row count, per-column summary stats
  GET /rows        -> paginated rows (max `length` = 100)
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterator, Optional

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

API_BASE = "https://datasets-server.huggingface.co"
DATASET = "nvidia/Nemotron-Personas-Singapore"
CONFIG = "default"
SPLIT = "train"
PAGE_SIZE = 100  # datasets-server maximum per request

# Local growable parquet cache (rows are appended to this file)
CACHE_PATH = DATA_DIR / "personas_cache.parquet"

# Columns, from the dataset schema
TEXT_COLUMNS = [
    "persona",
    "professional_persona",
    "sports_persona",
    "arts_persona",
    "travel_persona",
    "culinary_persona",
    "cultural_background",
    "skills_and_expertise",
    "hobbies_and_interests",
    "career_goals_and_ambitions",
]
DEMOGRAPHIC_COLUMNS = [
    "sex",
    "age",
    "marital_status",
    "education_level",
    "occupation",
    "industry",
    "planning_area",
    "country",
]
LIST_COLUMNS = ["skills_and_expertise_list", "hobbies_and_interests_list"]

DEFAULT_SAMPLE_ROWS = 10_000  # sensible default for a slow start


# --------------------------------------------------------------------------- #
# Low-level API access
# --------------------------------------------------------------------------- #
def _get_json(url: str, retries: int = 4, backoff: float = 2.0) -> dict:
    """GET a JSON endpoint with a small retry/backoff for transient 429/5xx."""
    last_err: Optional[Exception] = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "radicalisation-prototype/0.1"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception as err:  # noqa: BLE001 - network errors are heterogeneous
            last_err = err
            time.sleep(backoff * (attempt + 1))
    raise RuntimeError(f"GET {url} failed after {retries} attempts: {last_err}")


def _rows_url(offset: int, length: int) -> str:
    params = {
        "dataset": DATASET,
        "config": CONFIG,
        "split": SPLIT,
        "offset": offset,
        "length": length,
    }
    return f"{API_BASE}/rows?{urllib.parse.urlencode(params)}"


def get_num_rows() -> int:
    """Total number of rows in the dataset (from /statistics)."""
    url = f"{API_BASE}/statistics?dataset={urllib.parse.quote(DATASET, safe='')}&config={CONFIG}&split={SPLIT}"
    data = _get_json(url)
    return int(data["num_examples"])


def fetch_rows(offset: int, length: int = PAGE_SIZE) -> tuple[list[dict], int]:
    """Fetch one page of rows. Returns (row_dicts, num_rows_total)."""
    data = _get_json(_rows_url(offset, min(length, PAGE_SIZE)))
    rows = [item["row"] for item in data["rows"]]
    return rows, int(data["num_rows_total"])


def stream_rows(start_offset: int = 0, max_rows: Optional[int] = None) -> Iterator[dict]:
    """Iterate over row dicts starting at `start_offset`, up to `max_rows`."""
    num_rows_total = get_num_rows()
    end = num_rows_total if max_rows is None else min(start_offset + max_rows, num_rows_total)
    offset = start_offset
    while offset < end:
        want = min(PAGE_SIZE, end - offset)
        rows, _ = fetch_rows(offset, want)
        if not rows:
            break
        for r in rows:
            yield r
        offset += len(rows)


# --------------------------------------------------------------------------- #
# Growable local parquet cache
# --------------------------------------------------------------------------- #
def cached_count() -> int:
    if not CACHE_PATH.exists():
        return 0
    return len(pd.read_parquet(CACHE_PATH, columns=["uuid"]))


def load_data(n_rows: Optional[int] = None, force_refresh: bool = False) -> pd.DataFrame:
    """Return a DataFrame of (at least) the first `n_rows` personas.

    Fetches missing rows through the API and appends them to the local parquet
    cache, so repeated calls are cheap and the cache grows over time.

    Args:
        n_rows: how many rows to guarantee. None -> DEFAULT_SAMPLE_ROWS.
        force_refresh: ignore the cache and refetch from scratch.
    """
    n_rows = DEFAULT_SAMPLE_ROWS if n_rows is None else n_rows
    num_rows_total = get_num_rows()

    if force_refresh and CACHE_PATH.exists():
        CACHE_PATH.unlink()

    have = cached_count() if CACHE_PATH.exists() else 0
    if have >= n_rows:
        df = pd.read_parquet(CACHE_PATH)
        return df.head(n_rows).reset_index(drop=True)

    # Fetch only what we're missing and append to the cache.
    to_fetch = min(n_rows, num_rows_total) - have
    print(f"[loader] fetching {to_fetch:,} more rows (have {have:,} cached of {num_rows_total:,})")
    new_rows: list[dict] = []
    for row in stream_rows(start_offset=have, max_rows=to_fetch):
        new_rows.append(row)

    new_df = pd.DataFrame(new_rows)
    if CACHE_PATH.exists():
        existing = pd.read_parquet(CACHE_PATH)
        new_df = pd.concat([existing, new_df], ignore_index=True)
    new_df.to_parquet(CACHE_PATH, index=False)
    return new_df.head(n_rows).reset_index(drop=True)


# --------------------------------------------------------------------------- #
# Convenience
# --------------------------------------------------------------------------- #
def sample_personas(n: int = 5) -> pd.DataFrame:
    """Small convenience for quick looks."""
    return load_data(n_rows=n)
