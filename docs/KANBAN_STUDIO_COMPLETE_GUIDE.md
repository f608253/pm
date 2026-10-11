# Kanban Studio: Complete Architectural Specification & Interactive System Guide

---

## 1. Executive Summary & Core Platform Vision

**Kanban Studio** is an enterprise-grade, AI-native single-board project management platform. It combines responsive, zero-latency drag-and-drop workflow tracking with an autonomous AI co-pilot powered by Large Language Models via OpenRouter's `openai/gpt-oss-120b` model.

### Key Architectural Highlights
1. **Unified Single-Container SSG + FastAPI Deployment**: Next.js exports static HTML/JS/CSS assets (`output: 'export'`) directly to `/srv/static`. FastAPI serves the static frontend alongside its high-performance JSON REST API, eliminating Node.js server container runtime overhead in production.
2. **FastAPI Synchronous Threadpool Execution**: Database route handlers are defined as standard synchronous `def` functions, executing inside FastAPI's underlying `anyio` worker threadpool. This isolates blocking SQLite disk I/O operations from Python's asyncio event loop, yielding maximum throughput without async ORM driver overhead.
3. **Transactional AI Operations Engine**: The AI co-pilot interprets natural language queries ("Add a high-priority bug fix card to In Progress") and outputs structured JSON board operations (`add_card`, `edit_card`, `move_card`, `delete_card`). These mutations are validated and applied transactionally with ownership constraints.
4. **Comprehensive 10-Tool AI Productivity Suite**: Header and card-level productivity tools covering Sprint Retrospectives, Risk Assessments, Story Point Effort Estimation (S/M/L hints), Daily Standup Talking Points, Bottleneck & Workflow Optimization, Daily Summary, Card Acceptance Criteria, Priority Suggestions, Duplicate Task Detection, and Live AI Tech News RSS feeds with refresh/randomization.
5. **Deterministic Positional Re-indexing**: Columns and cards maintain explicit integer `position` fields. Every move operation sequentially re-indexes items to eliminate index gaps and ensure deterministic visual rendering order across clients.

---

## 2. Complete Visual UI Map & Feature Guide

The application interface is cleanly partitioned into three distinct AI interaction zones so developers and users can easily locate every tool:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ KANBAN STUDIO  [Single Board Kanban]                       [ Signed in as User | Log out ] │
│                                                                                             │
│  [ To Do ]  [ In Progress ]  [ Review ]  [ Testing ]  [ Done ]                             │
│                                                                                             │
│  AI Analysis: [AI News] [Daily Summary] [Workflow] [Risk Assessment] [Effort Estimate]      │
│               [Retrospective] [Standup] [Weekly Report]                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌──────────┐
│ TO DO       (+) │ │ IN PROGRESS (+) │ │ REVIEW      (+) │ │ TESTING     (+) │ │ DONE (+) │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├──────────┤
│ Card Title      │ │ Card Title      │ │ Card Title      │ │ Card Title      │ │ Card...  │
│ [AI] [P: High]  │ │ [AI] [P: Med]   │ │ [AI] [P: Low]   │ │ [AI]            │ │          │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └──────────┘
                                                                           ┌──────────────────┐
                                                                           │ Ask the assistant│
                                                                           └──────────────────┘
