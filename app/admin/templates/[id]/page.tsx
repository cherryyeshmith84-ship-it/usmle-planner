import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import type { ScheduleTemplate } from "@/lib/types";
import AdminNav from "@/components/AdminNav";
import TemplateForm from "@/components/TemplateForm";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireAdmin();

  const { data } = await supabase
    .from("schedule_templates")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!data) notFound();

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6">Edit template</h1>
        <TemplateForm userId={user.id} initial={data as ScheduleTemplate} />
      </main>
    </div>
  );
}
