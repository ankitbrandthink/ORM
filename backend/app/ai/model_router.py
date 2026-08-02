"""Routes task types to Ollama models, with a fallback chain."""
from app.config import settings

# task_type -> ordered model preference (primary then fallbacks)
ROUTING = {
    "post_analysis": ["llama3", "qwen", "mistral"],
    "comment_analysis": ["qwen", "llama3", "mistral"],
    "response_generation": ["llama3", "mistral", "deepseek"],
    "default": [settings.OLLAMA_DEFAULT_MODEL, settings.OLLAMA_FALLBACK_MODEL],
}


def model_chain(task_type: str) -> list[str]:
    return ROUTING.get(task_type, ROUTING["default"])
