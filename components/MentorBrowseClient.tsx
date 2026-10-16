"use client";

import { mentorPhotoUrl, type Mentor } from "@/lib/mentors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export type MentorCardData = Mentor & {
  helpedCount: number;
  availableThisWeek: boolean;
  avgRating: number | null;
  ratingCount: number;
  // Students currently linked to this mentor (their "My students" roster).
  activeStudentCount?: number;
  // Reviews that include a written comment.
  commentCount?: number;
  // Set by the admin (Admin > Mentors > Students passed) - how many students
  // passed Step 1 with this mentor. Comes straight from the mentors row.
  students_passed?: number | null;
};

/**
 * Student-facing mentor directory - a grid of summary cards. "View Profile"
 * opens app/mentorship/mentor/[mentorId]. Also reused for the Tutoring
 * directory (showSessionsLink=false there).
 */
export default function MentorBrowseClient({
  mentors,
  emptyLabel = "No mentors are listed yet.",
  showSessionsLink = true,
}: {
  mentors: MentorCardData[];
  emptyLabel?: string;
  showSessionsLink?: boolean;
}) {
  return (
    <div className="space-y-6">
      {showSessionsLink && (
        <p className="text-xs text-slate-500">
          Looking for sessions you&apos;ve already booked? See{" "}
          <a href="/mentorship/sessions" className="text-brand-400 hover:text-brand-300">
            Upcoming Sessions
          </a>{" "}
          in the sidebar.
        </p>
      )}

      {mentors.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mentors.map((m) => {
            const photoUrl = mentorPhotoUrl(m.photo_path, SUPABASE_URL);
            const languages = m.languages || [];
            const activeStudentCount = m.activeStudentCount ?? 0;
            const commentCount = m.commentCount ?? 0;
            const passed = Number(m.students_passed ?? 0);
            return (
              <div key={m.id} className="card flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {photoUrl ? (
                    <img src={photoUrl} alt={m.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-brand-900/40 text-brand-300 font-bold flex items-center justify-center shrink-0">
                      {m.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{m.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-green-400">✓ Passed USMLE Step 1</span>
                      {m.ratingCount > 0 && (
                        <span className="text-[11px] font-semibold text-yellow-400">
                          ★ {m.avgRating} ({m.ratingCount})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {m.bio && <p className="text-xs text-slate-400 line-clamp-2">{m.bio}</p>}

                {passed > 0 && (
                  <p className="text-xs font-semibold text-green-400">
                    🎓 {passed} student{passed === 1 ? "" : "s"} passed with this mentor
                  </p>
                )}

                <div className="text-xs text-slate-500 space-y-1">
                  <p>
                    Mentoring {activeStudentCount} student{activeStudentCount === 1 ? "" : "s"} now
                    <span className="text-slate-600"> · Helped {m.helpedCount} total</span>
                  </p>
                  <p>
                    {commentCount} comment{commentCount === 1 ? "" : "s"}
                  </p>
                  {languages.length > 0 && <p>Speaks {languages.join(", ")}</p>}
                  {m.response_time_note && <p>Typically responds {m.response_time_note}</p>}
                </div>

                <div className="flex items-center justify-between mt-auto pt-2">
                  {m.availableThisWeek ? (
                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-green-900/40 text-green-400">
                      Available this week
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">No open slots this week</span>
                  )}
                  <a href={`/mentorship/mentor/${m.id}`} className="btn-primary text-xs">
                    View Profile
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
