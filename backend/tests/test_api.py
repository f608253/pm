from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import STATIC_DIR, app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_returns_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "kanban-studio",
        "version": "0.1.0",
    }


def test_hello_returns_message(client):
    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Hello from Kanban Studio API!",
        "success": True,
    }


def test_cors_header_allows_origin(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:3000"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_root_serves_index_html(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<html" in response.text


def test_unknown_api_path_returns_404(client):
    assert client.get("/api/does-not-exist").status_code == 404


def test_client_side_route_falls_back_to_index(client):
    response = client.get("/login")

    assert response.status_code == 200
    assert "<html" in response.text


def test_static_asset_is_served(client):
    assets = sorted((STATIC_DIR / "_next" / "static").rglob("*.js"))
    if not assets:
        pytest.skip("no built frontend assets present")

    relative = assets[0].relative_to(STATIC_DIR).as_posix()
    response = client.get(f"/{relative}")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]


def test_missing_asset_falls_back_to_index(client):
    response = client.get("/_next/static/does-not-exist.js")

    assert response.status_code == 200
    assert "<html" in response.text


def test_path_traversal_is_blocked(client):
    outside = Path("/etc/hostname")
    response = client.get("/../etc/hostname")

    assert response.status_code == 200
    assert "<html" in response.text
    assert not outside.exists() or outside.read_text() not in response.text