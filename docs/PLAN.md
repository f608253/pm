# Project Implementation Plan

## Part 1: Planning ✓

### Objective
Create detailed implementation plan with substeps, checklists, tests, and success criteria for all parts.

### Substeps
- [x] Explore existing frontend codebase structure
- [x] Document frontend architecture in frontend/AGENTS.md
- [x] Enrich PLAN.md with detailed substeps for all 10 parts
- [x] Define testing requirements (80% unit test coverage minimum)
- [x] Get user approval before proceeding to Part 2

### Success Criteria
- Comprehensive frontend documentation created
- Detailed plan with substeps and tests for each part
- User has reviewed and approved the plan

---

## Part 2: Scaffolding

### Objective
Set up Docker infrastructure, FastAPI backend, and start/stop scripts to serve a "hello world" example with API call confirmation.

### Substeps
- [x] Create backend/ directory structure
  - [x] backend/app/ for FastAPI application
  - [x] backend/app/main.py for FastAPI app instance
  - [x] backend/app/api/ for API routes
  - [x] backend/requirements.txt or pyproject.toml for uv
- [x] Set up FastAPI application
  - [x] Install FastAPI and uvicorn
  - [x] Create main.py with basic app instance
  - [x] Add health check endpoint GET /api/health
  - [x] Add hello world endpoint GET /api/hello
  - [x] Configure CORS for frontend
  - [x] Serve static HTML at / (simple index.html for testing)
- [x] Create Dockerfile
  - [x] Use official Python image
  - [x] Install uv package manager
  - [x] Copy backend files
  - [x] Install dependencies with uv
  - [x] Expose port 8000
  - [x] CMD to run uvicorn
- [x] Create docker-compose.yml
  - [x] Define backend service
  - [x] Map ports (8000:8000)
  - [x] Mount volumes for development
  - [x] Load .env file
- [x] Create .env.example
  - [x] OPENROUTER_API_KEY=your_key_here
  - [x] Environment variables template
- [x] Create scripts/start.sh (Mac/Linux)
  - [x] Check Docker is running
  - [x] Create .env if missing (from .env.example)
  - [x] Run docker-compose up
  - [x] Display access URL
- [x] Create scripts/start.ps1 (Windows)
  - [x] Same functionality as start.sh
  - [x] PowerShell syntax
- [x] Create scripts/stop.sh (Mac/Linux)
  - [x] Run docker-compose down
  - [x] Clean up containers
- [x] Create scripts/stop.ps1 (Windows)
  - [x] Same functionality as stop.sh
- [x] Make scripts executable (chmod +x for Unix scripts)

### Tests
- [x] Manual: Run scripts/start.sh (or .ps1 on Windows)
- [x] Verify Docker container starts successfully
- [x] Access http://localhost:8000/ and see static HTML
- [x] Access http://localhost:8000/api/health and get 200 response
- [x] Access http://localhost:8000/api/hello and get JSON response
- [x] Run scripts/stop.sh and verify container stops
- [x] Unit test: Test health endpoint returns correct structure
- [x] Unit test: Test hello endpoint returns expected message

### Success Criteria
- Docker container builds without errors
- Scripts work on all platforms (Mac, PC, Linux)
- Static HTML served at /
- API endpoints accessible and returning correct responses
- Clean startup and shutdown
- All unit tests passing with 80%+ coverage for backend code

---

## Part 3: Add Frontend

### Objective
Build frontend statically and serve it through FastAPI, displaying the demo Kanban board at /.

### Substeps
- [x] Update frontend build configuration
  - [x] Verify next.config.ts for static export or standalone build
  - [x] Set output: 'export' in next.config.ts (if using static export)
  - [x] Test frontend build locally: npm run build
- [x] Update Dockerfile to build frontend
  - [x] Add Node.js installation or use multi-stage build
  - [x] Copy frontend/ directory
  - [x] Run npm install in frontend
  - [x] Run npm run build
  - [x] Copy built static files to /srv/static (outside /app so the dev bind mount cannot shadow it)
