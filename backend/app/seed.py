from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Board, Card, Column, User
from app.security import hash_password

DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"

DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]

# Mirrors initialData in frontend/src/lib/kanban.ts
SEED_CARDS: dict[str, list[tuple[str, str]]] = {
    "Backlog": [
        ("Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
        ("Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ],
    "Discovery": [
        ("Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ],
    "In Progress": [
        ("Refine status language", "Standardize column labels and tone across the board."),
        ("Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ],
    "Review": [
        ("QA micro-interactions", "Verify hover, focus, and loading states."),
    ],
    "Done": [
        ("Ship marketing page", "Final copy approved and asset pack delivered."),
        ("Close onboarding sprint", "Document release notes and share internally."),
    ],
}


def seed_default_board(db: Session, user: User, title: str = "My Board") -> Board:
    board = Board(user_id=user.id, title=title)
    db.add(board)
    db.flush()

    for position, column_title in enumerate(DEFAULT_COLUMNS):
        column = Column(board_id=board.id, title=column_title, position=position)
        db.add(column)
        db.flush()

        for card_position, (card_title, details) in enumerate(
            SEED_CARDS.get(column_title, [])
        ):
            db.add(
                Card(
                    column_id=column.id,
                    title=card_title,
                    details=details,
                    position=card_position,
                )
            )

    db.commit()
    db.refresh(board)
    return board


def seed(db: Session) -> None:
    user = db.scalar(select(User).where(User.username == DEMO_USERNAME))
    if user is None:
        user = User(
            username=DEMO_USERNAME, password_hash=hash_password(DEMO_PASSWORD)
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    has_board = db.scalar(select(Board).where(Board.user_id == user.id))
    if has_board is None:
        seed_default_board(db, user)