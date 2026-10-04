"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  disabled: boolean;
  onSend: (question: string) => void;
};

export const ChatInput = ({ disabled, onSend }: Props) => {
  const [value, setValue] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // A new reply is taller than the input, so reset the height after each send.
  useEffect(() => {
    if (areaRef.current) {
      areaRef.current.style.height = "auto";
    }
  }, [disabled]);

  const send = () => {
    const question = value.trim();
    if (!question || disabled) {
      return;
    }
    onSend(question);
    setValue("");
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-[var(--stroke)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <label className="sr-only" htmlFor="chat-question">
        Message the assistant
      </label>
      <textarea
        id="chat-question"
        ref={areaRef}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={disabled ? "Waiting for the assistant..." : "Ask about this board"}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="h-[42px] rounded-xl bg-[var(--secondary-purple)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
};