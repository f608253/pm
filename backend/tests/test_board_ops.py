import pytest

from app.services import ai
from app.services.board_ops import OperationRejected, apply_operation, apply_operations
from app.models import Board, Card, Column, User


def user_of(db):
    return db.query(User).filter(User.username == "user").one()


def board_of(db):
    board = db.query(Board).filter(Board.id == 1).one()
    board.columns[0].cards
    return board


def column_of(db, title):
    return db.query(Column).filter(Column.title == title).one()


def reload_card(db, card_id):
    db.expire_all()
    return db.get(Card, card_id)


def test_add_card_creates_card(db):
    user = user_of(db)
    column = column_of(db, "Backlog")
    before = len(column.cards)

    summary = apply_operation(
        db,
        {"type": "add_card", "column_id": column.id, "title": "Write docs", "details": "Now"},
        user,
    )
    db.commit()
    db.expire_all()

    assert "Write docs" in summary
    assert len(column_of(db, "Backlog").cards) == before + 1


def test_add_card_defaults_details_to_empty(db):
    column = column_of(db, "Backlog")

    apply_operation(db, {"type": "add_card", "column_id": column.id, "title": "No details"}, user_of(db))
    db.commit()
    db.expire_all()

    created = [c for c in column_of(db, "Backlog").cards if c.title == "No details"][0]
    assert created.details == ""


def test_add_card_rejects_unknown_column(db):
    with pytest.raises(OperationRejected, match="unknown column_id"):
        apply_operation(db, {"type": "add_card", "column_id": 9999, "title": "x"}, user_of(db))


def test_add_card_rejects_missing_title(db):
    column = column_of(db, "Backlog")
    with pytest.raises(OperationRejected, match="title must not be empty"):
        apply_operation(db, {"type": "add_card", "column_id": column.id, "title": "  "}, user_of(db))


def test_add_card_rejects_non_text_title(db):
    column = column_of(db, "Backlog")
    with pytest.raises(OperationRejected, match="title must be text"):
        apply_operation(db, {"type": "add_card", "column_id": column.id, "title": 7}, user_of(db))


def test_add_card_rejects_non_text_details(db):
    column = column_of(db, "Backlog")
    with pytest.raises(OperationRejected, match="details must be text"):
        apply_operation(
            db,
            {"type": "add_card", "column_id": column.id, "title": "ok", "details": 5},
            user_of(db),
        )


def test_add_card_truncates_long_text(db):
    column = column_of(db, "Backlog")
    apply_operation(
        db,
        {
            "type": "add_card",
            "column_id": column.id,
            "title": "T" * 500,
            "details": "D" * 9000,
        },
        user_of(db),
    )
    db.commit()
    db.expire_all()

    created = [c for c in column_of(db, "Backlog").cards if c.title.startswith("TTT")][0]
    assert len(created.title) == 200
    assert len(created.details) == 4000


def test_edit_card_updates_fields(db):
    user = user_of(db)
    card = column_of(db, "Backlog").cards[0]

    apply_operation(
        db,
        {"type": "edit_card", "card_id": card.id, "title": "Renamed", "details": "New"},
        user,
    )
    db.commit()

    assert reload_card(db, card.id).title == "Renamed"
    assert reload_card(db, card.id).details == "New"


def test_edit_card_allows_details_only(db):
    user = user_of(db)
    card = column_of(db, "Backlog").cards[0]

    apply_operation(db, {"type": "edit_card", "card_id": card.id, "details": "Only"}, user)
    db.commit()

    assert reload_card(db, card.id).details == "Only"


def test_edit_card_requires_a_change(db):
    card = column_of(db, "Backlog").cards[0]
    with pytest.raises(OperationRejected, match="needs a title, details, or priority"):
        apply_operation(db, {"type": "edit_card", "card_id": card.id}, user_of(db))


def test_edit_card_updates_priority(db):
    card = column_of(db, "Backlog").cards[0]
    apply_operation(db, {"type": "edit_card", "card_id": card.id, "priority": "high"}, user_of(db))
    db.commit()

    assert reload_card(db, card.id).priority == "high"


def test_edit_card_rejects_unknown_priority(db):
    card = column_of(db, "Backlog").cards[0]
    with pytest.raises(OperationRejected, match="priority must be"):
        apply_operation(
            db, {"type": "edit_card", "card_id": card.id, "priority": "urgent"}, user_of(db)
        )


def test_edit_card_rejects_unknown_card(db):
    with pytest.raises(OperationRejected, match="unknown card_id"):
        apply_operation(db, {"type": "edit_card", "card_id": 9999, "title": "x"}, user_of(db))


def test_move_card_changes_column(db):
    user = user_of(db)
    card = column_of(db, "Backlog").cards[0]
    target = column_of(db, "Done")

    summary = apply_operation(
        db, {"type": "move_card", "card_id": card.id, "column_id": target.id}, user
    )
    db.commit()

    assert "Done" in summary
    assert reload_card(db, card.id).column_id == target.id


def test_move_card_honours_position(db):
    user = user_of(db)
    card = column_of(db, "Backlog").cards[0]
    target = column_of(db, "Done")

    apply_operation(
        db, {"type": "move_card", "card_id": card.id, "column_id": target.id, "position": 0}, user
    )
    db.commit()

    assert reload_card(db, card.id).position == 0


