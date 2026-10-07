from app.services import ai


def board_id(auth_client) -> int:
    return auth_client.get("/api/boards").json()[0]["id"]


def stub(monkeypatch, func_name, result):
    """Replace an AI service function with a stub returning ``result``."""
    monkeypatch.setattr(ai, func_name, lambda *a, **k: result)


# --- shared auth / ownership tests --------------------------------------------


def test_retrospective_requires_authentication(client):
    assert client.post("/api/ai/retrospective", json={"board_id": 1}).status_code == 401


def test_risk_assessment_requires_authentication(client):
    assert client.post("/api/ai/risk-assessment", json={"board_id": 1}).status_code == 401


def test_effort_estimation_requires_authentication(client):
    assert client.post("/api/ai/effort-estimation", json={"board_id": 1}).status_code == 401


def test_standup_requires_authentication(client):
    assert client.post("/api/ai/standup", json={"board_id": 1}).status_code == 401


def test_weekly_report_requires_authentication(client):
    assert client.post("/api/ai/weekly-report", json={"board_id": 1}).status_code == 401


def test_retrospective_rejects_unknown_board(auth_client):
    assert auth_client.post(
        "/api/ai/retrospective", json={"board_id": 9999}
    ).status_code == 404


def test_risk_assessment_rejects_unknown_board(auth_client):
    assert auth_client.post(
        "/api/ai/risk-assessment", json={"board_id": 9999}
    ).status_code == 404


def test_effort_estimation_rejects_unknown_board(auth_client):
    assert auth_client.post(
        "/api/ai/effort-estimation", json={"board_id": 9999}
    ).status_code == 404


def test_standup_rejects_unknown_board(auth_client):
    assert auth_client.post("/api/ai/standup", json={"board_id": 9999}).status_code == 404


def test_weekly_report_rejects_unknown_board(auth_client):
    assert auth_client.post(
        "/api/ai/weekly-report", json={"board_id": 9999}
    ).status_code == 404


def test_retrospective_rejects_another_users_board(auth_client, intruder, db, monkeypatch):
    from app.models import Board

    other = Board(user_id=intruder.id, title="Not yours")
    db.add(other)
    db.commit()
    db.refresh(other)
    stub(monkeypatch, "sprint_retrospective", {"summary": "nope"})

    response = auth_client.post("/api/ai/retrospective", json={"board_id": other.id})
    assert response.status_code == 403


def test_risk_assessment_rejects_another_users_board(auth_client, intruder, db, monkeypatch):
    from app.models import Board

    other = Board(user_id=intruder.id, title="Not yours")
    db.add(other)
    db.commit()
    db.refresh(other)
    stub(monkeypatch, "risk_assessment", {"summary": "nope"})

    response = auth_client.post("/api/ai/risk-assessment", json={"board_id": other.id})
    assert response.status_code == 403


def test_effort_estimation_rejects_another_users_board(auth_client, intruder, db, monkeypatch):
    from app.models import Board

    other = Board(user_id=intruder.id, title="Not yours")
    db.add(other)
    db.commit()
    db.refresh(other)
    stub(monkeypatch, "effort_estimation", {"summary": "nope"})

    response = auth_client.post("/api/ai/effort-estimation", json={"board_id": other.id})
    assert response.status_code == 403


def test_standup_rejects_another_users_board(auth_client, intruder, db, monkeypatch):
    from app.models import Board

    other = Board(user_id=intruder.id, title="Not yours")
    db.add(other)
    db.commit()
    db.refresh(other)
    stub(monkeypatch, "standup_points", {"summary": "nope"})

    response = auth_client.post("/api/ai/standup", json={"board_id": other.id})
    assert response.status_code == 403


def test_weekly_report_rejects_another_users_board(auth_client, intruder, db, monkeypatch):
    from app.models import Board

    other = Board(user_id=intruder.id, title="Not yours")
    db.add(other)
    db.commit()
    db.refresh(other)
    stub(monkeypatch, "weekly_report", {"summary": "nope"})

    response = auth_client.post("/api/ai/weekly-report", json={"board_id": other.id})
    assert response.status_code == 403


# --- happy paths ---------------------------------------------------------------


def test_retrospective_returns_response(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        "sprint_retrospective",
        {
            "summary": "Sprint went well.",
            "what_went_well": ["Good teamwork"],
            "what_to_improve": ["Better estimation"],
            "actions": ["Split large tasks"],
        },
    )

    response = auth_client.post("/api/ai/retrospective", json={"board_id": board})

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "Sprint went well."
    assert body["what_went_well"] == ["Good teamwork"]
    assert body["what_to_improve"] == ["Better estimation"]
    assert body["actions"] == ["Split large tasks"]


