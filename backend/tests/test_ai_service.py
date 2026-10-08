import httpx
import pytest

from app.services import ai


class FakeResponse:
    def __init__(self, status_code: int, payload=None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def completion(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    return "test-key"


def test_api_key_reads_environment(key):
    assert ai.api_key() == "test-key"


def test_api_key_rejects_blank(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "   ")
    with pytest.raises(ai.AiNotConfigured):
        ai.api_key()


def test_api_key_rejects_missing(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ai.AiNotConfigured):
        ai.api_key()


def test_chat_sends_expected_request(monkeypatch, key):
    captured = {}

    def fake_post(url, json, headers, timeout):
        captured.update(url=url, json=json, headers=headers, timeout=timeout)
        return FakeResponse(200, completion("4"))

    monkeypatch.setattr(httpx, "post", fake_post)

    result = ai.chat([{"role": "user", "content": "2+2"}])

    assert result == "4"
    assert captured["url"] == f"{ai.OPENROUTER_BASE_URL}/chat/completions"
    assert captured["json"]["model"] == "openai/gpt-oss-120b"
    assert captured["json"]["messages"] == [{"role": "user", "content": "2+2"}]
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["timeout"] == ai.TIMEOUT_SECONDS


def test_chat_passes_optional_parameters(monkeypatch, key):
    captured = {}

    def fake_post(url, json, headers, timeout):
        captured.update(json=json)
        return FakeResponse(200, completion("ok"))

    monkeypatch.setattr(httpx, "post", fake_post)

    ai.chat(
        [{"role": "user", "content": "hi"}],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    assert captured["json"]["temperature"] == 0.2
    assert captured["json"]["response_format"] == {"type": "json_object"}


def test_chat_omits_optional_parameters_by_default(monkeypatch, key):
    captured = {}

    def fake_post(url, json, headers, timeout):
        captured.update(json=json)
        return FakeResponse(200, completion("ok"))

    monkeypatch.setattr(httpx, "post", fake_post)
    ai.chat([{"role": "user", "content": "hi"}])

    assert "temperature" not in captured["json"]
    assert "response_format" not in captured["json"]


def test_simple_chat_wraps_prompt_in_user_message(monkeypatch, key):
    captured = {}

    def fake_post(url, json, headers, timeout):
        captured.update(json=json)
        return FakeResponse(200, completion("Paris"))

    monkeypatch.setattr(httpx, "post", fake_post)

    assert ai.simple_chat("What is the capital of France?") == "Paris"
    assert captured["json"]["messages"] == [
        {"role": "user", "content": "What is the capital of France?"}
    ]


def test_chat_raises_client_error_without_retrying(monkeypatch, key):
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append(1)
        return FakeResponse(401, text="invalid key")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(ai.AiNotConfigured):
        ai.chat([{"role": "user", "content": "hi"}])

    assert len(calls) == 1


def test_rejected_key_reports_a_configuration_problem(monkeypatch, key):
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: FakeResponse(401, text="User not found.")
    )

    with pytest.raises(ai.AiNotConfigured, match="rejected"):
        ai.chat([{"role": "user", "content": "hi"}])


def test_forbidden_key_is_treated_as_a_configuration_problem(monkeypatch, key):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse(403, text="nope"))

    with pytest.raises(ai.AiNotConfigured):
        ai.chat([{"role": "user", "content": "hi"}])


def test_chat_retries_rate_limit_then_succeeds(monkeypatch, key):
    responses = [FakeResponse(429, text="slow down"), FakeResponse(200, completion("4"))]

    def fake_post(url, json, headers, timeout):
        return responses.pop(0)

    monkeypatch.setattr(httpx, "post", fake_post)

    assert ai.chat([{"role": "user", "content": "2+2"}]) == "4"


def test_chat_gives_up_after_max_attempts(monkeypatch, key):
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append(1)
        return FakeResponse(500, text="boom")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(ai.AiError, match="500"):
        ai.chat([{"role": "user", "content": "hi"}])

    assert len(calls) == ai.MAX_ATTEMPTS


def test_chat_retries_timeouts(monkeypatch, key):
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append(1)
        if len(calls) < ai.MAX_ATTEMPTS:
            raise httpx.TimeoutException("timed out")
        return FakeResponse(200, completion("recovered"))

    monkeypatch.setattr(httpx, "post", fake_post)

    assert ai.chat([{"role": "user", "content": "hi"}]) == "recovered"
    assert len(calls) == ai.MAX_ATTEMPTS


def test_chat_raises_when_timeouts_exhaust_retries(monkeypatch, key):
    def fake_post(url, json, headers, timeout):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(ai.AiError, match="after"):
        ai.chat([{"role": "user", "content": "hi"}])


def test_chat_rejects_malformed_success_body(monkeypatch, key):
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: FakeResponse(200, {"choices": []})
    )

    with pytest.raises(ai.AiError):
        ai.chat([{"role": "user", "content": "hi"}])


def test_chat_requires_api_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(ai.AiNotConfigured):
        ai.chat([{"role": "user", "content": "hi"}])


# --- shared board snapshot for service tests ----------------------------------

from app.serializers import board_out  # noqa: E402


@pytest.fixture
def snapshot(db):
    """A seeded board serialised the same way the endpoints pass it to the AI."""
    return board_out(db, 1)


# --- daily_summary -------------------------------------------------------------


def test_daily_summary_calls_simple_chat(monkeypatch, snapshot):
    captured = []

    def fake_chat(prompt):
        captured.append(prompt)
        return "Board is 60% complete."

    monkeypatch.setattr(ai, "simple_chat", fake_chat)
    assert ai.daily_summary(snapshot) == "Board is 60% complete."
    assert "Total cards:" in captured[0]


# --- card_intelligence ---------------------------------------------------------


