import secrets

_sessions: dict[str, str] = {}


def create_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = username
    return token


def username_for_token(token: str) -> str | None:
    return _sessions.get(token)


def revoke_token(token: str) -> None:
    _sessions.pop(token, None)


def reset() -> None:
    _sessions.clear()