"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchDailySummary, type DailySummaryResult } from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: number;
};

const SWIPE_CLOSE_THRESHOLD = 80;

export const DailySummaryPanel = ({ open, onClose, boardId }: Props) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: DailySummaryResult = await fetchDailySummary(boardId);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load daily summary.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  return (
    <aside
      id="daily-summary-panel"
      aria-label="Daily summary"
      aria-hidden={!open}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) {
          return;
        }
        const end = event.changedTouches[0]?.clientX ?? start;
        if (end - start > SWIPE_CLOSE_THRESHOLD) {
          onClose();
        }
      }}
      className={
        open
          ? "fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] translate-x-0 flex-col shadow-[var(--shadow)] transition-transform duration-300"
          : "fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] translate-x-full flex-col shadow-[var(--shadow)] transition-transform duration-300"
      }
      style={{
        borderLeftColor: "var(--ai-summary-border)",
        backgroundColor: "var(--ai-summary-bg)",
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-4" style={{ borderColor: "var(--ai-summary-border)" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--ai-summary-text)" }}>
            Overview
          </p>
          <p className="font-display text-lg font-semibold" style={{ color: "var(--ai-summary-text)" }}>
            Daily Summary
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition disabled:opacity-40"
            style={{ borderColor: "var(--ai-summary-border)", color: "var(--ai-summary-text)" }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-controls="daily-summary-panel"
            className="rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition"
            style={{ borderColor: "var(--ai-summary-border)", color: "var(--ai-summary-text)" }}
          >
            Close
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--ai-summary-text)" }}>Generating summary...</p>
        ) : error ? (
          <div>
            <p role="alert" className="text-sm font-medium" style={{ color: "var(--ai-summary-text)" }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: "var(--ai-summary-border)" }}
            >
              Try again
            </button>
          </div>
        ) : summary ? (
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--ai-summary-border)", backgroundColor: "var(--ai-summary-bg)" }}>
            <p className="whitespace-pre-line text-sm leading-6" style={{ color: "var(--ai-summary-text)" }}>
              {summary}
            </p>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--ai-summary-text)" }}>No summary available.</p>
        )}
      </div>
    </aside>
  );
};
