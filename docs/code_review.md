# Comprehensive Code Review & Action Plan

**Date:** October 6, 2026  
**Project:** Kanban Studio (Project Management MVP with AI Integration)  
**Target Scope:** Entire Repository (`backend/`, `frontend/`, `docs/`, `scripts/`, Docker setup)

---

## 1. Executive Summary

Kanban Studio is a full-stack MVP featuring a Next.js 16 App Router frontend, a FastAPI Python backend with SQLAlchemy 2.x and SQLite, and OpenRouter AI integration (`openai/gpt-oss-120b`). 

A comprehensive static and dynamic code review was performed across the codebase. While the foundational architecture is solid (~97.6% test coverage, clean FastAPI routing, static export serving), the review identified **8 critical code defects** and several architectural improvements needed before production deployment.

---

## 2. Verified Code Defects (Bug & Correctness Findings)

### 🔴 Critical Correctness & Security Bugs

1. **Cross-Board Operations Vulnerability (`backend/app/services/board_ops.py:25`)**
   - **Defect:** `_column` lookup verifies that the column belongs to the user, but does *not* verify that the target column belongs to the active board being operated on.
   - **Failure Scenario:** If an AI prompt returned by a user asks to move a card to a column belonging to another board owned by the same user, `apply_operation` moves the card across boards, corrupting column and board data structures.
   - **Fix:** Add `Column.board_id == board.id` validation in `_column` lookup.

2. **Unreachable / Disconnected AI Analysis Panels (`frontend/src/components/KanbanBoard.tsx:364`)**
   - **Defect:** Five new AI analysis feature components (`RiskAssessmentPanel`, `SprintRetrospectivePanel`, `StandupPanel`, `WeeklyReportPanel`, `EffortEstimationPanel`) and their corresponding API endpoints were created but never integrated or rendered in `KanbanBoard.tsx`.
   - **Failure Scenario:** Users cannot trigger or view risk assessments, retrospectives, standups, weekly reports, or effort estimates from the UI.
   - **Fix:** Add navigation triggers / action buttons in the top header or assistant menu to render these panels.

3. **Unhandled Exception & 500 Crash in `fetch_ai_news` (`backend/app/services/ai.py:571`)**
   - **Defect:** `fetch_ai_news()` does not handle network errors (`httpx.HTTPError`), malformed RSS XML (`ET.ParseError`), or missing XML attributes (`AttributeError`).
   - **Failure Scenario:** If the TechCrunch RSS feed is unreachable, returns HTTP 4xx/5xx, or serves unexpected XML, the request crashes with an unhandled HTTP 500 error instead of returning a handled 502/503 response.
   - **Fix:** Wrap HTTP request and XML parsing in a `try...except` block raising `AiError`.

4. **Null Pointer Crash on Workflow Optimization (`backend/app/api/ai.py:233`)**
   - **Defect:** When the LLM outputs `"optimal_order": null` in its JSON payload, `result.get("optimal_order", {})` evaluates to `None`. Calling `.items()` on `None` throws `AttributeError: 'NoneType' object has no attribute 'items'`.
   - **Failure Scenario:** The endpoint crashes with HTTP 500 when OpenRouter returns `null` for optimal order instead of falling back to `{}`.
   - **Fix:** Safely fallback using `(result.get("optimal_order") or {}).items()`.

5. **Local State Overwrite on Renaming Failure (`frontend/src/components/KanbanBoard.tsx:115`)**
   - **Defect:** Debounced column renaming failure triggers `fail()`, which re-fetches the entire board state from the backend.
   - **Failure Scenario:** If a network blip occurs while typing a column title, all subsequent unsaved local board state edits are discarded and overwritten by the stale server state.
   - **Fix:** Show a non-destructive toast/banner on rename failure without re-fetching the full board.

6. **Card Drag Event Interference with Action Buttons (`frontend/src/components/KanbanCard.tsx:38`)**
   - **Defect:** `@dnd-kit` drag listeners attached to the root `<article>` element do not stop event propagation on child buttons (such as the AI intelligence button or delete button).
   - **Failure Scenario:** Clicking action buttons on mobile or quick pointer clicks initiates a drag action instead of firing the button click handler.
   - **Fix:** Add `e.stopPropagation()` on button pointer down handlers or scope drag listeners to a dedicated drag handle.

7. **Dropdown Menu Stays Open on Focus Loss (`frontend/src/components/CardActionsMenu.tsx:74`)**
   - **Defect:** `CardActionsMenu` dropdown lacks a click-outside handler or backdrop overlay.
   - **Failure Scenario:** Opening the AI menu on a card and clicking elsewhere on the board leaves the menu permanently open until manually toggled.
   - **Fix:** Add a click-outside event listener (`useRef` + `useEffect` on `pointerdown`).

8. **Random Shuffling of RSS News Feed (`backend/app/services/ai.py:594`)**
   - **Defect:** `fetch_ai_news` uses `random.shuffle()` and `random.sample()` on fetched RSS articles.
   - **Failure Scenario:** Every page refresh displays random articles in arbitrary order rather than showing the newest published tech news, breaking expected feed chronology.
   - **Fix:** Sort articles chronologically by publication date.

---

## 3. Architecture & Security Review Findings

1. **In-Memory Session Storage (`backend/app/sessions.py`)**
   - **Issue:** Bearer tokens live in a Python dictionary (`_sessions`). Server restart or container deployment invalidates active user logins.
   - **Action Item:** Migrate to database-backed session models or stateless JWT tokens.

2. **Wildcard CORS (`backend/app/main.py`)**
   - **Issue:** `CORSMiddleware` configures `allow_origins=["*"]` with `allow_credentials=True`.
   - **Action Item:** Restrict allowed origins to configurable domain env var (`ALLOWED_ORIGINS`).

3. **Git Repository Hygiene (Tracked Databases and Test Traces)**
   - **Issue:** `data/kanban.db` and Playwright trace archives (`frontend/test-results/`) are tracked in Git.
   - **Action Item:** Add `data/*.db` and `frontend/test-results/` to root `.gitignore` and run `git rm --cached`.

---

## 4. Remediation Plan & Next Steps

| Task ID | Item | Category | Priority |
|---------|------|----------|----------|
| **FIX-1** | Restrict `_column` lookup to active board (`board_ops.py`) | Security / Bug | 🔴 High |
| **FIX-2** | Connect the 5 AI Analysis Panels to `KanbanBoard.tsx` header | UI / Feature | 🔴 High |
| **FIX-3** | Add exception handling for `fetch_ai_news` & sort chronologically | Backend Bug | 🔴 High |
| **FIX-4** | Handle `null` safely in `workflow_optimization` | Backend Bug | 🔴 High |
| **FIX-5** | Fix non-destructive error handling on debounced column rename | Frontend Bug | 🟡 Medium |
| **FIX-6** | Stop drag propagation on `KanbanCard` action buttons | Frontend UX | 🟡 Medium |
| **FIX-7** | Add click-outside listener to `CardActionsMenu` | Frontend UX | 🟡 Medium |
| **FIX-8** | Migrate session storage to SQLite DB & fix CORS origins | Architecture | 🟡 Medium |

---
*Report updated with findings from Automated Code Review Engine.*
