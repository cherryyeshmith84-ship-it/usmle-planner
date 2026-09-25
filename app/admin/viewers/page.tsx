import { requireAdmin } from "@/lib/adminGuard";
import type { Viewer } from "@/lib/viewers";
import AdminNav from "@/components/AdminNav";
import ViewerAdminClient from "@/components/ViewerAdminClient";

export const dynamic = "force-dynamic";

/**
 * Admin-only roster management for "viewers" - a pool of people who are
 * NOT mentors, kept in their own table (see migration
 * create_viewers_and_student_viewers) and their own portal
 * (/viewer/signup, /viewer/login, /viewer). Sibling page to
 * /admin/mentors, but simpler: no student-count-per-row here, since a
 * viewer's per-student grants are managed per-student on the main Students
 * page (see StudentViewersEditor.tsx), not per-viewer here.
 */
export default async function AdminViewersPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("viewers").select("*").order("created_at", { ascending: false });
  const viewers = (data ?? []) as Viewer[];

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Viewers</h1>
        <p className="text-sm text-slate-400 mb-6">
          People who can see specific students read-only, without being a mentor themselves - no
          availability, no sessions, no editing anything, just whatever students you grant them below.
          Add someone here first, then grant them access to individual students from the{" "}
          <a href="/admin" className="text-brand-400 hover:text-brand-300">
            Students
          </a>{" "}
          page.
        </p>
        <ViewerAdminClient initialViewers={viewers} />
      </main>
    </div>
  );
}
