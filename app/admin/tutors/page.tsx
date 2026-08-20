import { requireAdmin } from "@/lib/adminGuard";
import type { Mentor } from "@/lib/mentors";
import AdminNav from "@/components/AdminNav";
import TutorAdminClient from "@/components/TutorAdminClient";

export const dynamic = "force-dynamic";

/**
 * Admin-only Tutors management - fully separate page from /admin/mentors
 * (own nav item, own Add form, own list), even though both read/write the
 * same underlying `mentors` table with a `role` column. See
 * components/TutorAdminClient.tsx's header comment for why it's split out
 * this way instead of one shared Mentor/Tutor/Both form.
 */
export default async function AdminTutorsPage() {
  const { supabase } = await requireAdmin();
  const [mentorsRes, linkedProfilesRes] = await Promise.all([
    supabase.from("mentors").select("*").order("created_at", { ascending: false }),
    // tutor_email, not mentor_email - a tutor's student count here is
    // whoever linked THEM specifically as their tutor (see "Your tutor's
    // email" in Settings), a fully separate relationship from mentoring.
    supabase.from("profiles").select("tutor_email").not("tutor_email", "is", null),
  ]);
  // Tutors-only list - a pure Mentor (role "mentor" or unset) belongs on
  // /admin/mentors instead. Mentor+Tutor rows show up here too, since they
  // genuinely do both jobs.
  const tutors = ((mentorsRes.data ?? []) as Mentor[]).filter((m) => (m.role ?? "mentor") !== "mentor");

  const studentCounts: Record<string, number> = {};
  for (const row of (linkedProfilesRes.data ?? []) as { tutor_email: string }[]) {
    const key = row.tutor_email.trim().toLowerCase();
    studentCounts[key] = (studentCounts[key] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Tutors</h1>
        <p className="text-sm text-slate-400 mb-6">
          Add a tutor&apos;s name, email, details, and photo. Once they sign up at the normal login
          page using that exact email, they&apos;ll automatically see their tutoring dashboard - no
          separate invite needed. Click a tutor&apos;s student count to see their full dashboard.
        </p>
        <TutorAdminClient initialTutors={tutors} studentCounts={studentCounts} />
      </main>
    </div>
  );
}
