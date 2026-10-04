# Kanban Studio

The frontend is a statically exported NextJS app. It is built inside Docker and
served by FastAPI at `/`, so the frontend and API share an origin.

## Run

The app is served by the backend, not by a separate dev server:

```bash
../scripts/start.sh    # or scripts\start.ps1 on Windows
```

Then open http://localhost:8000 and sign in with `user` / `password`.

To rebuild after a frontend change, re-run the start script. It rebuilds the image,
which re-runs `npm run build` whenever files under `frontend/` change.

## Build

```bash
npm run build
```

Emits a static export to `out/`. There is no standalone `next start` step.

## Tests

```bash
npm run test:unit    # vitest
npm run test:e2e     # playwright, against the Docker build on :8000
```

E2E requires the app to be running (`scripts/start.sh`). Override the target with
`PLAYWRIGHT_BASE_URL` if needed.

## Notes

- `output: "export"` means Next rewrites, redirects, and headers are ignored, so a
  standalone `next dev` server cannot proxy `/api`. Playwright therefore targets the
  Docker-served build.
- Auth state lives in `src/components/AppRoot.tsx`; the token is in localStorage.