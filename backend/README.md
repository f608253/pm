# Kanban Studio Backend

## Local Development (without Docker)

```bash
# Install dependencies
uv pip install -e ".[dev]"

# Run server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest

# Run tests with coverage
pytest --cov=app --cov-report=term-missing
```

## Docker Development

See scripts/ directory for start and stop scripts.
