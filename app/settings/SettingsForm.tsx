"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PrepStage, Profile } from "@/lib/types";
import ImageUploadField from "@/components/ImageUploadField";

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

// Two choices for the student: Step 1, or Step 2 / Shelf exams. Under the hood
// "step2" and "subject" are both the Step 2 / Shelf group (same page, same
// mentors, same data), so a student who was already saved as "subject" stays
// "subject" and the second button shows as selected for either value.
type Track = "step1" | "step2" | "subject" | "";

export default function SettingsForm({
  profile,
  userId,
  email,
}: {
  profile: Profile;
  userId: string;
  email: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url ?? null);

  const savedTrack = (profile.exam_track ?? "") as Track;
  const [track, setTrack] = useState<Track>(savedTrack);
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

  const isStep1 = track === "step1";
  const isStep2Group = track === "step2" || track === "subject";
  const needsMoreDetail = isStep1 && (prepStage === "middle" || prepStage === "end");

  function pickStep2Group() {
    // Keep "subject" if that is what the student already had saved.
    setTrack(savedTrack === "subject" ? "subject" : "step2");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isStep1 && !prepStage) {
      setError("Please choose where you are in your Step 1 prep.");
      return;
    }

    setSaving(true);
    setMsg(null);

    const finalResources = customResource.trim() ? [...resources, customResource.trim()] : resources;

    // Only flag "track changed" when it's an actual change from what was
    // already saved - re-saving the same track every time you tweak your
    // exam date shouldn't keep re-flagging it for review.
    const trackChanged = !!track && track !== savedTrack;
    // Moving between Step 1 and Step 2 / Shelf is the change that swaps the
    // student's data and landing page. Step 2 <-> Shelf is not.
    const groupOf = (t: string) => (t === "step2" || t === "subject" ? "step2" : "step1");
    const groupChanged = !!track && groupOf(track) !== groupOf(savedTrack);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        avatar_url: avatarUrl,
        exam_track: track || null,
        prep_stage: isStep1 ? prepStage || null : null,
        subject_name: isStep2Group ? subjectName.trim() || null : null,
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

    // Switching to Step 2 / Shelf takes the student to their own page.
    if (groupChanged && isStep2Group) {
      router.push("/step2");
      router.refresh();
      return;
    }
    if (groupChanged) {
      router.refresh();
    }

    setMsg(trackChanged ? "Saved - your mentor will see your plan may need a review." : "Saved.");
    setTimeout(() => setMsg(null), 3500);
  }

  const trackBtn = (on: boolean) =>
    `rounded-xl border px-3 py-4 text-sm font-semibold text-center transition ${
      on
        ? "border-brand-400 bg-brand-900/40 text-brand-300"
        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
    }`;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-4">Account</h2>
        <ImageUploadField
          label="Profile picture"
          value={avatarUrl}
          onChange={setAvatarUrl}
          bucket="student-photos"
          folder={userId}
        />
        <label className="label">Email</label>
        <input className="input mb-4 bg-slate-800" value={email} disabled />
        <label className="label">Name</label>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-1">Exam & study info</h2>
        <p className="text-xs text-slate-500 mb-4">
          What you filled in during onboarding - update any of it any time, like if your exam date moves
          or you switch what you're preparing for.
        </p>

        <label className="label">What are you preparing for?</label>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <button type="button" onClick={() => setTrack("step1")} className={trackBtn(isStep1)}>
            Step 1 (CBSE)
          </button>
          <button type="button" onClick={pickStep2Group} className={trackBtn(isStep2Group)}>
            Step 2 / Shelf exams
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          Switching between Step 1 and Step 2 / Shelf starts a fresh, empty planner and analysis for the new
          one. Your other one is kept safe and comes back if you switch back.
        </p>

        {isStep1 && (
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

        {isStep2Group && (
          <>
            <label className="label">Which shelf / subject exam? (optional)</label>
            <input
              className="input mb-5"
              placeholder="e.g. Internal Medicine, Surgery, Pediatrics - leave blank for Step 2 CK"
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

        {isStep1 && (
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
