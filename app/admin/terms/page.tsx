import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import AdminNav from "@/components/AdminNav";
import { TERMS_VERSION } from "@/lib/terms";

export const dynamic = "force-dynamic";

type Acceptance = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  terms_version: string;
  accepted_at: string;
  ip_address: string | null;
};

export default async function AdminTermsPage() {
  const { supabase } = await requireAdmin();

  const [accRes, profRes, mentorRes, viewerRes] = await Promise.all([
    supabase.from("terms_acceptances").select("*").order("accepted_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, is_admin"),
    supabase.from("mentors").select("email").eq("active", true),
    supabase.from("viewers").select("email").eq("active", true),
  ]);

  const acceptances = (accRes.data ?? []) as Acceptance[];
  const exempt = new Set<string>(
    [...(mentorRes.data ?? []), ...(viewerRes.data ?? [])].map((r: { email: string }) => r.email.toLowerCase())
  );
  const acceptedCurrent = new Set(acceptances.filter((a) => a.terms_version === TERMS_VERSION).map((a) => a.user_id));
  const pending = ((profRes.data ?? []) as { id: string; full_name: string | null; email: string | null; is_admin: boolean }[])
    .filter((p) => !p.is_admin && !acceptedCurrent.has(p.id) && !(p.email && exempt.has(p.email.toLowerCase())));

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }) + " ET";

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold mb-1">Terms acceptances</h1>
            <p className="text-sm text-slate-400">
              Current version: <span className="font-semibold">{TERMS_VERSION}</span> &middot;{" "}
              {acceptedCurrent.size} accepted &middot; {pending.length} pending
            </p>
          </div>
          <a href="/admin/terms/export" className="btn-secondary text-sm">
            Download CSV
          </a>
        </div>

        <section className="card">
          <h2 className="font-semibold mb-3">Accepted ({acceptances.length})</h2>
          {acceptances.length === 0 ? (
            <p className="text-sm text-slate-400">No acceptances yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase">
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Version</th>
                    <th className="py-2 pr-3">Accepted</th>
                    <th className="py-2 pr-3">IP</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {acceptances.map((a) => (
                    <tr key={a.id} className="border-t border-slate-800">
                      <td className="py-2 pr-3 font-medium">{a.full_name || "-"}</td>
                      <td className="py-2 pr-3">{a.email || "-"}</td>
                      <td className="py-2 pr-3">{a.terms_version}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmt(a.accepted_at)}</td>
                      <td className="py-2 pr-3">{a.ip_address || "-"}</td>
                      <td className="py-2 text-right">
                        <Link href={`/admin/terms/${a.id}`} className="text-brand-400 hover:text-brand-300">
                          View record
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="font-semibold mb-3">Not yet accepted ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400">Everyone has accepted the current version.</p>
          ) : (
            <ul className="text-sm divide-y divide-slate-800">
              {pending.map((p) => (
                <li key={p.id} className="py-2 flex justify-between gap-3">
                  <span className="font-medium">{p.full_name || "-"}</span>
                  <span className="text-slate-400">{p.email}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
