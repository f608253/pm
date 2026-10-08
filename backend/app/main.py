import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.api import ai, auth, boards, cards, columns, health, hello
from app.db import SessionLocal, engine
from app.seed import seed

STATIC_DIR = Path(os.environ.get("STATIC_DIR", "/srv/static")).resolve()


def run_migrations() -> None:
    backend_dir = Path(__file__).resolve().parent.parent
    ini_path = backend_dir / "alembic.ini"
    config = Config(str(ini_path))
    config.set_main_option("script_location", str(backend_dir / "migrations"))
    command.upgrade(config, "head")


def init_database() -> None:
    with engine.connect() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
    run_migrations()
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


app = FastAPI(title="Kanban Studio API", version="0.2.0")

allowed_origins_raw = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000",
)
allowed_origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]
allow_credentials = "*" not in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_database()


app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(ai.router, prefix="/api", tags=["ai"])
app.include_router(boards.router, prefix="/api", tags=["boards"])
app.include_router(cards.router, prefix="/api", tags=["cards"])
app.include_router(columns.router, prefix="/api", tags=["columns"])
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(hello.router, prefix="/api", tags=["hello"])


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    """Serve the static frontend, falling back to index.html for client-side routes."""
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")

    candidate = (STATIC_DIR / full_path).resolve()
    if full_path and candidate.is_file() and candidate.is_relative_to(STATIC_DIR):
        return FileResponse(candidate)

    return FileResponse(STATIC_DIR / "index.html")