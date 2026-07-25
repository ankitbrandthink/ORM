"""Static catalog of all supported AI providers — used by both backend and frontend."""
from .claude import ClaudeProvider
from .groq_provider import GroqProvider
from .gemini import GeminiProvider
from .openai_provider import OpenAIProvider
from .base import BaseProvider

PROVIDERS: dict[str, BaseProvider] = {
    "claude": ClaudeProvider(),
    "groq":   GroqProvider(),
    "gemini": GeminiProvider(),
    "openai": OpenAIProvider(),
}

PROVIDER_CATALOG = [
    {
        "id": "claude",
        "name": "Anthropic Claude",
        "get_key_url": "https://platform.claude.com/settings/keys",
        "models": [
            {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku — fastest · $0.80/1M in", "input_price": 0.80, "output_price": 4.00,  "free_daily": 0},
            {"id": "claude-sonnet-4-6",          "name": "Claude Sonnet — smarter · $3/1M in",  "input_price": 3.00, "output_price": 15.00, "free_daily": 0},
        ],
    },
    {
        "id": "groq",
        "name": "Groq (Free tier: 14,400 req/day)",
        "get_key_url": "https://console.groq.com/keys",
        "models": [
            {"id": "llama-3.1-8b-instant",    "name": "Llama 3.1 8B — free 14,400/day",  "input_price": 0.05, "output_price": 0.08, "free_daily": 14400},
            {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B — smarter",          "input_price": 0.59, "output_price": 0.79, "free_daily": 0},
        ],
    },
    {
        "id": "gemini",
        "name": "Google Gemini (Free tier: 1,500 req/day)",
        "get_key_url": "https://aistudio.google.com/app/apikey",
        "models": [
            {"id": "gemini-2.0-flash-lite", "name": "Gemini 2.0 Flash Lite — free 1,500/day", "input_price": 0.075, "output_price": 0.30, "free_daily": 1500},
            {"id": "gemini-2.0-flash",      "name": "Gemini 2.0 Flash — faster",              "input_price": 0.10,  "output_price": 0.40, "free_daily": 1500},
        ],
    },
    {
        "id": "openai",
        "name": "OpenAI",
        "get_key_url": "https://platform.openai.com/api-keys",
        "models": [
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini — $0.15/1M in",    "input_price": 0.15, "output_price": 0.60,  "free_daily": 0},
            {"id": "gpt-4o",      "name": "GPT-4o — powerful · $2.50/1M", "input_price": 2.50, "output_price": 10.00, "free_daily": 0},
        ],
    },
]
