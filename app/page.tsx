import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const WORKFLOW_STEPS = [
  "Practice Questions",
  "Understand Your Mistake",
  "Error DNA",
  "Master Grid",
  "Smart Review",
  "Improve",
];

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
    title: "Smart Review",
    desc: "A prioritized queue that resurfaces the concepts you're still missing, ranked by how often you're currently getting them wrong.",
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
  { title: "Answer a question", desc: "Practice with tagged, Step 1-style questions from the Question Bank." },
  { title: "Get a real explanation", desc: "Every choice - right and wrong - comes with its own explanation, not just the correct answer." },
  { title: "Wrong answers get an Error Note", desc: "A short note explains exactly what you confused it with and why." },
  { title: "Your Error DNA and Master Grid update", desc: "That note feeds your concept-level profile automatically - no extra work." },
  { title: "Smart Review schedules it", desc: "The concept moves into your review queue until you're reliably getting it right." },
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
        <span className="font-bold text-lg text-brand-300">Master Grid</span>
        <div className="flex gap-3">
          <Link href="/login" className="btn-secondary">Log in</Link>
          <Link href="/signup" className="btn-primary">Sign up</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto w-full px-6 py-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-4">
          Find the pattern behind your Step 1 mistakes. Fix it. Master it.
        </h1>
        <p className="text-lg text-slate-300 mb-8">
          Practice with high-quality questions, understand exactly why you missed them, track
          your weakest concepts, and review what matters most.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup" className="btn-primary text-base px-6 py-3">
            Start Practicing Free
          </Link>
          <a href="#features" className="btn-secondary text-base px-6 py-3">
            Explore Master Grid
          </a>
        </div>
      </section>

      {/* Workflow strip */}
      <section className="max-w-5xl mx-auto w-full px-6 pb-16">
        <div className="flex items-center justify-center flex-wrap gap-y-3">
          {WORKFLOW_STEPS.map((step, i) => (
            <div key={step} className="flex items-center">
              <span className="text-sm font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-full px-4 py-2 whitespace-nowrap">
                {step}
              </span>
              {i < WORKFLOW_STEPS.length - 1 && (
                <span className="text-slate-600 mx-2 hidden sm:inline">&rarr;</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Six core features */}
      <section id="features" className="max-w-5xl mx-auto w-full px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-2">Everything you need in one platform</h2>
        <p className="text-slate-400 text-center mb-10">
          Not just another question bank - a system that turns your mistakes into a plan.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-slate-300">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto w-full px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
        <div className="space-y-4">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title} className="flex gap-4 items-start">
              <span className="shrink-0 w-8 h-8 rounded-full bg-brand-900/50 text-brand-300 font-bold flex items-center justify-center text-sm">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-slate-400">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sample explanation */}
      <section className="max-w-3xl mx-auto w-full px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-2">See it in action</h2>
        <p className="text-slate-400 text-center mb-8">
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
      <section className="max-w-3xl mx-auto w-full px-6 py-16">
        <div className="card text-center">
          <h2 className="text-xl font-bold mb-2">Everything is free right now</h2>
          <p className="text-sm text-slate-400 mb-4">
            No paywall, no premium tier. Every feature below is included:
          </p>
          <p className="text-sm text-slate-300">
            Question Bank &middot; Self-Assessments &middot; Master Grid &middot; Error Notes
            &middot; Smart Review &middot; Visual Lab &middot; Study Planner
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto w-full px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-4">
          {FAQS.map((f) => (
            <div key={f.q} className="card">
              <h3 className="font-semibold mb-1">{f.q}</h3>
              <p className="text-sm text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto w-full px-6 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to find your pattern?</h2>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup" className="btn-primary text-base px-6 py-3">
            Start Practicing Free
          </Link>
          <Link href="/login" className="btn-secondary text-base px-6 py-3">
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
            <Link href="/privacy" className="hover:text-slate-200">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-200">Terms of Service</Link>
            <a href="mailto:cherryyeshmith84@gmail.com" className="hover:text-slate-200">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
