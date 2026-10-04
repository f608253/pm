"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import {
  clearToken,
  getToken,
  logout,
  me,
  setUnauthorizedHandler,
} from "@/lib/api";

type Status = "loading" | "signedOut" | "signedIn";

export const AppRoot = () => {
  const [status, setStatus] = useState<Status>("loading");
  const [username, setUsername] = useState("");

  const signOut = useCallback(() => {
    clearToken();
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    // Any API call that comes back 401 ends the session, so a board request
    // after the token expires drops back to the sign in form.
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(() => {});
  }, [signOut]);

  useEffect(() => {
    // Without a token the request can only come back 401, which the browser
    // logs as a console error, so show the sign in form without asking.
    if (!getToken()) {
      Promise.resolve().then(() => setStatus("signedOut"));
      return;
    }
    me()
      .then((user) => {
        setUsername(user.username);
        setStatus("signedIn");
      })
      .catch(() => {
        clearToken();
        setStatus("signedOut");
      });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      // Session may already be invalid; sign out locally regardless.
    }
    signOut();
  }, [signOut]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--gray-text)]">Loading your board...</p>
      </main>
    );
  }

  if (status === "signedOut") {
    return (
      <LoginForm
        onSuccess={(name) => {
          setUsername(name);
          setStatus("signedIn");
        }}
      />
    );
  }

  return <KanbanBoard username={username} onLogout={handleLogout} />;
};