# Kanban Studio: Comprehensive Architecture, System Design & Working Guide (Optimized & Extended)

---

## 1. Executive Summary & Core Platform Vision

**Kanban Studio** is an enterprise-grade, AI-native single-board project management platform. It combines responsive, zero-latency drag-and-drop Kanban workflow tracking with an autonomous AI co-pilot powered by LLMs (via OpenRouter's `openai/gpt-oss-120b` model).

### Key System Innovations & Architectural Advantages:
1. **Unified Single-Container SSG + FastAPI Architecture**: Next.js exports static HTML/JS/CSS assets (`output: 'export'`) directly to `/srv/static`. FastAPI serves the static frontend alongside its high-performance JSON API, eliminating Node.js container overhead in production deployments.
2. **FastAPI Synchronous Threadpool Execution**: Database route handlers are defined as standard synchronous `def` functions, executing inside FastAPI's underlying `anyio` worker threadpool. This isolates blocking SQLite disk I/O operations from python's asyncio event loop, yielding maximum throughput without async ORM driver overhead.
3. **Transactional AI Operations Engine**: The AI co-pilot interprets natural language queries ("Add a high-priority bug fix card to In Progress") and outputs structured JSON board operations (`add_card`, `edit_card`, `move_card`, `delete_card`). These mutations are validated and applied transactionally with ownership constraints.
4. **Comprehensive 9-Tool AI Productivity Suite**: Modal productivity tools covering Sprint Retrospectives, Risk Assessments, Story Point Effort Estimation (S/M/L hints), Daily Standup Talking Points, Bottleneck & Workflow Optimization, Card Acceptance Criteria, Priority Suggestions, Duplicate Task Detection, and Live AI Tech News RSS feeds.
5. **Deterministic Positional Re-indexing**: Columns and cards maintain explicit integer `position` fields. Every move operation sequentially re-indexes items to eliminate index gaps and ensure deterministic visual rendering order across clients.

---

## 2. Technology Stack & Architectural Decision Matrix

### 2.1 Frontend Engineering (Next.js 15, React 19, TypeScript, Tailwind CSS, @dnd-kit)

| Technology | Selected Strategy | Rationale & Performance Impact |
| :--- | :--- | :--- |
| **Next.js 15 (App Router)** | Static Export (`output: 'export'`) | Generates static assets at build time (`next build`). The output placed in `/srv/static` is served directly by FastAPI. Zero Node.js runtime memory consumption in production containers. |
| **React 19 & TypeScript** | Strict Mode & Strict Type Definitions | Guarantees strict type safety across board schemas, API response trees, component props, and drag-and-drop events. |
| **@dnd-kit (Core & Sortable)** | PointerSensors with Activation Constraints | Implements drag activation constraints (`distance: 6px`) to prevent unintentional drags during clicks. Uses prefix namespacing (`c{id}` for columns, `d{id}` for cards) to eliminate ID collisions between columns and cards. |
| **Tailwind CSS** | Custom CSS Variables Theme | Dark glassmorphism palette using custom theme variables (`--navy-dark`, `--primary-blue`, `--secondary-purple`, `--accent-yellow`). Provides high-contrast accessibility and consistent layout styling across viewports. |

### 2.2 Backend Engineering (FastAPI, Python 3.11+, SQLAlchemy 2.0, Pydantic v2)

| Technology | Selected Strategy | Rationale & Performance Impact |
| :--- | :--- | :--- |
| **FastAPI Framework** | Sync Route Handlers (`def`) | Executes handlers in an `anyio` worker threadpool. Prevents SQLite disk lock delays from blocking async event loops. Provides automated OpenAPI doc generation and strict Pydantic parsing. |
| **SQLAlchemy 2.0 ORM** | Declarative Mapped Models & Eager Loading | Uses `Mapped[T]` annotations and explicit `selectinload(Board.columns).selectinload(Column.cards)` serialization to prevent `DetachedInstanceError` when building response objects. |
| **Pydantic v2** | Strict Schema Validation & Conversion | Validates inputs (`min_length`, `max_length`, integer bounds, literals) and handles structured JSON output generation for AI tools. |
| **Security Architecture** | PBKDF2-SHA256 & Cryptographic Bearer Tokens | Hashes passwords with 600,000 iterations and 16-byte random salts. Session management uses cryptographically secure 32-byte URL-safe tokens stored in memory. |

### 2.3 Database Architecture (SQLite + Alembic Migrations)

| Strategy | Technical Implementation | Engineering Rationale |
| :--- | :--- | :--- |
| **Storage Engine** | Embedded SQLite (`/data/kanban.db`) | Portable, zero-configuration file database. Eliminates separate database server container setup while delivering low latency. |
| **Foreign Keys Hook** | `PRAGMA foreign_keys=ON` listener | SQLite disables foreign key enforcement by default. SQLAlchemy engine registers an event listener on `connect` executing the `PRAGMA` command on every session. |
| **Cascading Deletes** | `cascade="all, delete-orphan"` | Board deletion automatically purges child columns, cards, conversations, and messages; column deletion automatically purges associated cards. |
| **Sequential Positioning** | Integer `position` fields | Positional re-indexing algorithm in `kanban.py` recalculates indices (0, 1, 2...) on item creation, move, or deletion. |

---

## 3. Database Entity-Relationship (ER) Schema

```
+----------------------------------------------------+
|                       USERS                        |
+----------------------------------------------------+
| id             : INTEGER (PK, AutoIncrement)       |
| username       : VARCHAR(64) (UNIQUE, NOT NULL)    |
| password_hash  : VARCHAR(255) (NOT NULL)           |
| created_at     : DATETIME (DEFAULT CurrentTime)    |
+----------------------------------------------------+
                          | 1
                          |
                          | N (CASCADE DELETE)
+----------------------------------------------------+
|                       BOARDS                       |
+----------------------------------------------------+
| id             : INTEGER (PK, AutoIncrement)       |
| user_id        : INTEGER (FK -> users.id, INDEX)   |
| title          : VARCHAR(120) (NOT NULL)           |
| created_at     : DATETIME (DEFAULT CurrentTime)    |
| updated_at     : DATETIME (DEFAULT CurrentTime)    |
+----------------------------------------------------+
          | 1                                 | 1
          |                                   |
          | N (CASCADE DELETE)                | N (CASCADE DELETE)
+------------------------+   +------------------------+
|        COLUMNS         |   |     CONVERSATIONS      |
+------------------------+   +------------------------+
| id         : INTEGER   |   | id         : INTEGER   |
| board_id   : INTEGER   |   | board_id   : INTEGER   |
| title      : VARCHAR   |   | created_at : DATETIME  |
| position   : INTEGER   |   +------------------------+
| created_at : DATETIME  |                | 1
| updated_at : DATETIME  |                |
+------------------------+                | N (CASCADE DELETE)
          | 1                             +------------------------+
          |                               |        MESSAGES        |
          | N (CASCADE DELETE)            +------------------------+
+------------------------+                | id             : INT   |
|         CARDS          |                | conversation_id: INT   |
+------------------------+                | role           : STR   |
| id         : INTEGER   |                | content        : TEXT  |
| column_id  : INTEGER   |                | created_at     : TIME  |
| title      : VARCHAR   |                +------------------------+
| details    : TEXT      |
| priority   : VARCHAR   |
| position   : INTEGER   |
| created_at : DATETIME  |
| updated_at : DATETIME  |
+------------------------+
```

---

## 4. Comprehensive File-by-File Manifest & Responsibilities

### 4.1 Backend Architecture (`backend/app/`)

```
backend/app/
├── main.py               # FastAPI application entrypoint, CORS middleware setup, DB startup migrations & seed, SPA static file server handler
├── db.py                 # SQLAlchemy engine configuration, SQLite PRAGMA foreign_keys hook, get_db session dependency
├── models.py             # SQLAlchemy 2.0 ORM entities (User, Board, Column, Card, Conversation, Message)
├── schemas.py            # Pydantic v2 schemas for REST requests, responses, AI tool schemas, and validation models
├── security.py           # PBKDF2-SHA256 password hashing (600k iterations) and constant-time string verification
├── sessions.py           # In-memory bearer token session store mapping random 32-byte tokens to usernames
├── kanban.py             # Domain logic (board/column/card loading with ownership checks, positional re-ordering algorithm)
├── serializers.py        # ORM to Pydantic tree serialization using explicit eager loading (selectinload)
├── seed.py               # Database initial seed generator for default demo user, board, columns, and cards
├── services/
│   ├── ai.py             # OpenRouter API client, prompt engineering, TechCrunch RSS XML parser, structured JSON parsing
│   └── board_ops.py      # Transactional applier for AI-generated board operations (add_card, edit_card, move_card, delete_card)
└── api/
    ├── deps.py           # FastAPI dependency injection (DbSession, bearer_token, CurrentUser)
    ├── auth.py           # Endpoint handlers for login (/api/auth/login), logout (/api/auth/logout), and user verification (/api/auth/me)
    ├── boards.py         # REST CRUD endpoints for Boards (/api/boards)
    ├── columns.py        # REST CRUD endpoints for Columns & positional reordering (/api/columns)
    ├── cards.py          # REST CRUD endpoints for Cards & drag-and-drop movements (/api/cards)
    ├── ai.py             # Endpoints for AI Chat, Intelligence, Workflow, Summaries, News, Standups, Retrospectives, Risks, Effort
    ├── health.py         # Health check endpoint (/api/health) returning database connectivity status
    └── hello.py          # System check endpoint (/api/hello) returning service status
```

### 4.2 Frontend Architecture (`frontend/src/`)

```
frontend/src/
├── app/
│   ├── layout.tsx        # Next.js Root Layout with global CSS imports and metadata
│   ├── page.tsx          # Main entry page rendering AppRoot
│   └── globals.css       # CSS custom theme variables, dark mode styling, custom scrollbars, animations
├── components/
│   ├── AppRoot.tsx       # Auth gate component verifying localStorage session token and rendering LoginForm or KanbanBoard
│   ├── LoginForm.tsx     # Clean sign-in interface handling credentials input and authentication errors
│   ├── KanbanBoard.tsx   # Top-level board container managing @dnd-kit sensors, drag state overlays, header navigation, and 9 modal panels
│   ├── KanbanColumn.tsx  # Droppable column container rendering sortable card lists, title editing controls, and quick creation form
│   ├── KanbanCard.tsx    # Draggable card component with priority indicator, details preview, and action menu trigger
│   ├── KanbanCardPreview.tsx # DragOverlay floating preview card rendered during active drag operations
│   ├── CardActionsMenu.tsx   # Popover menu for card-level AI tools (Generate details, Suggest priority, Detect duplicates)
│   ├── NewCardForm.tsx   # Quick inline form for adding new cards at column bottoms
│   ├── ChatSidebar.tsx   # Sliding drawer interface for conversing with AI board assistant and executing changes
│   ├── ChatMessageView.tsx # Render individual chat messages with formatted AI operations badges
│   ├── ChatInput.tsx     # Message input box with keyboard submit shortcut (Enter) and submit trigger
│   ├── TypingIndicator.tsx # Pulse loading animation rendered while awaiting AI response
│   ├── AINewsPanel.tsx        # Modal displaying live AI technology news RSS articles with links
│   ├── DailySummaryPanel.tsx  # Modal displaying AI daily summary, completion metrics, and key focus items
│   ├── WorkflowPanel.tsx      # Modal displaying column bottlenecks, next actions per card, and card reordering recommendations
│   ├── RiskAssessmentPanel.tsx # Modal listing identified project risks, blockers, and single points of failure
│   ├── EffortEstimationPanel.tsx # Modal showing T-shirt effort sizing (S/M/L) and practical implementation hints
│   ├── SprintRetrospectivePanel.tsx # Modal detailing sprint achievements, improvement areas, and process action items
│   ├── StandupPanel.tsx       # Modal generating daily standup talking points and task blockers
│   └── WeeklyReportPanel.tsx  # Modal rendering weekly progress report (Completed, In Progress, Up Next, Net Impact)
└── lib/
    ├── api.ts            # Central API HTTP client wrapper with Bearer token injection, no-store cache, and 401 interception
    ├── kanban.ts         # Pure functional utilities for DnD ID formatting (`c1`, `d2`) and client array re-ordering (`moveCard`)
    └── chat.ts           # Helper utilities for chat message state manipulation
```

---

## 5. Complete Function-by-Function Reference

### 5.1 Backend Functions

#### `backend/app/main.py`
- `run_migrations() -> None`: Locates `alembic.ini` and programmatically executes database schema migrations up to the `head` revision.
- `init_database() -> None`: Establishes DB connection to execute `PRAGMA foreign_keys=ON`, triggers `run_migrations()`, and calls `seed(db)`.
- `on_startup() -> None`: FastAPI lifespan startup event callback executing `init_database()`.
- `serve_frontend(full_path: str)`: Catch-all GET handler serving static files from `/srv/static` or falling back to `index.html` for single-page client routing.

#### `backend/app/db.py`
- `database_url() -> str`: Reads `DATABASE_URL` environment variable or defaults to `sqlite:////data/kanban.db`.
- `_ensure_parent_directory(url: str) -> None`: Extracts file directory path from SQLite connection string and creates parent directories recursively if absent.
- `create_db_engine(url: str | None = None) -> Engine`: Configures SQLAlchemy engine with `check_same_thread=False` and attaches the foreign key connection hook.
- `_enable_foreign_keys(dbapi_connection, _record) -> None`: Event listener executing `PRAGMA foreign_keys=ON` on SQLite connection creation.
- `get_db() -> Iterator[Session]`: FastAPI dependency yielding a database session and ensuring session cleanup (`db.close()`) in `finally`.

#### `backend/app/security.py`
- `hash_password(password: str) -> str`: Generates a random 16-byte salt and computes PBKDF2-SHA256 hash with 600,000 iterations. Returns string formatted as `pbkdf2_sha256$600000$salt$digest`.
- `verify_password(password: str, encoded: str) -> bool`: Extracts iterations, salt, and digest from hash string; re-computes digest and verifies equality via `hmac.compare_digest`.

#### `backend/app/sessions.py`
- `create_session(username: str) -> str`: Generates a cryptographically random 32-byte URL-safe token, stores mapping `_sessions[token] = username`, and returns token.
- `username_for_token(token: str) -> str | None`: Fetches username associated with token.
- `revoke_token(token: str) -> None`: Deletes token from `_sessions`.
- `reset() -> None`: Clears all active session tokens.

#### `backend/app/kanban.py`
- `load_board(db: Session, board_id: int, user_id: int) -> Board`: Queries board by ID; raises HTTP 404 if missing, HTTP 403 if `user_id` does not match owner.
- `load_column(db: Session, column_id: int, user_id: int) -> Column`: Queries column joined with Board; validates user ownership; raises 404 or 403.
- `load_card(db: Session, card_id: int, user_id: int) -> Card`: Queries card joined with Column and Board; validates ownership; raises 404 or 403.
- `move_column(db: Session, column: Column, position: int) -> None`: Adjusts column position relative to board siblings and re-numbers indices sequentially starting from 0.
- `move_card(db: Session, card: Card, target_column_id: int, position: int) -> None`: Moves card to target column at requested index; re-indexes both source and destination column cards sequentially.
- `user_boards(db: Session, user_id: int) -> list[Board]`: Queries all boards owned by specified user ordered by ID.
- `ensure_board_for_user(db: Session, user: User) -> Board`: Returns user's first board; if none exists, calls `seed_default_board`.

#### `backend/app/serializers.py`
- `board_out(db: Session, board_id: int) -> BoardOut | None`: Queries board with explicit `selectinload(Board.columns).selectinload(Column.cards)` and converts ORM tree to Pydantic model.
- `to_board_out(board: Board) -> BoardOut`: Converts instantiated ORM `Board` tree into Pydantic `BoardOut` model.
- `board_summaries(db: Session, user_id: int) -> list[BoardSummary]`: Converts user's boards to lightweight summary models (ID and Title).

#### `backend/app/seed.py`
- `seed(db: Session) -> None`: Seeds default user (`user`/`password`) if user table is empty.
- `seed_default_board(db: Session, user: User) -> Board`: Generates default "Main Board" with columns ("To Do", "In Progress", "Done") and default sample cards.

#### `backend/app/services/ai.py`
- `api_key() -> str`: Reads `OPENROUTER_API_KEY` env variable; raises `AiNotConfigured` if missing or empty.
- `chat(messages, *, temperature, response_format) -> str`: Executes HTTP POST request to OpenRouter API (`https://openrouter.ai/api/v1/chat/completions`) using model `openai/gpt-oss-120b` with retry logic.
- `simple_chat(prompt: str) -> str`: Helper wrapping prompt in single user message.
- `board_context(board) -> str`: Serializes board state into compact JSON snapshot for LLM prompts.
- `extract_json(raw: str) -> dict`: Cleans LLM response string by stripping markdown code fences and parsing JSON.
- `chat_with_board(board, question, history) -> dict`: Assembles system prompt, board snapshot, chat history, and user question; parses LLM response into conversational text and board operations.
- `daily_summary(board) -> str`: Computes board metrics and requests 3-5 sentence daily summary from LLM.
- `card_intelligence(board, card_id, task) -> dict`: Prompts LLM for card details, priority suggestion, or duplicate task detection.
- `workflow_optimization(board) -> dict`: Prompts LLM to analyze board state and return column bottlenecks, card next actions, and card reordering recommendations.
- `sprint_retrospective(board) -> dict`: Prompts LLM for sprint achievements, improvement areas, and process action items.
- `risk_assessment(board) -> dict`: Prompts LLM to inspect unfinished cards and flag project risks/blockers.
- `effort_estimation(board) -> dict`: Prompts LLM for S/M/L story point sizing and technical implementation hints.
- `standup_points(board) -> dict`: Prompts LLM to format daily standup bullet points and blockers.
- `weekly_report(board) -> dict`: Prompts LLM to categorize cards into Completed, In Progress, Up Next, and Net Impact.
- `fetch_ai_news(randomize: bool) -> list[dict[str, str]]`: Fetches TechCrunch AI RSS feed using `httpx`, parses XML with `ElementTree`, sorts by publication date, optionally shuffles, and returns top news items.

#### `backend/app/services/board_ops.py`
- `_text(value, limit, label) -> str`: Trims string and enforces maximum character length constraint.
- `_column(db, column_id, user_id, board_id) -> Column`: Resolves column ID and verifies ownership.
- `_card(db, card_id, user_id, board_id) -> Card`: Resolves card ID and verifies ownership.
- `apply_operation(db, op, user, board_id) -> str`: Dispatches single operation dictionary (`add_card`, `edit_card`, `move_card`, `delete_card`) to database mutations; returns log string.
- `apply_operations(db, operations, user, board_id) -> tuple[list[str], list[str]]`: Executes list of operations transactionally; returns `applied` and `skipped` operation logs.

---

### 5.2 Frontend Functions & Utility Modules

#### `frontend/src/lib/api.ts`
- `setUnauthorizedHandler(handler: () => void)`: Registers callback triggered when fetch returns HTTP 401.
- `getToken()`, `setToken(token)`, `clearToken()`: Accesses, stores, or removes authentication token in `localStorage`.
- `request<T>(path, init)`: Core fetch wrapper injecting `Authorization: Bearer <token>`, setting `cache: "no-store"`, and handling error responses.
- Exported API client methods: `login`, `logout`, `me`, `fetchBoardSummaries`, `fetchBoard`, `createColumn`, `renameColumn`, `deleteColumn`, `createCard`, `updateCard`, `deleteCard`, `sendChatMessage`, `fetchAiNews`, `fetchDailySummary`, `cardIntelligence`, `workflowOptimization`, `fetchSprintRetrospective`, `fetchRiskAssessment`, `fetchEffortEstimation`, `fetchStandup`, `fetchWeeklyReport`.

#### `frontend/src/lib/kanban.ts`
- `columnDndId(id: number) -> string`: Prefixes column ID as `c{id}` for @dnd-kit targeting.
- `cardDndId(id: number) -> string`: Prefixes card ID as `d{id}` for @dnd-kit targeting.
- `parseTarget(columns, dndId) -> DndTarget | null`: Parses `c` or `d` prefix and retrieves target entity from state.
- `moveCard(columns, activeDndId, overDndId) -> Column[]`: Pure functional utility updating client-side column array during card drag operations for instant optimistic state updates.

---

## 6. Full REST API Specification Table

| Method | Endpoint Path | Auth Required | Request Body / Query Params | Response Model / Payload |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | No | `{ "username": "...", "password": "..." }` | `SessionResponse` (`token`, `username`) |
| `POST` | `/api/auth/logout` | Yes | Header: `Authorization: Bearer <token>` | `{ "success": true }` |
| `GET` | `/api/auth/me` | Yes | Header: `Authorization: Bearer <token>` | `UserResponse` (`id`, `username`) |
| `GET` | `/api/boards` | Yes | - | `list[BoardSummary]` (`id`, `title`) |
| `POST` | `/api/boards` | Yes | `{ "title": "..." }` | `BoardOut` (Full board tree) |
| `GET` | `/api/boards/{id}` | Yes | Path param: `id` | `BoardOut` (Full board tree) |
| `PATCH` | `/api/boards/{id}` | Yes | `{ "title": "..." }` | `BoardOut` |
| `DELETE`| `/api/boards/{id}` | Yes | Path param: `id` | `204 No Content` |
| `POST` | `/api/boards/{id}/columns` | Yes | `{ "title": "..." }` | `ColumnOut` |
| `PATCH` | `/api/columns/{id}` | Yes | `{ "title": "...", "position": 0 }` | `ColumnOut` |
| `DELETE`| `/api/columns/{id}` | Yes | Path param: `id` | `204 No Content` |
| `POST` | `/api/columns/{id}/cards` | Yes | `{ "title": "...", "details": "...", "priority": "..." }` | `CardOut` |
| `PATCH` | `/api/cards/{id}` | Yes | `{ "title": "...", "details": "...", "priority": "...", "column_id": 1, "position": 0 }` | `CardOut` |
| `DELETE`| `/api/cards/{id}` | Yes | Path param: `id` | `204 No Content` |
| `POST` | `/api/ai/chat` | Yes | `{ "board_id": 1, "message": "..." }` | `AiChatResponse` (`response`, `applied_ops`, `skipped_ops`, `board`) |
| `POST` | `/api/ai/card-intelligence` | Yes | `{ "board_id": 1, "card_id": 1, "task": "generate_details" }` | `CardIntelligenceResponse` (`task`, `result`, `card_id`) |
| `POST` | `/api/ai/workflow-optimization` | Yes | `{ "board_id": 1 }` | `WorkflowOptimizationResponse` (`bottlenecks`, `next_actions`, `reorders`) |
| `POST` | `/api/ai/summary` | Yes | `{ "board_id": 1 }` | `DailySummaryResponse` (`summary`, `metrics`) |
| `POST` | `/api/ai/retrospective` | Yes | `{ "board_id": 1 }` | `SprintRetrospectiveResponse` (`summary`, `wins`, `improvements`, `actions`) |
| `POST` | `/api/ai/risk-assessment` | Yes | `{ "board_id": 1 }` | `RiskAssessmentResponse` (`risks`, `blockers`) |
| `POST` | `/api/ai/effort-estimation` | Yes | `{ "board_id": 1 }` | `EffortEstimationResponse` (`estimates`) |
| `POST` | `/api/ai/standup` | Yes | `{ "board_id": 1 }` | `StandupResponse` (`yesterday`, `today`, `blockers`) |
| `POST` | `/api/ai/weekly-report` | Yes | `{ "board_id": 1 }` | `WeeklyReportResponse` (`completed`, `in_progress`, `up_next`, `impact`) |
| `GET` | `/api/ai/news` | Yes | Query param: `randomize=true` | `AiNewsResponse` (`items`: `title`, `link`, `published`) |
| `GET` | `/api/health` | No | - | `{ "status": "ok", "database": "connected" }` |

---

## 7. End-to-End System Workflows & Flowcharts

### 7.1 Drag-and-Drop Card Movement Execution Flow

```
[User Initiates Card Drag]
          │
          ▼
1. @dnd-kit PointerSensor checks 6px distance constraint.
          │
          ▼
2. `onDragStart` fires -> `activeCard` set -> DragOverlay renders preview clone.
          │
          ▼
3. `onDragEnd` fires -> calls `moveCard()` in `lib/kanban.ts`.
          │
          ▼
4. OPTIMISTIC UPDATE: Local React state (`setBoard`) updates instantly (0ms latency).
          │
          ▼
5. ASYNC SYNC: Frontend fires `PATCH /api/cards/{id}` with new `column_id` and `position`.
          │
          ▼
6. BACKEND EXECUTION: `move_card()` in `kanban.py` opens SQLite transaction.
          │
          ├─► Re-numbers sibling cards sequentially in source column.
          ├─► Inserts card into target column at requested position.
          └─► Re-numbers sibling cards sequentially in target column.
          │
          ▼
7. TRANSACTION COMMIT: DB transaction commits.
          │
  [On Request Error]
          └─► UI reverts optimistic update to previous state & triggers error toast.
```

### 7.2 AI Chat Co-Pilot Natural Language Mutation Flow

```
[User Input: "Move task #3 to Done and mark as High priority"]
          │
          ▼
1. ChatSidebar posts request to `POST /api/ai/chat`.
          │
          ▼
2. FastAPI handler resolves Board snapshot -> Closes DB read transaction -> Fetches last 20 messages.
          │
          ▼
3. OpenRouter API processing (`openai/gpt-oss-120b`):
   Sends system preamble, board snapshot JSON, and chat history.
          │
          ▼
4. LLM returns JSON structure:
   {
     "response": "Moved card #3 to Done and set priority to High.",
     "operations": [
       {"type": "edit_card", "card_id": 3, "priority": "high"},
       {"type": "move_card", "card_id": 3, "column_id": 3, "position": 0}
     ]
   }
          │
          ▼
5. `board_ops.apply_operations()` executes operations transactionally in SQLite:
   Validates user ownership and input bounds -> Mutates DB -> Appends history message.
          │
          ▼
6. Backend returns updated board tree in response payload.
          │
          ▼
7. Frontend updates board state and renders formatted operation badge in chat drawer.
```

---

## 8. Development, Testing & Build Automation

### 8.1 Local Environment Scripts

- **Full-Stack Launch**: `./scripts/start.sh` (Unix) or `.\scripts\start.ps1` (Windows) — Builds Next.js static site, constructs Docker image, and runs app container at `http://localhost:8000`.
- **Stop Environment**: `./scripts/stop.sh` or `.\scripts\stop.ps1` — Gracefully terminates running containers.
- **Run Backend Tests**: `./scripts/test.sh` or `.\scripts\test.ps1` — Runs `pytest` inside backend container environment.

### 8.2 Testing Strategy

1. **Backend Unit & Integration Tests (`backend/tests/`)**:
   - `test_auth.py`: Tests password hashing, login, logout, and token authorization middleware.
   - `test_database.py`: Tests SQLite foreign key pragma, sessions, and cascade deletes.
   - `test_boards.py`: Tests board/column/card CRUD and positional reordering.
   - `test_board_ops.py`: Tests AI board operation validation and transactional execution.
   - `test_ai_service.py` & `test_ai_endpoint.py`: Tests OpenRouter retries, prompt formatting, JSON extraction, and API handlers.

2. **Frontend Component & Unit Tests (`frontend/src/**/*.test.tsx`)**:
   - `kanban.test.ts`: Tests `moveCard` array reordering algorithm and DnD ID parsing.
   - `api.test.ts`: Tests API client request helper, token injection, and error handling.
   - Component test suites for `KanbanBoard`, `ChatSidebar`, `CardActionsMenu`, and all 9 AI modal panels.

---
