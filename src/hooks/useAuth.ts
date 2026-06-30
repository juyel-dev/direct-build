import { useState, useEffect, useCallback } from "react";
import { createUserClient } from "../services/supabase-factory";
import { AuthService, type AuthState } from "../services/auth-service";

let globalAuthState: AuthState = { session: null, user: null, loading: true };
let listeners: Array<(state: AuthState) => void> = [];
let authService: AuthService | null = null;

function notify() {
  for (const cb of listeners) cb(globalAuthState);
}

async function initAuth() {
  const client = await createUserClient();
  if (!client) {
    globalAuthState = { session: null, user: null, loading: false };
    notify();
    return;
  }
  authService = new AuthService(client);
  const session = await authService.getSession();
  globalAuthState = {
    session,
    user: session?.user
      ? { id: session.user.id, email: session.user.email }
      : null,
    loading: false,
  };
  notify();

  authService.onAuthStateChange((newSession) => {
    globalAuthState = {
      session: newSession,
      user: newSession?.user
        ? { id: newSession.user.id, email: newSession.user.email }
        : null,
      loading: false,
    };
    notify();
  });
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(globalAuthState);

  useEffect(() => {
    listeners.push(setState);
    if (globalAuthState.loading) initAuth();
    return () => {
      listeners = listeners.filter((l) => l !== setState);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!authService) throw new Error("Auth not initialized");
    await authService.signIn(email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!authService) throw new Error("Auth not initialized");
    await authService.signUp(email, password);
  }, []);

  const signOut = useCallback(async () => {
    if (!authService) throw new Error("Auth not initialized");
    await authService.signOut();
  }, []);

  return { ...state, signIn, signUp, signOut };
}
