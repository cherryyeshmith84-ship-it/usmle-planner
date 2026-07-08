"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ExamTrack, PrepStage, Profile } from "@/lib/types";

const RESOURCE_OPTIONS = [
  "UWorld",
  "Sketchy Micro",
  "Sketchy Pharm",
  "Boards & Beyond",
  "Pathoma",
  "Anki (AnKing deck)",
  "First Aid",
  "NBME/UWSA practice exams",
  "Amboss",
];

export default function OnboardingForm({
  initialProfile,
  userId,
}: {
  initialProfile: Profile | null;
  userId: string;
}) {
  const router = useRouter();

  const [track, setTrack] = useState<ExamTrack | "">(initialProfile?.exam_track ?? "");
  const [prepStage, setPrepStage] = useState<PrepStage | "">(initialProfile?.prep_stage ?? "");
  const [examDate, setExamDate] = useState(initialProfile?.exam_date ?? "");
  const [hourGoal, setHourGoal] = useState(initialProfile?.daily_hour_goal?.toString() ?? "8");
  const [resources, setResources] = useState<string[]>(initialProfile?.resources ?? []);
  const [customResource, setCustomResource] = useState("");
  const [subjectName, setSubjectName] = useState(initialProfile?.subject_name ?? "");
  const [completedSoFar, setCompletedSoFar] = useState(initialProfile?.completed_so_far ?? "");
  const [weakAreas, setWeakAreas] = useState(initialProfile?.weak_areas ?? "");
  const [strongAreas, setStrongAreas] = useState(initialProfile?.strong_areas ?? "");
  const [goalsNotes, setGoalsNotes] = useState(initialProfile?.goals_notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleResource(r: string) {
    setResources((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  const needsMoreDetail = track === "step1" && (prepStage === "middle" || prepStage === "end");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!track) {
      setError("Please choose Step 1 or Subject exams.");
      return;
    }
    if (track === "step1" && !prepStage) {
      setError("Please choose where you are in your Step 1 prep.");
      return;
    }
    if (track === "subject" && !subjectName.trim()) {
      setError("Please tell us which subject you're preparing for.");
      return;
    }

    setLoading(true);
    setError(null);

    const finalResources = customResource.trim()
      ? [...resources, customResource.trim()]
      : resources;

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_completed: true,
        exam_track: track,
        prep_stage: track === "step1" ? prepStage : null,
        subject_name: track === "subject" ? subjectName.trim() : null,
        exam_date: examDate || null,
        daily_hour_goal: hourGoal ? Number(hourGoal) : null,
        resources: finalResources,
        completed_so_far: needsMoreDetail ? completedSoFar || null : null,
        weak_areas: needsMoreDetail ? weakAreas || null : null,
        strong_areas: needsMoreDetail ? strongAreas || null : null,
        goals_notes: needsMoreDetail ? goalsNotes || null : null,
      })
      .eq("id", userId);

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    // Let the coach know a new (or updated) intake is ready to review, without
    // auto-generating any plan - she assigns one herself once she's seen this.
    const summaryLines = [
      `Completed onboarding: ${track === "step1" ? "Step 1 (CBSE)" : `Subject exams - ${subjectName.trim()}`}`,
      track === "step1" && prepStage ? `Stage: ${prepStage}` : "",
      examDate ? `Exam date: ${examDate}` : "",
      hourGoal ? `Target hours/day: ${hourGoal}` : "",
      needsMoreDetail && completedSoFar ? `Completed so far: ${completedSoFar}` : "",
      needsMoreDetail && strongAreas ? `Strong in: ${strongAreas}` : "",
      needsMoreDetail && weakAreas ? `Struggling with: ${weakAreas}` : "",
      needsMoreDetail && goalsNotes ? `Goals: ${goalsNotes}` : "",
      "Please assign me a plan when you get a chance!",
    ].filter(Boolean);

    await supabase.from("messages").insert({
      student_id: userId,
      sender: "student",
      body: summaryLines.join("\n"),
    });

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl w-full">
      <h1 className="text-xl font-bold mb-1">Tell us about your prep</h1>
      <p className="text-sm text-slate-300 mb-6">
        This tells your coach what kind of plan to build for you. She reviews
        this herself and assigns your plan personally &mdash; you&apos;ll see
        it appear on your dashboard once it&apos;s ready.
      </p>

      <label className="label">What are you preparing for?</label>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          type="button"
          onClick={() => setTrack("step1")}
          className={`rounded-xl border px-3 py-4 text-sm font-semibold text-center transition ${
            track === "step1"
              ? "border-brand-400 bg-brand-900/40 text-brand-300"
              : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
          }`}
        >
          Step 1 (CBSE)
        </button>
        <button
          type="button"
          onClick={() => setTrack("subject")}
          className={`rounded-xl border px-3 py-4 text-sm font-semibold text-center transition ${
            track === "subject"
              ? "border-brand-400 bg-brand-900/40 text-brand-300"
              : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
          }`}
        >
          Subject exams
        </button>
      </div>

      {track === "step1" && (
        <>
          <label className="label">Where are you in your Step 1 prep?</label>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {(
              [
                { v: "beginning", l: "Just starting" },
                { v: "middle", l: "In the middle" },
                { v: "end", l: "Final stretch" },
              ] as { v: PrepStage; l: string }[]
            ).map((opt) => (
              <button
                type="button"
                key={opt.v}
                onClick={() => setPrepStage(opt.v)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold text-center transition ${
                  prepStage === opt.v
                    ? "border-brand-400 bg-brand-900/40 text-brand-300"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>

          {needsMoreDetail && (
            <div className="mb-5 space-y-4 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400">
                Since you're not just starting out, a few more details help your
                coach build the right plan for exactly where you are.
              </p>
              <div>
                <label className="label">What have you completed so far?</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. finished First Aid read-through once, halfway through UWorld first pass"
                  value={completedSoFar}
                  onChange={(e) => setCompletedSoFar(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Which systems/topics are you strong in?</label>
                <input
                  className="input"
                  placeholder="e.g. cardio, renal"
                  value={strongAreas}
                  onChange={(e) => setStrongAreas(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Which systems/topics are you struggling with?</label>
                <input
                  className="input"
                  placeholder="e.g. biochem, immunology"
                  value={weakAreas}
                  onChange={(e) => setWeakAreas(e.target.value)}
                />
              </div>
              <div>
                <label className="label">
                  What do you want to master, get confident in, or need suggestions on?
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. want to get faster at UWorld blocks, need an Anki pacing plan"
                  value={goalsNotes}
                  onChange={(e) => setGoalsNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </>
      )}

      {track === "subject" && (
        <>
          <label className="label">Which subject are you preparing for?</label>
          <input
            className="input mb-5"
            placeholder="e.g. Internal Medicine, Surgery, Pediatrics"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
          />
        </>
      )}

      {track && (
        <>
          <label className="label">When is (or was) your exam date?</label>
          <input
            type="date"
            className="input mb-5"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
          />

          <label className="label">Target study hours per day</label>
          <input
            type="number"
            min={1}
            max={16}
            step={0.5}
            className="input mb-5"
            value={hourGoal}
            onChange={(e) => setHourGoal(e.target.value)}
          />
        </>
      )}

      {track === "step1" && (
        <>
          <label className="label">Which resources do you use / prefer?</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {RESOURCE_OPTIONS.map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => toggleResource(r)}
                className={`text-sm rounded-full px-3 py-1.5 border transition ${
                  resources.includes(r)
                    ? "border-brand-400 bg-brand-900/40 text-brand-300"
                    : "border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            className="input mb-6"
            placeholder="Other resource (optional)"
            value={customResource}
            onChange={(e) => setCustomResource(e.target.value)}
          />
        </>
      )}

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <button className="btn-primary w-full" disabled={loading || !track}>
        {loading ? "Saving..." : "Go to my dashboard"}
      </button>
    </form>
  );
}
