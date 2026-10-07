from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.kanban import move_card
from app.models import Card, Column, User

MAX_TITLE = 200
MAX_DETAILS = 4000
MAX_COLUMN_TITLE = 120


class OperationRejected(Exception):
    """A proposed operation could not be applied."""


def _text(value, limit: int, label: str) -> str:
    if not isinstance(value, str):
        raise OperationRejected(f"{label} must be text")
    cleaned = value.strip()
    if not cleaned:
        raise OperationRejected(f"{label} must not be empty")
    return cleaned[:limit]


def _column(db: Session, column_id, user_id: int, board_id: int) -> Column:
    if not isinstance(column_id, int):
        raise OperationRejected("column_id must be a number")
    column = db.get(Column, column_id)
    if column is None or column.board_id != board_id or column.board.user_id != user_id:
        raise OperationRejected(f"unknown column_id {column_id}")
    return column


def _card(db: Session, card_id, user_id: int) -> Card:
    if not isinstance(card_id, int):
        raise OperationRejected("card_id must be a number")
    card = db.get(Card, card_id)
    if card is None or card.column.board.user_id != user_id:
        raise OperationRejected(f"unknown card_id {card_id}")
    return card


def apply_operation(db: Session, op: dict, user: User, board_id: int) -> str:
    """Apply one AI-proposed operation and return a human readable summary.

    Raises OperationRejected when the operation is malformed or references
    something the user does not own, so the caller can skip it and keep going.
    """
    if not isinstance(op, dict):
        raise OperationRejected("operation must be an object")
    kind = op.get("type")

    if kind == "add_card":
        column = _column(db, op.get("column_id"), user.id, board_id)
        title = _text(op.get("title"), MAX_TITLE, "title")
        details = op.get("details") or ""
        if not isinstance(details, str):
            raise OperationRejected("details must be text")
        card = Card(
            column_id=column.id,
            title=title,
            details=details[:MAX_DETAILS],
            position=len(column.cards),
        )
        db.add(card)
        return f'Added "{title}" to {column.title}'

    if kind == "edit_card":
        card = _card(db, op.get("card_id"), user.id)
        changed = False
        if op.get("title") is not None:
            card.title = _text(op.get("title"), MAX_TITLE, "title")
            changed = True
        if op.get("details") is not None:
            details = op.get("details")
            if not isinstance(details, str):
                raise OperationRejected("details must be text")
            card.details = details[:MAX_DETAILS]
            changed = True
        if op.get("priority") is not None:
            priority = _text(op.get("priority"), 16, "priority")
            if priority not in {"high", "medium", "low"}:
                raise OperationRejected("priority must be high, medium, or low")
            card.priority = priority
            changed = True
        if not changed:
            raise OperationRejected("edit_card needs a title, details, or priority")
        return f'Updated "{card.title}"'

    if kind == "move_card":
        card = _card(db, op.get("card_id"), user.id)
        target = _column(db, op.get("column_id"), user.id, board_id)
        position = op.get("position", 0)
        if position is None:
            position = 0
        if not isinstance(position, int) or isinstance(position, bool) or position < 0:
            raise OperationRejected("position must be a non-negative number")
        move_card(db, card, target.id, position)
        return f'Moved "{card.title}" to {target.title}'

    if kind == "delete_card":
        card = _card(db, op.get("card_id"), user.id)
        title = card.title
        db.delete(card)
        return f'Deleted "{title}"'

    raise OperationRejected(f"unknown operation type {kind!r}")


def apply_operations(db: Session, operations, user: User, board_id: int) -> tuple[list[str], list[str]]:
    """Apply every operation, collecting applied and skipped summaries."""
    if operations is None:
        return [], []
    if not isinstance(operations, list):
        raise HTTPException(status_code=502, detail="Model returned invalid operations")

    applied: list[str] = []
    skipped: list[str] = []
    for op in operations:
        try:
            applied.append(apply_operation(db, op, user, board_id))
        except OperationRejected as err:
            skipped.append(str(err))
    return applied, skipped