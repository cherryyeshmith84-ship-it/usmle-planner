"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mentorPhotoUrl, type Mentor, type MentorRole } from "@/lib/mentors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const ROLE_LABELS: Record<MentorRole, string> = {
  mentor: "Mentor",
  tutor: "Tutor",
  both: "Mentor + Tutor",
};

/** Same three-option radio as MentorAdminClient's - only shown here in the
 *  Edit form (as an escape hatch for the rare mentor+tutor person), never
 *  in Add (see header comment below). Duplicated locally rather than
 *  imported so this file has no dependency on components/MentorAdminClient.tsx -
 *  the two admin pages are meant to be fully independent now. */
function RoleRadioGroup({
  value,
  onChange,
  name,
}: {
  value: MentorRole;
  onChange: (role: MentorRole) => void;
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {(["mentor", "tutor", "both"] as MentorRole[]).map((r) => (
        <label key={r} className="flex items-center gap-1.5 text-sm text-slate-300">
          <input type="radio" name={name} checked={value === r} onChange={() => onChange(r)} />
          {ROLE_LABELS[r]}
        </label>
      ))}
    </div>
  );
}

/**
 * Admin-only Tutors management - a fully separate page/table from
 * /admin/mentors (see AdminNav.tsx), even though both read/write the same
 * underlying `mentors` table with a `role` column under the hood. A row
 * added here is always role "tutor" - no Mentor/Tutor/Both selector
 * cluttering the Add form, since this page IS the tutor-only add flow.
 * Edit still exposes the full radio as an escape hatch for the rare
 * mentor+tutor person, without that choice being forced on every add.
 */
export default function TutorAdminClient({
  initialTutors,
  studentCounts,
}: {
  initialTutors: Mentor[];
  // Lowercased-email -> linked-via-tutor_email student count, computed
  // server-side in app/admin/tutors/page.tsx.
  studentCounts: Record<string, number>;
}) {
  const router = useRouter();
  const tutors = initialTutors;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editRole, setEditRole] = useState<MentorRole>("tutor");
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function addTutor() {
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
      role: "tutor",
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

  async function deleteTutor(m: Mentor) {
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
    setEditRole(m.role ?? "tutor");
    setEditPhotoFile(null);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditEmail("");
    setEditBio("");
    setEditRole("tutor");
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
        role: editRole,
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
        <p className="text-sm font-semibold mb-3">Add a tutor</p>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Smith" />
          </div>
          <div>
            <label className="label">Email (the one they&apos;ll sign up with)</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tutor@example.com"
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
        <button type="button" onClick={addTutor} disabled={saving} className="btn-primary text-sm">
          {saving ? "Adding..." : "Add tutor"}
        </button>
      </div>

      <div className="space-y-3">
        {tutors.length === 0 && <p className="text-sm text-slate-400">No tutors added yet.</p>}
        {tutors.map((m) => {
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
                  <label className="label">Role</label>
                  <RoleRadioGroup value={editRole} onChange={setEditRole} name={`edit-tutor-role-${m.id}`} />
                  <p className="text-xs text-slate-500 mt-1">
                    Only change this if this person also mentors - switching to "Mentor" or "Mentor +
                    Tutor" makes them show up on the Mentors page too.
                  </p>
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
                <p className="text-sm font-semibold truncate flex items-center gap-2">
                  {m.name}
                  <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-slate-800 text-slate-400 shrink-0">
                    {ROLE_LABELS[m.role ?? "tutor"]}
                  </span>
                  {!m.active && <span className="text-xs text-slate-500 font-normal">(inactive)</span>}
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
                  onClick={() => deleteTutor(m)}
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
