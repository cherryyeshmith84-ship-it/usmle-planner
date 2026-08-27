"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cinematic opening sequence for the logged-out homepage - plays once per
 * browser session (sessionStorage, not localStorage, so it replays on a
 * genuinely new visit tomorrow but not on every page navigation today),
 * then unmounts itself and reveals the real homepage (app/page.tsx) which
 * is already rendered underneath it the whole time - this is a fixed,
 * full-viewport OVERLAY, never a replacement for the actual page markup,
 * so nothing about the real hero/sections/routes changes if this fails to
 * mount, errors, or is skipped.
 *
 * Deliberately built with plain CSS (a scoped <style> block below, no
 * animation library) and zero image/video assets - just text, borders, and
 * the same .card/.btn-primary/text-slate/text-brand tokens already
 * used throughout app/page.tsx, so it matches the site's actual light
 * cyan theme (see the color-reversal comment in tailwind.config.ts) rather
 * than introducing an unrelated dark theme that would clash with the real
 * homepage the instant this overlay disappears.
 *
 * Respects prefers-reduced-motion by skipping straight to the real
 * homepage (no partial/half animation) and always offers a manual Skip
 * button. Every timer is cleared on unmount/skip so nothing fires after
 * the component is gone.
 */

const SESSION_KEY = "mg_intro_seen_v1";

const RESOURCES = ["First Aid", "UWorld", "NBME", "Anki", "AMBOSS", "Sketchy", "Notes", "Calendar"];

const WORRIES = [
  "Where do I start?",
  "Which resources should I use?",
  "When should I take Step 1?",
  "Why isn't my score improving?",
  "Am I studying correctly?",
];

const PATHWAY_LONG = ["Assess", "Plan", "Execute", "Analyze", "Adjust", "Succeed"];

const MENTOR_QUESTIONS = [
  "What's your current score?",
  "What are your weakest subjects?",
  "What resources are you currently using?",
  "How much time do you have?",
  "When are you planning to take the exam?",
];

const WEEK1_TASKS = [
  "40 UWorld questions/day",
  "Review incorrect questions",
  "First Aid targeted review",
  "Weak-topic revision",
  "Mentor check-in",
];

const DASHBOARD_STATS = [
  { label: "Questions", value: "40 / 40 ✓" },
  { label: "Study Plan", value: "5 / 5 ✓" },
  { label: "Weak Areas", value: "Cardiology ↓" },
  { label: "Mentor Check-in", value: "Completed ✓" },
  { label: "Weekly Goal", value: "92% ✓" },
];

const NBME_SCORES = [62, 66, 70, 74];

// Roughly matches the ~20-25s target from the brief, scene by scene.
const SCENE_DURATIONS_MS = [4500, 2800, 2400, 3000, 3000, 3000, 2000, 1600, 1500, 2200];
const TOTAL_SCENES = SCENE_DURATIONS_MS.length;

