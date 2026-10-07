import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AINewsPanel } from "@/components/AINewsPanel";

const json = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body ?? null),
  }) as unknown as Response;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AINewsPanel", () => {
  it("shows loading state when open", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      new Promise(() => {})
    );

    render(<AINewsPanel open={true} onClose={() => {}} />);

    expect(screen.getByText("Loading news...")).toBeVisible();

    fetchMock.mockRestore();
  });

  it("loads and displays news items", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        json(200, {
          items: [
            { title: "AI breaks new ground", link: "https://example.com/1", published: "Mon, 01 Jan 2024 00:00:00 GMT" },
          ],
        })
      )
    );

    render(<AINewsPanel open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("AI breaks new ground")).toBeVisible();
    });

    expect(screen.getByRole("link", { name: "AI breaks new ground" })).toHaveAttribute(
      "href",
      "https://example.com/1"
    );

    fetchMock.mockRestore();
  });

  it("shows a retry button on error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(json(502, { detail: "feed unavailable" }))
    );

    render(<AINewsPanel open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("feed unavailable");
    });

    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();

    fetchMock.mockRestore();
  });

  it("refreshes news when the refresh button is clicked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        json(200, {
          items: [{ title: "First story", link: "https://example.com/1", published: "Mon, 01 Jan 2024 00:00:00 GMT" }],
        })
      )
    );

    render(<AINewsPanel open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("First story")).toBeVisible();
    });

    fetchMock.mockImplementation(() =>
      Promise.resolve(
        json(200, {
          items: [{ title: "Second story", link: "https://example.com/2", published: "Tue, 02 Jan 2024 00:00:00 GMT" }],
        })
      )
    );

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText("Second story")).toBeVisible();
    });

    expect(screen.queryByText("First story")).not.toBeInTheDocument();

    fetchMock.mockRestore();
  });

  it("closes the panel when Close is clicked", async () => {
    const onClose = vi.fn();
    render(<AINewsPanel open={true} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
