"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function OnboardingForm({
  initialProfile,
  userId,
}: {
  initialProfile: Profile | null;
  userId: string;
}) {
  const router = useRouter();
  const [prepStage, setPrepStage] = useState<PrepStage | "">(
    initialProfile?.prep_stage ?? ""
  );
  const [examDate, setExamDate] = useState(initialProfile?.exam_date ?? "");
  const [hourGoal, setHourGoal] = useState(
    initialProfile?.daily_hour_goal?.toString() ?? "8"
  );
  const [resources, setResources] = useState<string[]>(
    initialProfile?.resources ?? []
  );
  const [customResource, setCustomResource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleResource(r: string) {
    setResources((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prepStage) {
      setError("Please choose where you are in your prep.");
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
        prep_stage: prepStage,
        exam_date: examDate || null,
        daily_hour_goal: hourGoal ? Number(hourGoal) : null,
        resources: finalResources,
      })
      .eq("id", userId);

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl w-full">
      <h1 className="text-xl font-bold mb-1">Tell us about your prep</h1>
      <p className="text-sm text-slate-600 mb-6">
        This shapes your default daily plan and your AI coach's advice. You
        can change all of this later in Settings.
      </p>

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
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>

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

      <label className="label">Which resources do you use / prefer?</label>
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
        className="input mb-6"
        placeholder="Other resource (optional)"
        value={customResource}
        onChange={(e) => setCustomResource(e.target.value)}
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <button className="btn-primary w-full" disabled={loading}>
        {loading ? "Saving..." : "Go to my dashboard"}
      </button>
    </form>
  );
}
