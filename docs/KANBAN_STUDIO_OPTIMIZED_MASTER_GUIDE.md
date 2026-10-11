# Kanban Studio: Comprehensive Master Architecture, System Design & Operations Guide

---

## 1. Executive Summary & Core Platform Vision

**Kanban Studio** is an enterprise-grade, AI-native single-board project management platform engineered to unify high-performance task management with autonomous AI assistance. Designed around a single, highly refined Kanban board paradigm, Kanban Studio provides instant drag-and-drop workflow tracking alongside an AI co-pilot powered by Large Language Models via OpenRouter (`openai/gpt-oss-120b`).

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ KANBAN STUDIO  [Single Board Kanban]                       [ Signed in as User | Log out ] │
│                                                                                             │
│  AI Analysis: [AI News] [Daily Summary] [Workflow] [Risk Assessment] [Effort Estimate]      │
│               [Retrospective] [Standup] [Weekly Report]                                    │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌──────────┐ │
│ │ TO DO       (+) │ │ IN PROGRESS (+) │ │ REVIEW      (+) │ │ TESTING     (+) │ │ DONE (+) │ │
│ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├──────────┤ │
│ │ Card Title      │ │ Card Title      │ │ Card Title      │ │ Card Title      │ │ Card...  │ │
│ │ [AI] [P: High]  │ │ [AI] [P: Med]   │ │ [AI] [P: Low]   │ │ [AI]            │ │          │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └──────────┘ │
│                                                                          ┌──────────────────┐ │
│                                                                          │ Ask the assistant│ │
│                                                                          └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Architectural Innovations:

1. **Unified Single-Container SSG + FastAPI Architecture**: Next.js 15 exports static HTML/JS/CSS assets (`output: 'export'`) directly into `/srv/static`. FastAPI serves the static frontend alongside its REST API, eliminating Node.js runtime memory overhead in production containers.
2. **FastAPI Synchronous Threadpool Execution Model**: Database route handlers are defined as standard synchronous `def` functions, executing inside FastAPI's underlying `anyio` worker threadpool. This isolates blocking SQLite disk I/O operations from Python's asyncio event loop, yielding maximum throughput without async ORM overhead.
3. **Transactional AI Operations Engine**: The AI co-pilot interprets natural language queries ("Add a high-priority bug fix card to In Progress") and outputs structured JSON board operations (`add_card`, `edit_card`, `move_card`, `delete_card`). These mutations are validated and applied transactionally with ownership constraints.
4. **10-Tool AI Productivity & Intelligence Suite**: Modal and inline productivity tools covering Sprint Retrospectives, Risk Assessments, Story Point Effort Estimation (S/M/L hints), Daily Standup Talking Points, Bottleneck & Workflow Optimization, Daily Summary, Card Acceptance Criteria, Priority Suggestions, Duplicate Task Detection, and Live AI Tech News RSS feeds with randomization.
5. **Deterministic Positional Re-indexing**: Columns and cards maintain explicit integer `position` fields. Every move operation sequentially re-indexes items to eliminate index gaps and ensure deterministic visual rendering order across clients.

---

## 2. Technology Stack & Architectural Decision Matrix

### 2.1 Frontend Engineering

| Technology | Selected Strategy | Rationale & Performance Impact |
| :--- | :--- | :--- |
| **Next.js 15 (App Router)** | Static Export (`output: 'export'`) | Generates static assets at build time (`npm run build`). Served directly by FastAPI from `/srv/static`. Zero Node.js runtime overhead in production. |
| **React 19 & TypeScript** | Strict Type Definitions | Guarantees strict type safety across board schemas, API response trees, component props, and drag-and-drop events. |
| **@dnd-kit (Core & Sortable)** | PointerSensors with Constraints | Implements drag activation constraints (`distance: 6px`) to prevent unintentional drags during clicks. Uses prefix namespacing (`c{id}` for columns, `d{id}` for cards) to eliminate ID collisions. |
| **Tailwind CSS** | Custom CSS Variables Theme | Dark glassmorphism palette using custom theme variables (`--navy-dark`, `--primary-blue`, `--secondary-purple`, `--accent-yellow`). Provides high-contrast accessibility. |
| **Lucide React** | Scalable Icon Library | Lightweight SVG icons for intuitive visual cues across board cards and AI tools. |

