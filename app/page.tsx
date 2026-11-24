import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HomeIntroAnimation from "@/components/HomeIntroAnimation";

const HERO_PATHWAY = ["Assess", "Plan", "Execute", "Analyze", "Improve"];

export const dynamic = "force-dynamic";

const WHY_FAIL = [
  "Review all material equally instead of focusing on the concepts causing the most missed questions",
  "Repeat the same type of mistake without recognizing the underlying pattern",
  "Study for weeks without a clear measure of whether their performance is improving",
  "Lose consistency after a strong initial start",
  "Receive no structured feedback until a low practice exam score forces a reassessment",
];

// Everything a student gets from their mentor, in one place and without
// repeats, in four groups.
const MENTOR_DUTIES = [
  {
    title: "Plan & Accountability",
    icon: "01",
    items: [
      "A personalized study plan built around your exam date and current performance",
      "Study planner kept current, and adjusted promptly when your schedule or performance changes",
      "1 on 1 study goals and plans",
      "Accountability, with daily check-ins to keep you consistent",
      "Motivation and consistency",
    ],
  },
  {
    title: "Performance & Analysis",
    icon: "02",
    items: [
      "Analysis of your weak topics down to the individual concept, before they hurt your NBME score",
      "Discuss weak and high yield topics",
      "Student assessment",
      "Errors discussion: your Error Notes reviewed, with a clear explanation of every question answered incorrectly",
      "A single dashboard showing your progress toward exam day",
    ],
  },
  {
    title: "Exam Readiness",
    icon: "03",
    items: [
      "Exam readiness assessment",
      "Exam strategy",
      "Resource selection",
      "Arrive at exam day with confidence and a plan you can trust",
    ],
  },
  {
    title: "Support & Community",
    icon: "04",
    items: ["Continuous mentor support from enrollment through exam day", "Networking"],
  },
];

// The weekly commitment behind every student.
const MENTOR_WEEKLY = [
  { title: "One session every week", desc: "A one-on-one review session with each of their students." },
  { title: "Study planner kept current", desc: "Your plan is updated as your week actually goes." },
  { title: "Follow-up on last week", desc: "What was planned, what got done, and what changes next." },
  { title: "Recent exams analyzed", desc: "Any NBME or self-assessment you took is reviewed and your plan is updated from it." },
];

const NUMBERS = [
  { value: "6-Month", label: "Mentorship" },
  { value: "Weekly", label: "1-on-1 Reviews" },
  { value: "Daily", label: "Progress Tracking" },
  { value: "24 hrs", label: "Score Report Updates" },
];

const HOW_IT_WORKS = [
  { title: "Build Your Plan", desc: "Receive a personalized study schedule based on your timeline and current performance level." },
  { title: "Study With Purpose", desc: "Complete practice questions targeted at your specific knowledge gaps rather than reviewing all material equally." },
  { title: "Review With Your Mentor", desc: "Meet weekly with your mentor to discuss your progress, adjust your plan, and prioritize the concepts that matter most." },
  { title: "Track Continuous Improvement", desc: "Monitor your progress through detailed analytics, error-pattern tracking, and targeted revision." },
];

