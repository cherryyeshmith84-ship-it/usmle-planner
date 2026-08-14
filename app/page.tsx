import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const RECEIVES = [
  "A study plan built around your real exam date, not a generic 90-day template",
  "A weekly 1-on-1 review with your mentor, not just more solo grinding",
  "Daily accountability check-ins so momentum doesn't quietly disappear in week 3",
  "Weak-topic analysis down to the exact concept, not just the subject",
  "A plan that adjusts the moment your schedule slips, instead of falling apart",
  "One dashboard that shows exactly how you're trending toward exam day",
  "Every wrong answer explained: what you confused it with, and why",
  "A mentor in your corner from day one until you walk out of the exam",
];

const WHY_FAIL = [
  "Re-review everything the night before instead of fixing the 20% actually costing them points",
  "Miss the same concept three different ways and never notice the pattern",
  "Study for weeks with no real signal on whether their score is moving",
  "Start strong in week one and quietly stop showing up by week four",
  "Have no one checking in until a low NBME forces the conversation",
];

const MENTOR_HELPS = [
  "Build a week-by-week plan around your actual exam date",
  "Catch weak concepts before they cost you points on an NBME",
  "Read your Error Notes with you, not just your score",
  "Course-correct your plan the moment something stops working",
  "Keep you accountable on the weeks your motivation dips",
  "Get you to exam day with a score you can trust",
];

const NUMBERS = [
  { value: "100", label: "Spots in Founding Cohort" },
  { value: "6-Month", label: "Mentorship" },
  { value: "Weekly", label: "1-on-1 Reviews" },
  { value: "Daily", label: "Progress Tracking" },
  { value: "$0", label: "Cost to Join" },
];

const HOW_IT_WORKS = [
  { title: "Build Your Plan", desc: "Get a study schedule built around your actual timeline and current performance, not a generic countdown." },
  { title: "Learn with Purpose", desc: "Answer questions that target your specific gaps instead of reviewing everything equally." },
  { title: "Review with Your Mentor", desc: "Sit down weekly with someone who reads your data with you and adjusts the plan in real time." },
  { title: "Improve Every Week", desc: "Watch your weak concepts turn into strengths through analytics, Error Notes, and targeted revision." },
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
            <a key={l.href} href={l.href} className="hover:text-slate-100 transition">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/mentor/login" className="text-xs text-slate-500 hover:text-slate-300 hidden sm:inline">
            Mentor login
          </Link>
          <Link href="/login" className="btn-secondary">Log in</Link>
          <Link href="/signup" className="btn-primary">Apply for Mentorship</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto w-full px-6 pt-14 pb-10 text-center">
        <p className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-4">
          Built for Caribbean &amp; International Medical Students
        </p>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-slate-100 leading-[1.05] mb-6">
          Stop Studying Everything. Start Fixing What&apos;s Actually Costing You Points.
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-4">
          You&apos;re not failing Step 1 because you&apos;re studying less than everyone else.
          <br />
          You&apos;re stuck because no one is telling you what to study next.
        </p>
        <p className="text-base text-slate-500 max-w-2xl mx-auto mb-10">
          Master Grid pairs you with a real mentor and a study system that tracks every mistake
          down to the exact concept, so your next practice block targets what&apos;s actually
          weak instead of everything at once.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Apply for Mentorship — Free
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
            🚀 Founding Cohort — Limited to 100 Students
          </p>
          <h2 className="text-2xl md:text-3xl font-extrabold mb-3">
            Full Mentorship, Free — While the Founding Cohort Is Open
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-6">
            Join early, help shape the platform as we build it, and get full mentorship access
            at no cost while we&apos;re accepting the first 100 students.
          </p>
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Apply for Mentorship
          </Link>
        </div>
      </section>

      {/* Every student receives */}
      <section id="what-you-get" className="max-w-4xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-12">
          What You Actually Get, Not Just What You&apos;re Promised
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
              <span className="font-semibold text-slate-100">Step 1</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why students fail */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-4">
          It&apos;s Not a Lack of Effort. It&apos;s a Lack of Direction.
        </h2>
        <p className="text-slate-400 text-center text-lg mb-8">
          Most students who struggle on Step 1 aren&apos;t working less than the ones who pass.
          They just spend that effort in the wrong place. They:
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
          Master Grid exists to fix exactly these five things.
        </p>
      </section>

      {/* Meet your mentor */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
          A Mentor Who Actually Knows Your Weak Spots
        </h2>
        <p className="text-slate-400 text-center text-lg mb-10">
          Not a generic office-hours call. A weekly session with someone who&apos;s already
          looked at your data and shows up ready to help you
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
          Only 100 Students Will Get In. Here&apos;s Your Shot.
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto mb-2">No payment, no catch, no credit card.</p>
        <p className="text-slate-400 max-w-xl mx-auto mb-8">
          Apply now, get matched with a mentor, and start studying with a plan built around your
          actual weak spots instead of a generic checklist.
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
