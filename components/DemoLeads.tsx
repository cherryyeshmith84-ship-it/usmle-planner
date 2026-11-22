"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Lead = {
  student_id: string;
  full_name: string | null;
  email: string | null;
  whatsapp: string | null;
  whatsapp_consent: boolean | null;
  country: string | null;
  timezone: string | null;
  best_contact_time: string | null;
  exam_track: string | null;
  prep_stage: string | null;
  subject_name: string | null;
  exam_date: string | null;
  resources: string[] | null;
  latest_score: string | null;
  biggest_problem: string | null;
  weak_areas: string | null;
  goals_notes: string | null;
  mentor_email: string | null;
  signed_up_at: string;
  status: string;
  demo_member_email: string | null;
  demo_at: string | null;
  notes: string | null;
  recommended_mentor_id: string | null;
  recommend_note: string | null;
  assigned_mentor_id: string | null;
  situation: string | null;
};

type MentorOpt = { id: string; name: string; email: string; specialties: string[] | null; student_count: number };

const STATUSES: { v: string; l: string }[] = [
  { v: "new", l: "New" },
  { v: "contacted", l: "Contacted" },
  { v: "demo_scheduled", l: "Demo scheduled" },
  { v: "demo_done", l: "Demo done" },
  { v: "ready_for_mentor", l: "Ready for mentor" },
  { v: "mentor_assigned", l: "Mentor assigned" },
  { v: "not_interested", l: "Not interested" },
];
const LABEL: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.v, s.l]));
const COLOR: Record<string, string> = {
  new: "bg-amber-100 text-amber-700",
  contacted: "bg-sky-100 text-sky-700",
  demo_scheduled: "bg-indigo-100 text-indigo-700",
  demo_done: "bg-violet-100 text-violet-700",
  ready_for_mentor: "bg-orange-100 text-orange-700",
  mentor_assigned: "bg-green-100 text-green-700",
  not_interested: "bg-slate-100 text-slate-500",
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function waLink(lead: Lead, who: string) {
  const digits = (lead.whatsapp ?? "").replace(/\D/g, "");
  const first = (lead.full_name ?? "").split(" ")[0] || "there";
  const text =
    `Hi ${first}, this is ${who || "the team"} from Master Grid. Thanks for signing up! ` +
    `I'd love to show you how Master Grid works and set up a free demo class for you. ` +
    `What time works best for you?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function LeadCard({
  lead,
  mentors,
  isAdmin,
  who,
  onSaved,
}: {
  lead: Lead;
  mentors: MentorOpt[];
  isAdmin: boolean;
  who: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(lead.status === "new");
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [demoAt, setDemoAt] = useState(toLocalInput(lead.demo_at));
  const [recMentor, setRecMentor] = useState(lead.recommended_mentor_id ?? "");
  const [recNote, setRecNote] = useState(lead.recommend_note ?? "");
  const [assignId, setAssignId] = useState(lead.assigned_mentor_id ?? lead.recommended_mentor_id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const recName = mentors.find((m) => m.id === lead.recommended_mentor_id)?.name;
  const assignedName = mentors.find((m) => m.id === lead.assigned_mentor_id)?.name;

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("demo_update_lead", {
      p_student_id: lead.student_id,
      p_status: status,
      p_notes: notes,
      p_demo_at: demoAt ? new Date(demoAt).toISOString() : null,
      p_recommended_mentor: recMentor || null,
      p_recommend_note: recNote,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg(status === "ready_for_mentor" ? "Saved. The admin has been notified." : "Saved.");
    onSaved();
  }

  async function assign() {
    if (!assignId) return;
    const m = mentors.find((x) => x.id === assignId);
    if (!confirm(`Assign ${lead.full_name ?? "this student"} to ${m?.name ?? "this mentor"}? The mentor will get access to the student's planner.`)) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_assign_mentor", { p_student_id: lead.student_id, p_mentor_id: assignId });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg("Mentor assigned.");
    onSaved();
  }

  const track =
    lead.exam_track === "step1"
      ? `Step 1${lead.prep_stage ? ` (${lead.prep_stage})` : ""}`
      : lead.exam_track === "subject"
      ? `Subject: ${lead.subject_name ?? ""}`
      : "Not filled yet";

  return (
    <div className="card mb-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-start justify-between gap-3 text-left">
        <div>
          <p className="font-semibold">{lead.full_name || "Unnamed student"}</p>
          <p className="text-xs text-slate-500">
            {lead.email} · signed up {new Date(lead.signed_up_at).toLocaleDateString()}
            {lead.country ? ` · ${lead.country}` : ""}
          </p>
        </div>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${COLOR[lead.status] ?? ""}`}>
          {LABEL[lead.status] ?? lead.status}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {lead.whatsapp ? (
              <>
                <a
                  href={waLink(lead, who)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-sm"
                >
                  WhatsApp {lead.whatsapp}
                </a>
                {!lead.whatsapp_consent && <span className="text-xs text-amber-500">No WhatsApp consent recorded</span>}
              </>
            ) : (
              <span className="text-xs text-amber-500">No WhatsApp number (older signup). Use email: {lead.email}</span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <p><span className="text-slate-500">Preparing for:</span> {track}</p>
            <p><span className="text-slate-500">Situation:</span> {lead.situation || "-"}</p>
            <p><span className="text-slate-500">Exam date:</span> {lead.exam_date || "Not booked"}</p>
            <p><span className="text-slate-500">Latest score:</span> {lead.latest_score || "-"}</p>
            <p><span className="text-slate-500">Biggest problem:</span> {lead.biggest_problem || "-"}</p>
            <p><span className="text-slate-500">Best time to contact:</span> {lead.best_contact_time || "-"}{lead.timezone ? ` (${lead.timezone})` : ""}</p>
            <p className="sm:col-span-2"><span className="text-slate-500">Resources:</span> {lead.resources?.length ? lead.resources.join(", ") : "-"}</p>
            {lead.weak_areas && <p className="sm:col-span-2"><span className="text-slate-500">Struggling with:</span> {lead.weak_areas}</p>}
            {lead.goals_notes && <p className="sm:col-span-2"><span className="text-slate-500">Goals:</span> {lead.goals_notes}</p>}
            {lead.mentor_email && <p className="sm:col-span-2"><span className="text-slate-500">Mentor email on profile:</span> {lead.mentor_email}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.filter((s) => s.v !== "mentor_assigned" || lead.status === "mentor_assigned").map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Demo date and time</label>
              <input type="datetime-local" className="input" value={demoAt} onChange={(e) => setDemoAt(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Notes from your conversation</label>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What the student said, their goals, concerns, budget..." />
          </div>

          <div className="rounded-xl border border-slate-700 p-3">
            <p className="text-sm font-semibold mb-2">Suggest a mentor</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <select className="input" value={recMentor} onChange={(e) => setRecMentor(e.target.value)}>
                <option value="">No suggestion yet</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.student_count} students)
                  </option>
                ))}
              </select>
              <input className="input" placeholder="Why this mentor? (optional)" value={recNote} onChange={(e) => setRecNote(e.target.value)} />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Set the status to &ldquo;Ready for mentor&rdquo; and save, and the admin is notified to confirm the mentor.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={save} disabled={busy} className="btn-primary text-sm">
              {busy ? "Saving..." : "Save"}
            </button>
            {msg && <span className="text-xs text-green-600 font-semibold">{msg}</span>}
            {err && <span className="text-xs text-red-400">{err}</span>}
          </div>

          {recName && lead.status === "ready_for_mentor" && !isAdmin && (
            <p className="text-xs text-slate-500">Suggested: {recName}. Waiting for the admin to confirm.</p>
          )}
          {assignedName && <p className="text-xs text-green-600 font-semibold">Assigned mentor: {assignedName}</p>}

          {isAdmin && (
            <div className="rounded-xl border border-brand-400/50 bg-brand-900/10 p-3">
              <p className="text-sm font-semibold mb-2">Assign mentor (admin)</p>
              <div className="flex items-center gap-3 flex-wrap">
                <select className="input max-w-xs" value={assignId} onChange={(e) => setAssignId(e.target.value)}>
                  <option value="">Choose a mentor</option>
                  {mentors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.student_count} students)
                    </option>
                  ))}
                </select>
                <button type="button" onClick={assign} disabled={busy || !assignId} className="btn-primary text-sm">
                  Assign
                </button>
              </div>
              {recName && <p className="text-xs text-slate-500 mt-2">Demo team suggests: {recName}{lead.recommend_note ? ` - ${lead.recommend_note}` : ""}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DemoLeads({ isAdmin, who }: { isAdmin: boolean; who: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [mentors, setMentors] = useState<MentorOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("active");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [l, m] = await Promise.all([supabase.rpc("demo_list_leads"), supabase.rpc("demo_list_mentors")]);
    if (l.error) setError(l.error.message);
    else setLeads((l.data ?? []) as Lead[]);
    if (!m.error) setMentors((m.data ?? []) as MentorOpt[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const shown = leads.filter((l) => {
    if (filter === "active" && (l.status === "mentor_assigned" || l.status === "not_interested")) return false;
    if (filter !== "active" && filter !== "all" && l.status !== filter) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${l.full_name ?? ""} ${l.email ?? ""} ${l.whatsapp ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[{ v: "active", l: "To do" }, ...STATUSES, { v: "all", l: "All" }].map((s) => (
          <button
            key={s.v}
            type="button"
            onClick={() => setFilter(s.v)}
            className={`text-xs rounded-full px-3 py-1.5 border transition ${
              filter === s.v ? "border-brand-400 bg-brand-900/40 text-brand-300" : "border-slate-700 text-slate-300 hover:border-slate-600"
            }`}
          >
            {s.l}
            {s.v !== "active" && s.v !== "all" && counts[s.v] ? ` (${counts[s.v]})` : ""}
          </button>
        ))}
      </div>
      <input className="input mb-4 max-w-sm" placeholder="Search name, email or number" value={search} onChange={(e) => setSearch(e.target.value)} />

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500">No students here.</p>
      ) : (
        shown.map((l) => <LeadCard key={l.student_id} lead={l} mentors={mentors} isAdmin={isAdmin} who={who} onSaved={load} />)
      )}
    </div>
  );
}
