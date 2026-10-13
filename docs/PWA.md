# Progressive Web App

Vite PWA generates the web manifest and service worker. The shell and static assets are precached, SPA navigation falls back to `/index.html`, and all Supabase project traffic uses `NetworkOnly`. The generated starter icons are brand placeholders and should be replaced with reviewed production artwork. Google Fonts are a remote visual enhancement; system sans-serif fonts are the offline fallback.

Network-dependent attendance actions are not yet implemented. When added, they must detect offline state, disable submission/review, and explain that a connection is required. Before release, verify install/update behavior and run a Lighthouse PWA audit on the deployed HTTPS build; test install on Android and iOS.
