import type { Board, BoardSummary, Card } from "@/lib/kanban";

export type AppliedOperation = { operation: string; detail: string };

export type AiChatResult = {
  response: string;
  board: Board;
  applied: AppliedOperation[];
  skipped: string[];
};

const TOKEN_KEY = "kanban-studio-token";

export class ApiError extends Error {
  status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  // Board data changes as the user works, and the API sends no validators, so
  // a cached response would show a stale board after a reload.
  const response = await fetch(path, { ...init, headers, cache: "no-store" });

  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new ApiError(401, "Not authenticated");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.detail ?? "Request failed");
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

// --- auth -------------------------------------------------------------------

export function login(username: string, password: string) {
  return request<{ token: string; username: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request<{ success: boolean }>("/api/auth/logout", { method: "POST" });
}

export function me() {
  return request<{ username: string }>("/api/auth/me");
}

// --- board ------------------------------------------------------------------

export function fetchBoardSummaries() {
  return request<BoardSummary[]>("/api/boards");
}

export function fetchBoard(boardId: number) {
  return request<Board>(`/api/boards/${boardId}`);
}

export function createColumn(boardId: number, title: string) {
  return request<void>(`/api/boards/${boardId}/columns`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function renameColumn(columnId: number, title: string) {
  return request<void>(`/api/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteColumn(columnId: number) {
  return request<void>(`/api/columns/${columnId}`, { method: "DELETE" });
}

// --- cards ------------------------------------------------------------------

export function createCard(columnId: number, title: string, details: string) {
  return request<Card>(`/api/columns/${columnId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, details }),
  });
}

export function updateCard(
  cardId: number,
  updates: Partial<Pick<Card, "title" | "details">> & {
    column_id?: number;
    position?: number;
  }
) {
  return request<Card>(`/api/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteCard(cardId: number) {
  return request<void>(`/api/cards/${cardId}`, { method: "DELETE" });
}

// --- ai ----------------------------------------------------------------------

export function sendChatMessage(boardId: number, question: string) {
  return request<AiChatResult>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId, question }),
  });
}