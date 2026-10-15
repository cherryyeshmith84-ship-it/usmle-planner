import { TERMS_TEXT } from "@/lib/terms";

/**
 * Renders the Terms & Conditions + Refund Policy text from lib/terms.ts.
 * Pure presentational (no hooks) so it can be used from both the student
 * acceptance gate (client) and the admin record page (server).
 *
 * Line rules: ALL-CAPS lines are document titles, "N. Title" lines are
 * clause headings (bold), everything else is body text.
 */
export default function TermsText() {
  const lines = TERMS_TEXT.split("\n");
  return (
    <div className="text-sm leading-relaxed text-slate-300 space-y-2">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (/^[A-Z][A-Z ]+$/.test(t)) {
          return (
            <h2 key={i} className="text-base font-bold pt-4 first:pt-0">
              {t}
            </h2>
          );
        }
        if (/^\d+\.\s+\S/.test(t) && t.length < 90) {
          return (
            <h3 key={i} className="font-semibold pt-3">
              {t}
            </h3>
          );
        }
        return (
          <p key={i} className={t.startsWith("•") ? "pl-4" : ""}>
            {t}
          </p>
        );
      })}
    </div>
  );
}
