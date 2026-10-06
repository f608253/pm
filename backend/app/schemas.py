from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Priority = Literal["high", "medium", "low"]
CardIntelligenceTask = Literal[
    "generate_details", "suggest_priority", "detect_duplicates"
]


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    details: str
    priority: str


class ColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    cards: list[CardOut]


class BoardSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str


class BoardOut(BoardSummary):
    columns: list[ColumnOut]


class BoardCreate(BaseModel):
    title: str = Field(default="My Board", min_length=1, max_length=120)


class BoardUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class ColumnCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    position: int | None = Field(default=None, ge=0)


class ColumnUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    position: int | None = Field(default=None, ge=0)


class CardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=4000)


class CardUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    details: str | None = Field(default=None, max_length=4000)
    priority: Priority | None = None
    column_id: int | None = Field(default=None)
    position: int | None = Field(default=None, ge=0)


class AiTestRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


class AiTestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    response: str
    model: str


class AiChatRequest(BaseModel):
    board_id: int
    question: str = Field(min_length=1, max_length=4000)


class DailySummaryRequest(BaseModel):
    board_id: int


class AppliedOperation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    operation: str
    detail: str


class AiChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    response: str
    board: BoardOut
    applied: list[AppliedOperation]
    skipped: list[str]


class AiNewsItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    link: str
    published: str


class AiNewsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[AiNewsItem]


class DailySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    summary: str


class CardIntelligenceRequest(BaseModel):
    board_id: int
    card_id: int
    task: CardIntelligenceTask


class DuplicateCard(BaseModel):
    card_id: int
    title: str
    similarity: str
    reason: str = ""


class CardIntelligenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    result: str
    details: str | None = None
    priority: Priority | None = None
    duplicates: list[DuplicateCard] = []


class WorkflowOptimizationRequest(BaseModel):
    board_id: int


class Bottleneck(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    column_id: int
    title: str
    reason: str


class NextAction(BaseModel):
    card_id: int
    card_title: str
    action: str


class WorkflowOptimizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bottlenecks: list[Bottleneck] = []
    next_actions: list[NextAction] = []
    suggestions: list[str] = []
    optimal_order: dict[int, list[int]] = {}


# --- smart summaries ---------------------------------------------------------


class BoardRequest(BaseModel):
    board_id: int


class SprintRetrospectiveResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    summary: str
    what_went_well: list[str] = []
    what_to_improve: list[str] = []
    actions: list[str] = []


class RiskItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    card_id: int
    card_title: str
    risk: str
    reason: str


class RiskAssessmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    summary: str
    risks: list[RiskItem] = []


class EffortEstimate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    card_id: int
    card_title: str
    effort: str
    hint: str


class EffortEstimationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    summary: str
    estimates: list[EffortEstimate] = []


class StandupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    summary: str
    points: list[str] = []
    blockers: list[str] = []


class WeeklyReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    summary: str
    completed: list[str] = []
    in_progress: list[str] = []
    up_next: list[str] = []
    net_worth: str = ""