```

### Zone 1: Header Bar (`AI Analysis:` Toolbar)
Located at the top-right of the main header card, providing board-wide analysis tools:
* **AI News**: RSS reader fetching live AI industry news from TechCrunch with a **Refresh** button for randomized topics.
* **Daily Summary**: Executive summary detailing completion rates, active work, and top recommendations for the day.
* **Workflow**: Identifies workflow bottlenecks, recommends next actions for each card, suggests optimal card ordering, and proposes board restructuring.
* **Risk Assessment**: Scans active cards for delivery risks, unclear scope, single points of failure, or dependency blocks.
* **Effort Estimate**: Evaluates pending cards and assigns T-shirt size estimates (`S`, `M`, `L`) with detailed hints.
* **Retrospective**: Generates sprint retrospective points (What Went Well, What to Improve, Process Action Items).
* **Standup**: Drafts ready-to-use daily standup talking points and surfaces immediate team blockers.
* **Weekly Report**: Summarizes weekly progress categorized into Completed, In Progress, Up Next, and Net Impact.

### Zone 2: Per-Card Intelligence Badge (`[AI]` Button on Cards)
Located on every card header inside all Kanban columns:
* **Generate details**: Creates structured Markdown task descriptions complete with concrete, checkable **Acceptance Criteria**.
* **Suggest priority**: Evaluates title, details, and column stage to recommend `high`, `medium`, or `low` priority.
* **Detect duplicates**: Scans all other cards across columns to flag material overlap or exact duplicates.

### Zone 3: Bottom-Right Co-Pilot Drawer (`Ask the assistant`)
Floating yellow button anchored at the bottom-right of the viewport:
* Opens the **ChatSidebar** drawer.
* Accepts natural language prompts ("Move the login bug card to Done", "Add 3 test cards for payment API").
* Generates conversational text replies while executing board operations transactionally.

---

## 3. Technology Stack & Architectural Trade-Offs

### 3.1 Frontend Architecture (Next.js 15, React 19, TypeScript, Tailwind CSS, @dnd-kit)

| Choice | Implementation | Advantage & Trade-Off |
| :--- | :--- | :--- |
| **Next.js 15 (`output: 'export'`)** | Static Export (SSG) in `next.config.ts` | HTML/JS static bundle generated at build time into `/srv/static`. Served directly by FastAPI; 0 Node.js server overhead. |
| **React 19 & TypeScript** | Strict Mode & Explicit Types | End-to-end type validation from API client to UI components prevents runtime payload mismatch. |
| **@dnd-kit (Core & Sortable)** | `PointerSensor` with `distance: 6` constraint | Distinguishes button clicks from card drags. Prefix namespacing (`c{id}` columns, `d{id}` cards) eliminates ID collisions. |
| **Tailwind CSS** | Custom CSS Variables Theme | Custom glassmorphism dark palette (`--navy-dark`, `--primary-blue`, `--secondary-purple`, `--accent-yellow`). |

### 3.2 Backend Architecture (FastAPI, Python 3.11+, SQLAlchemy 2.0, Pydantic v2)

| Choice | Implementation | Advantage & Trade-Off |
| :--- | :--- | :--- |
| **FastAPI Synchronous Handlers** | `def` route functions | Executed in FastAPI's `anyio` worker threadpool. Prevents SQLite disk I/O from blocking Python's async event loop. |
| **SQLAlchemy 2.0 ORM** | Declarative `Mapped[T]` models | Explicit `selectinload(Board.columns).selectinload(Column.cards)` prevents `DetachedInstanceError` during JSON serialization. |
| **Pydantic v2** | Response models & schema validation | Strict request validation (`min_length`, `max_length`, `ge=0`) and structured output parsing for AI responses. |
| **Authentication & Session Store** | PBKDF2-SHA256 & Memory Tokens | 600,000 PBKDF2 iterations with random salt. Cryptographic 32-byte URL-safe bearer tokens map to user sessions. |

### 3.3 Database Architecture (SQLite + Alembic Migrations)

| Choice | Implementation | Advantage & Trade-Off |
| :--- | :--- | :--- |
| **SQLite Engine** | `/data/kanban.db` | Portable, embedded, zero-configuration database with low read latency. |
| **Foreign Keys Hook** | `PRAGMA foreign_keys=ON` event listener | Enforces referential integrity on SQLite connect events across all relational tables. |
| **Cascading Deletes** | `cascade="all, delete-orphan"` | Board deletion automatically purges columns, cards, conversations, and messages without orphan records. |
| **Sequential Re-indexing** | Positional integer algorithm | `kanban.py` recalculates indices (0, 1, 2...) on every create, move, or delete operation. |

---

## 4. Complete Database Entity-Relationship (ER) Schema

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

## 5. Complete API Endpoint Reference Specification

### 5.1 Authentication Endpoints (`/api/auth`)
* `POST /api/auth/login`: Authenticates username & password. Returns session bearer token.
* `POST /api/auth/logout`: Revokes active session bearer token.
* `GET /api/auth/me`: Returns details of current authenticated user.

### 5.2 Board Management Endpoints (`/api/boards`)
* `GET /api/boards`: Returns summary list of boards owned by current user.
* `POST /api/boards`: Creates a new board.
* `GET /api/boards/{board_id}`: Returns full materialized board tree with columns & cards.
* `PATCH /api/boards/{board_id}`: Updates board title.
* `DELETE /api/boards/{board_id}`: Removes board and all descendant records.

### 5.3 Column Management Endpoints (`/api/columns`)
* `POST /api/boards/{board_id}/columns`: Appends a new column to the board.
* `PATCH /api/columns/{column_id}`: Updates column title or position (re-indexes sibling positions).
* `DELETE /api/columns/{column_id}`: Removes column and its cards.

### 5.4 Card Management Endpoints (`/api/cards`)
* `POST /api/columns/{column_id}/cards`: Creates a new card in specified column.
* `PATCH /api/cards/{card_id}`: Updates card title, details, priority, column, or position.
* `DELETE /api/cards/{card_id}`: Removes card from column.

### 5.5 AI Co-Pilot & Insights Endpoints (`/api/ai`)
* `POST /api/ai/test`: Diagnostic echo test endpoint verifying OpenRouter API connectivity.
* `POST /api/ai/chat`: Interactive board assistant endpoint. Processes user prompt, executes structured JSON board operations (`add_card`, `edit_card`, `move_card`, `delete_card`), updates conversation history, and returns fresh board state.
* `GET /api/ai/news`: Fetches latest AI news from TechCrunch RSS feed (supports `?randomize=true` query parameter for shuffle).
* `POST /api/ai/summary`: Generates board daily summary text covering completion rate, active work, and daily recommendation.
* `POST /api/ai/card-intelligence`: Per-card intelligence endpoint handling `generate_details`, `suggest_priority`, and `detect_duplicates`.
* `POST /api/ai/workflow-optimization`: Returns bottlenecks, next actions per card, board suggestions, and optimal card reordering.
* `POST /api/ai/retrospective`: Returns sprint retrospective summary, wins, improvements, and action items.
* `POST /api/ai/risk-assessment`: Identifies delivery risks, single points of failure, and bottlenecked cards.
* `POST /api/ai/effort-estimation`: Assigns `S`, `M`, `L` effort estimates and hints to pending cards.
* `POST /api/ai/standup`: Generates daily standup talking points and blocker alerts.
* `POST /api/ai/weekly-report`: Generates weekly progress report (Completed, In Progress, Up Next, Net Impact).

---

## 6. End-to-End Execution Sequence Diagrams

### 6.1 Drag-and-Drop Card Movement Flow
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

### 6.2 AI Assistant Natural Language Command Execution
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

## 7. Deep-Dive Function & Module Directory

### 7.1 Backend Core Modules (`backend/app/`)

* **`main.py`**: Entry point for FastAPI. Configures CORS middleware, database migration execution on startup, health endpoints, and static file server fallback for SPA routing.
* **`db.py`**: Manages SQLite engine creation, automatic parent directory creation, `PRAGMA foreign_keys=ON` connection listener, and thread session dependencies (`get_db`).
* **`models.py`**: SQLAlchemy 2.0 ORM declarations for `User`, `Board`, `Column`, `Card`, `Conversation`, and `Message` tables with relationship cascading.
* **`schemas.py`**: Pydantic v2 validation models for all REST API payloads, AI tool parameters, and response structures.
* **`security.py`**: Implements PBKDF2-SHA256 password hashing (600,000 iterations) and constant-time password verification via `hmac.compare_digest`.
* **`sessions.py`**: In-memory bearer token store mapping cryptographically secure 32-byte URL tokens to authenticated users.
* **`kanban.py`**: Domain logic for loading boards/columns/cards with user ownership checks, and sequential positional re-indexing.
* **`serializers.py`**: Converts SQLAlchemy ORM entity trees into Pydantic models using explicit `selectinload` eager loading.
* **`services/ai.py`**: OpenRouter HTTP client (`openai/gpt-oss-120b`), prompt templates for all 10 AI features, XML parsing for TechCrunch AI news RSS feed, and JSON extractor.
* **`services/board_ops.py`**: Transactional applier validating and executing AI operations (`add_card`, `edit_card`, `move_card`, `delete_card`) against SQLite database.
* **`api/ai.py`**: FastAPI route controllers for all AI endpoints, managing DB read transaction releases prior to outbound LLM calls.

### 7.2 Frontend UI Components (`frontend/src/components/`)

* **`AppRoot.tsx`**: Auth gate component controlling transition between `LoginForm` and `KanbanBoard` based on `localStorage` token.
* **`KanbanBoard.tsx`**: Root board component managing DnD context, top header layout, modal open states, optimistic card updates, and chat drawer.
* **`KanbanColumn.tsx`**: Column container handling card list sorting, column title inline editing, new card creation form, and drop targets.
* **`KanbanCard.tsx`**: Draggable card component rendering title, details preview, priority badges, drag handle, and per-card `[AI]` action menu.
* **`CardActionsMenu.tsx`**: Popover menu triggering Card Intelligence tasks (`Generate details`, `Suggest priority`, `Detect duplicates`) with one-click application.
* **`ChatSidebar.tsx`**: Sliding drawer sidebar rendering chat message history, typing indicator, and natural language command prompt input.
* **`AINewsPanel.tsx`**: Modal displaying live TechCrunch AI technology news items with a **Refresh** button for randomized stories.
* **`DailySummaryPanel.tsx`**: Modal rendering AI daily board summary and progress metrics.
* **`WorkflowPanel.tsx`**: Modal displaying bottleneck columns, recommended next actions per card, board suggestions, and card reordering.
* **`RiskAssessmentPanel.tsx`**: Modal listing active task risks, single points of failure, and bottleneck warnings.
* **`EffortEstimationPanel.tsx`**: Modal rendering S/M/L story point estimates and implementation hints.
* **`SprintRetrospectivePanel.tsx`**: Modal displaying sprint summary, what went well, what to improve, and process action items.
* **`StandupPanel.tsx`**: Modal presenting daily standup bullet points and immediate blockers.
* **`WeeklyReportPanel.tsx`**: Modal organizing progress into Completed, In Progress, Up Next, and Net Impact.

---

## 8. Development, Testing & Operational Deployment Guide

### 8.1 Backend Local Setup & Test Execution
```bash
# Navigate to backend directory
cd backend

# Install dependencies with uv
uv pip install -e ".[dev]"

# Set OpenRouter API Key (Windows PowerShell / Bash)
$env:OPENROUTER_API_KEY="your-api-key"

# Run Uvicorn Development Server
uvicorn app.main:app --reload --port 8000

# Execute Pytest Test Suite (97%+ Coverage Check)
pytest
```

### 8.2 Frontend Local Setup & Test Execution
```bash
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Run Next.js Development Server (http://localhost:3000)
npm run dev

# Run Vitest Unit Tests
npm run test

# Build Static Export for FastAPI Deployment
npm run build
```

### 8.3 Docker Unified Container Deployment
```bash
# Start local environment via container script (Unix)
./scripts/start.sh

# Windows PowerShell start container script
.\scripts\start.ps1

# Application served at http://localhost:8000
```

---
*Kanban Studio — Architecture & Technical Reference Guide*
