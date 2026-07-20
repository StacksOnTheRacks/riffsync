# PWA Install

## Introduction

RiffSync can be installed as a Progressive Web App from the public site. The installed app is the same live web application on `riffsync.tv`, presented in a standalone browser window with a launcher icon. It is not an Electron app, native installer, offline catalog, or app-store distribution channel.

**Related capabilities:** `public-site-seo` owns the indexable `/download` head tags, sitemap entry, and prerender artifact. Watch-party media, room chat, YouTube playback, and Cognito sign-in keep using the normal web runtime.

## Functional Specification

`/download` is the durable public instructions page for installing RiffSync. It is indexable and explains what installation does, how to install in Chrome/Edge, how to add RiffSync to the iOS home screen, how to add it to the macOS Dock from Safari, and what to do when a browser does not expose an install option.

The public navigation label is **Get App**. It links to `/download` in the normal site header and footer. The header item is hidden in compact room chrome and when the app is already running in installed PWA display mode. The `/download` page remains directly reachable so users can search for or share install instructions.

Installing RiffSync does not change identity, room authority, catalog access, or realtime behavior. Rooms, chat, YouTube playback, screen sharing, SFU media, and API calls still require network access. No offline watch-party promise is made.

## Technical Specification

The web app manifest is served from `/manifest.webmanifest`, scoped to `/`, with `display: "standalone"`, app name `RiffSync`, and first-party icon assets. The SPA shell links the manifest, app theme color, and Apple touch icon.

A minimal service worker is served from `/sw.js` and registered by `apps/web/src/main.tsx` only in production builds. It claims clients on activation and intentionally avoids aggressive response caching so WebSocket, SFU, YouTube, API, and auth flows remain network-live.

Installed-app detection is client-local: `matchMedia('(display-mode: standalone)')`, `matchMedia('(display-mode: minimal-ui)')`, and iOS `navigator.standalone`. The browser install prompt is captured from `beforeinstallprompt` when Chromium provides it; browsers without that event use manual instructions on `/download`.

Relevant repository versions from package metadata: `@riffsync/web` uses React `^19.2.5`, React Router `^7.14.2`, TypeScript `~6.0.2`, Vite `^8.0.10`, and Vitest `^3.0.2`.

## Testing Strategy

Unit tests cover installed-app detection across standalone, minimal-ui, iOS standalone, and normal browser modes. Component tests cover the `/download` page install CTA, manual instructions, and already-installed copy. Header tests prove **Get App** appears in normal browser mode and is hidden when installed-app detection returns true.

Build verification proves `manifest.webmanifest`, `sw.js`, PWA icons, and `download/index.html` ship in `dist/`, while existing SEO artifact verification proves `/download` appears in sitemap/prerender output.

## References

- `.ai/interface/presentation.md` - Get App nav contract and `/download` head tags.
- `.ai/operations/build_packaging.md` - static route, sitemap, and prerender packaging.
- `.ai/specs/public-site-seo.spec.md` - indexable route boundary.
- `apps/web/src/pwa/` - installed-app detection and install prompt helpers.
