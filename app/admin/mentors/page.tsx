import { requireAdmin } from "@/lib/adminGuard";
import type { Mentor } from "@/lib/mentors";
import AdminNav from "@/components/AdminNav";
import MentorAdminClient from "@/components/MentorAdminClient";
import MentorPassedEditor from "@/components/MentorPassedEditor";

export const dynamic = "force-dynamic";

/**
 * Admin-only mentor directory management: add/edit mentors (name, email,
 * bio, photo), activate/deactivate, delete, and set how many students passed
 * with each mentor (shown to students on the mentor cards).
 */
export default async function AdminMentorsPage() {
  const { supabase } = await requireAdmin();
  const [mentorsRes, linkedViaMentorRes, linkedViaTutorRes] = await Promise.all([
    supabase.from("mentors").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("mentor_email").not("mentor_email", "is", null),
    supabase.from("profiles").select("tutor_email").not("tutor_email", "is", null),
  ]);
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

  const passedRows = [...mentors]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ id: m.id, name: m.name, students_passed: Number((m as any).students_passed ?? 0) }));

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
        <MentorPassedEditor rows={passedRows} />
        <MentorAdminClient initialMentors={mentors} studentCounts={studentCounts} />
      </main>
    </div>
  );
}
