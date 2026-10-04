from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.kanban import load_board
from app.models import Board, Conversation, Message
from app.schemas import (
    AiChatRequest,
    AiChatResponse,
    AiTestRequest,
    AiTestResponse,
    AppliedOperation,
)
from app.serializers import board_out
from app.services import ai, board_ops

router = APIRouter()

HISTORY_LIMIT = 20


@router.post("/ai/test", response_model=AiTestResponse)
def test_ai(payload: AiTestRequest, user: CurrentUser) -> AiTestResponse:
    try:
        answer = ai.simple_chat(payload.prompt)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))
    return AiTestResponse(response=answer, model=ai.MODEL)


def conversation_for(db: Session, board_id: int) -> Conversation:
    """Return the board's conversation, creating it on first use."""
    conversation = db.scalar(select(Conversation).where(Conversation.board_id == board_id))
    if conversation is None:
        conversation = Conversation(board_id=board_id)
        db.add(conversation)
        db.commit()
    db.refresh(conversation)
    return conversation


def history_for(db: Session, conversation: Conversation) -> list[dict[str, str]]:
    newest = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.id.desc())
            .limit(HISTORY_LIMIT)
        )
    )
    return [{"role": m.role, "content": m.content} for m in reversed(newest)]


@router.post("/ai/chat", response_model=AiChatResponse)
def chat_with_board(
    payload: AiChatRequest, db: DbSession, user: CurrentUser
) -> AiChatResponse:
    board = load_board(db, payload.board_id, user.id)

    conversation = conversation_for(db, board.id)
    history = history_for(db, conversation)
    board_id = board.id
    conversation_id = conversation.id

    # Materialise the board and end the read transaction before the model call:
    # the request can take a minute, and holding a SQLite read transaction that
    # long blocks writers for no reason.
    snapshot = board_out(db, board.id)
    db.rollback()

    try:
        reply = ai.chat_with_board(snapshot, payload.question, history)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    response_text = reply.get("response")
    if not isinstance(response_text, str) or not response_text.strip():
        raise HTTPException(status_code=502, detail="Model returned no response text")

    applied, skipped = board_ops.apply_operations(db, reply.get("operations"), user)

    db.add(Message(conversation_id=conversation_id, role="user", content=payload.question))
    db.add(
        Message(conversation_id=conversation_id, role="assistant", content=response_text)
    )
    db.commit()

    return AiChatResponse(
        response=response_text,
        board=board_out(db, board_id),
        applied=[AppliedOperation(operation="apply", detail=item) for item in applied],
        skipped=skipped,
    )