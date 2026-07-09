import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import QBankQuestionForm from "@/components/QBankQuestionForm";

export const dynamic = "force-dynamic";

export default async function NewQBankQuestionPage() {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6">Add question to pool</h1>
        <QBankQuestionForm userId={user.id} />
      </main>
    </div>
  );
}
