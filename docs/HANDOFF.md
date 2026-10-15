# Spike In — Project Handoff

Updated: 2026-10-14

## Project at a glance

Spike In is a phone-first volleyball team attendance PWA built with Vite, React, TypeScript, and Supabase.

- Workspace: `D:\spikein`
- Branch: `develop`
- Current commit: `2533137` (`Improve team management and attendance timing`), pushed to `origin/develop`
- Supabase project ref: `oydtgplnppkivpnnaars` (project name: Spike In)
- Local app: `http://localhost:5173`
- Browser configuration uses `VITE_SUPABASE_URL` and the public anon key only. `.env` is local and must never be copied into docs, logs, or commits.

## Product and access rules

- Google is the only sign-in/sign-up provider; OAuth asks for account selection.
- Sessions are checked for trusted Google provider metadata before protected pages load.
- Students may create a student profile after verified Google sign-in. Coaches are provisioned by a trusted administrator; there is no self-service role selection.
- Coaches use `/admin`; students use `/`.
- Students join teams with a coach-generated 12-character code. Session check-in codes are eight characters; the database stores only their hashes.
- Coaches can delete a team. This permanently removes roster memberships, sessions, join codes, check-ins, and attendance records for that team; player accounts remain.

## Main code locations

- `src/app/providers.tsx` — auth/profile state and React Query provider.
- `src/app/router.tsx` — auth gates and role-based routes.
- `src/components/AppShell.tsx` — responsive workspace shell/navigation.
- `src/components/InstallAppButton.tsx` — browser install prompt and mobile install guidance.
- `src/features/auth/AuthPages.tsx` — Google OAuth, callback, and student profile setup.
- `src/features/dashboard/DashboardPage.tsx` — coach/student overview.
- `src/features/dashboard/ManagementPages.tsx` — team/session management and attendance workflows.
- `src/features/dashboard/attendanceConfig.ts` — client-side check-in window flag (currently enabled).
- `supabase/migrations/` — ordered schema, RLS, and RPC changes.

## Attendance behavior

- A verified student on the roster submits a session code; the attempt waits for coach review.
- Coaches can approve/reject attempts, excuse a student with a required reason, manually mark a student present, close a session, reopen it, and temporarily override the normal check-in window.
- Normal student check-in opens 30 minutes before session start and closes two hours after session end.
- An attendance record is marked late only when the code was submitted or the coach manually marked attendance more than two hours after session end. The latest migration also corrected existing records within the grace period.
- Closing a session rejects pending attempts and marks remaining roster members absent. Reopening preserves existing records.

## Database and deployment notes

- The latest late-status migration was applied to the Spike In Supabase project and recorded there as version `20261014140423` (`late_only_after_two_hour_grace`). The local migration filename uses the same version.
- Verify the deployed HTTPS URL, Supabase Auth Site URL/redirect allowlist, and Google OAuth callback setup before inviting teammates. The current Supabase connector cannot inspect those Auth URL settings.
- Authentication and attendance actions require a network connection. Supabase requests use `NetworkOnly`; the app does not queue offline writes.
- The web app cannot replace Android's native PWA splash screen; the cleaned manifest icon/background lead into the in-app launch animation.

## Verification and caveats

- `npm run typecheck` passed after the latest feature changes.
- No automated test suite is configured in `package.json`.
- A previous local production build hit a Windows sandbox `EPERM` while Vite resolved `index.html`; confirm the production build in the deployment environment.
- Check `git status` and this handoff before continuing. Preserve Google-only sign-in and administrator-provisioned coach roles.
