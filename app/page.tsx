import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const RECEIVES = [
  "A personalized study plan built around your exam date and current performance",
  "A weekly one-on-one review session with your dedicated mentor",
  "Daily accountability check-ins to help you maintain consistency",
  "Detailed weak-topic analysis down to the individual concept level",
  "A study plan that adapts as your schedule and performance change",
  "A single dashboard showing your progress toward exam day",
  "A clear explanation for every question answered incorrectly",
  "Continuous mentor support from enrollment through exam day",
];

const WHY_FAIL = [
  "Review all material equally instead of focusing on the concepts causing the most missed questions",
  "Repeat the same type of mistake without recognizing the underlying pattern",
  "Study for weeks without a clear measure of whether their performance is improving",
  "Lose consistency after a strong initial start",
  "Receive no structured feedback until a low practice exam score forces a reassessment",
];

const MENTOR_HELPS = [
  "Develop a structured plan aligned with your exam date",
  "Identify weak concepts before they affect your NBME performance",
  "Review your Error Notes and understand the reasoning behind each mistake",
  "Adjust your study plan promptly when something isn't working",
  "Maintain accountability and consistency throughout your preparation",
  "Approach exam day with confidence and a plan you can trust",
];

const NUMBERS = [
  { value: "100", label: "Spots in Founding Cohort" },
  { value: "6-Month", label: "Mentorship" },
  { value: "Weekly", label: "1-on-1 Reviews" },
  { value: "Daily", label: "Progress Tracking" },
  { value: "$0", label: "Cost to Join" },
];

const HOW_IT_WORKS = [
  { title: "Build Your Plan", desc: "Receive a personalized study schedule based on your timeline and current performance level." },
  { title: "Study With Purpose", desc: "Complete practice questions targeted at your specific knowledge gaps rather than reviewing all material equally." },
  { title: "Review With Your Mentor", desc: "Meet weekly with your mentor to discuss your progress, adjust your plan, and prioritize the concepts that matter most." },
  { title: "Track Continuous Improvement", desc: "Monitor your progress through detailed analytics, error-pattern tracking, and targeted revision." },
];

const NAV_LINKS = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#what-you-get", label: "What You Get" },
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
            <a key={l.href} href={l.href} className="hover:text-slate-100 transition">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/mentor/login" className="text-xs text-slate-500 hover:text-slate-300 hidden sm:inline">
            Mentor Login
          </Link>
          <Link href="/login" className="btn-secondary">Log In</Link>
          <Link href="/signup" className="btn-primary">Apply for Mentorship</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto w-full px-6 pt-14 pb-10 text-center">
        <p className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-4">
          For Caribbean and International Medical Students
        </p>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-slate-100 leading-[1.05] mb-6">
          A Personalized Path to Mastering USMLE Step 1
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-4">
          Most students who struggle on Step 1 are not lacking effort.
          <br />
          They are lacking a clear, individualized plan for what to study next.
        </p>
        <p className="text-base text-slate-500 max-w-2xl mx-auto mb-10">
          Master Grid combines dedicated mentorship, adaptive study planning, and detailed
          performance analytics into a single system, built to help you study with precision and
          arrive at exam day fully prepared.
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
            Founding Cohort &middot; Limited to 100 Students
          </p>
          <h2 className="text-2xl md:text-3xl font-extrabold mb-3">
            Comprehensive Mentorship, Offered at No Cost
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-6">
            Join Master Grid during its founding phase and receive full access to mentorship,
            structured planning, and performance tracking at no charge, while helping shape the
            platform as it grows.
          </p>
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Apply for Mentorship
          </Link>
        </div>
      </section>

      {/* Every student receives */}
      <section id="what-you-get" className="max-w-4xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-12">
          A Complete System for Every Student
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
              A typical approach to studying
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
              The Master Grid approach
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
              <span className="font-semibold text-slate-100">Step 1</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why students fail */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-4">
          Why Many Students Fall Short
        </h2>
        <p className="text-slate-400 text-center text-lg mb-8">
          Students who struggle on Step 1 are rarely lacking in effort. In most cases, that
          effort is simply misdirected. Common patterns include the tendency to:
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
          Master Grid is designed specifically to address each of these challenges.
        </p>
      </section>

      {/* Meet your mentor */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
          Structured, One-on-One Mentorship
        </h2>
        <p className="text-slate-400 text-center text-lg mb-10">
          Each student is paired with a dedicated mentor who reviews their performance data in
          advance of every session. Your mentor will help you:
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
          A Limited Number of Places Are Available
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto mb-2">
          There is no cost and no obligation to apply.
        </p>
        <p className="text-slate-400 max-w-xl mx-auto mb-8">
          Apply today to be matched with a mentor and begin studying with a plan built around
          your individual strengths and weaknesses.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Apply Now
          </Link>
          <Link href="/login" className="btn-secondary text-base px-7 py-3.5">
            I Already Have an Account
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
