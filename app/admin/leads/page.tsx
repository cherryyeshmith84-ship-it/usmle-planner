import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import DemoLeads from "@/components/DemoLeads";
import DemoTeamAdmin, { type DemoMember } from "@/components/DemoTeamAdmin";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("demo_team").select("id, email, name, active").order("created_at", { ascending: true });

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Leads and demo team</h1>
        <p className="text-sm text-slate-400 mb-6">
          Every student who finishes the intake appears here. The demo team contacts them and runs the demo, then marks
          them &ldquo;Ready for mentor&rdquo; with a suggested mentor. Open the student and use Assign mentor to confirm.
        </p>
        <DemoTeamAdmin members={(data ?? []) as DemoMember[]} />
        <DemoLeads isAdmin who="the Master Grid team" />
      </main>
    </div>
  );
}
