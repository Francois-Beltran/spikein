# Spike In

A mobile-first volleyball team attendance PWA for coaches and students. The app foundation uses React 18, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, and Supabase.

## Local setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and public anon key.
3. Create a Supabase project and apply every SQL file in `supabase/migrations` in filename order.
4. In Supabase Auth, enable Google, configure its OAuth client, set the deployed site URL, and allow the local and deployed `/auth/callback` URLs. Google Cloud must allow Supabase's `/auth/v1/callback` URL.
5. Run `npm install` then `npm run dev`.

`VITE_SUPABASE_ANON_KEY` is the public anon key, never a service role key. Auth is disabled with an explanatory setup screen until both public environment values are configured. Google is the only supported sign-in and sign-up method. After Google sign-in, new users can create a student profile using their Google-provided name. Apply migration `0002_google_student_profile.sql` so the server verifies the Google identity and confirmed email. Coach profiles must be provisioned by a trusted administrator; no user can select or promote their own role.

## Current scope

Spike In supports Google-only sign-in, student profile setup, administrator-provisioned coach accounts, coach team and session management, shared team join codes, student attendance check-in, coach approval/rejection and manual attendance, excusals, session closure/reopening, and check-in overrides. Check-ins are marked late only when submitted more than two hours after the session ends. Team deletion removes that team's roster, sessions, codes, and attendance history but does not delete player accounts. Coaches use `/admin`; students use `/`.

The PWA includes an install action, Android install guidance, updated app icons, and a short launch animation. Authentication and attendance actions require a network connection; test the deployed HTTPS version on the phones your teammates use before rollout.

## Commands

- `npm run dev` — local development
- `npm run typecheck` — TypeScript check
- `npm run build` — production build
- `npm run preview` — preview the production bundle

Deploy the static build to an HTTPS host such as Vercel for service workers and home-screen installation.
