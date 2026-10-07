import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RiskAssessmentPanel } from "@/components/RiskAssessmentPanel";
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

const empty = { summary: "", risks: [] };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RiskAssessmentPanel", () => {
  it("does not call the API until it is opened", () => {
    const fetchMock = mock(empty);
    render(<RiskAssessmentPanel open={false} onClose={() => {}} board={board} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading state while assessing", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<RiskAssessmentPanel open={true} onClose={() => {}} board={board} />);
    expect(screen.getByText("Assessing risks...")).toBeVisible();
  });

  it("renders risks with their reason", async () => {
    mock({
      ...empty,
      summary: "Two risks identified.",
      risks: [
        {
          card_id: 100,
          card_title: "Refine status language",
          risk: "Unclear scope",
          reason: "No acceptance criteria.",
        },
      ],
    });

    render(<RiskAssessmentPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Unclear scope")).toBeVisible();
    });
    expect(screen.getByText("No acceptance criteria.")).toBeVisible();
    expect(screen.getByText("Refine status language")).toBeVisible();
  });

  it("renders the summary when present", async () => {
    mock({
      ...empty,
      summary: "Two risks identified.",
      risks: [{ card_id: 100, card_title: "Risky card", risk: "Blocked", reason: "x" }],
    });

    render(<RiskAssessmentPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Two risks identified.")).toBeVisible();
    });
  });

  it("reports no risks when the list is empty", async () => {
    mock({ summary: "No risks here.", risks: [] });

    render(<RiskAssessmentPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText(/no risks detected/i)).toBeVisible();
    });
  });

  it("shows a retry button on error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "model unavailable" }))
    );

    render(<RiskAssessmentPanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("model unavailable");
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("reloads when Refresh is clicked", async () => {
    const item = { card_id: 100, card_title: "Risky card", risk: "Blocked", reason: "x" };
    const fetchMock = mock({ summary: "First.", risks: [item] });

    render(<RiskAssessmentPanel open={true} onClose={() => {}} board={board} />);
    await waitFor(() => {
      expect(screen.getByText("First.")).toBeVisible();
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { summary: "Updated.", risks: [item] }))
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Updated.")).toBeVisible();
    });
  });

  it("closes when the Close button is clicked", async () => {
    mock(empty);
    const onClose = vi.fn();
    render(<RiskAssessmentPanel open={true} onClose={onClose} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is hidden from assistive tech when closed", () => {
    render(<RiskAssessmentPanel open={false} onClose={() => {}} board={board} />);
    expect(screen.getByLabelText("Risk assessment")).toHaveAttribute("aria-hidden", "true");
  });
});
