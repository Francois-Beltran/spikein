# Database

Apply migrations in order with the Supabase CLI. `0001_foundation.sql` creates profiles, groups, group membership, sessions, and private session codes, plus helper functions and initial RLS policies.

`0002_google_student_profile.sql` restricts first-time student profile creation to an authenticated account with a verified email and a Google identity in trusted `auth.users` app metadata. It never grants coach role. Apply it to existing deployments before using first-time profile setup.

Session codes are intentionally inaccessible to students and are stored only as a digest. Code validation and check-in submission will be implemented together as a transaction in a later migration. Do not expose service role credentials in the client.
