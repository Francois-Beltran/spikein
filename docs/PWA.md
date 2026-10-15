# Progressive Web App

Vite PWA generates the web manifest and service worker. The app shell and static assets are precached, navigation falls back to `/index.html`, and Supabase requests use `NetworkOnly` so session, profile, and attendance responses are never served from cache. Updated volleyball icons include a separate Android maskable icon. The manifest and document theme colors match the app's dark green launch animation.

The install button uses the browser's native install prompt when available. Android browsers require the app to be installable and may only expose that prompt after a user gesture; other browsers receive platform-specific install instructions. The website cannot replace Android's native splash screen, so the manifest icon and background provide the transition before the in-app launch animation.

Sign-in, team joins, check-ins, and coach attendance actions require an active connection. Before inviting teammates, verify the deployed HTTPS build, Google OAuth redirect URLs, PWA install/update flow on Android and iOS, and the full coach/student attendance workflow on phones.
