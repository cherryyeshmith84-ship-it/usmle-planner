import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "1-on-1 Booked Sessions",
    desc: "Reserve a weekly slot directly on your mentor's calendar - one session per week, no back-and-forth scheduling.",
  },
  {
    title: "Personalized Study Plan",
    desc: "Your mentor builds and adjusts your daily planner grid themselves - what to study, how many questions, what to review, and when.",
  },
  {
    title: "Direct Chat & Meeting Link",
    desc: "Message your mentor any time between sessions, and join the same standing video room every week - no new link to hunt down.",
  },
  {
    title: "Progress Review & Accountability",
    desc: "Your mentor sees your score reports and weak areas, and every planner day locks 48 hours after it passes - so what you logged is what actually happened.",
  },
  {
    title: "Real Step 1 Experience",
    desc: "Every mentor on Master Grid has already passed Step 1 - they've been exactly where you are.",
  },
  {
    title: "Study Plan Progress, Visualized",
    desc: "A shared progress bar shows both of you exactly how much of the plan has actually been completed, not just assigned.",
  },
];

const HOW_IT_WORKS = [
  { title: "Get matched", desc: "Browse mentor profiles - background, languages, what they help with - and pick the one that fits you." },
  { title: "Your mentor builds your plan", desc: "They lay out your daily planner: what to study, how many questions, what to review." },
  { title: "Book your weekly session", desc: "Reserve a 1-on-1 slot directly from their availability - Monday through Sunday, one booking per week." },
  { title: "Log your days", desc: "Fill in the grid as you study - your mentor sees it update, and every box has to be filled for the day to count." },
  { title: "Review & adjust", desc: "Your mentor reviews your score reports and weak areas, and adjusts the plan as your prep evolves." },
];

