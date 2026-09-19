"use client";

import { useState } from "react";
import { IconSparkles } from "@/components/icons";

interface AuthScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  onClearError: () => void;
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

  const displayError = error || localError;

  const switchMode = (newMode: "login" | "signup") => {
    setMode(newMode);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setLocalError(null);
    onClearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-12 selection:bg-indigo-500/20 selection:text-indigo-900">
      <div className="max-w-md w-full space-y-8">

        {/* Brand header */}
        <div className="text-center space-y-5">
          <div className="relative w-14 h-14 mx-auto">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-50 to-[#EDE9FE] flex items-center justify-center border border-indigo-100/60">
              <IconSparkles className="w-6 h-6 text-indigo-600" />
            </div>
            <span className="absolute -top-1 left-2.5 w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse" />
            <span className="absolute -top-1 right-2.5 w-1.5 h-1.5 rounded-full bg-purple-300 animate-pulse" />
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
            <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed pt-1">
              {mode === "login"
                ? "Sign in to manage your clubs, events, and team."
                : "Get started with ClubOps AI — it only takes a moment."}
            </p>
          </div>
        </div>

        {/* Auth card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-7 space-y-5">

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

          {/* Error message */}
          {displayError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium animate-in fade-in">
              {displayError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-400 bg-slate-50/70 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="auth-password"
                className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-400 bg-slate-50/70 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all"
              />
            </div>

            {mode === "signup" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-confirm-password"
                  className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Confirm Password
                </label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-400 bg-slate-50/70 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                loading
                  ? "bg-indigo-400 text-white/80 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer hover:shadow-md"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </span>
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400">
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
