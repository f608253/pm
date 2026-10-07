import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EffortEstimationPanel } from "@/components/EffortEstimationPanel";
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

const empty = { summary: "", estimates: [] };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("EffortEstimationPanel", () => {
  it("does not call the API until it is opened", () => {
    const fetchMock = mock(empty);
    render(<EffortEstimationPanel open={false} onClose={() => {}} board={board} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading state while estimating", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<EffortEstimationPanel open={true} onClose={() => {}} board={board} />);
    expect(screen.getByText("Estimating effort...")).toBeVisible();
  });

  it("renders estimates with effort and hint", async () => {
    mock({
      ...empty,
      summary: "Workload is light.",
      estimates: [
        { card_id: 100, card_title: "Refine status language", effort: "M", hint: "Needs research" },
      ],
    });

    render(<EffortEstimationPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("M")).toBeVisible();
    });
    expect(screen.getByText("Needs research")).toBeVisible();
    expect(screen.getByText("Refine status language")).toBeVisible();
  });

  it("reports no estimates when the list is empty", async () => {
    mock({ summary: "Nothing left to estimate.", estimates: [] });

    render(<EffortEstimationPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText(/no estimates/i)).toBeVisible();
    });
  });

  it("shows a retry button on error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "model unavailable" }))
    );

    render(<EffortEstimationPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("model unavailable");
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("reloads when Refresh is clicked", async () => {
    const item = { card_id: 100, card_title: "Refine status language", effort: "M", hint: "x" };
    const fetchMock = mock({ summary: "First.", estimates: [item] });

    render(<EffortEstimationPanel open={true} onClose={() => {}} board={board} />);
    await waitFor(() => {
      expect(screen.getByText("First.")).toBeVisible();
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { summary: "Updated.", estimates: [item] }))
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Updated.")).toBeVisible();
    });
  });

  it("closes when the Close button is clicked", async () => {
    mock(empty);
    const onClose = vi.fn();
    render(<EffortEstimationPanel open={true} onClose={onClose} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is hidden from assistive tech when closed", () => {
    render(<EffortEstimationPanel open={false} onClose={() => {}} board={board} />);
    expect(screen.getByLabelText("Effort estimation")).toHaveAttribute("aria-hidden", "true");
  });
});
