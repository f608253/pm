from pydantic import BaseModel, ConfigDict, Field


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    details: str


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