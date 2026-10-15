import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function csv(v: unknown) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

// Admin-only CSV of every recorded terms acceptance.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) return new NextResponse("Forbidden", { status: 403 });

  const { data } = await supabase.from("terms_acceptances").select("*").order("accepted_at", { ascending: false });
  const header = ["Name", "Email", "Terms version", "Accepted at (UTC)", "IP address", "Browser", "Statement"];
  const rows = (data ?? []).map((a) =>
    [a.full_name, a.email, a.terms_version, a.accepted_at, a.ip_address, a.user_agent, a.statement].map(csv).join(",")
  );
  return new NextResponse([header.map(csv).join(","), ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="terms-acceptances.csv"',
    },
  });
}
