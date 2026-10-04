import os
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, select

from app import security
from app.models import Base, Board, Card, Column, User
from app.seed import seed


def test_database_file_is_created_with_schema_and_seed(tmp_path: Path):
    """First run against a missing file must create the schema and seed it."""
    db_path = tmp_path / "fresh.db"
    url = f"sqlite:///{db_path}"
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url

    from app.db import create_db_engine
    from app.main import run_migrations

    try:
        assert not db_path.exists()

        engine = create_db_engine(url)
        run_migrations()

        assert db_path.exists()
        assert set(inspect(engine).get_table_names()) >= {
            "users",
            "boards",
            "columns",
            "cards",
            "alembic_version",
        }

        from sqlalchemy.orm import sessionmaker

        session = sessionmaker(bind=engine)()
        try:
            seed(session)
            user = session.scalar(select(User).where(User.username == "user"))
            board = session.scalar(select(Board))
            assert user is not None
            assert security.verify_password("password", user.password_hash)
            assert board is not None
            assert len(board.columns) == 5
            assert sum(len(c.cards) for c in board.columns) == 8
        finally:
            session.close()
        engine.dispose()
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


def test_seed_is_idempotent(db):
    before = len(db.scalars(select(Board)).all())
    seed(db)
    seed(db)

    assert len(db.scalars(select(Board)).all()) == before
    assert len(db.scalars(select(User)).all()) == 1


def test_foreign_keys_are_enforced_on_every_connection():
    from app.db import create_db_engine

    engine = create_db_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
    engine.dispose()


def test_ensure_parent_directory_creates_missing_folders(tmp_path: Path):
    from app.db import create_db_engine

    nested = tmp_path / "a" / "b" / "kanban.db"
    engine = create_db_engine(f"sqlite:///{nested}")
    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
    engine.dispose()
    assert nested.parent.is_dir()


@pytest.mark.parametrize("bad_hash", ["", "plaintext", "pbkdf2_sha256$notanint$a$b"])
def test_verify_password_rejects_malformed_hashes(bad_hash: str):
    assert security.verify_password("password", bad_hash) is False


def test_verify_password_rejects_wrong_algorithm():
    encoded = security.hash_password("password").replace("pbkdf2_sha256", "bcrypt")

    assert security.verify_password("password", encoded) is False


def test_hashes_are_salted_and_distinct():
    first = security.hash_password("password")
    second = security.hash_password("password")

    assert first != second
    assert security.verify_password("password", first)
    assert security.verify_password("password", second)