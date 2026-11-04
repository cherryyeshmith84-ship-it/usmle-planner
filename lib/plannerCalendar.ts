  const notesOk =
    !hasActiveColumn(journalColumns, "student_notes") ||
    (typeof v["student_notes"] === "string" && v["student_notes"].trim() !== "");
  const blocksOk = dayBlocks.every((b) => b.questions !== null && b.questions !== undefined);

  return issueOk && resourcesOk && notesOk && blocksOk ? "completed" : "partial";
