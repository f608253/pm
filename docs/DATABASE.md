# Database Schema

## Storage

- SQLite database at `./data/kanban.db`
- Managed with SQLAlchemy 2.x
- Migrations managed by Alembic
- Foreign keys enforced via `PRAGMA foreign_keys=ON`

## ERD

```
User (1) ──── (N) Board (1) ──── (N) Column (1) ──── (N) Card
Board (1) ──── (N) Conversation (1) ──── (N) Message
```

## Tables

### users

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK, autoincrement |
| username | String(64) | NOT NULL, UNIQUE |
| password_hash | String(255) | NOT NULL |
| created_at | DateTime | NOT NULL, server default current_timestamp |

Indexes: `username` (unique)

Relationships: `boards` (one-to-many, cascade delete)

### boards

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK, autoincrement |
| user_id | Integer | NOT NULL, FK to users.id ON DELETE CASCADE |
| title | String(120) | NOT NULL |
| created_at | DateTime | NOT NULL, server default current_timestamp |
| updated_at | DateTime | NOT NULL, server default current_timestamp, on update current_timestamp |

Indexes: `ix_boards_user_id`

Relationships: `user` (many-to-one), `columns` (one-to-many, cascade delete, ordered by position)

### columns

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK, autoincrement |
| board_id | Integer | NOT NULL, FK to boards.id ON DELETE CASCADE |
| title | String(120) | NOT NULL |
| position | Integer | NOT NULL |
| created_at | DateTime | NOT NULL, server default current_timestamp |
| updated_at | DateTime | NOT NULL, server default current_timestamp, on update current_timestamp |

Indexes: `ix_columns_board_id`

Relationships: `board` (many-to-one), `cards` (one-to-many, cascade delete, ordered by position)

### cards

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK, autoincrement |
| column_id | Integer | NOT NULL, FK to columns.id ON DELETE CASCADE |
| title | String(200) | NOT NULL |
| details | Text | NOT NULL, default '' |
| priority | String(16) | NOT NULL, default 'medium' |
| position | Integer | NOT NULL |
| created_at | DateTime | NOT NULL, server default current_timestamp |
| updated_at | DateTime | NOT NULL, server default current_timestamp, on update current_timestamp |

Indexes: `ix_cards_column_id`

Relationships: `column` (many-to-one)

### conversations

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK, autoincrement |
| board_id | Integer | NOT NULL, FK to boards.id ON DELETE CASCADE |
| created_at | DateTime | NOT NULL, server default current_timestamp |

Indexes: `ix_conversations_board_id`

Relationships: `messages` (one-to-many, cascade delete, ordered by id)

### messages

| Column | Type | Constraints |
|--------|------|-------------|
| id | Integer | PK, autoincrement |
| conversation_id | Integer | NOT NULL, FK to conversations.id ON DELETE CASCADE |
| role | String(16) | NOT NULL, `user` or `assistant` |
| content | Text | NOT NULL |
| created_at | DateTime | NOT NULL, server default current_timestamp |

Indexes: `ix_messages_conversation_id`

Relationships: `conversation` (many-to-one)

## Cascade Behavior

- Deleting a user deletes all their boards
- Deleting a board deletes its columns and conversations
- Deleting a column deletes its cards
- Deleting a conversation deletes its messages
- Deleting a user does not cascade to boards through FK; boards are deleted via ORM relationship cascade

## Positions

Columns and cards use integer `position` fields, renumbered on every move. No fractional gaps.

## Seed Data

On first run, the database creates:
- User `user` with password `password`
- One board titled `My Board`
- Five columns: `Backlog`, `To Do`, `In Progress`, `Review`, `Done`
- Sample cards in each column

## Migrations

Initial schema: `0001_initial` (users, boards, columns, cards)
Conversations and messages: `0002_conversations`
Card priority: `0003_card_priority`

Future migrations should use:
```bash
alembic revision --autogenerate
alembic upgrade head
```

## Sample Queries

Get all boards for current user:
```sql
SELECT * FROM boards WHERE user_id = :user_id ORDER BY id;
```

Get board with columns and cards:
```sql
SELECT * FROM columns WHERE board_id = :board_id ORDER BY position;
SELECT * FROM cards WHERE column_id = :column_id ORDER BY position;
```

Get conversation history:
```sql
SELECT role, content FROM messages WHERE conversation_id = :conv_id ORDER BY id;
```
