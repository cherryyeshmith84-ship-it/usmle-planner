"use client";

import { useState } from "react";
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

export default function SettingsForm({
  profile,
  userId,
  email,
}: {
  profile: Profile;
  userId: string;
  email: string;
}) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const originalTrack: ExamTrack = profile.exam_track ?? "step1";
  const [track, setTrack] = useState<ExamTrack>(originalTrack);
  const [subjectName, setSubjectName] = useState(profile.subject_name ?? "");
  const [prepStage, setPrepStage] = useState<PrepStage | "">(profile.prep_stage ?? "");
  const [examDate, setExamDate] = useState(profile.exam_date ?? "");
  const [hourGoal, setHourGoal] = useState(profile.daily_hour_goal?.toString() ?? "");
  const [resources, setResources] = useState<string[]>(profile.resources ?? []);
  const [customResource, setCustomResource] = useState("");
  const [completedSoFar, setCompletedSoFar] = useState(profile.completed_so_far ?? "");
  const [strongAreas, setStrongAreas] = useState(profile.strong_areas ?? "");
  const [weakAreas, setWeakAreas] = useState(profile.weak_areas ?? "");
  const [goalsNotes, setGoalsNotes] = useState(profile.goals_notes ?? "");
  const [aiInstructions, setAiInstructions] = useState(profile.ai_instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggleResource(r: string) {
    setResources((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const finalResources = customResource.trim()
      ? [...resources, customResource.trim()]
      : resources;
    const trackChanged = track !== originalTrack;
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        exam_track: track,
        subject_name: track === "subject" ? subjectName || null : null,
        prep_stage: track === "step1" ? prepStage || null : null,
        exam_date: examDate || null,
        daily_hour_goal: hourGoal ? Number(hourGoal) : null,
        resources: finalResources,
        completed_so_far: completedSoFar || null,
        strong_areas: strongAreas || null,
        weak_areas: weakAreas || null,
        goals_notes: goalsNotes || null,
        ai_instructions: aiInstructions || null,
        ...(trackChanged ? { track_changed_pending: true } : {}),
      })
      .eq("id", userId);

    // Let the coach know the student switched tracks, so she can review
    // and reassign their plan - this doesn't happen automatically.
    if (!error && trackChanged) {
      const fromLabel = originalTrack === "subject" ? "Subject exams" : "Step 1 (CBSE)";
      const toLabel = track === "subject" ? `Subject exams${subjectName ? ` - ${subjectName}` : ""}` : "Step 1 (CBSE)";
      await supabase.from("messages").insert({
        student_id: userId,
        sender: "student",
        body: `Switched exam track: ${fromLabel} -> ${toLabel}. My current plan may no longer fit - could you take a look and reassign when you get a chance?`,
      });
    }

    setSaving(false);
    setCustomResource("");
    setResources(finalResources);
    setMsg(error ? `Error: ${error.message}` : "Saved.");
    setTimeout(() => setMsg(null), 2500);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-4">Account</h2>
        <label className="label">Email</label>
        <input className="input mb-4 bg-slate-800" value={email} disabled />
        <label className="label">Name</label>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Study plan</h2>

        <label className="label">What are you preparing for?</label>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {(
            [
              { v: "step1", l: "Step 1 (CBSE)" },
              { v: "subject", l: "Subject exams" },
            ] as { v: ExamTrack; l: string }[]
          ).map((opt) => (
            <button
              type="button"
              key={opt.v}
              onClick={() => setTrack(opt.v)}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold text-center transition ${
                track === opt.v
                  ? "border-brand-400 bg-brand-900/40 text-brand-300"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>

        {track === "subject" && (
          <>
            <label className="label">Subject</label>
            <input
              className="input mb-5"
              placeholder="e.g. Internal Medicine, Surgery, Pediatrics"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
          </>
        )}

        {track === "step1" && (
          <>
            <label className="label">Prep stage</label>
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
          </>
        )}

        <label className="label">Exam date</label>
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

        <label className="label">Preferred resources</label>
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
          className="input"
          placeholder="Add another resource"
          value={customResource}
          onChange={(e) => setCustomResource(e.target.value)}
        />
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Where you're at (for your coach)</h2>
        <p className="text-sm text-slate-300 -mt-2">
          Keep this updated so your coach can adjust your plan when things change.
        </p>
        <div>
          <label className="label">What have you completed so far?</label>
          <textarea
            className="input"
            rows={2}
            value={completedSoFar}
            onChange={(e) => setCompletedSoFar(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Which systems/topics are you strong in?</label>
          <input className="input" value={strongAreas} onChange={(e) => setStrongAreas(e.target.value)} />
        </div>
        <div>
          <label className="label">Which systems/topics are you struggling with?</label>
          <input className="input" value={weakAreas} onChange={(e) => setWeakAreas(e.target.value)} />
        </div>
        <div>
          <label className="label">What do you want to master / get suggestions on?</label>
          <textarea
            className="input"
            rows={2}
            value={goalsNotes}
            onChange={(e) => setGoalsNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Custom AI instructions</h2>
        <p className="text-sm text-slate-300 mb-4">
          Paste in your own guidance for the AI coach - e.g. how you personally
          want to approach UWorld, Sketchy, Boards & Beyond, pacing rules,
          things it should always remind you of, or anything specific to your
          plan. This gets added to what the AI already knows and takes
          priority over the built-in defaults.
        </p>
        <textarea
          className="input"
          rows={8}
          placeholder="e.g. Always tell me to review flagged UWorld questions on Sundays. Prioritize Anki over new content when I'm behind. My weak subjects are..."
          value={aiInstructions}
          onChange={(e) => setAiInstructions(e.target.value)}
        />
      </div>

      {msg && <p className="text-sm text-slate-300">{msg}</p>}
      <button className="btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