### 2.2 Backend Engineering

| Technology | Selected Strategy | Rationale & Performance Impact |
| :--- | :--- | :--- |
| **FastAPI Framework** | Sync Route Handlers (`def`) | Executes handlers in an `anyio` worker threadpool. Prevents SQLite disk lock delays from blocking async event loops. Provides automated OpenAPI docs. |
| **SQLAlchemy 2.0 ORM** | Declarative Mapped Models & Eager Loading | Uses `Mapped[T]` annotations and explicit `selectinload(Board.columns).selectinload(Column.cards)` serialization to prevent `DetachedInstanceError`. |
| **Pydantic v2** | Strict Schema Validation & Conversion | Validates inputs (`min_length`, `max_length`, integer bounds, literals) and handles structured JSON output generation for AI tools. |
| **Security Architecture** | PBKDF2-SHA256 & Cryptographic Bearer Tokens | Hashes passwords with 600,000 iterations and 16-byte random salts. Session management uses cryptographically secure 32-byte URL-safe tokens stored in memory. |

### 2.3 Database Architecture

| Strategy | Technical Implementation | Engineering Rationale |
| :--- | :--- | :--- |
| **Storage Engine** | Embedded SQLite (`./data/kanban.db`) | Portable, zero-configuration file database. Eliminates separate database server container setup while delivering low latency. |
| **Foreign Keys Hook** | `PRAGMA foreign_keys=ON` listener | SQLite disables foreign key enforcement by default. SQLAlchemy engine registers an event listener on `connect` executing `PRAGMA foreign_keys=ON` on every connection. |
| **Cascading Deletes** | `cascade="all, delete-orphan"` | Board deletion automatically purges child columns, cards, conversations, and messages; column deletion automatically purges associated cards. |
| **Sequential Positioning** | Integer `position` fields | Positional re-indexing algorithm in `kanban.py` recalculates indices (0, 1, 2...) on item creation, move, or deletion. |

---

## 3. Database Entity-Relationship (ER) Schema & Data Models

### 3.1 Entity-Relationship Diagram

```
┌────────────────────────────────┐       ┌────────────────────────────────┐
│             users              │       │            sessions            │
├────────────────────────────────┤       ├────────────────────────────────┤
│ PK  id             INTEGER     │◄──────┼ FK  user_id        INTEGER     │
│     username       VARCHAR(64) │ (1:N) │ PK  token          VARCHAR(64) │
│     password_hash  VARCHAR(128)│       │     created_at     DATETIME    │
│     created_at     DATETIME    │       └────────────────────────────────┘
└───────────────┬────────────────┘
                │
                │ (1:1 per owner MVP)
                ▼
┌────────────────────────────────┐       ┌────────────────────────────────┐
│             boards             │       │         conversations          │
├────────────────────────────────┤       ├────────────────────────────────┤
│ PK  id             INTEGER     │◄──────┼ PK  id             INTEGER     │
│ FK  user_id        INTEGER     │ (1:N) │ FK  board_id       INTEGER     │
│     title          VARCHAR(120)│       │     created_at     DATETIME    │
│     created_at     DATETIME    │       └──────────────┬─────────────────┘
└───────────────┬────────────────┘                      │
                │                                       │ (1:N)
                │ (1:N)                                 ▼
                ▼                        ┌────────────────────────────────┐
┌────────────────────────────────┐       │            messages            │
│            columns             │       ├────────────────────────────────┤
├────────────────────────────────┤       │ PK  id             INTEGER     │
│ PK  id             INTEGER     │       │ FK  conversation_id INTEGER    │
│ FK  board_id       INTEGER     │       │     role           VARCHAR(16) │
│     title          VARCHAR(120)│       │     content        TEXT        │
│     position       INTEGER     │       │     created_at     DATETIME    │
└───────────────┬────────────────┘       └────────────────────────────────┘
                │
                │ (1:N)
                ▼
┌────────────────────────────────┐
│             cards              │
├────────────────────────────────┤
│ PK  id             INTEGER     │
│ FK  column_id      INTEGER     │
│     title          VARCHAR(200)│
│     details        TEXT        │
│     position       INTEGER     │
│     priority       VARCHAR(16) │
│     created_at     DATETIME    │
└────────────────────────────────┘
```

