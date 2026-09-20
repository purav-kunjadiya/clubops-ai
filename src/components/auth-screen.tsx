"use client";

import Image from "next/image";
import { useState } from "react";
import { IconX } from "./icons";

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  onClearError: () => void;
}

function formatAuthError(rawError: string | null): string | null {
  if (!rawError) return null;
  const lower = rawError.toLowerCase();

  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("over_email_send_rate_limit")
  ) {
    return "Authentication rate limit active. Please wait a moment before trying again.";
  }

  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "Invalid email or password. Please check your credentials and try again.";
  }

  if (
    lower.includes("email not confirmed") ||
    lower.includes("error sending confirmation email")
  ) {
    return "Supabase email delivery is restricted. If you have an existing account, please sign in instead.";
  }

  if (lower.includes("user already registered") || lower.includes("already exists")) {
    return "An account with this email already exists. Please sign in instead.";
  }

  return rawError;
}

export function AuthScreen({
  onSignIn,
  onSignUp,
  loading,
  error,
  onClearError,
}: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const rawDisplayError = error || localError;
  const formattedError = formatAuthError(rawDisplayError);

  const clearStaleErrors = () => {
    if (localError) setLocalError(null);
    if (error) onClearError();
  };

  const switchMode = (newMode: "login" | "signup") => {
    if (mode === newMode) return;
    setMode(newMode);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setLocalError(null);
    onClearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate submissions

    setLocalError(null);
    onClearError();

    if (!email.trim() || !password.trim()) {
      setLocalError("Please enter your email and password.");
      return;
    }

    if (mode === "signup") {
      if (password.length < 6) {
        setLocalError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("Passwords do not match.");
        return;
      }
      await onSignUp(email.trim(), password);
    } else {
      await onSignIn(email.trim(), password);
    }
  };

  const isNotice =
    rawDisplayError?.toLowerCase().includes("verify") ||
    rawDisplayError?.toLowerCase().includes("sent") ||
    rawDisplayError?.toLowerCase().includes("confirm");

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-12 selection:bg-indigo-500/20 selection:text-indigo-900">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        {/* Brand header */}
        <div className="text-center space-y-3">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-white border border-indigo-100/80 shadow-sm p-1.5 overflow-hidden">
            <Image
              src="/clubops-logo.png"
              alt="ClubOps AI Logo"
              fill
              sizes="64px"
              className="object-contain p-1"
              priority
            />
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-indigo-600 tracking-widest uppercase">
              ClubOps AI
            </p>
            <h1
              className="text-2xl sm:text-3xl font-bold text-[#1E1B4B] tracking-tight"
              style={{ fontFamily: "var(--font-playfair), serif" }}
            >
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed pt-0.5">
              {mode === "login"
                ? "Sign in to manage your events with AI."
                : "Get started with ClubOps AI — it only takes a moment."}
            </p>
          </div>
        </div>

        {/* Auth card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-7 space-y-5">
          {/* Tab switcher */}
          <div className="flex rounded-xl bg-slate-50 border border-slate-200/60 p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-white text-[#1E1B4B] shadow-sm border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === "signup"
                  ? "bg-white text-[#1E1B4B] shadow-sm border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Notice or Error message */}
          {formattedError && (
            <div
              className={`p-3.5 rounded-xl text-xs font-medium animate-in fade-in transition-all flex items-start justify-between gap-2.5 ${
                isNotice
                  ? "bg-indigo-50/90 border border-indigo-200 text-indigo-900"
                  : "bg-rose-50/90 border border-rose-200 text-rose-700"
              }`}
            >
              <div className="flex items-start gap-2.5 flex-1">
                <span className="font-bold shrink-0 mt-0.5">
                  {isNotice ? "ℹ" : "✕"}
                </span>
                <span className="leading-relaxed break-words flex-1">
                  {formattedError}
                </span>
              </div>
              <button
                type="button"
                onClick={clearStaleErrors}
                className="p-1 rounded-lg hover:bg-black/5 transition-colors text-slate-400 hover:text-slate-700 cursor-pointer shrink-0 mt-0.5"
                title="Dismiss message"
                aria-label="Dismiss message"
              >
                <IconX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearStaleErrors();
                }}
                placeholder="you@university.edu"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 bg-slate-50/70 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="auth-password"
                className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearStaleErrors();
                }}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 bg-slate-50/70 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all"
              />
            </div>

            {mode === "signup" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-confirm-password"
                  className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block"
                >
                  Confirm Password
                </label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearStaleErrors();
                  }}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 bg-slate-50/70 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all"
                />
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm ${
                  loading
                    ? "bg-indigo-400 text-white/80 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer hover:shadow-md"
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {mode === "login" ? "Signing in…" : "Signing up…"}
                  </span>
                ) : mode === "login" ? (
                  "Sign In"
                ) : (
                  "Sign Up"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
