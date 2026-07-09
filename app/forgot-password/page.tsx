"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-md w-full text-center">
          <h1 className="text-xl font-bold mb-2">Check your email</h1>
          <p className="text-slate-300 text-sm">
            If an account exists for <b>{email}</b>, we sent a link to reset your
            password. Click it, then set a new password.
          </p>
          <p className="text-sm text-slate-300 mt-4">
            <Link href="/login" className="text-brand-400 font-semibold">
              Back to log in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="card max-w-md w-full">
        <h1 className="text-xl font-bold mb-1">Reset your password</h1>
        <p className="text-sm text-slate-300 mb-6">
          Enter your account email and we&apos;ll send you a link to set a new
          password.
        </p>

        <label className="label">Email</label>
        <input
          type="email"
          className="input mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <p className="text-sm text-slate-300 mt-4 text-center">
          <Link href="/login" className="text-brand-400 font-semibold">
            Back to log in
          </Link>
        </p>
      </form>
    </main>
  );
}
