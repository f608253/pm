import json
import logging
import os
import random
from xml.etree import ElementTree as ET

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
            # A rejected key is a configuration problem, not a transient failure,
            # so surface it as such instead of retrying or reporting a gateway error.
            if response.status_code in (401, 403):
                raise AiNotConfigured(
                    "OpenRouter rejected OPENROUTER_API_KEY. Check the key."
                )
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
    {"type": "edit_card", "card_id": 1, "title": "...", "details": "...", "priority": "high"},
    {"type": "move_card", "card_id": 1, "column_id": 2, "position": 0},
    {"type": "delete_card", "card_id": 1}
  ]
}

Rules:
- Use only ids that appear in the board below.
- Omit "operations" entirely when no change is needed.
- "position" is a zero-based index within the target column; omit it to append.
- "priority" must be high, medium, or low.
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
                            "priority": card.priority,
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


def daily_summary(board) -> str:
    """Generate a daily summary of the Kanban board."""
    columns = []
    total_cards = 0
    done_cards = 0

    for column in board.columns:
        card_count = len(column.cards)
        total_cards += card_count
        if column.title.lower() in {"done", "completed", "finished"}:
            done_cards += card_count
        columns.append(
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
        )

    pending_cards = total_cards - done_cards
    completion_rate = (done_cards / total_cards * 100) if total_cards > 0 else 0

    prompt = f"""Generate a concise daily summary for this Kanban board.

Board: {board.title}
Total cards: {total_cards}
Completed cards: {done_cards}
Pending cards: {pending_cards}
Completion rate: {completion_rate:.1f}%

Columns:
{json.dumps(columns, indent=2)}

Write a brief, encouraging summary (3-5 sentences) covering:
1. Overall progress and completion rate
2. What's in progress
3. What still needs attention
4. One actionable suggestion for today

Keep it concise and actionable."""

    return simple_chat(prompt)


CARD_INTELLIGENCE_PROMPT = """You are a Kanban board assistant. Analyse one card and reply to a single task.

Task: {task}

Card:
{card_json}

Other cards on the board:
{columns_json}
{duplicate_context}

Reply with a single JSON object and nothing else:
{{
  "result": "one short sentence explaining your answer",
  "details": "the generated card details, or null",
  "priority": "high, medium, low, or null",
  "duplicates": [
    {{"card_id": 1, "title": "...", "similarity": "high|medium|low", "reason": "..."}}
  ]
}}

Rules:
- generate_details: put the finished card body in "details" as markdown bullet
  points. Start with a one line summary, then an "Acceptance criteria" list of
  concrete, checkable conditions. Leave "priority" and "duplicates" empty.
- suggest_priority: set "priority" from the card wording (blocking, security,
  customer facing, deadline words rank high) and the board state (cards blocking
  several others, or sitting in a late stage, rank higher). Leave "details" and
  "duplicates" empty.
- detect_duplicates: list only cards that describe the same work or overlap
  materially, each with a "reason". Use "similarity" high for a true duplicate,
  medium for substantial overlap, low for a weak match. Leave "details" and
  "priority" empty. If nothing overlaps, return an empty list.
- Use only card ids that appear above. Never invent ids."""


WORKFLOW_OPTIMIZATION_PROMPT = """You are a Kanban board workflow optimizer. Analyse the board and recommend what to do next.

Board:
{board_json}

Reply with a single JSON object and nothing else:
{{
  "bottlenecks": [
    {{"column_id": 1, "title": "...", "reason": "..."}}
  ],
  "next_actions": [
    {{"card_id": 1, "card_title": "...", "action": "..."}}
  ],
  "suggestions": [
    "a board level change worth making"
  ],
  "optimal_order": {{
    "1": [2, 5, 3]
  }}
}}

Rules:
- "next_actions": the single most useful next step for every card, in the order
  cards appear on the board. Keep each action to one imperative sentence. A card
  in the final column should be closed out or dropped. Never invent card ids.
- "bottlenecks": columns that are piling up, holding cards that block others, or
  holding cards that have clearly stalled. Give a concrete reason, not a
  restatement of the column title. Omit the list if no column is a bottleneck.
- "suggestions": board level improvements only, such as splitting an overloaded
  column or reordering the workflow. Skip anything a next action already covers.
- "optimal_order": maps a column id to the card ids in the order they should be
  worked, highest value or most blocking first. Only include a column when you
  would actually change its order, and never drop or invent a card id in the
  list you return for that column."""


