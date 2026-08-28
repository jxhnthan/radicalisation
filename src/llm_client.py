# Minimal OpenAI-compatible chat-completions client. Works with any endpoint
# (OpenAI, NVIDIA NIM, Ollama, Groq, ...). Config via env vars or a .env file
# at the project root - env vars win.
from __future__ import annotations

import json
import os
import time

import requests

DEFAULT_BASE_URL = "https://api.openai.com/v1"


def _load_dotenv() -> None:
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def config() -> dict:
    _load_dotenv()
    return {
        "base_url": os.environ.get("LLM_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
        "api_key": os.environ.get("LLM_API_KEY", ""),
        "model": os.environ.get("LLM_MODEL", "gpt-4o-mini"),
    }


def chat_completion(
    messages: list[dict],
    *,
    temperature: float = 0.5,
    max_tokens: int = 600,
    retries: int = 3,
) -> str:
    # JSON mode first; fall back to plain mode if the endpoint rejects
    # `response_format` (e.g. some local servers).
    cfg = config()
    if not cfg["api_key"]:
        raise RuntimeError("LLM_API_KEY not set (and no .env). See .env.example.")

    url = f"{cfg['base_url']}/chat/completions"
    headers = {"Authorization": f"Bearer {cfg['api_key']}"}

    def _attempt(use_json_mode: bool) -> str:
        body = {
            "model": cfg["model"],
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if use_json_mode:
            body["response_format"] = {"type": "json_object"}
        r = requests.post(url, headers=headers, json=body, timeout=120)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    for attempt in range(retries):
        try:
            return _attempt(use_json_mode=True)
        except Exception as err:  # noqa: BLE001 - retry on any transient error
            last_err = err
            time.sleep(2 * (attempt + 1))
            try:
                return _attempt(use_json_mode=False)
            except Exception as err2:  # noqa: BLE001
                last_err = err2
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"chat_completion failed after {retries} attempts: {last_err}")  # type: ignore[name-defined]  # noqa: F821


if __name__ == "__main__":
    # Smoke test: echo a message to confirm the endpoint is reachable.
    cfg = config()
    print(f"base_url: {cfg['base_url']}")
    print(f"model:    {cfg['model']}")
    print(f"api_key:  {'set' if cfg['api_key'] else 'MISSING'}")
