# Local Ollama OpenAI-compatible proxy scripts

These scripts support routing Barista chat through a local Ollama model via an authenticated OpenAI-compatible endpoint.

## `ollama_openrouter_proxy.py`

Runs on the Mac Studio in front of Ollama. Cloudflare Tunnel should point at this proxy, **not** directly at Ollama, because Ollama does not provide bearer-token auth by itself.

Required environment:

```bash
export OLLAMA_PROXY_API_KEY="..."   # secret; do not commit
```

Optional environment:

```bash
export OLLAMA_BASE_URL="http://127.0.0.1:11434"
export OLLAMA_PROXY_BIND="0.0.0.0"
export OLLAMA_PROXY_PORT="8001"
```

Run manually:

```bash
python3 scripts/ollama_openrouter_proxy.py
```

Production deployment currently runs the installed copy on the Mac Studio as a LaunchAgent.

## `test_llm_tunnel.py`

Smoke-tests an OpenAI-compatible endpoint by verifying:

1. unauthenticated `/models` returns HTTP 401
2. authenticated `/models` returns a model list
3. authenticated `/chat/completions` returns non-empty coffee-related text

Usage:

```bash
LLM_API_KEY="..." python3 scripts/test_llm_tunnel.py
LLM_API_KEY="..." LLM_MODEL="gemma4:26b" python3 scripts/test_llm_tunnel.py
```

The script intentionally requires `LLM_API_KEY`; no bearer token is committed in the repo.