def card_intelligence(board, card_id: int, task: str) -> dict:
    """Answer one card intelligence task about a single card."""
    # The board is a Pydantic snapshot with no back reference to the owning
    # column, so take the column from the search itself.
    column = next((col for col in board.columns if any(c.id == card_id for c in col.cards)), None)
    card = next((c for c in column.cards if c.id == card_id), None) if column else None
    if card is None:
        raise AiError(f"Card {card_id} not found")

    columns_json = json.dumps(
        [
            {
                "column_id": col.id,
                "title": col.title,
                "cards": [
                    {"card_id": c.id, "title": c.title, "details": c.details}
                    for c in col.cards
                    if c.id != card_id
                ],
            }
            for col in board.columns
        ],
        indent=2,
    )

    duplicate_context = ""
    if task == "detect_duplicates":
        duplicate_context = (
            "\nCompare the card above against every card listed and report real "
            "overlap only. Do not report a card that merely shares a word."
        )

    prompt = CARD_INTELLIGENCE_PROMPT.format(
        task=task,
        card_json=json.dumps(
            {
                "card_id": card.id,
                "title": card.title,
                "details": card.details,
                "priority": card.priority,
                "column_id": column.id,
                "column_title": column.title,
            },
            indent=2,
        ),
        columns_json=columns_json,
        duplicate_context=duplicate_context,
    )

    raw = chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return extract_json(raw)


def workflow_optimization(board) -> dict:
    """Recommend next actions, bottlenecks, and column ordering for a board."""
    board_json = json.dumps(
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
                            "priority": card.priority,
                        }
                        for card in column.cards
                    ],
                }
                for column in board.columns
            ],
        },
        indent=2,
    )

    prompt = WORKFLOW_OPTIMIZATION_PROMPT.format(board_json=board_json)
    raw = chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return extract_json(raw)


def board_json(board) -> str:
    """Render the board as indented JSON for prompts that need the full tree."""
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
                            "priority": card.priority,
                        }
                        for card in column.cards
                    ],
                }
                for column in board.columns
            ],
        },
        indent=2,
    )


def _json(board, prompt: str) -> dict:
    raw = chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return extract_json(raw)


RETROSPECTIVE_PROMPT = """You are a sprint retrospective assistant for a Kanban board.

Board:
{board_json}

Reply with a single JSON object and nothing else:
{{
  "summary": "two or three sentences on how the sprint went",
  "what_went_well": ["...", "..."],
  "what_to_improve": ["...", "..."],
  "actions": ["a concrete change for next sprint", "..."]
}}

Rules:
- Base every point on the board in front of you. If a column is empty, say so
  rather than inventing a reason.
- Keep each list item to one short sentence.
- "actions" are changes to the process, not tasks to do."""


def sprint_retrospective(board) -> dict:
    """Summarise how the sprint went and what to change next."""
    prompt = RETROSPECTIVE_PROMPT.format(board_json=board_json(board))
    return _json(board, prompt)


RISK_PROMPT = """You are a risk assessment assistant for a Kanban board.

Board:
{board_json}

Reply with a single JSON object and nothing else:
{{
  "summary": "one sentence on the biggest risks to the work",
  "risks": [
    {{"card_id": 1, "card_title": "...", "risk": "short risk name", "reason": "why"}}
  ]
}}

Rules:
- Only list cards that are NOT in the final column. Cards already finished are
  not risks.
- "risk" is a short label, such as "Blocked", "Unclear scope", or "Single point of failure".
- "reason" explains why it is risky, using the card's wording and position.
- Use only card ids that appear above. Never invent ids.
- If nothing is at risk, return an empty list."""


