"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatSlotDate,
  formatSlotTime,
  groupSlotsByDate,
  mentorPhotoUrl,
  type Mentor,
  type MentorSlot,
} from "@/lib/mentors";
import { nyWallTimeToUtcIso } from "@/lib/timezone";
import MentorChatPanel from "./MentorChatPanel";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

type SlotWithBooker = MentorSlot & {
  booked_by_profile?: { full_name: string | null; email: string | null } | null;
};

type ConversationPartner = { id: string; full_name: string | null; email: string | null };

/** Mentor's own availability manager - add/remove open time slots, see which are booked. */
export default function MentorAvailabilityClient({
  mentor,
  initialSlots,
  conversationPartners,
}: {
  mentor: Mentor;
  initialSlots: SlotWithBooker[];
  conversationPartners: ConversationPartner[];
}) {
  const router = useRouter();
  const slots = initialSlots;

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<ConversationPartner | null>(null);

  // Profile editing - name/bio/photo only. Email and active status are
  // intentionally left out here (and are blocked server-side too, even if
  // someone tried to force them through): email is tied to how this mentor
  // logs in, and active is an admin-only visibility switch.
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(mentor.name);
  const [profileBio, setProfileBio] = useState(mentor.bio || "");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState(mentor.photo_path);
  const [displayName, setDisplayName] = useState(mentor.name);
  const [displayBio, setDisplayBio] = useState(mentor.bio || "");

  function startEditProfile() {
    setProfileName(displayName);
    setProfileBio(displayBio);
    setProfilePhotoFile(null);
    setProfileError(null);
    setEditingProfile(true);
  }

  function cancelEditProfile() {
    setEditingProfile(false);
    setProfilePhotoFile(null);
    setProfileError(null);
  }

  async function saveProfile() {
    if (!profileName.trim()) {
      setProfileError("Name can't be blank.");
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    const supabase = createClient();

    // Keep the existing photo unless a new file was chosen. The old file is
    // removed afterward on a best-effort basis so storage doesn't quietly
    // accumulate replaced photos.
    let newPhotoPath = photoPath;
    const oldPhotoPath = photoPath;
    if (profilePhotoFile) {
      const ext = profilePhotoFile.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("mentor-photos")
        .upload(path, profilePhotoFile, { upsert: false });
      if (uploadError) {
        setProfileSaving(false);
        setProfileError(uploadError.message);
        return;
      }
      newPhotoPath = path;
    }

    const { error: updateError } = await supabase
      .from("mentors")
      .update({
        name: profileName.trim(),
        bio: profileBio.trim() || null,
        photo_path: newPhotoPath,
      })
      .eq("id", mentor.id);

    if (updateError) {
      setProfileSaving(false);
      setProfileError(updateError.message);
      return;
    }

    if (profilePhotoFile && oldPhotoPath) {
      await supabase.storage.from("mentor-photos").remove([oldPhotoPath]).catch(() => {});
    }

    setPhotoPath(newPhotoPath);
    setDisplayName(profileName.trim());
    setDisplayBio(profileBio.trim());
    setProfileSaving(false);
    setEditingProfile(false);
    router.refresh();
  }

  const photoUrl = mentorPhotoUrl(photoPath, SUPABASE_URL);

  async function addSlot() {
    if (!date || !startTime || !endTime) {
      setError("Pick a date, start time, and end time.");
      return;
    }
    // Times you type here are treated as Eastern Time (ET), not whatever
    // timezone your own browser happens to be in - that's what keeps a
    // slot meaning the same instant for you and for the student who books
    // it, no matter where either of you actually are.
    const start = new Date(nyWallTimeToUtcIso(date, startTime));
    const end = new Date(nyWallTimeToUtcIso(date, endTime));
    if (end <= start) {
      setError("End time has to be after the start time.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("mentor_slots").insert({
      mentor_id: mentor.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setDate("");
    setStartTime("");
    setEndTime("");
    router.refresh();
  }

  async function removeSlot(id: string) {
    if (!confirm("Remove this open slot?")) return;
    setBusyId(id);
    const supabase = createClient();
    await supabase.from("mentor_slots").delete().eq("id", id);
    setBusyId(null);
    router.refresh();
  }

  const now = new Date().toISOString();
  const upcoming = slots.filter((s) => s.end_time >= now);
  const past = slots.filter((s) => s.end_time < now);
  const grouped = groupSlotsByDate(upcoming);

  return (
    <div className="space-y-6">
      <div className="card">
        {editingProfile ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Edit your profile</p>
            <p className="text-xs text-slate-500">
              This is what students see when they browse mentors. Your email ({mentor.email}) isn&apos;t
              editable here since it&apos;s tied to how you sign in.
            </p>
            <div>
              <label className="label">Name</label>
              <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
            </div>
            <div>
              <label className="label">Details / bio</label>
              <textarea
                className="input"
                rows={3}
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value)}
                placeholder="Background, specialties, what students can ask about..."
              />
            </div>
            <div>
              <label className="label">Photo</label>
              <div className="flex items-center gap-3">
                {photoUrl ? (
                  <img src={photoUrl} alt={displayName} className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-brand-900/40 text-brand-300 font-bold flex items-center justify-center shrink-0">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProfilePhotoFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-300"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Current photo shown on the left. Choose a file to replace it, or leave blank to keep it.
              </p>
            </div>
            {profileError && <p className="text-xs text-red-400">{profileError}</p>}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveProfile}
                disabled={profileSaving}
                className="btn-primary text-sm"
              >
                {profileSaving ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={cancelEditProfile}
                disabled={profileSaving}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {photoUrl ? (
              <img src={photoUrl} alt={displayName} className="w-14 h-14 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-brand-900/40 text-brand-300 font-bold flex items-center justify-center shrink-0">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate">{mentor.email}</p>
              {displayBio && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{displayBio}</p>}
            </div>
            <button type="button" onClick={startEditProfile} className="btn-secondary text-xs shrink-0">
              Edit profile
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <p className="text-sm font-semibold mb-1">Add an open slot</p>
        <p className="text-xs text-slate-500 mb-3">
          All times on Master Grid, including the ones you set here, are Eastern Time (ET) - shown
          as EST or EDT depending on the time of year.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Start time</label>
            <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="label">End time</label>
            <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <button type="button" onClick={addSlot} disabled={saving} className="btn-primary text-sm">
          {saving ? "Adding..." : "Add slot"}
        </button>
      </div>

      <div>
        <p className="text-sm font-semibold mb-3">Your upcoming slots</p>
        {grouped.length === 0 ? (
          <p className="text-sm text-slate-400">No upcoming slots yet - add one above.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(({ date, slots }) => (
              <div key={date}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{date}</p>
                <div className="space-y-2">
                  {slots.map((s) => (
                    <div key={s.id} className="card flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm">
                          {formatSlotTime(s.start_time)} &ndash; {formatSlotTime(s.end_time)}
                        </p>
                        {s.is_booked && (
                          <>
                            <p className="text-xs text-slate-400 mt-1">
                              Booked by{" "}
                              <span className="font-medium text-slate-300">
                                {s.booked_by_profile?.full_name || "a student"}
                              </span>
                              {s.booked_by_profile?.email && (
                                <span className="text-slate-500"> ({s.booked_by_profile.email})</span>
                              )}
                              {s.booked_at && (
                                <>
                                  {" "}
                                  on {formatSlotDate(s.booked_at)} at {formatSlotTime(s.booked_at)}
                                </>
                              )}
                            </p>
                            {s.student_note && (
                              <p className="text-xs text-slate-300 mt-1 italic">&ldquo;{s.student_note}&rdquo;</p>
                            )}
                            {s.booked_by && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedPartner({
                                    id: s.booked_by as string,
                                    full_name: s.booked_by_profile?.full_name ?? null,
                                    email: s.booked_by_profile?.email ?? null,
                                  })
                                }
                                className="text-xs text-brand-400 hover:text-brand-300 mt-1"
                              >
                                Message this student &rarr;
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                            s.is_booked ? "bg-green-900/40 text-green-400" : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {s.is_booked ? "Booked" : "Open"}
                        </span>
                        {!s.is_booked && (
                          <button
                            type="button"
                            onClick={() => removeSlot(s.id)}
                            disabled={busyId === s.id}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <p className="text-xs text-slate-600">
          {past.length} past slot{past.length === 1 ? "" : "s"} not shown.
        </p>
      )}

      <div>
        <p className="text-sm font-semibold mb-3">Messages</p>
        {conversationPartners.length === 0 ? (
          <p className="text-sm text-slate-400">
            No students to message yet - this fills in once someone books a slot or messages you.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              {conversationPartners.map((p) => {
                const active = selectedPartner?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPartner(p)}
                    className={`card w-full text-left transition ${
                      active ? "border-brand-500" : "hover:border-brand-500/50"
                    }`}
                  >
                    <p className="text-sm font-semibold">{p.full_name || "A student"}</p>
                    {p.email && <p className="text-xs text-slate-500">{p.email}</p>}
                  </button>
                );
              })}
            </div>
            <div>
              {selectedPartner ? (
                <MentorChatPanel
                  mentorId={mentor.id}
                  studentId={selectedPartner.id}
                  otherPartyLabel={selectedPartner.full_name || selectedPartner.email || "this student"}
                />
              ) : (
                <p className="text-sm text-slate-400">Pick a student on the left to see or send messages.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
