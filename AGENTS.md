# AGENTS.md

Guidance for AI coding agents (opencode, Claude Code, Cursor, etc.) working in this repository.

## Project Overview

Sinkplane Mobile is the phone/tablet companion to **sinkplane-tv**, a fan-made app for [floatplane.com](https://www.floatplane.com). Built on Expo (SDK 58, new architecture) with Expo Router for file-based navigation. Package manager is **pnpm** (`pnpm-lock.yaml`, version pinned in `packageManager`; Node from `.nvmrc`). Never use npm/yarn here.

Authentication uses the same **username/password flow as floatplane.com/login**: the sign-in screen fetches captcha requirements from `/api/v3/auth/captcha/info`, renders the Cloudflare **Turnstile** challenge in a WebView (`src/components/turnstile-widget.tsx`), then `POST /api/v3/auth/login` with `returnSessionToken: true` (plus a 2FA step via `/api/v3/auth/checkFor2faLogin` when the account requires it). The returned session token is stored in `expo-secure-store` via the shared `SessionProvider` and sent as `Authorization: Bearer` on all API calls — the same mechanism Floatplane's own native apps use. All of this lives in `@sinkplane/shared` (`auth/passwordLogin.ts`) — this app only wires it up. (The TV app keeps the OIDC device flow because TV platforms can't render Turnstile.)

## Essential Commands

```bash
make setup               # pnpm install --frozen-lockfile + git hooks (.githooks)
pnpm start               # Expo bundler
pnpm ios                 # build + run on iOS (development build)
pnpm android             # build + run on Android
pnpm web                 # web dev server

# The gate — run before you stop (the agent stop hook, pre-push hook and CI run it too)
make check               # fmt-check lint typecheck arch coverage crap build

# Fast feedback
make test                # unit suite (pnpm test:unit:watch while iterating)
make acceptance          # E2E suite
make lint                # eslint --max-warnings=0, then knip (unused files/exports/deps)
make typecheck           # tsc (app + scripts/)
make arch                # dependency-cruiser layer rules
make crap                # per-function CRAP (run make coverage first)
make build               # Metro export for iOS + Android
make mutate SCOPE=changed  # Stryker on src files changed vs origin/main (CI runs this on PRs)
make fmt                 # prettier --write
```

Every gate's config is listed in `.gates-protected`: **ask a human before editing any of those files, and never loosen a gate to get green.** Suppressions need `-- reason`; coverage/mutation ignore comments are banned by lint. Skills live in `.cursor/skills` (also `.claude/skills`); the `gauntlet` skill runs a story through specifier → coder → cleaner → hardener → qa.

`expo-secure-store` contains native code, so running on a device/simulator requires a **development build** (`pnpm exec expo run:ios|android`, or `eas build --profile development`). Expo Go will not work.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions.

Always install packages with `pnpm exec expo install <package>` so versions resolve SDK-compatible ones.

## Architecture

### Directory Structure

- **`src/app/`** — Expo Router screens (file-based routing; typed routes enabled). Keep non-route code out of it.
  - `_layout.tsx` — Root layout: shared `ThemeProvider` → react-query → `SessionProvider` → auth-gated `Stack`. Also syncs the in-app theme override to `Appearance.setColorScheme` so native chrome follows it.
  - `sign-in.tsx` — Username/password + Turnstile sign-in, on the `assets/images/bg.jpg` photo background (fixed white-on-dark palette).
  - `(tabs)/_layout.tsx` — `NativeTabs` (`expo-router/native-tabs`; Android `md` icons need `expo-symbols`).
  - `(tabs)/index.tsx` — Videos tab: infinite list of the active creator's posts, channel chips, newest/oldest sort.
  - `(tabs)/history.tsx` — History tab (as in the TV app): the watch history (`/api/v3/content/history`, offset-paged) with saved progress, newest watch first; refetches when the tab regains focus. Tapping an item opens the video page.
  - `(tabs)/live.tsx` — Live tab (as in the TV app): every subscribed creator's livestream with its status (live first, offline card otherwise); re-checks on focus and pull-to-refresh. Tapping a live stream opens the live player page.
  - Route files stay thin: screen pieces live in `src/components/<area>/` (e.g. `sign-in/`, `tab-screen/`, `videos/`, `settings/`, `video-page/`).
  - `(tabs)/settings.tsx` — Profile, theme switcher (System / Light / Dark via shared `useTheme`), notifications (`components/settings/NotificationSettings`), subscriptions, sign out.
  - `video/[id].tsx` — Video page: player, title/channel, like/dislike, paged comments. Tapping a list item opens it.
  - `live/[id].tsx` — Live player page for a creator id: the player in live mode plus the stream details.
