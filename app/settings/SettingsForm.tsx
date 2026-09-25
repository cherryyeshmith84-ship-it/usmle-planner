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

/**
 * Everything a student filled in once on the onboarding wizard
 * (app/onboarding/OnboardingForm.tsx) used to be locked in forever after
 * that - exam date, prep stage, resources, all of it. That meant a stale
 * exam date (like a countdown reading "-28 Days" once the date's already
 * passed) had no way to get fixed except asking a mentor/admin to edit it
 * by hand. This mirrors OnboardingForm's own fields and logic exactly, just
 * re-editable here in Settings any time, not just once at signup.
 *
 * Changing the track (Step 1 <-> Subject exams) sets track_changed_pending
 * - this already drives the amber "Track changed" badge and "needs
 * attention" sort order on the admin Students list (app/admin/page.tsx),
 * so a mentor/admin knows to double check whether the student's existing
 * plan still makes sense, without this component needing to know anything
 * about that admin-side logic itself.
 */
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
  const [mentorEmail, setMentorEmail] = useState(profile.mentor_email ?? "");

  const [track, setTrack] = useState<ExamTrack | "">(profile.exam_track ?? "");
  const [prepStage, setPrepStage] = useState<PrepStage | "">(profile.prep_stage ?? "");
  const [examDate, setExamDate] = useState(profile.exam_date ?? "");
  const [hourGoal, setHourGoal] = useState(profile.daily_hour_goal?.toString() ?? "");
  const [resources, setResources] = useState<string[]>(profile.resources ?? []);
  const [customResource, setCustomResource] = useState("");
  const [subjectName, setSubjectName] = useState(profile.subject_name ?? "");
  const [completedSoFar, setCompletedSoFar] = useState(profile.completed_so_far ?? "");
  const [weakAreas, setWeakAreas] = useState(profile.weak_areas ?? "");
  const [strongAreas, setStrongAreas] = useState(profile.strong_areas ?? "");
  const [goalsNotes, setGoalsNotes] = useState(profile.goals_notes ?? "");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleResource(r: string) {
    setResources((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  const needsMoreDetail = track === "step1" && (prepStage === "middle" || prepStage === "end");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (track === "step1" && !prepStage) {
      setError("Please choose where you are in your Step 1 prep.");
      return;
    }
    if (track === "subject" && !subjectName.trim()) {
      setError("Please tell us which subject you're preparing for.");
      return;
    }

    setSaving(true);
    setMsg(null);

    const finalResources = customResource.trim() ? [...resources, customResource.trim()] : resources;

    // Only flag "track changed" when it's an actual change from what was
    // already saved - re-saving the same track every time you tweak your
    // exam date shouldn't keep re-flagging it for review.
    const trackChanged = !!track && track !== (profile.exam_track ?? "");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        mentor_email: mentorEmail.trim() || null,
        exam_track: track || null,
        prep_stage: track === "step1" ? prepStage || null : null,
        subject_name: track === "subject" ? subjectName.trim() || null : null,
        exam_date: examDate || null,
        daily_hour_goal: hourGoal ? Number(hourGoal) : null,
        resources: finalResources,
        completed_so_far: needsMoreDetail ? completedSoFar || null : null,
        weak_areas: needsMoreDetail ? weakAreas || null : null,
        strong_areas: needsMoreDetail ? strongAreas || null : null,
        goals_notes: needsMoreDetail ? goalsNotes || null : null,
        ...(trackChanged ? { track_changed_pending: true } : {}),
      })
      .eq("id", userId);

    setSaving(false);
    if (updateError) {
      setMsg(`Error: ${updateError.message}`);
      setTimeout(() => setMsg(null), 3500);
      return;
    }
    if (customResource.trim()) {
      setResources(finalResources);
      setCustomResource("");
    }
    setMsg(trackChanged ? "Saved - your mentor will see your plan may need a review." : "Saved.");
    setTimeout(() => setMsg(null), 3500);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-4">Account</h2>
        <label className="label">Email</label>
        <input className="input mb-4 bg-slate-800" value={email} disabled />
        <label className="label">Name</label>
        <input className="input mb-4" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <label className="label">Your mentor&apos;s email</label>
        <input
          type="email"
          className="input"
          placeholder="e.g. mentor@example.com - leave blank if you don't have one"
          value={mentorEmail}
          onChange={(e) => setMentorEmail(e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-1">
          Gives that mentor access to your planner, notes, and analysis. Leave blank to remove access.
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-1">Exam & study info</h2>
        <p className="text-xs text-slate-500 mb-4">
          What you filled in during onboarding - update any of it any time, like if your exam date moves
          or you switch what you're preparing for.
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
              className="input"
              placeholder="Other resource (optional)"
              value={customResource}
              onChange={(e) => setCustomResource(e.target.value)}
            />
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
      <button className="btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
