import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Called by the onboarding form right after a student submits it. Emails the
 * Master Grid inbox: "this student signed up and is waiting for a demo".
 *
 * Who receives it: LEADS_NOTIFY_EMAIL (one address or several separated by
 * commas). If that is not set, it goes to every admin's email instead.
 * Sender: REMINDER_FROM_EMAIL, same variable the other emails already use.
 *
 * It always answers 200 so a failed email never blocks the student.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;
  if (!url || !key || !apiKey) return NextResponse.json({ ok: false, reason: "not configured" });

  const service = createServiceClient(url, key);

  const { data: p } = await service
    .from("profiles")
    .select(
      "full_name, email, whatsapp, country, timezone, best_contact_time, situation, latest_score, biggest_problem, exam_track, exam_date, resources"
    )
    .eq("id", user.id)
    .maybeSingle();
  const prof = (p ?? {}) as Record<string, any>;

  let to: string[] = (process.env.LEADS_NOTIFY_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) {
    const { data: admins } = await service.from("profiles").select("email").eq("is_admin", true);
    to = ((admins ?? []) as { email: string | null }[]).map((a) => a.email || "").filter(Boolean);
  }
  if (to.length === 0) return NextResponse.json({ ok: false, reason: "no recipient" });

  const name = prof.full_name || user.email || "A student";
  const email = prof.email || user.email || "";
  const wa: string = prof.whatsapp || "";
  const waLink = wa ? `https://wa.me/${wa.replace(/\D/g, "")}` : "";

  const rows: [string, string][] = [
    ["Name", name],
    ["Email", email],
    ["WhatsApp", wa],
    ["Country", prof.country || ""],
    ["Best time to contact", [prof.best_contact_time, prof.timezone].filter(Boolean).join(" - ")],
    ["Preparing for", prof.exam_track === "step1" ? "Step 1" : prof.exam_track || ""],
    ["Situation", prof.situation || ""],
    ["Exam date", prof.exam_date || "Not booked"],
    ["Latest score", prof.latest_score || ""],
    ["Biggest problem", prof.biggest_problem || ""],
    ["Resources", Array.isArray(prof.resources) ? prof.resources.join(", ") : ""],
  ].filter((r) => r[1]) as [string, string][];

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
      <p><strong>${esc(name)}</strong> signed up on Master Grid and is <strong>waiting for a demo</strong>.</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding: 3px 14px 3px 0; color: #666;">${esc(k)}</td><td style="padding: 3px 0;">${esc(v)}</td></tr>`
          )
          .join("")}
      </table>
      ${waLink ? `<p><a href="${waLink}">Message on WhatsApp</a></p>` : ""}
      <p><a href="https://mastergrid.online/admin/leads">Open Leads &amp; demo team</a></p>
      <p>- Master Grid</p>
    </div>`;
  const text =
    `${name} signed up on Master Grid and is waiting for a demo.\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    (waLink ? `\n\nWhatsApp: ${waLink}` : "") +
    `\nLeads: https://mastergrid.online/admin/leads\n\n- Master Grid`;

  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `New student waiting for demo: ${name}`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ ok: false, reason: t.slice(0, 200) });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: e?.message || "failed" });
  }
  return NextResponse.json({ ok: true });
}