def risk_assessment(board) -> dict:
    """Identify risks in the pending work."""
    prompt = RISK_PROMPT.format(board_json=board_json(board))
    return _json(board, prompt)


EFFORT_PROMPT = """You are an estimation assistant for a Kanban board.

Board:
{board_json}

Reply with a single JSON object and nothing else:
{{
  "summary": "one sentence on how the remaining work breaks down",
  "estimates": [
    {{"card_id": 1, "card_title": "...", "effort": "S|M|L", "hint": "why this size"}}
  ]
}}

Rules:
- Only estimate cards that are NOT in the final column.
- "effort" is one of S (a few hours), M (a day or two), or L (a week or more).
- "hint" gives a short reason based on the card's wording and dependencies.
- Use only card ids that appear above. Never invent ids.
- If nothing remains, return an empty list."""


def effort_estimation(board) -> dict:
    """Give size hints for the remaining work."""
    prompt = EFFORT_PROMPT.format(board_json=board_json(board))
    return _json(board, prompt)


STANDUP_PROMPT = """You are a standup assistant for a Kanban board.

Board:
{board_json}

Reply with a single JSON object and nothing else:
{{
  "summary": "one sentence on where the team stands today",
  "points": ["what I did", "..."],
  "blockers": ["what is stopping me", "..."]
}}

Rules:
- "points" are talking points drawn from the board, one per person is fine;
  phrase them as first person statements about real cards.
- "blockers" only when a card is genuinely stuck. Leave the list empty if
  nothing is blocked.
- Use only card ids that appear above. Never invent ids."""


def standup_points(board) -> dict:
    """Generate standup talking points from the current board."""
    prompt = STANDUP_PROMPT.format(board_json=board_json(board))
    return _json(board, prompt)


WEEKLY_PROMPT = """You are a weekly progress report assistant for a Kanban board.

Board:
{board_json}

Reply with a single JSON object and nothing else:
{{
  "summary": "two or three sentences on the week's progress",
  "completed": ["...", "..."],
  "in_progress": ["...", "..."],
  "up_next": ["...", "..."],
  "net_worth": "one sentence on the net effect of the week's work"
}}

Rules:
- "completed" lists cards in the final column.
- "in_progress" lists cards being worked on now.
- "up_next" lists what should happen next, in priority order.
- Keep each item to one short sentence naming the card.
- Use only card ids that appear above. Never invent ids."""


def weekly_report(board) -> dict:
    """Produce a weekly progress report from the board."""
    prompt = WEEKLY_PROMPT.format(board_json=board_json(board))
    return _json(board, prompt)


NEWS_FEED_URL = "https://techcrunch.com/category/artificial-intelligence/feed/"


def fetch_ai_news(randomize: bool = False) -> list[dict[str, str]]:
    """Fetch latest AI news from a public RSS feed."""
    headers = {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    try:
        response = httpx.get(NEWS_FEED_URL, follow_redirects=True, timeout=10, headers=headers)
        response.raise_for_status()
    except httpx.HTTPError as err:
        raise AiError(f"Failed to fetch AI news feed: {err}") from err

    try:
        root = ET.fromstring(response.text)
    except ET.ParseError as err:
        raise AiError(f"Failed to parse AI news feed XML: {err}") from err

    items = root.findall(".//item")
    news: list[dict[str, str]] = []
    for item in items:
        title = item.find("title")
        link = item.find("link")
        pub_date = item.find("pubDate")
        news.append(
            {
                "title": (title.text or "").strip(),
                "link": (link.text or "").strip(),
                "published": (pub_date.text or "").strip(),
            }
        )

    # Sort chronologically by publication date (newest first)
    def parse_pub_date(item: dict[str, str]):
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(item["published"])
        except Exception:
            return None

    news.sort(key=lambda x: parse_pub_date(x) or "", reverse=True)

    if randomize:
        import random
        random.shuffle(news)

    return news[:3]