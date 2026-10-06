import pytest

from app.services import ai


def board_id(auth_client) -> int:
    return auth_client.get("/api/boards").json()[0]["id"]


def card_id(auth_client, board: int, title: str) -> int:
    payload = auth_client.get(f"/api/boards/{board}").json()
    for column in payload["columns"]:
        for card in column["cards"]:
            if card["title"] == title:
                return card["id"]
    raise AssertionError(f"no seeded card titled {title!r}")


@pytest.fixture
def card(auth_client):
    board = board_id(auth_client)
    return board, card_id(auth_client, board, "Prototype analytics view")


def stub(monkeypatch, payload: dict):
    monkeypatch.setattr(ai, "card_intelligence", lambda board, card_id, task: payload)
    monkeypatch.setattr(ai, "workflow_optimization", lambda board: payload)


# --- card intelligence ------------------------------------------------------


def test_card_intelligence_requires_authentication(client):
    response = client.post(
        "/api/ai/card-intelligence",
        json={"board_id": 1, "card_id": 1, "task": "suggest_priority"},
    )
    assert response.status_code == 401


def test_card_intelligence_rejects_unknown_task(auth_client, card):
    board, cid = card
    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": board, "card_id": cid, "task": "make_coffee"},
    )
    assert response.status_code == 422


def test_card_intelligence_rejects_unknown_board(auth_client, card):
    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": 9999, "card_id": card[1], "task": "generate_details"},
    )
    assert response.status_code == 404


def test_card_intelligence_rejects_another_users_board(auth_client, intruder, db, card, monkeypatch):
    from app.models import Board

    other = Board(user_id=intruder.id, title="Not yours")
    db.add(other)
    db.commit()
    db.refresh(other)
    stub(monkeypatch, {"result": "should not be reached"})

    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": other.id, "card_id": card[1], "task": "generate_details"},
    )

    assert response.status_code == 403


def test_generate_details_returns_acceptance_criteria(auth_client, card, monkeypatch):
    board, cid = card
    stub(
        monkeypatch,
        {
            "result": "Drafted a body and acceptance criteria.",
            "details": "Summary\n- Acceptance criteria: dashboard renders",
        },
    )

    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": board, "card_id": cid, "task": "generate_details"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["details"].startswith("Summary")
    assert "Acceptance criteria" in body["details"]
    assert body["duplicates"] == []


def test_suggest_priority_returns_priority(auth_client, card, monkeypatch):
    board, cid = card
    stub(monkeypatch, {"result": "Blocks the review stage.", "priority": "high"})

    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": board, "card_id": cid, "task": "suggest_priority"},
    )

    assert response.status_code == 200
    assert response.json()["priority"] == "high"


def test_unrecognised_priority_is_dropped(auth_client, card, monkeypatch):
    board, cid = card
    stub(monkeypatch, {"result": "Unclear.", "priority": "urgent"})

    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": board, "card_id": cid, "task": "suggest_priority"},
    )

    assert response.status_code == 200
    assert response.json()["priority"] is None


def test_detect_duplicates_returns_matches(auth_client, card, monkeypatch):
    board, cid = card
    stub(
        monkeypatch,
        {
            "result": "Two cards overlap.",
            "duplicates": [
                {"card_id": cid, "title": "Prototype analytics view", "similarity": "high", "reason": "same"},
                {"card_id": 4242, "title": "Invented", "similarity": "high", "reason": "hallucinated"},
            ],
        },
    )

    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": board, "card_id": cid, "task": "detect_duplicates"},
    )

    assert response.status_code == 200
    duplicates = response.json()["duplicates"]
    # The invented id is dropped; the real one is kept.
    assert [d["card_id"] for d in duplicates] == [cid]
    assert duplicates[0]["similarity"] == "high"


def test_duplicates_default_to_empty(auth_client, card, monkeypatch):
    board, cid = card
    stub(monkeypatch, {"result": "Nothing overlaps."})

    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": board, "card_id": cid, "task": "detect_duplicates"},
    )

    assert response.status_code == 200
    assert response.json()["duplicates"] == []


def test_card_intelligence_provider_error_returns_502(auth_client, card, monkeypatch):
    board, cid = card

    def raise_provider(b, c, task):
        raise ai.AiError("model unavailable")

    monkeypatch.setattr(ai, "card_intelligence", raise_provider)

    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": board, "card_id": cid, "task": "generate_details"},
    )

    assert response.status_code == 502


