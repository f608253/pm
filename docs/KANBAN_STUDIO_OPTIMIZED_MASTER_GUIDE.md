# Kanban Studio: Comprehensive Technical & Functional Architecture Master Guide

**Version:** 0.2.0-PROD  
**Date:** October 11, 2026  
**Author:** Kanban Studio Engineering Team (Co-Authored-By: Claude Code <noreply@anthropic.com>)  

---

## 1. Executive Summary

**Kanban Studio** is an enterprise-grade project management platform that combines the fluid interactivity of modern Kanban boards with advanced Artificial Intelligence capabilities. Built with a robust full-stack architecture, it bridges the gap between traditional task management and AI-assisted workflow optimization.

The application is engineered for production deployment using a containerized monolithic architecture. A high-performance **FastAPI Python backend** serves both RESTful API endpoints and pre-compiled static **Next.js 16 App Router** assets, backed by SQLite with SQLAlchemy 2.x and OpenRouter AI integration (`openai/gpt-oss-120b`).

---

## 2. Architecture & Technology Stack

### 2.1 Technology Matrix

| Layer | Technology | Version / Spec | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | Next.js / React / Tailwind CSS | Next.js 16 (App Router) | Client-side rendering, exported as static assets (`output: 'export'`) |
| **Drag & Drop** | `@dnd-kit` | v6.x | Accessible, performant card and column drag-and-drop primitives |
| **Backend API** | FastAPI / Python | Python 3.12, FastAPI 0.110+ | Synchronous ASGI request handlers running in dedicated threadpools |
| **Database ORM** | SQLAlchemy / Alembic | SQLAlchemy 2.x | Type-safe database mapping, relationship loading, and schema migrations |
| **Database** | SQLite | SQLite 3 | Persistent relational storage mounted via external Docker volume (`./data:/data`) |
| **AI Integration** | OpenRouter API | `openai/gpt-oss-120b` | Structured JSON board operations, card intelligence, and risk assessment |

---

## 3. Frontend & Backend Interaction

### 3.1 Communication Flow
1. **Client Request:** The user interacts with the Next.js frontend running in the browser.
2. **API Dispatch:** API calls are made to `/api/*` endpoints (e.g., `/api/boards`, `/api/ai/chat`).
3. **FastAPI Routing:** In development, Next.js proxies these requests to port `8000`. In production, FastAPI directly handles API requests and serves static files for any non-API route via a catch-all route handler:
   ```python
   @app.get("/{full_path:path}", include_in_schema=False)
   async def serve_frontend(full_path: str):
       if full_path.startswith("api/"):
           raise HTTPException(status_code=404, detail="Not Found")
       candidate = (STATIC_DIR / full_path).resolve()
       if full_path and candidate.is_file() and candidate.is_relative_to(STATIC_DIR):
           return FileResponse(candidate)
       return FileResponse(STATIC_DIR / "index.html")
   ```
4. **Authentication:** All protected requests include an `Authorization: Bearer <token>` header verified by FastAPI dependency injection (`backend/app/api/deps.py`).

---

## 4. Production Deployment vs. Development

### 4.1 Why This is a Production Deployment
* **Multi-Stage Docker Build:** The Dockerfile builds the Next.js static export in a temporary Node 24 container (`/build/out`), then copies the static export into the Python 3.12 slim production image at `/srv/static`. No Node.js runtime overhead exists in production.
* **Persistent Volume Mounting:** SQLite data is stored at `./data/kanban.db` via Docker volume mapping (`./data:/data`), ensuring database durability across container restarts and updates.
* **Automatic Restart Policy:** Configured with `restart: unless-stopped` in Docker Compose for continuous high availability.
* **Optimized Static Serving:** FastAPI serves pre-minified static assets instantly with zero build latency for end users.

---

## 5. Restart & Maintenance FAQ

### Question: After making changes, do we need to restart both frontend and backend?
**Answer:** In production (Docker), because the frontend is compiled into static assets and bundled directly inside the backend container image, **any frontend or backend code change requires rebuilding and restarting the Docker container** so the static export and Python code are updated.

**Commands to rebuild and restart:**
```bash
./scripts/start.sh   # Or: docker compose up --build -d
```

---

## 6. AI Subsystem & LLM Integration

Kanban Studio integrates with OpenRouter using the high-performance model `openai/gpt-oss-120b`. 

### 6.1 Core AI Features
* **Conversational Board Assistant (`/api/ai/chat`):** Interprets natural language user prompts alongside board state snapshots, returning structured JSON containing operations (`add_card`, `edit_card`, `move_card`, `delete_card`) executed transactionally.
* **Card Intelligence (`/api/ai/card-intelligence`):** Automatically generates acceptance criteria, priority suggestions, and duplicate checks.
* **Workflow Optimization & Risk Assessment:** Analyzes column bottlenecks and offers strategic project management insights.
* **AI Tech News Feed:** Aggregates live industry updates for team awareness.

---

## 7. Security & Hardening

* **Strict CORS Middleware:** Configurable origin filtering via `ALLOWED_ORIGINS` environment variable.
* **Foreign Key Constraints:** Explicit SQLite `PRAGMA foreign_keys=ON` connection events ensuring relational integrity.
* **Token-Based Auth:** Secure bearer tokens validated against persistent database sessions.
* **Scoped Board Operations:** Strict validation ensuring AI-driven operations cannot cross board boundaries.

---
*Kanban Studio Technical Documentation &bull; Generated with Claude Code*
