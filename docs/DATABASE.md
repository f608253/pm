# Database Design

Schema for the Kanban MVP. SQLite, accessed through SQLAlchemy 2.x.

## Goals

- Support every MVP feature: sign in, one board per user, five fixed columns,
  drag-and-drop ordering, card create/edit/delete
- Allow multi-user and multi-board growth later without a redesign
- Keep the board easy to serialise to JSON for the AI in Part 9
- Auto-create and auto-seed on first run so there is nothing to install manually

## Entity relationship diagram

```
                 +-----------+
                 |   users   |
                 +-----------+
                 | PK id     |
                 | UQ username
                 | password_hash
                 | created_at
                 +-----+-----+
                       |
                       | 1:N  (ON DELETE CASCADE)
                       |
                 +-----v-----------+
                 |    boards      |
                 +----------------+
                 | PK id          |
                 | FK user_id     |
                 | title          |
                 | created_at     |
                 | updated_at     |
                 +-----+----------+
                       |
                       | 1:N  (ON DELETE CASCADE)
                       |
                 +-----v-----------+
                 |    columns     |
                 +----------------+
                 | PK id          |
                 | FK board_id    |
                 | title          |
                 | position       |
                 | created_at     |
                 | updated_at     |
                 +-----+----------+
                       |
                       | 1:N  (ON DELETE CASCADE)
                       |
                 +-----v----------+
                 |     cards      |
                 +----------------+
                 | PK id          |
                 | FK column_id   |
                 | title          |
                 | details        |
                 | position       |
                 | created_at     |
                 | updated_at     |
                 +----------------+
```

Cardinality: a user owns many boards, a board has many columns, a column has many
cards. The MVP creates exactly one board per user, but nothing in the schema
prevents more.

## Tables

### users

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | INTEGER | PK, autoincrement | |
| username | TEXT | NOT NULL, UNIQUE | Login identifier |
| password_hash | TEXT | NOT NULL | PBKDF2-HMAC-SHA256, salted |
| created_at | DATETIME | NOT NULL | UTC, server default |

The UNIQUE constraint on `username` is what makes login lookup a single indexed hit
and prevents duplicate accounts.

### boards

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | INTEGER | PK, autoincrement | |
| user_id | INTEGER | NOT NULL, FK users.id, ON DELETE CASCADE | Indexed |
| title | TEXT | NOT NULL | Defaults to "My Board" |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### columns

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | INTEGER | PK, autoincrement | |
| board_id | INTEGER | NOT NULL, FK boards.id, ON DELETE CASCADE | Indexed |
| title | TEXT | NOT NULL | User-renameable |
| position | INTEGER | NOT NULL | 0-based left-to-right order |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### cards

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | INTEGER | PK, autoincrement | |
| column_id | INTEGER | NOT NULL, FK columns.id, ON DELETE CASCADE | Indexed |
| title | TEXT | NOT NULL | |
| details | TEXT | NOT NULL, default '' | Optional in the UI |
| position | INTEGER | NOT NULL | 0-based top-to-bottom order |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

## Ordering

`position` is an integer and is the sole source of order. The frontend's
`cardIds` array maps directly onto a `SELECT ... ORDER BY position`.

On a move, the affected rows are renumbered to a contiguous `0..n-1` range in one
transaction. Fractional positions (leaving gaps, avoiding rewrites) were
considered and rejected: they accumulate float drift and complicate the JSON the AI
sees, and a single user board is far too small for write amplification to matter.

## Indexes

| Table | Index | Columns | Why |
|---|---|---|---|
| users | auto (UNIQUE) | username | Login lookup |
| boards | ix_boards_user_id | user_id | Load a user's boards |
| columns | ix_columns_board_id | board_id | Load a board's columns |
| cards | ix_cards_column_id | column_id | Load a column's cards |

The three FK indexes are not created automatically by SQLite, and without them every
board load would full-scan. Composite indexes such as `(column_id, position)` were
considered; the row counts are tiny, so the single-column index plus an explicit
`ORDER BY position` is sufficient and simpler.

## Deletion behaviour

All foreign keys cascade. Deleting a user removes their boards, which removes the
columns, which removes the cards. Deleting a column removes its cards. SQLite only
enforces foreign keys when `PRAGMA foreign_keys=ON` is set per connection, so the
application sets it on connect.

