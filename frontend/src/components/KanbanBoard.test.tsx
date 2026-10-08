import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { Board } from "@/lib/kanban";

const board: Board = {
  id: 1,
  title: "My Board",
  columns: [
    {
      id: 1,
      title: "Backlog",
      cards: [
        { id: 1, title: "Align roadmap themes", details: "Draft themes.", priority: "medium" },
        { id: 2, title: "Gather customer signals", details: "Review tags.", priority: "low" },
      ],
    },
    { id: 2, title: "Review", cards: [{ id: 3, title: "QA interactions", details: "", priority: "high" }] },
  ],
};

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown };

const json = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body ?? null),
});

const calls: { url: string; method: string; body: unknown }[] = [];

const mockFetch = (handlers: Record<string, Handler>) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });

    // Exact path match: "/api/boards" must not also answer "/api/boards/1".
    for (const [key, handler] of Object.entries(handlers)) {
      const [path, pathMethod] = key.split(" ");
      if (path === url && (!pathMethod || pathMethod === method)) {
        const { status, body } = handler(url, init);
        return Promise.resolve(json(status, body));
      }
    }
    return Promise.resolve(json(404, { detail: "Not Found" }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const baseHandlers = () => ({
  "/api/boards GET": () => ({ status: 200, body: [{ id: 1, title: "My Board" }] }),
  "/api/boards/1 GET": () => ({ status: 200, body: board }),
});

const firstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    calls.length = 0;
    vi.restoreAllMocks();
  });

  it("shows a loading state before the board arrives", () => {
    mockFetch(baseHandlers());
    render(<KanbanBoard />);

    expect(screen.getByText(/loading your board/i)).toBeInTheDocument();
  });

  it("renders the columns and cards returned by the API", async () => {
    mockFetch(baseHandlers());
    render(<KanbanBoard />);

    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(2));
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(firstColumn()).getAllByTestId(/card-/i)).toHaveLength(2);
  });

  it("requests the board summary before the board itself", async () => {
    mockFetch(baseHandlers());
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(2));

    expect(calls[0]).toMatchObject({ url: "/api/boards", method: "GET" });
    expect(calls[1]).toMatchObject({ url: "/api/boards/1", method: "GET" });
  });

  it("shows an error with a retry when the board cannot be loaded", async () => {
    const user = userEvent.setup();
    mockFetch({
      "/api/boards GET": () => ({ status: 500, body: { detail: "boom" } }),
    });
    render(<KanbanBoard />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load your board/i);

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("persists a column rename after the debounce", async () => {
    const user = userEvent.setup();
    mockFetch({
      ...baseHandlers(),
      "/api/columns/1 PATCH": () => ({ status: 200, body: null }),
    });
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(2));

    const input = within(firstColumn()).getByLabelText("Column title");
    await user.clear(input);
    await user.type(input, "Icebox");

    expect(input).toHaveValue("Icebox");
    await waitFor(
      () =>
        expect(
          calls.some(
            (call) =>
              call.url === "/api/columns/1" &&
              call.method === "PATCH" &&
              (call.body as { title: string })?.title === "Icebox"
          )
        ).toBe(true),
      { timeout: 2000 }
    );
  });

  it("collapses rapid renames into a single request", async () => {
    const user = userEvent.setup();
    mockFetch({
      ...baseHandlers(),
      "/api/columns/1 PATCH": () => ({ status: 200, body: null }),
    });
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(2));

    const input = within(firstColumn()).getByLabelText("Column title");
    await user.clear(input);
    await user.type(input, "Icebox");

    await waitFor(
      () => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1),
      { timeout: 2000 }
    );
  });

  it("adds a card and appends the card the API returns", async () => {
    const user = userEvent.setup();
    mockFetch({
      ...baseHandlers(),
      "/api/columns/1/cards POST": () => ({
        status: 201,
        body: { id: 99, title: "New card", details: "Notes" },
      }),
    });
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(2));

    const column = firstColumn();
    await user.click(within(column).getByRole("button", { name: /add a card/i }));
    await user.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await user.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await user.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();
    expect(calls).toContainEqual({
      url: "/api/columns/1/cards",
      method: "POST",
      body: { title: "New card", details: "Notes" },
    });
  });

  it("deletes a card and calls the API", async () => {
    const user = userEvent.setup();
    mockFetch({
      ...baseHandlers(),
      "/api/cards/1 DELETE": () => ({ status: 204 }),
    });
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));

    await waitFor(() =>
      expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument()
    );
    expect(calls).toContainEqual({
      url: "/api/cards/1",
      method: "DELETE",
      body: null,
    });
  });

  it("restores the card when the delete request fails", async () => {
    const user = userEvent.setup();
    mockFetch({
      ...baseHandlers(),
      "/api/cards/1 DELETE": () => ({ status: 500, body: { detail: "boom" } }),
    });
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));

    // Reloaded from the API, so the card comes back.
    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("opens AI analysis panels from the header buttons", async () => {
    const user = userEvent.setup();
    mockFetch(baseHandlers());
    render(<KanbanBoard />);
    await waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(2));

    const riskButtons = screen.getAllByRole("button", { name: /risk assessment/i });
    await user.click(riskButtons[0]);
    expect(screen.getByRole("complementary", { name: /risk assessment/i })).toBeInTheDocument();
  });
});