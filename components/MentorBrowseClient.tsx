"use client";

import { mentorPhotoUrl, type Mentor } from "@/lib/mentors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export type MentorCardData = Mentor & {
  helpedCount: number;
  availableThisWeek: boolean;
  avgRating: number | null;
  ratingCount: number;
};

/**
 * Student-facing mentor directory - a grid of summary cards. Clicking
 * "View Profile" takes the student to a dedicated per-mentor page
 * (app/mentorship/mentor/[mentorId]/page.tsx + MentorProfileClient) where
 * the actual bio/help-areas/availability/booking flow lives. This component
 * used to also handle picking a mentor + booking inline; that's been split
 * out so the directory itself stays a simple, scannable list of cards.
 */
export default function MentorBrowseClient({ mentors }: { mentors: MentorCardData[] }) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        Looking for sessions you&apos;ve already booked? See{" "}
        <a href="/mentorship/sessions" className="text-brand-400 hover:text-brand-300">
          Upcoming Sessions
        </a>{" "}
        in the sidebar.
      </p>

      {mentors.length === 0 ? (
        <p className="text-sm text-slate-400">No mentors are listed yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mentors.map((m) => {
            const photoUrl = mentorPhotoUrl(m.photo_path, SUPABASE_URL);
            const languages = m.languages || [];
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

                <div className="text-xs text-slate-500 space-y-1">
                  <p>Helped {m.helpedCount} student{m.helpedCount === 1 ? "" : "s"}</p>
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
