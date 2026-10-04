from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.kanban import load_board, load_column, move_column
from app.models import Column
from app.schemas import ColumnCreate, ColumnUpdate

router = APIRouter()


@router.post("/boards/{board_id}/columns", status_code=status.HTTP_201_CREATED)
def create_column(
    board_id: int, payload: ColumnCreate, db: DbSession, user: CurrentUser
) -> None:
    board = load_board(db, board_id, user.id)
    existing = db.scalar(
        select(func.count()).select_from(Column).where(Column.board_id == board.id)
    )
    target = existing if payload.position is None else payload.position

    column = Column(board_id=board.id, title=payload.title, position=target)
    db.add(column)
    db.commit()

    if payload.position is not None:
        move_column(db, column, payload.position)
        db.commit()


@router.patch("/columns/{column_id}")
def update_column(
    column_id: int, payload: ColumnUpdate, db: DbSession, user: CurrentUser
) -> None:
    column = load_column(db, column_id, user.id)

    if payload.title is not None:
        column.title = payload.title
    if payload.position is not None:
        move_column(db, column, payload.position)
    db.commit()


@router.delete("/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_column(column_id: int, db: DbSession, user: CurrentUser) -> None:
    column = load_column(db, column_id, user.id)
    db.delete(column)
    db.commit()