- [x] Update FastAPI to serve static frontend
  - [x] Serve static files at / via a catch-all route
  - [x] Add catch-all route to serve index.html for client-side routing
  - [x] Ensure API routes (/api/*) take precedence and unknown /api/* paths still 404
- [x] Update docker-compose.yml
  - [x] Ensure frontend build happens in container
  - [x] No frontend volume needed; frontend is baked in at image build time
- [x] Update scripts to rebuild frontend
  - [x] Rebuild container when frontend changes (verified: touching a frontend source file re-runs the frontend stage)

### Tests
- [x] Unit test: Verify static file serving configuration
- [x] Integration test: GET / returns index.html
- [x] Integration test: GET /api/health still works
- [x] Integration test: Frontend assets (CSS, JS) load correctly
- [x] Manual: Access http://localhost:8000/
- [x] Manual: Verify Kanban board renders with all 5 columns
- [x] Manual: Test drag-and-drop functionality works
- [x] Manual: Test add card functionality works
- [x] Manual: Test delete card functionality works
- [x] Manual: Test rename column functionality works
- [x] E2E test: Run existing Playwright tests against Docker environment
- [x] E2E test: Verify all frontend features work through Docker

### Success Criteria
- Frontend builds successfully in Docker
- Kanban board displays at http://localhost:8000/
- All frontend functionality works (drag-drop, add/delete, rename)
- API routes remain accessible at /api/*
- All tests passing (unit + integration + e2e)
- 80%+ unit test coverage maintained

---

## Part 4: Add User Sign-In Experience

### Objective
Add authentication flow with hardcoded credentials ("user", "password") protecting the Kanban board, with login/logout functionality.

### Substeps
- [x] Backend: Add authentication endpoints
  - [x] POST /api/auth/login - accepts username/password, returns session token
  - [x] POST /api/auth/logout - invalidates session token
  - [x] GET /api/auth/me - returns current user info or 401
  - [x] In-memory session storage (dict) for MVP
  - [x] Hardcode user validation: username="user", password="password"
  - [x] Opaque random bearer token (secrets.token_urlsafe), not JWT
- [x] Backend: Add authentication dependency
  - [x] Verify bearer token in Authorization header
  - [x] Reusable `require_token` dependency for future protected endpoints
  - [x] Return 401 for invalid/missing token and non-Bearer schemes
- [x] Frontend: Create authentication components
  - [x] LoginForm component (username, password fields)
  - [x] Logout control in the board header (KanbanBoard takes optional username/onLogout)
  - [x] AppRoot component owns auth state for the session
- [x] Frontend: Add authentication flow
  - [x] Store session token in localStorage
  - [x] Add token to API request headers
  - [x] Show the sign in form when not authenticated
  - [x] Show the board after successful login
  - [x] Clear token on logout
- [x] Frontend: Protect Kanban board
  - [x] Check authentication status on page load
  - [x] Show Kanban only when authenticated
- [x] Routing decision
  - [x] Single route `/` with an auth gate instead of a separate `/login` route.
    Static export ignores Next rewrites, so client-side routes need extra path
    resolution in FastAPI; gating at `/` satisfies the requirement with less machinery.

### Tests
- [x] Backend unit test: POST /api/auth/login with valid credentials returns token
- [x] Backend unit test: POST /api/auth/login with invalid credentials returns 401
- [x] Backend unit test: POST /api/auth/login with missing fields returns 422
- [x] Backend unit test: GET /api/auth/me with valid token returns user info
- [x] Backend unit test: GET /api/auth/me without token returns 401
- [x] Backend unit test: GET /api/auth/me with bogus token returns 401
- [x] Backend unit test: GET /api/auth/me with non-Bearer scheme returns 401
- [x] Backend unit test: POST /api/auth/logout invalidates token
- [x] Backend unit test: POST /api/auth/logout without token returns 401
- [x] Backend unit test: tokens are unique per login
- [x] Frontend unit test: LoginForm renders and gates the board
- [x] Frontend unit test: sign in succeeds with valid credentials
- [x] Frontend unit test: bad credentials show an error and store no token
- [x] Frontend unit test: stored token is sent as a Bearer header
- [x] Frontend unit test: logout clears the token and returns to the form
- [x] Frontend unit test: failed logout still signs out locally
- [x] E2E test: User cannot access Kanban without logging in
- [x] E2E test: User can log in with correct credentials
- [x] E2E test: User cannot log in with incorrect credentials
- [x] E2E test: User can log out and session is cleared
- [x] E2E test: Session survives a page reload
- [x] E2E test: Board features work after signing in

### Success Criteria
- Sign in form displays at / when signed out
- Valid credentials grant access to Kanban board
- Invalid credentials show error message
- Kanban board only accessible when authenticated
- Logout clears session and returns to the sign in form
- All tests passing with 80%+ coverage (backend 100%, frontend 13 unit + 10 e2e)
- Session persists across page refreshes

### Notes
- Sessions are held in backend process memory, so restarting the container signs
  the user out. Acceptable for the MVP and the reason Part 5 moves users to SQLite.
- Playwright no longer boots `next dev`: static export ignores Next rewrites, so a
  standalone dev server cannot proxy `/api`. E2E runs against the Docker build.

---

## Part 5: Database Modeling

### Objective
Design database schema for users, boards, columns, and cards. Document the approach and get user approval.

### Substeps
- [ ] Design database schema
  - [ ] Users table (id, username, password_hash, created_at)
  - [ ] Boards table (id, user_id, title, created_at, updated_at)
  - [ ] Columns table (id, board_id, title, position, created_at, updated_at)
  - [ ] Cards table (id, column_id, title, details, position, created_at, updated_at)
- [ ] Define relationships
  - [ ] User 1:N Board (one user, multiple boards for future)
  - [ ] Board 1:N Column (one board, multiple columns)
  - [ ] Column 1:N Card (one column, multiple cards)
- [ ] Define indexes
  - [ ] Index on user_id in boards
  - [ ] Index on board_id in columns
  - [ ] Index on column_id in cards
  - [ ] Unique constraint on username in users
- [ ] Choose storage approach
  - [ ] SQLite database file location (./data/kanban.db)
  - [ ] Use SQLAlchemy ORM for Python
  - [ ] Define models matching schema
- [ ] Document schema
  - [ ] Create docs/DATABASE.md with ERD
  - [ ] Document table structures
  - [ ] Document relationships and indexes
  - [ ] Include sample queries
  - [ ] Migration strategy for future
- [ ] Get user approval on schema

### Tests
- [ ] Schema validation: All tables have primary keys
- [ ] Schema validation: All foreign keys are valid
- [ ] Schema validation: Indexes are appropriate
- [ ] Documentation completeness check

### Success Criteria
- Complete database schema documented in docs/DATABASE.md
- Schema supports all MVP features
- Schema allows for future multi-user and multi-board expansion
- Clear documentation of relationships
- User has approved the schema design

---

## Part 6: Backend API Routes

### Objective
Implement API routes for reading and modifying Kanban data, with database persistence and comprehensive backend tests.

### Substeps
- [x] Set up database connection
  - [x] Install SQLAlchemy and database driver
  - [x] Create database connection module
  - [x] Create database models (User, Board, Column, Card)
  - [x] Create database initialization function
  - [x] Auto-create database file if it doesn't exist
  - [x] Create default user on first run
- [x] Implement board endpoints
  - [x] GET /api/boards - list boards for current user
  - [x] GET /api/boards/:id - get board with columns and cards
  - [x] POST /api/boards - create new board
  - [x] PATCH /api/boards/:id - update board title
  - [x] DELETE /api/boards/:id - delete board
- [x] Implement column endpoints
  - [x] POST /api/boards/:boardId/columns - create column
  - [x] PATCH /api/columns/:id - update column (title, position)
  - [x] DELETE /api/columns/:id - delete column
- [x] Implement card endpoints
  - [x] POST /api/columns/:columnId/cards - create card
  - [x] PATCH /api/cards/:id - update card (title, details, column_id, position)
  - [x] DELETE /api/cards/:id - delete card
- [x] Add authentication to all routes
  - [x] Require valid session token
  - [x] Verify user owns the resources
  - [x] Return 403 for unauthorized access
- [x] Add error handling
  - [x] 400 for bad requests
  - [x] 404 for not found
  - [x] 500 for server errors
  - [x] Validation errors with details
- [x] Add database migrations
  - [x] Use Alembic or similar for schema migrations
  - [x] Initial migration for schema creation
- [x] Seed default board for user
  - [x] Create initial board with 5 columns
  - [x] Create sample cards matching frontend demo

### Tests
- [x] Unit test: Database models create/read/update/delete
- [x] Unit test: Each API endpoint with valid data
- [x] Unit test: Each API endpoint with invalid data
- [x] Unit test: Authentication required for protected endpoints
- [x] Unit test: User can only access own boards
- [x] Unit test: Cascading deletes work correctly
- [x] Unit test: Position updates maintain order
- [x] Integration test: Create board → add columns → add cards flow
- [x] Integration test: Move card between columns
- [x] Integration test: Rename column persists
- [x] Integration test: Delete card removes from database
- [x] Integration test: Database initialization on first run
- [x] Integration test: Default board created for new user

### Success Criteria
- All API routes implemented and tested
- Database creates automatically if missing
- Default user and board seed on first run
- All endpoints require authentication
- Users can only access their own data
- Comprehensive error handling
- All tests passing with 80%+ coverage (achieved: 58 tests, 97%)
- Database operations are transactional

### Notes
- Route handlers are `def`, not `async def`, so FastAPI runs them in a threadpool
  and blocking SQLAlchemy calls are safe. The static file handler stays `async`.
- Ownership violations return 403, missing rows return 404, matching the plan.
- Verified end to end: created a card and renamed a column through the API, restarted
  the container, and confirmed both survived in `/data/kanban.db`.

---

## Part 7: Frontend + Backend Integration

### Objective
Connect frontend to backend API for full persistence, transforming the app into a proper persistent Kanban board.

### Substeps
- [x] Create API client module
  - [x] Create frontend/src/lib/api.ts
  - [x] Implement fetch wrapper with auth headers
  - [x] Handle 401 responses (redirect to login)
  - [x] Handle other error responses
  - [x] Type definitions for API responses
- [x] Implement board API functions
  - [x] fetchBoard(boardId) - get board data
  - [x] updateColumnTitle(columnId, title)
  - [x] createCard(columnId, card)
  - [x] updateCard(cardId, updates)
  - [x] deleteCard(cardId)
  - [x] moveCard(cardId, columnId, position)
- [x] Update KanbanBoard component
  - [x] Fetch board data on mount
  - [x] Replace local state with API calls
  - [x] Add loading states
  - [x] Add error handling
  - [x] Optimistic updates for better UX
  - [x] Debounce API calls where appropriate
- [x] Update authentication flow
  - [x] Connect LoginForm to POST /api/auth/login
  - [x] Store returned token
  - [x] Fetch user info after login
  - [x] Handle logout with API call
- [ ] Add error UI
  - [ ] Toast notifications for errors
  - [x] Loading spinners
  - [ ] Error boundaries
  - [x] Retry mechanisms
- [ ] Handle edge cases
  - [x] Network failures
  - [x] Session expiration
  - [ ] Concurrent modifications
  - [x] Stale data

### Tests
- [x] Frontend unit test: API client adds auth headers
- [x] Frontend unit test: API client handles 401
- [x] Frontend unit test: Each API function calls correct endpoint
- [x] Frontend unit test: KanbanBoard loads data on mount
- [x] Frontend unit test: KanbanBoard handles loading state
- [x] Frontend unit test: KanbanBoard handles error state
- [x] Integration test: Login → fetch board → display data flow
- [x] Integration test: Add card persists to database
- [x] Integration test: Delete card removes from database
- [x] Integration test: Rename column persists to database
- [x] Integration test: Drag card updates database
- [x] Integration test: Logout clears state
- [x] Integration test: Session expiration redirects to login
- [x] E2E test: Full user journey from login to board manipulation
- [x] E2E test: Data persists across page refreshes
- [x] E2E test: Data persists across logout/login cycles
- [x] E2E test: Multiple cards can be added and moved
- [x] E2E test: Columns can be renamed and persist

### Success Criteria
- [x] Frontend successfully fetches and displays data from backend
- [x] All user actions persist to database
- [x] Data persists across page refreshes
- [x] Data persists across login/logout cycles
- [x] Loading and error states display appropriately
- [x] Optimistic updates provide good UX
- [x] All tests passing with 80%+ coverage
- [x] No console errors in browser
- [x] Network tab shows correct API calls

Verification: backend 58 tests / 97.37% coverage, frontend 44 unit tests, lint clean,
static production build OK, Playwright 44/44 with one shared database recreated before
each run.

Not done, by choice: toast notifications, React error boundaries, and explicit
concurrent-modification handling. Errors surface as an inline message with a retry
button, which is simpler for an MVP.

---

## Part 8: AI Connectivity

### Objective
Enable backend to make AI calls via OpenRouter, test with simple query.

### Substeps
- [x] Set up OpenRouter client
  - [x] Install OpenAI SDK or requests library (httpx, already in the dev set)
  - [x] Create AI client module in backend
  - [x] Read OPENROUTER_API_KEY from environment
  - [x] Configure base URL for OpenRouter
  - [x] Set model to openai/gpt-oss-120b
- [x] Create AI service module
  - [x] Create backend/app/services/ai.py
  - [x] Implement simple_chat(prompt) function
  - [x] Handle API errors and timeouts
  - [x] Add retry logic
  - [x] Log requests and responses
- [x] Create test endpoint
  - [x] POST /api/ai/test
  - [x] Accept simple prompt
  - [x] Call AI with prompt
  - [x] Return AI response
- [x] Verify environment setup
  - [x] Check .env has OPENROUTER_API_KEY
  - [x] Validate key format
  - [x] Handle missing key gracefully

### Tests
- [x] Unit test: AI client initializes with API key
- [x] Unit test: AI client handles missing API key
- [x] Unit test: simple_chat() formats request correctly
- [x] Unit test: simple_chat() handles API errors
- [x] Unit test: simple_chat() handles timeouts
- [x] Integration test: POST /api/ai/test with "2+2" returns correct response
- [x] Integration test: POST /api/ai/test with invalid key returns error
- [x] Integration test: POST /api/ai/test requires authentication
- [x] Manual test: Call endpoint with "2+2" and verify math result
- [x] Manual test: Call endpoint with "What is the capital of France?" and verify response

### Success Criteria
- [x] OpenRouter API client configured correctly
- [x] Test endpoint successfully calls AI
- [x] AI returns valid responses
- [x] Error handling works (missing key, API errors, timeouts)
- [x] All tests passing with 80%+ coverage
- [x] Manual test with "2+2" returns "4" or explanation

Verified live: "2+2" returned `4`, capital of France returned `Paris`, unauthenticated
call returned 401. Backend 78 tests, 97.73% coverage.

---

## Part 9: AI with Kanban Context

### Objective
Extend AI endpoint to accept Kanban board JSON and user question, return structured output with response and optional board updates.

### Substeps
- [x] Design AI interaction schema
  - [x] Input: board JSON, user question, conversation history
  - [x] Output: user response, optional board updates (add/edit/move/delete cards)
  - [x] Define JSON schema for structured outputs
- [x] Update AI service
  - [x] Create chat_with_board(board, question, history) function
  - [x] Build system prompt explaining Kanban context
  - [x] Include board state in prompt
  - [x] Include conversation history
  - [x] Request structured output from AI
  - [x] Parse structured response
- [x] Define structured output schema
  - [x] response: string (message to user)
  - [x] board_updates: optional array of operations
  - [x] Operations: add_card, edit_card, move_card, delete_card
  - [x] Each operation has required fields (id, columnId, title, etc.)
- [x] Implement board update parser
  - [x] Parse AI's structured output
  - [x] Validate operations
  - [x] Apply operations to board
  - [x] Handle conflicts or invalid operations
- [x] Create AI chat endpoint
  - [x] POST /api/ai/chat
  - [x] Accept: boardId, question, conversationHistory
  - [x] Fetch current board state
  - [x] Call AI with board context
  - [x] Parse structured output
  - [x] Apply board updates if present
  - [x] Save conversation history
  - [x] Return response and updated board state
- [x] Add conversation storage
  - [x] Create Conversation and Message models
  - [x] Store conversation history per board
  - [x] Retrieve history for context
- [x] Handle edge cases
  - [x] AI suggests invalid card ID
  - [x] AI suggests invalid column
  - [x] Malformed structured output
  - [x] No board updates needed

### Tests
- [x] Unit test: System prompt includes board state
- [x] Unit test: Structured output parser handles valid response
- [x] Unit test: Structured output parser handles malformed response
- [x] Unit test: Board update operations validate correctly
- [x] Unit test: add_card operation creates card
- [x] Unit test: edit_card operation updates card
- [x] Unit test: move_card operation changes column
- [x] Unit test: delete_card operation removes card
- [x] Unit test: Invalid operations are rejected
- [x] Integration test: POST /api/ai/chat with "add a card to backlog" creates card
- [x] Integration test: POST /api/ai/chat with "move X to done" moves card
- [x] Integration test: POST /api/ai/chat with "delete card Y" removes card
- [x] Integration test: POST /api/ai/chat with question only responds without updates
- [x] Integration test: Conversation history persists
- [x] Integration test: AI sees previous messages in context
- [x] Manual test: Ask AI to add multiple cards at once
- [x] Manual test: Ask AI to reorganize board
- [x] Manual test: Ask AI about board status

### Success Criteria
- [x] AI receives full board context
- [x] AI can respond with or without board updates
- [x] Structured output parsing works reliably
- [x] Board updates apply correctly to database
- [x] Conversation history maintained
- [x] Invalid operations handled gracefully
- [x] All tests passing with 80%+ coverage
- [x] Manual testing shows AI can manipulate board intelligently

Verified live against OpenRouter: board status question produced no operations; add, move,
and delete all applied; a two-operation turn applied both; the model refused to guess when
two cards shared a name rather than touching the wrong row. Backend 129 tests, 97.74%.

Notes: operations are returned as `operations`, not `board_updates`. The board read and the
conversation history are materialised and the read transaction closed before the model call,
so a minute-long request does not hold a SQLite read transaction. One unreproduced HTTP 500
was seen during manual testing; it did not recur across repeated attempts, including
concurrent requests, so no cause was confirmed.

---

## Part 10: AI Chat UI

### Objective
Add beautiful sidebar widget to frontend supporting full AI chat with automatic board refresh on AI updates.

### Substeps
- [x] Create chat UI components
  - [x] ChatSidebar component (slide-out panel)
  - [x] ChatMessage component (user vs AI styling)
  - [x] ChatInput component (textarea + send button)
  - [x] TypingIndicator component (loading dots)
- [x] Design chat sidebar
  - [x] Slide-out from right side
  - [x] Toggle button in header
  - [x] Chat history display (scrollable)
  - [x] Input at bottom
  - [x] Match color scheme
  - [x] Smooth animations
- [x] Implement chat state management
  - [x] Store messages in component state
  - [x] Track loading state
  - [x] Handle errors
  - [x] Auto-scroll to latest message
- [x] Connect to AI endpoint
  - [x] POST to /api/ai/chat on message send
  - [x] Send current board state
  - [x] Send conversation history
  - [x] Display AI response
  - [ ] Handle streaming if implemented
- [x] Implement board auto-refresh
  - [x] Detect board_updates in AI response
  - [x] Refresh board data after AI updates
  - [x] Show notification of updates
  - [x] Smooth transition/animation
  - [ ] Optimistic updates if possible
- [x] Add chat features
  - [x] Send on Enter, Shift+Enter for new line
  - [x] Disable input while loading
  - [x] Clear conversation option
  - [x] Timestamp on messages
  - [x] Error display and retry
- [x] Mobile responsiveness
  - [x] Full-screen chat on mobile
  - [x] Swipe to close
  - [x] Touch-friendly input

### Tests
- [x] Frontend unit test: ChatSidebar renders correctly
- [x] Frontend unit test: ChatMessage displays user vs AI styles
- [x] Frontend unit test: ChatInput sends on Enter
- [x] Frontend unit test: ChatInput allows Shift+Enter for new line
- [x] Frontend unit test: Messages auto-scroll to bottom
- [x] Frontend unit test: Loading state disables input
- [x] Integration test: Send message → receive AI response
- [x] Integration test: AI updates board → board refreshes
- [x] Integration test: Conversation history persists in chat
- [x] Integration test: Error shows retry option
- [x] E2E test: Open chat sidebar
- [x] E2E test: Send message and receive response
- [x] E2E test: Ask AI to add card → card appears on board
- [x] E2E test: Ask AI to move card → card moves on board
- [x] E2E test: Ask AI to delete card → card disappears
- [x] E2E test: Ask AI question → get response without board changes
- [x] E2E test: Multiple messages in conversation maintain context
- [x] E2E test: Close and reopen sidebar preserves conversation
- [x] E2E test: Chat works on mobile viewport

### Success Criteria
- [x] Beautiful, functional chat sidebar
- [x] Smooth slide-out animation
- [x] AI responses display correctly
- [x] Board auto-refreses when AI makes changes
- [x] Visual feedback for board updates
- [x] Conversation history maintained
- [x] Mobile responsive
- [x] All tests passing with 80%+ coverage
- [x] UX is smooth and intuitive
- [x] No lag or janky animations

Verified: 67 frontend unit tests, 16 Playwright tests including four that drive the real
OpenRouter model, 131 backend tests at 97.61% coverage, lint clean, static build OK.

Only two conditional items remain unticked, both deliberate: streaming (the endpoint answers
in a single response) and optimistic board updates (the server returns the authoritative
board, which the panel applies directly).

---

## Part 11: Card Intelligence

### Objective
Analyse a single card and suggest its details, priority, and possible duplicates.

### Substeps
- [x] Add card priority to the database
  - [x] `priority` column on `cards`, defaulting to `medium`
  - [x] Migration 0003, verified up and down against a scratch database
  - [x] Expose priority in `CardOut` and the board serializer
  - [x] `PATCH /api/cards/:id` persists priority (it was accepted and dropped)
  - [x] `edit_card` AI operation can set priority
- [x] Add the card intelligence endpoint
  - [x] POST /api/ai/card-intelligence with board_id, card_id, task
  - [x] task is a Literal, so an unknown task is a 422 not a model call
  - [x] Board snapshot materialised and the read transaction closed first
  - [x] Json-object response format
- [x] Generate details and acceptance criteria from a title
  - [x] Model returns a one line summary and an "Acceptance criteria" list
  - [x] Returned in a `details` field, separate from the one line `result`
- [x] Suggest a priority
  - [x] Model weighs card wording and board state
  - [x] An unrecognised priority is dropped rather than stored
- [x] Detect duplicate or overlapping cards
  - [x] Model returns card_id, similarity, and a reason
  - [x] Ids the model invents are dropped
- [x] Add the card AI menu to the frontend
  - [x] Menu on every card offering the three tasks
  - [x] Result shown inline with the generated body or match reasons
  - [x] Nothing is written to the card until the user applies it
  - [x] Card shows a priority badge

### Tests
- [x] Backend unit test: endpoint requires authentication
- [x] Backend unit test: unknown task returns 422
- [x] Backend unit test: unknown board returns 404
- [x] Backend unit test: another user's board returns 403
- [x] Backend unit test: generate_details returns acceptance criteria
- [x] Backend unit test: suggest_priority returns a priority
- [x] Backend unit test: an unrecognised priority is dropped
- [x] Backend unit test: detect_duplicates returns matches
- [x] Backend unit test: an invented duplicate id is dropped
- [x] Backend unit test: no duplicates returns an empty list
- [x] Backend unit test: service rejects an unknown card
- [x] Backend unit test: provider error returns 502, missing key returns 503
- [x] Backend unit test: board returns card priority
- [x] Backend unit test: patching priority persists to the database
- [x] Backend unit test: an unknown priority is rejected with 422
- [x] Backend unit test: a created card defaults to medium
- [x] Backend unit test: edit_card sets priority, and rejects a bad value
- [x] Frontend unit test: menu is closed until the AI button is clicked
- [x] Frontend unit test: posts the selected task to the right endpoint
- [x] Frontend unit test: priority is not written until applied
- [x] Frontend unit test: details are not written until applied
- [x] Frontend unit test: duplicates render with similarity and reason
- [x] Frontend unit test: request failure shows an error

### Success Criteria
- [x] Card details and acceptance criteria generated from a title
- [x] Card priority suggested from content and board state
- [x] Duplicate and overlapping cards detected
- [x] Nothing reaches the database without an explicit user action
- [x] All tests passing (backend 166, 93.47%)

### Notes
- Two bugs were found by the tests and fixed. The service read `card.column_id`, but
  the board snapshot is a Pydantic tree with no back reference, so every call raised
  `AttributeError`; the column now comes from the search that found the card. The
  reorder filter compared string JSON keys against integer column ids and discarded
  every valid reordering.
- Bottleneck and next-action titles are resolved from the database, not taken from the
  model, so a hallucinated id cannot inject a name.

---

## Part 12: Workflow Optimization

### Objective
Analyse the whole board and recommend what to do next per card, where work is
piling up, and how each column should be ordered.

### Substeps
- [x] Add the workflow optimization endpoint
  - [x] POST /api/ai/workflow-optimization with board_id
  - [x] Board snapshot materialised and the read transaction closed first
  - [x] Json-object response format
- [x] Recommend the next best action for each card
  - [x] One imperative sentence per card, in board order
  - [x] Cards in the final column are called out for close out
  - [x] Ids the model invents are dropped
- [x] Predict column bottlenecks
  - [x] Piling up, blocking others, or stalled
  - [x] A concrete reason, not the column title restated
  - [x] Omitted entirely when no column is a bottleneck
- [x] Suggest optimal card ordering within a column
  - [x] Model returns a column id to card id list
  - [x] Only kept when the list is a permutation of that column's real cards
- [x] Add the workflow panel to the frontend
  - [x] Slide-out panel with a Workflow button in the header
  - [x] Next actions, bottlenecks, ordering, and suggestions as separate sections
  - [x] Card and column ids resolved to titles, never shown raw
  - [x] Loading, error with retry, and a healthy-board message

### Tests
- [x] Backend unit test: endpoint requires authentication
- [x] Backend unit test: next actions resolve card titles from the board
- [x] Backend unit test: an invented card id is dropped
- [x] Backend unit test: bottlenecks fall back to the real column title
- [x] Backend unit test: an invented column id is dropped
- [x] Backend unit test: a valid reordering is kept
- [x] Backend unit test: a reordering that drops a card is discarded
- [x] Backend unit test: unknown board 404, another user's board 403
- [x] Backend unit test: provider error returns 502, missing key returns 503
- [x] Frontend unit test: does not call the API until opened
- [x] Frontend unit test: loading state shown while analyzing
- [x] Frontend unit test: next actions render for every card
- [x] Frontend unit test: bottlenecks render with their reason
- [x] Frontend unit test: ordering renders titles, not ids
- [x] Frontend unit test: suggestions render
- [x] Frontend unit test: an empty result reports a healthy board
- [x] Frontend unit test: error shows a retry button
- [x] Frontend unit test: Refresh reloads
- [x] Frontend unit test: Close fires, and a closed panel is aria-hidden

### Success Criteria
- [x] Next best action recommended for every card
- [x] Bottlenecks predicted before they block the board
- [x] Column ordering suggested
- [x] No recommendation can delete or invent a card
- [x] All tests passing (frontend 96)

### Notes
- The panel was imported but never rendered and had no toggle button, so the whole
  feature was unreachable in the browser. Now mounted with a Workflow button.
- A reorder that is not a permutation of the real column is discarded rather than
  applied, because applying it would silently drop a card from the board.

---

## Testing Strategy Summary

### Unit Testing
- **Backend:** pytest with pytest-cov
- **Frontend:** Vitest with coverage
- **Target:** 80% minimum coverage for all new code
- **Run frequency:** On every commit

### Integration Testing
- **Backend:** pytest with test database
- **Frontend:** Vitest with mock API
- **Full-stack:** API integration tests
- **Target:** All critical user flows covered

### E2E Testing
- **Framework:** Playwright
- **Browsers:** Chromium, Firefox, WebKit
- **Scope:** Complete user journeys
- **Run frequency:** Before each part completion

### Test Data
- Use factories/fixtures for consistent test data
- Separate test database for integration tests
- Reset state between tests
- No dependencies between tests

### CI/CD Considerations
- All tests must pass before merging
- Coverage reports generated automatically
- E2E tests run in Docker environment
- Fast feedback loop (< 5 minutes total)

---

## Definition of Done (Each Part)

- [ ] All substeps completed
- [ ] All tests written and passing
- [ ] Unit test coverage ≥ 80%
- [ ] Integration tests cover critical paths
- [ ] E2E tests verify user flows
- [ ] Code reviewed (self-review minimum)
- [ ] Documentation updated
- [ ] No console errors or warnings
- [ ] Tested in Docker environment
- [ ] User acceptance (where applicable)

---

## Risk Mitigation

### Technical Risks
- **Docker complexity:** Start simple, iterate
- **Frontend/backend sync:** Use TypeScript types on both sides
- **AI reliability:** Robust error handling, fallbacks
- **Database migrations:** Use proper migration tool from start
- **Session management:** Consider JWT for scalability

### Process Risks
- **Scope creep:** Stick to MVP features only
- **Over-engineering:** Keep it simple, per coding standards
- **Testing gaps:** Write tests alongside code, not after
- **Integration issues:** Test integrations early and often

---

## Next Steps

**User Actions Required:**
1. Review this plan
2. Approve or request changes
3. Ensure OPENROUTER_API_KEY is available
4. Approve before proceeding to Part 2

**Agent Actions After Approval:**
1. Create .env with OPENROUTER_API_KEY
2. Begin Part 2: Scaffolding
3. Work through each part sequentially
4. Check in with user at each part completion
