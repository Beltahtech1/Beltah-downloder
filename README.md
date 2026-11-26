# BELTAH DOWNLOADER

A responsive, installable PWA by **Beltah Tech Team**, prepared for Vercel deployment.

## Current functionality

- Responsive dark/glass UI for mobile and desktop.
- Platform/link detection and URL validation.
- Direct media/file link downloads (MP4, MP3, WebM, PDF, ZIP, images and more).
- Recent link history and session queue.
- PWA manifest, service worker, SVG app icon and install guidance.
- Admin UI gate backed by a server-side environment variable.
- Vercel-ready static hosting and serverless API route.

## Important resolver status

The repository originally contained only a license and a one-line README. The resolver URL mentioned during planning (`https://ytv.xcasper.space`) did not have a verifiable public API contract available during implementation. Therefore, platform extraction is deliberately **not represented as working** and no undocumented endpoint or response format has been guessed. Configure a provider only after obtaining its documented API request/response schema and confirming that its use is authorized. Do not use this application to bypass DRM, access controls, or platform restrictions.

The current app downloads direct HTTP(S) media/file URLs. Many platforms provide webpage URLs rather than direct media files; those need a compatible authorized resolver/backend.

## Deploy to Vercel

1. Import this GitHub repository into Vercel.
2. Framework preset: **Other**. Build command: leave blank. Output directory: `.`.
3. Add the environment variable `ADMIN_PASSCODE` with the admin passcode you choose (set the planned passcode privately in Vercel; do not commit it).
4. Deploy. No build step or package installation is required.

## PWA installation

- Android/desktop Chromium: open the deployed HTTPS site and choose **Install app** or **Add to Home Screen**.
- iPhone/iPad: open in Safari → Share → **Add to Home Screen**.
- The service worker caches the app shell. API routes are intentionally not cached.

## Admin configuration

The admin dialog uses `/api/admin-auth` and checks `ADMIN_PASSCODE` on the server. Resolver URL/path settings currently save to the current browser only; they do not store secrets and do not activate an undocumented provider integration. The current UI unlock acknowledgement is not an authorization token for privileged backend operations.

## Release links

No APK, EXE, MSI, DMG, AppImage or DEB is fabricated by this web project. Publish real signed installers through GitHub Releases when native desktop/mobile builds exist.

## Local preview

Serve this folder using any static HTTP server. PWA service workers require localhost or HTTPS.

---
© 2026 Beltah Tech. BSD 2-Clause License.
