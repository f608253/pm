import type { Board, BoardSummary, Card } from "@/lib/kanban";

export type AppliedOperation = { operation: string; detail: string };

export type AiNewsItem = {
  title: string;
  link: string;
  published: string;
};

export type AiNewsResult = {
  items: AiNewsItem[];
};

export type DailySummaryResult = {
  summary: string;
};

export type CardIntelligenceRequest = {
  board_id: number;
  card_id: number;
  task: "generate_details" | "suggest_priority" | "detect_duplicates";
};

export type CardIntelligenceResult = {
  result: string;
  details: string | null;
  priority: string | null;
  duplicates: Array<{
    card_id: number;
    title: string;
    similarity: string;
    reason: string;
  }>;
};

export type WorkflowOptimizationRequest = {
  board_id: number;
};

// Column ids arrive as JSON object keys, which are always strings.
export type WorkflowOptimizationResult = {
  bottlenecks: Array<{ column_id: number; title: string; reason: string }>;
  next_actions: Array<{ card_id: number; card_title: string; action: string }>;
  suggestions: string[];
  optimal_order: Record<string, number[]>;
};

export type SprintRetrospectiveResult = {
  summary: string;
  what_went_well: string[];
  what_to_improve: string[];
  actions: string[];
};

export type RiskAssessmentResult = {
  summary: string;
  risks: Array<{ card_id: number; card_title: string; risk: string; reason: string }>;
};

export type EffortEstimationResult = {
  summary: string;
  estimates: Array<{ card_id: number; card_title: string; effort: string; hint: string }>;
};

export type StandupResult = {
  summary: string;
  points: string[];
  blockers: string[];
};

export type WeeklyReportResult = {
  summary: string;
  completed: string[];
  in_progress: string[];
  up_next: string[];
  net_worth: string;
};

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
  updates: Partial<Pick<Card, "title" | "details" | "priority">> & {
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

export function fetchAiNews() {
  return request<AiNewsResult>("/api/ai/news");
}

export function fetchDailySummary(boardId: number) {
  return request<DailySummaryResult>("/api/ai/summary", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId }),
  });
}

export function cardIntelligence(boardId: number, cardId: number, task: CardIntelligenceRequest["task"]) {
  return request<CardIntelligenceResult>("/api/ai/card-intelligence", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId, card_id: cardId, task }),
  });
}

export function workflowOptimization(boardId: number) {
  return request<WorkflowOptimizationResult>("/api/ai/workflow-optimization", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId }),
  });
}

export function fetchSprintRetrospective(boardId: number) {
  return request<SprintRetrospectiveResult>("/api/ai/retrospective", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId }),
  });
}

export function fetchRiskAssessment(boardId: number) {
  return request<RiskAssessmentResult>("/api/ai/risk-assessment", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId }),
  });
}

export function fetchEffortEstimation(boardId: number) {
  return request<EffortEstimationResult>("/api/ai/effort-estimation", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId }),
  });
}

export function fetchStandup(boardId: number) {
  return request<StandupResult>("/api/ai/standup", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId }),
  });
}

export function fetchWeeklyReport(boardId: number) {
  return request<WeeklyReportResult>("/api/ai/weekly-report", {
    method: "POST",
    body: JSON.stringify({ board_id: boardId }),
  });
}