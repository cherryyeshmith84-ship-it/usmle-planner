import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const RECEIVES = [
  "Personalized study roadmap",
  "Weekly performance review",
  "Daily accountability",
  "Weak-topic analysis",
  "Study schedule adjustments",
  "Progress tracking dashboard",
  "Mistake pattern analysis",
  "Guidance until exam day",
];

const WHY_FAIL = [
  "Review everything instead of weak topics",
  "Repeat the same mistakes",
  "Don't know if they're improving",
  "Lose consistency",
  "Have no one reviewing their progress",
];

const MENTOR_HELPS = [
  "Plan every week",
  "Track your progress",
  "Find your weak concepts",
  "Improve NBME performance",
  "Stay accountable",
  "Reach exam day with confidence",
];

const NUMBERS = [
  { value: "100", label: "Students" },
  { value: "6-Month", label: "Mentorship" },
  { value: "Weekly", label: "Reviews" },
  { value: "Daily", label: "Progress Tracking" },
  { value: "Limited", label: "Founding Cohort" },
];

const HOW_IT_WORKS = [
  { title: "Build Your Plan", desc: "Create a personalized study schedule based on your timeline and current performance." },
  { title: "Learn with Purpose", desc: "Complete questions and identify knowledge gaps instead of studying everything equally." },
  { title: "Review with Your Mentor", desc: "Get feedback, adjust your plan, and focus on the concepts that matter most." },
  { title: "Improve Every Week", desc: "Track your progress through analytics, error patterns, and targeted revision." },
];

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#what-you-get", label: "What you get" },
  { href: "#apply", label: "Apply" },
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
          <Link href="/signup" className="btn-primary">Apply for Mentorship</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto w-full px-6 pt-14 pb-10 text-center">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.05] mb-6">
          Pass Step 1 with a Personalized Learning System
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-4">
          You&apos;re not failing because you&apos;re studying less.
          <br />
          You&apos;re struggling because you don&apos;t know what to study next.
        </p>
        <p className="text-base text-slate-500 max-w-2xl mx-auto mb-10">
          Master Grid combines experienced mentors, personalized study planning, performance
          analytics, and structured review into one learning system designed to help you study
          smarter every day.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Apply for Mentorship
          </Link>
          <a href="#how-it-works" className="btn-secondary text-base px-7 py-3.5">
            See How It Works
          </a>
        </div>
      </section>

      {/* Founding cohort banner */}
      <section id="apply" className="max-w-3xl mx-auto w-full px-6 pb-20 scroll-mt-20">
        <div className="card text-center border-brand-500/50">
          <p className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-2">
            🚀 Founding Cohort
          </p>
          <h2 className="text-2xl md:text-3xl font-extrabold mb-3">
            Free for the First 100 Students
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-6">
            Become one of our first members, help shape the platform, and receive complete
            mentorship at no cost during the founding program.
          </p>
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Apply for Mentorship
          </Link>
        </div>
      </section>

      {/* Every student receives */}
      <section id="what-you-get" className="max-w-4xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-12">
          Every Student Receives
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {RECEIVES.map((item) => (
            <div key={item} className="flex items-center gap-3 card py-3">
              <span className="text-green-500 shrink-0">&#10003;</span>
              <p className="text-sm text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The journey */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="card">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Most students study like this
            </p>
            <div className="flex flex-col items-center gap-2 text-sm text-slate-400">
              <span>Study</span>
              <span className="text-slate-600">&#8595;</span>
              <span>Forget</span>
              <span className="text-slate-600">&#8595;</span>
              <span>Guess</span>
              <span className="text-slate-600">&#8595;</span>
              <span>Repeat</span>
            </div>
          </div>
          <div className="card border-brand-500/50">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-4">
              Master Grid students study like this
            </p>
            <div className="flex flex-col items-center gap-2 text-sm text-slate-200">
              <span>Questions</span>
              <span className="text-slate-600">&#8595;</span>
              <span>Analytics</span>
              <span className="text-slate-600">&#8595;</span>
              <span>Weakness Detection</span>
              <span className="text-slate-600">&#8595;</span>
              <span>Mentor Review</span>
              <span className="text-slate-600">&#8595;</span>
              <span>Targeted Revision</span>
              <span className="text-slate-600">&#8595;</span>
              <span className="font-semibold text-brand-300">Higher NBME Scores</span>
              <span className="text-slate-600">&#8595;</span>
              <span className="font-semibold text-white">Step 1</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why students fail */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-4">
          Why Students Fail
        </h2>
        <p className="text-slate-400 text-center text-lg mb-8">
          Students usually don&apos;t fail because they are lazy. They fail because they:
        </p>
        <div className="space-y-2 mb-8">
          {WHY_FAIL.map((item) => (
            <div key={item} className="flex items-center gap-3 card py-3">
              <span className="text-red-400 shrink-0">&#8226;</span>
              <p className="text-sm text-slate-300">{item}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-slate-200 font-semibold">
          Master Grid is built to solve these problems.
        </p>
      </section>

      {/* Meet your mentor */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
          Meet Your Mentor
        </h2>
        <p className="text-slate-400 text-center text-lg mb-10">
          Your mentor doesn&apos;t just answer questions. They help you
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {MENTOR_HELPS.map((item) => (
            <div key={item} className="flex items-center gap-3 card py-3">
              <span className="text-brand-400 shrink-0">&#10003;</span>
              <p className="text-sm text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Numbers */}
      <section className="max-w-4xl mx-auto w-full px-6 py-20">
        <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {NUMBERS.map((n) => (
            <div key={n.label} className="card text-center">
              <p className="text-xl font-extrabold text-brand-400 mb-1">{n.value}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide">{n.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-3xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-12">
          How Master Grid Works
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

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20 text-center">
        <p className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-2">
          Applications Open &middot; Founding Cohort
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
          Only 100 students will be accepted.
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto mb-2">No payment required.</p>
        <p className="text-slate-400 max-w-xl mx-auto mb-8">
          Apply now and work directly with our mentors while helping build the next generation
          of medical learning.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Apply Now
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
