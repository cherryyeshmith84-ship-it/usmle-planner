import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor } from "@/lib/mentors";
import { findMentorByEmail } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import ClaimStudentButton from "@/components/ClaimStudentButton";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

/**
 * Self-service version of the admin "Waiting for a mentor" list
 * (app/admin/page.tsx) - open to any active mentor, not just admins, so a
 * mentor doesn't have to wait on an admin to hand-assign a new signup to
 * them. Shows every student with no mentor yet (profiles.mentor_email is
 * null), oldest signup first, with a "Take this student" button
 * (ClaimStudentButton.tsx) that self-assigns via the claim_waiting_student
 * RPC. The moment a student is claimed - by this mentor or anyone else -
 * their mentor_email is no longer null, so they naturally drop off this
 * list for everyone on the next load.
 *
 * The actual filtering (excluding mentor/tutor accounts themselves from
 * showing up as "students waiting") happens in the database via the
 * "Mentors can view students waiting for a mentor" RLS policy on
 * profiles, not here in JS - so this query only ever returns real
 * students, the same guarantee is_mentor_of_student gives everywhere else
 * a mentor reads student data.
 */
export default async function WaitingForMentorPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();
  const profile = profileData as Pick<Profile, "is_admin" | "full_name"> | null;
  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  const { data: mentorsData } = await supabase.from("mentors").select("*").eq("active", true);
  const mentors = (mentorsData ?? []) as Mentor[];
  const myMentorRecord = findMentorByEmail(mentors, user.email);

  // Only an active mentor has any reason to be here - the RLS policy
  // backing the query below would return nothing for anyone else anyway,
  // but redirecting is a friendlier result than an empty page.
  if (!myMentorRecord && !profile?.is_admin) redirect("/mentorship");

  const { data: waitingData } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, exam_track, subject_name, prep_stage, exam_date, created_at"
    )
    .is("mentor_email", null)
    .order("created_at", { ascending: true });
  type WaitingProfile = Pick<Profile,
    "id" | "full_name" | "email" | "exam_track" | "subject_name" | "prep_stage" | "exam_date" | "created_at"
  >;
  const waiting = (waitingData ?? []) as WaitingProfile[];

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full max-w-4xl mx-auto">
        <Link href="/mentorship" className="text-xs text-brand-400 hover:text-brand-300">
          ← Back to Mentorship
        </Link>
        <h1 className="text-xl font-bold mt-2 mb-1">Waiting for a mentor ({waiting.length})</h1>
        <p className="text-sm text-slate-400 mb-6">
          Students who signed up but don&apos;t have a mentor yet - oldest application first. Take one and
          they&apos;ll show up in your Students list right away.
        </p>

        {waiting.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody&apos;s waiting on a mentor right now.</p>
        ) : (
          <div className="space-y-3">
            {waiting.map((s) => (
              <div key={s.id} className="card">
                <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                  <h3 className="font-semibold">{s.full_name || s.email || "Unnamed student"}</h3>
                  <span className="text-xs font-semibold bg-slate-800 text-slate-300 rounded-full px-2 py-1">
                    {s.exam_track === "subject"
                      ? `Subject${s.subject_name ? `: ${s.subject_name}` : ""}`
                      : s.prep_stage
                      ? STAGE_LABEL[s.prep_stage] ?? s.prep_stage
                      : "Step 1"}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mb-3">
                  {s.email}
                  {s.exam_date ? ` · exam ${s.exam_date}` : ""}
                  {s.created_at ? ` · applied ${s.created_at.slice(0, 10)}` : ""}
                </p>
                <ClaimStudentButton studentId={s.id} />
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
