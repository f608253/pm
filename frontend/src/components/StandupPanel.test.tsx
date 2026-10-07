import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StandupPanel } from "@/components/StandupPanel";
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

const empty = { summary: "", points: [], blockers: [] };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("StandupPanel", () => {
  it("does not call the API until it is opened", () => {
    const fetchMock = mock(empty);
    render(<StandupPanel open={false} onClose={() => {}} board={board} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading state while generating", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<StandupPanel open={true} onClose={() => {}} board={board} />);
    expect(screen.getByText("Generating talking points...")).toBeVisible();
  });

  it("renders summary, points, and blockers", async () => {
    mock({
      summary: "Team is making progress.",
      points: ["Working on alignment"],
      blockers: ["Waiting on API"],
    });

    render(<StandupPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Team is making progress.")).toBeVisible();
    });
    expect(screen.getByText("Working on alignment")).toBeVisible();
    expect(screen.getByText("Waiting on API")).toBeVisible();
  });

  it("reports healthy board when no points or blockers", async () => {
    mock(empty);

    render(<StandupPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText(/nothing to report/i)).toBeVisible();
    });
  });

  it("shows a retry button on error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "model unavailable" }))
    );

    render(<StandupPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("model unavailable");
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("reloads when Refresh is clicked", async () => {
    const fetchMock = mock({ ...empty, summary: "First.", points: ["x"] });

    render(<StandupPanel open={true} onClose={() => {}} board={board} />);
    await waitFor(() => {
      expect(screen.getByText("First.")).toBeVisible();
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { ...empty, summary: "Updated.", points: ["x"] }))
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Updated.")).toBeVisible();
    });
  });

  it("closes when the Close button is clicked", async () => {
    mock(empty);
    const onClose = vi.fn();
    render(<StandupPanel open={true} onClose={onClose} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is hidden from assistive tech when closed", () => {
    render(<StandupPanel open={false} onClose={() => {}} board={board} />);
    expect(screen.getByLabelText("Standup")).toHaveAttribute("aria-hidden", "true");
  });
});
