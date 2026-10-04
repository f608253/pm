"use client";

import { formatTime, type ChatMessage } from "@/lib/chat";

export const ChatMessageView = ({ message }: { message: ChatMessage }) => {
  const isUser = message.role === "user";

  return (
    <li className="flex flex-col gap-1">
      <div
        className={
          isUser
            ? "self-end rounded-2xl rounded-br-sm bg-[var(--secondary-purple)] px-4 py-2.5 text-sm text-white"
            : "self-start rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--navy-dark)]"
        }
      >
        {message.text}
      </div>
      <time
        dateTime={message.at}
        className={
          isUser
            ? "self-end text-[10px] uppercase tracking-[0.15em] text-[var(--gray-text)]"
            : "self-start text-[10px] uppercase tracking-[0.15em] text-[var(--gray-text)]"
        }
      >
        {isUser ? "You" : "Assistant"} {formatTime(message.at)}
      </time>
    </li>
  );
};