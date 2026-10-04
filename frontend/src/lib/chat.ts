"use client";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
};

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });