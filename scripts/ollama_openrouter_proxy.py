#!/usr/bin/env python3
"""Authenticated OpenAI-compatible proxy for a local Ollama server.

Intended deployment for Barista:
  Cloudflare Tunnel -> this proxy -> local Ollama

The proxy exposes only /v1/* and requires Authorization: Bearer <token>.
It forwards OpenAI-compatible requests to Ollama's OpenAI-compatible API.

Environment variables:
  OLLAMA_PROXY_API_KEY   Required bearer token. Do not commit the value.
  OLLAMA_BASE_URL        Upstream Ollama base URL. Default: http://127.0.0.1:11434
  OLLAMA_PROXY_BIND      Bind address. Default: 0.0.0.0
  OLLAMA_PROXY_PORT      Listen port. Default: 8001
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API_KEY = os.environ.get("OLLAMA_PROXY_API_KEY", "")
UPSTREAM = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
BIND = os.environ.get("OLLAMA_PROXY_BIND", "0.0.0.0")
PORT = int(os.environ.get("OLLAMA_PROXY_PORT", "8001"))

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "authorization",
    "cf-connecting-ip",
    "cf-ipcountry",
    "cf-ray",
    "cf-visitor",
    "x-forwarded-for",
    "x-forwarded-proto",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send_json(self, code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        if not API_KEY:
            return False
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {API_KEY}"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self._proxy()

    def do_POST(self):
        self._proxy()

    def _proxy(self):
        if self.path == "/healthz":
            return self._send_json(200, {"ok": True, "upstream": UPSTREAM, "ts": int(time.time())})
        if not self.path.startswith("/v1/"):
            return self._send_json(404, {"error": {"message": "Only /v1/* endpoints are exposed", "type": "not_found"}})
        if not self._authorized():
            return self._send_json(401, {"error": {"message": "Missing or invalid Authorization: Bearer token", "type": "authentication_error"}})

        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length else None
        upstream_url = f"{UPSTREAM}{self.path}"
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP}
        headers.setdefault("User-Agent", "Y337-Ollama-Proxy/1.0")

        req = urllib.request.Request(upstream_url, data=body, method=self.command, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() in HOP_BY_HOP:
                        continue
                    self.send_header(k, v)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except urllib.error.HTTPError as e:
            payload = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:  # pragma: no cover - defensive proxy boundary
            return self._send_json(502, {"error": {"message": str(e), "type": "upstream_error"}})

    def log_message(self, format, *args):  # noqa: A002 - matches BaseHTTPRequestHandler
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))


if __name__ == "__main__":
    if not API_KEY:
        print("OLLAMA_PROXY_API_KEY is required", file=sys.stderr)
        sys.exit(2)
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"Ollama OpenAI proxy listening on {BIND}:{PORT}, upstream={UPSTREAM}")
    server.serve_forever()
