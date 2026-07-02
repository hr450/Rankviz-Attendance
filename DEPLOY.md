# Deploying RankViz Attendance to Vercel

This is a Vite + React app with one serverless function (`/api/send-email`).
Vercel auto-detects both, so no extra config is needed.

## 1. Set up Supabase

1. In your Supabase project, open the SQL editor and run `supabase_schema.sql`
   (safe to re-run — it uses `IF NOT EXISTS`).
2. This creates three tables: `employees`, `attendance` (now with WFH + alternate-day
   columns), and `app_users` (admin + employee logins).
3. Your `SUPABASE_URL` / `SUPABASE_ANON_KEY` live in `src/lib/constants.js`.

## 2. Set up email (Nodemailer via a Vercel serverless function)

`api/send-email.js` sends attendance notifications to **hr@rankviz.com** using
SMTP credentials from environment variables. In your Vercel project settings →
Environment Variables, add:

| Key         | Example                          |
|-------------|-----------------------------------|
| `SMTP_HOST` | `smtp.gmail.com`                  |
| `SMTP_PORT` | `587`                             |
| `SMTP_USER` | `your-sender@yourdomain.com`      |
| `SMTP_PASS` | app password / SMTP password      |
| `SMTP_FROM` | `RankViz <no-reply@rankviz.com>`  |

If these aren't set, punches still save to Supabase normally — the app just
skips sending the email (fails silently, never blocks a check-in/out).

## 3. Deploy

### Option A — GitHub (recommended)
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Then go to https://vercel.com/new, import the repo, and click **Deploy**.
Vercel detects Vite (`vite build` → `dist`) and the `/api` folder automatically.

### Option B — Vercel CLI
```
npm i -g vercel
vercel        # first deploy / preview
vercel --prod # production
```

## Notes

- **RLS**: `supabase_schema.sql` enables permissive Row Level Security policies
  so the app works out of the box with the public anon key. Tighten these
  (especially on `app_users`, which holds passwords) before going to production —
  e.g. move login verification into a serverless function so the anon key
  never has direct read access to the `password` column.
- **Local dev**: `npm install && npm run dev`. The `/api/send-email` function
  only runs on Vercel (`vercel dev`) or Vercel's servers — plain `vite dev`
  won't serve it, but the rest of the app works fine without it.
- **Font**: the whole app uses Inter, loaded in `src/styles.css`.
