"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXAM_TYPE_LABEL, type ScoreReport } from "@/lib/scoreReports";
import MentorReviewButton from "./MentorReviewButton";

function scoreBadgeClass(pct: number | null) {
  if (pct === null) return "bg-slate-800 text-slate-300";
  if (pct >= 75) return "bg-green-900/40 text-green-400";
  if (pct >= 60) return "bg-yellow-900/40 text-yellow-400";
  if (pct >= 45) return "bg-orange-900/40 text-orange-400";
  return "bg-red-900/40 text-red-400";
}

/**
 * One score-report row on the mentor's read-only student-progress page -
 * gives the mentor everything they'd need to actually plan a session:
 * the per-system/discipline breakdown for that exact report (Systems
 * toggle), the original uploaded screenshot(s) (View Report - relies on the
 * "Mentor views student's score report files" storage policy, since the
 * score-reports bucket is private and normally only the student themselves
 * can sign their own files), and the review-status control
 * (MentorReviewButton). Deliberately has no Delete button - unlike the
 * student's own equivalent card in PerformanceClient.tsx, a mentor should
 * never be able to remove a student's data.
 */
export default function MentorScoreReportRow({
  report,
  canReview,
}: {
  report: ScoreReport;
  // False for an admin viewing this page without an actual mentor
  // relationship to the student - mentor_mark_report_reviewed() would
  // reject their write anyway (is_mentor_of_student check), so the control
  // is hidden rather than shown just to error out on click.
  canReview: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [viewingReport, setViewingReport] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[] | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);

  async function toggleViewReport() {
    if (viewingReport) {
      setViewingReport(false);
      return;
    }
    setViewingReport(true);
    if (imageUrls || report.image_paths.length === 0) return;
    setLoadingImages(true);
    const supabase = createClient();
    const { data } = await supabase.storage.from("score-reports").createSignedUrls(report.image_paths, 300);
    setImageUrls((data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u));
    setLoadingImages(false);
  }

  return (
    <div className="card py-2.5 text-sm space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <span className="font-semibold">{report.exam_name}</span>{" "}
          <span className="text-slate-500">({EXAM_TYPE_LABEL[report.exam_type]})</span>
          {report.taken_date && <span className="text-slate-500"> &middot; {report.taken_date}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-brand-300">
            {report.overall_percent != null ? `${report.overall_percent}%` : report.overall_score ?? "—"}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-brand-400 hover:text-brand-300 font-medium"
          >
            {expanded ? "Hide" : "Systems"}
          </button>
          {report.image_paths.length > 0 && (
            <button
              type="button"
              onClick={toggleViewReport}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium"
            >
              {viewingReport ? "Hide report" : "View Report"}
            </button>
          )}
        </div>
      </div>

      {/* Review status - only the signed-in mentor's own relationship can
          write this (mentor_mark_report_reviewed checks is_mentor_of_student
          server-side), and it's what drives the student's own "Mentor
          Status" banner on their Analysis page. */}
      {canReview && (
        <MentorReviewButton
          reportId={report.id}
          reviewedAt={report.mentor_reviewed_at ?? null}
          nextCheckinDate={report.next_checkin_date ?? null}
        />
      )}

      {expanded && (
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Systems</p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {Object.entries(report.system_breakdown ?? {}).length === 0 ? (
                <p className="text-xs text-slate-500">No per-system breakdown saved for this one.</p>
              ) : (
                Object.entries(report.system_breakdown).map(([system, pct]) => (
                  <div key={system} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400 truncate">{system}</span>
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 shrink-0 ${scoreBadgeClass(pct)}`}>
                      {pct}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          {report.discipline_breakdown && Object.keys(report.discipline_breakdown).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Disciplines</p>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {Object.entries(report.discipline_breakdown).map(([discipline, pct]) => (
                  <div key={discipline} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400 truncate">{discipline}</span>
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 shrink-0 ${scoreBadgeClass(pct)}`}>
                      {pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Finer-grained than Systems above - only question-level reports
              (e.g. an NBME CBSE/CCSE "Examinee Question-Level Feedback
              Report") have this, keyed by the exact named topic within a
              system (e.g. "diseases of the myocardium" within Cardio) rather
              than the system as a whole. Sorted weakest-first so a mentor
              planning a session can see exactly which named topics to assign,
              not just which broad system. */}
          {report.exam_type === "question_level" &&
            report.content_breakdown &&
            Object.keys(report.content_breakdown).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  Topics (weakest first)
                </p>
                <div className="space-y-1.5">
                  {Object.values(report.content_breakdown)
                    .sort((a, b) => a.percent - b.percent)
                    .map((item, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400 truncate">
                          {item.system ? `${item.system} - ` : ""}
                          {item.subtopic}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {item.national_pct !== null && (
                            <span className="text-[10px] text-slate-600">Natl {item.national_pct}%</span>
                          )}
                          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${scoreBadgeClass(item.percent)}`}>
                            {item.percent}% ({item.correct}/{item.total})
                          </span>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
        </div>
      )}

      {viewingReport && (
        <div className="pt-2 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Original uploaded report
          </p>
          {loadingImages ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : (imageUrls?.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-500">Couldn&apos;t load the original file(s) for this report.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {imageUrls!.map((url, i) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-400 hover:text-brand-300 underline"
                >
                  Open page {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
