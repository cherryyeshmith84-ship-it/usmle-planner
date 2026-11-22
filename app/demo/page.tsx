import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DemoLeads from "@/components/DemoLeads";

export const dynamic = "force-dynamic";

/**
 * Demo team home. Demo team members (added by an admin on Admin -> Leads) see
 * every new student's details, contact them on WhatsApp, run the demo, add
 * notes and suggest a mentor. They never see mentor or admin data - all of
 * this goes through the demo_* database functions, which only allow demo team
 * members and admins.
 */
export default async function DemoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isDemo } = await supabase.rpc("is_demo_team");
  const { data: profile } = await supabase.from("profiles").select("is_admin, full_name").eq("id", user.id).maybeSingle();
  const isAdmin = !!(profile as { is_admin: boolean } | null)?.is_admin;
  if (isDemo !== true && !isAdmin) redirect("/dashboard");

  const name = (profile as { full_name: string | null } | null)?.full_name ?? "";

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={28} height={28} className="rounded-md" />
            <span className="font-bold text-brand-300">Master Grid</span>
            <span className="text-xs font-semibold bg-brand-900/40 text-brand-300 rounded-full px-2 py-1">Demo team</span>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-medium text-slate-400 hover:text-slate-200">Log out</button>
          </form>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">New students</h1>
        <p className="text-sm text-slate-400 mb-6">
          Contact each new student on WhatsApp, explain how Master Grid works and run the demo. Write your notes, then
          mark the student &ldquo;Ready for mentor&rdquo; and suggest a mentor. The admin confirms the mentor.
        </p>
        <DemoLeads isAdmin={false} who={name.split(" ")[0]} />
      </main>
    </div>
  );
}
