import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import TemplateForm from "@/components/TemplateForm";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-screen">
      <AdminNav />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6">New template</h1>
        <TemplateForm userId={user.id} />
      </main>
    </div>
  );
}
