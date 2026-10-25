# Sinkplane Mobile

Phone/tablet companion to [sinkplane-tv](https://github.com/Sinkplane/sinkplane-tv) — a fan-made app for [floatplane.com](https://www.floatplane.com).

Built on Expo (SDK 58, new architecture) with Expo Router. Auth, Floatplane API client, theming, and data hooks live in [`@sinkplane/shared`](https://github.com/Sinkplane/sinkplane-shared).

## Getting started

```bash
npm install
npm start
```

Sign-in uses Floatplane's OIDC device flow: the app shows a device code and opens `floatplane.com/link` in the system browser; once approved, tokens are stored in `expo-secure-store` and refreshed automatically.

> `expo-secure-store` is a native module, so running on a device/simulator requires a development build (`npx expo run:ios|android` or `eas build --profile development`). Expo Go will not work.

> `@sinkplane/shared` installs from GitHub Packages — your `~/.npmrc` needs `//npm.pkg.github.com/:_authToken=<PAT with read:packages>`.

## Quality gates

```bash
npm run lint
npx tsc --noEmit
```
