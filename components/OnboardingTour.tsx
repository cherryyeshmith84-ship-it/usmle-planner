"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface TourStep {
  navHref: string;
  navLabel: string;
  title: string;
  body: string;
}

// Each step targets one real sidebar link (matched via NavBar.tsx's
// data-tour="<href>" attribute) - "Next" actually navigates there and
// spotlights it, instead of describing every page in one static wall of
// text while sitting on Home. Body copy was expanded from a one-line
// summary per step to actually walk through the real settings/options on
// that page (e.g. what each Study Planner day color means, what Settings'
// one field does) - written from what those pages actually contain, not a
// generic tour script, so it doubles as a real answer to the "why isn't my
// day green" / "how do I log a block" questions students otherwise ask
// their mentor.
const STEPS: TourStep[] = [
  {
    navHref: "/dashboard",
    navLabel: "Home",
    title: "Welcome to Master Grid",
    body:
      "This is your dashboard - what you'll see every time you log in. At the top: a countdown to your exam date, your current study streak, and whether today's plan is complete, in progress, or not started yet, plus a rough \"ahead of / behind schedule\" pace based on your last few weeks. Below that: a Status update box you can post to (your mentor sees it), today's Assignments, any note or \"important day\" flag your mentor left you, a snapshot of your weakest area from Analysis, and a weekly progress summary. Let's walk through the rest of the sidebar - about a minute, skip anytime.",
  },
  {
    navHref: "/planner",
    navLabel: "Study Planner",
    title: "Study Planner",
    body:
      "Click any day on the calendar to open it. You'll see the Assignments your mentor set for that day - check them off as you finish. You can also log Question Bank Blocks (pick the bank - UWorld, Amboss, or Mehlman - the system it covered, how many questions, and your score), plus any journal fields your mentor has turned on for you (Today's Biggest Issue, Resources Used, Student Notes). Day colors: blue is always today; green means every Assignment is checked AND every block you started logging AND every journal field your mentor turned on are all filled in; amber/yellow means partially done (some Assignments still unchecked, or a block/journal field left blank); red means the day was missed entirely; a light blue tint on a future day just means Assignments are already scheduled there. You can update any day, past or present, at any time - nothing locks.",
  },
  {
    navHref: "/qbank",
    navLabel: "Question Bank",
    title: "Question Bank",
    body:
      "Build a custom practice test from the question pool here - filter by whether you've seen a question before, by subject, or by organ system, then start the test. \"Previous tests\" at the top right shows every test you've already taken so you can review it again. This is separate from your real UWorld/Amboss/Mehlman question banks - whenever you finish a block in one of THOSE, log it back on your Study Planner calendar (previous step) and tag which system it covered - that's what builds the per-system breakdown you'll see next on Analysis.",
  },
  {
    navHref: "/history",
    navLabel: "Analysis",
    title: "Analysis",
    body:
      "Upload a screenshot or PDF of your NBME, UWSA, Free 120, or UWorld self-assessment results here - AI reads it automatically and fills in your score breakdown by system and discipline for you to review before saving, so you don't have to type it all in by hand. Once you've got a few reports in, you'll see your weakest systems and disciplines, how they're trending over time side-by-side across every report, and any study plan your mentor has written for you. Further down: your day-to-day question bank performance broken out by system and by bank (built from what you log in the Study Planner), and a read-only Systems & Disciplines checklist your mentor keeps updated on what's actually been covered.",
  },
  {
    navHref: "/mentorship",
    navLabel: "Mentorship",
    title: "Mentorship & booking a session",
    body:
      "Book one-on-one sessions with a mentor, message them directly, and see any Assignments or notes they've left you. To book: pick a mentor from the directory and choose an open time slot on their profile - it lands in Upcoming Sessions right away, with a meeting link once your mentor sets one. Already have a mentor and don't need to book through here? Link their email under Settings (next step) instead - that alone gives them access to your planner and analysis, no booking required.",
  },
  {
    navHref: "/settings",
    navLabel: "Settings",
    title: "You're all set",
    body:
      "Settings is short on purpose: your name, and \"Your mentor's email\" - type it in and save to give that mentor access to your planner, notes, and analysis immediately (leave it blank to remove access). Your email itself can't be changed here. There's also a Status update box, the same one that shows on your Home dashboard - post a quick note and your mentor sees it. That's everything to get started - you can always find these same sections in the sidebar. Good luck with your prep!",
  },
];

const STORAGE_STEP = "mg_tutorial_step";

