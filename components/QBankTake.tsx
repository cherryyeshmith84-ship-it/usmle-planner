async function finalizeTest() {
  if (finalizedRef.current) return;
  finalizedRef.current = true;
  setSubmitting(true);

  const total = questions.length;
  const correct = questions.filter(
    (q) => answers[q.id] === q.correct_choice_id
  ).length;

  const times = deriveTimes();
  const supabase = createClient();
  const submittedAt = new Date().toISOString();

  const { error: sessionError } = await supabase
    .from("qbank_test_sessions")
    .update({
      mode: examMode,
      answers,
      question_seconds: times,
      score_correct: correct,
      score_total: total,
      submitted_at: submittedAt,
      in_progress: false,
    })
    .eq("id", session.id);

  if (sessionError) {
    console.error("Failed to save test session:", sessionError);
    finalizedRef.current = false;
    setSubmitting(false);
    return;
  }

  const attemptRows = questions
    .filter((q) => !!answers[q.id])
    .map((q) => ({
      user_id: userId,
      question_id: q.id,
      session_id: session.id,
      selected_choice_id: answers[q.id],
      is_correct: answers[q.id] === q.correct_choice_id,
      time_spent_seconds: times[q.id] ?? null,
      confidence_level: null,
      created_at: submittedAt,
    }));

  if (attemptRows.length > 0) {
    const { error: attemptsError } = await supabase
      .from("qbank_question_attempts")
      .insert(attemptRows);

    if (attemptsError) {
      console.error(
        "Failed to save question attempts:",
        attemptsError
      );
    }
  }

  setSubmitting(false);
  setQuestionTimes(times);
  setPhase("results");
}
