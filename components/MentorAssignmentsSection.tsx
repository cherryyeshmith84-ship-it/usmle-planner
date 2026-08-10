"use client";

import { useMemo, useState } from "react";
import type { PlanTask } from "@/lib/planTasks";
import { groupTasksByDate, todayIso } from "@/lib/planTasks";
import MentorAssignmentsEditor from "./MentorAssignmentsEditor";

export default function MentorAssignmentsSection({
  studentId,
  mentorId,
  initialTasks,
}: {
  studentId: string;
  mentorId: string;
  initialTasks: PlanTask[];
}) {
  const [date, setDate] = useState(todayIso());
  const tasksByDate = useMemo(() => groupTasksByDate(initialTasks), [initialTasks]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-slate-500">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input text-xs py-1 px-2"
        />
      </div>
      <MentorAssignmentsEditor
        key={date}
        studentId={studentId}
        mentorId={mentorId}
        date={date}
        initialTasks={tasksByDate[date] ?? []}
      />
    </div>
  );
}
