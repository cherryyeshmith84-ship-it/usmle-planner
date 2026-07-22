import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "Question Bank",
    desc: "Original Step 1-style questions with detailed, option-by-option explanations for every answer choice - not just why the right one is right.",
  },
  {
    title: "Master Grid",
    desc: "See exactly which systems, topics, and concepts you're weak on, broken down as far as System → Topic → Concept.",
  },
  {
    title: "Error DNA",
    desc: "Every wrong answer gets tagged with why you missed it, so the recurring patterns behind your mistakes become visible instead of invisible.",
  },
  {
    title: "Anki",
    desc: "Flip-card flashcards on a spaced-repetition schedule - cards you're shaky on come back sooner, ones you know cold fade into the background.",
  },
  {
    title: "Visual Lab",
    desc: "Train image recognition on its own - histology, gross pathology, and imaging, practiced separately from text questions.",
  },
  {
    title: "Study Planner",
    desc: "Organize your daily preparation around your actual weak points and your exam date, not just a generic checklist.",
  },
];

const HOW_IT_WORKS = [
  { title: "Answer questions", desc: "Practice with tagged, Step 1-style questions from the Question Bank." },
  { title: "Diagnose the mistake", desc: "Every wrong answer gets an Error Note explaining exactly what you confused it with and why." },
  { title: "Track the weak concept", desc: "That mistake feeds your Error DNA and Master Grid profile automatically - no extra work." },
  { title: "Review it at the right time", desc: "Anki resurfaces the concept on a spaced-repetition schedule until you're reliably getting it right." },
  { title: "Retest mastery", desc: "Your Master Grid score updates as you prove you've actually got it this time." },
];

const FAQS = [
  {
    q: "Is Master Grid affiliated with the USMLE, NBME, or UWorld?",
    a: "No. Master Grid is an independent, third-party study platform. It is not affiliated with, endorsed by, or sponsored by the NBME, USMLE, UWorld, or any other test-prep company.",
  },
  {
    q: "Where do the questions come from?",
    a: "Every question is written and curated in-house, then tagged by subject, system, and concept so Master Grid can track your performance accurately.",
  },
  {
    q: "Is it free?",
    a: "Right now, yes - every feature on Master Grid is free, with no paywall and no premium tier.",
  },
  {
    q: "Is this medical advice?",
    a: "No. Master Grid is an educational study tool for exam preparation. Nothing on this platform is medical advice, and it should not be used as a substitute for your medical school curriculum.",
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
      <header className="max-w-6xl mx-auto w-full px-6 py-5 flex items-center justify-between sticky top-0 z-20 bg-black/80 backdrop-blur">
        <span className="font-extrabold text-xl tracking-tight text-white">
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
          Stop repeating the
          <br />
          same Step 1 mistakes.
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Master Grid identifies what you get wrong, why you get it wrong, and what you should
          review next - so every hour you study actually moves the needle.
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

      {/* Product visual: the core loop at a glance */}
      <section className="max-w-5xl mx-auto w-full px-6 pb-20">
        <p className="text-xs font-bold text-brand-400 uppercase tracking-widest text-center mb-6">
          The core loop
        </p>
        <div className="grid sm:grid-cols-3 gap-4 items-stretch">
          <div className="card">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
              Master Grid
            </p>
            <div className="space-y-2">
              {[
                { label: "Cardiovascular", pct: 82 },
                { label: "Endocrine", pct: 54 },
                { label: "Renal", pct: 71 },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{row.label}</span>
                    <span>{row.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">Mastery by system, down to the concept.</p>
          </div>

          <div className="card">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
              Error DNA
            </p>
            <p className="text-xs text-slate-400 mb-2">You picked: Increased PTH</p>
            <p className="text-xs text-slate-400 mb-3">Actually asked: why the diarrhea?</p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-slate-300 bg-slate-800 rounded-full px-2 py-1">
                Confused with: MEN1
              </span>
              <span className="text-xs text-slate-300 bg-slate-800 rounded-full px-2 py-1">
                Weak concept: VIPoma
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-3">Tags why you missed it, every time.</p>
          </div>

          <div className="card">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
              Anki
            </p>
            <div className="border border-purple-900/40 rounded-lg p-3 text-center">
              <p className="text-xs font-semibold text-slate-200 mb-1">VIPoma / WDHA syndrome</p>
              <p className="text-xs text-slate-500 mb-2">Tap to flip</p>
              <span className="text-[10px] font-semibold bg-purple-900/30 text-purple-300 rounded-full px-2 py-0.5">
                Due today
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-3">Spaced repetition, so it sticks.</p>
          </div>
        </div>
      </section>

      {/* Six core features */}
      <section id="features" className="max-w-5xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
          Everything you need in one platform
        </h2>
        <p className="text-slate-400 text-center text-lg mb-12">
          Not just another question bank - a system that turns your mistakes into a plan.
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

      {/* Sample explanation */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
          See it in action
        </h2>
        <p className="text-slate-400 text-center text-lg mb-10">
          A simplified example of what you&apos;ll see after answering a question.
        </p>
        <div className="card">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Example explanation format
          </p>
          <p className="text-sm text-slate-300 mb-4">
            A 62-year-old man presents with progressive shortness of breath and bilateral lower
            extremity edema. Which of the following best explains the underlying mechanism?
          </p>
          <div className="space-y-2 mb-4">
            <p className="text-sm text-red-400">
              You picked: <span className="font-medium">Increased capillary permeability</span>
            </p>
            <p className="text-sm text-green-400">
              Correct answer: <span className="font-medium">Increased hydrostatic pressure</span>
            </p>
          </div>
          <p className="text-sm text-slate-300 mb-4">
            Elevated venous hydrostatic pressure from reduced cardiac output pushes fluid into
            the interstitium - the mechanism behind cardiogenic edema, as opposed to the
            permeability changes seen in inflammatory or allergic edema.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
              Confused with: capillary leak syndromes
            </span>
            <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
              Weak concept: Starling forces
            </span>
          </div>
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
            Question Bank &middot; Self-Assessments &middot; Master Grid &middot; Error Notes
            &middot; Anki &middot; Visual Lab &middot; Study Planner
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
          Ready to find your pattern?
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
