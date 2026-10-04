"use client";

import { useEffect, useRef, useState } from "react";

import { ChatInput } from "@/components/ChatInput";
import { ChatMessageView } from "@/components/ChatMessageView";
import { TypingIndicator } from "@/components/TypingIndicator";
import { sendChatMessage } from "@/lib/api";
import type { ChatMessage } from "@/lib/chat";
import type { Board } from "@/lib/kanban";

type Props = {
  board: Board;
  onBoardChange: (board: Board) => void;
};

let counter = 0;
const nextId = () => `m${(counter += 1)}`;

export const ChatSidebar = ({ board, onBoardChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const logRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const node = logRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, loading]);

  const send = async (question: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", text: question, at: new Date().toISOString() },
    ]);
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await sendChatMessage(board.id, question);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: result.response,
          at: new Date().toISOString(),
        },
      ]);
      if (result.applied.length > 0) {
        onBoardChange(result.board);
        setNotice(
          `Updated the board: ${result.applied
            .map((item) => item.detail)
            .join("; ")}`
        );
      } else {
        setNotice(null);
      }
      if (result.skipped.length > 0) {
        setError(`Skipped: ${result.skipped.join("; ")}`);
      }
    } catch {
      setError("The assistant could not be reached. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="chat-panel"
          className="fixed bottom-6 right-6 z-30 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
        >
          Ask the assistant
        </button>
      ) : null}

      <aside
        id="chat-panel"
        data-testid="chat-sidebar"
        aria-label="Board assistant"
        aria-hidden={!open}
        className={
          open
            ? "fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] translate-x-0 flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] transition-transform duration-300"
            : "fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] translate-x-full flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] transition-transform duration-300"
        }
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--stroke)] px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              Assistant
            </p>
            <p className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Board chat
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setError(null);
                setNotice(null);
              }}
              disabled={messages.length === 0}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)] disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-controls="chat-panel"
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]"
            >
              Close
            </button>
          </div>
        </header>

        <ul
          ref={logRef}
          data-testid="chat-log"
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 && !loading ? (
            <li className="mt-6 text-center text-sm text-[var(--gray-text)]">
              Ask for a summary, or tell it to add, move, edit, or delete a card.
            </li>
          ) : null}
          {messages.map((message) => (
            <ChatMessageView key={message.id} message={message} />
          ))}
          {loading ? <TypingIndicator /> : null}
        </ul>

        {notice ? (
          <p
            data-testid="chat-notice"
            className="border-t border-[var(--stroke)] bg-[color-mix(in_srgb,var(--accent-yellow)_12%,_transparent)] px-4 py-2 text-xs text-[var(--navy-dark)]"
          >
            {notice}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            data-testid="chat-error"
            className="border-t border-[var(--stroke)] px-4 py-2 text-xs font-medium text-[var(--secondary-purple)]"
          >
            {error}
          </p>
        ) : null}

        <ChatInput disabled={loading} onSend={send} />
      </aside>
    </>
  );
};