const NAV_LINKS = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#mentor-duties", label: "What You Get" },
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

  const { data: testimonialRows } = await supabase
    .from("testimonials")
    .select("id, name, info, comment, image_url, passed_step1, passed_step2, passed_step3, university")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const testimonials = (testimonialRows ?? []) as {
    id: string;
    name: string;
    info: string | null;
    comment: string;
    image_url: string | null;
    passed_step1: boolean;
    passed_step2: boolean;
    passed_step3: boolean;
    university: string | null;
  }[];

  // Founder / co-founder / CEO / CMO etc. - managed by admin at /admin/team.
  const { data: teamRows } = await supabase
    .from("team_members")
    .select("id, name, role, bio, image_url")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const team = (teamRows ?? []) as {
    id: string;
    name: string;
    role: string;
    bio: string | null;
    image_url: string | null;
  }[];

  return (
    <>
      <HomeIntroAnimation />
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
        {/* whitespace-nowrap + shrink-0 on both buttons - on a narrow phone
            (~375px and below) this row (logo + Log In + Apply for
            Mentorship) is tighter than all three items' natural width, and
            with every flex child free to shrink by default, the two
            buttons were shrinking below their own text's width, wrapping
            "Log In" into "Log"/"In" on two lines and "Apply for
            Mentorship" into an oddly broken two-line pill. shrink-0 here
            means the logo (still free to shrink/wrap) absorbs that
            squeeze instead - a much less prominent place for it to show up
            than the two primary buttons in the header. */}
        <div className="flex items-center gap-3">
          <Link
            href="/mentor/login"
            className="text-sm font-semibold text-slate-400 hover:text-slate-200 hidden sm:inline whitespace-nowrap"
          >
            Mentor Login
          </Link>
          <Link href="/login" className="btn-secondary whitespace-nowrap shrink-0">Log In</Link>
          <Link href="/signup" className="btn-primary whitespace-nowrap shrink-0">Apply for Mentorship</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto w-full px-6 pt-14 pb-10 text-center">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-slate-100 leading-[1.05] mb-6">
          You don&apos;t have to figure out USMLE Step 1 alone.
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Get the right mentor. Build the right plan. Stay accountable. Keep improving.
        </p>
        <div className="flex gap-4 justify-center flex-wrap mb-8">
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Find Your Mentor
          </Link>
          <a href="#how-it-works" className="btn-secondary text-base px-7 py-3.5">
            Explore Master Grid
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs sm:text-sm font-semibold text-slate-400">
          {HERO_PATHWAY.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <span className="bg-brand-900/10 text-brand-400 rounded-full px-3 py-1">{step}</span>
              {i < HERO_PATHWAY.length - 1 && <span className="text-slate-600">&rarr;</span>}
            </span>
          ))}
        </div>
      </section>

      {/* Apply banner */}
      <section id="apply" className="max-w-3xl mx-auto w-full px-6 pb-20 scroll-mt-20">
        <div className="card text-center border-brand-500/50">
          <h2 className="text-2xl md:text-3xl font-extrabold mb-3">
            Structured Mentorship, Built Around You
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-6">
            Get full access to one-on-one mentorship, structured planning, and performance tracking,
            with a dedicated mentor guiding you from enrollment through exam day.
          </p>
          <Link href="/signup" className="btn-primary text-base px-7 py-3.5">
            Apply for Mentorship
          </Link>
        </div>
      </section>

      {/* What your mentor does - everything a student gets, in one place */}
      <section id="mentor-duties" className="max-w-5xl mx-auto w-full px-6 py-20 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
          What Your Mentor Does
        </h2>
        <p className="text-slate-400 text-center text-lg max-w-2xl mx-auto mb-12">
          Each student is paired with a dedicated mentor who reviews their performance data in advance of every
          session and works through the same set of duties with every student.
        </p>

        <div className="grid sm:grid-cols-2 gap-6 mb-12">
          {MENTOR_DUTIES.map((group) => (
            <div key={group.title} className="card">
              <div className="flex items-center gap-3 mb-4">
                <span className="shrink-0 w-9 h-9 rounded-full bg-brand-900/50 text-brand-300 font-extrabold flex items-center justify-center text-sm">
                  {group.icon}
                </span>
                <h3 className="font-bold text-lg">{group.title}</h3>
              </div>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-200">
                    <span className="text-brand-400 shrink-0">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="card border-brand-500/50">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-4 text-center">
            Every week, for every student
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MENTOR_WEEKLY.map((w) => (
              <div key={w.title}>
                <p className="font-bold text-sm mb-1">{w.title}</p>
                <p className="text-xs text-slate-400">{w.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 text-center mt-6">
            Email your NBME score reports to the Master Grid team and they are added to your analysis
            within 24 hours.
          </p>
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

      {/* Numbers */}
      <section className="max-w-4xl mx-auto w-full px-6 py-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Meet the team (managed by admin at /admin/team) */}
      {team.length > 0 && (
        <section id="team" className="max-w-5xl mx-auto w-full px-6 py-20 scroll-mt-20">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-3">
            Meet the Team
          </h2>
          <p className="text-slate-400 text-center text-lg mb-12">The people behind Master Grid.</p>
          <div className="flex flex-wrap justify-center gap-6">
            {team.map((m) => (
              <div key={m.id} className="card text-center w-full sm:w-64 flex flex-col items-center">
                {m.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.image_url}
                    alt={m.name}
                    className="w-28 h-28 rounded-full object-cover mb-4 border border-slate-700"
                  />
                ) : (
                  <span className="w-28 h-28 rounded-full bg-brand-900/50 text-brand-300 text-3xl font-bold flex items-center justify-center mb-4">
                    {m.name.charAt(0)}
                  </span>
                )}
                <p className="font-bold text-base">{m.name}</p>
                <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mt-1">{m.role}</p>
                {m.bio && <p className="text-sm text-slate-400 mt-3">{m.bio}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Testimonials (managed by admin at /admin/testimonials) */}
      {testimonials.length > 0 && (
        <section className="max-w-5xl mx-auto w-full px-6 py-20">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center mb-12">
            What Our Students Say
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.id} className="card flex flex-col items-center text-center">
                {t.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.image_url}
                    alt={t.name}
                    className="w-24 h-24 rounded-full object-cover mb-3 border border-slate-700"
                  />
                ) : (
                  <span className="w-24 h-24 rounded-full bg-brand-900/50 text-brand-300 text-2xl font-bold flex items-center justify-center mb-3">
                    {t.name.charAt(0)}
                  </span>
                )}
                <p className="font-bold text-base">{t.name}</p>
                {t.passed_step1 && <p className="text-sm font-semibold text-green-600 mt-0.5">Passed Step 1</p>}
                {t.passed_step2 && <p className="text-sm font-semibold text-green-600 mt-0.5">Passed Step 2</p>}
                {t.passed_step3 && <p className="text-sm font-semibold text-green-600 mt-0.5">Passed Step 3</p>}
                {t.university && <p className="text-sm font-bold text-slate-200 mt-1">{t.university}</p>}
                {t.info && <p className="text-xs text-slate-500 mt-0.5">{t.info}</p>}
                <p className="text-sm text-slate-300 mt-4 text-left">&ldquo;{t.comment}&rdquo;</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto w-full px-6 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
          A Limited Number of Places Are Available
        </h2>
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
    </>
  );
}
