"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Viewer } from "@/lib/viewers";

/**
 * Admin-only roster management for "viewers" - people who are not mentors
 * but can be granted read-only access to specific students (see
 * StudentViewersEditor.tsx, rendered per-student on /admin). Deliberately
 * much simpler than MentorAdminClient.tsx: just a name and an email, no
 * bio/photo/role, since a viewer never has a public-facing profile
 * anywhere - they only ever show up in an admin's own "add viewer" dropdown
 * and in their own minimal /viewer dashboard.
 */
export default function ViewerAdminClient({ initialViewers }: { initialViewers: Viewer[] }) {
  const router = useRouter();
  const viewers = initialViewers;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function addViewer() {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("viewers").insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    setEmail("");
    router.refresh();
  }

  async function toggleActive(v: Viewer) {
    setBusyId(v.id);
    const supabase = createClient();
    await supabase.from("viewers").update({ active: !v.active }).eq("id", v.id);
    setBusyId(null);
    router.refresh();
  }

  async function deleteViewer(v: Viewer) {
    if (!confirm(`Remove ${v.name}? This also removes every student they were granted access to. This can't be undone.`))
      return;
    setBusyId(v.id);
    const supabase = createClient();
    await supabase.from("viewers").delete().eq("id", v.id);
    setBusyId(null);
    router.refresh();
  }

  function startEdit(v: Viewer) {
    setEditingId(v.id);
    setEditName(v.name);
    setEditEmail(v.email);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditEmail("");
    setEditError(null);
  }

  async function saveEdit(v: Viewer) {
    if (!editName.trim() || !editEmail.trim()) {
      setEditError("Name and email are required.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("viewers")
      .update({ name: editName.trim(), email: editEmail.trim().toLowerCase() })
      .eq("id", v.id);
    setEditSaving(false);
    if (updateError) {
      setEditError(updateError.message);
      return;
    }
    cancelEdit();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="text-sm font-semibold mb-3">Add a viewer</p>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <label className="label">Email (the one they'll sign up with)</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="viewer@example.com"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <button type="button" onClick={addViewer} disabled={saving} className="btn-primary text-sm">
          {saving ? "Adding..." : "Add viewer"}
        </button>
        <p className="text-xs text-slate-500 mt-2">
          Once added here, they can sign up at /viewer/signup using this exact email and will only ever see the
          students you grant them below on each student's card.
        </p>
      </div>

      <div className="space-y-3">
        {viewers.length === 0 && <p className="text-sm text-slate-400">No viewers added yet.</p>}
        {viewers.map((v) => {
          if (editingId === v.id) {
            return (
              <div key={v.id} className="card space-y-3">
                <p className="text-sm font-semibold">Editing {v.name}</p>
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
                {editError && <p className="text-xs text-red-400">{editError}</p>}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveEdit(v)}
                    disabled={editSaving}
                    className="btn-primary text-sm"
                  >
                    {editSaving ? "Saving..." : "Save changes"}
                  </button>
                  <button type="button" onClick={cancelEdit} disabled={editSaving} className="btn-secondary text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={v.id} className="card flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-brand-900/40 text-brand-300 font-bold flex items-center justify-center shrink-0">
                {v.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate flex items-center gap-2">
                  {v.name}
                  {!v.active && <span className="text-xs text-slate-500 font-normal">(inactive)</span>}
                </p>
                <p className="text-xs text-slate-400 truncate">{v.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(v)}
                  disabled={busyId === v.id}
                  className="btn-secondary text-xs"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(v)}
                  disabled={busyId === v.id}
                  className="btn-secondary text-xs"
                >
                  {v.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteViewer(v)}
                  disabled={busyId === v.id}
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
