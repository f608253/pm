from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import Annotated

from app import sessions
from app.db import get_db
from app.models import User

DbSession = Annotated[Session, Depends(get_db)]


def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


def current_user(
    db: DbSession, authorization: Annotated[str | None, Header()] = None
) -> User:
    token = bearer_token(authorization)
    username = sessions.username_for_token(token)
    if username is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


CurrentUser = Annotated[User, Depends(current_user)]