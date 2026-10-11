"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchWeeklyReport, type WeeklyReportResult } from "@/lib/api";
import type { Board } from "@/lib/kanban";

type Props = {
  open: boolean;
  onClose: () => void;
  board: Board;
};

const SWIPE_CLOSE_THRESHOLD = 80;

const listBlock = (label: string, items: string[]) =>
  items.length > 0 ? (
    <section aria-label={label}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--ai-weekly-text)" }}>
        {label}
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="rounded-2xl border p-3 text-sm leading-6"
            style={{ borderColor: "var(--ai-weekly-border)", backgroundColor: "var(--ai-weekly-bg)", color: "var(--ai-weekly-text)" }}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  ) : null;

export const WeeklyReportPanel = ({ open, onClose, board }: Props) => {
  const [result, setResult] = useState<WeeklyReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchWeeklyReport(board.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load weekly report.");
    } finally {
      setLoading(false);
    }
  }, [board.id]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  const isEmpty =
    result !== null &&
    result.completed.length === 0 &&
    result.in_progress.length === 0 &&
    result.up_next.length === 0;

  return (
    <aside
      id="weekly-report-panel"
      aria-label="Weekly report"
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
        borderLeftColor: "var(--ai-weekly-border)",
        backgroundColor: "var(--ai-weekly-bg)",
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-4" style={{ borderColor: "var(--ai-weekly-border)" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--ai-weekly-text)" }}>
            Meeting Prep
          </p>
          <p className="font-display text-lg font-semibold" style={{ color: "var(--ai-weekly-text)" }}>
            Weekly Progress Report
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition disabled:opacity-40"
            style={{ borderColor: "var(--ai-weekly-border)", color: "var(--ai-weekly-text)" }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-controls="weekly-report-panel"
            className="rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition"
            style={{ borderColor: "var(--ai-weekly-border)", color: "var(--ai-weekly-text)" }}
          >
            Close
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--ai-weekly-text)" }}>Generating weekly report...</p>
        ) : error ? (
          <div>
            <p role="alert" className="text-sm font-medium" style={{ color: "var(--ai-weekly-text)" }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: "var(--ai-weekly-border)" }}
            >
              Try again
            </button>
          </div>
        ) : result === null ? (
          <p className="text-sm" style={{ color: "var(--ai-weekly-text)" }}>No weekly report available.</p>
        ) : isEmpty ? (
          <p className="text-sm" style={{ color: "var(--ai-weekly-text)" }}>
            Nothing to report. The board looks healthy.
          </p>
        ) : (
          <>
            {result.summary ? (
              <section aria-label="Summary">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--ai-weekly-text)" }}>
                  Summary
                </h2>
                <p className="mt-2 whitespace-pre-line rounded-2xl border p-4 text-sm leading-6" style={{ borderColor: "var(--ai-weekly-border)", backgroundColor: "var(--ai-weekly-bg)", color: "var(--ai-weekly-text)" }}>
                  {result.summary}
                </p>
              </section>
            ) : null}
            {listBlock("Completed", result.completed)}
            {listBlock("In progress", result.in_progress)}
            {listBlock("Up next", result.up_next)}
            {result.net_worth ? (
              <section aria-label="Net worth">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--ai-weekly-text)" }}>
                  Net worth
                </h2>
                <p className="mt-2 whitespace-pre-line rounded-2xl border p-4 text-sm leading-6" style={{ borderColor: "var(--ai-weekly-border)", backgroundColor: "var(--ai-weekly-bg)", color: "var(--ai-weekly-text)" }}>
                  {result.net_worth}
                </p>
              </section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
};