### 3.2 Detailed Database Column Specifications

#### 1. `users`
- `id` (INTEGER, Primary Key, Auto-increment)
- `username` (VARCHAR(64), Unique, Indexed, Not Null)
- `password_hash` (VARCHAR(128), Not Null)
- `created_at` (DATETIME, Default: UTC Now)

#### 2. `sessions`
- `token` (VARCHAR(64), Primary Key) — Cryptographically generated URL-safe token
- `user_id` (INTEGER, Foreign Key -> `users.id` ON DELETE CASCADE, Not Null)
- `created_at` (DATETIME, Default: UTC Now)

#### 3. `boards`
- `id` (INTEGER, Primary Key, Auto-increment)
- `user_id` (INTEGER, Foreign Key -> `users.id` ON DELETE CASCADE, Not Null)
- `title` (VARCHAR(120), Default: "My Kanban Board", Not Null)
- `created_at` (DATETIME, Default: UTC Now)

#### 4. `columns`
- `id` (INTEGER, Primary Key, Auto-increment)
- `board_id` (INTEGER, Foreign Key -> `boards.id` ON DELETE CASCADE, Not Null)
- `title` (VARCHAR(120), Not Null)
- `position` (INTEGER, Default: 0, Not Null) — Zero-based column ordering index

#### 5. `cards`
- `id` (INTEGER, Primary Key, Auto-increment)
- `column_id` (INTEGER, Foreign Key -> `columns.id` ON DELETE CASCADE, Not Null)
- `title` (VARCHAR(200), Not Null)
- `details` (TEXT, Default: "", Not Null) — Markdown task specifications
- `position` (INTEGER, Default: 0, Not Null) — Zero-based card ordering index within column
- `priority` (VARCHAR(16), Default: "medium", Not Null) — Allowed values: `"high"`, `"medium"`, `"low"`
- `created_at` (DATETIME, Default: UTC Now)

#### 6. `conversations`
- `id` (INTEGER, Primary Key, Auto-increment)
- `board_id` (INTEGER, Foreign Key -> `boards.id` ON DELETE CASCADE, Not Null)
- `created_at` (DATETIME, Default: UTC Now)

#### 7. `messages`
- `id` (INTEGER, Primary Key, Auto-increment)
- `conversation_id` (INTEGER, Foreign Key -> `conversations.id` ON DELETE CASCADE, Not Null)
- `role` (VARCHAR(16), Not Null) — Allowed values: `"user"`, `"assistant"`
- `content` (TEXT, Not Null)
- `created_at` (DATETIME, Default: UTC Now)

---

## 4. Complete REST API Endpoints Specification & Schema Contracts

### 4.1 Authentication Endpoints

#### `POST /api/auth/register`
- **Description**: Registers a new user and creates an initial default board with standard columns (To Do, In Progress, Review, Done).
- **Request Body**: `{"username": "string", "password": "string"}` (min_length: 3 for username, min_length: 6 for password)
- **Response (200 OK)**: `{"token": "string", "username": "string"}`
- **Errors**: `400 Bad Request` (Username already registered or invalid fields)

#### `POST /api/auth/login`
- **Description**: Authenticates existing credentials and returns a session bearer token.
- **Request Body**: `{"username": "string", "password": "string"}`
- **Response (200 OK)**: `{"token": "string", "username": "string"}`
- **Errors**: `401 Unauthorized` (Invalid username or password)

