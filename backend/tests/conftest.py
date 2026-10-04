import os
import tempfile
from pathlib import Path

TEST_DB = Path(tempfile.gettempdir()) / "kanban_studio_test.db"
TEST_DB.unlink(missing_ok=True)
# Must be set before app.db is imported, otherwise the engine binds the real DB.
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import sessions  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    sessions.reset()
    with SessionLocal() as db:
        seed(db)
    yield


@pytest.fixture
def db() -> Session:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    client.headers["Authorization"] = f"Bearer {response.json()['token']}"
    return client


@pytest.fixture
def intruder(db: Session) -> User:
    user = User(username="intruder", password_hash=hash_password("password"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user