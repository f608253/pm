"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchRiskAssessment, type RiskAssessmentResult } from "@/lib/api";
import type { Board } from "@/lib/kanban";

type Props = {
  open: boolean;
  onClose: () => void;
  board: Board;
};

const SWIPE_CLOSE_THRESHOLD = 80;

export const RiskAssessmentPanel = ({ open, onClose, board }: Props) => {
  const [result, setResult] = useState<RiskAssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchRiskAssessment(board.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assess risks.");
    } finally {
      setLoading(false);
    }
  }, [board.id]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  const isEmpty = result !== null && result.risks.length === 0;

  return (
    <aside
      id="risk-panel"
      aria-label="Risk assessment"
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
          ? "fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] translate-x-0 flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] transition-transform duration-300"
          : "fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] translate-x-full flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] transition-transform duration-300"
      }
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--stroke)] px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Smart Summary
          </p>
          <p className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            Risk Assessment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)] disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-controls="risk-panel"
            className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]"
          >
            Close
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-sm text-[var(--gray-text)]">Assessing risks...</p>
        ) : error ? (
          <div>
            <p role="alert" className="text-sm font-medium text-[var(--secondary-purple)]">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-2xl bg-[var(--secondary-purple)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Try again
            </button>
          </div>
        ) : result === null ? (
          <p className="text-sm text-[var(--gray-text)]">No risk data available.</p>
        ) : isEmpty ? (
          <p className="text-sm text-[var(--gray-text)]">
            No risks detected. The board looks healthy.
          </p>
        ) : (
          <>
            {result.summary ? (
              <section aria-label="Summary">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Summary
                </h2>
                <p className="mt-2 whitespace-pre-line rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--navy-dark)]">
                  {result.summary}
                </p>
              </section>
            ) : null}
            <section aria-label="Risks">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Risks
              </h2>
              <ul className="mt-2 flex flex-col gap-3">
                {result.risks.map((item) => (
                  <li
                    key={item.card_id}
                    className="rounded-2xl border border-[var(--accent-yellow)] bg-[var(--surface)] p-3"
                  >
                    <p className="text-sm font-semibold text-[var(--navy-dark)]">
                      {item.card_title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--gray-text)]">
                      <span className="font-semibold text-[var(--navy-dark)]">Risk:</span>{" "}
                      {item.risk}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--gray-text)]">
                      <span className="font-semibold text-[var(--navy-dark)]">Why:</span>{" "}
                      {item.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </aside>
  );
};