/**
 * App-wide onboarding tour for students - shown once, right after
 * onboarding, and then every time they log in until they explicitly finish
 * or skip it. Persisted via profiles.tutorial_completed so it follows the
 * student across devices/sessions rather than resetting per-browser.
 *
 * Walks through the sidebar one real link at a time - spotlighting the
 * actual nav item (via NavBar.tsx's data-tour="<href>" attributes) and
 * navigating to that page - rather than a single static modal describing
 * every section while parked on Home. Step position is kept in
 * localStorage (STORAGE_STEP) purely so it survives the full page
 * navigation each "Next" triggers (this component remounts fresh on every
 * page load, same as the rest of AppShell) - profiles.tutorial_completed
 * remains the only durable, cross-device source of truth for whether the
 * tour has been finished or skipped at all. One-time only by design - no
 * "replay tutorial" control anywhere in the app; the only way to see it
 * again is to manually clear tutorial_completed for that profile.
 *
 * Mounted once in AppShell.tsx (so every page gets it automatically, no
 * per-page plumbing needed) and resolves whether to show itself entirely
 * client-side - same pattern as NavBar's mentor check: a page-level Server
 * Component prop would mean touching every single page that renders
 * AppShell, so instead this component fetches its own small bit of state on
 * mount via the browser Supabase client.
 *
 * Never shown to mentors or admins (the content is written from a
 * student's point of view - "book a session", "log your blocks" - none of
 * that applies to how a mentor uses the app) or before onboarding itself is
 * complete (that's its own separate flow, this isn't a substitute for it).
 */
export default function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("tutorial_completed, is_admin, onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile || cancelled) return;
      if (profile.is_admin || !profile.onboarding_completed || profile.tutorial_completed) return;

      const { data: mentors } = await supabase.from("mentors").select("email").eq("active", true);
      const isMentor = (mentors ?? []).some(
        (m: { email: string }) => m.email.toLowerCase() === (user.email ?? "").toLowerCase()
      );
      if (isMentor || cancelled) return;

      setUserId(user.id);
      const saved = Number(localStorage.getItem(STORAGE_STEP) ?? "0");
      setStepIndex(Number.isFinite(saved) && saved >= 0 && saved < STEPS.length ? saved : 0);
      setVisible(true);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // Track the current step's sidebar link position so the spotlight follows
  // it - re-measured on step change, page change, and window resize.
  useEffect(() => {
    if (!visible) return;
    function measure() {
      const step = STEPS[stepIndex];
      const el = document.querySelector(`[data-tour="${step.navHref}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
    }
    measure();
    const t = setTimeout(measure, 50); // covers late layout/font shifts on first paint
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, [visible, stepIndex, pathname]);

  const finish = useCallback(async () => {
    setSaving(true);
    setVisible(false);
    localStorage.removeItem(STORAGE_STEP);
    if (userId) {
      const supabase = createClient();
      await supabase.from("profiles").update({ tutorial_completed: true }).eq("id", userId);
    }
    setSaving(false);
  }, [userId]);

  function goToStep(nextIndex: number) {
    setStepIndex(nextIndex);
    localStorage.setItem(STORAGE_STEP, String(nextIndex));
    const step = STEPS[nextIndex];
    if (pathname !== step.navHref) router.push(step.navHref);
  }

  function next() {
    if (stepIndex >= STEPS.length - 1) finish();
    else goToStep(stepIndex + 1);
  }

  function back() {
    if (stepIndex > 0) goToStep(stepIndex - 1);
  }

  if (!visible) return null;

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const pad = 6;
  const cut = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipTop = cut ? Math.min(Math.max(cut.top, 12), viewportH - 260) : 0;

  return (
    <>
      {/* Spotlight cutout - four dark rectangles boxing in the target link
          instead of one full-screen backdrop, so the highlighted sidebar
          item stays fully visible and undimmed. Falls back to a plain
          full-screen backdrop + centered card if the target couldn't be
          found (e.g. its nav group is currently gated by the content
          publish switch). */}
      {cut ? (
        <>
          <div className="fixed z-40 bg-black/50" style={{ top: 0, left: 0, right: 0, height: Math.max(cut.top, 0) }} />
          <div className="fixed z-40 bg-black/50" style={{ top: cut.top + cut.height, left: 0, right: 0, bottom: 0 }} />
          <div
            className="fixed z-40 bg-black/50"
            style={{ top: cut.top, left: 0, width: Math.max(cut.left, 0), height: cut.height }}
          />
          <div
            className="fixed z-40 bg-black/50"
            style={{ top: cut.top, left: cut.left + cut.width, right: 0, height: cut.height }}
          />
          <div
            className="fixed z-40 rounded-lg ring-2 ring-brand-400 pointer-events-none"
            style={{ top: cut.top, left: cut.left, width: cut.width, height: cut.height }}
          />
        </>
      ) : (
        <div className="fixed inset-0 z-40 bg-black/50" />
      )}

      <div
        className="fixed z-50 card w-[calc(100vw-2rem)] sm:w-96"
        style={
          cut
            ? { top: tooltipTop, left: cut.left + cut.width + 12 }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        <button
          type="button"
          onClick={finish}
          disabled={saving}
          className="absolute top-3 right-3 text-xs text-slate-500 hover:text-slate-300"
        >
          Skip tutorial
        </button>
        <p className="text-[11px] font-semibold text-brand-400 uppercase tracking-wide mb-1">
          Step {stepIndex + 1} of {STEPS.length} &middot; {step.navLabel}
        </p>
        <h2 className="text-base font-bold mb-2 pr-16">{step.title}</h2>
        <p className="text-sm text-slate-300 leading-relaxed mb-5">{step.body}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === stepIndex ? "bg-brand-400" : "bg-slate-800"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button type="button" onClick={back} className="btn-secondary text-xs">
                Back
              </button>
            )}
            <button type="button" onClick={next} disabled={saving} className="btn-primary text-xs">
              {isLast ? (saving ? "Finishing..." : "Done") : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
