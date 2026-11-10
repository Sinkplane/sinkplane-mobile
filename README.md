# Sinkplane Mobile

A fan-made [Floatplane](https://www.floatplane.com) app for iOS and Android phones, tablets, and foldables. The mobile companion to [Sinkplane TV](https://github.com/Sinkplane/sinkplane-tv).

Browse your subscriptions, watch videos and livestreams, and pick up where you left off with progress saved to your Floatplane account.

Sinkplane is an independent project and is not affiliated with or endorsed by Floatplane. A Floatplane account with an active creator subscription is required to watch subscribed content.

## Project status

The core app is implemented for iOS and Android. For now, follow the [development setup](#development-setup) to build and run it from source.

What works today:

- **Sign-in** — use your Floatplane username or email and password, with Cloudflare Turnstile and support for two-factor authentication and backup codes. Session tokens are stored securely on the device.
- **Browsing** — a feed across all your subscriptions, creator and channel filters, title search, and newest/oldest sorting. Image and text posts are supported too.
- **Video playback** — custom touch controls, seeking, saved playback speeds, fullscreen, and watch progress synced to Floatplane.
- **Mini player** — minimize a video or livestream into a floating tile, drag it to a corner, and reopen it to continue watching.
- **Picture-in-picture and background audio** — keep watching or listening when you leave the app, on supported devices.
- **Livestreams** — see which subscribed creators are live and open their streams from the Live tab.
- **Watch history** — revisit recently watched posts with their saved progress.
- **Reactions and comments** — like or dislike a post and read its comments.
- **Notifications** — new-post alerts while the app is open, periodic background checks, and per-creator push/email preferences shared with Floatplane.
- **Themes** — follow the system appearance or choose light or dark mode.
- **Tablets** — multi-column browsing and a landscape player layout with details and comments beside the video.
- **Foldables** — a tabletop player layout with video above the hinge and controls below it. Fold detection and geometry depend on the device; hardware testing is still needed.

Background notification checks are scheduled by the operating system, typically at intervals of 15 minutes or longer. They are not guaranteed to arrive immediately. On iOS, background checks require a physical device.

## Using the app

1. Sign in with your Floatplane account and complete the captcha when prompted. If your account uses two-factor authentication, enter your authenticator code or a backup code.
2. Browse **Videos**, choose a creator or channel, or search your subscriptions.
3. Open a post to watch, view its details, react, or read comments. Use **History** to return to recently watched posts and **Live** to find livestreams.
4. Open **Settings** to change the theme, manage notifications, view subscriptions, or sign out.

### Player controls

- Tap the video to show or hide the controls.
- Double-tap the left or right half to skip backward or forward by 15 seconds.
- Press and hold while playing for a temporary 2× speed boost.
- Use the speed menu to choose a playback speed; your choice is remembered between videos.
- Use the fullscreen button, or rotate a phone to enter fullscreen. Tablet layouts adapt to rotation without automatically entering fullscreen.
- Tap the down arrow to minimize playback into the floating mini player. Tap the tile to reopen it, or its close button to stop playback.

Livestreams have play/pause and fullscreen controls; seeking and speed changes apply to on-demand videos.

## How can I help?

- [Report a bug or request a feature](https://github.com/Sinkplane/sinkplane-mobile/issues). Include your device, OS version, what happened, and steps to reproduce it. Please remove credentials and session tokens from logs.
- Test on iOS, Android, tablets, or foldables and share layout and playback issues.
- Open a pull request with a focused change and relevant validation. See [development setup](#development-setup) and [testing](#testing) below.
- [Buy Me a Coffee](https://buymeacoffee.com/paynoattn) to support development.

Looking for the television app? Visit [Sinkplane TV](https://github.com/Sinkplane/sinkplane-tv).

## Developer information

Built with [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), React Native's new architecture, and TypeScript. This repository uses **pnpm** (version pinned in `package.json` `packageManager`) and commits `pnpm-lock.yaml`.

- **Navigation:** Expo Router with native tabs.
- **Data:** TanStack Query and the shared Floatplane API client.
- **Playback:** `expo-video`, with custom controls, picture-in-picture, and background playback.
- **Authentication and storage:** shared password/2FA login and `expo-secure-store`.
- **Notifications:** local notifications, a foreground sync socket, and OS-scheduled background checks.
- **Fold posture:** a local Expo module using Android Jetpack WindowManager and iOS hinge APIs where available.

Shared authentication, API hooks, types, and theming live in [`@sinkplane/shared`](https://github.com/Sinkplane/sinkplane-shared). Mobile code imports its safe exports through [`src/shared.ts`](src/shared.ts); importing the package's root barrel pulls in TV-only native modules.

## Development setup

### Prerequisites

- Node.js 26 (see [`.nvmrc`](.nvmrc)) and pnpm 12 (`corepack enable`, or install pnpm yourself).
- GNU Make (preinstalled on macOS and Linux) for the quality gates.
- Xcode and the iOS Simulator for local iOS builds on macOS, or Android Studio and an emulator/device for Android builds.
- Access to `@sinkplane/shared` on GitHub Packages.
- A Floatplane account and creator subscription for testing authenticated content.

**Package access:** `@sinkplane/shared` is currently a private GitHub Package. Making this repository public does not grant access to that package. You need a GitHub account authorized to read it and a personal access token with `read:packages`. If you cannot install it, [open an issue](https://github.com/Sinkplane/sinkplane-mobile/issues) about contributor access.

### Install and run

Clone the repository and open its directory:

```bash
git clone https://github.com/Sinkplane/sinkplane-mobile.git
cd sinkplane-mobile
```

Configure GitHub Packages authentication in your user-level `~/.npmrc`, using your own token:

```ini
//npm.pkg.github.com/:_authToken=<YOUR_GITHUB_PACKAGES_TOKEN>
```

The repository's `.npmrc` already configures the `@sinkplane` registry, and [`pnpm-workspace.yaml`](pnpm-workspace.yaml) handles peer dependencies and the `expo-video` patch. Keep your token out of the repository.

```bash
make setup   # pnpm install --frozen-lockfile, and enables the git hooks in .githooks

# Build and run on one platform:
pnpm ios
# or:
pnpm android
```

**A native development build is required; Expo Go is not supported.** The app includes native storage, playback, notification, and fold-posture modules. Rebuild after changing native dependencies, config plugins, or local native modules.

After installing a development build, start Metro for subsequent JavaScript/TypeScript work:

```bash
pnpm start
```

The repository also includes EAS development, preview, and production build profiles in [`eas.json`](eas.json). Cloud builds need GitHub Packages authentication configured in the build environment.

### Developing the shared package

If you have the shared repository checked out at `../shared` with its `dist/` built:

```bash
pnpm link:shared
```

This links the installed package's `dist/` to the sibling build output, which Metro watches. Re-run the link command after reinstalling dependencies. To return to the published package:

```bash
pnpm unlink:shared
```

### Project layout

- [`src/app/`](src/app/) — routed screens and layouts.
- [`src/components/`](src/components/) — player, mini player, lists, post details, and settings UI.
- [`src/hooks/`](src/hooks/) — data, player, notification, and responsive-layout hooks.
- [`src/notifications/`](src/notifications/) — foreground sync and background notification delivery.
- [`modules/fold-posture/`](modules/fold-posture/) — native fold detection.
- [`__tests__/e2e/`](__tests__/e2e/) — app integration tests and stateful API/socket fakes.
- [`jest/`](jest/) — shared test fixtures and native-module mocks.
- [`qa/procedures/`](qa/procedures/) — manual device QA procedures.

## Testing

Every quality rule is a gate, run through `make` (`make help` lists the targets). Run the full gate before opening a pull request; the pre-push hook runs it as well:

```bash
make check
```

| Target            | What it runs                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make fmt`        | `prettier --write .`                                                                                                                                                                          |
| `make fmt-check`  | `prettier --check .`                                                                                                                                                                          |
| `make lint`       | `eslint . --max-warnings=0`, then `knip` (unused files, exports, and dependencies)                                                                                                            |
| `make typecheck`  | `tsc` in strictest mode, for the app and for `scripts/`                                                                                                                                       |
| `make test`       | the unit suite (colocated `src/**/*.test.ts(x)`)                                                                                                                                              |
| `make acceptance` | the E2E suite (`__tests__/e2e`)                                                                                                                                                               |
| `make coverage`   | both suites with coverage thresholds; writes `coverage/{unit,e2e}/coverage-final.json`                                                                                                        |
| `make crap`       | `scripts/crap.mts`: fails if any function's CRAP score (complexity² × uncovered³ + complexity, coverage merged from both suites) exceeds `CRAP_MAX` (default 6)                               |
| `make arch`       | dependency-cruiser layer and import rules (`.dependency-cruiser.cjs`)                                                                                                                         |
| `make build`      | `expo export` for iOS and Android, which catches Metro resolution errors that `tsc` cannot see                                                                                                |
| `make mutate`     | Stryker mutation testing against the unit suite; `make mutate SCOPE=changed [BASE=origin/main]` mutates only the `src` files changed against `BASE`. The break threshold ratchets up from 69% |
| `make qa`         | `build`, then lists the manual device procedures in `qa/procedures/`                                                                                                                          |
| `make check`      | `fmt-check lint typecheck arch coverage crap build`                                                                                                                                           |
| `make gauntlet`   | `check mutate qa`                                                                                                                                                                             |

While iterating, `pnpm test:unit:watch` reruns the affected unit tests.

The gate configuration files are listed in [`.gates-protected`](.gates-protected). AI agents must ask a human before editing them; the Claude Code and Cursor hooks in `scripts/agent-hooks/` enforce this. Those hooks also prevent an agent from finishing while `make check` fails.

The suite named `e2e` boots the real Expo Router app in Jest against an in-memory Floatplane API and sync socket. Native modules are mocked, so no simulator or live account is required for these tests. Device testing is still needed for actual playback, captcha rendering, picture-in-picture, background execution, and hinge detection.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs four jobs on every pull request to `main`, and all four must pass before merging: **format, lint, typecheck, arch**; **tests, coverage, crap**; **bundle (iOS + Android)**; and **mutation (changed files)**. Coverage and mutation reports are uploaded as artifacts.

## License

[MIT](LICENSE). Floatplane and creator names, logos, and content belong to their respective owners.
