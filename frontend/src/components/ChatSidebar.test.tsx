import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChatInput } from "@/components/ChatInput";
import { ChatMessageView } from "@/components/ChatMessageView";
import { ChatSidebar } from "@/components/ChatSidebar";
import { TypingIndicator } from "@/components/TypingIndicator";
import type { Board } from "@/lib/kanban";

const board: Board = {
  id: 1,
  title: "My Board",
  columns: [
    { id: 1, title: "Backlog", cards: [{ id: 1, title: "Align roadmap themes", details: "", priority: "medium" }] },
    { id: 2, title: "Done", cards: [] },
  ],
};

const json = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body ?? null),
});

const routeFetch = (
  fetchMock: ReturnType<typeof vi.fn>,
  routes: Record<string, { status: number; body?: unknown }>
) => {
  fetchMock.mockImplementation((url: string) => {
    const route = routes[url];
    return Promise.resolve(route ? json(route.status, route.body) : json(404, { detail: "Not Found" }));
  });
};

const renderOpen = async (onBoardChange = vi.fn()) => {
  const view = render(<ChatSidebar board={board} onBoardChange={onBoardChange} />);
  await userEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
  return { ...view, onBoardChange };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ChatMessageView", () => {
  it("labels the user message and shows its text", () => {
    render(
      <ul>
        <ChatMessageView message={{ id: "1", role: "user", text: "Add a card", at: "2026-01-01T10:00:00Z" }} />
      </ul>
    );

    expect(screen.getByText("Add a card")).toBeVisible();
    expect(screen.getByText(/You/)).toBeVisible();
  });

  it("labels the assistant message differently", () => {
    render(
      <ul>
        <ChatMessageView message={{ id: "1", role: "assistant", text: "Done", at: "2026-01-01T10:00:00Z" }} />
      </ul>
    );

    expect(screen.getByText(/Assistant/)).toBeVisible();
  });
});

describe("TypingIndicator", () => {
  it("announces that the assistant is typing", () => {
    render(
      <ul>
        <TypingIndicator />
      </ul>
    );

    expect(screen.getByText("The assistant is typing")).toBeInTheDocument();
  });
});

