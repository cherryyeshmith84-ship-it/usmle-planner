import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import AssessmentForm from "@/components/AssessmentForm";

export const dynamic = "force-dynamic";

export default async function NewAssessmentPage() {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6">New self assessment</h1>
        <AssessmentForm userId={user.id} />
      </main>
    </div>
  );
}
