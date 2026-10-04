import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  clearToken,
  createCard,
  createColumn,
  deleteCard,
  deleteColumn,
  fetchBoard,
  fetchBoardSummaries,
  login,
  logout,
  me,
  renameColumn,
  setToken,
  setUnauthorizedHandler,
  updateCard,
} from "@/lib/api";

const json = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body ?? null),
});

const fetchMock = vi.fn();

const lastCall = () => {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error("fetch was never called.");
  }
  const [url, init] = call as [string, RequestInit];
  return { url, method: (init.method ?? "GET").toUpperCase(), init };
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(json(200, {})));
  vi.stubGlobal("fetch", fetchMock);
  setToken("test-token");
  setUnauthorizedHandler(() => {});
});

afterEach(() => {
  clearToken();
  setUnauthorizedHandler(() => {});
});

describe("request", () => {
  it("attaches the stored token to every call", async () => {
    await me();

    const headers = lastCall().init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("sends no Authorization header when there is no token", async () => {
    clearToken();
    await me();

    const headers = lastCall().init.headers as Headers;
    expect(headers.get("Authorization")).toBeNull();
  });

  it("sets a JSON content type only when there is a body", async () => {
    await me();
    expect((lastCall().init.headers as Headers).get("Content-Type")).toBeNull();

    await renameColumn(1, "Review");
    expect((lastCall().init.headers as Headers).get("Content-Type")).toBe(
      "application/json"
    );
  });

  it("clears the token and notifies the handler on 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockImplementation(() => Promise.resolve(json(401, { detail: "x" })));

    await expect(me()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("surfaces the status and detail for other failures", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(422, { detail: "Title is required." }))
    );

    await expect(renameColumn(1, "")).rejects.toMatchObject({
      status: 422,
      message: "Title is required.",
    });
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.reject(new SyntaxError("not json")),
      })
    );

    await expect(me()).rejects.toMatchObject({
      status: 500,
      message: "Request failed",
    });
  });

  it("asks for a fresh response so the board is never cached", async () => {
    await fetchBoard(1);
    expect(lastCall().init.cache).toBe("no-store");
  });

  it("returns undefined for 204 responses", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(204)));
    await expect(deleteCard(1)).resolves.toBeUndefined();
  });
});

describe("endpoints", () => {
  it("posts credentials to the login route", async () => {
    await login("user", "password");
    expect(lastCall()).toMatchObject({ url: "/api/auth/login", method: "POST" });
    expect(lastCall().init.body).toBe(
      JSON.stringify({ username: "user", password: "password" })
    );
  });

  it("posts to the logout route", async () => {
    await logout();
    expect(lastCall()).toMatchObject({ url: "/api/auth/logout", method: "POST" });
  });

  it("gets the current user", async () => {
    await me();
    expect(lastCall()).toMatchObject({ url: "/api/auth/me", method: "GET" });
  });

  it("lists the board summaries", async () => {
    await fetchBoardSummaries();
    expect(lastCall()).toMatchObject({ url: "/api/boards", method: "GET" });
  });

  it("fetches a single board by id", async () => {
    await fetchBoard(7);
    expect(lastCall()).toMatchObject({ url: "/api/boards/7", method: "GET" });
  });

  it("creates a column under its board", async () => {
    await createColumn(7, "Review");
    expect(lastCall()).toMatchObject({
      url: "/api/boards/7/columns",
      method: "POST",
    });
    expect(lastCall().init.body).toBe(JSON.stringify({ title: "Review" }));
  });

  it("patches a column title", async () => {
    await renameColumn(3, "Done");
    expect(lastCall()).toMatchObject({ url: "/api/columns/3", method: "PATCH" });
    expect(lastCall().init.body).toBe(JSON.stringify({ title: "Done" }));
  });

  it("deletes a column", async () => {
    await deleteColumn(3);
    expect(lastCall()).toMatchObject({ url: "/api/columns/3", method: "DELETE" });
  });

  it("creates a card under its column", async () => {
    await createCard(3, "Ship it", "Details");
    expect(lastCall()).toMatchObject({
      url: "/api/columns/3/cards",
      method: "POST",
    });
    expect(lastCall().init.body).toBe(
      JSON.stringify({ title: "Ship it", details: "Details" })
    );
  });

  it("patches card fields and moves", async () => {
    await updateCard(9, { title: "Renamed" });
    expect(lastCall()).toMatchObject({ url: "/api/cards/9", method: "PATCH" });
    expect(lastCall().init.body).toBe(JSON.stringify({ title: "Renamed" }));

    await updateCard(9, { column_id: 2, position: 1 });
    expect(lastCall().init.body).toBe(
      JSON.stringify({ column_id: 2, position: 1 })
    );
  });

  it("deletes a card", async () => {
    await deleteCard(9);
    expect(lastCall()).toMatchObject({ url: "/api/cards/9", method: "DELETE" });
  });

  it("returns the parsed response body", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { id: 9, title: "Ship it", details: "" }))
    );
    await expect(createCard(3, "Ship it", "")).resolves.toEqual({
      id: 9,
      title: "Ship it",
      details: "",
    });
  });
});
