"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mentorPhotoUrl, type Mentor } from "@/lib/mentors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export default function MentorAdminClient({ initialMentors }: { initialMentors: Mentor[] }) {
  const router = useRouter();
  const mentors = initialMentors;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addMentor() {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();

    let photoPath: string | null = null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("mentor-photos").upload(path, photoFile, {
        upsert: false,
      });
      if (uploadError) {
        setSaving(false);
        setError(uploadError.message);
        return;
      }
      photoPath = path;
    }

    const { error: insertError } = await supabase.from("mentors").insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      bio: bio.trim() || null,
      photo_path: photoPath,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    setEmail("");
    setBio("");
    setPhotoFile(null);
    router.refresh();
  }

  async function toggleActive(m: Mentor) {
    setBusyId(m.id);
    const supabase = createClient();
    await supabase.from("mentors").update({ active: !m.active }).eq("id", m.id);
    setBusyId(null);
    router.refresh();
  }

  async function deleteMentor(m: Mentor) {
    if (!confirm(`Remove ${m.name}? This also deletes their availability slots. This can't be undone.`)) return;
    setBusyId(m.id);
    const supabase = createClient();
    await supabase.from("mentors").delete().eq("id", m.id);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="text-sm font-semibold mb-3">Add a mentor</p>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Smith" />
          </div>
          <div>
            <label className="label">Email (the one they'll sign up with)</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mentor@example.com"
            />
          </div>
        </div>
        <label className="label">Details / bio</label>
        <textarea
          className="input mb-3"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Background, specialties, what students can ask about..."
        />
        <label className="label">Photo (optional)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          className="text-sm text-slate-300 mb-3 block"
        />
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <button type="button" onClick={addMentor} disabled={saving} className="btn-primary text-sm">
          {saving ? "Adding..." : "Add mentor"}
        </button>
      </div>

      <div className="space-y-3">
        {mentors.length === 0 && <p className="text-sm text-slate-400">No mentors added yet.</p>}
        {mentors.map((m) => {
          const photoUrl = mentorPhotoUrl(m.photo_path, SUPABASE_URL);
          return (
            <div key={m.id} className="card flex items-center gap-4">
              {photoUrl ? (
                <img src={photoUrl} alt={m.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-brand-900/40 text-brand-300 font-bold flex items-center justify-center shrink-0">
                  {m.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {m.name}
                  {!m.active && <span className="ml-2 text-xs text-slate-500 font-normal">(inactive)</span>}
                </p>
                <p className="text-xs text-slate-400 truncate">{m.email}</p>
                {m.bio && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{m.bio}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleActive(m)}
                  disabled={busyId === m.id}
                  className="btn-secondary text-xs"
                >
                  {m.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteMentor(m)}
                  disabled={busyId === m.id}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
