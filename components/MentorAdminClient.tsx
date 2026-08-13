"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mentorPhotoUrl, type Mentor } from "@/lib/mentors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export default function MentorAdminClient({
  initialMentors,
  studentCounts,
}: {
  initialMentors: Mentor[];
  // Lowercased-email -> linked student count, computed server-side in
  // app/admin/mentors/page.tsx. Just enough to show inline here; the full
  // breakdown lives at /admin/mentors/[id].
  studentCounts: Record<string, number>;
}) {
  const router = useRouter();
  const mentors = initialMentors;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Edit-in-place state for an existing mentor - only one row can be in edit
  // mode at a time. Editing lets an admin fix a typo'd name/email/bio or
  // swap out the photo without deleting and re-adding the mentor (which
  // would also wipe their availability slots and booking history).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  function startEdit(m: Mentor) {
    setEditingId(m.id);
    setEditName(m.name);
    setEditEmail(m.email);
    setEditBio(m.bio || "");
    setEditPhotoFile(null);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditEmail("");
    setEditBio("");
    setEditPhotoFile(null);
    setEditError(null);
  }

  async function saveEdit(m: Mentor) {
    if (!editName.trim() || !editEmail.trim()) {
      setEditError("Name and email are required.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const supabase = createClient();

    let photoPath = m.photo_path;
    const oldPhotoPath = m.photo_path;
    if (editPhotoFile) {
      const ext = editPhotoFile.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("mentor-photos").upload(path, editPhotoFile, {
        upsert: false,
      });
      if (uploadError) {
        setEditSaving(false);
        setEditError(uploadError.message);
        return;
      }
      photoPath = path;
    }

    const { error: updateError } = await supabase
      .from("mentors")
      .update({
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        bio: editBio.trim() || null,
        photo_path: photoPath,
      })
      .eq("id", m.id);

    if (updateError) {
      setEditSaving(false);
      setEditError(updateError.message);
      return;
    }

    if (editPhotoFile && oldPhotoPath) {
      await supabase.storage.from("mentor-photos").remove([oldPhotoPath]).catch(() => {});
    }

    setEditSaving(false);
    cancelEdit();
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

          if (editingId === m.id) {
            return (
              <div key={m.id} className="card space-y-3">
                <p className="text-sm font-semibold">Editing {m.name}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Name</label>
                    <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      className="input"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Details / bio</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Photo</label>
                  <div className="flex items-center gap-3">
                    {photoUrl ? (
                      <img src={photoUrl} alt={m.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-brand-900/40 text-brand-300 font-bold flex items-center justify-center shrink-0">
                        {m.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditPhotoFile(e.target.files?.[0] ?? null)}
                      className="text-sm text-slate-300"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Current photo shown on the left. Choose a file to replace it, or leave blank to keep it.
                  </p>
                </div>
                {editError && <p className="text-xs text-red-400">{editError}</p>}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveEdit(m)}
                    disabled={editSaving}
                    className="btn-primary text-sm"
                  >
                    {editSaving ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={editSaving}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

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
                <Link
                  href={`/admin/mentors/${m.id}`}
                  className="text-xs text-brand-400 hover:text-brand-300 inline-block mt-0.5"
                >
                  {studentCounts[m.email.toLowerCase()] ?? 0} student
                  {(studentCounts[m.email.toLowerCase()] ?? 0) === 1 ? "" : "s"} &middot; View dashboard &rarr;
                </Link>
                {m.bio && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{m.bio}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  disabled={busyId === m.id}
                  className="btn-secondary text-xs"
                >
                  Edit
                </button>
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
