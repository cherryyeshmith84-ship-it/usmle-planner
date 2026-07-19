import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import QBankBulkImportForm from "@/components/QBankBulkImportForm";

export const dynamic = "force-dynamic";

export default async function QBankBulkImportPage() {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Bulk import questions</h1>
            <p className="text-sm text-slate-400 mt-1">
              Add many questions to the pool at once. Every import lands in the{" "}
              <Link href="/admin/qbank/review" className="text-brand-400 hover:text-brand-300">
                Review queue
              </Link>{" "}
              as &quot;Under review&quot; - nothing here reaches students until you publish it.
            </p>
          </div>
          <Link href="/admin/qbank/new" className="btn-secondary shrink-0 text-sm">
            Add one question instead
          </Link>
        </div>

        <QBankBulkImportForm userId={user.id} />
      </main>
    </div>
  );
}
