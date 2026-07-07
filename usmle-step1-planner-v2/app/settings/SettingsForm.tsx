"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PrepStage, Profile } from "@/lib/types";

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
  const [prepStage, setPrepStage] = useState<PrepStage | "">(profile.prep_stage ?? "");
  const [examDate, setExamDate] = useState(profile.exam_date ?? "");
  const [hourGoal, setHourGoal] = useState(profile.daily_hour_goal?.toString() ?? "");
  const [resources, setResources] = useState<string[]>(profile.resources ?? []);
  const [customResource, setCustomResource] = useState("");
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
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        prep_stage: prepStage || null,
        exam_date: examDate || null,
        daily_hour_goal: hourGoal ? Number(hourGoal) : null,
        resources: finalResources,
        ai_instructions: aiInstructions || null,
      })
      .eq("id", userId);
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
        <input className="input mb-4 bg-slate-50" value={email} disabled />
        <label className="label">Name</label>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Study plan</h2>
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
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>

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
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
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

      <div className="card">
        <h2 className="font-semibold mb-2">Custom AI instructions</h2>
        <p className="text-sm text-slate-600 mb-4">
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

      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <button className="btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
