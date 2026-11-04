import { createClient } from "@/lib/supabase/server";
import CoMentorsEditor from "@/components/CoMentorsEditor";

type MentorRow = { id: string; name: string; email: string; active: boolean };
type TaskRow = { mentor_id: string | null; task_date: string; title: string; completed: boolean | null };
type SlotRow = { mentor_id: string; start_time: string };

/**
 * "Mentor team" card - shows a student's main mentor plus any co-mentors the
 * admin has added, and what each one has done: tasks assigned (with the
 * latest few) and sessions booked. Visible to the student, the admin, and
 * the student's mentors. Only the admin sees the "add another mentor" control.
 * Server component - fetches its own data (RLS decides what each viewer sees).
 */
export default async function MentorTeamCard({
  studentId,
  canManage = false,
}: {
  studentId: string;
  canManage?: boolean;
}) {
  const supabase = createClient();

  const [{ data: studentRow }, { data: mentorRows }, { data: coRows }, { data: taskRows }, { data: slotRows }] =
    await Promise.all([
      supabase.from("profiles").select("mentor_email").eq("id", studentId).maybeSingle(),
      supabase.from("mentors").select("id, name, email, active"),
      supabase.from("student_co_mentors").select("mentor_id").eq("student_id", studentId),
      supabase
        .from("mentor_plan_tasks")
        .select("mentor_id, task_date, title, completed")
        .eq("student_id", studentId)
        .order("task_date", { ascending: false }),
      supabase
        .from("mentor_slots")
        .select("mentor_id, start_time")
        .eq("booked_by", studentId)
        .eq("is_booked", true)
        .order("start_time", { ascending: false }),
    ]);

  const mentors = (mentorRows ?? []) as MentorRow[];
  const tasks = (taskRows ?? []) as TaskRow[];
  const slots = (slotRows ?? []) as SlotRow[];
  const primaryEmail = ((studentRow as { mentor_email?: string | null } | null)?.mentor_email ?? "").toLowerCase();
  const primary = primaryEmail ? mentors.find((m) => m.email.toLowerCase() === primaryEmail) ?? null : null;
  const coIds = ((coRows ?? []) as { mentor_id: string }[]).map((r) => r.mentor_id);

  // Anyone who has assigned tasks or held sessions also shows up, even if
  // they're no longer the primary/co-mentor, so history is never hidden.
  const activeIds = new Set<string>([...(primary ? [primary.id] : []), ...coIds]);
  for (const t of tasks) if (t.mentor_id) activeIds.add(t.mentor_id);
  for (const s of slots) activeIds.add(s.mentor_id);

  const team = Array.from(activeIds)
    .map((id) => mentors.find((m) => m.id === id))
    .filter((m): m is MentorRow => !!m && m.email !== "admin-planner@mastergrid.invalid");

  if (team.length === 0 && !canManage) return null;

  const now = Date.now();
  return (
    <section className="card mb-6">
      <h2 className="text-sm font-semibold mb-1">Mentor team</h2>
      <p className="text-xs text-slate-500 mb-3">
        Everyone mentoring this student, with the tasks they assigned and the sessions they&apos;ve had.
      </p>
      {team.length === 0 ? (
        <p className="text-xs text-slate-500">No mentor linked yet.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {team.map((m) => {
            const role = primary?.id === m.id ? "Main mentor" : coIds.includes(m.id) ? "Co-mentor" : "Past mentor";
            const myTasks = tasks.filter((t) => t.mentor_id === m.id);
            const done = myTasks.filter((t) => t.completed).length;
            const mySlots = slots.filter((s) => s.mentor_id === m.id);
            const upcoming = mySlots.filter((s) => new Date(s.start_time).getTime() >= now).length;
            const held = mySlots.length - upcoming;
            return (
              <div key={m.id} className="rounded-lg border border-slate-800 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{m.name}</p>
                  <span className="text-[10px] uppercase tracking-wide text-brand-400">{role}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Tasks assigned: <span className="text-slate-200">{myTasks.length}</span> ({done} done) &middot;
                  Sessions: <span className="text-slate-200">{held}</span> held, {upcoming} upcoming
                </p>
                {myTasks.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {myTasks.slice(0, 4).map((t, i) => (
                      <li key={i} className="text-xs text-slate-500 truncate">
                        {t.task_date} &middot; {t.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canManage && (
        <CoMentorsEditor
          studentId={studentId}
          mentors={mentors.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))}
          coMentorIds={coIds}
          primaryMentorId={primary?.id ?? null}
        />
      )}
    </section>
  );
}
