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
  const [mentorsRes, linkedProfilesRes] = await Promise.all([
    supabase.from("mentors").select("*").order("created_at", { ascending: false }),
    // Just the mentor_email column, for a quick per-mentor student count on
    // each row below - the full per-mentor breakdown (which students, their
    // progress, sessions, feedback) lives one click away at
    // /admin/mentors/[id].
    supabase.from("profiles").select("mentor_email").not("mentor_email", "is", null),
  ]);
  const mentors = (mentorsRes.data ?? []) as Mentor[];

  const studentCounts: Record<string, number> = {};
  for (const row of (linkedProfilesRes.data ?? []) as { mentor_email: string }[]) {
    const key = row.mentor_email.trim().toLowerCase();
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
