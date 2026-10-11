# Kanban Studio

A project management MVP: sign in, work a Kanban board with drag and drop, and use an AI
assistant in the sidebar to add, edit, move, or delete cards by asking for it.

- **Frontend:** NextJS 16, React 19, Tailwind v4, dnd-kit, statically exported
- **Backend:** Python FastAPI, SQLAlchemy 2, Alembic, SQLite
- **AI:** OpenRouter, model `openai/gpt-oss-120b`
- **Packaging:** everything runs in one Docker container; FastAPI serves both the JSON API
  under `/api` and the frontend at `/`

Sign in with **`user`** / **`password`**.

## Layout

```
backend/     FastAPI app, SQLAlchemy models, Alembic migrations, pytest suite
frontend/    NextJS app, vitest unit tests, Playwright e2e tests
scripts/     start, stop, and test scripts for Mac/Linux (sh) and Windows (ps1)
docs/        PLAN.md (build plan and status), DATABASE.md (schema decisions)
data/        SQLite database file (created on first run)
```

## Prerequisites

- Docker Desktop (must be running)
- Node.js 24 and Python 3.11+ only if you want to run frontend or backend tooling outside
  the container. Everything below works with Docker alone.

## 1. Configure

```bash
cp .env.example .env      # macOS/Linux
Copy-Item .env.example .env   # Windows PowerShell
```

Edit `.env` and set your OpenRouter key:

```
OPENROUTER_API_KEY=sk-or-v1-...
DATABASE_URL=sqlite:////data/kanban.db
```

The AI features need a valid key. Without one the app still runs, but the assistant
returns `OpenRouter rejected OPENROUTER_API_KEY`.

Never put a real key in `.env.example`; it is committed to the repository.

## 2. Build and run

```bash
./scripts/start.sh        # macOS/Linux
.\scripts\start.ps1       # Windows PowerShell
```

This checks Docker is running and `.env` exists, then runs `docker compose up --build -d`.
The image builds the frontend and installs the backend, so first run takes a few minutes.

Open http://localhost:8000 and sign in.

Stop with `./scripts/stop.sh` (`.\scripts\stop.ps1` on Windows).

### Changing `.env`

Compose reads environment variables when the container is created. After editing `.env` you
must recreate the container, otherwise it keeps the old values:

```bash
docker compose up -d --force-recreate
```

## 3. Verify

Run these in order. Each step should pass before moving to the next.

```bash
# 1. Container is up and healthy
curl http://localhost:8000/api/health          # {"status":"ok",...}

# 2. Backend tests with coverage (fails under 80%)
./scripts/test.sh                               # macOS/Linux
.\scripts\test.ps1                              # Windows

# 3. Frontend lint and production build
cd frontend
npm install          # first time only
npm run lint
npm run build
cd ..

# 4. End-to-end tests against the running app on :8000
cd frontend
npm run test:unit    # vitest
npm run test:e2e     # playwright
cd ..
```

`npm run test:e2e` needs the app already running. Point it elsewhere with
`PLAYWRIGHT_BASE_URL`, for example:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000 npx playwright test --project=chromium
```

The Playwright global setup deletes and recreates `data/kanban.db` before each run, so every
run starts from the seed data and a failed run cannot affect the next one. Expect the demo
board to be reset after running the suite.

Current status: 131 backend tests at 97.6% coverage, 67 frontend unit tests, 16 Playwright
tests. Four of the Playwright tests call the real OpenRouter model and need a valid key.

## Everyday commands

```bash
docker compose up -d --build            # rebuild and restart
docker compose up -d --force-recreate   # pick up new environment variables
docker compose down                     # stop
docker compose logs -f backend          # follow backend logs
docker compose ps                       # container status

# Run a single backend test file. --no-cov skips the coverage gate, which a
# single file cannot reach on its own.
docker compose exec backend pytest tests/test_ai_chat.py -v --no-cov

# Coverage detail
docker compose exec -T backend pytest --cov=app --cov-report=term-missing
```

Inside `frontend/`:

```bash
npm run dev              # dev server on :3000, see caveat below
npm run build            # static export to out/
npm run lint
npm run test:unit        # vitest single run
npm run test:unit:watch
npm run test:e2e
npm run test:all         # unit then e2e
```

Database migrations run automatically at container startup (`alembic upgrade head`, then
seed if the database is empty). To add one:

```bash
docker compose exec backend alembic revision --autogenerate -m "describe the change"
```

## Important constraints

**E2E tests must target the Docker build, not `npm run dev`.** The frontend is statically
exported, and `output: "export"` makes Next ignore rewrites, so a standalone dev server
cannot proxy `/api`. The frontend and API only share an origin through FastAPI, so
Playwright points at port 8000 and starts no dev server.

**Sessions are in memory.** Tokens live in the backend process, so restarting the container
signs everyone out.

**One demo user, one board.** The database supports multiple users, but the UI signs in as
the single demo user.

**The database is reset by the test suite and by deleting `data/kanban.db`.** Stop the
container first, delete the file, then start again to return to clean seed data.

## Further reading

- `docs/PLAN.md` - build plan with per-part status and what was deliberately left out
- `docs/DATABASE.md` - schema and persistence decisions
- `AGENTS.md` - project requirements and coding standards
- `http://localhost:8000/docs` - interactive API documentation once the app is running