# Step 1 Planner

A daily study planner and AI coach for USMLE Step 1 prep.

## What it does

- **Email sign-up/login** (with email confirmation), open to any student.
- **Onboarding**: prep stage (beginning / middle / end), exam date, daily
  study-hour goal, preferred resources (UWorld, Sketchy, Boards & Beyond,
  Pathoma, Anki, etc).
- **Dashboard**: today's task checklist (add/edit/remove tasks, mark
  done/skipped), hours studied, topics skipped, streak counter, countdown
  to exam day.
- **End-of-day reflection**: a notes field plus a 0-10 self-rating of how
  the day actually went.
- **AI coach**: on demand, reviews today's logged data and gives a short
  review + a concrete plan for tomorrow - grounded in built-in USMLE study
  guidance (how to review UWorld, use Sketchy, pace Anki, etc.) plus
  whatever custom instructions the student adds in Settings.
- **History**: a day-by-day log of everything, so patterns show up over
  time.

## How it's built

- **Next.js** (React) - the web app itself.
- **Supabase** - handles user accounts/login and stores all the data.
- **Gemini API** (Google, free tier) - powers the AI coach.
- **Vercel** - hosts the live site.

See `DEPLOY.md` for the deployment guide and `supabase/schema.sql` for the
database setup script.

## Local development (optional)

```bash
npm install
cp .env.local.example .env.local   # then fill in your real keys
npm run dev
```