const FAQS = [
  {
    q: "Do I get to pick my mentor?",
    a: "Yes - browse mentor profiles (background, languages, what they help with) and book directly from whichever one fits you best.",
  },
  {
    q: "How often can I meet with my mentor?",
    a: "You can book one 1-on-1 session per week (Monday-Sunday), plus message your mentor any time in between through the chat.",
  },
  {
    q: "Are the mentors actually qualified?",
    a: "Every mentor on Master Grid has already passed USMLE Step 1 themselves before being added to the platform.",
  },
  {
    q: "Is it free?",
    a: "Right now, yes - mentorship and every other feature on Master Grid is free, with no paywall and no premium tier.",
  },
];

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

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
      {/* Header */}
      <header className="max-w-6xl mx-auto w-full px-6 py-5 flex items-center justify-between sticky top-0 z-20 bg-white/80 backdrop-blur">
        <span className="font-extrabold text-xl tracking-tight text-slate-100">
          Master<span className="text-brand-400">Grid</span>
        </span>
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-300">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-white transition">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex gap-3">
          <Link href="/login" className="btn-secondary">Log in</Link>
          <Link href="/signup" className="btn-primary">Get Started Free</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto w-full px-6 pt-14 pb-16 text-center">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.05] mb-6">
          You don&apos;t have to
          <br />
          crack Step 1 alone.
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Get matched with a mentor who&apos;s already passed Step 1 - a personalized daily study
          plan, a weekly 1-on-1 session, and someone actually reviewing your progress.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Get Started Free
          </Link>
          <a href="#how-it-works" className="btn-secondary text-base px-7 py-3.5">
            See How It Works
          </a>
        </div>
      </section>

      {/* Product visual: the mentorship loop at a glance */}
      <section className="max-w-5xl mx-auto w-full px-6 pb-20">
        <p className="text-xs font-bold text-brand-400 uppercase tracking-widest text-center mb-6">
          The mentorship loop
        </p>
        <div className="grid sm:grid-cols-3 gap-4 items-stretch">
          <div className="card">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
              1-on-1 Sessions
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm bg-slate-800 rounded-lg px-3 py-2">
                <span className="text-slate-300">Wed, 6:00 PM ET</span>
                <span className="text-xs font-semibold text-green-400">Booked</span>
              </div>
              <div className="flex items-center justify-between text-sm border border-slate-800 rounded-lg px-3 py-2">
                <span className="text-slate-400">Sat, 10:00 AM ET</span>
                <span className="text-xs text-brand-400">Open</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">One booking per week, straight from your mentor&apos;s calendar.</p>
          </div>

          <div className="card">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
              Personalized Plan
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Study Plan Progress</span>
                <span>5 / 7 days (71%)</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-brand-500" style={{ width: "71%" }} />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Your mentor lays it out day by day - you just fill it in.</p>
          </div>

          <div className="card">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
              Direct Chat
            </p>
            <div className="border border-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-300 mb-1">
                &ldquo;Nice work on endocrine this week - let&apos;s go over renal next session.&rdquo;
              </p>
              <p className="text-[10px] text-slate-500">Your mentor &middot; 2m ago</p>
            </div>
            <p className="text-xs text-slate-500 mt-3">Message any time, plus a standing meeting link for sessions.</p>
          </div>
        </div>
      </section>

      {/* Core features */}
      <section id="features" className="max-w-5xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
          A real mentor in your corner
        </h2>
        <p className="text-slate-400 text-center text-lg mb-12">
          Not just a question bank - someone who&apos;s already passed Step 1, guiding your plan.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3 className="font-bold text-lg mb-1.5">{f.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-3xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-12">
          How it works
        </h2>
        <div className="space-y-6">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title} className="flex gap-4 items-start">
              <span className="shrink-0 w-10 h-10 rounded-full bg-brand-900/50 text-brand-300 font-extrabold flex items-center justify-center text-base">
                {i + 1}
              </span>
              <div>
                <h3 className="font-bold text-lg">{step.title}</h3>
                <p className="text-slate-400">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sample day */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
          See it in action
        </h2>
        <p className="text-slate-400 text-center text-lg mb-10">
          A simplified example of what a day with a mentor looks like.
        </p>
        <div className="card">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Wednesday, planned by your mentor
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <p className="text-sm text-slate-300">
              <span className="text-slate-500">Planned system:</span> Endocrine, 20Q UWorld
            </p>
            <p className="text-sm text-slate-300">
              <span className="text-slate-500">Extra task:</span> 8 pages of First Aid
            </p>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-green-500">&#10003;</span>
            <p className="text-sm text-slate-300">Every box filled in - day counts toward your progress bar.</p>
          </div>
          <p className="text-sm text-slate-300">
            Your mentor reviews it, sees where you&apos;re still weak, and adjusts what&apos;s next -
            all before your session that week.
          </p>
        </div>
      </section>

      {/* What's included free */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <div className="card text-center">
          <h2 className="text-2xl font-extrabold mb-2">Everything is free right now</h2>
          <p className="text-sm text-slate-400 mb-4">
            No paywall, no premium tier. Every feature below is included:
          </p>
          <p className="text-sm text-slate-300">
            Mentorship &middot; Question Bank &middot; Self-Assessments &middot; Master Grid
            &middot; Error Notes &middot; Anki &middot; Visual Lab &middot; Study Planner
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-12">
          Frequently asked questions
        </h2>
        <div className="space-y-4">
          {FAQS.map((f) => (
            <div key={f.q} className="card">
              <h3 className="font-bold text-base mb-1.5">{f.q}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-6">
          Ready to get a mentor in your corner?
        </h2>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Get Started Free
          </Link>
          <Link href="/login" className="btn-secondary text-base px-7 py-3.5">
            I already have an account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-auto">
        <div className="max-w-5xl mx-auto w-full px-6 py-8">
          <p className="text-xs text-slate-500 mb-4 max-w-2xl">
            Master Grid is an independent educational platform and is not affiliated with,
            endorsed by, or sponsored by the NBME, USMLE, UWorld, or any other third party.
            Content is provided for educational purposes only and does not constitute medical
            advice.
          </p>
          <div className="flex flex-wrap gap-4 text-xs text-slate-400">
            <Link href="/about" className="hover:text-slate-200">About</Link>
            <Link href="/privacy" className="hover:text-slate-200">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-200">Terms of Service</Link>
            <Link href="/refund" className="hover:text-slate-200">Refund Policy</Link>
            <Link href="/contact" className="hover:text-slate-200">Contact</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