def test_card_intelligence_missing_key_returns_503(auth_client, card, monkeypatch):
    board, cid = card

    def raise_missing(b, c, task):
        raise ai.AiNotConfigured("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "card_intelligence", raise_missing)

    response = auth_client.post(
        "/api/ai/card-intelligence",
        json={"board_id": board, "card_id": cid, "task": "generate_details"},
    )

    assert response.status_code == 503


def test_service_rejects_unknown_card(db, monkeypatch):
    from sqlalchemy import select

    from app.models import Board
    from app.serializers import board_out

    board = db.scalar(select(Board))
    snapshot = board_out(db, board.id)

    with pytest.raises(ai.AiError, match="not found"):
        ai.card_intelligence(snapshot, 9999, "suggest_priority")


# --- workflow optimization --------------------------------------------------


def test_workflow_requires_authentication(client):
    assert client.post("/api/ai/workflow-optimization", json={"board_id": 1}).status_code == 401


def test_workflow_returns_next_actions(auth_client, monkeypatch):
    board = board_id(auth_client)
    target = card_id(auth_client, board, "Refine status language")
    stub(
        monkeypatch,
        {
            "next_actions": [
                {"card_id": target, "action": "Draft the standard and post it."}
            ],
            "bottlenecks": [],
            "suggestions": [],
            "optimal_order": {},
        },
    )

    response = auth_client.post("/api/ai/workflow-optimization", json={"board_id": board})

    assert response.status_code == 200
    action = response.json()["next_actions"][0]
    assert action["card_id"] == target
    # The card title is resolved from the board, not trusted from the model.
    assert action["card_title"] == "Refine status language"
    assert action["action"] == "Draft the standard and post it."


def test_workflow_drops_invented_card_ids(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(
        monkeypatch,
        {"next_actions": [{"card_id": 4242, "action": "hallucinated"}]},
    )

    response = auth_client.post("/api/ai/workflow-optimization", json={"board_id": board})

    assert response.status_code == 200
    assert response.json()["next_actions"] == []


def test_workflow_returns_bottlenecks(auth_client, monkeypatch):
    board = board_id(auth_client)
    columns = auth_client.get(f"/api/boards/{board}").json()["columns"]
    review = next(c for c in columns if c["title"] == "Review")
    stub(
        monkeypatch,
        {
            "bottlenecks": [
                {"column_id": review["id"], "reason": "Two cards waiting on sign off."}
            ]
        },
    )

    response = auth_client.post("/api/ai/workflow-optimization", json={"board_id": board})

    assert response.status_code == 200
    bottleneck = response.json()["bottlenecks"][0]
    assert bottleneck["column_id"] == review["id"]
    # Title falls back to the real column title when the model omits it.
    assert bottleneck["title"] == "Review"
    assert "sign off" in bottleneck["reason"]


def test_workflow_drops_invented_columns(auth_client, monkeypatch):
    board = board_id(auth_client)
    stub(monkeypatch, {"bottlenecks": [{"column_id": 4242, "title": "Nope", "reason": "x"}]})

    response = auth_client.post("/api/ai/workflow-optimization", json={"board_id": board})

    assert response.status_code == 200
    assert response.json()["bottlenecks"] == []


def test_workflow_keeps_a_valid_reordering(auth_client, monkeypatch):
    board = board_id(auth_client)
    columns = auth_client.get(f"/api/boards/{board}").json()["columns"]
    review = next(c for c in columns if c["title"] == "Review")
    reversed_ids = [c["id"] for c in reversed(review["cards"])]
    stub(monkeypatch, {"optimal_order": {str(review["id"]): reversed_ids}})

    response = auth_client.post("/api/ai/workflow-optimization", json={"board_id": board})

    assert response.status_code == 200
    # JSON object keys are always strings on the wire.
    assert response.json()["optimal_order"] == {str(review["id"]): reversed_ids}


def test_workflow_drops_a_reordering_that_drops_a_card(auth_client, monkeypatch):
    board = board_id(auth_client)
    columns = auth_client.get(f"/api/boards/{board}").json()["columns"]
    backlog = next(c for c in columns if c["title"] == "Backlog")
    stub(monkeypatch, {"optimal_order": {str(backlog["id"]): [backlog["cards"][0]["id"]]}})

    response = auth_client.post("/api/ai/workflow-optimization", json={"board_id": board})

    assert response.status_code == 200
    # Dropping a card would silently delete it from the user's column.
    assert response.json()["optimal_order"] == {}


def test_workflow_rejects_another_users_board(auth_client, intruder, db, monkeypatch):
    from app.models import Board

    other = Board(user_id=intruder.id, title="Not yours")
    db.add(other)
    db.commit()
    db.refresh(other)
    stub(monkeypatch, {"next_actions": []})

    response = auth_client.post("/api/ai/workflow-optimization", json={"board_id": other.id})

    assert response.status_code == 403


def test_workflow_rejects_unknown_board(auth_client):
    assert auth_client.post(
        "/api/ai/workflow-optimization", json={"board_id": 9999}
    ).status_code == 404


def test_workflow_provider_error_returns_502(auth_client, monkeypatch):
    board = board_id(auth_client)

    def raise_provider(b):
        raise ai.AiError("model unavailable")

    monkeypatch.setattr(ai, "workflow_optimization", raise_provider)

    assert auth_client.post(
        "/api/ai/workflow-optimization", json={"board_id": board}
    ).status_code == 502


def test_workflow_missing_key_returns_503(auth_client, monkeypatch):
    board = board_id(auth_client)

    def raise_missing(b):
        raise ai.AiNotConfigured("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "workflow_optimization", raise_missing)

    assert auth_client.post(
        "/api/ai/workflow-optimization", json={"board_id": board}
    ).status_code == 503


# --- priority persistence ---------------------------------------------------


def test_board_returns_card_priority(auth_client):
    board = board_id(auth_client)
    card = auth_client.get(f"/api/boards/{board}").json()["columns"][0]["cards"][0]
    assert card["priority"] == "medium"


def test_patch_card_persists_priority(auth_client, db):
    from sqlalchemy import select

    from app.models import Card

    board = board_id(auth_client)
    target = card_id(auth_client, board, "Gather customer signals")

    response = auth_client.patch(f"/api/cards/{target}", json={"priority": "high"})

    assert response.status_code == 200
    assert response.json()["priority"] == "high"
    db.expire_all()
    assert db.scalar(select(Card).where(Card.id == target)).priority == "high"


def test_patch_card_rejects_unknown_priority(auth_client):
    board = board_id(auth_client)
    target = card_id(auth_client, board, "Gather customer signals")
    response = auth_client.patch(f"/api/cards/{target}", json={"priority": "urgent"})
    assert response.status_code == 422


def test_created_card_defaults_to_medium(auth_client):
    board = board_id(auth_client)
    column_id = auth_client.get(f"/api/boards/{board}").json()["columns"][0]["id"]

    response = auth_client.post(
        f"/api/columns/{column_id}/cards", json={"title": "New", "details": ""}
    )

    assert response.status_code == 201
    assert response.json()["priority"] == "medium"