## Storage

- File: `/data/kanban.db` inside the container, bind-mounted to `./data` on the host
  so the board survives image rebuilds
- Configured by `DATABASE_URL`, defaulting to `sqlite:////data/kanban.db`
- Created on first run if missing, followed by the seed below

## Seed data

On first run only, the database is seeded so there is something to look at:

- One user: `user` / `password` (PBKDF2 hashed)
- One board: "My Board"
- Five columns at positions 0-4: Backlog, Discovery, In Progress, Review, Done
- Eight sample cards matching the frontend demo data

Seeding is skipped when a user with the name `user` already exists, so restarting the
container never duplicates anything.

## ORM approach

SQLAlchemy 2.x declarative models with `Mapped[...]` typing, one module
`backend/app/models.py`. Relationships are declared with `back_populates` and lazy
loading is set to `selectin` where the board is read as a whole.

Alembic manages migrations from Part 6 onward. The MVP creates tables with
`metadata.create_all()` on startup and stamps the Alembic head, so the first real
migration has a clean baseline.

Plain stdlib `sqlite3` was the alternative. It is genuinely simpler for four tables,
but SQLAlchemy's relationship handling is what keeps the board-to-JSON assembly in
Part 6 readable, and it leaves a clean path to a different database later.

## Password hashing

PBKDF2-HMAC-SHA256 via `hashlib` from the standard library, with a per-user random
salt, encoded as `pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>` so the iteration
count can be raised later without invalidating existing hashes. No extra dependency.

Argon2 or bcrypt would be the upgrade if this ever left a local container.

## JSON representation

The API shape the frontend and the AI consume, matching the existing TypeScript types
in `frontend/src/lib/kanban.ts`:

```json
{
  "id": 1,
  "title": "My Board",
  "columns": [
    {
      "id": 1,
      "title": "Backlog",
      "cards": [
        { "id": 1, "title": "Align roadmap themes", "details": "Summarise Q3 themes." }
      ]
    }
  ]
}
```

`position` is implied by array order, so it is not repeated in the payload.

## Sample queries

Load a user's board for the API and the AI:

```sql
SELECT id, title FROM boards WHERE user_id = ?;

SELECT id, title, position FROM columns
 WHERE board_id = ? ORDER BY position;

SELECT id, column_id, title, details, position FROM cards
 WHERE column_id IN (SELECT id FROM columns WHERE board_id = ?)
 ORDER BY column_id, position;
```

Rename a column:

```sql
UPDATE columns SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;
```

Move a card between columns, renumbering the destination:

```sql
BEGIN;
UPDATE cards SET column_id = ?, position = -1 WHERE id = ?;
UPDATE cards SET position = position + 1
 WHERE column_id = ? AND position >= ?;
UPDATE cards SET position = position - 1, updated_at = CURRENT_TIMESTAMP
 WHERE column_id = (
       SELECT column_id FROM cards WHERE id = ?
     ) AND position < 0;
COMMIT;
```

## Conversation storage (planned, Part 9)

Not part of the MVP schema but designed now so it fits without rework:

### conversations

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| board_id | INTEGER | NOT NULL, FK boards.id, ON DELETE CASCADE |
| created_at | DATETIME | NOT NULL |

### messages

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| conversation_id | INTEGER | NOT NULL, FK conversations.id, ON DELETE CASCADE |
| role | TEXT | NOT NULL, CHECK (role IN ('user', 'assistant')) |
| content | TEXT | NOT NULL |
| created_at | DATETIME | NOT NULL |

History is scoped per board rather than per user, which keeps the Part 9 query a
single indexed join. Only the most recent N turns need to be sent to the model, so
`messages(conversation_id, created_at)` should be indexed.

## Decisions needing sign-off

1. Integer autoincrement primary keys, not UUIDs
2. Integer `position` renumbered on every move, not fractional
3. SQLAlchemy 2.x + Alembic, not stdlib `sqlite3`
4. Hard cascade deletes, no soft deletes
5. Conversation tables deferred to Part 9 but shaped now
6. Database file at `/data/kanban.db` (already bind-mounted to `./data`)