# Store assets

Everything for the App Store, TestFlight and Google Play listings.

| Path                        | What                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `listing/app-store.md`      | App Store Connect copy, App Privacy, age rating, review notes                                     |
| `listing/testflight.md`     | TestFlight "What to Test"                                                                         |
| `listing/play-store.md`     | Play Console listing, data safety, content rating, blockers                                       |
| `listing/privacy-policy.md` | Privacy policy (both stores link to it on GitHub)                                                 |
| `store.config.json`         | App Store listing for `eas metadata:push`                                                         |
| `screenshots/`              | Upload-ready images: `app-store/{iphone,ipad}`, `play/{phone,tablet}`, `play/feature-graphic.png` |
| `screenshots/raw/`          | Plain simulator/emulator captures the framed images are made from                                 |
| `frames/`                   | Caption frames (`frames.html`) and their renderer                                                 |
| `demo/`                     | Demo mode: the app with made-up creators, for screenshots                                         |
| `logo/`                     | The app icon ("Nosedive"): `make-icons.py`, its SVG sources, and the five draft concepts          |

| Image set                   | Size (px)                | Store slot                                                            |
| --------------------------- | ------------------------ | --------------------------------------------------------------------- |
| `app-store/iphone-medium/*` | 1206 × 2622              | iPhone with Dynamic Island (medium display), the required iPhone slot |
| `app-store/iphone/*`        | 1320 × 2868              | iPhone 6.9" (if App Store Connect offers that slot)                   |
| `app-store/duo/*`           | 2853 × 2007              | iPhone Duo (unfolded, landscape)                                      |
| `app-store/ipad/*`          | 2048 × 2732              | iPad 13" (Apple scales it down)                                       |
| `app-store/header/*`        | 5244 × 2950, 3840 × 1646 | Product Page Information › Header (one asset)                         |
| `app-store/search/*`        | 5244 × 2950, 3840 × 1646 | Product Page Information › Search Results (with the name)             |
| `play/phone/*`              | 1080 × 1920              | Phone screenshots                                                     |
| `play/tablet/*`             | 1600 × 2560              | 10" tablet (and 7" tablet) screenshots                                |
| `play/feature-graphic.png`  | 1024 × 500               | Feature graphic                                                       |
| `play/icon-512.png`         | 512 × 512                | Play hi-res icon                                                      |

## Why demo mode

Store screenshots of the real app would show real creators' thumbnails, names and channel art.
Apple (guideline 5.2) and Google reject listings that show third-party content without
permission. Demo mode runs the unchanged app against made-up creators ("Bench Notes", "Slow
Kitchen", "Night Signal", "Trail Log") whose artwork is drawn in `demo/art/art.html`.

How it works:

- `SINKPLANE_DEMO=1` makes `metro.config.js` bundle `demo/entry.ts` instead of `index.ts`. Builds
  never set it, so production bundles never contain the demo.
- `demo/install.ts` sends `www.floatplane.com` requests and the sync socket to the E2E suite's
  in-memory Floatplane API (`__tests__/e2e/helpers`). Everything else (images, video) goes to the
  network.
- `jest/demo/catalog.ts` / `world.ts` hold the demo world. `__tests__/e2e/demo-mode.e2e.test.tsx`
  keeps it working.
- Images and two looping HLS streams come from `demo/serve-media.sh` on port 8099 (`localhost`, or
  `10.0.2.2` from the Android emulator).
- Sign in as `alexkim` / `demo` (no captcha). Signing in to demo mode signs the device out of any
  real session stored in that app install.

## Retaking the screenshots

```bash
store/demo/make-media.sh     # artwork + HLS into store/demo/media (gitignored); needs ffmpeg and
                             # Playwright's chrome-headless-shell
store/demo/serve-media.sh    # keep running
```

**iOS** (no Metro needed): build Release for the simulator once
(`xcodebuild -workspace ios/sinkplanemobile.xcworkspace -scheme sinkplanemobile -configuration Release -sdk iphonesimulator build`),
then `store/demo/ios-sim-app.sh <udid>...` installs a copy with the demo bundle, named "Sinkplane".
Use an **iPhone 18 Pro Max** (1320 × 2868; the medium-display set reuses these captures), an
**iPad Pro 12.9"/13"** (2048 × 2732) and the **iPhone Duo**, unfolded (`agent-device fold open`,
then relaunch the app so it takes the large-screen layout; captures are 2853 × 2007), and set a
clean status bar first:
`xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4`.

**Android**: release builds block the plain-HTTP media server, so use a debug build with Metro:

```bash
SINKPLANE_DEMO=1 pnpm start
(cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a)
```

Install `android/app/build/outputs/apk/debug/app-debug.apk`, point it at Metro (`debug_http_host`
= `10.0.2.2:8081`), and grant the notification permission. For tablet portrait shots:
`adb shell wm user-rotation lock 1`. Don't use the System UI demo-mode status bar on the API 37
emulators: it hangs System UI.

Save captures to `screenshots/raw/` with the names `frames/frames.html` lists (`iphone-1-feed`,
`ipad-2-video`, `android-3-history`, `tablet-5-settings`, …), then:

```bash
store/frames/render.sh       # every frame at its store size; frames without a raw capture are skipped
```

Captions live in `SETS` in `frames/frames.html`.

## App icon

The icon is a paper plane diving nose-first through a waterline ("Nosedive"; the other drafts are
in `logo/concepts.html`). `store/logo/make-icons.py` draws every version from one geometry and
writes the SVG sources (`logo/svg/`), the iOS Icon Composer icon (`assets/sinkplane.icon`, with
Liquid Glass layers and a dark appearance), `assets/images/icon.png`, the Android adaptive and
monochrome layers, the splash and favicon images, and `screenshots/play/icon-512.png`. It needs the
same headless Chromium as `make-media.sh`, plus ffmpeg. The feature graphic uses
`logo/svg/full.svg`, so re-run `frames/render.sh` after changing the icon. Icon changes reach a
device only through a new native build.

## Still to do before a release

- Merge to `main`: the App Store privacy policy URL points at `listing/privacy-policy.md` there.
- Play only: see the blockers at the top of `listing/play-store.md`.
