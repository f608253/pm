from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.kanban import load_board
from app.models import Board, Column
from app.schemas import BoardCreate, BoardOut, BoardSummary, BoardUpdate
from app.serializers import board_out, board_summaries, to_board_out

router = APIRouter()


@router.get("/boards", response_model=list[BoardSummary])
def list_boards(db: DbSession, user: CurrentUser) -> list[BoardSummary]:
    return board_summaries(db, user.id)


@router.post("/boards", response_model=BoardOut, status_code=status.HTTP_201_CREATED)
def create_board(payload: BoardCreate, db: DbSession, user: CurrentUser) -> BoardOut:
    board = Board(user_id=user.id, title=payload.title)
    db.add(board)
    db.commit()
    return to_board_out(board)


@router.get("/boards/{board_id}", response_model=BoardOut)
def get_board(board_id: int, db: DbSession, user: CurrentUser) -> BoardOut:
    load_board(db, board_id, user.id)
    result = board_out(db, board_id)
    assert result is not None
    return result


@router.patch("/boards/{board_id}", response_model=BoardOut)
def update_board(
    board_id: int, payload: BoardUpdate, db: DbSession, user: CurrentUser
) -> BoardOut:
    board = load_board(db, board_id, user.id)
    board.title = payload.title
    db.commit()
    result = board_out(db, board_id)
    assert result is not None
    return result


@router.delete("/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(board_id: int, db: DbSession, user: CurrentUser) -> None:
    board = load_board(db, board_id, user.id)
    db.delete(board)
    db.commit()