- **`src/components/player/`** — `VideoPlayer` (expo-video, `nativeControls={false}`) with custom touch controls: tap toggles the overlay, double-tap left/right half skips ∓15s, press-and-hold plays at 2×, speed menu (persisted), seek bar, fullscreen. Auto picture-in-picture + background audio when the app is backgrounded. `PlaybackSession` (app-wide player ownership, see Player notes) and `MiniPlayer` (the floating tile, mounted in the root layout).
- **`src/components/video-page/`** — `VideoDetails`, `ReactionBar`, `CommentItem`, `SuggestedVideos` (end screen: Floatplane's related posts from `/api/v3/content/related`, shown via `VideoPlayer`'s `endScreen` when an on-demand video ends, as the middle of `PlayerControls` (`center`, in place of skip / replay) so the top and bottom bars stay; centered row sized to the space left; Replay / Hide; opening one **replaces** the finished video's page).
- **`src/notifications/`** — new-post notifications (see "Notifications notes"): `floatplane-socket` (sync socket client), `creator-notification` (payload parsing), `local-notifications` (permission + presenting), `notification-settings-api` (Floatplane's per-creator switches), `notification-store` (secure-store state), `background-check` (the background task).
- **`index.ts`** — app entry: defines the background task at module scope, then loads `expo-router/entry`.
- **`src/components/live/`** — `LiveStreamCard` (Live tab), `LiveDetails` (live page), `LiveStatusPill`.
- **`src/hooks/`, `src/utils/`** — data hooks (`use-post-comments`, `use-post-reaction`, `use-watch-history`, `use-live-streams`), notification hooks (`use-notification-sync` in the root navigator, `use-notification-navigation` in the tab layout, `use-notification-preferences`, `use-creator-notification-settings`), player hooks (`use-player-gestures`, `use-watch-progress`, `use-fullscreen-orientation`, `use-fold-posture`; `use-player-page` lives in `components/player` next to the `PlaybackSession` store it reads), `use-screen-layout` (tablet detection + list grid, see "Tablets"), formatting, `log` (the one console sink), `stream-source` (delivery info → HLS source), `mini-player-layout` (mini player corner geometry) and `player-page-layout` (stacked / wide / immersive player page styles).
- **`src/shared.ts`** — The ONLY place that imports `@sinkplane/shared` subpaths. See below.
- **`assets/`** — Icons, splash images.
- **`modules/fold-posture/`** — local Expo module (autolinked): foldable hinge posture. Android: Jetpack WindowManager `FoldingFeature` (state, orientation, bounds in dp). iOS 27.1+: `UIHingeInteraction` (status/angle only, no geometry). Import as `@modules/fold-posture`; read through `src/hooks/use-fold-posture.ts`. Native changes need a new dev build.
- **`modules/hardware-keys/`** — local Expo module (autolinked): `SpaceKeyListener`, an invisible 1×1 native view the `VideoPlayer` mounts (import as `@modules/hardware-keys`) so a hardware keyboard's **space bar** plays/pauses (same as the center button). React Native delivers no hardware key events on iOS, so the view takes first responder (`pressesBegan`); on Android it takes view focus (`dispatchKeyEvent`). It re-takes the keyboard when it enters a window, the app returns to the foreground, or `active` turns back on (off while the speed-menu modal is open). Never give it `pointerEvents="none"` or `opacity: 0`: on iOS the former disables user interaction, which also drops key presses. Jest maps it to `jest/mocks/hardware-keys.tsx` (`fireEvent(getByTestId('space-key-listener'), 'space')`). Absent in older dev builds (renders nothing). Native changes need a new dev build.
- **`scripts/`** — `link-shared-dist.sh` (local shared-package override).
- **`patches/`** — pnpm patches (`patchedDependencies` in `pnpm-workspace.yaml`; see Player notes for the expo-video one). Edit one with `pnpm patch <pkg>@<version>` → `pnpm patch-commit <dir>`.
- **`metro.config.js`** — watches the sibling `../shared` clone when present (see below).

### Shared Package (`@sinkplane/shared`) — read this before importing

`@sinkplane/shared` is published to GitHub Packages and installed as a regular dependency (`@sinkplane/shared@^0.1.2`; registry/auth in `.npmrc` — locally the token lives in `~/.npmrc`).

> **Never import from the `@sinkplane/shared` barrel.** It re-exports the TV connection server (`useTVServer`), which statically imports `react-native-tcp-socket`, `react-native-zeroconf`, and `@preeternal/react-native-cookie-manager` — native modules this app does not include. Importing the barrel breaks the Metro bundle. Import from `@/shared` (the mobile-safe re-export barrel in `src/shared.ts`) instead; add new mobile-safe exports there as needed. Safe areas: `auth/*`, `storage/*`, `theme/*`, `videos/*`, `constants/*`, `types/*`. Never import `connection/*`.

Other shared-package notes:

- The package is built against Expo SDK 57 / the TV app; this app is on SDK 58. That is why `pnpm-workspace.yaml` sets `autoInstallPeers: false` / `strictPeerDependencies: false` — pnpm would otherwise auto-install the unwanted native peers (zeroconf, tcp-socket, cookie-manager); `pnpm peers check` lists the expected `~57` mismatches. The modules its `dist` actually imports here (react, `@tanstack/react-query`, `expo-secure-store`) are installed as direct dependencies of this app.
- For local development against the sibling clone `../shared`: `pnpm link:shared` symlinks `node_modules/@sinkplane/shared/dist` (inside pnpm's `.pnpm` store dir) to the clone's `dist/` (Metro watches the clone via `metro.config.js`). Re-run it after every `pnpm install`. `pnpm unlink:shared` restores the published dist. Never run `pnpm install` inside `../shared` (its `node_modules` is a symlink into the TV repo).
- To consume shared changes: bump to a published version (`pnpm add @sinkplane/shared@^x.y.z`) or use the link script above.

### Key Technologies

| Concern            | Library                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| Routing            | `expo-router` v58 (typed routes)                                                |
| Data fetching      | `@tanstack/react-query`                                                         |
| Images             | `expo-image`                                                                    |
| Auth/token storage | `expo-secure-store`                                                             |
| Captcha (login)    | Cloudflare Turnstile in `react-native-webview`                                  |
| Video playback     | `expo-video` (config plugin: PiP + background playback)                         |
| Orientation        | `expo-screen-orientation`                                                       |
| Notifications      | `expo-notifications` (local only), `expo-background-task` + `expo-task-manager` |

### Player notes

- Fullscreen is a "fake" fullscreen (the same `VideoView` laid out full-screen + landscape lock), not `enterFullscreen()`: native fullscreen always shows the platform controls, so the custom controls and gestures wouldn't work there.
- `app.json` allows every orientation; on phones the root layout locks portrait (tablets: see "Tablets" below). On the video page (`use-fullscreen-orientation`) the screen is unlocked once a stream is playable, so rotating the device enters/leaves fullscreen. After the user toggles fullscreen by hand (fullscreen button, the fullscreen back arrow, Android back), the screen locks to their choice for the rest of the visit: a locked screen reports no rotations, so there's no signal to hand control back.
- **Tablets** (`ios.supportsTablet`; any window whose shorter side is ≥ 600dp, `isLargeScreen` in `use-screen-layout` — iPads, Android tablets, unfolded foldables; split-screen windows narrower than that count as phones): the whole app rotates (`lockAppOrientation(true)` = `DEFAULT`), rotating a player page never toggles fullscreen and fullscreen never locks the orientation. In landscape the player pages stay stacked (details/comments below the player), but the player is centered and capped at 60% of the window height (`wide` from `usePlayerPage`) so the details keep room; the tab lists become grids (`useListGrid`, ≥ 320dp columns; the list's `key` changes with the column count because FlatList can't change `numColumns` live). The root layout re-applies the app-wide lock on window-size changes, except while a player page is showing (it owns the orientation then). Android 16+ ignores app orientation locks on ≥ 600dp displays anyway (`mIgnoreOrientationRequest`). On iPad the native tab bar sits at the top, centered; the mini player's default top-right corner clears it.
- Posts without a video (image/text posts) show the first picture attachment's thumbnail, else the post thumbnail, else no media area.
- **iOS speed-up audio**: `patches/expo-video+58.0.13.patch` swaps expo-video's pitch-preserving `.spectral` time-pitch algorithm for `.timeDomain`. `.spectral` sounds warbly/distorted on speech at 1.5×; `.timeDomain` is AVPlayer's default and Apple's speech-tuned one. Native change: needs a new dev build. iOS builds link **precompiled** Expo modules by default (`EXPO_USE_PRECOMPILED_MODULES`), which ignore patched Swift in `node_modules`; `package.json` sets `expo.autolinking.ios.buildFromSource: ["ExpoVideo"]` so the patch is compiled. Patching another Expo module's native code needs the same entry. Drop the patch and that entry once upstream fixes it (https://github.com/expo/expo/issues/53185); re-check both on every expo-video bump.
- **Resume position**: Floatplane's post endpoint often omits `progress`, so `use-resume-position` falls back to the batch `/api/v3/content/progress` endpoint (TV parity), and the video page holds the placeholder until it answers: `VideoPlayer` reads `initialTime` only at mount.
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

- Live status = `GET /api/v3/delivery/info?scenario=live&entityKind=livestream&entityId=<creator.liveStream.id>` for every subscribed creator that has a `liveStream` (`use-live-streams`). A **404 means offline**, not an error. The endpoint can also answer **200 with a signed playlist URL while the creator is offline**, so the check then GETs that playlist (same headers as the player): 404 → offline, other failures → error. In E2E, `api.liveDeliveryWhenOffline` reproduces that. The live URL is the first playable variant (the adaptive `live-abr` playlist), unlike on-demand, which takes the last (highest) variant.
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

| Suite | Config                | Files                           | Coverage gate                                                                                                                          |
| ----- | --------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Unit  | `jest.config.unit.js` | colocated `src/**/*.test.ts(x)` | components/hooks/utils (everything in `src` except `src/app` routes and `src/shared.ts`): 95% statements/functions/lines, 90% branches |
| E2E   | `jest.config.e2e.js`  | `__tests__/e2e/*.e2e.test.tsx`  | all of `src`: 90% statements/functions/lines, 85% branches                                                                             |

Coverage thresholds only apply to coverage runs (`make coverage`, part of `make check`); Jest exits non-zero when a metric drops below its threshold. `jest.config.js` runs both suites ungated for `pnpm exec jest` / editor integrations. `make crap` then scores every function in `src` (complexity² × uncovered³ + complexity, coverage merged from both suites) and fails above 6. `make mutate` runs Stryker against the unit suite over the same scope as unit coverage (routes are only exercised end to end).

- **Unit tests** render one component/hook in isolation. Shared helpers live in `jest/` (alias `@test/*`): `fixtures.ts` (user, creators, channels, videos, pinned `FIXED_NOW`) and `mocks/` (mapped for every suite: in-memory `expo-secure-store`; `expo-notifications` with permission state, presented notifications, and `tapNotification()`; `expo-task-manager` / `expo-background-task` with `mockTaskManager.run(name)` to run a task like the OS would). `window-size.ts` (`@test/window-size`): both suites start each test in a **390×844 phone window** (`resetTestWindow`); call `setTestWindow(TABLET_PORTRAIT_WINDOW | TABLET_LANDSCAPE_WINDOW | LARGE_PORTRAIT_WINDOW | …)` to test tablet layouts (it goes through `Dimensions.set`, so mounted `useWindowDimensions` update like a rotation).
- **E2E tests** boot the real Expo Router app (`src/app`) with `expo-router/testing-library` against a stateful in-memory Floatplane API that replaces `fetch` (`__tests__/e2e/helpers/mock-floatplane-api.ts`: password login + Turnstile token check, 2FA, sessions, content, progress, watch history, livestreams via `api.liveNow`, notification settings; supports failure injection (optionally narrowed with a `where` predicate), `NETWORK_ERROR`, and latency), plus an in-memory sync socket server that replaces `WebSocket` (`helpers/mock-floatplane-socket.ts`; `rt.socket.notifyPostRelease(...)` pushes a live notification). Only native-only modules are mocked (`helpers/native-mocks.ts`: the Turnstile WebView, splash screen); native tabs render as their real host components.
- Each E2E test starts with `const rt = loadRuntime()` (fresh module registry + reset API/storage), then `rt.seedSession()` / `rt.renderApp(url)`. Under fake timers use `rt.until(...)` instead of `waitFor`. Other helpers: `rt.turnstile.solve()`, `rt.selectTab()` / `rt.inTab()` / `rt.selectedTab()` / `rt.tabBadge()` (non-focused tabs stay mounted, so scope queries), `rt.router` (navigate in-app; deep links into signed-in routes don't survive launch while the session loads), `rt.listItemIds()` / `rt.reachListEnd()` (FlatList virtualizes), `rt.pressWithoutWaiting()` (assert in-flight UI), `rt.setWindow(...)` (tablet / rotation window sizes) and `rt.listNumColumns()` (grid columns of a tab list).
- RNTL v14: `render`, `renderHook`, and `fireEvent.*` are async — always `await` them.
- Tests need `@sinkplane/shared` with `auth/passwordLogin` (≥ 0.1.2, or `pnpm link:shared`).

## Code Style & Conventions

### TypeScript

- **Strictest mode** (`tsconfig.json` extends `expo/tsconfig.base`): `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noUnused*`, `verbatimModuleSyntax`, … `skipLibCheck` stays on: React Native's global declarations conflict with `lib.dom` and can't pass a full lib check. `scripts/` (Node, type-stripped `.mts`) has its own `scripts/tsconfig.json`.
- **Path alias**: `@/*` maps to `./src/*` — prefer `@/shared`, `@/components/...` over relative imports.
- **No `any`** (`@typescript-eslint/no-explicit-any: error`).
- Prefer functional components with hooks over class components.

### Linting / Formatting (enforced)

- `eslint.config.mjs` (typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, sonarjs, react-hooks, eslint-comments, import-x, jest): `complexity` 6, `max-lines-per-function` 40 (not in tests), `max-lines` 300, `max-params` 3, `max-depth` 3, `max-nested-callbacks` 3, `no-magic-numbers`, `strict-boolean-expressions`, `explicit-module-boundary-types`, `naming-convention`, `no-console`, `import-x/no-default-export` (except `src/app`, where Expo Router needs default exports), `no-restricted-imports` for the `@sinkplane/shared` barrel. Size/complexity rules cannot be disabled inline.
- Git hooks (`.githooks`, enabled by `make setup`): pre-commit runs `make fmt-check lint`, pre-push runs `make check`.
- Prettier (`.prettierrc`): single quotes, `printWidth: 100`; `.editorconfig` for the rest.
- Console output goes through `src/utils/log.ts` (the only `no-console` exception).

### File Naming

- Component files: **PascalCase** (`MyComponent.tsx`).
- Utility files: **kebab-case** (`my-utility.ts`).
- Platform variants: `.ios.tsx`, `.android.tsx`, `.web.tsx`.

### Components

- Named exports preferred.
- Reusable components → `src/components`; routes → `src/app` (Expo Router conventions), kept thin.
- Layers (`make arch`): `src/app` → `src/components` → `src/hooks` → `src/notifications`, `src/utils` → `src/shared.ts`. Import your own layer and those below, never above; nothing outside `src/app` imports a route.
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

- Every CI job is a required check: `static` (format, lint + knip, typecheck, arch), `test` (coverage + CRAP), `bundle` (Metro export), `mutation` (Stryker on changed files; `thresholds.break` in `stryker.config.json` is a ratchet, starting at 69% (the full-run score when the gate was added). Raise it as tests harden, never lower it).
- Test on iOS and Android where practical.
- Reference related issues.
- **Do not commit unless explicitly asked.** Only stage intended files; never commit secrets.

## Development Tips

- Use absolute paths when running commands (avoid `cd` chains).
- If Metro can't resolve modules, run `pnpm exec expo start --clear` and/or `rm -rf node_modules/.cache`.
- If `pnpm install` fails on `@sinkplane/shared` auth, check `~/.npmrc` contains `//npm.pkg.github.com/:_authToken=…`.