def test_risk_assessment_returns_response(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        "risk_assessment",
        {
            "summary": "Two risks identified.",
            "risks": [
                {
                    "card_id": 1,
                    "card_title": "Align roadmap themes",
                    "risk": "Unclear scope",
                    "reason": "No acceptance criteria.",
                }
            ],
        },
    )

    response = auth_client.post("/api/ai/risk-assessment", json={"board_id": board})

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "Two risks identified."
    assert len(body["risks"]) == 1
    assert body["risks"][0]["risk"] == "Unclear scope"


def test_risk_assessment_drops_invented_card_ids(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        "risk_assessment",
        {
            "summary": "ok",
            "risks": [
                {"card_id": 9999, "card_title": "Hallucinated", "risk": "Fake", "reason": "x"}
            ],
        },
    )

    response = auth_client.post("/api/ai/risk-assessment", json={"board_id": board})

    assert response.status_code == 200
    assert response.json()["risks"] == []


def test_effort_estimation_returns_response(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        "effort_estimation",
        {
            "summary": "Workload is light.",
            "estimates": [
                {"card_id": 1, "card_title": "Align roadmap themes", "effort": "M", "hint": "Needs research"}
            ],
        },
    )

    response = auth_client.post("/api/ai/effort-estimation", json={"board_id": board})

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "Workload is light."
    assert len(body["estimates"]) == 1
    assert body["estimates"][0]["effort"] == "M"


def test_effort_estimation_drops_invented_card_ids(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        "effort_estimation",
        {
            "summary": "ok",
            "estimates": [
                {"card_id": 9999, "card_title": "Fake", "effort": "L", "hint": "x"}
            ],
        },
    )

    response = auth_client.post("/api/ai/effort-estimation", json={"board_id": board})

    assert response.status_code == 200
    assert response.json()["estimates"] == []


def test_standup_returns_response(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        "standup_points",
        {
            "summary": "Team is making progress.",
            "points": ["Working on alignment"],
            "blockers": ["Waiting on API"],
        },
    )

    response = auth_client.post("/api/ai/standup", json={"board_id": board})

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "Team is making progress."
    assert body["points"] == ["Working on alignment"]
    assert body["blockers"] == ["Waiting on API"]


def test_standup_drops_invented_card_ids(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        "standup_points",
        {
            "summary": "ok",
            "points": [],
            "blockers": [],
        },
    )

    response = auth_client.post("/api/ai/standup", json={"board_id": board})

    assert response.status_code == 200
    assert response.json()["points"] == []


def test_weekly_report_returns_response(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        "weekly_report",
        {
            "summary": "Good week.",
            "completed": ["Align roadmap themes"],
            "in_progress": ["Gather customer signals"],
            "up_next": ["Design card layout"],
            "net_worth": "Net positive.",
        },
    )

    response = auth_client.post("/api/ai/weekly-report", json={"board_id": board})

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "Good week."
    assert body["completed"] == ["Align roadmap themes"]
    assert body["up_next"] == ["Design card layout"]
    assert body["net_worth"] == "Net positive."


# --- error handling ------------------------------------------------------------


def test_retrospective_provider_error_returns_502(auth_client, monkeypatch):
    board = board_id(auth_client)

    def raise_provider(b):
        raise ai.AiError("model unavailable")

    monkeypatch.setattr(ai, "sprint_retrospective", raise_provider)

    response = auth_client.post("/api/ai/retrospective", json={"board_id": board})
    assert response.status_code == 502


def test_risk_assessment_missing_key_returns_503(auth_client, monkeypatch):
    board = board_id(auth_client)

    def raise_missing(b):
        raise ai.AiNotConfigured("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "risk_assessment", raise_missing)

    response = auth_client.post("/api/ai/risk-assessment", json={"board_id": board})
    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_effort_estimation_provider_error_returns_502(auth_client, monkeypatch):
    board = board_id(auth_client)

    def raise_provider(b):
        raise ai.AiError("model unavailable")

    monkeypatch.setattr(ai, "effort_estimation", raise_provider)

    response = auth_client.post("/api/ai/effort-estimation", json={"board_id": board})
    assert response.status_code == 502


def test_standup_missing_key_returns_503(auth_client, monkeypatch):
    board = board_id(auth_client)

    def raise_missing(b):
        raise ai.AiNotConfigured("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "standup_points", raise_missing)

    response = auth_client.post("/api/ai/standup", json={"board_id": board})
    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_weekly_report_provider_error_returns_502(auth_client, monkeypatch):
    board = board_id(auth_client)

    def raise_provider(b):
        raise ai.AiError("model unavailable")

    monkeypatch.setattr(ai, "weekly_report", raise_provider)

    response = auth_client.post("/api/ai/weekly-report", json={"board_id": board})
    assert response.status_code == 502
