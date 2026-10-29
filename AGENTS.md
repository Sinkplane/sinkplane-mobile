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
  - `(tabs)/settings.tsx` — Profile, theme switcher (System / Light / Dark via shared `useTheme`), subscriptions, sign out.
- **`src/shared.ts`** — The ONLY place that imports `@sinkplane/shared` subpaths. See below.
- **`assets/`** — Icons, splash images.
- **`scripts/`** — `link-shared-dist.sh` (local shared-package override).
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

- **Unit tests** render one component/hook in isolation. Shared helpers live in `jest/` (alias `@test/*`): `fixtures.ts` (user, creators, channels, videos, pinned `FIXED_NOW`) and `mocks/expo-secure-store.ts` (in-memory store, mapped for every suite).
- **E2E tests** boot the real Expo Router app (`src/app`) with `expo-router/testing-library` against a stateful in-memory Floatplane API that replaces `fetch` (`__tests__/e2e/helpers/mock-floatplane-api.ts`: password login + Turnstile token check, 2FA, sessions, content, progress; supports failure injection, `NETWORK_ERROR`, and latency). Only native-only modules are mocked (`helpers/native-mocks.ts`: the Turnstile WebView, splash screen); native tabs render as their real host components.
- Each E2E test starts with `const rt = loadRuntime()` (fresh module registry + reset API/storage), then `rt.seedSession()` / `rt.renderApp(url)`. Under fake timers use `rt.until(...)` instead of `waitFor`. Other helpers: `rt.turnstile.solve()`, `rt.selectTab()` / `rt.inTab()` / `rt.selectedTab()` (non-focused tabs stay mounted, so scope queries), `rt.listItemIds()` / `rt.reachListEnd()` (FlatList virtualizes), `rt.pressWithoutWaiting()` (assert in-flight UI).
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
