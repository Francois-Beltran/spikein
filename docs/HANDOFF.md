# Spike In — Project Handoff

Updated: 2026-10-13

## Project at a glance

Spike In is a mobile-first volleyball team attendance web app/PWA for coaches and students. It is a Vite + React 18 + TypeScript single-page app. Main libraries are React Router, TanStack Query, Tailwind CSS, `lucide-react`, and `@supabase/supabase-js`. Supabase provides Google OAuth, Postgres, RLS, and the workflow RPCs.

- Workspace: `D:\spikein`
- Git branch: `main`
- Remote: `https://github.com/Francois-Beltran/spikein.git`
- Supabase project ref: `oydtgplnppkivpnnaars`
- Local app: `http://localhost:5173`
- Supabase client is configured from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `.env` is local and must never be copied into docs, logs, or commits.

## Product and access rules

- Google is the only sign-in/sign-up provider. OAuth asks Google to show its account chooser.
- Authenticated sessions are checked for Google provider metadata before profile/dashboard access.
- Students can create their own student profile after verified Google sign-in. Coach role must be provisioned by a trusted administrator; never add self-service role selection or role elevation.
- Coaches enter at `/admin`; students enter at `/`. Routes are guarded by profile role.
- Teams use shared coach-generated join codes (12 hexadecimal characters). Email invitations were removed.
- Session check-in codes are eight characters. The database stores hashes only; coaches see a code on creation/rotation.
- Dashboard design should remain phone-first and keep touch targets accessible. Apple Design and UI/UX Pro Max were used for prior dashboard work.

## Main code locations

- `src/app/providers.tsx` — auth/profile state and React Query provider.
- `src/app/router.tsx` — auth gates and role-based route routing.
- `src/components/AppShell.tsx` — responsive workspace shell/navigation.
- `src/features/auth/AuthPages.tsx` — Google OAuth, callback, student profile setup.
- `src/features/dashboard/DashboardPage.tsx` — dashboard overview.
- `src/features/dashboard/ManagementPages.tsx` — team/session management, student views, attendance submission/review.
- `src/features/dashboard/useCoachDashboard.ts` / `useStudentDashboard.ts` — dashboard data queries.
- `src/features/dashboard/attendanceConfig.ts` — client-side temporary attendance-window switch.
- `src/lib/supabase.ts` — public anon-key client only.
- `supabase/migrations/` — versioned schema/RPC/policy changes; apply in timestamp order.
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/PWA.md` — supporting docs. Some older sections in these files may not reflect recent work; prefer this handoff and the latest migrations when they conflict.

## Attendance flow and current testing mode

1. A verified Google student who is a member of the team submits a session code through `submit_attendance`. This creates one `pending` row in `attendance_attempts` for that student/session.
2. The coach attendance page loads their sessions, attempts, athlete profiles, and attendance records. The PostgREST profile embed must name the student FK explicitly: `profiles!attendance_attempts_student_id_fkey(full_name)`, because attempts have both student and reviewer links to profiles.
3. Coach approve/reject calls `review_attendance_attempt`. Approval updates the attempt and upserts a `present`/`late` row in `attendance_records`; rejection marks the attempt rejected and creates no attendance record.
4. Once eligible to close, `close_attendance_session` closes the session, rejects outstanding pending attempts, and marks remaining roster members absent.
5. Coach actions refresh the relevant attendance and dashboard queries. Supabase error objects are plain objects in some cases, so use the shared `errorMessage` helper instead of relying only on `instanceof Error`.

**The check-in time gate is intentionally disabled for testing.** `src/features/dashboard/attendanceConfig.ts` exports `ENFORCE_CHECKIN_WINDOW = false`; migration `20261013082000_disable_checkin_window_for_testing.sql` also sets the server-side `enforce_checkin_window` constant to `false`. Membership, verified Google student role, open session, and code hash checks remain active. Before deployment, the user must explicitly request enabling it; set both client and server switches to true and verify the 30-minutes-before / 2-hours-after rule.

## Latest incident and resolution

The recent pending-check-in issue had three connected causes/fixes:

- PostgREST could not infer the athlete profile because `attendance_attempts` has more than one FK to `profiles`. The admin query now names `attendance_attempts_student_id_fkey`.
- The admin loader previously hid Supabase's plain-object error. It now reports which request stage failed and the returned message, with refresh/retry support.
- Approve/reject failed inside the live `review_attendance_attempt` RPC. The parameter `coach_note` conflicted with the table column in the `UPDATE`. Migration `20261013100000_fix_attendance_review_note_ambiguity.sql` stores a trimmed value in `normalized_note` and uses that variable in the update.

The migration has been applied to Supabase project `oydtgplnppkivpnnaars`. The coach approval RPC was invoked under the authenticated coach identity inside a transaction and returned a `present` attendance record; rejection also completed. Both checks were rolled back. The existing check-in therefore remains pending in live data. Do not approve/reject that user's request unless the user asks.

## Recent focused commits

- `bf0bd11` — `fix attendance review end-to-end` (current latest)
- `73fd6be` — `fix pending check-in profile relation`
- `2e52316` — `fix admin attendance query errors`
- `09828d1` — `fix: refresh coach pending check-ins`
- `3eebf0a` — `chore: disable attendance window during testing`

Continue with focused commits; do not bundle unrelated work. Current branch is `main`.

## Verification and known caveats

- `npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false` passed after the latest attendance changes.
- The strict project build currently reports an existing unused `Volleyball` import in `src/components/AppShell.tsx`. A direct Vite build also hit a Windows sandbox `EPERM` when resolving `index.html` in the last attempt. Do not report a complete production build until these blockers are resolved and the build succeeds.
- No automated test suite is configured in `package.json`.
- Do not reveal `.env` values or use any service-role key in client code.
- Existing `docs/DATABASE.md` has an older narrative that implies the check-in window is active; the latest testing migration and this file are authoritative until the window is re-enabled.

## Useful commands

- `npm run dev` — local development server.
- `npm run typecheck` — strict TypeScript project check.
- `npm run build` — TypeScript project build followed by Vite/PWA build.
- `npm run preview` — serve the production output locally.

When continuing, check `git status`, review this handoff and the newest migration, then inspect the live UI/API behavior relevant to the user's next request. Preserve the Google-only access rules and the temporary check-in testing mode unless the user explicitly directs otherwise.
