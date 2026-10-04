from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app import sessions
from app.api.deps import CurrentUser, DbSession, bearer_token
from app.kanban import ensure_board_for_user
from app.models import User
from app.schemas import UserResponse
from app.security import verify_password

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionResponse(BaseModel):
    token: str
    username: str


@router.post("/auth/login", response_model=SessionResponse)
def login(payload: LoginRequest, db: DbSession) -> SessionResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    ensure_board_for_user(db, user)

    token = sessions.create_session(user.username)
    return SessionResponse(token=token, username=user.username)


@router.post("/auth/logout")
def logout(token: str = Depends(bearer_token)) -> dict[str, bool]:
    sessions.revoke_token(token)
    return {"success": True}


@router.get("/auth/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return UserResponse(username=user.username)