from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Board, Card, Column, User


def load_board(db: Session, board_id: int, user_id: int) -> Board:
    board = db.get(Board, board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    if board.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your board")
    return board


def load_column(db: Session, column_id: int, user_id: int) -> Column:
    column = db.scalar(
        select(Column)
        .join(Board)
        .where(Column.id == column_id, Board.user_id == user_id)
    )
    if column is not None:
        return column
    if db.get(Column, column_id) is None:
        raise HTTPException(status_code=404, detail="Column not found")
    raise HTTPException(status_code=403, detail="Not your column")


def load_card(db: Session, card_id: int, user_id: int) -> Card:
    card = db.scalar(
        select(Card)
        .join(Column)
        .join(Board)
        .where(Card.id == card_id, Board.user_id == user_id)
    )
    if card is not None:
        return card
    if db.get(Card, card_id) is None:
        raise HTTPException(status_code=404, detail="Card not found")
    raise HTTPException(status_code=403, detail="Not your card")


def move_column(db: Session, column: Column, position: int) -> None:
    siblings = list(
        db.scalars(
            select(Column)
            .where(Column.board_id == column.board_id, Column.id != column.id)
            .order_by(Column.position)
        )
    )
    index = min(position, len(siblings))
    for idx, sibling in enumerate(siblings[:index] + [column] + siblings[index:]):
        sibling.position = idx


def move_card(db: Session, card: Card, target_column_id: int, position: int) -> None:
    source_column_id = card.column_id

    source_siblings = []
    if source_column_id != target_column_id:
        source_siblings = list(
            db.scalars(
                select(Card)
                .where(Card.column_id == source_column_id, Card.id != card.id)
                .order_by(Card.position)
            )
        )

    target_siblings = list(
        db.scalars(
            select(Card)
            .where(Card.column_id == target_column_id, Card.id != card.id)
            .order_by(Card.position)
        )
    )

    index = min(position, len(target_siblings))
    card.column_id = target_column_id
    for idx, item in enumerate(target_siblings[:index] + [card] + target_siblings[index:]):
        item.position = idx

    for idx, sibling in enumerate(source_siblings):
        sibling.position = idx


def user_boards(db: Session, user_id: int) -> list[Board]:
    return list(
        db.scalars(select(Board).where(Board.user_id == user_id).order_by(Board.id))
    )


def ensure_board_for_user(db: Session, user: User) -> Board:
    boards = user_boards(db, user.id)
    if boards:
        return boards[0]
    from app.seed import seed_default_board

    return seed_default_board(db, user)