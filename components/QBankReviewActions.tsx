"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { QBankQuestion, QuestionAdminStatus } from "@/lib/qbankTypes";

/**
 * The two review-queue actions: publish a question that's ready, or bounce
 * it back to draft if it still needs work. Only touches the "status" key
 * inside meta - everything else on the question is left untouched.
 */
export default function QBankReviewActions({
  question,
  canPublish,
}: {
  question: QBankQuestion;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<QuestionAdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: QuestionAdminStatus) {
    setSaving(next);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("qbank_questions")
      .update({ meta: { ...(question.meta ?? {}), status: next } })
      .eq("id", question.id);
    setSaving(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={!!saving}
          onClick={() => setStatus("draft")}
        >
          {saving === "draft" ? "Saving..." : "Send back to draft"}
        </button>
        <button
          type="button"
          className="btn-primary text-xs"
          disabled={!!saving || !canPublish}
          onClick={() => setStatus("published")}
          title={canPublish ? undefined : "Add a correct answer and main explanation first"}
        >
          {saving === "published" ? "Publishing..." : "Publish"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
