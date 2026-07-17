import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import ConceptLibraryClient, { type ConceptLibraryRow } from "@/components/ConceptLibraryClient";

export const dynamic = "force-dynamic";

export default async function ConceptLibraryPage() {
  const { supabase, user } = await requireAdmin();

  const { data } = await supabase
    .from("concept_library")
    .select("*")
    .order("system")
    .order("topic")
    .order("concept");

  const rows = (data ?? []) as ConceptLibraryRow[];

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Concept Library</h1>
        <p className="text-sm text-slate-400 mb-6">
          The canonical list of systems, topics, and concepts. Build this out before tagging
          questions at scale - Master Grid and Smart Review group everything by exact string
          match on topic/subtopic/primary concept, so a typo or near-duplicate name (&quot;VIPoma&quot;
          vs &quot;Vipoma&quot;) silently splits into two separate rows instead of counting as one.
        </p>
        <ConceptLibraryClient initialRows={rows} userId={user.id} />
      </main>
    </div>
  );
}