function MentorCard({ name, tag, selected }: { name: string; tag: string; selected?: boolean }) {
  return (
    <div
      className={`card py-4 px-4 transition ${selected ? "border-brand-500/70 ring-2 ring-brand-400" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-8 h-8 rounded-full bg-brand-900/40 text-brand-400 text-xs font-bold flex items-center justify-center shrink-0">
          {name
            .split(" ")
            .map((p) => p[0])
            .join("")}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{name}</p>
          <p className="text-[11px] text-slate-500 truncate">MD &middot; USMLE Step 1 mentor</p>
        </div>
        {selected && (
          <span className="ml-auto text-[10px] font-semibold text-brand-400 shrink-0 mg-anim-fadeup">
            Selected ✓
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-1">Focus: {tag}</p>
      <p className="text-[11px] text-slate-500">Available this week &middot; 1-on-1 style</p>
    </div>
  );
}

export default function HomeIntroAnimation() {
  const [phase, setPhase] = useState<"checking" | "playing" | "done">("checking");
  const [scene, setScene] = useState(0);
  const [subPhase, setSubPhase] = useState(0);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearAllTimers() {
    for (const t of timeouts.current) clearTimeout(t);
    timeouts.current = [];
  }

  function finish() {
    clearAllTimers();
    setPhase("done");
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private-browsing/storage-blocked - fine, it just replays next time.
    }
  }

  useEffect(() => {
    let alreadySeen = false;
    let reducedMotion = false;
    try {
      alreadySeen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      alreadySeen = false;
    }
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reducedMotion = false;
    }

    if (alreadySeen || reducedMotion) {
      setPhase("done");
      return;
    }

    setPhase("playing");

    let elapsed = 0;
    SCENE_DURATIONS_MS.forEach((duration, i) => {
      elapsed += duration;
      if (i === SCENE_DURATIONS_MS.length - 1) {
        timeouts.current.push(setTimeout(finish, elapsed));
      } else {
        timeouts.current.push(
          setTimeout(() => {
            setScene(i + 1);
            setSubPhase(0);
          }, elapsed)
        );
      }
    });

    return clearAllTimers;
    // Intentionally run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Two scenes (Exam Day -> PASS) use a mid-scene "sub phase" flip for the
  // fade-to-black / black-to-light beats - a plain internal timer keyed to
  // whichever scene is currently showing.
  useEffect(() => {
    if (phase !== "playing") return;
    if (scene === 8) {
      const t = setTimeout(() => setSubPhase(1), 750);
      timeouts.current.push(t);
    }
    if (scene === 9) {
      const t = setTimeout(() => setSubPhase(1), 1100);
      timeouts.current.push(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, phase]);

  if (phase !== "playing") return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center p-4 sm:p-8 overflow-hidden">
      <style>{`
        @keyframes mgFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mgPop { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes mgFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .mg-anim-fadeup { animation: mgFadeUp 0.6s ease-out both; }
        .mg-anim-pop { animation: mgPop 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .mg-anim-float { animation: mgFloat 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .mg-anim-fadeup, .mg-anim-pop, .mg-anim-float { animation: none !important; }
        }
      `}</style>

      {/* Progress bar - subtle, top edge, purely decorative. */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-brand-900/20">
        <div
          className="h-full bg-brand-400 transition-all ease-linear"
          style={{
            width: `${((scene + 1) / TOTAL_SCENES) * 100}%`,
            transitionDuration: `${SCENE_DURATIONS_MS[scene]}ms`,
          }}
        />
      </div>

      <button
        type="button"
        onClick={finish}
        className="absolute top-4 right-4 z-10 text-xs font-semibold text-slate-500 hover:text-slate-300 bg-white/80 backdrop-blur rounded-full px-3 py-1.5 border border-cyan-100"
      >
        Skip Animation
      </button>

      <div className="w-full max-w-2xl">
        {/* Scene 0 - The problem: a cluttered "desk" of resources and worries. */}
        {scene === 0 && (
          <div key={scene} className="mg-anim-fadeup text-center">
            <div className="card relative py-10 px-6 overflow-visible">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-6">
                Studying alone, at 11pm
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-2">
                {RESOURCES.map((r, i) => (
                  <span
                    key={r}
                    className="mg-anim-pop text-xs font-semibold text-slate-300 bg-brand-900/10 border border-cyan-100 rounded-full px-3 py-1"
                    style={{ animationDelay: `${i * 220}ms` }}
                  >
                    {r}
                  </span>
                ))}
              </div>
              {WORRIES.map((w, i) => (
                <p
                  key={w}
                  className="mg-anim-fadeup mg-anim-float text-[11px] sm:text-xs text-slate-500 italic mt-3"
                  style={{ animationDelay: `${1600 + i * 480}ms` }}
                >
                  &ldquo;{w}&rdquo;
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Scene 1 - Freeze, then the reframe. */}
        {scene === 1 && (
          <div key={scene} className="mg-anim-fadeup text-center space-y-2">
            <p className="text-lg sm:text-xl font-semibold text-slate-100">Too many resources.</p>
            <p className="text-lg sm:text-xl font-semibold text-slate-100">Too many decisions.</p>
            <p className="text-lg sm:text-xl font-semibold text-slate-100 mb-6">No clear plan.</p>
            <p
              className="mg-anim-fadeup text-base sm:text-lg text-brand-400 font-semibold"
              style={{ animationDelay: "1400ms" }}
            >
              What if you didn&apos;t have to figure it out alone?
            </p>
          </div>
        )}

        {/* Scene 2 - Master Grid appears, then the pathway. */}
        {scene === 2 && (
          <div key={scene} className="mg-anim-pop text-center">
            <p className="font-extrabold text-3xl sm:text-4xl tracking-tight text-slate-100 mb-2">
              Master<span className="text-brand-400">Grid</span>
            </p>
            <p className="text-sm sm:text-base text-slate-500 mb-6">Your USMLE journey, organized.</p>
            <div
              className="mg-anim-fadeup flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs sm:text-sm font-semibold text-slate-300"
              style={{ animationDelay: "500ms" }}
            >
              {PATHWAY_LONG.map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="bg-brand-900/20 text-brand-400 rounded-full px-3 py-1">{step}</span>
                  {i < PATHWAY_LONG.length - 1 && <span className="text-slate-600">&rarr;</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Scene 3 - Find your mentor. */}
        {scene === 3 && (
          <div key={scene} className="mg-anim-fadeup">
            <p className="text-center text-xs font-semibold text-brand-400 uppercase tracking-wide mb-4">
              Find a Mentor
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="mg-anim-pop" style={{ animationDelay: "150ms" }}>
                <MentorCard name="Dr. A. Rao" tag="Cardiology &amp; Renal" />
              </div>
              <div className="mg-anim-pop" style={{ animationDelay: "350ms" }}>
                <MentorCard name="Dr. S. Kim" tag="Neuro &amp; Behavioral Science" selected />
              </div>
              <div className="mg-anim-pop" style={{ animationDelay: "550ms" }}>
                <MentorCard name="Dr. J. Patel" tag="Pharm &amp; Micro" />
              </div>
            </div>
            <p
              className="mg-anim-fadeup text-center text-sm text-slate-500"
              style={{ animationDelay: "900ms" }}
            >
              Find someone who understands where you are - and where you need to go.
            </p>
          </div>
        )}

        {/* Scene 4 - The mentor meeting. */}
        {scene === 4 && (
          <div key={scene} className="mg-anim-fadeup">
            <div className="card py-6 px-6 mb-4">
              <div className="flex items-center justify-center gap-6 mb-5">
                <span className="w-12 h-12 rounded-full bg-brand-900/40 text-brand-400 text-sm font-bold flex items-center justify-center">
                  SK
                </span>
                <span className="text-[11px] text-slate-500">live session</span>
                <span className="w-12 h-12 rounded-full bg-cyan-100 text-slate-400 text-sm font-bold flex items-center justify-center">
                  You
                </span>
              </div>
              <div className="space-y-2 max-w-sm mx-auto">
                {MENTOR_QUESTIONS.map((q, i) => (
                  <p
                    key={q}
                    className="mg-anim-fadeup text-xs sm:text-sm text-slate-300"
                    style={{ animationDelay: `${i * 420}ms` }}
                  >
                    <span className="text-brand-400 font-semibold">Mentor:</span> {q}
                  </p>
                ))}
              </div>
            </div>
            <p
              className="mg-anim-fadeup text-center text-sm text-slate-500"
              style={{ animationDelay: "2200ms" }}
            >
              Your preparation shouldn&apos;t look like everyone else&apos;s.
            </p>
          </div>
        )}

        {/* Scene 5 - The personalized plan builds itself. */}
        {scene === 5 && (
          <div key={scene} className="mg-anim-fadeup">
            <div className="card py-5 px-5 mb-4">
              <p className="text-xs font-bold text-brand-400 uppercase tracking-wide mb-2">
                Week 1 &middot; Cardiology
              </p>
              <ul className="space-y-1.5 mb-4">
                {WEEK1_TASKS.map((t, i) => (
                  <li
                    key={t}
                    className="mg-anim-fadeup text-xs sm:text-sm text-slate-300 flex items-center gap-2"
                    style={{ animationDelay: `${i * 260}ms` }}
                  >
                    <span className="text-green-500 shrink-0">&#10003;</span>
                    {t}
                  </li>
                ))}
              </ul>
              <div
                className="mg-anim-fadeup grid sm:grid-cols-2 gap-3 pt-3 border-t border-cyan-100"
                style={{ animationDelay: "1400ms" }}
              >
                <div>
                  <p className="text-xs font-bold text-brand-400 uppercase tracking-wide mb-1">
                    Week 2 &middot; Neurology
                  </p>
                  <p className="text-[11px] text-slate-500">50 questions/day &middot; Error-note review</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-brand-400 uppercase tracking-wide mb-1">
                    Week 3 &middot; Assessment
                  </p>
                  <p className="text-[11px] text-slate-500">NBME &middot; Identify weak systems</p>
                </div>
              </div>
            </div>
            <p
              className="mg-anim-fadeup text-center text-sm text-slate-500"
              style={{ animationDelay: "1800ms" }}
            >
              Know exactly what to do today.
            </p>
          </div>
        )}

        {/* Scene 6 - Following the plan, day by day. */}
        {scene === 6 && (
          <div key={scene} className="mg-anim-fadeup">
            <p className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Today&apos;s Progress
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {DASHBOARD_STATS.map((s, i) => (
                <div
                  key={s.label}
                  className="mg-anim-pop card py-3 px-3 text-center"
                  style={{ animationDelay: `${i * 180}ms` }}
                >
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
                  <p className="text-sm font-bold text-slate-100">{s.value}</p>
                </div>
              ))}
            </div>
            <p
              className="mg-anim-fadeup text-center text-sm text-slate-500"
              style={{ animationDelay: "1100ms" }}
            >
              A plan is powerful when you actually follow it.
            </p>
          </div>
        )}

        {/* Scene 7 - Measurable progress over time. */}
        {scene === 7 && (
          <div key={scene} className="mg-anim-fadeup text-center">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-5">
              NBME progress
            </p>
            <div className="flex items-end justify-center gap-4 h-24 mb-5">
              {NBME_SCORES.map((score, i) => (
                <div key={score} className="flex flex-col items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-100">{score}</span>
                  <div
                    className="mg-anim-pop w-8 bg-brand-400 rounded-t-md"
                    style={{
                      height: `${(score - 55) * 4}px`,
                      animationDelay: `${i * 350}ms`,
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-500">Measure. Learn. Adjust. Improve.</p>
          </div>
        )}

        {/* Scene 8 - Exam day, fading to black. */}
        {scene === 8 && (
          <div key={scene} className="text-center">
            <div className={`mg-anim-fadeup transition-opacity duration-700 ${subPhase === 1 ? "opacity-0" : "opacity-100"}`}>
              <div className="card inline-block py-8 px-10 border-2">
                <p className="text-xl sm:text-2xl font-extrabold tracking-widest text-slate-100">
                  USMLE STEP 1
                </p>
              </div>
            </div>
            <div
              className={`fixed inset-0 bg-black transition-opacity duration-700 pointer-events-none ${
                subPhase === 1 ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        )}

        {/* Scene 9 - The result, then back to the real homepage. */}
        {scene === 9 && (
          <div key={scene} className="relative text-center">
            <div
              className={`fixed inset-0 bg-black transition-opacity duration-700 pointer-events-none ${
                subPhase === 1 ? "opacity-0" : "opacity-100"
              }`}
            />
            <div className="relative z-10">
              <p className="mg-anim-pop text-5xl sm:text-6xl font-extrabold tracking-tight text-green-500 mb-3">
                PASS
              </p>
              <p
                className={`mg-anim-fadeup text-sm sm:text-base font-medium mb-1 transition-colors duration-700 ${
                  subPhase === 1 ? "text-slate-500" : "text-white"
                }`}
                style={{ animationDelay: "500ms" }}
              >
                Stop guessing. Start following a plan.
              </p>
              <p
                className="mg-anim-fadeup text-xs sm:text-sm text-brand-400 font-semibold"
                style={{ animationDelay: "1300ms" }}
              >
                MASTER GRID - Your USMLE journey, organized.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
