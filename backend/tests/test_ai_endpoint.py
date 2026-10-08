from app.services import ai


def test_requires_authentication(client):
    response = client.post("/api/ai/test", json={"prompt": "2+2"})
    assert response.status_code == 401


def test_news_requires_authentication(client):
    response = client.get("/api/ai/news")
    assert response.status_code == 401


def test_news_returns_items(auth_client, monkeypatch):
    fake_items = [
        {"title": "Test story", "link": "https://example.com/1", "published": "Mon, 01 Jan 2024 00:00:00 GMT"}
    ]
    monkeypatch.setattr(ai, "fetch_ai_news", lambda randomize=False: fake_items)

    response = auth_client.get("/api/ai/news")

    assert response.status_code == 200
    assert response.json() == {"items": fake_items}


def test_news_provider_error_returns_502(auth_client, monkeypatch):
    def raise_provider(randomize=False):
        raise ai.AiError("feed unavailable")

    monkeypatch.setattr(ai, "fetch_ai_news", raise_provider)

    response = auth_client.get("/api/ai/news")

    assert response.status_code == 502
    assert "feed unavailable" in response.json()["detail"]


def test_rejects_empty_prompt(auth_client):
    response = auth_client.post("/api/ai/test", json={"prompt": ""})
    assert response.status_code == 422


def test_returns_ai_response(auth_client, monkeypatch):
    monkeypatch.setattr(ai, "simple_chat", lambda prompt: "4")

    response = auth_client.post("/api/ai/test", json={"prompt": "2+2"})

    assert response.status_code == 200
    assert response.json() == {"response": "4", "model": "openai/gpt-oss-120b"}


def test_missing_key_returns_503(auth_client, monkeypatch):
    def raise_missing(prompt):
        raise ai.AiNotConfigured("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "simple_chat", raise_missing)

    response = auth_client.post("/api/ai/test", json={"prompt": "2+2"})

    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_provider_error_returns_502(auth_client, monkeypatch):
    def raise_provider(prompt):
        raise ai.AiError("AI provider returned 401: invalid key")

    monkeypatch.setattr(ai, "simple_chat", raise_provider)

    response = auth_client.post("/api/ai/test", json={"prompt": "2+2"})

    assert response.status_code == 502
    assert "invalid key" in response.json()["detail"]


def test_summary_requires_authentication(client):
    response = client.post("/api/ai/summary", json={"board_id": 1})
    assert response.status_code == 401


def test_summary_returns_text(auth_client, monkeypatch):
    monkeypatch.setattr(ai, "daily_summary", lambda board: "Board is 60% complete.")

    response = auth_client.post("/api/ai/summary", json={"board_id": 1})

    assert response.status_code == 200
    assert response.json() == {"summary": "Board is 60% complete."}


def test_summary_missing_key_returns_503(auth_client, monkeypatch):
    def raise_missing(board):
        raise ai.AiNotConfigured("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "daily_summary", raise_missing)

    response = auth_client.post("/api/ai/summary", json={"board_id": 1})

    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_summary_provider_error_returns_502(auth_client, monkeypatch):
    def raise_provider(board):
        raise ai.AiError("model unavailable")

    monkeypatch.setattr(ai, "daily_summary", raise_provider)

    response = auth_client.post("/api/ai/summary", json={"board_id": 1})

    assert response.status_code == 502
    assert "model unavailable" in response.json()["detail"]