#### `POST /api/auth/logout`
- **Description**: Invalidates the active session bearer token.
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: `{"detail": "Logged out"}`

#### `GET /api/auth/me`
- **Description**: Returns current authenticated user information.
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: `{"id": 1, "username": "string"}`
- **Errors**: `401 Unauthorized` (Invalid or expired token)

---

### 4.2 Board & Structure Endpoints

#### `GET /api/boards/me`
- **Description**: Fetches the authenticated user's single board complete with nested columns and cards.
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
```json
{
  "id": 1,
  "title": "My Kanban Board",
  "columns": [
    {
      "id": 1,
      "title": "To Do",
      "position": 0,
      "cards": [
        {
          "id": 10,
          "column_id": 1,
          "title": "Setup OAuth",
          "details": "Implement Google login",
          "position": 0,
          "priority": "high",
          "created_at": "2026-10-10T12:00:00Z"
        }
      ]
    }
  ]
}
```

#### `POST /api/columns`
- **Description**: Creates a new column on the board.
- **Request Body**: `{"board_id": 1, "title": "Testing"}`
- **Response (200 OK)**: Column Schema Object

#### `PATCH /api/columns/{column_id}`
- **Description**: Updates column title or position.
- **Request Body**: `{"title": "QA Testing", "position": 2}`
- **Response (200 OK)**: Updated Column Schema Object

#### `DELETE /api/columns/{column_id}`
- **Description**: Deletes column and cascades deletion to all contained cards.
- **Response (200 OK)**: `{"detail": "Column deleted"}`

---

### 4.3 Card Endpoints

#### `POST /api/cards`
- **Description**: Appends a new card to a specified column.
- **Request Body**: `{"column_id": 1, "title": "Fix SSL Bug", "details": "Fix cert validation", "priority": "high"}`
- **Response (200 OK)**: Created Card Schema Object

#### `PATCH /api/cards/{card_id}`
- **Description**: Updates card title, details, or priority.
- **Request Body**: `{"title": "Updated Title", "details": "New details", "priority": "medium"}`
- **Response (200 OK)**: Updated Card Schema Object

#### `POST /api/cards/{card_id}/move`
- **Description**: Moves a card to a target column and integer position with automatic position re-indexing.
- **Request Body**: `{"column_id": 2, "position": 0}`
- **Response (200 OK)**: Updated Card Schema Object

#### `DELETE /api/cards/{card_id}`
- **Description**: Deletes a card and re-indexes remaining cards in the column.
- **Response (200 OK)**: `{"detail": "Card deleted"}`

---

### 4.4 AI Services Endpoints

#### `POST /api/ai/chat`
- **Description**: Sends natural language prompt to AI co-pilot, receiving textual answer and optional JSON board mutations.
- **Request Body**: `{"board_id": 1, "message": "Add a documentation task to To Do"}`
- **Response (200 OK)**:
```json
{
  "response": "Added a documentation task to To Do column.",
  "applied_operations": ["Added \"Write API Docs\" to To Do"],
  "skipped_operations": []
}
```

#### `POST /api/ai/daily-summary`
- **Description**: Generates an executive progress summary covering completion metrics and today's top actions.
- **Response (200 OK)**: `{"summary": "Formatted markdown text summary..."}`

#### `POST /api/ai/card-intelligence`
- **Description**: Runs task-specific intelligence on a single card (`generate_details`, `suggest_priority`, `detect_duplicates`).
- **Request Body**: `{"board_id": 1, "card_id": 10, "task": "generate_details"}`
- **Response (200 OK)**:
```json
{
  "result": "Generated detailed acceptance criteria.",
  "details": "### Description\n- Implement OAuth2 login\n\n### Acceptance Criteria\n- [ ] Supports Google provider\n- [ ] Tokens stored securely",
  "priority": null,
  "duplicates": []
}
```

