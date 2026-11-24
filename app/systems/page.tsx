import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import StudentTopicChecklist, { type TopicChecklistRow } from "@/components/StudentTopicChecklist";

export const dynamic = "force-dynamic";

/**
 * Systems Covered: the read-only Systems & Disciplines checklist and the Self
 * Assessments list your mentor fills in (it used to sit at the bottom of the
 * Analysis page). Step 1 only - Step 2 CK / Shelf students are sent to
 * Analysis instead.
 */
export default async function SystemsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name, exam_track")
    .eq("id", user.id)
    .single();

  const examTrack = (profileData as { exam_track?: string | null } | null)?.exam_track ?? null;
  if (examTrack === "step2" || examTrack === "subject") redirect("/history");

  const contentPublished = profileData?.is_admin ? true : await getContentPublished(supabase);

  // Read-only view of the Systems & Disciplines checklist a mentor fills in.
  const { data: topicChecklistData } = await supabase
    .from("student_topic_checklist")
    .select("resource, category, topic, completed")
    .eq("student_id", user.id);
  const topicChecklistRows = (topicChecklistData ?? []) as TopicChecklistRow[];

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Systems Covered</h1>
        <p className="text-sm text-slate-400 mb-6">
          The systems, disciplines and self-assessments your mentor has covered with you.
        </p>
        <StudentTopicChecklist studentId={user.id} initialRows={topicChecklistRows} readOnly />
      </main>
    </AppShell>
  );
}