describe("ChatInput", () => {
  it("sends on Enter", async () => {
    const onSend = vi.fn();
    render(<ChatInput disabled={false} onSend={onSend} />);

    const area = screen.getByLabelText("Message the assistant");
    await userEvent.type(area, "hello{Enter}");

    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("keeps the newline on Shift+Enter", async () => {
    const onSend = vi.fn();
    render(<ChatInput disabled={false} onSend={onSend} />);

    const area = screen.getByLabelText("Message the assistant");
    await userEvent.type(area, "line one{Shift>}{Enter}{/Shift}line two");

    expect(onSend).not.toHaveBeenCalled();
    expect(area).toHaveValue("line one\nline two");
  });

  it("sends on the Send button", async () => {
    const onSend = vi.fn();
    render(<ChatInput disabled={false} onSend={onSend} />);

    await userEvent.type(screen.getByLabelText("Message the assistant"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("clears after sending", async () => {
    render(<ChatInput disabled={false} onSend={vi.fn()} />);

    const area = screen.getByLabelText("Message the assistant");
    await userEvent.type(area, "hello{Enter}");

    expect(area).toHaveValue("");
  });

  it("ignores blank input", async () => {
    const onSend = vi.fn();
    render(<ChatInput disabled={false} onSend={onSend} />);

    await userEvent.type(screen.getByLabelText("Message the assistant"), "   {Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the input while loading", () => {
    render(<ChatInput disabled onSend={vi.fn()} />);

    expect(screen.getByLabelText("Message the assistant")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("ChatSidebar", () => {
  it("opens from the toggle and closes again", async () => {
    render(<ChatSidebar board={board} onBoardChange={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "Ask the assistant" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(screen.getByTestId("chat-sidebar")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Ask the assistant" })).toBeVisible();
  });

  it("shows a prompt when the conversation is empty", () => {
    render(<ChatSidebar board={board} onBoardChange={vi.fn()} />);

    expect(screen.getByText(/Ask for a summary/)).toBeVisible();
  });

  it("posts the question and shows the reply", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    routeFetch(fetchMock, {
      "/api/ai/chat": {
        status: 200,
        body: { response: "All clear.", board, applied: [], skipped: [] },
      },
    });

    render(<ChatSidebar board={board} onBoardChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Message the assistant"), "How is it?{Enter}");

    await waitFor(() => expect(screen.getByText("All clear.")).toBeVisible());
    expect(screen.getByText("How is it?")).toBeVisible();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ai/chat");
    expect(JSON.parse(init.body as string)).toEqual({ board_id: 1, question: "How is it?" });
  });

  it("refreshes the board and reports what changed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const updated: Board = {
      ...board,
      columns: [
        { id: 1, title: "Backlog", cards: [] },
        { id: 2, title: "Done", cards: [{ id: 9, title: "Shipped by AI", details: "", priority: "medium" }] },
      ],
    };
    routeFetch(fetchMock, {
      "/api/ai/chat": {
        status: 200,
        body: {
          response: "Added it.",
          board: updated,
          applied: [{ operation: "apply", detail: 'Added "Shipped by AI" to Done' }],
          skipped: [],
        },
      },
    });

    const onBoardChange = vi.fn();
    await renderOpen(onBoardChange);
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Add a card{Enter}");

    await waitFor(() => expect(onBoardChange).toHaveBeenCalledWith(updated));
    expect(screen.getByTestId("chat-notice")).toHaveTextContent(
      'Added "Shipped by AI" to Done'
    );
  });

  it("reports skipped operations as an error", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    routeFetch(fetchMock, {
      "/api/ai/chat": {
        status: 200,
        body: { response: "Partly done.", board, applied: [], skipped: ["unknown column_id 99"] },
      },
    });

    render(<ChatSidebar board={board} onBoardChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Do it{Enter}");

    await waitFor(() =>
      expect(screen.getByTestId("chat-error")).toHaveTextContent("unknown column_id 99")
    );
  });

  it("shows an error when the request fails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() => Promise.reject(new Error("network down")));

    render(<ChatSidebar board={board} onBoardChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Hello{Enter}");

    await waitFor(() =>
      expect(screen.getByTestId("chat-error")).toHaveTextContent("could not be reached")
    );
  });

  it("re-enables the input after a failure", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() => Promise.reject(new Error("network down")));

    render(<ChatSidebar board={board} onBoardChange={vi.fn()} />);
    const area = screen.getByLabelText("Message the assistant");
    await userEvent.type(area, "Hello{Enter}");

    await waitFor(() => expect(area).toBeEnabled());
  });

  it("clears the conversation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    routeFetch(fetchMock, {
      "/api/ai/chat": { status: 200, body: { response: "Noted.", board, applied: [], skipped: [] } },
    });

    await renderOpen();
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Hello{Enter}");
    await waitFor(() => expect(screen.getByText("Noted.")).toBeVisible());

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByText("Noted.")).not.toBeInTheDocument();
    expect(screen.getByText(/Ask for a summary/)).toBeVisible();
  });

  it("keeps the conversation when the sidebar is closed and reopened", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    routeFetch(fetchMock, {
      "/api/ai/chat": { status: 200, body: { response: "Still here.", board, applied: [], skipped: [] } },
    });

    await renderOpen();
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Hello{Enter}");
    await waitFor(() => expect(screen.getByText("Still here.")).toBeVisible());

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));

    expect(screen.getByText("Still here.")).toBeVisible();
  });

  it("shows a typing indicator while the reply is pending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let release: (() => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(json(200, { response: "Done", board, applied: [], skipped: [] }));
        })
    );

    render(<ChatSidebar board={board} onBoardChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Message the assistant"), "Hello{Enter}");

    expect(await screen.findByText("The assistant is typing")).toBeInTheDocument();

    release?.();
    await waitFor(() => expect(screen.getByText("Done")).toBeVisible());
  });

  it("closes on a right swipe", async () => {
    const panel = await renderOpen().then(() => screen.getByTestId("chat-sidebar"));

    fireEvent.touchStart(panel, { touches: [{ clientX: 40 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 200 }] });

    expect(screen.getByRole("button", { name: "Ask the assistant" })).toBeVisible();
  });

  it("stays open on a short swipe", async () => {
    await renderOpen();
    const panel = screen.getByTestId("chat-sidebar");

    fireEvent.touchStart(panel, { touches: [{ clientX: 40 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 70 }] });

    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
  });

  it("stays open on a left swipe", async () => {
    await renderOpen();
    const panel = screen.getByTestId("chat-sidebar");

    fireEvent.touchStart(panel, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 40 }] });

    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
  });

  it("disables Clear when there is nothing to clear", async () => {
    await renderOpen();

    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });
});