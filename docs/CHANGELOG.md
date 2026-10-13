# Changelog

## 0.1.0 — Foundation
- Created the React/Vite TypeScript application, responsive workspace/auth screens, Supabase auth foundation, initial RLS migration, and PWA shell.
- Switched authentication to Google-only sign-in/sign-up; removed password authentication and self-selected roles.
- Added coach dashboard with live team/session data, team creation, and session scheduling.
- Fixed Google OAuth callback navigation after local smoke testing.
- Added Google-only first-sign-in player profile setup and made profile lookup errors visible.
- Hardened the deployed student-profile RPC to validate Google identity and confirmed email from trusted Auth records.
- Made Google OAuth show the account chooser and gated protected app routes on Google provider metadata.
