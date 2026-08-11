"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Step {
  emoji: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    emoji: "👋",
    title: "Welcome to Master Grid",
    body:
      "This is a quick tour of where everything lives - takes under a minute. Skip it anytime with the link in the corner, and it won't show up again once you're done or skip.",
  },
  {
    emoji: "🏠",
    title: "Home",
    body:
      "Your dashboard - today's plan at a glance, your streak, pace vs. your mentor's schedule, and quick links into everything else. This is what you'll land on every time you log in.",
  },
  {
    emoji: "📅",
    title: "Study Planner",
    body:
      "The calendar under Mentorship is where your actual day-to-day plan lives. Click any day - past, present, or future - to see your Assignments, check them off, log Question Bank blocks, and jot your mood, notes, or reflection.",
  },
  {
    emoji: "📚",
    title: "Question Bank",
    body:
      "Practice questions live under Learn. When you log a real block from UWorld, Amboss, or Mehlman, tag it with the system it covered on the Study Planner calendar - that's what powers your per-system breakdown on Analysis.",
  },
  {
    emoji: "📊",
    title: "Analysis",
    body:
      "Upload your NBME/UWSA/Free 120 score reports here to see your weakest systems and disciplines over time, plus a breakdown of your question bank performance by system and by bank.",
  },
  {
    emoji: "🎓",
    title: "Mentorship",
    body:
      "Book sessions with a mentor, message them directly, and see any Assignments or notes they've left you. If you already have a mentor, link their email under Settings so they can see your progress right away.",
  },
  {
    emoji: "⚙️",
    title: "You're set",
    body:
      "That's everything. You can always find your way back to any of this from the sidebar. Good luck with your prep!",
  },
];

/**
 * First-run product tour for students - shows once on the Home dashboard
 * (app/dashboard/page.tsx) for anyone who hasn't finished or skipped it yet
 * (profiles.tutorial_completed), then never again. Deliberately a plain
 * centered modal rather than a spotlight/pointer tour targeting real sidebar
 * elements - no tour library is installed anywhere in this app, and
 * anchoring popovers to live DOM elements across every screen size would be
 * a much bigger, more fragile build for what's meant to be a quick, skippable
 * orientation rather than an interactive walkthrough.
 *
 * "Skip" and finishing the last step do the exact same thing (mark
 * complete) - there's no partial-progress state to resume, since re-opening
 * a half-seen tour later isn't something students asked for here.
 */
export default function TutorialOverlay({
  userId,
  initialCompleted,
}: {
  userId: string;
  initialCompleted: boolean;
}) {
  const [dismissed, setDismissed] = useState(initialCompleted);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  if (dismissed) return null;

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  async function markComplete() {
    setSaving(true);
    setDismissed(true); // optimistic - don't make the student wait on the network to move on
    const supabase = createClient();
    await supabase.from("profiles").update({ tutorial_completed: true }).eq("id", userId);
    setSaving(false);
  }

  function next() {
    if (isLast) {
      markComplete();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="card max-w-md w-full relative">
        <button
          type="button"
          onClick={markComplete}
          disabled={saving}
          className="absolute top-4 right-4 text-xs text-slate-500 hover:text-slate-300"
        >
          Skip tutorial
        </button>

        <div className="text-4xl mb-3">{step.emoji}</div>
        <h2 className="text-lg font-bold mb-2">{step.title}</h2>
        <p className="text-sm text-slate-300 leading-relaxed mb-6">{step.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${i === stepIndex ? "bg-brand-400" : "bg-slate-800"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button type="button" onClick={back} className="btn-secondary text-xs">
                Back
              </button>
            )}
            <button type="button" onClick={next} disabled={saving} className="btn-primary text-xs">
              {isLast ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
