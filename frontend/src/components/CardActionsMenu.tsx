"use client";

import { useEffect, useRef, useState } from "react";

import { cardIntelligence, type CardIntelligenceResult } from "@/lib/api";
import type { CardIntelligenceRequest } from "@/lib/api";

type Props = {
  cardId: number;
  boardId: number;
  onUpdateCard: (cardId: number, updates: { details?: string; priority?: string }) => void;
};

const TASKS: Array<{ key: CardIntelligenceRequest["task"]; label: string }> = [
  { key: "generate_details", label: "Generate details" },
  { key: "suggest_priority", label: "Suggest priority" },
  { key: "detect_duplicates", label: "Detect duplicates" },
];

const SIMILARITY_COLORS: Record<string, string> = {
  high: "text-[var(--secondary-purple)]",
  medium: "text-[var(--primary-blue)]",
  low: "text-[var(--gray-text)]",
};

export const CardActionsMenu = ({ cardId, boardId, onUpdateCard }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CardIntelligenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  const run = async (task: CardIntelligenceRequest["task"]) => {
    setOpen(false);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await cardIntelligence(boardId, cardId, task));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI action failed.");
    } finally {
      setLoading(false);
    }
  };

  // Generated details overwrite whatever is on the card, so the user decides.
  const applyDetails = () => {
    if (result?.details) {
      onUpdateCard(cardId, { details: result.details });
      setResult(null);
    }
  };

  const applyPriority = () => {
    if (result?.priority) {
      onUpdateCard(cardId, { priority: result.priority });
      setResult(null);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={loading}
        aria-expanded={open}
        aria-label="Card AI actions"
        className="rounded-full border border-[var(--stroke)] px-2 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)] disabled:opacity-40"
      >
        AI
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-[var(--stroke)] bg-white p-1 shadow-[var(--shadow)]">
          {TASKS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => void run(item.key)}
              className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-2 text-xs text-[var(--gray-text)]">Thinking...</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--secondary-purple)]">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Result
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--navy-dark)]">{result.result}</p>

          {result.details ? (
            <div className="mt-2">
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-2 text-xs leading-5 text-[var(--gray-text)]">
                {result.details}
              </pre>
              <button
                type="button"
                onClick={applyDetails}
                className="mt-2 rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                Use these details
              </button>
            </div>
          ) : null}

          {result.priority ? (
            <div className="mt-2">
              <p className="text-xs font-semibold text-[var(--primary-blue)]">
                Suggested priority: {result.priority}
              </p>
              <button
                type="button"
                onClick={applyPriority}
                className="mt-2 rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                Apply priority
              </button>
            </div>
          ) : null}

          {result.duplicates.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-2">
              {result.duplicates.map((dup) => (
                <li key={dup.card_id} className="text-xs leading-5 text-[var(--gray-text)]">
                  <span
                    className={`font-semibold ${SIMILARITY_COLORS[dup.similarity] ?? "text-[var(--gray-text)]"}`}
                  >
                    {dup.similarity} overlap
                  </span>
                  : {dup.title}
                  {dup.reason ? ` (${dup.reason})` : ""}
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
};