def test_card_intelligence_sends_json_response(monkeypatch, snapshot):
    captured = {}

    def fake_chat(messages, **kwargs):
        captured["messages"] = messages
        captured["kwargs"] = kwargs
        return '{"result": "ok", "details": null, "priority": null, "duplicates": []}'

    monkeypatch.setattr(ai, "chat", fake_chat)
    result = ai.card_intelligence(snapshot, 1, "suggest_priority")
    assert result == {"result": "ok", "details": None, "priority": None, "duplicates": []}
    assert captured["kwargs"]["response_format"] == {"type": "json_object"}


def test_card_intelligence_uses_duplicate_context(monkeypatch, snapshot):
    captured = {}

    def fake_chat(messages, **kwargs):
        captured["prompt"] = messages[-1]["content"]
        return '{"result": "ok"}'

    monkeypatch.setattr(ai, "chat", fake_chat)
    ai.card_intelligence(snapshot, 1, "detect_duplicates")
    assert "Compare the card above" in captured["prompt"]


def test_card_intelligence_rejects_unknown_card(snapshot):
    with pytest.raises(ai.AiError, match="not found"):
        ai.card_intelligence(snapshot, 9999, "suggest_priority")


# --- workflow_optimization -----------------------------------------------------


def test_workflow_optimization_returns_parsed_json(monkeypatch, snapshot):
    def fake_chat(messages, **kwargs):
        return (
            '{"bottlenecks": [], "next_actions": [], "suggestions": [], "optimal_order": {}}'
        )

    monkeypatch.setattr(ai, "chat", fake_chat)
    result = ai.workflow_optimization(snapshot)
    assert result["bottlenecks"] == []
    assert result["next_actions"] == []


def test_workflow_optimization_raises_on_malformed(monkeypatch, snapshot):
    def fake_chat(messages, **kwargs):
        return "not json"

    monkeypatch.setattr(ai, "chat", fake_chat)
    with pytest.raises(ai.AiError):
        ai.workflow_optimization(snapshot)


# --- sprint_retrospective ------------------------------------------------------


def test_sprint_retrospective_returns_parsed_json(monkeypatch, snapshot):
    def fake_chat(messages, **kwargs):
        return '{"summary": "ok", "what_went_well": [], "what_to_improve": [], "actions": []}'

    monkeypatch.setattr(ai, "chat", fake_chat)
    result = ai.sprint_retrospective(snapshot)
    assert result["summary"] == "ok"
    assert result["what_went_well"] == []


# --- risk_assessment -----------------------------------------------------------


def test_risk_assessment_returns_parsed_json(monkeypatch, snapshot):
    def fake_chat(messages, **kwargs):
        return '{"summary": "ok", "risks": []}'

    monkeypatch.setattr(ai, "chat", fake_chat)
    result = ai.risk_assessment(snapshot)
    assert result["summary"] == "ok"
    assert result["risks"] == []


# --- effort_estimation ---------------------------------------------------------


def test_effort_estimation_returns_parsed_json(monkeypatch, snapshot):
    def fake_chat(messages, **kwargs):
        return '{"summary": "ok", "estimates": []}'

    monkeypatch.setattr(ai, "chat", fake_chat)
    result = ai.effort_estimation(snapshot)
    assert result["summary"] == "ok"
    assert result["estimates"] == []


# --- standup_points ------------------------------------------------------------


def test_standup_points_returns_parsed_json(monkeypatch, snapshot):
    def fake_chat(messages, **kwargs):
        return '{"summary": "ok", "points": [], "blockers": []}'

    monkeypatch.setattr(ai, "chat", fake_chat)
    result = ai.standup_points(snapshot)
    assert result["summary"] == "ok"
    assert result["points"] == []


# --- weekly_report -------------------------------------------------------------


def test_weekly_report_returns_parsed_json(monkeypatch, snapshot):
    def fake_chat(messages, **kwargs):
        return '{"summary": "ok", "completed": [], "in_progress": [], "up_next": [], "net_worth": ""}'

    monkeypatch.setattr(ai, "chat", fake_chat)
    result = ai.weekly_report(snapshot)
    assert result["summary"] == "ok"
    assert result["completed"] == []


# --- extract_json --------------------------------------------------------------


def test_extract_json_strips_code_fences():
    raw = "```json\n{\"result\": \"ok\"}\n```"
    assert ai.extract_json(raw) == {"result": "ok"}


def test_extract_json_rejects_non_json():
    with pytest.raises(ai.AiError):
        ai.extract_json("plain text")


# --- fetch_ai_news -------------------------------------------------------------


def test_fetch_ai_news_parses_rss(monkeypatch):
    rss = """<?xml version="1.0"?>
<rss><channel><item>
<title>AI breaks new ground</title>
<link>https://example.com/1</link>
<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
</item><item>
<title>Second story</title>
<link>https://example.com/2</link>
<pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
</item></channel></rss>"""

    class FakeResp:
        status_code = 200
        text = rss

        def raise_for_status(self):
            pass

    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResp())
    news = ai.fetch_ai_news()
    titles = [item["title"] for item in news]
    assert len(news) == 2
    assert "AI breaks new ground" in titles
    # Articles are sorted chronologically by publication date (newest first)
    assert news[0]["link"] == "https://example.com/2"
    assert news[0]["title"] == "Second story"
    assert news[1]["link"] == "https://example.com/1"
    assert news[1]["title"] == "AI breaks new ground"


def test_fetch_ai_news_empty_feed_returns_empty(monkeypatch):
    empty_rss = """<?xml version="1.0"?>
<rss><channel></channel></rss>"""

    class FakeResp:
        status_code = 200
        text = empty_rss

        def raise_for_status(self):
            pass

    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResp())
    assert ai.fetch_ai_news() == []