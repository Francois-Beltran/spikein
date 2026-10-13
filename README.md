# Spike In

A mobile-first volleyball team attendance PWA for coaches and students. The app foundation uses React 18, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, and Supabase.

## Local setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and public anon key.
3. Apply `supabase/migrations/0001_foundation.sql` to a fresh Supabase project using the Supabase CLI or dashboard SQL editor.
4. In Supabase Auth settings, enable Google as the only provider, configure Google OAuth credentials, and allow `http://localhost:5173/auth/callback` plus your deployed `/auth/callback` URL.
5. Run `npm install` then `npm run dev`.

`VITE_SUPABASE_ANON_KEY` is the public anon key, never a service role key. Auth is disabled with an explanatory setup screen until both public environment values are configured. Google is the only supported sign-in and sign-up method. After Google sign-in, new users can create a student profile using their Google-provided name. Apply migration `0002_google_student_profile.sql` so the server verifies the Google identity and confirmed email. Coach profiles must be provisioned by a trusted administrator; no user can select or promote their own role.

## Current scope

The foundation includes Google-only sign-in/sign-up with account selection, Google-identity route gating, first-time student profile setup, role-based access, a responsive coach/student workspace shell, a Supabase-backed coach dashboard with team creation and session scheduling, a student dashboard with team and upcoming-session data, PWA manifest/service worker, and the first security migration. Coaches can open the dashboard at `/admin`; students use `/`. Roster invitations, check-in codes, coach review, the attendance tracker, and realtime behavior remain to be implemented in later phases.

## Commands

- `npm run dev` — local development
- `npm run typecheck` — TypeScript check
- `npm run build` — production build
- `npm run preview` — preview the production bundle

Deploy the static build to an HTTPS host such as Vercel for service workers and home-screen installation.
