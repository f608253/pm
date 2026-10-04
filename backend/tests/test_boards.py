from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Board, Card, Column, User


def seeded_board(db: Session) -> Board:
    db.expire_all()
    board = db.scalar(select(Board).order_by(Board.id))
    assert board is not None
    return board


def column_by_title(db: Session, title: str) -> Column:
    db.expire_all()
    column = db.scalar(select(Column).join(Board).where(Column.title == title))
    assert column is not None
    return column


def titles_in_order(board: Board) -> list[str]:
    return [c.title for c in sorted(board.columns, key=lambda c: c.position)]


# --- boards -----------------------------------------------------------------


def test_list_boards_returns_seeded_board(auth_client: TestClient):
    response = auth_client.get("/api/boards")

    assert response.status_code == 200
    assert "My Board" in [b["title"] for b in response.json()]


def test_get_board_returns_nested_columns_and_cards(auth_client: TestClient, db: Session):
    board_id = seeded_board(db).id

    body = auth_client.get(f"/api/boards/{board_id}").json()

    assert body["id"] == board_id
    assert [c["title"] for c in body["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert [card["title"] for card in body["columns"][0]["cards"]] == [
        "Align roadmap themes",
        "Gather customer signals",
    ]


def test_create_board_persists(auth_client: TestClient, db: Session):
    response = auth_client.post("/api/boards", json={"title": "Second Board"})

    assert response.status_code == 201
    assert response.json()["title"] == "Second Board"
    db.expire_all()
    assert db.scalar(select(Board).where(Board.title == "Second Board")) is not None


def test_update_board_title(auth_client: TestClient, db: Session):
    board_id = seeded_board(db).id

    response = auth_client.patch(f"/api/boards/{board_id}", json={"title": "Renamed"})

    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"
    db.expire_all()
    assert db.get(Board, board_id).title == "Renamed"


def test_update_board_rejects_blank_title(auth_client: TestClient, db: Session):
    board_id = seeded_board(db).id

    assert auth_client.patch(f"/api/boards/{board_id}", json={"title": ""}).status_code == 422


def test_delete_board_cascades(auth_client: TestClient, db: Session):
    board = seeded_board(db)
    board_id = board.id
    column_id = board.columns[0].id
    card_id = board.columns[0].cards[0].id

    assert auth_client.delete(f"/api/boards/{board_id}").status_code == 204

    db.expire_all()
    assert db.get(Board, board_id) is None
    assert db.get(Column, column_id) is None
    assert db.get(Card, card_id) is None


def test_board_endpoints_require_auth(client: TestClient, db: Session):
    board_id = seeded_board(db).id

    assert client.get("/api/boards").status_code == 401
    assert client.get(f"/api/boards/{board_id}").status_code == 401
    assert client.post("/api/boards", json={"title": "x"}).status_code == 401
    assert client.patch(f"/api/boards/{board_id}", json={"title": "x"}).status_code == 401
    assert client.delete(f"/api/boards/{board_id}").status_code == 401


def test_missing_board_returns_404(auth_client: TestClient):
    assert auth_client.get("/api/boards/9999").status_code == 404
    assert auth_client.patch("/api/boards/9999", json={"title": "x"}).status_code == 404
    assert auth_client.delete("/api/boards/9999").status_code == 404


def test_cannot_access_another_users_board(
    auth_client: TestClient, db: Session, intruder: User
):
    other = Board(user_id=intruder.id, title="Theirs")
    db.add(other)
    db.commit()
    db.refresh(other)

    assert auth_client.get(f"/api/boards/{other.id}").status_code == 403
    assert auth_client.patch(f"/api/boards/{other.id}", json={"title": "mine"}).status_code == 403
    assert auth_client.delete(f"/api/boards/{other.id}").status_code == 403


# --- columns ----------------------------------------------------------------


def test_create_column_appends_to_end(auth_client: TestClient, db: Session):
    board_id = seeded_board(db).id

    response = auth_client.post(
        f"/api/boards/{board_id}/columns", json={"title": "Blocked"}
    )

    assert response.status_code == 201
    column = column_by_title(db, "Blocked")
    assert column.position == 5
    assert titles_in_order(seeded_board(db))[-1] == "Blocked"


def test_create_column_at_position_renumbers(auth_client: TestClient, db: Session):
    board_id = seeded_board(db).id

    response = auth_client.post(
        f"/api/boards/{board_id}/columns", json={"title": "Blocked", "position": 0}
    )

    assert response.status_code == 201
    assert titles_in_order(seeded_board(db))[0] == "Blocked"
    assert titles_in_order(seeded_board(db))[1] == "Backlog"


def test_rename_column_persists(auth_client: TestClient, db: Session):
    column_id = column_by_title(db, "Backlog").id

    assert auth_client.patch(f"/api/columns/{column_id}", json={"title": "Icebox"}).status_code == 200

    assert column_by_title(db, "Icebox").id == column_id


def test_move_column_to_position_renumbers(auth_client: TestClient, db: Session):
    column_id = column_by_title(db, "Backlog").id

    auth_client.patch(f"/api/columns/{column_id}", json={"position": 2})

    board = seeded_board(db)
    assert titles_in_order(board) == [
        "Discovery",
        "In Progress",
        "Backlog",
        "Review",
        "Done",
    ]
    assert sorted(c.position for c in board.columns) == [0, 1, 2, 3, 4]


def test_delete_column_cascades_to_cards(auth_client: TestClient, db: Session):
    column = column_by_title(db, "Backlog")
    column_id = column.id
    card_id = column.cards[0].id

    assert auth_client.delete(f"/api/columns/{column_id}").status_code == 204

    db.expire_all()
    assert db.get(Column, column_id) is None
    assert db.get(Card, card_id) is None


def test_column_endpoints_require_auth(client: TestClient, db: Session):
    board_id = seeded_board(db).id
    column_id = column_by_title(db, "Backlog").id

    assert client.post(f"/api/boards/{board_id}/columns", json={"title": "x"}).status_code == 401
    assert client.patch(f"/api/columns/{column_id}", json={"title": "x"}).status_code == 401
    assert client.delete(f"/api/columns/{column_id}").status_code == 401


def test_missing_column_returns_404(auth_client: TestClient):
    assert auth_client.patch("/api/columns/9999", json={"title": "x"}).status_code == 404
    assert auth_client.delete("/api/columns/9999").status_code == 404


def test_cannot_touch_another_users_column(
    auth_client: TestClient, db: Session, intruder: User
):
    board = Board(user_id=intruder.id, title="Theirs")
    db.add(board)
    db.commit()
    db.flush()
    db.add(Column(board_id=board.id, title="Theirs", position=0))
    db.commit()
    column_id = db.scalar(select(Column).where(Column.title == "Theirs")).id

    assert auth_client.patch(f"/api/columns/{column_id}", json={"title": "mine"}).status_code == 403
    assert auth_client.delete(f"/api/columns/{column_id}").status_code == 403


# --- cards ------------------------------------------------------------------


def test_create_card_appends_to_end(auth_client: TestClient, db: Session):
    column_id = column_by_title(db, "Backlog").id

    response = auth_client.post(
        f"/api/columns/{column_id}/cards",
        json={"title": "Fresh", "details": "New work"},
    )

    assert response.status_code == 201
    assert response.json()["title"] == "Fresh"
    column = column_by_title(db, "Backlog")
    assert [c.title for c in column.cards][-1] == "Fresh"
    assert sorted(c.position for c in column.cards) == [0, 1, 2]


def test_create_card_defaults_details_to_empty(auth_client: TestClient, db: Session):
    column_id = column_by_title(db, "Backlog").id

    response = auth_client.post(
        f"/api/columns/{column_id}/cards", json={"title": "No details"}
    )

    assert response.json()["details"] == ""


def test_create_card_requires_title(auth_client: TestClient, db: Session):
    column_id = column_by_title(db, "Backlog").id

    assert auth_client.post(f"/api/columns/{column_id}/cards", json={"details": "x"}).status_code == 422


def test_edit_card_title_and_details(auth_client: TestClient, db: Session):
    card_id = column_by_title(db, "Backlog").cards[0].id

    response = auth_client.patch(
        f"/api/cards/{card_id}",
        json={"title": "Renamed card", "details": "Updated details"},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Renamed card"
    db.expire_all()
    card = db.get(Card, card_id)
    assert card.details == "Updated details"


def test_move_card_within_column_renumbers(auth_client: TestClient, db: Session):
    column = column_by_title(db, "Backlog")
    second_id = column.cards[1].id

    auth_client.patch(f"/api/cards/{second_id}", json={"position": 0})

    column = column_by_title(db, "Backlog")
    assert [c.title for c in column.cards] == [
        "Gather customer signals",
        "Align roadmap themes",
    ]
    assert [c.position for c in column.cards] == [0, 1]


def test_move_card_across_columns_renumbers_both(auth_client: TestClient, db: Session):
    card_id = column_by_title(db, "Backlog").cards[0].id
    done_id = column_by_title(db, "Done").id

    response = auth_client.patch(
        f"/api/cards/{card_id}", json={"column_id": done_id, "position": 0}
    )

    assert response.status_code == 200
    backlog = column_by_title(db, "Backlog")
    done = column_by_title(db, "Done")
    assert [c.position for c in backlog.cards] == [0]
    assert done.cards[0].title == "Align roadmap themes"
    assert [c.position for c in done.cards] == [0, 1, 2]


def test_move_card_to_missing_column_returns_404(auth_client: TestClient, db: Session):
    card_id = column_by_title(db, "Backlog").cards[0].id

    assert auth_client.patch(f"/api/cards/{card_id}", json={"column_id": 9999}).status_code == 404


def test_delete_card_removes_from_column(auth_client: TestClient, db: Session):
    card_id = column_by_title(db, "Backlog").cards[0].id

    assert auth_client.delete(f"/api/cards/{card_id}").status_code == 204

    db.expire_all()
    assert db.get(Card, card_id) is None
    assert len(column_by_title(db, "Backlog").cards) == 1


def test_card_endpoints_require_auth(client: TestClient, db: Session):
    column_id = column_by_title(db, "Backlog").id
    card_id = column_by_title(db, "Backlog").cards[0].id

    assert client.post(f"/api/columns/{column_id}/cards", json={"title": "x"}).status_code == 401
    assert client.patch(f"/api/cards/{card_id}", json={"title": "x"}).status_code == 401
    assert client.delete(f"/api/cards/{card_id}").status_code == 401


def test_missing_card_returns_404(auth_client: TestClient):
    assert auth_client.patch("/api/cards/9999", json={"title": "x"}).status_code == 404
    assert auth_client.delete("/api/cards/9999").status_code == 404


def test_cannot_touch_another_users_card(
    auth_client: TestClient, db: Session, intruder: User
):
    board = Board(user_id=intruder.id, title="Theirs")
    db.add(board)
    db.commit()
    db.flush()
    column = Column(board_id=board.id, title="Theirs", position=0)
    db.add(column)
    db.commit()
    db.flush()
    db.add(Card(column_id=column.id, title="Theirs", details="", position=0))
    db.commit()
    card_id = db.scalar(select(Card).where(Card.title == "Theirs")).id

    assert auth_client.patch(f"/api/cards/{card_id}", json={"title": "mine"}).status_code == 403
    assert auth_client.delete(f"/api/cards/{card_id}").status_code == 403