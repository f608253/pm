# Kanban Studio: Comprehensive Architecture & Working Guide

## 1. Executive Summary & Core Purpose

**Kanban Studio** is an AI-enhanced single-board Kanban project management application. It bridges traditional Kanban project tracking (drag-and-drop cards, custom columns, priorities) with an intelligent AI co-pilot powered by LLMs (via OpenRouter's `openai/gpt-oss-120b` model).

### Key Architectural Highlights:
- **Unified Single-Container Deployment**: Next.js exports static HTML/JS assets (`output: 'export'`) directly to a directory served by FastAPI, eliminating Node.js container runtime overhead in production.
- **FastAPI Sync Threadpool Architecture**: Database operations execute via synchronous SQLAlchemy handlers running in FastAPI's background threadpool (`anyio`), safely isolating SQLite blocking I/O without blocking the async event loop.
- **Transactional AI Board Operations**: The AI assistant can execute natural language operations (`add_card`, `edit_card`, `move_card`, `delete_card`) directly against the board state with strict schema validation and transaction safety.
- **Intelligent Productivity Panels**: 8 dedicated modal tools for Sprint Retrospectives, Risk Assessments, Effort Estimation (S/M/L hints), Daily Standup Talking Points, Bottleneck & Workflow Optimization, Card-level Duplicate Detection, Acceptance Criteria generation, and Live AI Tech News RSS aggregation.

---

## 2. Technology Stack & Architectural Trade-offs

### 2.1 Frontend Choice: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, @dnd-kit

| Choice | Rationale & Technical Advantage |
| :--- | :--- |
| **Next.js (`output: 'export'`)** | Configured in `next.config.ts` for static site generation (SSG). Produces plain HTML/CSS/JS assets placed in `/srv/static`. Allows serving the entire full-stack application from a single FastAPI server with zero Node.js server dependencies in production. |
| **React 19 & TypeScript** | Provides strict type safety across board schemas, API payload definitions, and UI component states, preventing runtime schema mismatches. |
| **@dnd-kit (Core & Sortable)** | Modern, accessible drag-and-drop framework. Uses `PointerSensor` with activation constraints (`distance: 6` pixels) to distinguish clicks from drags. Drag targets use namespaced prefixes (`c{id}` for columns, `d{id}` for cards) to prevent ID collisions between columns and cards. |
| **Tailwind CSS** | Custom design system using CSS variables (`--navy-dark`, `--primary-blue`, `--secondary-purple`, `--accent-yellow`, `--surface`) providing consistent dark aesthetics and glassmorphism UI elements across all components. |

### 2.2 Backend Choice: FastAPI, Python 3.11+, SQLAlchemy 2.0, Pydantic v2

| Choice | Rationale & Technical Advantage |
| :--- | :--- |
| **FastAPI Framework** | High-performance Python web framework with automatic OpenAPI documentation generation and strict request payload parsing via Pydantic v2. |
| **Synchronous Handlers (`def`)** | FastAPI executes standard `def` route functions in an `anyio` threadpool. This ensures blocking SQLite disk I/O operations do not block Python's asyncio event loop, enabling high throughput without async driver complexities. |
| **SQLAlchemy 2.0 ORM** | Declarative Mapped models (`Mapped[int]`, `mapped_column`) with explicit relationship cascading (`cascade="all, delete-orphan"`) and positional sorting. |
| **Explicit `selectinload` Eager Serializer** | To avoid `DetachedInstanceError` during response serialization, `serializers.py` uses `selectinload(Board.columns).selectinload(Column.cards)` to materialize plain Pydantic models before closing or rolling back DB sessions. |
| **Pydantic v2** | Strong input validation (`min_length`, `max_length`, `ge=0`, Literal types) for all REST API payloads and AI tool output schemas. |

### 2.3 Database Choice: SQLite + Alembic Migrations

| Choice | Rationale & Technical Advantage |
| :--- | :--- |
| **SQLite (`kanban.db`)** | Zero-configuration file-based database stored at `/data/kanban.db`. Ideal for self-contained desktop applications and single-instance server deployments with minimal maintenance overhead. |
| **PRAGMA Foreign Key Listener** | SQLite disables foreign key enforcement by default. `db.py` attaches an engine event listener on `connect` (`PRAGMA foreign_keys=ON`) enforcing relational integrity across boards, columns, cards, conversations, and messages. |
| **Sequential Integer Positioning** | Columns and cards maintain explicit `position` integer fields. When moving an item, `kanban.py` re-numbers sibling positions to guarantee zero positional gaps and deterministic rendering order. |

---

## 3. Directory & File Usage Breakdown

### 3.1 Backend Repository (`backend/app/`)

```
backend/app/
├── main.py               # FastAPI application entry, CORS middleware, startup database initialization, static SPA file server fallback
├── db.py                 # Database engine setup, SQLite PRAGMA foreign key hook, session factory generator
├── models.py             # SQLAlchemy 2.0 ORM entities (User, Board, Column, Card, Conversation, Message)
├── schemas.py            # Pydantic v2 schemas for API requests, responses, AI tool schemas, and output validation
├── security.py           # Password hashing using PBKDF2-SHA256 with 600,000 iterations and random 16-byte salt
├── sessions.py           # In-memory bearer token session storage mapping tokens to usernames
├── kanban.py             # Core Kanban domain logic (board/column/card loading, ownership checks, positional re-ordering)
├── serializers.py        # ORM to Pydantic tree serialization using explicit eager loading (selectinload)
├── seed.py               # Initial seed data generator for default demo user, board, columns, and sample cards
├── services/
│   ├── ai.py             # OpenRouter API HTTP client, prompt engineering, TechCrunch RSS news parser, structured JSON parsing
│   └── board_ops.py      # Transactional applier for AI-generated board operations (add_card, edit_card, move_card, delete_card)
└── api/
    ├── deps.py           # FastAPI dependency injectors (DbSession, bearer_token, CurrentUser)
    ├── auth.py           # Endpoint handlers for /api/auth/login, /api/auth/logout, /api/auth/me
    ├── boards.py         # REST endpoints for Board CRUD (/api/boards)
    ├── columns.py        # REST endpoints for Column CRUD & positional reordering (/api/columns)
    ├── cards.py          # REST endpoints for Card CRUD & drag-and-drop movement (/api/cards)
    ├── ai.py             # Endpoints for AI Chat, Intelligence, Workflow, Summaries, News, Standups, Retrospectives, Risks, Effort
    ├── health.py         # Endpoint /api/health returning database connectivity status
    └── hello.py          # Endpoint /api/hello returning server status greeting
```

### 3.2 Frontend Repository (`frontend/src/`)

```
frontend/src/
├── app/
│   ├── layout.tsx        # Next.js Root Layout with global CSS imports and metadata
│   ├── page.tsx          # Main entry route rendering AppRoot
│   └── globals.css       # Global CSS variables, custom dark theme typography, scrollbar styles
├── components/
│   ├── AppRoot.tsx       # Auth gate component managing login state and token verification
│   ├── LoginForm.tsx     # Sign-in form with username/password fields and error handling
│   ├── KanbanBoard.tsx   # Top-level board view managing DnD context, header actions, and modal panels
│   ├── KanbanColumn.tsx  # Droppable column container rendering card list and title editing
│   ├── KanbanCard.tsx    # Draggable card component with priority badge and actions menu
│   ├── KanbanCardPreview.tsx # DragOverlay preview rendered while dragging a card
│   ├── CardActionsMenu.tsx   # Popover menu for Card Intelligence (Generate details, Suggest priority, Duplicates)
│   ├── NewCardForm.tsx   # Quick card creation form at bottom of each column
│   ├── ChatSidebar.tsx   # Sliding drawer for AI Assistant chat with message history
│   ├── ChatMessageView.tsx # Render individual chat messages with operation badges
│   ├── ChatInput.tsx     # Prompt input box for AI Assistant
│   ├── TypingIndicator.tsx # Loading animation while waiting for AI responses
│   ├── AINewsPanel.tsx        # Modal displaying live AI technology news RSS items
│   ├── DailySummaryPanel.tsx  # Modal for AI daily summary and key recommendations
│   ├── WorkflowPanel.tsx      # Modal showing bottleneck analysis, next actions, and card reordering
│   ├── RiskAssessmentPanel.tsx # Modal listing identified project risks and single points of failure
│   ├── EffortEstimationPanel.tsx # Modal showing S/M/L effort sizing and implementation hints
│   ├── SprintRetrospectivePanel.tsx # Modal detailing sprint wins, areas to improve, and action items
│   ├── StandupPanel.tsx       # Modal generating daily standup talking points and blockers
│   └── WeeklyReportPanel.tsx  # Modal rendering weekly progress report (Completed, In Progress, Up Next)
└── lib/
    ├── api.ts            # Central HTTP client (fetch wrapper with Bearer token injection & 401 handling)
    ├── kanban.ts         # Pure functional helpers for DnD ID parsing and array manipulation (`moveCard`)
    └── chat.ts           # Chat helper functions for message list immutability
```

---

## 4. Complete Function-by-Function Reference

### 4.1 Backend Functions

#### `backend/app/main.py`
- `run_migrations() -> None`: Resolves `alembic.ini` path and upgrades database schema to `head` revision programmatically.
- `init_database() -> None`: Establishes DB connection to set `PRAGMA foreign_keys=ON`, executes migrations, and triggers seed data generation.
- `on_startup() -> None`: FastAPI lifecycle startup hook that executes `init_database()`.
- `serve_frontend(full_path: str)`: Fallback handler for non-API GET routes serving static files from `/srv/static` or defaulting to `index.html` for client-side SPA routing.

#### `backend/app/db.py`
- `database_url() -> str`: Resolves `DATABASE_URL` environment variable or defaults to `sqlite:////data/kanban.db`.
- `_ensure_parent_directory(url: str) -> None`: Parses file path from SQLite URL and creates parent directory recursively if missing.
- `create_db_engine(url: str | None = None) -> Engine`: Instantiates SQLAlchemy Engine with `check_same_thread=False` and registers connection listener.
- `_enable_foreign_keys(dbapi_connection, _record) -> None`: SQLite connect listener executing `PRAGMA foreign_keys=ON`.
- `get_db() -> Iterator[Session]`: FastAPI dependency yielding a database session and ensuring `db.close()` in `finally`.

#### `backend/app/security.py`
- `hash_password(password: str) -> str`: Hashes plain password using PBKDF2-SHA256 with 600,000 iterations and random 16-byte salt; returns formatted string `pbkdf2_sha256$600000$salt$digest`.
- `verify_password(password: str, encoded: str) -> bool`: Parses encoded hash, re-computes PBKDF2 digest with given salt, and performs constant-time comparison via `hmac.compare_digest`.

#### `backend/app/sessions.py`
- `create_session(username: str) -> str`: Generates cryptographically secure 32-byte URL-safe token, stores mapping `_sessions[token] = username`, and returns token.
- `username_for_token(token: str) -> str | None`: Fetches username associated with token.
- `revoke_token(token: str) -> None`: Removes token from `_sessions`.
- `reset() -> None`: Clears all active session tokens.

#### `backend/app/kanban.py`
- `load_board(db: Session, board_id: int, user_id: int) -> Board`: Queries board by ID; raises HTTP 404 if missing, HTTP 403 if `user_id` does not match owner.
- `load_column(db: Session, column_id: int, user_id: int) -> Column`: Queries column joined with Board; validates user ownership; raises 404 or 403.
- `load_card(db: Session, card_id: int, user_id: int) -> Card`: Queries card joined with Column and Board; validates ownership; raises 404 or 403.
- `move_column(db: Session, column: Column, position: int) -> None`: Re-indexes position of column relative to its board siblings sequentially (0, 1, 2...).
- `move_card(db: Session, card: Card, target_column_id: int, position: int) -> None`: Moves card to target column at requested index; re-indexes both source and target column card lists sequentially.
- `user_boards(db: Session, user_id: int) -> list[Board]`: Fetches list of all boards owned by user ordered by ID.
- `ensure_board_for_user(db: Session, user: User) -> Board`: Returns user's first board; if none exists, calls `seed_default_board`.

#### `backend/app/serializers.py`
- `board_out(db: Session, board_id: int) -> BoardOut | None`: Executes SQLAlchemy select with `selectinload(Board.columns).selectinload(Column.cards)` to materialize full tree into Pydantic models.
- `to_board_out(board: Board) -> BoardOut`: Transforms ORM `Board` object tree into Pydantic `BoardOut` model.
- `board_summaries(db: Session, user_id: int) -> list[BoardSummary]`: Converts user boards to summary models (ID and Title).

#### `backend/app/seed.py`
- `seed(db: Session) -> None`: Seeds default user (`user`/`password`) if no users exist.
- `seed_default_board(db: Session, user: User) -> Board`: Creates default board ("Main Board") with columns ("To Do", "In Progress", "Done") and default cards.

#### `backend/app/services/ai.py`
- `api_key() -> str`: Checks `OPENROUTER_API_KEY` environment variable; raises `AiNotConfigured` if absent.
- `chat(messages, *, temperature, response_format) -> str`: Sends HTTP POST request to OpenRouter API (`https://openrouter.ai/api/v1/chat/completions`) using model `openai/gpt-oss-120b` with retry logic.
- `simple_chat(prompt: str) -> str`: Helper wrapping user prompt in single message chat call.
- `board_context(board) -> str`: Serializes board tree snapshot into compact JSON string for LLM prompt context.
- `extract_json(raw: str) -> dict`: Parses LLM output string, stripping markdown triple-backtick fences if present and extracting JSON payload.
- `chat_with_board(board, question, history) -> dict`: Sends system preamble, board context snapshot, conversation history, and user question to LLM; returns JSON dict containing response text and optional board operations.
- `daily_summary(board) -> str`: Computes total, pending, and completed card metrics; prompts LLM for 3-5 sentence progress summary.
- `card_intelligence(board, card_id, task) -> dict`: Executes requested card task (`generate_details`, `suggest_priority`, or `detect_duplicates`); formats prompt with target card and other cards context.
- `workflow_optimization(board) -> dict`: Prompts LLM to analyze full board state and return bottlenecks, next actions, suggestions, and column card reordering arrays.
- `sprint_retrospective(board) -> dict`: Prompts LLM for retrospective summary, what went well, what to improve, and process action items.
- `risk_assessment(board) -> dict`: Prompts LLM to inspect non-final column cards and identify risks/blockers.
- `effort_estimation(board) -> dict`: Prompts LLM to estimate S/M/L story points and hints for pending cards.
- `standup_points(board) -> dict`: Prompts LLM to generate daily standup bullet points and blockers.
- `weekly_report(board) -> dict`: Prompts LLM to organize board into Completed, In Progress, Up Next, and Net Impact.
- `fetch_ai_news(randomize: bool) -> list[dict[str, str]]`: Fetches RSS feed from TechCrunch AI category using `httpx`, parses XML using `xml.etree.ElementTree`, sorts chronologically, optionally shuffles, and returns top items.

#### `backend/app/services/board_ops.py`
- `_text(value, limit, label) -> str`: Validates and trims string inputs, enforcing character length limits.
- `_column(db, column_id, user_id, board_id) -> Column`: Resolves and ownership-checks column ID.
- `_card(db, card_id, user_id, board_id) -> Card`: Resolves and ownership-checks card ID.
- `apply_operation(db, op, user, board_id) -> str`: Dispatches operation dictionary (`add_card`, `edit_card`, `move_card`, `delete_card`) to database mutations; returns human-readable result string.
- `apply_operations(db, operations, user, board_id) -> tuple[list[str], list[str]]`: Iterates list of operations; collects successful execution logs into `applied` list and errors into `skipped` list.

#### `backend/app/api/deps.py`
- `bearer_token(authorization: Header) -> str`: Extracts token from `Authorization: Bearer <token>` header; raises HTTP 401 if missing.
- `current_user(db: Session, authorization: Header) -> User`: Validates token against `sessions` store and fetches `User` record from DB; raises HTTP 401 if session is invalid.

#### `backend/app/api/auth.py`
- `login(payload, db) -> SessionResponse`: Verifies username and password hash; calls `ensure_board_for_user`; creates session token; returns token and username.
- `logout(token) -> dict`: Revokes active session token.
- `me(user) -> UserResponse`: Returns authenticated user info.

#### `backend/app/api/boards.py`
- `list_boards(db, user) -> list[BoardSummary]`: GET `/api/boards` returning summary list of boards.
- `create_board(payload, db, user) -> BoardOut`: POST `/api/boards` creating new board.
- `get_board(board_id, db, user) -> BoardOut`: GET `/api/boards/{id}` returning full board tree.
- `update_board(board_id, payload, db, user) -> BoardOut`: PATCH `/api/boards/{id}` updating board title.
- `delete_board(board_id, db, user) -> None`: DELETE `/api/boards/{id}` removing board and cascading deletes.

#### `backend/app/api/columns.py`
- `create_column(board_id, payload, db, user) -> None`: POST `/api/boards/{id}/columns` creating new column.
- `update_column(column_id, payload, db, user) -> None`: PATCH `/api/columns/{id}` updating column title or position.
- `delete_column(column_id, db, user) -> None`: DELETE `/api/columns/{id}` deleting column.

#### `backend/app/api/cards.py`
- `create_card(column_id, payload, db, user) -> CardOut`: POST `/api/columns/{id}/cards` creating card.
- `update_card(card_id, payload, db, user) -> CardOut`: PATCH `/api/cards/{id}` updating card details/position.
- `delete_card(card_id, db, user) -> None`: DELETE `/api/cards/{id}` deleting card.

#### `backend/app/api/ai.py`
- `test_ai(payload, user) -> AiTestResponse`: POST `/api/ai/test` raw LLM echo endpoint.
- `conversation_for(db, board_id) -> Conversation`: Resolves or creates conversation model for board.
- `history_for(db, conversation) -> list[dict]`: Retrieves last 20 messages for LLM context.
- `chat_with_board(payload, db, user) -> AiChatResponse`: POST `/api/ai/chat` chat co-pilot handler.
- `ai_news(user, randomize) -> AiNewsResponse`: GET `/api/ai/news` RSS news endpoint.
- `daily_summary(payload, db, user) -> DailySummaryResponse`: POST `/api/ai/summary` summary endpoint.
- `card_intelligence(payload, db, user) -> CardIntelligenceResponse`: POST `/api/ai/card-intelligence` endpoint.
- `workflow_optimization(payload, db, user) -> WorkflowOptimizationResponse`: POST `/api/ai/workflow-optimization` endpoint.
- `_board_snapshot(db, user, board_id)`: Helper loading board snapshot and rolling back DB read transaction.
- `_resolve_cards(snapshot)`: Maps card IDs from snapshot.
- `sprint_retrospective(payload, db, user) -> SprintRetrospectiveResponse`: POST `/api/ai/retrospective` endpoint.
- `risk_assessment(payload, db, user) -> RiskAssessmentResponse`: POST `/api/ai/risk-assessment` endpoint.
- `effort_estimation(payload, db, user) -> EffortEstimationResponse`: POST `/api/ai/effort-estimation` endpoint.
- `standup(payload, db, user) -> StandupResponse`: POST `/api/ai/standup` endpoint.
- `weekly_report(payload, db, user) -> WeeklyReportResponse`: POST `/api/ai/weekly-report` endpoint.

---

### 4.2 Frontend Functions & Utility Modules

#### `frontend/src/lib/api.ts`
- `setUnauthorizedHandler(handler: () => void)`: Registers callback invoked when fetch returns 401.
- `getToken()`, `setToken(token)`, `clearToken()`: Reads, writes, and removes session token in `localStorage`.
- `request<T>(path, init)`: Generic wrapper over `fetch` API attaching Bearer token, header parameters, `cache: "no-store"`, and handling HTTP status errors.
- Exported API wrapper functions: `login`, `logout`, `me`, `fetchBoardSummaries`, `fetchBoard`, `createColumn`, `renameColumn`, `deleteColumn`, `createCard`, `updateCard`, `deleteCard`, `sendChatMessage`, `fetchAiNews`, `fetchDailySummary`, `cardIntelligence`, `workflowOptimization`, `fetchSprintRetrospective`, `fetchRiskAssessment`, `fetchEffortEstimation`, `fetchStandup`, `fetchWeeklyReport`.

#### `frontend/src/lib/kanban.ts`
- `columnDndId(id: number) -> string`: Formats column ID string prefix `c{id}`.
- `cardDndId(id: number) -> string`: Formats card ID string prefix `d{id}`.
- `parseTarget(columns, dndId) -> DndTarget | null`: Parses prefix `c` or `d` and locates corresponding column or card object in state.
- `moveCard(columns, activeDndId, overDndId) -> Column[]`: Pure functional utility calculating new column card lists when a card is dragged over another card or column for optimistic UI state updates.

#### `frontend/src/lib/chat.ts`
- `appendMessage(messages, role, content)`: Pure helper appending message to message array.

---

## 5. End-to-End System Workflows

### 5.1 Drag-and-Drop Card Movement Flow
```
[User Drags Card] 
       │
       ▼
1. @dnd-kit fires `onDragStart` -> `activeCard` state set -> DragOverlay renders preview card.
       │
       ▼
2. `onDragEnd` fires -> calls `moveCard()` in `lib/kanban.ts` to compute new column states.
       │
       ▼
3. Optimistic Update: UI state (`setBoard`) updates immediately for zero-latency response.
       │
       ▼
4. Network Sync: Async request `updateCard(cardId, { column_id, position })` sent to FastAPI.
       │
       ▼
5. Backend Execution: `move_card()` in `kanban.py` adjusts card positions in SQLite and commits transaction.
       │
       ▼
(If Error): If backend fails, optimistic update reverts back to `previous` state and displays error toast.
```

### 5.2 AI Assistant Natural Language Operation Flow
```
[User: "Add a High priority bug fix card to In Progress"]
       │
       ▼
1. ChatSidebar sends request to `POST /api/ai/chat`.
       │
       ▼
2. Backend loads Board snapshot -> closes DB read transaction -> formats LLM JSON prompt.
       │
       ▼
3. OpenRouter API processes prompt with `openai/gpt-oss-120b` -> returns JSON:
   {
     "response": "Added bug fix card to In Progress.",
     "operations": [{"type": "add_card", "column_id": 2, "title": "Bug fix", "priority": "high"}]
   }
       │
       ▼
4. Backend `board_ops.apply_operations()` validates operation schema & ownership -> executes DB mutation.
       │
       ▼
5. Conversation history logged in SQLite `messages` table.
       │
       ▼
6. Response returned with fresh `board` tree -> Frontend updates Kanban board UI seamlessly.
```

---

## 6. Verification and Test Suite Integration

The codebase features comprehensive unit and integration testing:
- **Backend Tests (`backend/tests/`)**: Built with `pytest`. Tests coverage for authentication (`test_auth.py`), database ORM integrity (`test_database.py`), board CRUD operations (`test_boards.py`), board ops transactional mutations (`test_board_ops.py`), AI service retries (`test_ai_service.py`), AI endpoint handling (`test_ai_endpoint.py`), and card intelligence/insights.
- **Frontend Tests (`frontend/src/**/*.test.tsx`)**: Built with `vitest` and `@testing-library/react`. Tests unit logic for `kanban.test.ts`, `api.test.ts`, `KanbanBoard.test.tsx`, `ChatSidebar.test.tsx`, and all 8 AI modal panels.