def test_move_card_rejects_negative_position(db):
    card = column_of(db, "Backlog").cards[0]
    target = column_of(db, "Done")
    with pytest.raises(OperationRejected, match="non-negative"):
        apply_operation(
            db,
            {"type": "move_card", "card_id": card.id, "column_id": target.id, "position": -1},
            user_of(db),
        )


def test_move_card_rejects_boolean_position(db):
    card = column_of(db, "Backlog").cards[0]
    target = column_of(db, "Done")
    with pytest.raises(OperationRejected, match="non-negative"):
        apply_operation(
            db,
            {"type": "move_card", "card_id": card.id, "column_id": target.id, "position": True},
            user_of(db),
        )


def test_move_card_rejects_unknown_column(db):
    card = column_of(db, "Backlog").cards[0]
    with pytest.raises(OperationRejected, match="unknown column_id"):
        apply_operation(
            db, {"type": "move_card", "card_id": card.id, "column_id": 9999}, user_of(db)
        )


def test_delete_card_removes_card(db):
    user = user_of(db)
    card = column_of(db, "Backlog").cards[0]
    card_id = card.id
    title = card.title

    summary = apply_operation(db, {"type": "delete_card", "card_id": card_id}, user)
    db.commit()
    db.expire_all()

    assert title in summary
    assert db.get(Card, card_id) is None


def test_delete_card_rejects_unknown_card(db):
    with pytest.raises(OperationRejected, match="unknown card_id"):
        apply_operation(db, {"type": "delete_card", "card_id": 9999}, user_of(db))


def test_unknown_operation_type_is_rejected(db):
    with pytest.raises(OperationRejected, match="unknown operation type"):
        apply_operation(db, {"type": "drop_database"}, user_of(db))


def test_non_dict_operation_is_rejected(db):
    with pytest.raises(OperationRejected, match="must be an object"):
        apply_operation(db, "add a card", user_of(db))


def test_non_numeric_ids_are_rejected(db):
    with pytest.raises(OperationRejected, match="column_id must be a number"):
        apply_operation(
            db, {"type": "add_card", "column_id": "backlog", "title": "x"}, user_of(db)
        )


def test_another_users_card_is_not_reachable(db, intruder):
    card = column_of(db, "Backlog").cards[0]

    with pytest.raises(OperationRejected, match="unknown card_id"):
        apply_operation(
            db, {"type": "edit_card", "card_id": card.id, "title": "hijack"}, intruder
        )


def test_another_users_column_is_not_reachable(db, intruder):
    column = column_of(db, "Backlog")

    with pytest.raises(OperationRejected, match="unknown column_id"):
        apply_operation(
            db, {"type": "add_card", "column_id": column.id, "title": "hijack"}, intruder
        )


def test_apply_operations_collects_applied_and_skipped(db):
    user = user_of(db)
    column = column_of(db, "Backlog")

    applied, skipped = apply_operations(
        db,
        [
            {"type": "add_card", "column_id": column.id, "title": "Good"},
            {"type": "add_card", "column_id": 9999, "title": "Bad"},
        ],
        user,
    )

    assert len(applied) == 1
    assert len(skipped) == 1
    assert "unknown column_id" in skipped[0]


def test_apply_operations_treats_none_as_no_operations(db):
    assert apply_operations(db, None, user_of(db)) == ([], [])


def test_apply_operations_rejects_non_list(db):
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        apply_operations(db, {"type": "add_card"}, user_of(db))


def test_system_prompt_includes_board_state(db):
    context = ai.board_context(board_of(db))

    assert '"board_id": 1' in context
    assert "Backlog" in context
    assert "card_id" in context


def test_chat_with_board_sends_board_and_history(db, monkeypatch):
    captured = {}

    def fake_chat(messages, **kwargs):
        captured["messages"] = messages
        captured["kwargs"] = kwargs
        return '{"response": "ok", "operations": []}'

    monkeypatch.setattr(ai, "chat", fake_chat)

    result = ai.chat_with_board(
        board_of(db),
        "What is on the board?",
        [
            {"role": "user", "content": "earlier"},
            {"role": "assistant", "content": "earlier reply"},
        ],
    )

    assert result["response"] == "ok"
    messages = captured["messages"]
    assert messages[0]["role"] == "system"
    assert "Backlog" in messages[0]["content"]
    assert messages[1]["content"] == "earlier"
    assert messages[2]["content"] == "earlier reply"
    assert messages[-1]["content"] == "What is on the board?"
    assert captured["kwargs"]["response_format"] == {"type": "json_object"}


def test_extract_json_handles_plain_object():
    assert ai.extract_json('{"response": "hi"}') == {"response": "hi"}


def test_extract_json_handles_code_fences():
    raw = '```json\n{"response": "hi", "operations": []}\n```'
    assert ai.extract_json(raw)["response"] == "hi"


def test_extract_json_handles_surrounding_prose():
    raw = 'Sure! {"response": "hi"} Hope that helps.'
    assert ai.extract_json(raw)["response"] == "hi"


def test_extract_json_rejects_non_json():
    with pytest.raises(ai.AiError, match="not JSON"):
        ai.extract_json("no json here")


def test_extract_json_rejects_invalid_json():
    with pytest.raises(ai.AiError, match="not valid JSON"):
        ai.extract_json("{not valid}")


def test_extract_json_rejects_non_object():
    with pytest.raises(ai.AiError, match="not JSON"):
        ai.extract_json("[1, 2, 3]")