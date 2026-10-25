# Database

Apply migrations in order with the Supabase CLI. `0001_foundation.sql` creates profiles, groups, group membership, sessions, and private session codes, plus helper functions and initial RLS policies.

`0002_google_student_profile.sql` restricts first-time student profile creation to an authenticated account with a verified email and a Google identity in trusted `auth.users` app metadata. It never grants coach role. Apply it to existing deployments before using first-time profile setup.

`20261013070351_team_attendance_workflows.sql` adds email-bound team invitations, attendance attempts and records, and transaction-backed RPCs for team creation, invitations, session/code creation, check-in, review, and session closure. The later `team_join_codes` migration replaces email invitations with a coach-generated shared code. Codes are stored only as a digest; joining requires a verified Google student account and is limited to 20 roster members.

`20261013070810_attendance_window_and_capacity.sql` preserves the check-in window before closure, blocks review after closure, makes invitation retries capacity-safe, and revokes anonymous access to schema helper/event-trigger functions.

`20261013071805_disambiguate_invitation_conflict.sql` targets the named invitation uniqueness constraint explicitly. The subsequent `team_join_codes` migration drops the obsolete invitation table/type and RPCs, preserves existing memberships, and provides `create_team_join_code` and `join_team_with_code`.

Coaches generate or replace a team's join code from the team detail page and share it directly with players. The plaintext appears only in the generation response; replacing a code invalidates the previous one. Students enter the code on My teams. The join RPC validates the trusted Google identity, serializes roster changes per team, and enforces the 20-player cap.

`20261013080900_session_management_student_rosters.sql` adds coach-only RPCs to rotate a session check-in code and delete a session, plus student-visible membership/profile policies scoped to teams they already joined. `20261013081000_fix_student_roster_policy_recursion.sql` uses the existing security-definer membership helper in those policies to avoid recursive RLS evaluation.

`20261013082000_disable_checkin_window_for_testing.sql` is a historical testing migration that temporarily disabled the session check-in time window and code expiry. `20261013152608_restore_checkin_window_and_manual_attendance.sql` restored the server-side check-in window and coach manual attendance workflow. The client flag `ENFORCE_CHECKIN_WINDOW` in `src/features/dashboard/attendanceConfig.ts` is enabled. Team membership, verified Google student identity, session-open status, and code matching remain required.

Session codes are intentionally inaccessible to students and are stored only as a digest. The original code is returned once by `create_session_with_code`. Students submit a code through `submit_attendance`; coaches approve/reject through `review_attendance_attempt`. After the check-in window, `close_attendance_session` closes the session and marks remaining roster members absent. Do not expose service role credentials in the client.

`20261014140423_late_only_after_two_hour_grace.sql` changes attendance classification: a check-in is late only when its submission (or a coach's manual mark) occurs more than two hours after the session ends. It also corrects existing late records that fall within that grace period. Deleting a coach-owned team from the Teams page cascades to its memberships, sessions, check-in codes, and attendance data; player accounts remain.

`20261025054027_coach_managed_qr_checkin.sql` adds coach-managed QR sharing for a session. The protected share table stores only the active flag, token digest, and expiry; coach RPCs open, read, rotate, and close sharing. Students submit scans through `submit_session_qr_attendance`, which applies the same verified-account, roster, session timing, and one-attempt rules as typed-code check-in. Valid QR submissions create pending attempts for the existing coach review workflow. Closing a session also invalidates its QR token.

`20261025055544_allow_custom_session_types.sql` changes `sessions.type` to text and updates the coach session creation RPC to accept custom types. The session form suggests the standard types and types used in the coach's previous sessions while allowing free entry.

