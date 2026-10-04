import json
import logging
import os

import httpx

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = "openai/gpt-oss-120b"
TIMEOUT_SECONDS = 60.0
MAX_ATTEMPTS = 3

logger = logging.getLogger(__name__)


class AiError(Exception):
    """Raised when the AI provider cannot be reached or returns an error."""


class AiNotConfigured(AiError):
    """Raised when OPENROUTER_API_KEY is absent."""


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise AiNotConfigured("OPENROUTER_API_KEY is not set")
    return key


def chat(
    messages: list[dict[str, str]],
    *,
    temperature: float | None = None,
    response_format: dict | None = None,
) -> str:
    """Send a chat completion request to OpenRouter and return the text reply."""
    key = api_key()
    payload: dict = {"model": MODEL, "messages": messages}
    if temperature is not None:
        payload["temperature"] = temperature
    if response_format is not None:
        payload["response_format"] = response_format

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "Kanban Studio",
    }

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = httpx.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                json=payload,
                headers=headers,
                timeout=TIMEOUT_SECONDS,
            )
        except (httpx.HTTPError, ValueError) as err:
            last_error = err
            logger.warning("AI request attempt %s failed: %s", attempt, err)
            continue

        if response.status_code >= 400:
            detail = f"AI provider returned {response.status_code}: {response.text[:200]}"
            # A 4xx other than rate limiting will not change on retry.
            if 400 <= response.status_code < 500 and response.status_code != 429:
                raise AiError(detail)
            last_error = AiError(detail)
            logger.warning("AI request attempt %s failed: %s", attempt, detail)
            continue

        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as err:
            last_error = err
            logger.warning("AI request attempt %s returned an unusable body: %s", attempt, err)
            continue

        logger.info("AI request succeeded on attempt %s", attempt)
        return content

    raise AiError(f"AI request failed after {MAX_ATTEMPTS} attempts: {last_error}")


def simple_chat(prompt: str) -> str:
    return chat([{"role": "user", "content": prompt}])


SYSTEM_PREAMBLE = """You are the assistant for a Kanban board. You can answer
questions about the board and propose changes to it.

Reply with a single JSON object and nothing else:
{
  "response": "your reply to the user, in plain text",
  "operations": [
    {"type": "add_card", "column_id": 1, "title": "...", "details": "..."},
    {"type": "edit_card", "card_id": 1, "title": "...", "details": "..."},
    {"type": "move_card", "card_id": 1, "column_id": 2, "position": 0},
    {"type": "delete_card", "card_id": 1}
  ]
}

Rules:
- Use only ids that appear in the board below.
- Omit "operations" entirely when no change is needed.
- "position" is a zero-based index within the target column; omit it to append.
- Do not invent ids. If the request cannot be done, explain why in "response"."""


def board_context(board) -> str:
    """Render the board as compact JSON the model can reason about."""
    return json.dumps(
        {
            "board_id": board.id,
            "title": board.title,
            "columns": [
                {
                    "column_id": column.id,
                    "title": column.title,
                    "cards": [
                        {
                            "card_id": card.id,
                            "title": card.title,
                            "details": card.details,
                        }
                        for card in column.cards
                    ],
                }
                for column in board.columns
            ],
        }
    )


def extract_json(raw: str) -> dict:
    """Pull the JSON object out of a model reply, tolerating code fences."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[: -len("```")]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise AiError("Model reply was not JSON")
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError as err:
        raise AiError(f"Model reply was not valid JSON: {err}") from err
    if not isinstance(parsed, dict):
        raise AiError("Model reply was not a JSON object")
    return parsed


def chat_with_board(board, question: str, history: list[dict[str, str]]) -> dict:
    """Ask the model about a board and return its parsed JSON reply."""
    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": f"{SYSTEM_PREAMBLE}\n\nCurrent board:\n{board_context(board)}",
        }
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": question})

    raw = chat(messages, temperature=0.2, response_format={"type": "json_object"})
    return extract_json(raw)