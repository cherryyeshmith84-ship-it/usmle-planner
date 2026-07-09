import { requireAdmin } from "@/lib/adminGuard";
import type { AssessmentKind } from "@/lib/types";
import AdminNav from "@/components/AdminNav";
import AssessmentForm from "@/components/AssessmentForm";

export const dynamic = "force-dynamic";

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: { kind?: string };
}) {
  const { user } = await requireAdmin();
  const defaultKind: AssessmentKind = searchParams?.kind === "qbank" ? "qbank" : "self_assessment";

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6">
          {defaultKind === "qbank" ? "New question bank item" : "New self assessment"}
        </h1>
        <AssessmentForm userId={user.id} defaultKind={defaultKind} />
      </main>
    </div>
  );
}
