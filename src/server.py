"""
CausalRiver Worker — FastAPI server.

Exposes:
  GET  /                          health / agent card redirect
  GET  /.well-known/agent-card.json
  POST /run                       direct JSON inference (non-A2A)
  POST /a2a                       A2A task endpoint (AgentBeats compatible)
"""
from __future__ import annotations

import json
import os
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.worker import run_worker
from src.config import AGENT_CARD_URL, FALLBACK_MODEL

app = FastAPI(title="CausalRiver Worker", version="1.0.0")

_START_TIME = time.time()


# ── Agent card ────────────────────────────────────────────────────────────────

def _agent_card() -> dict:
    base = AGENT_CARD_URL or "http://localhost:9020"
    return {
        "name": "CausalRiver Worker",
        "description": (
            "Causal discovery AI worker. "
            "Given a multivariate time series, returns a causal score matrix "
            "using the Apex Final ensemble (VAR + Counterfactual Knockout + "
            "Granger F-test + Coefficient Prior). "
            "ICLR 2025 CausalRivers benchmark submission."
        ),
        "version": "1.0.0",
        "url": base,
        "capabilities": {
            "streaming": False,
            "a2a": True,
        },
        "skills": [
            {
                "id": "causal_discovery",
                "name": "Causal Discovery",
                "description": "Infer causal graph from multivariate time-series data.",
                "inputModes": ["application/json"],
                "outputModes": ["application/json"],
            }
        ],
    }


@app.get("/")
async def root():
    return {"status": "ok", "uptime_s": int(time.time() - _START_TIME)}


@app.get("/.well-known/agent-card.json")
async def agent_card():
    return JSONResponse(_agent_card())


# ── Direct inference ──────────────────────────────────────────────────────────

@app.post("/run")
async def run_direct(request: Request):
    """
    Direct JSON inference — no A2A envelope.

    Body: { "data": [[...], ...], "signal_ids": [...], "max_lag": 3 }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    result = run_worker(body)
    status_code = 400 if "error" in result else 200
    return JSONResponse(result, status_code=status_code)


# ── A2A endpoint ──────────────────────────────────────────────────────────────

@app.post("/a2a")
async def a2a(request: Request):
    """
    AgentBeats A2A task handler.

    Accepts either:
    - Raw JSON with a data field (simple mode)
    - Full A2A task envelope with message.parts[0].text containing JSON
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    task_id = body.get("id") or str(uuid.uuid4())

    # Extract task input from A2A envelope or direct body
    task_input = _extract_task_input(body)
    if task_input is None:
        return JSONResponse(
            {
                "id": task_id,
                "status": {"state": "failed"},
                "error": "Could not parse task input. "
                         "Send {data: [[...],...]} or A2A envelope with JSON text part.",
            },
            status_code=400,
        )

    result = run_worker(task_input)

    if "error" in result:
        return JSONResponse(
            {
                "id": task_id,
                "status": {"state": "failed"},
                "error": result["error"],
            },
            status_code=400,
        )

    return JSONResponse(
        {
            "id": task_id,
            "status": {"state": "completed"},
            "result": {
                "message": {
                    "role": "agent",
                    "parts": [
                        {
                            "type": "text",
                            "text": json.dumps(result),
                        }
                    ],
                }
            },
        }
    )


def _extract_task_input(body: dict) -> dict | None:
    """Extract {data, signal_ids, max_lag} from either direct or A2A envelope."""
    # Direct mode
    if "data" in body:
        return body

    # A2A envelope: message.parts[0].text contains JSON
    try:
        parts = body["message"]["parts"]
        for part in parts:
            text = part.get("text", "")
            if text:
                parsed = json.loads(text)
                if "data" in parsed:
                    return parsed
    except Exception:
        pass

    return None
