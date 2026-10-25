# AGENTS.md

Guidance for AI coding agents (opencode, Claude Code, Cursor, etc.) working in this repository.

## Project Overview

Sinkplane Mobile is the phone/tablet companion to **sinkplane-tv**, a fan-made app for [floatplane.com](https://www.floatplane.com). Built on Expo (SDK 58, new architecture) with Expo Router for file-based navigation. Package manager is **npm** (`package-lock.json`; no bun/pnpm here).

Authentication uses Floatplane's official **OIDC device flow** against `auth.floatplane.com` (client ID `hydravion`, same as [Hydravion](https://github.com/Inertia-Network/Hydravion)): the sign-in screen requests a device code, opens `floatplane.com/link` in the system browser (or shows the code for another device), polls until the user approves, then stores the tokens in `expo-secure-store` with automatic refresh. All of this lives in `@sinkplane/shared` — this app only wires it up.

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
  - `_layout.tsx` — Root layout: shared `ThemeProvider` → react-query → `SessionProvider` → auth-gated `Stack`.
  - `sign-in.tsx` — OIDC device-flow sign-in screen.
  - `index.tsx` — Home (post-auth placeholder for now).
- **`src/shared.ts`** — The ONLY place that imports `@sinkplane/shared` subpaths. See below.
- **`assets/`** — Icons, splash images.
- **`scripts/`** — `link-shared-dist.sh` (local shared-package override).
- **`metro.config.js`** — watches the sibling `../sinkplane-shared` clone when present (see below).

### Shared Package (`@sinkplane/shared`) — read this before importing

`@sinkplane/shared` is published to GitHub Packages and installed as a regular dependency (`@sinkplane/shared@^0.1.1`; registry/auth in `.npmrc` — locally the token lives in `~/.npmrc`).

> **Never import from the `@sinkplane/shared` barrel.** It re-exports the TV connection server (`useTVServer`), which statically imports `react-native-tcp-socket`, `react-native-zeroconf`, and `@preeternal/react-native-cookie-manager` — native modules this app does not include. Importing the barrel breaks the Metro bundle. Import from `@/shared` (the mobile-safe re-export barrel in `src/shared.ts`) instead; add new mobile-safe exports there as needed. Safe areas: `auth/*`, `storage/*`, `theme/*`, `videos/*`, `constants/*`, `types/*`. Never import `connection/*`.

Other shared-package notes:

- The package is built against Expo SDK 57 / the TV app; this app is on SDK 58. That is why `.npmrc` sets `legacy-peer-deps=true` — npm would otherwise fail ERESOLVE on the `~57` peers and auto-install unwanted native modules. The modules its `dist` actually imports here (react, `@tanstack/react-query`, `expo-secure-store`) are installed as direct dependencies of this app.
- For local development against the sibling clone `../sinkplane-shared`: `npm run link:shared` symlinks `node_modules/@sinkplane/shared/dist` to the clone's `dist/` (Metro watches the clone via `metro.config.js`). Re-run it after every `npm install`. `npm run unlink:shared` restores the published dist. Never run `pnpm install` inside `sinkplane-shared` (its `node_modules` is a symlink into the TV repo).
- To consume shared changes: bump to a published version (`npm i @sinkplane/shared@^x.y.z`) or use the link script above.

### Key Technologies

| Concern | Library |
|---|---|
| Routing | `expo-router` v58 (typed routes) |
| Data fetching | `@tanstack/react-query` |
| Images | `expo-image` |
| Auth/token storage | `expo-secure-store` |
| Browser (login link) | `expo-web-browser` |

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
