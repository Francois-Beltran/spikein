# Architecture

Spike In is a React SPA. The Vite build is hosted as static files; Supabase provides Google OAuth, PostgreSQL, RLS, and RPCs for attendance and team workflows. Google is the sole authentication provider. OAuth requests prompt Google to show the account chooser. The app checks the session's trusted provider metadata before fetching profiles or rendering protected pages. The browser uses only the public anon key. The service worker precaches the app shell and explicitly uses NetworkOnly for Supabase traffic so auth or attendance responses are never served from cache.

Providers own the shared TanStack Query client and auth/profile state. React Router gates the workspace on authentication and a profile. Feature-owned screens live under `src/features`; shared presentation is in `src/components`; versioned SQL lives in `supabase/migrations`.

New users can create a student profile through the restricted `create_student_profile` RPC after Google OAuth and a verified-email check. The app does not offer self-service role selection: coaches must be provisioned by a trusted administrator before first sign-in. Team access is granted using coach-generated join codes; no email invitation flow is used.
