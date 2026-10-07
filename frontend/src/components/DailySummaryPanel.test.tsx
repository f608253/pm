import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DailySummaryPanel } from "@/components/DailySummaryPanel";

const json = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body ?? null),
  }) as unknown as Response;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DailySummaryPanel", () => {
  it("shows loading state when open", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      new Promise(() => {})
    );

    render(<DailySummaryPanel open={true} onClose={() => {}} boardId={1} />);

    expect(screen.getByText("Generating summary...")).toBeVisible();

    fetchMock.mockRestore();
  });

  it("loads and displays summary", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        json(200, {
          summary: "Board is 60% complete. 3 items in progress, 2 pending.",
        })
      )
    );

    render(<DailySummaryPanel open={true} onClose={() => {}} boardId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Board is 60% complete/)).toBeVisible();
    });

    fetchMock.mockRestore();
  });

  it("shows a retry button on error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "model unavailable" }))
    );

    render(<DailySummaryPanel open={true} onClose={() => {}} boardId={1} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("model unavailable");
    });

    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();

    fetchMock.mockRestore();
  });

  it("refreshes summary when the refresh button is clicked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        json(200, {
          summary: "First summary",
        })
      )
    );

    render(<DailySummaryPanel open={true} onClose={() => {}} boardId={1} />);

    await waitFor(() => {
      expect(screen.getByText("First summary")).toBeVisible();
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        json(200, {
          summary: "Updated summary",
        })
      )
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Updated summary")).toBeVisible();
    });

    expect(screen.queryByText("First summary")).not.toBeInTheDocument();

    fetchMock.mockRestore();
  });

  it("closes the panel when Close is clicked", async () => {
    const onClose = vi.fn();
    render(<DailySummaryPanel open={true} onClose={onClose} boardId={1} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
