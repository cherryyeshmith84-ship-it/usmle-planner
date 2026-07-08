"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
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
            We sent a confirmation link to <b>{email}</b>. Click it to
            activate your account, then come back and log in.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="card max-w-md w-full">
        <h1 className="text-xl font-bold mb-1">Create your account</h1>
        <p className="text-sm text-slate-300 mb-6">
          Start planning your Step 1 prep.
        </p>

        <label className="label">Name</label>
        <input
          className="input mb-4"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          required
        />

        <label className="label">Email</label>
        <input
          type="email"
          className="input mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        <label className="label">Password</label>
        <input
          type="password"
          className="input mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          minLength={6}
          required
        />

        {error && (
          <p className="text-sm text-red-400 mb-4">{error}</p>
        )}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating account..." : "Sign up"}
        </button>

        <p className="text-sm text-slate-300 mt-4 text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-400 font-semibold">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