#### `POST /api/ai/workflow-optimization`
- **Description**: Analyzes overall board flow to identify bottlenecks, next actions, suggestions, and card reordering.
- **Response (200 OK)**:
```json
{
  "bottlenecks": [{"column_id": 2, "title": "In Progress", "reason": "5 cards accumulated without progress"}],
  "next_actions": [{"card_id": 10, "card_title": "Setup OAuth", "action": "Complete Google provider setup"}],
  "suggestions": ["Consider splitting In Progress column"],
  "optimal_order": {"1": [12, 10, 15]}
}
```

#### `POST /api/ai/sprint-retrospective`
- **Description**: Evaluates board state to output retrospective insights (Summary, What Went Well, What to Improve, Process Action Items).

#### `POST /api/ai/risk-assessment`
- **Description**: Identifies delivery risks across pending cards (Summary, Risks list with label and reason).

#### `POST /api/ai/effort-estimation`
- **Description**: Assigns T-shirt effort sizing (`S`, `M`, `L`) with hints to all unfinished cards.

#### `POST /api/ai/standup`
- **Description**: Drafts first-person daily standup talking points and surfaces immediate team blockers.

#### `POST /api/ai/weekly-report`
- **Description**: Generates a weekly progress report categorized by Completed, In Progress, Up Next, and Net Value Created.

#### `GET /api/ai/news?randomize=true`
- **Description**: Fetches live AI industry news from TechCrunch RSS feed, optionally shuffled for variety.
- **Response (200 OK)**:
```json
{
  "news": [
    {
      "title": "Latest AI Breakthrough",
      "link": "https://techcrunch.com/...",
      "published": "Wed, 08 Oct 2026 14:00:00 +0000"
    }
  ]
}
```

---

## 5. AI Services Architecture, Prompt Engineering & Operations Engine

### 5.1 OpenRouter Client & Fallback Engineering

The AI engine in `backend/app/services/ai.py` communicates with OpenRouter's `openai/gpt-oss-120b` endpoint:

```python
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = "openai/gpt-oss-120b"
TIMEOUT_SECONDS = 60.0
MAX_ATTEMPTS = 3
```

- **Retry Strategy**: Performs up to 3 execution attempts with exponential error recovery on network timeouts or 5xx gateway errors.
- **Authentication Safeguard**: Catches `401` and `403` status codes directly to raise `AiNotConfigured`, providing clear feedback if the API key is missing or invalid.
- **Structured JSON Parsing**: Uses robust `extract_json()` helper that strips Markdown code block fences (` ```json ... ``` `) and extracts pure JSON dicts.

### 5.2 Transactional Operations Engine (`backend/app/services/board_ops.py`)

When the user requests changes via the AI Chat assistant, the LLM outputs a structured JSON list of `operations`. `apply_operations()` validates each mutation against database state and ownership constraints:

#### Operation Types & Contracts:
1. `add_card`: Requires `column_id` and `title`. Optional `details`. Appends card at position `len(column.cards)`.
2. `edit_card`: Requires `card_id`. Optional `title`, `details`, or `priority` (`"high"`, `"medium"`, `"low"`).
3. `move_card`: Requires `card_id` and `column_id`. Optional non-negative integer `position` (defaults to 0). Triggers `move_card()` re-indexing.
4. `delete_card`: Requires `card_id`. Removes card and re-indexes remaining items in column.

---

## 6. Frontend UI/UX Architecture & Drag-and-Drop State Machine

### 6.1 React Component Tree Structure

