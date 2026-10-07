"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { AINewsPanel } from "@/components/AINewsPanel";
import { DailySummaryPanel } from "@/components/DailySummaryPanel";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { RiskAssessmentPanel } from "@/components/RiskAssessmentPanel";
import { EffortEstimationPanel } from "@/components/EffortEstimationPanel";
import { SprintRetrospectivePanel } from "@/components/SprintRetrospectivePanel";
import { StandupPanel } from "@/components/StandupPanel";
import { WeeklyReportPanel } from "@/components/WeeklyReportPanel";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { moveCard, type Board, type Card } from "@/lib/kanban";
import {
  createCard as createCardRequest,
  deleteCard as deleteCardRequest,
  fetchBoard,
  fetchBoardSummaries,
  renameColumn as renameColumnRequest,
  updateCard,
} from "@/lib/api";

type KanbanBoardProps = {
  username?: string;
  onLogout?: () => void;
};

type Status = "loading" | "ready" | "error";

export const KanbanBoard = ({ username, onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<Board | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const [retroOpen, setRetroOpen] = useState(false);
  const [standupOpen, setStandupOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);

  const renameTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const fetchBoardData = useCallback(
    () =>
      fetchBoardSummaries()
        .then((summaries) =>
          summaries.length === 0 ? null : fetchBoard(summaries[0].id)
        )
        .then((next) => {
          setBoard(next);
          setStatus("ready");
        })
        .catch(() => {
          setError("Could not load your board.");
          setStatus("error");
        }),
    []
  );

  const load = useCallback(async () => {
    setStatus("loading");
    await fetchBoardData();
  }, [fetchBoardData]);

  useEffect(() => {
    void fetchBoardData();
  }, [fetchBoardData]);

  useEffect(() => {
    const timers = renameTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const fail = async (message: string) => {
    setError(message);
    await load();
  };

  const handleRenameColumn = (columnId: number, title: string) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((column) =>
              column.id === columnId ? { ...column, title } : column
            ),
          }
        : prev
    );

    // Typing fires on every keystroke, so collapse to one write per pause.
    const timers = renameTimers.current;
    const pending = timers.get(columnId);
    if (pending) {
      clearTimeout(pending);
    }
    timers.set(
      columnId,
      setTimeout(() => {
        timers.delete(columnId);
        renameColumnRequest(columnId, title).catch(() =>
          void fail("Could not rename that column.")
        );
      }, 400)
    );
  };

  const handleAddCard = async (columnId: number, title: string, details: string) => {
    try {
      const created = await createCardRequest(columnId, title, details || "");
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((column) =>
                column.id === columnId
                  ? { ...column, cards: [...column.cards, created] }
                  : column
              ),
            }
          : prev
      );
    } catch {
      await fail("Could not add that card.");
    }
  };

  const handleDeleteCard = async (cardId: number) => {
    const previous = board;
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((column) => ({
              ...column,
              cards: column.cards.filter((card) => card.id !== cardId),
            })),
          }
        : prev
    );
    try {
      await deleteCardRequest(cardId);
    } catch {
      setBoard(previous);
      await fail("Could not delete that card.");
    }
  };

  const handleUpdateCard = async (cardId: number, updates: { details?: string; priority?: string }) => {
    const previous = board;
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((column) => ({
              ...column,
              cards: column.cards.map((card) =>
                card.id === cardId ? { ...card, ...updates } : card
              ),
            })),
          }
        : prev
    );
    try {
      await updateCard(cardId, updates);
    } catch {
      setBoard(previous);
      await fail("Could not update that card.");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const cardId = Number(String(event.active.id).slice(1));
    const found = board?.columns
      .flatMap((column) => column.cards)
      .find((card) => card.id === cardId);
    setActiveCard(found ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCard(null);

    const { active, over } = event;
    if (!over || active.id === over.id || !board) {
      return;
    }

    const nextColumns = moveCard(
      board.columns,
      String(active.id),
      String(over.id)
    );
    if (nextColumns === board.columns) {
      return;
    }

    const cardDnd = String(active.id);
    const cardId = Number(cardDnd.slice(1));
    const targetColumn = nextColumns.find((column) =>
      column.cards.some((card) => card.id === cardId)
    );
    if (!targetColumn) {
      return;
    }
    const position = targetColumn.cards.findIndex((card) => card.id === cardId);

    const previous = board;
    setBoard({ ...board, columns: nextColumns });
    try {
      await updateCard(cardId, {
        column_id: targetColumn.id,
        position,
      });
    } catch {
      setBoard(previous);
      await fail("Could not move that card.");
    }
  };

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--gray-text)]">Loading your board...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/85 p-8 text-center shadow-[var(--shadow)]">
          <h1 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
            Something went wrong
          </h1>
          <p role="alert" className="mt-3 text-sm text-[var(--gray-text)]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 rounded-2xl bg-[var(--secondary-purple)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--gray-text)]">No board yet.</p>
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              {onLogout ? (
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                  <span className="text-sm font-medium text-[var(--navy-dark)]">
                    Signed in as {username}
                  </span>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]"
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onUpdateCard={handleUpdateCard}
                boardId={board.id}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

         <ChatSidebar board={board} onBoardChange={setBoard} showToggle={false} />
         <AINewsPanel open={newsOpen} onClose={() => setNewsOpen(false)} />
         <DailySummaryPanel open={summaryOpen} onClose={() => setSummaryOpen(false)} boardId={board.id} />
         <WorkflowPanel open={workflowOpen} onClose={() => setWorkflowOpen(false)} board={board} />
         <RiskAssessmentPanel open={riskOpen} onClose={() => setRiskOpen(false)} board={board} />
         <EffortEstimationPanel open={effortOpen} onClose={() => setEffortOpen(false)} board={board} />
         <SprintRetrospectivePanel open={retroOpen} onClose={() => setRetroOpen(false)} board={board} />
         <StandupPanel open={standupOpen} onClose={() => setStandupOpen(false)} board={board} />
         <WeeklyReportPanel open={weeklyOpen} onClose={() => setWeeklyOpen(false)} board={board} />
        <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setNewsOpen(true)}
            aria-expanded={newsOpen}
            aria-controls="ai-news-panel"
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            AI News
          </button>
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            aria-expanded={summaryOpen}
            aria-controls="daily-summary-panel"
            className="rounded-full bg-[var(--primary-blue)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            Daily Summary
          </button>
          <button
            type="button"
            onClick={() => setWorkflowOpen(true)}
            aria-expanded={workflowOpen}
            aria-controls="workflow-panel"
            className="rounded-full bg-[var(--navy-dark)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            Workflow
          </button>
          <button
            type="button"
            onClick={() => setRiskOpen(true)}
            aria-expanded={riskOpen}
            aria-controls="risk-panel"
            className="rounded-full bg-[var(--primary-blue)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            Risk Assessment
          </button>
          <button
            type="button"
            onClick={() => setEffortOpen(true)}
            aria-expanded={effortOpen}
            aria-controls="effort-panel"
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            Effort Estimate
          </button>
          <button
            type="button"
            onClick={() => setRetroOpen(true)}
            aria-expanded={retroOpen}
            aria-controls="retrospective-panel"
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            Retrospective
          </button>
          <button
            type="button"
            onClick={() => setStandupOpen(true)}
            aria-expanded={standupOpen}
            aria-controls="standup-panel"
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            Standup
          </button>
          <button
            type="button"
            onClick={() => setWeeklyOpen(true)}
            aria-expanded={weeklyOpen}
            aria-controls="weekly-report-panel"
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            Weekly Report
          </button>
          <button
            type="button"
            onClick={() => {
              const event = new CustomEvent("open-chat");
              window.dispatchEvent(event);
            }}
            aria-controls="chat-panel"
            className="rounded-full bg-[var(--accent-yellow)] px-5 py-3 text-sm font-semibold text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:opacity-90"
          >
            Ask the assistant
          </button>
        </div>
      </main>
    </div>
  );
};