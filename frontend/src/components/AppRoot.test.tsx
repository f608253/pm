import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRoot } from "@/components/AppRoot";
import type { Board } from "@/lib/kanban";

const board: Board = {
  id: 1,
  title: "My Board",
  columns: [
    {
      id: 1,
      title: "Backlog",
      cards: [{ id: 1, title: "Align roadmap themes", details: "" }],
    },
    { id: 2, title: "Review", cards: [] },
  ],
};

const json = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body ?? null),
});

type Route = { status: number; body?: unknown };

const router = (routes: Record<string, Route | ((url: string, init?: RequestInit) => Route)>) => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const route = routes[`${url} ${method}`] ?? routes[url];
      if (!route) {
        return Promise.resolve(json(404, { detail: "Not Found" }));
      }
      try {
        const result = typeof route === "function" ? route(url, init) : route;
        return Promise.resolve(json(result.status, result.body));
      } catch (err) {
        return Promise.reject(err);
      }
    })
  );
};

const authedRoutes = () => ({
  "/api/auth/me GET": { status: 200, body: { username: "user" } },
  "/api/boards GET": { status: 200, body: [{ id: 1, title: "My Board" }] },
  "/api/boards/1 GET": { status: 200, body: board },
});

describe("AppRoot", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the sign in form when there is no session", async () => {
    router({ "/api/auth/me GET": { status: 401, body: { detail: "Not authenticated" } } });
    render(<AppRoot />);

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeVisible();
    expect(screen.queryByTestId(/column-/i)).not.toBeInTheDocument();
  });

  it("shows the board when a stored session is valid", async () => {
    window.localStorage.setItem("kanban-studio-token", "stored-token");
    router(authedRoutes());
    render(<AppRoot />);

    expect(await screen.findByText(/signed in as user/i)).toBeVisible();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(2);
  });

  it("sends the stored token when checking the session", async () => {
    window.localStorage.setItem("kanban-studio-token", "stored-token");
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url === "/api/boards"
          ? json(200, [{ id: 1, title: "My Board" }])
          : url === "/api/boards/1"
            ? json(200, board)
            : json(200, { username: "user" })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AppRoot />);
    await screen.findByText(/signed in as user/i);

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer stored-token");
  });

  it("signs in with valid credentials and reveals the board", async () => {
    const user = userEvent.setup();
    router({
      "/api/auth/me GET": { status: 401, body: { detail: "Not authenticated" } },
      "/api/auth/login POST": {
        status: 200,
        body: { token: "fresh-token", username: "user" },
      },
      "/api/boards GET": { status: 200, body: [{ id: 1, title: "My Board" }] },
      "/api/boards/1 GET": { status: 200, body: board },
    });

    render(<AppRoot />);
    await screen.findByRole("button", { name: /sign in/i });

    await user.type(screen.getByLabelText(/username/i), "user");
    await user.type(screen.getByLabelText(/password/i), "password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/signed in as user/i)).toBeVisible();
    expect(window.localStorage.getItem("kanban-studio-token")).toBe("fresh-token");
  });

  it("shows an error and stays signed out for bad credentials", async () => {
    const user = userEvent.setup();
    router({
      "/api/auth/me GET": { status: 401, body: { detail: "Not authenticated" } },
      "/api/auth/login POST": { status: 401, body: { detail: "Invalid credentials" } },
    });

    render(<AppRoot />);
    await screen.findByRole("button", { name: /sign in/i });

    await user.type(screen.getByLabelText(/username/i), "user");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect username or password."
    );
    expect(window.localStorage.getItem("kanban-studio-token")).toBeNull();
  });

  it("clears the token and returns to the form on logout", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("kanban-studio-token", "stored-token");
    router({
      ...authedRoutes(),
      "/api/auth/logout POST": { status: 200, body: { success: true } },
    });

    render(<AppRoot />);
    await screen.findByText(/signed in as user/i);

    await user.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() =>
      expect(window.localStorage.getItem("kanban-studio-token")).toBeNull()
    );
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeVisible();
  });

  it("still signs out locally when the logout call fails", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("kanban-studio-token", "stored-token");
    router({
      ...authedRoutes(),
      "/api/auth/logout POST": () => {
        throw new Error("network down");
      },
    });

    render(<AppRoot />);
    await screen.findByText(/signed in as user/i);

    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeVisible();
    expect(window.localStorage.getItem("kanban-studio-token")).toBeNull();
  });

  it("signs out when a board request returns 401 mid session", async () => {
    window.localStorage.setItem("kanban-studio-token", "stored-token");
    router({
      "/api/auth/me GET": { status: 200, body: { username: "user" } },
      "/api/boards GET": { status: 401, body: { detail: "Invalid session" } },
    });

    render(<AppRoot />);

    expect(await screen.findByRole("button", { name: /sign in/i })).toBeVisible();
    expect(window.localStorage.getItem("kanban-studio-token")).toBeNull();
  });
});