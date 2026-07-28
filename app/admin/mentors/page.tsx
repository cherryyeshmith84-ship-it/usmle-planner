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
  const { data } = await supabase.from("mentors").select("*").order("created_at", { ascending: false });
  const mentors = (data ?? []) as Mentor[];

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Mentors</h1>
        <p className="text-sm text-slate-400 mb-6">
          Add a mentor's name, email, details, and photo. Once they sign up at the normal login page
          using that exact email, they'll automatically see an availability page instead of the student
          dashboard - no separate invite needed.
        </p>
        <MentorAdminClient initialMentors={mentors} />
      </main>
    </div>
  );
}
