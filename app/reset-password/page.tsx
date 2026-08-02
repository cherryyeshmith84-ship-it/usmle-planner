"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Undetermined until the session check below finishes, so we don't
  // flash the password form for a split second before finding out the
  // recovery link's session never got established.
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(!!data.session);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    // By the time this page loads, /auth/callback already exchanged the
    // reset-link code for a session, so this updates the currently signed-in
    // (recovery) user's password directly.
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-md w-full text-center">
          <h1 className="text-xl font-bold mb-2">Password updated</h1>
          <p className="text-slate-300 text-sm mb-6">
            Your password has been changed.
          </p>
          <a href="/dashboard" className="btn-primary inline-block">
            Go to dashboard
          </a>
        </div>
      </main>
    );
  }

  // Link was already used, expired, or opened in a way that lost the
  // session (e.g. an email app's link scanner visiting it first) - show a
  // clear next step instead of letting the student type a password and
  // only then discover it can't be saved.
  if (sessionReady === false) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-md w-full text-center">
          <h1 className="text-xl font-bold mb-2">This link has expired</h1>
          <p className="text-slate-300 text-sm mb-6">
            Password reset links can only be used once and expire after a
            while. Please request a new one.
          </p>
          <Link href="/forgot-password" className="btn-primary inline-block">
            Request a new link
          </Link>
        </div>
      </main>
    );
  }

  if (sessionReady === null) {
    return <main className="min-h-screen flex items-center justify-center px-6" />;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="card max-w-md w-full">
        <h1 className="text-xl font-bold mb-1">Set a new password</h1>
        <p className="text-sm text-slate-300 mb-6">
          Choose a new password for your account.
        </p>

        <label className="label">New password</label>
        <div className="relative mb-4">
          <input
            type={showPassword ? "text" : "password"}
            className="input pr-16"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            minLength={6}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Saving..." : "Save new password"}
        </button>
      </form>
    </main>
  );
}
