import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkflowPanel } from "@/components/WorkflowPanel";
import type { Board } from "@/lib/kanban";

const board: Board = {
  id: 1,
  title: "My Board",
  columns: [
    {
      id: 10,
      title: "In Progress",
      cards: [
        { id: 100, title: "Refine status language", details: "", priority: "medium" },
        { id: 101, title: "Design card layout", details: "", priority: "high" },
      ],
    },
    { id: 11, title: "Review", cards: [] },
  ],
};

const json = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body ?? null),
  }) as unknown as Response;

const mock = (body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(json(200, body)));

const empty = { bottlenecks: [], next_actions: [], suggestions: [], optimal_order: {} };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("WorkflowPanel", () => {
  it("does not call the API until it is opened", () => {
    const fetchMock = mock(empty);
    render(<WorkflowPanel open={false} onClose={() => {}} board={board} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading state while analyzing", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<WorkflowPanel open={true} onClose={() => {}} board={board} />);
    expect(screen.getByText("Analyzing workflow...")).toBeVisible();
  });

  it("renders the next best action for each card", async () => {
    mock({
      ...empty,
      next_actions: [
        { card_id: 100, card_title: "Refine status language", action: "Draft the standard." },
        { card_id: 101, card_title: "Design card layout", action: "Ship the spacing scale." },
      ],
    });

    render(<WorkflowPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Draft the standard.")).toBeVisible();
    });
    expect(screen.getByText("Ship the spacing scale.")).toBeVisible();
    expect(screen.getByText("Refine status language")).toBeVisible();
  });

  it("renders bottlenecks with their reason", async () => {
    mock({
      ...empty,
      bottlenecks: [{ column_id: 10, title: "In Progress", reason: "Both cards are blocked." }],
    });

    render(<WorkflowPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Both cards are blocked.")).toBeVisible();
    });
  });

  it("renders the suggested order using card titles, not raw ids", async () => {
    mock({
      ...empty,
      optimal_order: { "10": [101, 100] },
    });

    render(<WorkflowPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Design card layout")).toBeVisible();
    });
    // Column id and card ids are never shown raw.
    expect(screen.queryByText("10")).not.toBeInTheDocument();
    expect(screen.queryByText("101")).not.toBeInTheDocument();
    // The suggested order is first.
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Design card layout");
  });

  it("renders board level suggestions", async () => {
    mock({ ...empty, suggestions: ["Split In Progress into two columns."] });

    render(<WorkflowPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Split In Progress into two columns.")).toBeVisible();
    });
  });

  it("reports a healthy board when there is nothing to recommend", async () => {
    mock(empty);

    render(<WorkflowPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText(/board looks healthy/i)).toBeVisible();
    });
  });

  it("shows a retry button on error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "model unavailable" }))
    );

    render(<WorkflowPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("model unavailable");
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("reloads when Refresh is clicked", async () => {
    const fetchMock = mock({ ...empty, next_actions: [] });
    render(<WorkflowPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText(/board looks healthy/i)).toBeVisible();
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        json(200, {
          ...empty,
          next_actions: [{ card_id: 100, card_title: "Refine status language", action: "New plan." }],
        })
      )
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("New plan.")).toBeVisible();
    });
  });

  it("closes when the Close button is clicked", async () => {
    mock(empty);
    const onClose = vi.fn();
    render(<WorkflowPanel open={true} onClose={onClose} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is hidden from assistive tech when closed", () => {
    render(<WorkflowPanel open={false} onClose={() => {}} board={board} />);
    expect(screen.getByLabelText("Workflow optimization")).toHaveAttribute("aria-hidden", "true");
  });
});
