import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="max-w-5xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <span className="font-bold text-lg text-brand-300">Step 1 Planner</span>
        <div className="flex gap-3">
          <Link href="/login" className="btn-secondary">Log in</Link>
          <Link href="/signup" className="btn-primary">Sign up</Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto w-full px-6 py-16 text-center flex-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-4">
          A daily study planner for USMLE Step 1
        </h1>
        <p className="text-lg text-slate-300 mb-8">
          Track your daily tasks, hours, and resources. Rate how each day
          really went. Get an AI coach that reviews your day and tells you
          what to focus on tomorrow &mdash; based on your own progress.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/signup" className="btn-primary text-base px-6 py-3">
            Get started free
          </Link>
          <Link href="/login" className="btn-secondary text-base px-6 py-3">
            I already have an account
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-16 text-left">
          <div className="card">
            <h3 className="font-semibold mb-1">Daily tracker</h3>
            <p className="text-sm text-slate-300">
              Log tasks, hours, resources used, and what you skipped &mdash;
              every single day.
            </p>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-1">End-of-day reflection</h3>
            <p className="text-sm text-slate-300">
              Write a note and rate the day 0-10 so you can see real
              patterns over time.
            </p>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-1">AI coach</h3>
            <p className="text-sm text-slate-300">
              Get a daily review and a concrete plan for tomorrow, tailored
              to how you actually studied.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
