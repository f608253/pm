from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.kanban import load_board
from app.models import Board, Conversation, Message
from app.schemas import (
    AiChatRequest,
    AiChatResponse,
    AiNewsItem,
    AiNewsResponse,
    AiTestRequest,
    AiTestResponse,
    AppliedOperation,
    BoardRequest,
    DailySummaryRequest,
    DailySummaryResponse,
    CardIntelligenceRequest,
    CardIntelligenceResponse,
    DuplicateCard,
    EffortEstimate,
    EffortEstimationResponse,
    RiskAssessmentResponse,
    RiskItem,
    SprintRetrospectiveResponse,
    StandupResponse,
    WeeklyReportResponse,
    WorkflowOptimizationRequest,
    WorkflowOptimizationResponse,
    Bottleneck,
    NextAction,
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

    applied, skipped = board_ops.apply_operations(db, reply.get("operations"), user, board_id)

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


@router.get("/ai/news", response_model=AiNewsResponse)
def ai_news(user: CurrentUser, randomize: bool = False) -> AiNewsResponse:
    try:
        items = ai.fetch_ai_news(randomize=randomize)
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))
    return AiNewsResponse(
        items=[AiNewsItem(**item) for item in items]
    )


@router.post("/ai/summary", response_model=DailySummaryResponse)
def daily_summary(
    payload: DailySummaryRequest, db: DbSession, user: CurrentUser
) -> DailySummaryResponse:
    board = load_board(db, payload.board_id, user.id)
    snapshot = board_out(db, board.id)
    db.rollback()

    try:
        text = ai.daily_summary(snapshot)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    return DailySummaryResponse(summary=text)


@router.post("/ai/card-intelligence", response_model=CardIntelligenceResponse)
def card_intelligence(
    payload: CardIntelligenceRequest, db: DbSession, user: CurrentUser
) -> CardIntelligenceResponse:
    board = load_board(db, payload.board_id, user.id)
    snapshot = board_out(db, board.id)
    db.rollback()

    card_ids = {card.id for column in snapshot.columns for card in column.cards}

    try:
        result = ai.card_intelligence(snapshot, payload.card_id, payload.task)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    priority = result.get("priority")
    if priority not in {"high", "medium", "low"}:
        priority = None

    duplicates = [
        DuplicateCard(
            card_id=item["card_id"],
            title=item.get("title", ""),
            similarity=item.get("similarity", ""),
            reason=item.get("reason", ""),
        )
        for item in result.get("duplicates", [])
        if isinstance(item, dict)
        and isinstance(item.get("card_id"), int)
        and item["card_id"] in card_ids
    ]

    return CardIntelligenceResponse(
        result=result.get("result", ""),
        details=result.get("details"),
        priority=priority,
        duplicates=duplicates,
    )


@router.post("/ai/workflow-optimization", response_model=WorkflowOptimizationResponse)
def workflow_optimization(
    payload: WorkflowOptimizationRequest, db: DbSession, user: CurrentUser
) -> WorkflowOptimizationResponse:
    board = load_board(db, payload.board_id, user.id)
    snapshot = board_out(db, board.id)
    db.rollback()

    try:
        result = ai.workflow_optimization(snapshot)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    columns = {column.id: column for column in snapshot.columns}
    cards = {card.id: card for column in snapshot.columns for card in column.cards}

    bottlenecks = [
        Bottleneck(
            column_id=item["column_id"],
            title=item.get("title") or columns[item["column_id"]].title,
            reason=item.get("reason", ""),
        )
        for item in result.get("bottlenecks", [])
        if isinstance(item, dict) and item.get("column_id") in columns
    ]

    next_actions = [
        NextAction(
            card_id=item["card_id"],
            card_title=cards[item["card_id"]].title,
            action=item.get("action", ""),
        )
        for item in result.get("next_actions", [])
        if isinstance(item, dict) and item.get("card_id") in cards
    ]

    # A reorder that drops or invents a card would fight the user's manual
    # ordering, so only keep columns whose list is a permutation of that column.
    # JSON object keys arrive as strings, so coerce before looking them up.
    optimal_order = {}
    for raw_column_id, order in (result.get("optimal_order") or {}).items():
        column_id = int(raw_column_id) if str(raw_column_id).isdigit() else raw_column_id
        if (
            column_id in columns
            and sorted(order) == sorted(card.id for card in columns[column_id].cards)
        ):
            optimal_order[column_id] = order

    return WorkflowOptimizationResponse(
        bottlenecks=bottlenecks,
        next_actions=next_actions,
        suggestions=result.get("suggestions", []),
        optimal_order=optimal_order,
    )


