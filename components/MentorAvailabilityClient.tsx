"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatSlotDate,
  formatSlotTime,
  groupSlotsByDate,
  mentorPhotoUrl,
  HELP_AREA_OPTIONS,
  type Mentor,
  type MentorSlot,
} from "@/lib/mentors";
import { nyWallTimeToUtcIso, utcIsoToNyWallParts } from "@/lib/timezone";
import MentorChatPanel from "./MentorChatPanel";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

// Which students a mentor takes. Students on Step 2 CK or Shelf / subject
// exams are shown the mentors who tick Step 2. Step 3 is saved for when Step 3
// students exist.
const EXAM_TRACK_OPTIONS: { value: string; label: string }[] = [
  { value: "step1", label: "Step 1" },
  { value: "step2", label: "Step 2 CK (also shown to Shelf exam students)" },
  { value: "step3", label: "Step 3" },
];
const EXAM_TRACK_SHORT: Record<string, string> = { step1: "Step 1", step2: "Step 2 & Shelf", step3: "Step 3" };

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
  const searchParams = useSearchParams();
  const slots = initialSlots;

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Who a new slot is for: "existing" = only students who've already linked
  // your email under their Settings, "new" = only students who haven't,
  // "" (Everyone) = no restriction, same as every slot created before this
  // existed.
  const [audience, setAudience] = useState<"" | "existing" | "new">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<ConversationPartner | null>(null);

  // Deep-link support for "?student=..." (used by the notification bell -
  // clicking a "New message from a student" notification lands here with
  // that student pre-selected instead of just the bare student picker).
  useEffect(() => {
    const preselectId = searchParams.get("student");
    if (preselectId && !selectedPartner) {
      const match = conversationPartners.find((p) => p.id === preselectId);
      if (match) setSelectedPartner(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Editing an existing open slot in place - only offered for slots that
  // aren't booked yet (same restriction as the Remove button), since
  // changing the time or audience of a slot a student already booked would
  // silently move something they've already committed to.
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editAudience, setEditAudience] = useState<"" | "existing" | "new">("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Profile editing. Email and active status are intentionally left out
  // here (and are blocked server-side too, even if someone tried to force
  // them through): email is tied to how this mentor logs in, and active is
  // an admin-only visibility switch. Everything else here is what shows up
  // on the student-facing directory card and profile page.
  const initialExamTracks: string[] = (() => {
    const t = (mentor as Mentor & { exam_tracks?: string[] | null }).exam_tracks;
    return t && t.length > 0 ? t : ["step1"];
  })();

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(mentor.name);
  const [profileBio, setProfileBio] = useState(mentor.bio || "");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profileMedSchool, setProfileMedSchool] = useState(mentor.med_school || "");
  const [profileStep1Experience, setProfileStep1Experience] = useState(mentor.step1_experience || "");
  const [profileWhyMentor, setProfileWhyMentor] = useState(mentor.why_mentor || "");
  const [profileLanguages, setProfileLanguages] = useState((mentor.languages || []).join(", "));
  const [profileHelpAreas, setProfileHelpAreas] = useState<string[]>(mentor.help_areas || []);
  const [profileExamTracks, setProfileExamTracks] = useState<string[]>(initialExamTracks);
  const [profileResponseTime, setProfileResponseTime] = useState(mentor.response_time_note || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [photoPath, setPhotoPath] = useState(mentor.photo_path);
  const [displayName, setDisplayName] = useState(mentor.name);
  const [displayBio, setDisplayBio] = useState(mentor.bio || "");
  const [displayMedSchool, setDisplayMedSchool] = useState(mentor.med_school || "");
  const [displayStep1Experience, setDisplayStep1Experience] = useState(mentor.step1_experience || "");
  const [displayWhyMentor, setDisplayWhyMentor] = useState(mentor.why_mentor || "");
  const [displayLanguages, setDisplayLanguages] = useState(mentor.languages || []);
  const [displayHelpAreas, setDisplayHelpAreas] = useState(mentor.help_areas || []);
  const [displayExamTracks, setDisplayExamTracks] = useState<string[]>(initialExamTracks);
  const [displayResponseTime, setDisplayResponseTime] = useState(mentor.response_time_note || "");

  function toggleHelpArea(area: string) {
    setProfileHelpAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));
  }

  function toggleExamTrack(value: string) {
    setProfileExamTracks((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function startEditProfile() {
    setProfileName(displayName);
    setProfileBio(displayBio);
    setProfilePhotoFile(null);
    setProfileMedSchool(displayMedSchool);
    setProfileStep1Experience(displayStep1Experience);
    setProfileWhyMentor(displayWhyMentor);
    setProfileLanguages(displayLanguages.join(", "));
    setProfileHelpAreas(displayHelpAreas);
    setProfileExamTracks(displayExamTracks);
    setProfileResponseTime(displayResponseTime);
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
    if (profileExamTracks.length === 0) {
      setProfileError("Tick at least one exam (Step 1, Step 2 or Step 3) so students can find you.");
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

    const languagesArray = profileLanguages
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);

    const { error: updateError } = await supabase
      .from("mentors")
      .update({
        name: profileName.trim(),
        bio: profileBio.trim() || null,
        photo_path: newPhotoPath,
        med_school: profileMedSchool.trim() || null,
        step1_experience: profileStep1Experience.trim() || null,
        why_mentor: profileWhyMentor.trim() || null,
        languages: languagesArray,
        help_areas: profileHelpAreas,
        exam_tracks: profileExamTracks,
        response_time_note: profileResponseTime.trim() || null,
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
    setDisplayMedSchool(profileMedSchool.trim());
    setDisplayStep1Experience(profileStep1Experience.trim());
    setDisplayWhyMentor(profileWhyMentor.trim());
    setDisplayLanguages(languagesArray);
    setDisplayHelpAreas(profileHelpAreas);
    setDisplayExamTracks(profileExamTracks);
    setDisplayResponseTime(profileResponseTime.trim());
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
      audience: audience || null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    // Fire-and-forget in-app notification to whichever students this slot
    // is actually visible to (existing-only, new-only, or everyone -
    // mirrors slotVisibleToStudent()'s own rule). A failure here shouldn't
    // block the slot itself, which already saved successfully above.
    fetch("/api/notifications/new-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mentorId: mentor.id,
        audience: audience || null,
        dateLabel: formatSlotDate(start.toISOString()),
        timeLabel: `${formatSlotTime(start.toISOString())} - ${formatSlotTime(end.toISOString())}`,
      }),
    }).catch(() => {});

    setDate("");
    setStartTime("");
    setEndTime("");
    setAudience("");
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

  function startEditSlot(s: SlotWithBooker) {
    const startParts = utcIsoToNyWallParts(s.start_time);
    const endParts = utcIsoToNyWallParts(s.end_time);
    setEditDate(startParts.date);
    setEditStartTime(startParts.time);
    setEditEndTime(endParts.time);
    setEditAudience((s.audience as "existing" | "new" | undefined) || "");
    setEditError(null);
    setEditingSlotId(s.id);
  }

  function cancelEditSlot() {
    setEditingSlotId(null);
    setEditError(null);
  }

  async function saveEditSlot(id: string) {
    if (!editDate || !editStartTime || !editEndTime) {
      setEditError("Pick a date, start time, and end time.");
      return;
    }
    const start = new Date(nyWallTimeToUtcIso(editDate, editStartTime));
    const end = new Date(nyWallTimeToUtcIso(editDate, editEndTime));
    if (end <= start) {
      setEditError("End time has to be after the start time.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const supabase = createClient();
    // The is_booked=false guard matters here even though this button only
    // shows for open slots in the UI - it stops a race where a student
    // books the slot in the moment between the mentor opening the edit form
    // and hitting Save, instead of silently rewriting a session someone
    // just committed to.
    const { data, error: updateError } = await supabase
      .from("mentor_slots")
      .update({
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        audience: editAudience || null,
      })
      .eq("id", id)
      .eq("is_booked", false)
      .select();
    setEditSaving(false);
    if (updateError) {
      setEditError(updateError.message);
      return;
    }
    if (!data || data.length === 0) {
      setEditError("Someone just booked this slot, so it can no longer be edited.");
      router.refresh();
      return;
    }
    setEditingSlotId(null);
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
              <label className="label">Details / bio (shown as a short 2-line preview on your card)</label>
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
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Medical school</label>
                <input
                  className="input"
                  value={profileMedSchool}
                  onChange={(e) => setProfileMedSchool(e.target.value)}
                  placeholder="e.g. St. George's University"
                />
              </div>
              <div>
                <label className="label">Languages (comma separated)</label>
                <input
                  className="input"
                  value={profileLanguages}
                  onChange={(e) => setProfileLanguages(e.target.value)}
                  placeholder="English, Telugu, Hindi"
                />
              </div>
            </div>
            <div>
              <label className="label">Your Step 1 experience</label>
              <textarea
                className="input"
                rows={2}
                value={profileStep1Experience}
                onChange={(e) => setProfileStep1Experience(e.target.value)}
                placeholder="When you took it, your score/experience, what worked for you..."
              />
            </div>
            <div>
              <label className="label">Why you mentor</label>
              <textarea
                className="input"
                rows={2}
                value={profileWhyMentor}
                onChange={(e) => setProfileWhyMentor(e.target.value)}
                placeholder="What makes you want to help students through this..."
              />
            </div>
            <div>
              <label className="label">Which students do you mentor?</label>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {EXAM_TRACK_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={profileExamTracks.includes(opt.value)}
                      onChange={() => toggleExamTrack(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                You appear on the Mentorship page of students preparing for the exams you tick. Students who
                haven&apos;t picked an exam see everyone.
              </p>
            </div>
            <div>
              <label className="label">What you'll help with</label>
              <div className="grid sm:grid-cols-2 gap-2">
                {HELP_AREA_OPTIONS.map((area) => (
                  <label key={area} className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={profileHelpAreas.includes(area)}
                      onChange={() => toggleHelpArea(area)}
                    />
                    {area}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Typical response time</label>
              <input
                className="input"
                value={profileResponseTime}
                onChange={(e) => setProfileResponseTime(e.target.value)}
                placeholder="e.g. Usually within a few hours"
              />
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
              <p className="text-xs text-slate-500 mt-1">
                Mentoring: {displayExamTracks.map((t) => EXAM_TRACK_SHORT[t] ?? t).join(", ")}
              </p>
              {displayBio && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{displayBio}</p>}
            </div>
            <button type="button" onClick={startEditProfile} className="btn-secondary text-xs shrink-0">
              Edit profile
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Looking for meeting links? Each student can have their own - open a student from{" "}
        <a href="/mentorship" className="text-brand-400 hover:text-brand-300">
          your dashboard
        </a>{" "}
        and set it there.
      </p>

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
        <div className="mb-3">
          <label className="label">Who can book this slot?</label>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="radio" name="audience" checked={audience === ""} onChange={() => setAudience("")} />
              Everyone
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-300">
              <input
                type="radio"
                name="audience"
                checked={audience === "existing"}
                onChange={() => setAudience("existing")}
              />
              My existing students only
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="radio" name="audience" checked={audience === "new"} onChange={() => setAudience("new")} />
              New students only
            </label>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            "Existing students" means anyone who&apos;s linked your email under their Settings.
            "New students" means anyone browsing who hasn&apos;t linked you yet.
          </p>
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
                  {slots.map((s) =>
                    editingSlotId === s.id ? (
                      <div key={s.id} className="card py-3">
                        <p className="text-sm font-semibold mb-3">Edit slot</p>
                        <div className="grid sm:grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="label">Date</label>
                            <input
                              type="date"
                              className="input"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="label">Start time</label>
                            <input
                              type="time"
                              className="input"
                              value={editStartTime}
                              onChange={(e) => setEditStartTime(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="label">End time</label>
                            <input
                              type="time"
                              className="input"
                              value={editEndTime}
                              onChange={(e) => setEditEndTime(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="label">Who can book this slot?</label>
                          <div className="flex flex-wrap gap-3">
                            <label className="flex items-center gap-1.5
