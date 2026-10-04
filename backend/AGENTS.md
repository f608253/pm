# Backend

FastAPI application. Serves the JSON API under `/api` and the statically exported
frontend at `/`. Data lives in SQLite.

## Layout

```
backend/
├── app/
│   ├── main.py          # App factory, startup migration+seed, static file serving
│   ├── db.py            # Engine, session factory, get_db dependency, FK pragma
│   ├── models.py        # SQLAlchemy models: User, Board, Column, Card
│   ├── schemas.py       # Pydantic request/response models
│   ├── security.py      # PBKDF2 password hashing
│   ├── sessions.py      # In-memory bearer token store
│   ├── seed.py          # Demo user, board, columns, cards
│   ├── kanban.py        # Ownership lookups and position renumbering
│   ├── serializers.py   # Board -> nested Pydantic tree
│   └── api/
│       ├── deps.py      # DbSession, CurrentUser, bearer_token
│       ├── auth.py      # login, logout, me
│       ├── boards.py    # list, create, get, update, delete
│       ├── columns.py   # create, update, delete
│       ├── cards.py     # create, update, delete
│       ├── health.py
│       └── hello.py
├── migrations/          # Alembic
├── alembic.ini
└── tests/
```

## Run

The container is the supported way to run this. See `scripts/start.sh`.

```bash
uv pip install -e ".[dev]"
uvicorn app.main:app --reload
pytest
```

## Key decisions

- **SQLAlchemy 2.x sync sessions.** Route handlers are `def`, not `async def`, so
  FastAPI runs them in a threadpool and blocking ORM calls are safe.
- **Eager loading is explicit.** `serializers.board_out` uses `selectinload` and
  returns plain Pydantic objects, so no lazy load can fire during response
  serialisation.
- **`PRAGMA foreign_keys=ON` on every connection.** SQLite ignores foreign keys
  otherwise, and cascades silently do nothing. Set in a SQLAlchemy connect event.
- **Positions are integers, renumbered on every move** in `kanban.move_card` and
  `kanban.move_column`. No fractional gaps.
- **Sessions are in memory.** A container restart signs everyone out. Users are in
  the database; tokens are not.

## Migrations

Startup runs `alembic upgrade head` then seeds. Add future migrations with
`alembic revision --autogenerate`.

## Tests

```bash
pytest                                  # with coverage, fails under 80%
pytest tests/test_boards.py -k cascade   # single area
```

`conftest.py` points `DATABASE_URL` at a temp file before the app is imported, so
tests never touch the real database. Each test gets a dropped, recreated, seeded
schema.

Note: assertions after an HTTP mutation call `db.expire_all()` first, because the
request runs in a different session and the test session would otherwise serve
stale objects from its identity map.