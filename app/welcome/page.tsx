import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  new: "Our team will WhatsApp you shortly to arrange your free demo class.",
  contacted: "Our team has reached out. Please check your WhatsApp and reply to book your demo.",
  demo_scheduled: "Your demo class is scheduled. We'll send you the details on WhatsApp.",
  demo_done: "Thanks for attending the demo. We're matching you with the right mentor.",
  ready_for_mentor: "We're matching you with the right mentor and will update you soon.",
  mentor_assigned: "A mentor has been assigned to you. Open your dashboard to get started.",
  not_interested: "Thanks! You can still explore Master Grid whenever you like.",
};

export default async function WelcomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, whatsapp")
    .eq("id", user.id)
    .maybeSingle();
  const { data: lead } = await supabase
    .from("student_leads")
    .select("status")
    .eq("student_id", user.id)
    .maybeSingle();

  const p = profile as { full_name: string | null; whatsapp: string | null } | null;
  const status = (lead as { status: string } | null)?.status ?? "new";
  const first = (p?.full_name ?? "").split(" ")[0];

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="card max-w-lg w-full text-center">
        <h1 className="text-xl font-bold mb-2">Thank you{first ? `, ${first}` : ""}!</h1>
        <p className="text-sm text-slate-300 mb-4">{STATUS_TEXT[status] ?? STATUS_TEXT.new}</p>

        {p?.whatsapp && (
          <p className="text-xs text-slate-500 mb-4">
            We&apos;ll message you on <b>{p.whatsapp}</b>. Wrong number? You can change it in Settings.
          </p>
        )}

        <div className="text-left text-sm text-slate-300 rounded-xl border border-slate-700 p-4 mb-5">
          <p className="font-semibold mb-2">What happens next</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Someone from our team contacts you on WhatsApp and shows you how Master Grid works.</li>
            <li>You attend a free demo class.</li>
            <li>We match you with a mentor who builds your plan and follows your progress.</li>
          </ol>
        </div>

        <Link href="/dashboard" className="btn-primary inline-block">
          Go to my dashboard
        </Link>
      </div>
    </main>
  );
}
