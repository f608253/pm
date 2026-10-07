import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WeeklyReportPanel } from "@/components/WeeklyReportPanel";
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

const empty = { summary: "", completed: [], in_progress: [], up_next: [], net_worth: "" };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("WeeklyReportPanel", () => {
  it("does not call the API until it is opened", () => {
    const fetchMock = mock(empty);
    render(<WeeklyReportPanel open={false} onClose={() => {}} board={board} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading state while generating", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<WeeklyReportPanel open={true} onClose={() => {}} board={board} />);
    expect(screen.getByText("Generating weekly report...")).toBeVisible();
  });

  it("renders summary, lists, and net worth", async () => {
    mock({
      summary: "Good week.",
      completed: ["Align roadmap themes"],
      in_progress: ["Gather customer signals"],
      up_next: ["Design card layout"],
      net_worth: "Net positive.",
    });

    render(<WeeklyReportPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Good week.")).toBeVisible();
    });
    expect(screen.getByText("Align roadmap themes")).toBeVisible();
    expect(screen.getByText("Gather customer signals")).toBeVisible();
    expect(screen.getByText("Design card layout")).toBeVisible();
    expect(screen.getByText("Net positive.")).toBeVisible();
  });

  it("reports healthy board when all lists are empty", async () => {
    mock(empty);

    render(<WeeklyReportPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText(/nothing to report/i)).toBeVisible();
    });
  });

  it("shows a retry button on error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "model unavailable" }))
    );

    render(<WeeklyReportPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("model unavailable");
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("reloads when Refresh is clicked", async () => {
    const fetchMock = mock({ ...empty, summary: "First.", up_next: ["x"] });

    render(<WeeklyReportPanel open={true} onClose={() => {}} board={board} />);
    await waitFor(() => {
      expect(screen.getByText("First.")).toBeVisible();
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { ...empty, summary: "Updated.", up_next: ["x"] }))
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Updated.")).toBeVisible();
    });
  });

  it("closes when the Close button is clicked", async () => {
    mock(empty);
    const onClose = vi.fn();
    render(<WeeklyReportPanel open={true} onClose={onClose} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is hidden from assistive tech when closed", () => {
    render(<WeeklyReportPanel open={false} onClose={() => {}} board={board} />);
    expect(screen.getByLabelText("Weekly report")).toHaveAttribute("aria-hidden", "true");
  });
});
