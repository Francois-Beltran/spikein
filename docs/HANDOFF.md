# Handoff

## Completed
- Scaffolded the first-task foundation: Vite + React 18 + TypeScript, Tailwind, React Router, TanStack Query, Supabase JS, and vite-plugin-pwa.
- Added setup-aware Supabase authentication, sign-in, profile completion, role-bearing workspace shell, and initial responsive overview UI.
- Restricted sign-in and sign-up to Google OAuth; removed password auth and self-selected profile roles.
- Added initial schema/RLS migration for profiles, groups, members, sessions, and admin-only hashed session codes.
- Added PWA app shell caching with Supabase requests excluded from cache and starter brand icons.
- Added setup docs and `.env.example`.

## Files changed
- App config: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.env.example`.
- App: `src/app/*`, `src/components/AppShell.tsx`, `src/features/auth/AuthPages.tsx`, `src/features/dashboard/DashboardPage.tsx`, `src/lib/supabase.ts`, `src/main.tsx`, `src/styles/index.css`.
- Database: `supabase/migrations/0001_foundation.sql`.
- PWA: `public/icons/*`, `public/apple-touch-icon.png`.
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/PWA.md`, this file, `docs/CHANGELOG.md`.

## Decisions
- Used TypeScript consistently.
- Stored only a SHA-256 digest for session codes so the original code is not retrievable from the database.
- Chose per-profile RLS and group ownership checks; session-code access is coach-only.
- Kept navigation destinations for later phases visible as scaffolding links; only the overview is implemented.
- Student profile creation is restricted to a database RPC; coaches require trusted administrator provisioning. Secure group invitations and coach creation remain prerequisites before public onboarding.
- Google OAuth is the only auth provider. The callback is `/auth/callback`; configure matching Supabase and Google OAuth redirect URLs.

## Verification
- `npm install --no-audit --no-fund` — completed; npm noted esbuild's install script needs approval in this environment.
- `npm run typecheck` — passed.
- `npm run build` — passed (1674 modules transformed; PWA manifest and service worker generated). The sandbox initially denied file resolution; the elevated workspace build completed successfully.

## Latest change
- Replaced email/password sign-in with Google-only OAuth sign-in/sign-up.
- Removed the self-service profile-completion form. Authenticated users without a pre-provisioned profile see a team-admin message.
- Updated student profile RPC to require a Google-verified email claim.
- Added the `/auth/callback` route and a Google OAuth redirect setup note.
- `npm run typecheck` — passed after the auth update.
- `npm run build` — passed after the auth update; PWA manifest and service worker generated.

## OAuth smoke check
- Opened the local app at `http://localhost:5173`, clicked Google sign-in, and observed a successful Google OAuth return to `/auth/callback`.
- The callback remained on its loading screen after authentication. Updated `GoogleCallbackPage` to route authenticated users into the app and return unauthenticated users to sign-in after a bounded wait.
- Re-tested: after the callback fix, the app routed to `/` and showed the expected “Your team profile isn’t ready yet” state for this Google account.
- `npm run typecheck` and `npm run build` — passed after the callback fix; PWA files generated.

## Coach dashboard
- Replaced sample dashboard metrics and hard-coded sessions with Supabase-backed coach data for owned teams, memberships, and upcoming sessions.
- Added create-team and schedule-session dialogs, week/session metrics, real loading/empty/error/offline states, and explicit placeholders for attendance functionality not present in migration 0001.
- Preserved the trusted-provisioning requirement for coach profiles; no self-service role elevation was added.
- `npm run typecheck` — passed after the dashboard implementation.
- `npm run build` — passed; Vite reports the existing single app chunk is above its 500 kB advisory threshold (516.55 kB minified).

## Google first-sign-in profile setup
- Root cause: authenticated users without a matching `profiles` row were shown a dead-end message. The existing student profile RPC was never called from the app, and profile lookup errors were silently treated as missing profiles.
- Added a student-only profile setup form populated from Google account name metadata. It calls `create_student_profile`; coach role selection is not offered.
- Split auth/profile loading and surfaced profile lookup errors separately from a genuinely missing profile.
- Tightened the live `create_student_profile` RPC to require an authenticated user with a confirmed email and Google identity from trusted `auth.users` metadata, while always inserting role `student`. The SQL is versioned locally in `supabase/migrations/0002_google_student_profile.sql`.
- Verified the live RPC definition and confirmed the signed-in coach account now reaches the coach dashboard.
- `npm run typecheck` and `npm run build` — passed. Vite still reports the single bundle above the 500 kB advisory threshold (518.82 kB minified).

## Google account selection and provider gate
- Added `prompt=select_account` to Google OAuth so sign-in opens Google's account chooser.
- Added a client route/session gate using Supabase trusted `app_metadata` provider fields. Non-Google sessions do not load profiles or reach the dashboard.
- When a non-Google session is present on the sign-in page, initiating Google OAuth clears only that browser's local session before redirecting.
- `npm run typecheck` and `npm run build` — passed; the single app bundle remains above Vite's 500 kB advisory threshold (519.18 kB minified).

## Remaining work
- Configure Supabase credentials and apply migration to a real project.
- Add secure invitation/role provisioning, group/member management, session/code flows, attendance RPCs, tracker, excuses, roster, audit trail, and realtime.
- Add a centralized offline state and disabled-action guidance as network-dependent features are implemented.
- Replace placeholder icons and dates/data with final assets and connected data.
- Run Lighthouse and device installation/update verification on HTTPS deployment.

## Mobile-first dashboards
- Added a data-backed student dashboard that loads the signed-in student's teams and upcoming open sessions from Supabase, with loading, error, refresh, and roster-empty states. It does not invent attendance totals while attendance tables and check-in flows are not implemented.
- Refined the coach overview for phone widths, including two-column metric cards, touch-friendly actions, and preserved session/team management sections.
- Replaced the app shell's links to unfinished routes with working section navigation for Overview, Sessions, and Teams; added safe-area-aware mobile navigation, skip-to-content, focus rings, and reduced-motion/transparency support.
- Added `/admin` as a coach-only route alias to the coach dashboard. Students are redirected to their own dashboard.
- Applied Apple Design guidance for system typography, direct feedback, predictable navigation, safe areas, accessibility, and reduced motion; used UI/UX Pro Max guidance for responsive layouts and touch target sizing. Installed `apple-design` from `emilkowalski/skills` in the user's Codex skills directory.
- `npm run typecheck` — passed.
- `npm run build` — passed after running with workspace access required by Vite's file resolver. The existing single JavaScript chunk remains above the 500 kB advisory threshold (523.95 kB minified).
- Opened `http://localhost:5173`; the current browser session is signed out, so the app correctly displayed Google-only sign-in. Authenticated dashboard rendering could not be visually confirmed in this session without completing Google account selection.
- No database changes were needed.

## Risks
- The live foundation schema exists, but Supabase reports no migration history; it appears to have been applied outside versioned migrations.
- Coach profiles still require trusted administrator provisioning; public onboarding must not allow role self-selection.
- The OAuth profile RPC update was applied to the live Supabase project outside its migration history because the project has no recorded migrations; the canonical SQL file is present locally.
- PWA install testing requires a deployed HTTPS origin and real mobile devices.

## Next steps
1. Configure the Supabase project and apply the migration.
2. Implement trusted coach/student onboarding and group management.
3. Build session creation, code submission, and atomic coach review RPCs.
4. Add records, close-session automation, tracker, excuses, and realtime.
5. Verify on target devices and audit PWA behavior.
