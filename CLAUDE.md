# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Full-Stack (Docker)
- Start local environment: `./scripts/start.sh` (Unix) or `.\scripts\start.ps1` (Windows) — serves app at `http://localhost:8000`
- Stop container: `./scripts/stop.sh` or `.\scripts\stop.ps1`
- Run backend tests in Docker: `./scripts/test.sh` or `.\scripts\test.ps1`

### Backend (`backend/`)
- Install dependencies: `uv pip install -e ".[dev]"`
- Run dev server: `uvicorn app.main:app --reload`
- Run all tests (pytest + 80% coverage check): `pytest`
- Run single test file: `pytest tests/test_boards.py`
- Run specific test: `pytest tests/test_boards.py -k test_name`
- Alembic database migration: `alembic revision --autogenerate -m "description"` then `alembic upgrade head`

### Frontend (`frontend/`)
- Install dependencies: `npm install`
- Run dev server: `npm run dev` (http://localhost:3000)
- Build static export: `npm run build`
- Run linter: `npm run lint`
- Run all unit tests: `npm run test`
- Run single unit test: `npx vitest run src/lib/kanban.test.ts`
- Run unit test by pattern: `npx vitest run -t "test pattern"`
- Run unit tests in watch mode: `npm run test:unit:watch`
- Run E2E tests (against containerized app on port 8000): `npm run test:e2e`

## Architecture Overview

### Container & Build Pipeline
- Multi-stage Docker build: Next.js exports static site (`output: 'export'`) to `/srv/static`, FastAPI serves static files at `/` and JSON API at `/api/`.
- SQLite database stored at `./data/kanban.db`.

### Backend Architecture
- **FastAPI Sync Handlers:** Route handlers are synchronous (`def`, not `async def`), executing in FastAPI's threadpool to allow safe blocking SQLAlchemy 2.x calls.
- **Database & Foreign Keys:** SQLite requires explicit `PRAGMA foreign_keys=ON` attached to SQLAlchemy connect events. Migrations managed by Alembic.
- **Eager Loading:** `serializers.py` uses explicit `selectinload` to build Pydantic response trees before returning, avoiding lazy-loading issues across session boundaries.
- **Position Renumbering:** Columns and cards use integer `position` fields, renumbered sequentially on every move via `kanban.py`.
- **Authentication:** In-memory session store (`sessions.py`) maps opaque bearer tokens to users (`user` / `password` for MVP).

### AI Integration Services
- Uses OpenRouter API (`openai/gpt-oss-120b` model) via `backend/app/services/ai.py`.
- **Chat (`/api/ai/chat`):** Sends board snapshot and conversation history; expects structured JSON output (`operations`: `add_card`, `edit_card`, `move_card`, `delete_card`) and applies updates transactionally.
- **Card Intelligence (`/api/ai/card-intelligence`):** Generates card details/acceptance criteria, priority suggestions, and duplicate detection. Results require explicit user confirmation before persisting.
- **Workflow Optimization (`/api/ai/workflow-optimization`):** Recommends next actions, identifies column bottlenecks, and suggests column card reordering.

### Frontend Architecture
- **Auth Gate:** Single root route `/` in `AppRoot.tsx` gates access between `LoginForm` and `KanbanBoard` based on bearer token in `localStorage`.
- **Drag & Drop:** Powered by `@dnd-kit` (core, sortable). State managed via local React state and synchronized with backend API endpoints in `src/lib/api.ts`.
- **Panels & Sidebars:** `ChatSidebar`, `WorkflowPanel`, and card action menus trigger AI endpoints and apply returned board operations.
