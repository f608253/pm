from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Board, Card, Column, User
from app.security import hash_password


def test_login_with_valid_credentials_returns_token(client: TestClient):
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )

    assert response.status_code == 200
    assert response.json()["username"] == "user"
    assert response.json()["token"]


def test_login_with_wrong_password_returns_401(client: TestClient):
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "nope"}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_with_unknown_user_returns_401(client: TestClient):
    response = client.post(
        "/api/auth/login", json={"username": "ghost", "password": "password"}
    )

    assert response.status_code == 401


def test_login_with_missing_fields_returns_422(client: TestClient):
    assert client.post("/api/auth/login", json={"username": "user"}).status_code == 422


def test_me_with_valid_token_returns_username(auth_client: TestClient):
    assert auth_client.get("/api/auth/me").json() == {"username": "user"}


def test_me_without_token_returns_401(client: TestClient):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_me_with_bogus_token_returns_401(client: TestClient):
    response = client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid session"


def test_me_with_non_bearer_scheme_returns_401(client: TestClient):
    response = client.get("/api/auth/me", headers={"Authorization": "Basic abc123"})

    assert response.status_code == 401


def test_logout_invalidates_token(client: TestClient):
    token = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    ).json()["token"]

    assert (
        client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"}).status_code
        == 200
    )
    assert client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    ).status_code == 401


def test_logout_without_token_returns_401(client: TestClient):
    assert client.post("/api/auth/logout").status_code == 401


def test_login_seeds_a_board_for_a_new_user(client: TestClient, db: Session):
    db.add(User(username="newbie", password_hash=hash_password("newbie-pass")))
    db.commit()

    response = client.post(
        "/api/auth/login", json={"username": "newbie", "password": "newbie-pass"}
    )
    assert response.status_code == 200

    boards = db.scalars(select(Board).where(Board.user_id != 0)).all()
    assert len(boards) == 2


def test_password_is_stored_hashed(client: TestClient, db: Session):
    user = db.scalar(select(User).where(User.username == "user"))

    assert user is not None
    assert user.password_hash.startswith("pbkdf2_sha256$")
    assert "password" not in user.password_hash