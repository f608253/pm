import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SprintRetrospectivePanel } from "@/components/SprintRetrospectivePanel";
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

const empty = { summary: "", what_went_well: [], what_to_improve: [], actions: [] };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("SprintRetrospectivePanel", () => {
  it("does not call the API until it is opened", () => {
    const fetchMock = mock(empty);
    render(<SprintRetrospectivePanel open={false} onClose={() => {}} board={board} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading state while generating", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<SprintRetrospectivePanel open={true} onClose={() => {}} board={board} />);
    expect(screen.getByText("Generating retrospective...")).toBeVisible();
  });

  it("renders summary and list items", async () => {
    mock({
      summary: "Sprint went well.",
      what_went_well: ["Good teamwork"],
      what_to_improve: ["Better estimation"],
      actions: ["Split large tasks"],
    });

    render(<SprintRetrospectivePanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText("Sprint went well.")).toBeVisible();
    });
    expect(screen.getByText("Good teamwork")).toBeVisible();
    expect(screen.getByText("Better estimation")).toBeVisible();
    expect(screen.getByText("Split large tasks")).toBeVisible();
  });

  it("reports healthy board when all lists are empty", async () => {
    mock(empty);

    render(<SprintRetrospectivePanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByText(/nothing to report/i)).toBeVisible();
    });
  });

  it("shows a retry button on error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "model unavailable" }))
    );

    render(<SprintRetrospectivePanel open={true} onClose={() => {}} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("model unavailable");
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("reloads when Refresh is clicked", async () => {
    const fetchMock = mock({ ...empty, summary: "First.", what_to_improve: ["x"] });

    render(<SprintRetrospectivePanel open={true} onClose={() => {}} board={board} />);
    await waitFor(() => {
      expect(screen.getByText("First.")).toBeVisible();
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { ...empty, summary: "Updated.", what_to_improve: ["x"] }))
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Updated.")).toBeVisible();
    });
  });

  it("closes when the Close button is clicked", async () => {
    mock(empty);
    const onClose = vi.fn();
    render(<SprintRetrospectivePanel open={true} onClose={onClose} board={board} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is hidden from assistive tech when closed", () => {
    render(<SprintRetrospectivePanel open={false} onClose={() => {}} board={board} />);
    expect(screen.getByLabelText("Sprint retrospective")).toHaveAttribute("aria-hidden", "true");
  });
});
