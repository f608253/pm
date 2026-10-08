import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CardActionsMenu } from "@/components/CardActionsMenu";

const json = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body ?? null),
  }) as unknown as Response;

const mock = (body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(json(200, body)));

const noDuplicates = { result: "", details: null, priority: null, duplicates: [] };

beforeEach(() => {
  vi.restoreAllMocks();
});

const openMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Card AI actions" }));
};

describe("CardActionsMenu", () => {
  it("keeps the menu closed until the AI button is clicked", () => {
    render(<CardActionsMenu cardId={1} boardId={1} onUpdateCard={() => {}} />);

    expect(screen.queryByRole("button", { name: "Generate details" })).not.toBeInTheDocument();
  });

  it("offers the three card intelligence tasks", async () => {
    render(<CardActionsMenu cardId={1} boardId={1} onUpdateCard={() => {}} />);
    await openMenu();

    expect(screen.getByRole("button", { name: "Generate details" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Suggest priority" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Detect duplicates" })).toBeVisible();
  });

  it("posts the selected task to the card intelligence endpoint", async () => {
    const fetchMock = mock(noDuplicates);
    render(<CardActionsMenu cardId={7} boardId={3} onUpdateCard={() => {}} />);

    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Suggest priority" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/ai/card-intelligence");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      board_id: 3,
      card_id: 7,
      task: "suggest_priority",
    });
  });

  it("does not write to the card until the user accepts the priority", async () => {
    mock({ ...noDuplicates, result: "Blocks review.", priority: "high" });
    const onUpdateCard = vi.fn();
    render(<CardActionsMenu cardId={1} boardId={1} onUpdateCard={onUpdateCard} />);

    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Suggest priority" }));

    await waitFor(() => {
      expect(screen.getByText("Suggested priority: high")).toBeVisible();
    });
    expect(onUpdateCard).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Apply priority" }));

    expect(onUpdateCard).toHaveBeenCalledWith(1, { priority: "high" });
  });

  it("does not overwrite card details until the user accepts them", async () => {
    mock({
      result: "Drafted a body.",
      details: "Summary\n- Acceptance criteria: renders",
      priority: null,
      duplicates: [],
    });
    const onUpdateCard = vi.fn();
    render(<CardActionsMenu cardId={1} boardId={1} onUpdateCard={onUpdateCard} />);

    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Generate details" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Use these details" })).toBeVisible();
    });
    expect(onUpdateCard).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Use these details" }));

    expect(onUpdateCard).toHaveBeenCalledWith(1, {
      details: "Summary\n- Acceptance criteria: renders",
    });
  });

  it("shows duplicate cards with their similarity and reason", async () => {
    mock({
      result: "Two cards overlap.",
      details: null,
      priority: null,
      duplicates: [
        { card_id: 2, title: "Prototype analytics view", similarity: "high", reason: "same work" },
      ],
    });
    render(<CardActionsMenu cardId={1} boardId={1} onUpdateCard={() => {}} />);

    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Detect duplicates" }));

    await waitFor(() => {
      expect(screen.getByText(/high overlap/)).toBeVisible();
    });
    expect(screen.getByText(/Prototype analytics view/)).toBeVisible();
    expect(screen.getByText(/same work/)).toBeVisible();
  });

  it("shows an error when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "model unavailable" }))
    );
    render(<CardActionsMenu cardId={1} boardId={1} onUpdateCard={() => {}} />);

    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Generate details" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("model unavailable");
    });
  });

  it("dismisses the result", async () => {
    mock({ ...noDuplicates, result: "Nothing overlaps." });
    render(<CardActionsMenu cardId={1} boardId={1} onUpdateCard={() => {}} />);

    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Detect duplicates" }));

    await waitFor(() => {
      expect(screen.getByText("Nothing overlaps.")).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Nothing overlaps.")).not.toBeInTheDocument();
  });

  it("closes the dropdown menu when clicking outside", async () => {
    render(
      <div>
        <button type="button">Outside element</button>
        <CardActionsMenu cardId={1} boardId={1} onUpdateCard={() => {}} />
      </div>
    );

    await openMenu();
    expect(screen.getByRole("button", { name: "Generate details" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Outside element" }));

    expect(screen.queryByRole("button", { name: "Generate details" })).not.toBeInTheDocument();
  });
});
