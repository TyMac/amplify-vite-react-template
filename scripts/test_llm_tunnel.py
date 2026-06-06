#!/usr/bin/env python3
"""Smoke test an OpenAI-compatible LLM endpoint such as Barista's Ollama tunnel.

Required:
  LLM_API_KEY       Bearer token for the endpoint. Do not commit or print the value.

Optional:
  LLM_BASE_URL      Base URL ending in /v1. Default: https://llm.y337.org/v1
  LLM_MODEL         Model to test. Default: barista:latest
  LLM_TIMEOUT       Request timeout seconds. Default: 240
  LLM_MAX_TOKENS    Max completion tokens. Default: 256
  LLM_TEST_QUESTION Prompt used for chat completion.

Examples:
  LLM_API_KEY=... python3 scripts/test_llm_tunnel.py
  LLM_API_KEY=... LLM_MODEL=gemma4:26b python3 scripts/test_llm_tunnel.py
"""
from __future__ import annotations

import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE_URL = os.environ.get("LLM_BASE_URL", "https://llm.y337.org/v1").rstrip("/")
API_KEY = os.environ.get("LLM_API_KEY", "")
MODEL = os.environ.get("LLM_MODEL", "barista:latest")
TIMEOUT = int(os.environ.get("LLM_TIMEOUT", "240"))
COFFEE_QUESTION = os.environ.get(
    "LLM_TEST_QUESTION",
    "In two concise sentences, what grind and water-temperature adjustments would you make for a washed Ethiopian light roast in a Hario V60 with Cafec T-90 filters?",
)


def request_json(method: str, path: str, payload: dict | None = None, auth: bool = True):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Y337-LLM-Tunnel-Test/1.0",
        # The local proxy is intentionally simple; closing each request avoids
        # HTTP/1.1 keep-alive edge cases through Cloudflared.
        "Connection": "close",
    }
    if auth:
        headers["Authorization"] = f"Bearer {API_KEY}"

    req = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            try:
                raw = resp.read()
            except http.client.IncompleteRead as e:
                raw = e.partial
            text = raw.decode("utf-8", "replace")
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                data = text
            return resp.status, data
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = text
        return e.code, data


def main() -> int:
    if not API_KEY:
        print("FAIL: LLM_API_KEY is required", file=sys.stderr)
        return 2

    print(f"Base URL: {BASE_URL}")
    print(f"Model:    {MODEL}")
    print()

    print("1) Checking unauthenticated access is blocked...")
    status, data = request_json("GET", "/models", auth=False)
    print(f"   HTTP {status}")
    if status != 401:
        print("   FAIL: expected HTTP 401 without Authorization")
        print(json.dumps(data, indent=2) if isinstance(data, dict) else data)
        return 1
    print("   OK: unauthorized requests are rejected")
    print()

    time.sleep(2)

    print("2) Fetching model list...")
    status, data = request_json("GET", "/models")
    print(f"   HTTP {status}")
    if status != 200 or not isinstance(data, dict):
        print("   FAIL: /models did not return JSON HTTP 200")
        print(data)
        return 1
    models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict)]
    print("   Models:")
    for model in models:
        print(f"   - {model}")
    if MODEL not in models:
        print(f"   WARN: requested model {MODEL!r} was not listed; trying it anyway")
    print()

    time.sleep(2)

    print("3) Sending coffee question to /chat/completions...")
    print(f"   Question: {COFFEE_QUESTION}")
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": "You are Barista's coffee brewing assistant. Answer concisely with practical brewing guidance.",
            },
            {"role": "user", "content": COFFEE_QUESTION},
        ],
        "stream": False,
        "temperature": 0.3,
        "max_tokens": int(os.environ.get("LLM_MAX_TOKENS", "256")),
        "chat_template_kwargs": {
            "enable_thinking": False,
        },
    }
    start = time.time()
    status, data = request_json("POST", "/chat/completions", payload=payload)
    elapsed = time.time() - start
    print(f"   HTTP {status} in {elapsed:.1f}s")
    if status != 200 or not isinstance(data, dict):
        print("   FAIL: chat completion did not return JSON HTTP 200")
        print(data)
        return 1

    try:
        message = data["choices"][0]["message"]
        content = message.get("content") or message.get("reasoning") or ""
        content_kind = "content" if message.get("content") else "reasoning"
    except Exception:
        print("   FAIL: response did not have OpenAI-style choices[0].message")
        print(json.dumps(data, indent=2)[:4000])
        return 1

    print(f"   Response {content_kind}:")
    print("   " + content.replace("\n", "\n   "))
    if not content.strip():
        print("   FAIL: request succeeded, but response text was empty")
        print(json.dumps(data, indent=2)[:4000])
        return 1

    coffee_terms = ("coffee", "v60", "dose", "ratio", "grind", "water", "pour", "brew")
    if not any(term in content.lower() for term in coffee_terms):
        print("   WARN: request succeeded, but response did not look coffee-related")
        print(json.dumps(data, indent=2)[:4000])
    else:
        print("   OK: OpenAI-compatible coffee chat completion works")

    print()
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
