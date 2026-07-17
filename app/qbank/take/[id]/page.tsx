import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { QBankQuestion, QBankTestSession } from "@/lib/qbankTypes";
import AppShell from "@/components/AppShell";
import QBankTake from "@/components/QBankTake";

export const dynamic = "force-dynamic";

export default async function TakeQBankSessionPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, sessionRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("qbank_test_sessions").select("*").eq("id", params.id).single(),
  ]);

  const profile = profileRes.data as Profile | null;
  if (!profile?.onboarding_completed) redirect("/onboarding");
  if (!sessionRes.data) notFound();

  const session = sessionRes.data as QBankTestSession;
  if (session.user_id !== user.id) notFound();

  const { data: questionsData } = await supabase
    .from("qbank_questions")
    .select("*")
    .in("id", session.question_ids);

  const byId = new Map(((questionsData ?? []) as QBankQuestion[]).map((q) => [q.id, q]));
  const questions = session.question_ids.map((id) => byId.get(id)).filter(Boolean) as QBankQuestion[];

  const { data: marksData } = await supabase
    .from("qbank_marks")
    .select("question_id, marked")
    .eq("user_id", user.id)
    .in("question_id", session.question_ids);

  const initialMarked: Record<string, boolean> = {};
  for (const m of (marksData ?? []) as { question_id: string; marked: boolean }[]) {
    if (m.marked) initialMarked[m.question_id] = true;
  }

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name}>
      <main className="flex-1 px-6 py-8 w-full">
        <QBankTake
          userId={user.id}
          session={session}
          questions={questions}
          initialMarked={initialMarked}
        />
      </main>
    </AppShell>
  );
}
