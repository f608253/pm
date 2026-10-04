"use client";

export const TypingIndicator = () => (
  <li className="flex items-center gap-1 self-start rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3">
    <span className="sr-only">The assistant is typing</span>
    {[0, 1, 2].map((index) => (
      <span
        key={index}
        className="h-2 w-2 animate-pulse rounded-full bg-[var(--primary-blue)]"
        style={{ animationDelay: `${index * 150}ms` }}
      />
    ))}
  </li>
);