```
AppRoot
├── LoginForm (Shown when bearer token is unauthenticated)
└── KanbanBoard (Main Application Canvas)
    ├── Header Bar
    │   ├── Board Title & Status
    │   ├── AI Analysis Toolbar (Buttons for 8 Header AI Modals)
    │   └── User Menu & Logout Button
    ├── Column Canvas (Horizontal Flex Container)
    │   └── KanbanColumn (Sortable Context)
    │       ├── Column Header & Card Count Badge
    │       ├── Add Card Button
    │       └── Card Container (Vertical Sortable List)
    │           └── KanbanCard (Sortable Item)
    │               ├── Drag Handle
    │               ├── Title & Priority Badge
    │               ├── Per-Card [AI] Button -> CardActionsMenu Modal
    │               └── Details & Markdown Preview
    ├── ChatSidebar Drawer ("Ask the assistant" floating button)
    │   ├── Message Log View (User & AI Bubbles)
    │   ├── Operation Badges (Applied/Skipped summaries)
    │   └── ChatInput & Typing Indicator
    └── Modals Manager (Renders active tool modal)
        ├── AINewsPanel
        ├── DailySummaryPanel
        ├── WorkflowPanel
        ├── RiskAssessmentPanel
        ├── EffortEstimationPanel
        ├── SprintRetrospectivePanel
        ├── StandupPanel
        └── WeeklyReportPanel
```

### 6.2 `@dnd-kit` Sensor Calibration & Collision Prevention

To provide smooth, bug-free drag-and-drop interactions:
1. **Activation Constraint**: `PointerSensor` configured with `activationConstraint: { distance: 6 }`. This prevents card clicks and button taps from triggering accidental drag states.
2. **ID Prefix Namespacing**:
   - Column IDs are prefixed as `c{column_id}` (e.g. `c1`).
   - Card IDs are prefixed as `d{card_id}` (e.g. `d10`).
   - This eliminates ID collisions between columns and cards inside `@dnd-kit`'s global item lookup registry.
3. **Optimistic State Updates**: When a card is dropped into a new position or column, the frontend immediately mutates local React state (`kanban.ts`) for instant UI response before sending the `POST /api/cards/{id}/move` payload to the backend server.

---

## 7. Directory & File Structure Matrix

```
D:\code\claude\pm\
├── .env / .env.example              # Environment variables (OPENROUTER_API_KEY, etc.)
├── ARCHITECTURE_AND_WORKING.md      # Legacy architectural notes
├── ARCHITECTURE_AND_WORKING_OPTIMIZED.md # Optimized architectural guide
├── KANBAN_STUDIO_COMPLETE_GUIDE.md  # Comprehensive guide
├── KANBAN_STUDIO_OPTIMIZED_MASTER_GUIDE.md # Master System Architecture & Working Guide
├── CLAUDE.md                        # Development guide and CLI instructions
├── Dockerfile                       # Multi-stage production container build
├── docker-compose.yml               # Local container orchestration file
├── scripts/                         # Environment control scripts
│   ├── start.sh / start.ps1         # Container startup scripts
│   ├── stop.sh / stop.ps1           # Container teardown scripts
│   └── test.sh / test.ps1           # Test suite invocation scripts
├── data/                            # Persistent database directory
│   └── kanban.db                    # SQLite production database file
├── backend/                         # FastAPI Python Backend
│   ├── pyproject.toml               # Python dependencies and build config
│   ├── alembic/                     # Alembic database migrations engine
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry point & static file mount
│   │   ├── config.py                # App configuration settings
│   │   ├── db.py                    # SQLite SQLAlchemy engine & session maker
│   │   ├── models.py                # SQLAlchemy ORM database models
│   │   ├── schemas.py               # Pydantic schema validation contracts
│   │   ├── serializers.py           # Explicit ORM response tree builders
│   │   ├── security.py              # PBKDF2 password hashing & token auth
│   │   ├── sessions.py              # In-memory bearer token session store
│   │   ├── kanban.py                # Positional re-indexing domain logic
│   │   ├── seed.py                  # Database default seed data builder
│   │   ├── api/                     # REST API Route Handlers
│   │   │   ├── auth.py              # Registration, login, logout, me
│   │   │   ├── boards.py            # Board GET/PATCH handlers
│   │   │   ├── columns.py           # Column POST/PATCH/DELETE handlers
│   │   │   ├── cards.py             # Card POST/PATCH/MOVE/DELETE handlers
│   │   │   ├── ai.py                # AI endpoints router
│   │   │   └── health.py            # System health check handler
│   │   └── services/                # Core Business Logic & AI Services
│   │       ├── ai.py                # OpenRouter client & 10 AI tools logic
│   │       └── board_ops.py         # Transactional AI operations execution
│   └── tests/                       # Pytest Test Suite (80%+ Coverage)
└── frontend/                        # Next.js 15 React Frontend
    ├── package.json                 # NPM scripts & package dependencies
    ├── next.config.ts               # Next.js static export (`output: 'export'`) config
    ├── tailwind.config.ts           # Styling & design system theme config
    ├── vitest.config.ts             # Vitest frontend unit test runner config
    ├── playwright.config.ts         # Playwright E2E test runner config
    ├── src/
    │   ├── app/                     # Next.js App Router root layout & global CSS
    │   ├── components/              # React UI Component Library
    │   │   ├── AppRoot.tsx          # Auth gate & top-level layout controller
    │   │   ├── LoginForm.tsx        # Login & registration card UI
    │   │   ├── KanbanBoard.tsx      # Main board canvas & @dnd-kit engine
    │   │   ├── KanbanColumn.tsx     # Column wrapper & drop target
    │   │   ├── KanbanCard.tsx       # Card UI & sortable element
    │   │   ├── CardActionsMenu.tsx  # Card intelligence options menu
    │   │   ├── ChatSidebar.tsx      # AI Co-pilot drawer component
    │   │   └── *Panel.tsx           # 8 AI Header Tool Modals
    │   └── lib/
    │       ├── api.ts               # Fetch client & REST API wrapper methods
    │       └── kanban.ts            # Local board state mutators for optimistic UI
    └── e2e/                         # Playwright E2E browser tests
```

