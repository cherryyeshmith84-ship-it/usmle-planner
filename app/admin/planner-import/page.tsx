import { requireAdmin } from "@/lib/adminGuard";
import { isMentorProfile, mentorEmailSet } from "@/lib/mentors";
import AdminNav from "@/components/AdminNav";
import PlannerImportClient, { type ImportStudent } from "@/components/PlannerImportClient";

export const dynamic = "force-dynamic";

/**
 * Admin -> Planner import. Upload an Excel study plan (one row per task),
 * choose the student and the start date, preview, and import it straight
 * into that student's Master Grid study planner.
 */
export default async function PlannerImportPage() {
  const { supabase, user } = await requireAdmin();

  const [profilesRes, mentorsRes, viewersRes, settingsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, is_admin, mentor_email").neq("id", user.id).order("full_name"),
    supabase.from("mentors").select("id, email"),
    supabase.from("viewers").select("email"),
    supabase.from("student_planner_settings").select("student_id, start_date"),
  ]);

  const mentorRows = (mentorsRes.data ?? []) as { id: string; email: string }[];
  const mentorEmails = mentorEmailSet(mentorRows);
  const mentorIdByEmail = new Map(mentorRows.map((m) => [m.email.toLowerCase(), m.id]));
  const viewerEmails = new Set(((viewersRes.data ?? []) as { email: string }[]).map((v) => v.email.toLowerCase()));
  const startByStudent = new Map(
    ((settingsRes.data ?? []) as { student_id: string; start_date: string | null }[]).map((s) => [s.student_id, s.start_date])
  );

  const students: ImportStudent[] = ((profilesRes.data ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    is_admin: boolean;
    mentor_email: string | null;
  }[])
    .filter(
      (p) =>
        !p.is_admin &&
        p.email &&
        !isMentorProfile(p.email, mentorEmails) &&
        !viewerEmails.has(p.email.toLowerCase())
    )
    .map((p) => ({
      id: p.id,
      name: p.full_name || p.email || "Unnamed",
      email: p.email as string,
      mentorId: p.mentor_email ? mentorIdByEmail.get(p.mentor_email.toLowerCase()) ?? null : null,
      startDate: startByStudent.get(p.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Planner import</h1>
        <p className="text-sm text-slate-400 mb-6">
          Turn an Excel study plan into a Master Grid study planner for a student. Pick the student, pick the
          date the plan should start, upload the sheet, check the preview, and import.
        </p>
        <PlannerImportClient students={students} />
      </main>
    </div>
  );
}
