# Database

Apply migrations in order with the Supabase CLI. `0001_foundation.sql` creates profiles, groups, group membership, sessions, and private session codes, plus helper functions and initial RLS policies.

`0002_google_student_profile.sql` restricts first-time student profile creation to an authenticated account with a verified email and a Google identity in trusted `auth.users` app metadata. It never grants coach role. Apply it to existing deployments before using first-time profile setup.

`20261013070351_team_attendance_workflows.sql` adds email-bound team invitations, attendance attempts and records, and transaction-backed RPCs for team creation, invitations, session/code creation, check-in, review, and session closure. Invitation email addresses are coach-visible only; verified Google accounts claim matching invites after their student profile exists. Pending invitations reserve roster spots, with a maximum of 20 current and invited players.

`20261013070810_attendance_window_and_capacity.sql` preserves the check-in window before closure, blocks review after closure, makes invitation retries capacity-safe, and revokes anonymous access to schema helper/event-trigger functions.

Session codes are intentionally inaccessible to students and are stored only as a digest. The original code is returned once by `create_session_with_code`. Students submit a code through `submit_attendance`; coaches approve/reject through `review_attendance_attempt`. After the check-in window, `close_attendance_session` closes the session and marks remaining roster members absent. Do not expose service role credentials in the client.
