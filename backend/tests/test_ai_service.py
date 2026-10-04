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

    with pytest.raises(ai.AiError, match="401"):
        ai.chat([{"role": "user", "content": "hi"}])

    assert len(calls) == 1


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