def _board_snapshot(db: DbSession, user: CurrentUser, board_id: int):
    """Load a board, materialise its snapshot, and close the read transaction."""
    board = load_board(db, board_id, user.id)
    snapshot = board_out(db, board.id)
    db.rollback()
    return snapshot


def _resolve_cards(snapshot):
    return {card.id: card for column in snapshot.columns for card in column.cards}


@router.post("/ai/retrospective", response_model=SprintRetrospectiveResponse)
def sprint_retrospective(
    payload: BoardRequest, db: DbSession, user: CurrentUser
) -> SprintRetrospectiveResponse:
    snapshot = _board_snapshot(db, user, payload.board_id)
    try:
        result = ai.sprint_retrospective(snapshot)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    return SprintRetrospectiveResponse(
        summary=result.get("summary", ""),
        what_went_well=result.get("what_went_well", []),
        what_to_improve=result.get("what_to_improve", []),
        actions=result.get("actions", []),
    )


@router.post("/ai/risk-assessment", response_model=RiskAssessmentResponse)
def risk_assessment(
    payload: BoardRequest, db: DbSession, user: CurrentUser
) -> RiskAssessmentResponse:
    snapshot = _board_snapshot(db, user, payload.board_id)
    cards = _resolve_cards(snapshot)
    try:
        result = ai.risk_assessment(snapshot)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    risks = [
        item
        for item in result.get("risks", [])
        if isinstance(item, dict) and item.get("card_id") in cards
    ]
    return RiskAssessmentResponse(
        summary=result.get("summary", ""),
        risks=[
            RiskItem(
                card_id=item["card_id"],
                card_title=cards[item["card_id"]].title,
                risk=item.get("risk", ""),
                reason=item.get("reason", ""),
            )
            for item in risks
        ],
    )


@router.post("/ai/effort-estimation", response_model=EffortEstimationResponse)
def effort_estimation(
    payload: BoardRequest, db: DbSession, user: CurrentUser
) -> EffortEstimationResponse:
    snapshot = _board_snapshot(db, user, payload.board_id)
    cards = _resolve_cards(snapshot)
    try:
        result = ai.effort_estimation(snapshot)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    estimates = [
        item
        for item in result.get("estimates", [])
        if isinstance(item, dict) and item.get("card_id") in cards
    ]
    return EffortEstimationResponse(
        summary=result.get("summary", ""),
        estimates=[
            EffortEstimate(
                card_id=item["card_id"],
                card_title=cards[item["card_id"]].title,
                effort=item.get("effort", ""),
                hint=item.get("hint", ""),
            )
            for item in estimates
        ],
    )


@router.post("/ai/standup", response_model=StandupResponse)
def standup(
    payload: BoardRequest, db: DbSession, user: CurrentUser
) -> StandupResponse:
    snapshot = _board_snapshot(db, user, payload.board_id)
    try:
        result = ai.standup_points(snapshot)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    return StandupResponse(
        summary=result.get("summary", ""),
        points=result.get("points", []),
        blockers=result.get("blockers", []),
    )


@router.post("/ai/weekly-report", response_model=WeeklyReportResponse)
def weekly_report(
    payload: BoardRequest, db: DbSession, user: CurrentUser
) -> WeeklyReportResponse:
    snapshot = _board_snapshot(db, user, payload.board_id)
    try:
        result = ai.weekly_report(snapshot)
    except ai.AiNotConfigured as err:
        raise HTTPException(status_code=503, detail=str(err))
    except ai.AiError as err:
        raise HTTPException(status_code=502, detail=str(err))

    return WeeklyReportResponse(
        summary=result.get("summary", ""),
        completed=result.get("completed", []),
        in_progress=result.get("in_progress", []),
        up_next=result.get("up_next", []),
        net_worth=result.get("net_worth", ""),
    )