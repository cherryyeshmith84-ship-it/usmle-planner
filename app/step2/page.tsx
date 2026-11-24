// Landing page for Step 2 CK and Shelf / subject exam students. It is the same
// Mentorship page (same layout, mentor cards, booking and planner), which
// shows these students only the mentors marked for Step 2 / Shelf exams.
// `dynamic` has to be declared here; Next.js does not accept it re-exported.
export const dynamic = "force-dynamic";
export { default } from "../mentorship/page";
