from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.kanban import load_card, load_column, move_card
from app.models import Card
from app.schemas import CardCreate, CardOut, CardUpdate

router = APIRouter()


@router.post("/columns/{column_id}/cards", response_model=CardOut, status_code=201)
def create_card(
    column_id: int, payload: CardCreate, db: DbSession, user: CurrentUser
) -> CardOut:
    column = load_column(db, column_id, user.id)
    position = len(column.cards)

    card = Card(
        column_id=column.id, title=payload.title, details=payload.details, position=position
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return CardOut(
        id=card.id, title=card.title, details=card.details, priority=card.priority
    )


@router.patch("/cards/{card_id}", response_model=CardOut)
def update_card(
    card_id: int, payload: CardUpdate, db: DbSession, user: CurrentUser
) -> CardOut:
    card = load_card(db, card_id, user.id)

    if payload.title is not None:
        card.title = payload.title
    if payload.details is not None:
        card.details = payload.details
    if payload.priority is not None:
        card.priority = payload.priority
    if payload.column_id is not None and payload.column_id != card.column_id:
        target = load_column(db, payload.column_id, user.id)
        move_card(db, card, target.id, payload.position if payload.position is not None else 0)
    elif payload.position is not None:
        move_card(db, card, card.column_id, payload.position)

    db.commit()
    db.refresh(card)
    return CardOut(
        id=card.id, title=card.title, details=card.details, priority=card.priority
    )


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: int, db: DbSession, user: CurrentUser) -> None:
    card = load_card(db, card_id, user.id)
    db.delete(card)
    db.commit()