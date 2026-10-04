import pytest
from sqlalchemy import select

from app.models import Column, Conversation, Message
from app.services import ai


def stub_chat(monkeypatch, reply):
    monkeypatch.setattr(ai, "chat_with_board", lambda *a, **k: reply)


def board_payload(db):
    """The seeded board as the API returns it, used to resolve real ids."""
    return {
        "columns": [
            {"id": c.id, "title": c.title} for c in db.query(Column).all() if c.board_id == 1
        ]
    }


def column_id(db, title):
    for column in board_payload(db)["columns"]:
        if column["title"] == title:
            return column["id"]
    raise AssertionError(f"no column {title}")


def cards_named(board, title):
    return [c for column in board["columns"] for c in column["cards"] if c["title"] == title]


def card_id(board, title):
    matches = cards_named(board, title)
    assert matches, f"no card {title}"
    return matches[0]["id"]


def test_requires_authentication(client):
    response = client.post("/api/ai/chat", json={"board_id": 1, "question": "hi"})
    assert response.status_code == 401


def test_rejects_empty_question(auth_client):
    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": ""})
    assert response.status_code == 422


def test_rejects_unknown_board(auth_client, monkeypatch):
    stub_chat(monkeypatch, {"response": "hi"})
    response = auth_client.post("/api/ai/chat", json={"board_id": 9999, "question": "hi"})
    assert response.status_code == 404


def test_rejects_another_users_board(auth_client, intruder, db, monkeypatch):
    from app.models import Board

    other = Board(user_id=intruder.id, title="Not yours")
    db.add(other)
    db.commit()
    db.refresh(other)

    stub_chat(monkeypatch, {"response": "hi"})
    response = auth_client.post("/api/ai/chat", json={"board_id": other.id, "question": "hi"})
    assert response.status_code == 403


def test_answers_without_changing_the_board(auth_client, monkeypatch):
    stub_chat(monkeypatch, {"response": "Two cards in Backlog."})

    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "What is in Backlog?"})

    assert response.status_code == 200
    body = response.json()
    assert body["response"] == "Two cards in Backlog."
    assert body["applied"] == []
    assert body["board"]["columns"][0]["title"] == "Backlog"


def test_adds_a_card_to_backlog(auth_client, monkeypatch, db):
    stub_chat(
        monkeypatch,
        {
            "response": "Added it.",
            "operations": [
                {
                    "type": "add_card",
                    "column_id": column_id(db, "Backlog"),
                    "title": "AI card",
                    "details": "Made by AI",
                }
            ],
        },
    )

    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "Add a card"})

    assert response.status_code == 200
    body = response.json()
    assert cards_named(body["board"], "AI card")
    assert len(body["applied"]) == 1
    assert "AI card" in body["applied"][0]["detail"]


def test_moves_a_card(auth_client, monkeypatch, db):
    stub_chat(monkeypatch, {"response": "seed"})
    auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "seed"})
    db.expire_all()

    start = auth_client.get("/api/boards/1").json()
    target = card_id(start, "Align roadmap themes")

    stub_chat(
        monkeypatch,
        {
            "response": "Moved it.",
            "operations": [
                {
                    "type": "move_card",
                    "card_id": target,
                    "column_id": column_id(db, "Done"),
                }
            ],
        },
    )
    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "Move it to Done"})

    done = [c for c in response.json()["board"]["columns"] if c["title"] == "Done"][0]
    assert any(c["title"] == "Align roadmap themes" for c in done["cards"])


def test_deletes_a_card(auth_client, monkeypatch):
    stub_chat(monkeypatch, {"response": "seed"})
    auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "seed"})
    start = auth_client.get("/api/boards/1").json()
    target = card_id(start, "Gather customer signals")

    stub_chat(
        monkeypatch,
        {"response": "Deleted.", "operations": [{"type": "delete_card", "card_id": target}]},
    )
    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "Delete it"})

    assert not cards_named(response.json()["board"], "Gather customer signals")


def test_invalid_operations_are_skipped_not_fatal(auth_client, monkeypatch):
    stub_chat(
        monkeypatch,
        {
            "response": "Partly done.",
            "operations": [
                {"type": "add_card", "column_id": 9999, "title": "Nowhere"},
                {"type": "delete_card", "card_id": 1},
            ],
        },
    )

    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "do both"})

    assert response.status_code == 200
    body = response.json()
    assert len(body["skipped"]) == 1
    assert len(body["applied"]) == 1
    assert not cards_named(body["board"], "Nowhere")


def test_missing_response_text_is_a_bad_gateway(auth_client, monkeypatch):
    stub_chat(monkeypatch, {"operations": []})
    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "hi"})
    assert response.status_code == 502


def test_blank_response_text_is_a_bad_gateway(auth_client, monkeypatch):
    stub_chat(monkeypatch, {"response": "   "})
    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "hi"})
    assert response.status_code == 502


def test_provider_error_returns_502(auth_client, monkeypatch):
    def boom(*args, **kwargs):
        raise ai.AiError("provider exploded")

    monkeypatch.setattr(ai, "chat_with_board", boom)
    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "hi"})
    assert response.status_code == 502


def test_missing_key_returns_503(auth_client, monkeypatch):
    def boom(*args, **kwargs):
        raise ai.AiNotConfigured("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "chat_with_board", boom)
    response = auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "hi"})
    assert response.status_code == 503


def test_stores_conversation(auth_client, monkeypatch, db):
    stub_chat(monkeypatch, {"response": "Two cards."})

    auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "How many cards?"})

    conversation = db.scalar(select(Conversation).where(Conversation.board_id == 1))
    assert conversation is not None
    messages = list(db.scalars(select(Message).order_by(Message.id)))
    assert [(m.role, m.content) for m in messages] == [
        ("user", "How many cards?"),
        ("assistant", "Two cards."),
    ]


def test_history_is_sent_on_the_next_turn(auth_client, monkeypatch, db):
    seen = []

    stub_chat(monkeypatch, {"response": "First answer."})
    auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "First question"})

    def capture(board, question, history):
        seen.append(history)
        return {"response": "Second answer."}

    monkeypatch.setattr(ai, "chat_with_board", capture)
    auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "Second question"})

    assert seen[0] == [
        {"role": "user", "content": "First question"},
        {"role": "assistant", "content": "First answer."},
    ]


def test_history_is_capped(auth_client, monkeypatch, db):
    seen = []

    stub_chat(monkeypatch, {"response": "ok"})
    for index in range(30):
        auth_client.post("/api/ai/chat", json={"board_id": 1, "question": f"q{index}"})

    def capture(board, question, history):
        seen.append(history)
        return {"response": "ok"}

    monkeypatch.setattr(ai, "chat_with_board", capture)
    auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "final"})

    assert len(seen[0]) <= 20


def test_conversation_is_created_once_per_board(auth_client, monkeypatch, db):
    stub_chat(monkeypatch, {"response": "ok"})
    auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "one"})
    auth_client.post("/api/ai/chat", json={"board_id": 1, "question": "two"})

    conversations = list(db.scalars(select(Conversation)))
    assert len(conversations) == 1