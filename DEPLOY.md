# Getting your planner live at a real link

## Step 1 — Supabase (database + login) — done
Project created, schema run.

## Step 2 — Gemini API key (AI coach) — done

## Step 3 — Put the code on GitHub

1. If you don't have a GitHub account, create one free at github.com.
2. Download GitHub Desktop (desktop.github.com), install, sign in.
3. File -> Add local repository -> choose this `usmle-planner` folder.
   If prompted, click "create a repository" for it.
4. Click "Publish repository" (Private is fine).

## Step 4 — Deploy to Vercel

1. Go to vercel.com, sign up with your GitHub account.
2. Add New -> Project -> Import the `usmle-planner` repo.
3. Add these Environment Variables before deploying:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - GEMINI_API_KEY
   - GEMINI_MODEL = gemini-2.0-flash
4. Click Deploy. You'll get a live `https://....vercel.app` link.

## Step 5 — Connect the live link back to Supabase

1. In Vercel: add NEXT_PUBLIC_SITE_URL = your live URL, then redeploy.
2. In Supabase: Authentication -> URL Configuration -> set Site URL to
   your live URL, and add `https://YOUR-URL/auth/callback` under
   Redirect URLs.

## Step 6 — Try it

Sign up, confirm your email, log in, complete onboarding, log a day, get
AI feedback.