---

## 8. Build Pipeline, Control Scripts & Testing Operations

### 8.1 Docker Multi-Stage Container Build (`Dockerfile`)

```dockerfile
# Stage 1: Build Frontend Static Export
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Final FastAPI Production Image
FROM python:3.11-slim
WORKDIR /app
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir .
COPY backend/app ./app
COPY --from=frontend-builder /app/frontend/out /srv/static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 8.2 Execution Scripts & CLI Commands

#### Local Development Setup (Windows PowerShell / Unix Shell):
```bash
# Backend Setup
cd backend
uv pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend Setup
cd frontend
npm install
npm run dev
```

#### Running Tests:
- **Backend Pytest Suite**:
  ```bash
  pytest
  ```
- **Frontend Vitest Unit Suite**:
  ```bash
  cd frontend
  npm run test
  ```
- **Playwright End-to-End Suite**:
  ```bash
  cd frontend
  npm run test:e2e
  ```

---

## 9. Security, Performance & Reliability Matrix

### 9.1 Security Hardening Measures
- **Password Security**: Passwords hashed using standard PBKDF2-SHA256 with 600,000 iterations and a 16-byte cryptographically secure random salt.
- **Session Tokens**: Uses 32-byte URL-safe tokens generated via `secrets.token_urlsafe(32)`.
- **SQL Injection Prevention**: SQLite access is handled exclusively via SQLAlchemy ORM parameterized queries.
- **Cross-User Data Isolation**: Every database query explicitly checks ownership (`board.user_id == user.id`), preventing unauthorized access across accounts.

### 9.2 Performance Optimizations
- **Zero Node.js Server Overhead**: Serving static Next.js export assets directly from FastAPI eliminates Node server runtime memory overhead in production containers.
- **Synchronous AnyIO Worker Execution**: Running database handlers as standard `def` routines in worker threads prevents blocking disk I/O operations from freezing Python's async event loop.
- **Eager ORM Loading**: Utilizing `selectinload` avoids lazy-loading execution during serialization, completely resolving `DetachedInstanceError` issues across session boundaries.

---

## 10. Summary & System Verification

**Kanban Studio** delivers an optimized, robust, and highly maintainable single-board project management platform. Combining Next.js 15 static export rendering with FastAPI's high-performance synchronous threadpool execution model, it provides zero-latency Kanban drag-and-drop workflows backed by a powerful 10-tool LLM intelligence suite.
