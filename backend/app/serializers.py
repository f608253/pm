from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Board, Column
from app.schemas import BoardOut, BoardSummary, ColumnOut, CardOut


def board_out(db: Session, board_id: int) -> BoardOut | None:
    """Load a board with its full column and card tree.

    Eager loading is explicit and the result is materialised into plain Pydantic
    objects, so no lazy load can fire during response serialisation.
    """
    board = db.scalar(
        select(Board)
        .options(selectinload(Board.columns).selectinload(Column.cards))
        .where(Board.id == board_id)
    )
    if board is None:
        return None
    return to_board_out(board)


def to_board_out(board: Board) -> BoardOut:
    return BoardOut(
        id=board.id,
        title=board.title,
        columns=[
            ColumnOut(
                id=column.id,
                title=column.title,
                cards=[
                    CardOut(
                        id=card.id,
                        title=card.title,
                        details=card.details,
                        priority=card.priority,
                    )
                    for card in column.cards
                ],
            )
            for column in board.columns
        ],
    )


def board_summaries(db: Session, user_id: int) -> list[BoardSummary]:
    boards = db.scalars(
        select(Board).where(Board.user_id == user_id).order_by(Board.id)
    ).all()
    return [BoardSummary(id=board.id, title=board.title) for board in boards]