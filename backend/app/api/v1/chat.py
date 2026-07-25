"""Ollama chat proxy — serves the dashboard AI assistant."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import httpx, re

from app.api.v1.auth import get_current_user

router = APIRouter()

OLLAMA_URL = "http://ollama:11434"

# Page-navigation hints sent back to the frontend
NAV_MAP = {
    r"\b(home|dashboard|overview|snapshot)\b": "/",
    r"\b(client|account|brand|page)\b": "/admin/clients",
    r"\b(post|comment|listen|mention)\b": "/listening",
    r"\b(ticket|queue|reply|issue|complaint)\b": "/orm",
    r"\b(insight|analytic|chart|trend|graph)\b": "/analytics",
    r"\b(report|pdf|download|export)\b": "/reports",
    r"\b(import|upload|sheet|csv)\b": "/import",
    r"\b(setting|user|team|access|password)\b": "/admin/users",
}

SYSTEM_PROMPT = """You are the ORM CMS assistant — a helpful, concise AI for an Online Reputation Management dashboard.
The platform monitors social media comments, tracks sentiment (positive/negative/neutral), manages reply tickets, and generates reports.

Pages available:
- Home (/): daily sentiment snapshot, charts
- Clients & Accounts (/admin/clients): manage brands and social profiles
- Posts & Comments (/listening): view posts and their comments
- Reply Queue (/orm): open tickets needing a reply
- Insights (/analytics): sentiment trends and emotion charts
- Reports (/reports): downloadable PDF reports
- Import Data (/import): import from Google Sheets or CSV
- Settings (/admin/users): team and access management

Answer in 2–3 sentences. If the user asks about a specific section, end with "→ navigate:<path>" on its own line."""


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


def _detect_nav(text: str) -> str | None:
    lower = text.lower()
    for pattern, path in NAV_MAP.items():
        if re.search(pattern, lower):
            return path
    return None


async def _call_ollama(prompt: str, history: list[dict]) -> str:
    """Try Ollama; fall back to keyword response if unavailable."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history[-6:]:  # keep last 3 turns
        messages.append(h)
    messages.append({"role": "user", "content": prompt})

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Try llama3.2 first, then any available model
            for model in ["llama3.2:1b", "llama3.2", "llama3", "mistral", "phi3"]:
                try:
                    r = await client.post(f"{OLLAMA_URL}/api/chat", json={
                        "model": model,
                        "messages": messages,
                        "stream": False,
                    })
                    if r.status_code == 200:
                        return r.json()["message"]["content"]
                except Exception:
                    continue
    except Exception:
        pass

    # Keyword fallback when Ollama is offline
    low = prompt.lower()
    nav = _detect_nav(prompt)
    if "sentiment" in low or "feeling" in low or "happy" in low or "upset" in low:
        resp = "Sentiment shows the ratio of positive, negative, and neutral comments about your brand."
    elif "ticket" in low or "queue" in low or "reply" in low:
        resp = "The Reply Queue lists all comments flagged for a response, ordered by urgency."
    elif "report" in low:
        resp = "Reports are auto-generated PDFs covering daily, weekly, and monthly sentiment summaries."
    elif "import" in low:
        resp = "You can import posts from Google Sheets or CSV. Paste the sheet URL in Import Data."
    elif "crisis" in low or "risk" in low:
        resp = "The Crisis Score rises when negative/toxic comments spike. High = act immediately."
    else:
        resp = "I can help you navigate the dashboard — ask about sentiment, tickets, reports, or any section."

    if nav:
        resp += f"\n→ navigate:{nav}"
    return resp


@router.post("/")
async def chat(body: ChatRequest, _=Depends(get_current_user)):
    reply = await _call_ollama(body.message, body.history)

    # Extract navigation instruction if model included it
    nav = None
    nav_match = re.search(r"→\s*navigate:(\S+)", reply)
    if nav_match:
        nav = nav_match.group(1)
        reply = reply[:nav_match.start()].strip()
    else:
        nav = _detect_nav(body.message)

    return {"reply": reply, "navigate": nav}


@router.get("/status")
async def chat_status(_=Depends(get_current_user)):
    """Check if Ollama is reachable and which models are available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            if r.status_code == 200:
                models = [m["name"] for m in r.json().get("models", [])]
                return {"online": True, "models": models}
    except Exception:
        pass
    return {"online": False, "models": []}
