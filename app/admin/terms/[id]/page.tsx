import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import TermsText from "@/components/TermsText";
import PrintButton from "@/components/PrintButton";
import { TERMS_VERSION } from "@/lib/terms";

export const dynamic = "force-dynamic";

export default async function TermsRecordPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const { data: a } = await supabase.from("terms_acceptances").select("*").eq("id", params.id).maybeSingle();
  if (!a) notFound();

  const when =
    new Date(a.accepted_at).toLocaleString("en-US", { dateStyle: "full", timeStyle: "long", timeZone: "America/New_York" });

  return (
    <div className="min-h-screen flex">
      <div className="print:hidden">
        <AdminNav />
      </div>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link href="/admin/terms" className="text-sm text-brand-400 hover:text-brand-300">
            &larr; All acceptances
          </Link>
          <PrintButton />
        </div>

        <h1 className="text-xl font-bold mb-1">Master Grid - Record of Acceptance</h1>
        <div className="card text-sm space-y-1 mb-6">
          <p><span className="text-slate-500">Student:</span> <strong>{a.full_name || "-"}</strong></p>
          <p><span className="text-slate-500">Email:</span> {a.email || "-"}</p>
          <p><span className="text-slate-500">Accepted on:</span> {when}</p>
          <p><span className="text-slate-500">Terms version:</span> {a.terms_version}</p>
          <p><span className="text-slate-500">IP address:</span> {a.ip_address || "-"}</p>
          <p><span className="text-slate-500">Browser:</span> {a.user_agent || "-"}</p>
          <p><span className="text-slate-500">Statement ticked:</span> &ldquo;{a.statement}&rdquo;</p>
          {a.terms_version !== TERMS_VERSION && (
            <p className="text-amber-500">
              Note: this acceptance was for version {a.terms_version}; the text below is the current version ({TERMS_VERSION}).
            </p>
          )}
        </div>

        <TermsText />
      </main>
    </div>
  );
}
