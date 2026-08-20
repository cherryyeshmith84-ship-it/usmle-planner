import { requireAdmin } from "@/lib/adminGuard";
import type { Mentor } from "@/lib/mentors";
import AdminNav from "@/components/AdminNav";
import MentorAdminClient from "@/components/MentorAdminClient";

export const dynamic = "force-dynamic";

/**
 * Admin-only mentor directory management: add/edit mentors (name, email,
 * bio, photo), activate/deactivate, delete. A mentor never gets a special
 * "role" flag - whoever signs up (normal /signup flow) with an email that
 * matches a row here automatically sees the mentor availability view
 * instead of the student dashboard (see app/mentorship/page.tsx).
 */
export default async function AdminMentorsPage() {
  const { supabase } = await requireAdmin();
  const [mentorsRes, linkedViaMentorRes, linkedViaTutorRes] = await Promise.all([
    supabase.from("mentors").select("*").order("created_at", { ascending: false }),
    // Two separate columns, for a quick per-mentor/tutor student count on
    // each row below - the full per-person breakdown (which students, their
    // progress, sessions, feedback) lives one click away at
    // /admin/mentors/[id]. mentor_email and tutor_email are tracked as
    // fully separate relationships (see lib/types.ts), so both are counted
    // and merged below - otherwise a tutor-only row would always show 0
    // even with students linked via "Your tutor's email" in Settings.
    supabase.from("profiles").select("mentor_email").not("mentor_email", "is", null),
    supabase.from("profiles").select("tutor_email").not("tutor_email", "is", null),
  ]);
  // Mentors-only list now - a pure Tutor (role "tutor") belongs on the
  // separate /admin/tutors page instead, even though both are rows in this
  // same underlying mentors table. Mentor+Tutor rows still show up here
  // (and also on /admin/tutors) since they genuinely do both jobs.
  const mentors = ((mentorsRes.data ?? []) as Mentor[]).filter((m) => (m.role ?? "mentor") !== "tutor");

  const studentCounts: Record<string, number> = {};
  for (const row of (linkedViaMentorRes.data ?? []) as { mentor_email: string }[]) {
    const key = row.mentor_email.trim().toLowerCase();
    studentCounts[key] = (studentCounts[key] ?? 0) + 1;
  }
  for (const row of (linkedViaTutorRes.data ?? []) as { tutor_email: string }[]) {
    const key = row.tutor_email.trim().toLowerCase();
    studentCounts[key] = (studentCounts[key] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Mentors</h1>
        <p className="text-sm text-slate-400 mb-6">
          Add a mentor's name, email, details, and photo. Once they sign up at the normal login page
          using that exact email, they'll automatically see an availability page instead of the student
          dashboard - no separate invite needed. Click a mentor's student count to see their full
          dashboard: every linked student and their progress, upcoming sessions, and all feedback.
        </p>
        <MentorAdminClient initialMentors={mentors} studentCounts={studentCounts} />
      </main>
    </div>
  );
}
