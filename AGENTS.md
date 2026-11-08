# AGENTS.md

Guidance for AI coding agents (opencode, Claude Code, Cursor, etc.) working in this repository.

## Project Overview

Sinkplane Mobile is the phone/tablet companion to **sinkplane-tv**, a fan-made app for [floatplane.com](https://www.floatplane.com). Built on Expo (SDK 58, new architecture) with Expo Router for file-based navigation. Package manager is **npm** (`package-lock.json`; no bun/pnpm here).

Authentication uses the same **username/password flow as floatplane.com/login**: the sign-in screen fetches captcha requirements from `/api/v3/auth/captcha/info`, renders the Cloudflare **Turnstile** challenge in a WebView (`src/components/turnstile-widget.tsx`), then `POST /api/v3/auth/login` with `returnSessionToken: true` (plus a 2FA step via `/api/v3/auth/checkFor2faLogin` when the account requires it). The returned session token is stored in `expo-secure-store` via the shared `SessionProvider` and sent as `Authorization: Bearer` on all API calls — the same mechanism Floatplane's own native apps use. All of this lives in `@sinkplane/shared` (`auth/passwordLogin.ts`) — this app only wires it up. (The TV app keeps the OIDC device flow because TV platforms can't render Turnstile.)

## Essential Commands

```bash
npm install              # install deps (uses .npmrc: GitHub Packages + legacy-peer-deps)
npm start                # Expo bundler
npm run ios              # dev server for iOS
npm run android          # dev server for Android
npm run web              # web dev server

# Quality gates — run these before considering work done
npm run lint             # ESLint (expo lint)
npx tsc --noEmit         # typecheck
npm run test:ci          # unit + E2E suites, coverage thresholds enforced (what CI runs)

# Tests
npm test                 # unit then E2E
npm run test:unit        # unit only (npm run test:unit:watch while iterating)
npm run test:e2e         # E2E only
npm run test:coverage    # both, with coverage reports in coverage/{unit,e2e}
```

`expo-secure-store` contains native code, so running on a device/simulator requires a **development build** (`npx expo run:ios|android`, or `eas build --profile development`). Expo Go will not work.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions.

Always install packages with `npx expo install <package>` so versions resolve SDK-compatible ones.

## Architecture

### Directory Structure

- **`src/app/`** — Expo Router screens (file-based routing; typed routes enabled). Keep non-route code out of it.
  - `_layout.tsx` — Root layout: shared `ThemeProvider` → react-query → `SessionProvider` → auth-gated `Stack`. Also syncs the in-app theme override to `Appearance.setColorScheme` so native chrome follows it.
  - `sign-in.tsx` — Username/password + Turnstile sign-in, on the `assets/images/bg.jpg` photo background (fixed white-on-dark palette).
  - `(tabs)/_layout.tsx` — `NativeTabs` (`expo-router/native-tabs`; Android `md` icons need `expo-symbols`).
  - `(tabs)/index.tsx` — Videos tab: infinite list of the active creator's posts, channel chips, newest/oldest sort.
  - `(tabs)/history.tsx` — History tab (as in the TV app): the watch history (`/api/v3/content/history`, offset-paged) with saved progress, newest watch first; refetches when the tab regains focus. Tapping an item opens the video page.
  - `(tabs)/live.tsx` — Live tab (as in the TV app): every subscribed creator's livestream with its status (live first, offline card otherwise); re-checks on focus and pull-to-refresh. Tapping a live stream opens the live player page.
  - `(tabs)/settings.tsx` — Profile, theme switcher (System / Light / Dark via shared `useTheme`), notifications (`components/settings/NotificationSettings`), subscriptions, sign out.
  - `video/[id].tsx` — Video page: player, title/channel, like/dislike, paged comments. Tapping a list item opens it.
  - `live/[id].tsx` — Live player page for a creator id: the player in live mode plus the stream details.
