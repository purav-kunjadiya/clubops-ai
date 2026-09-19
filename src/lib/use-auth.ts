"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
};

/**
 * Lightweight auth hook.
 *
 * When Supabase is not configured (no real credentials in .env.local),
 * the hook falls back to a "demo mode" where sign-up / sign-in
 * always succeed with a synthetic user so the rest of the app can run
 * without a live Supabase project.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    loading: isSupabaseConfigured,
    error: null,
  }));

  // ── Bootstrap: resolve the initial session ─────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const resolve = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setState({ user: session?.user ?? null, loading: false, error: null });
    };

    resolve();

    // Listen for auth changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({ ...prev, user: session?.user ?? null }));
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Sign up ────────────────────────────────────────────────────
  const signUp = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    if (!isSupabaseConfigured) {
      // Demo fallback: create a synthetic user object
      const demoUser = { id: `demo-${Date.now()}`, email } as User;
      setState({ user: demoUser, loading: false, error: null });
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return;
    }

    // When Supabase email confirmation is enabled, session is null and identities might be empty if already exists
    if (!data.session) {
      // Account created but email confirmation is pending
      setState({
        user: null,
        loading: false,
        error: "Verification email sent. Please verify your email before logging in.",
      });
      return;
    }

    setState({
      user: data.user,
      loading: false,
      error: null,
    });
  }, []);

  // ── Sign in ────────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    if (!isSupabaseConfigured) {
      const demoUser = { id: `demo-${Date.now()}`, email } as User;
      setState({ user: demoUser, loading: false, error: null });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
      return;
    }

    setState({ user: data.user, loading: false, error: null });
  }, []);

  // ── Sign out ───────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    if (!isSupabaseConfigured) {
      setState({ user: null, loading: false, error: null });
      return;
    }

    await supabase.auth.signOut();
    setState({ user: null, loading: false, error: null });
  }, []);

  // ── Clear error ────────────────────────────────────────────────
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return { ...state, signUp, signIn, signOut, clearError };
}
