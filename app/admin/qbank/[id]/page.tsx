import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import type { QBankQuestion } from "@/lib/qbankTypes";
import AdminNav from "@/components/AdminNav";
import QBankQuestionForm from "@/components/QBankQuestionForm";

export const dynamic = "force-dynamic";

export default async function EditQBankQuestionPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireAdmin();

  const { data } = await supabase.from("qbank_questions").select("*").eq("id", params.id).single();
  if (!data) notFound();
  const question = data as QBankQuestion;

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6">Edit question</h1>
        <QBankQuestionForm userId={user.id} initial={question} />
      </main>
    </div>
  );
}

