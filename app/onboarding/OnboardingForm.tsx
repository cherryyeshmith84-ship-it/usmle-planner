"use client";

import { useEffect, useState } from "react";
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

const SITUATIONS = ["Pre-clinical", "Dedicated study", "Retaking"];
const PROBLEMS = ["Time management", "Weak systems", "Low scores", "No study plan", "Consistency / motivation"];
const CONTACT_TIMES = ["Morning", "Afternoon", "Evening", "Night", "Anytime"];

// Fields added for the demo team (see the student_leads migration). Kept as a
// local type so lib/types.ts doesn't need to change.
type ContactFields = {
  whatsapp?: string | null;
  whatsapp_consent?: boolean | null;
  country?: string | null;
  best_contact_time?: string | null;
  latest_score?: string | null;
  biggest_problem?: string | null;
  situation?: string | null;
  timezone?: string | null;
};

// Two choices for the student: Step 1, or Step 2 / Shelf exams. "step2" and
// "subject" are both the Step 2 / Shelf group (same page, same mentors), so a
// profile already saved as "subject" keeps that value.
type Track = "step1" | "step2" | "subject" | "";

export default function OnboardingForm({
  initialProfile,
  userId,
}: {
  initialProfile: Profile | null;
  userId: string;
}) {
  const router = useRouter();
  const extra = (initialProfile ?? {}) as ContactFields;

  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile?.avatar_url ?? null);
  const savedTrack = (initialProfile?.exam_track ?? "") as Track;
  const [track, setTrack] = useState<Track>(savedTrack);
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

  // contact + intake details for the demo team
  const [whatsapp, setWhatsapp] = useState(extra.whatsapp ?? "");
  const [consent, setConsent] = useState(!!extra.whatsapp_consent);
  const [country, setCountry] = useState(extra.country ?? "");
  const [timezone, setTimezone] = useState(extra.timezone ?? "");
  const [contactTime, setContactTime] = useState(extra.best_contact_time ?? "");
  const [latestScore, setLatestScore] = useState(extra.latest_score ?? "");
  const [situation, setSituation] = useState(extra.situation ?? "");
  const [problems, setProblems] = useState<string[]>(
    extra.biggest_problem ? extra.biggest_problem.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [otherProblem, setOtherProblem] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect the student's time zone so the demo team knows when to call.
  useEffect(() => {
    if (!timezone) {
      try {
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
      } catch {
        /* ignore */
      }
    }
  }, [timezone]);

  function toggleResource(r: string) {
    setResources((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }
  function toggleProblem(p: string) {
    setProblems((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const isStep1 = track === "step1";
  const isStep2Group = track === "step2" || track === "subject";
  const needsMoreDetail = isStep1 && (prepStage === "middle" || prepStage === "end");

  function pickStep2Group() {
    setTrack(savedTrack === "subject" ? "subject" : "step2");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cleanNumber = whatsapp.replace(/[\s\-().]/g, "");
    if (!/^\+\d{8,15}$/.test(cleanNumber)) {
      setError("Please enter your WhatsApp number with the country code, for example +91 98765 43210.");
      return;
    }
    if (!consent) {
      setError("Please tick the box so we can message you on WhatsApp about your demo class.");
      return;
    }
    if (!track) {
      setError("Please choose Step 1 or Step 2 / Shelf exams.");
      return;
    }
    if (isStep1 && !prepStage) {
      setError("Please choose where you are in your Step 1 prep.");
      return;
    }

    setLoading(true);
    setError(null);

    const finalResources = customResource.trim()
      ? [...resources, customResource.trim()]
      : resources;
    const finalProblems = otherProblem.trim() ? [...problems, otherProblem.trim()] : problems;

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_completed: true,
        avatar_url: avatarUrl,
        exam_track: track,
        prep_stage: isStep1 ? prepStage : null,
        subject_name: isStep2Group ? subjectName.trim() || null : null,
        exam_date: examDate || null,
        daily_hour_goal: hourGoal ? Number(hourGoal) : null,
        resources: finalResources,
        completed_so_far: needsMoreDetail ? completedSoFar || null : null,
        weak_areas: needsMoreDetail ? weakAreas || null : null,
        strong_areas: needsMoreDetail ? strongAreas || null : null,
        goals_notes: needsMoreDetail ? goalsNotes || null : null,
        whatsapp: cleanNumber,
        whatsapp_consent: true,
        country: country.trim() || null,
        timezone: timezone || null,
        best_contact_time: contactTime || null,
        latest_score: latestScore.trim() || null,
        situation: situation || null,
        biggest_problem: finalProblems.length ? finalProblems.join(", ") : null,
      })
      .eq("id", userId);

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    // Let the coach know a new (or updated) intake is ready to review, without
    // auto-generating any plan - she assigns one herself once she's seen this.
    const trackLabel = isStep1
      ? "Step 1 (CBSE)"
      : subjectName.trim()
      ? `Step 2 / Shelf exams - ${subjectName.trim()}`
      : "Step 2 / Shelf exams";
    const summaryLines = [
      `Completed onboarding: ${trackLabel}`,
      isStep1 && prepStage ? `Stage: ${prepStage}` : "",
      situation ? `Situation: ${situation}` : "",
      examDate ? `Exam date: ${examDate}` : "Exam date: not booked yet",
      hourGoal ? `Target hours/day: ${hourGoal}` : "",
      latestScore.trim() ? `Latest score: ${latestScore.trim()}` : "",
      finalProblems.length ? `Biggest problem: ${finalProblems.join(", ")}` : "",
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

    // Email the Master Grid inbox: "signed up, waiting for demo". Never
    // blocks the student if it fails.
    try {
      await fetch("/api/leads/notify", { method: "POST" });
    } catch {
      // ignore
    }

    setLoading(false);
    // Step 1 students continue exactly as before. Step 2 / Shelf students land
    // on their own page, with their own mentor list.
    router.push(isStep1 ? "/welcome" : "/step2");
    router.refresh();
  }

  const chip = (on: boolean) =>
    `text-sm rounded-full px-3 py-1.5 border transition ${
      on ? "border-brand-400 bg-brand-900/40 text-brand-300" : "border-slate-700 text-slate-300 hover:border-slate-600"
    }`;

  const trackBtn = (on: boolean) =>
    `rounded-xl border px-3 py-4 text-sm font-semibold text-center transition ${
      on
        ? "border-brand-400 bg-brand-900/40 text-brand-300"
        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
    }`;

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl w-full">
      <h1 className="text-xl font-bold mb-1">Tell us about you</h1>
      <p className="text-sm text-slate-300 mb-6">
        This takes about a minute. Our team uses it to contact you on WhatsApp, arrange your free demo class and
        match you with the right mentor.
      </p>

      {/* Optional - uploads to the same "student-photos" bucket, and same
          field, as the one in Settings (app/settings/SettingsForm.tsx), so
          setting it here now or later in Settings both just update
          profiles.avatar_url the same way. */}
      <ImageUploadField
        label="Add a profile photo (optional)"
        value={avatarUrl}
        onChange={setAvatarUrl}
        bucket="student-photos"
        folder={userId}
      />

      {/* ---- How we reach you ---- */}
      <div className="rounded-xl border border-slate-700 p-4 mb-6">
        <p className="text-sm font-semibold mb-3">How can we reach you?</p>

        <label className="label">WhatsApp number (with country code)</label>
        <input
          type="tel"
          inputMode="tel"
          className="input mb-3"
          placeholder="+91 98765 43210"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          required
        />

        <label className="text-sm flex items-start gap-2 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <span>OK to message me on WhatsApp about my free demo class and study plan.</span>
        </label>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Country</label>
            <input className="input" placeholder="e.g. India" value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
          <div>
            <label className="label">Best time to contact you</label>
            <select className="input" value={contactTime} onChange={(e) => setContactTime(e.target.value)}>
              <option value="">Select</option>
              {CONTACT_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Your time zone{timezone ? ` (${timezone})` : ""} is picked up automatically, so &ldquo;morning&rdquo; means
          morning for you.
        </p>
      </div>

      <label className="label">What are you preparing for?</label>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button type="button" onClick={() => setTrack("step1")} className={trackBtn(isStep1)}>
          Step 1 (CBSE)
        </button>
        <button type="button" onClick={pickStep2Group} className={trackBtn(isStep2Group)}>
          Step 2 / Shelf exams
        </button>
      </div>

      <label className="label">Where are you right now?</label>
      <div className="flex flex-wrap gap-2 mb-5">
        {SITUATIONS.map((s) => (
          <button type="button" key={s} onClick={() => setSituation(s)} className={chip(situation === s)}>
            {s}
          </button>
        ))}
      </div>

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
          <label className="label">Exam date (leave blank if not booked yet)</label>
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

          <label className="label">Latest NBME / UWSA score (if any)</label>
          <input
            className="input mb-5"
            placeholder="e.g. NBME 30: 62%, UWSA 2: 215"
            value={latestScore}
            onChange={(e) => setLatestScore(e.target.value)}
          />

          <label className="label">What is your biggest problem right now?</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PROBLEMS.map((p) => (
              <button type="button" key={p} onClick={() => toggleProblem(p)} className={chip(problems.includes(p))}>
                {p}
              </button>
            ))}
          </div>
          <input
            className="input mb-6"
            placeholder="Anything else (optional)"
            value={otherProblem}
            onChange={(e) => setOtherProblem(e.target.value)}
          />
        </>
      )}

      {isStep1 && (
        <>
          <label className="label">Which resources do you use / prefer?</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {RESOURCE_OPTIONS.map((r) => (
              <button type="button" key={r} onClick={() => toggleResource(r)} className={chip(resources.includes(r))}>
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
        {loading ? "Saving..." : "Submit"}
      </button>
    </form>
  );
}