- **`src/components/player/`** — `VideoPlayer` (expo-video, `nativeControls={false}`) with custom touch controls: tap toggles the overlay, double-tap left/right half skips ∓15s, press-and-hold plays at 2×, speed menu (persisted), seek bar, fullscreen. Auto picture-in-picture + background audio when the app is backgrounded. `PlaybackSession` (app-wide player ownership, see Player notes) and `MiniPlayer` (the floating tile, mounted in the root layout).
- **`src/components/video-page/`** — `VideoDetails`, `ReactionBar`, `CommentItem`.
- **`src/notifications/`** — new-post notifications (see "Notifications notes"): `floatplane-socket` (sync socket client), `creator-notification` (payload parsing), `local-notifications` (permission + presenting), `notification-settings-api` (Floatplane's per-creator switches), `notification-store` (secure-store state), `background-check` (the background task).
- **`index.ts`** — app entry: defines the background task at module scope, then loads `expo-router/entry`.
- **`src/components/live/`** — `LiveStreamCard` (Live tab), `LiveDetails` (live page), `LiveStatusPill`.
- **`src/hooks/`, `src/utils/`** — data hooks (`use-post-comments`, `use-post-reaction`, `use-watch-history`, `use-live-streams`), notification hooks (`use-notification-sync` in the root navigator, `use-notification-navigation` in the tab layout, `use-notification-preferences`, `use-creator-notification-settings`), player hooks (`use-player-gestures`, `use-watch-progress`, `use-fullscreen-orientation`, `use-player-page`, `use-fold-posture`), `use-screen-layout` (tablet detection + list grid, see "Tablets"), formatting, `stream-source` (delivery info → HLS source), `mini-player-layout` (mini player corner geometry) and `player-page-layout` (stacked / side-by-side / immersive player page styles).
- **`src/shared.ts`** — The ONLY place that imports `@sinkplane/shared` subpaths. See below.
- **`assets/`** — Icons, splash images.
- **`modules/fold-posture/`** — local Expo module (autolinked): foldable hinge posture. Android: Jetpack WindowManager `FoldingFeature` (state, orientation, bounds in dp). iOS 27.1+: `UIHingeInteraction` (status/angle only, no geometry). Import as `@modules/fold-posture`; read through `src/hooks/use-fold-posture.ts`. Native changes need a new dev build.
- **`scripts/`** — `link-shared-dist.sh` (local shared-package override).
- **`patches/`** — `patch-package` patches, applied by `postinstall` (see Player notes for the expo-video one). npm 12 breaks `npx patch-package <pkg>` (its temp install fails), so regenerate a patch with `diff -u` against `npm pack <pkg>@<version>`.
- **`metro.config.js`** — watches the sibling `../shared` clone when present (see below).

### Shared Package (`@sinkplane/shared`) — read this before importing

`@sinkplane/shared` is published to GitHub Packages and installed as a regular dependency (`@sinkplane/shared@^0.1.1`; registry/auth in `.npmrc` — locally the token lives in `~/.npmrc`).

> **Never import from the `@sinkplane/shared` barrel.** It re-exports the TV connection server (`useTVServer`), which statically imports `react-native-tcp-socket`, `react-native-zeroconf`, and `@preeternal/react-native-cookie-manager` — native modules this app does not include. Importing the barrel breaks the Metro bundle. Import from `@/shared` (the mobile-safe re-export barrel in `src/shared.ts`) instead; add new mobile-safe exports there as needed. Safe areas: `auth/*`, `storage/*`, `theme/*`, `videos/*`, `constants/*`, `types/*`. Never import `connection/*`.

Other shared-package notes:

- The package is built against Expo SDK 57 / the TV app; this app is on SDK 58. That is why `.npmrc` sets `legacy-peer-deps=true` — npm would otherwise fail ERESOLVE on the `~57` peers and auto-install unwanted native modules. The modules its `dist` actually imports here (react, `@tanstack/react-query`, `expo-secure-store`) are installed as direct dependencies of this app.
- For local development against the sibling clone `../shared`: `npm run link:shared` symlinks `node_modules/@sinkplane/shared/dist` to the clone's `dist/` (Metro watches the clone via `metro.config.js`). Re-run it after every `npm install`. `npm run unlink:shared` restores the published dist. Never run `pnpm install` inside `../shared` (its `node_modules` is a symlink into the TV repo).
- To consume shared changes: bump to a published version (`npm i @sinkplane/shared@^x.y.z`) or use the link script above.

### Key Technologies

| Concern | Library |
|---|---|
| Routing | `expo-router` v58 (typed routes) |
| Data fetching | `@tanstack/react-query` |
| Images | `expo-image` |
| Auth/token storage | `expo-secure-store` |
| Captcha (login) | Cloudflare Turnstile in `react-native-webview` |
| Video playback | `expo-video` (config plugin: PiP + background playback) |
| Orientation | `expo-screen-orientation` |
| Notifications | `expo-notifications` (local only), `expo-background-task` + `expo-task-manager` |

### Player notes

- Fullscreen is a "fake" fullscreen (the same `VideoView` laid out full-screen + landscape lock), not `enterFullscreen()`: native fullscreen always shows the platform controls, so the custom controls and gestures wouldn't work there.
- `app.json` allows every orientation; on phones the root layout locks portrait (tablets: see "Tablets" below). On the video page (`use-fullscreen-orientation`) the screen is unlocked once a stream is playable, so rotating the device enters/leaves fullscreen. After the user toggles fullscreen by hand (fullscreen button, the fullscreen back arrow, Android back), the screen locks to their choice for the rest of the visit: a locked screen reports no rotations, so there's no signal to hand control back.
- **Tablets** (`ios.supportsTablet`; any window whose shorter side is ≥ 600dp, `isLargeScreen` in `use-screen-layout` — iPads, Android tablets, unfolded foldables; split-screen windows narrower than that count as phones): the whole app rotates (`lockAppOrientation(true)` = `DEFAULT`), rotating a player page never toggles fullscreen and fullscreen never locks the orientation. In landscape the player pages go side by side (player 2/3, details/comments 1/3, `sideBySide` from `usePlayerPage`); the tab lists become grids (`useListGrid`, ≥ 320dp columns; the list's `key` changes with the column count because FlatList can't change `numColumns` live). The root layout re-applies the app-wide lock on window-size changes, except while a player page is showing (it owns the orientation then). Android 16+ ignores app orientation locks on ≥ 600dp displays anyway (`mIgnoreOrientationRequest`). On iPad the native tab bar sits at the top, centered; the mini player's default top-right corner clears it.
- Posts without a video (image/text posts) show the first picture attachment's thumbnail, else the post thumbnail, else no media area.
- **iOS speed-up audio**: `patches/expo-video+58.0.13.patch` swaps expo-video's pitch-preserving `.spectral` time-pitch algorithm for `.timeDomain`. `.spectral` sounds warbly/distorted on speech at 1.5×; `.timeDomain` is AVPlayer's default and Apple's speech-tuned one. Native change: needs a new dev build. iOS builds link **precompiled** Expo modules by default (`EXPO_USE_PRECOMPILED_MODULES`), which ignore patched Swift in `node_modules`; `package.json` sets `expo.autolinking.ios.buildFromSource: ["ExpoVideo"]` so the patch is compiled. Patching another Expo module's native code needs the same entry. Drop the patch and that entry once upstream fixes it (https://github.com/expo/expo/issues/53185); re-check both on every expo-video bump.
- `VideoPlayer` reads `source` once: a later source (refetched delivery URL, refreshed token) would restart playback.
- **Mini player**: players are created unmanaged (`createVideoPlayer`) and owned by `PlaybackStore` (`src/components/player/PlaybackSession.tsx`, provided in the root layout) so playback can outlive the page. The player's close arrow (`usePlayerPage().minimize`) hands the player to the `MiniPlayer` tile (top-right, draggable to any corner) and goes back; tapping the tile reopens the page on the **same** player (`media.key` match → `reused`: no seek, no autoplay). Any other way of leaving the page (back gesture, Android back) ends the session and releases the player; opening other media or signing out stops it. Live sessions are keyed by creator; a live reload ends the session first so the remount gets a fresh player. A page left mounted under another player page keeps its session `suspended` and gets it back when the page on top goes away; the close arrow dismisses every stacked page back to the list. Resume state (seek + autoplay) is tracked per native player in `use-watch-progress`, so whichever view ends up holding a not-yet-started player finishes the resume.
- **Foldables (tabletop / "flex mode")**: when the hinge is half-opened and runs horizontally across the window, the player page goes immersive: video above the hinge, `PlayerControls variant="panel"` (always visible, no fullscreen toggle) below it. Book posture (vertical hinge) keeps the normal layout. Known limitation: the UI can't flip to upside-down portrait on iOS, so a Duo half-folded the other way up shows the split upside down. expo-screen-orientation treats any device with a bottom safe-area inset (every home-indicator iPhone, the Duo included) as notched and **rejects** locks containing upside-down (`ALL`, `PORTRAIT`); requesting one leaves the previous lock in place and the page stops rotating. iOS reports no hinge geometry, so a half-open fold in a **portrait** window is assumed to split it in the middle (iPhone Duo panel is 2007×2853 → two ~4:3 halves) — verify on hardware.
- Foldable emulators: Pixel 10 Pro Fold API 37 image ships no `config_display_features`, so apps get **no** `FoldingFeature`. Fix once per emulator: `adb shell settings put global display_features "fold-[1038,0,1038,2152]"`, then `adb emu posture 2` (half-open) / `3` (flat), `adb emu rotate` for tabletop. iOS: Xcode 27 replaced Simulator.app with DeviceHub (`Xcode.app/Contents/Applications/DeviceHub.app`); its Device/Controls menus have no hinge item, so look for the iPhone Duo hinge control in the device window. Until moved, the sim's hinge reads closed (angle 0) → no posture.

### Notifications notes

Floatplane pushes only to its own apps (Firebase), so this app builds local notifications from two sources:

- **Live (app in the foreground):** Floatplane's sync socket, the same one floatplane.com uses. It is Sails on Socket.IO v2 (Engine.IO 3), spoken directly over `WebSocket` in `floatplane-socket.ts` (no socket.io-client): `wss://www.floatplane.com/socket.io/?__sails_io_sdk_version=…&EIO=3&transport=websocket`, then emit `post /api/v3/socket/tk/connect` with `{ token }` (token mode; `/api/v3/socket/connect` is the cookie variant and ignores `Authorization`). Events arrive as `42["syncEvent",{"event":"creatorNotification","data":{eventType:"CONTENT_POST_RELEASE",title,message,creator,channel,content:<postId>,target:{url},…}}]`. EIO3 means the **client** pings (`2`) every `pingInterval`. The socket is closed while the app is backgrounded.
- **Background:** `expo-background-task` runs `checkForNewPosts` about every 15+ min (OS-scheduled; physical iOS devices only, not the simulator). It lists creators from `/api/v3/user/notification/list`, fetches each one's newest posts, and notifies about posts released since the previous run.
- Both paths key posts as `post:<postId>` and share a seen list (`notification-store`), so a post shows once. Tapping opens `/video/[id]`, including the tap that cold-launched the app (it waits for the root navigator to be ready).
- Floatplane's per-creator `contentFirebase` switch (its "push notifications" setting, shared with floatplane.com) gates both paths. Settings edits it and `contentEmail` through `/api/v3/user/notification/update` `{ creator, property, newValue }`.
- Background state lives in secure store with `AFTER_FIRST_UNLOCK` so the task can read it on a locked iPhone. The session token is mirrored to `sinkplane.notifications.session` for this reason (the shared `fptoken` uses the default accessibility). Sign-out clears it and cancels the task.
- First signed-in launch asks for notification permission. The in-app switch stays off when the OS denies it (Settings then links to system settings).
- `app.json` sets `enableRemoteNotifications: false` (no APNs entitlement, so personal-team signing works). Adding these native modules requires a new development build.

### Live stream notes

- Live status = `GET /api/v3/delivery/info?scenario=live&entityKind=livestream&entityId=<creator.liveStream.id>` for every subscribed creator that has a `liveStream` (`use-live-streams`). A **404 means offline**, not an error. The live URL is the first playable variant (the adaptive `live-abr` playlist), unlike on-demand, which takes the last (highest) variant.
- The tabs layout polls every 60s (`poll: true`) and badges the Live tab `LIVE`. Other observers share the same queries without polling. Background polls flip `isFetching`, so don't drive the pull-to-refresh spinner from it.
- The Live tab is **always shown**. Dynamically hiding a native tab remounts the navigator and resets every tab's state, so it is not toggled like the TV app's. Render the `Badge` conditionally: a Badge with text ignores `hidden`.
- `VideoPlayer live` turns off seeking (skip buttons, double-tap, seek bar), speed changes and progress saving. The live page remounts the player (`key`) to reload with a freshly signed URL: automatically 5s after a playback error (TV parity), or from Retry. A playback error matching 404 / "not found" marks the stream offline until the next status check instead of retrying.

### Auth notes (gotchas learned the hard way)

- **Never import the `@sinkplane/shared` barrel** — see the shared package section below.
- Floatplane API requests **must send a browser User-Agent** — floatplane.com sits behind Cloudflare bot management and serves a JS challenge page to RN/okhttp/CFNetwork default UAs. `shared/auth/apiClient.ts` sets `BROWSER_USER_AGENT` on every call.
- The login session token may be opaque (not a JWT); it is sent as `Authorization: Bearer` regardless (this matches Floatplane's own token-mode web/native clients).
- Turnstile tokens are **single-use and short-lived**; reset the widget (remount via `reloadKey`) after every failed login attempt.
- 2FA codes are 6 digits or backup codes (`xxxxxx-xxxxxx`); submitted via `POST /api/v3/auth/checkFor2faLogin` with the pending session token.

## Testing

Jest (`jest-expo` preset) with React Native Testing Library v14. Two suites, each with its own config on top of `jest.config.base.js`:

| Suite | Config | Files | Coverage gate |
|---|---|---|---|
| Unit | `jest.config.unit.js` | colocated `src/**/*.test.ts(x)` | components/hooks/utils (everything in `src` except `src/app` routes and `src/shared.ts`): 95% statements/functions/lines, 90% branches |
| E2E | `jest.config.e2e.js` | `__tests__/e2e/*.e2e.test.tsx` | all of `src`: 90% statements/functions/lines, 85% branches |

Coverage thresholds only apply to coverage runs (`test:*:coverage`, `test:ci`); Jest exits non-zero when a metric drops below its threshold. `jest.config.js` runs both suites ungated for `npx jest` / editor integrations.

- **Unit tests** render one component/hook in isolation. Shared helpers live in `jest/` (alias `@test/*`): `fixtures.ts` (user, creators, channels, videos, pinned `FIXED_NOW`) and `mocks/` (mapped for every suite: in-memory `expo-secure-store`; `expo-notifications` with permission state, presented notifications, and `tapNotification()`; `expo-task-manager` / `expo-background-task` with `mockTaskManager.run(name)` to run a task like the OS would). `window-size.ts` (`@test/window-size`): both suites start each test in a **390×844 phone window** (`resetTestWindow`); call `setTestWindow(TABLET_PORTRAIT_WINDOW | TABLET_LANDSCAPE_WINDOW | LARGE_PORTRAIT_WINDOW | …)` to test tablet layouts (it goes through `Dimensions.set`, so mounted `useWindowDimensions` update like a rotation).
- **E2E tests** boot the real Expo Router app (`src/app`) with `expo-router/testing-library` against a stateful in-memory Floatplane API that replaces `fetch` (`__tests__/e2e/helpers/mock-floatplane-api.ts`: password login + Turnstile token check, 2FA, sessions, content, progress, watch history, livestreams via `api.liveNow`, notification settings; supports failure injection (optionally narrowed with a `where` predicate), `NETWORK_ERROR`, and latency), plus an in-memory sync socket server that replaces `WebSocket` (`helpers/mock-floatplane-socket.ts`; `rt.socket.notifyPostRelease(...)` pushes a live notification). Only native-only modules are mocked (`helpers/native-mocks.ts`: the Turnstile WebView, splash screen); native tabs render as their real host components.
- Each E2E test starts with `const rt = loadRuntime()` (fresh module registry + reset API/storage), then `rt.seedSession()` / `rt.renderApp(url)`. Under fake timers use `rt.until(...)` instead of `waitFor`. Other helpers: `rt.turnstile.solve()`, `rt.selectTab()` / `rt.inTab()` / `rt.selectedTab()` / `rt.tabBadge()` (non-focused tabs stay mounted, so scope queries), `rt.router` (navigate in-app; deep links into signed-in routes don't survive launch while the session loads), `rt.listItemIds()` / `rt.reachListEnd()` (FlatList virtualizes), `rt.pressWithoutWaiting()` (assert in-flight UI), `rt.setWindow(...)` (tablet / rotation window sizes) and `rt.listNumColumns()` (grid columns of a tab list).
- RNTL v14: `render`, `renderHook`, and `fireEvent.*` are async — always `await` them.
- Tests need `@sinkplane/shared` with `auth/passwordLogin` (≥ 0.1.2, or `npm run link:shared`).

## Code Style & Conventions

### TypeScript

- **Strict mode** is on (`tsconfig.json` extends `expo/tsconfig.base`).
- **Path alias**: `@/*` maps to `./src/*` — prefer `@/shared`, `@/components/...` over relative imports.
- **No `any`** (`@typescript-eslint/no-explicit-any: error`).
- Prefer functional components with hooks over class components.

### Linting / Formatting (enforced)

- ESLint config in `eslint.config.js` runs on commit via Husky `pre-commit` → `lint-staged` → `expo lint --fix`.
- Notable rules: `max-len: 140`, `complexity: 12`, `eqeqeq: smart`, `no-var`, `prefer-const`, `no-shadow`, `camelcase`, `no-bitwise`.
- Prettier (`.prettierrc`): single quotes, trailingComma `all`, 2-space indent, `printWidth: 140`, LF, `arrowParens: avoid`.

### File Naming

- Component files: **PascalCase** (`MyComponent.tsx`).
- Utility files: **kebab-case** (`my-utility.ts`).
- Platform variants: `.ios.tsx`, `.android.tsx`, `.web.tsx`.

### Components

- Named exports preferred.
- Reusable components → `src/components`; screen components → `src/app` (Expo Router conventions).
- Use `useThemeColor` from `@/shared` for light/dark-aware colors; shared palette is `Colors`.

## Commit Conventions

Follow **Conventional Commits**:

```
<type>(<scope>): <subject>

feat(auth): add sign-out confirmation
fix(nav): resolve tab bar overlap on Android
docs(readme): update installation instructions
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.

### Pull Requests

- Lint + typecheck must pass (CI runs both).
- Test on iOS and Android where practical.
- Reference related issues.
- **Do not commit unless explicitly asked.** Only stage intended files; never commit secrets.

## Development Tips

- Use absolute paths when running commands (avoid `cd` chains).
- If Metro can't resolve modules, run `npx expo start --clear` and/or `rm -rf node_modules/.cache`.
- If `npm install` fails on `@sinkplane/shared` auth, check `~/.npmrc` contains `//npm.pkg.github.com/:_authToken=…`.
