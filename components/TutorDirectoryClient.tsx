"use client";

import { mentorPhotoUrl, type Mentor } from "@/lib/mentors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export type TutorCardData = Mentor & {
  helpedCount: number;
  availableThisWeek: boolean;
  avgRating: number | null;
  ratingCount: number;
};

/**
 * Student-facing Tutoring directory - grouped by subject/specialty instead
 * of one flat grid (see components/MentorBrowseClient.tsx, which Mentorship
 * still uses as a flat list). Each tutor picks their own free-text
 * specialties (TutorSpecialtiesEditor.tsx, e.g. "Neuro", "Epi") - this
 * component buckets tutors under a heading for every distinct specialty
 * that appears among them, so the same tutor can appear under more than
 * one section if they tagged themselves with more than one subject. A
 * tutor with no specialties set yet falls into a final "Other" section
 * rather than disappearing entirely.
 */
export default function TutorDirectoryClient({ tutors }: { tutors: TutorCardData[] }) {
  const bySubject = new Map<string, TutorCardData[]>();
  const other: TutorCardData[] = [];

  for (const t of tutors) {
    const tags = (t.specialties ?? []).filter(Boolean);
    if (tags.length === 0) {
      other.push(t);
      continue;
    }
    for (const tag of tags) {
      const list = bySubject.get(tag) ?? [];
      list.push(t);
      bySubject.set(tag, list);
    }
  }

  const sections = Array.from(bySubject.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (tutors.length === 0) {
    return <p className="text-sm text-slate-400">No tutors are listed yet.</p>;
  }

  return (
    <div className="space-y-8">
      {sections.map(([subject, list]) => (
        <div key={subject}>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">{subject}</h3>
          <TutorCardGrid tutors={list} />
        </div>
      ))}

      {other.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Other</h3>
          <TutorCardGrid tutors={other} />
        </div>
      )}
    </div>
  );
}

function TutorCardGrid({ tutors }: { tutors: TutorCardData[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tutors.map((m) => {
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
                  <span className="text-[11px] font-semibold text-green-400">&#10003; Passed USMLE Step 1</span>
                  {m.ratingCount > 0 && (
                    <span className="text-[11px] font-semibold text-yellow-400">
                      &#9733; {m.avgRating} ({m.ratingCount})
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

            <div className="pt-2 mt-auto">
              <a href={`/mentorship/mentor/${m.id}`} className="btn-primary text-xs">
                View Profile
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
