# App Store Connect: Sinkplane (iOS / iPadOS)

Copy for App Store Connect. Character limits are Apple's; counts are given where it's close.
Anything in `<angle brackets>` needs your input.

The name, subtitle, promotional text, description, keywords, URLs, categories and copyright are also
in `store/store.config.json` (EAS Metadata). After changing them here, update that file too, then
push them with `eas metadata:push` (it signs in to your Apple account). Its `version` must match `version` in
`app.json`: EAS renames the App Store version to it, and builds only attach to a matching version. EAS Metadata doesn't upload
screenshots, the age rating's newer questions or App Review contact details: set those in App Store
Connect.

## App information

| Field              | Value                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name (30)          | `Sinkplane`                                                                                                                                                                        |
| Subtitle (30)      | `Watch your creator subs` (23)                                                                                                                                                     |
| Bundle ID          | `com.kingdomworks.sinkplane-mobile`                                                                                                                                                |
| Primary category   | Entertainment                                                                                                                                                                      |
| Secondary category | Photo & Video                                                                                                                                                                      |
| Content rights     | "Does your app contain, show, or access third-party content?" **Yes**, and you have the rights to use it: it only shows content the signed-in user already pays for on Floatplane. |
| Age rating         | See [Age rating](#age-rating)                                                                                                                                                      |
| Copyright          | `2026 Kingdomworks LLC`                                                                                                                                                            |
| Support URL        | `https://github.com/Sinkplane/sinkplane-mobile/issues`                                                                                                                             |
| Marketing URL      | `https://github.com/Sinkplane/sinkplane-mobile`                                                                                                                                    |
| Privacy Policy URL | `https://github.com/Sinkplane/sinkplane-mobile/blob/main/store/listing/privacy-policy.md` (live once this branch is merged)                                                        |

**Trademark caution (guideline 5.2.1).** "Floatplane" is someone else's trademark. Keep it out of the
name, subtitle and keywords. The description can say the app works with Floatplane, together with the
not-affiliated line below. Apple may still ask for proof of permission. A message from Floatplane
saying they're fine with it is the strongest answer to a 5.2 rejection.

## Promotional text (170)

```
Your Floatplane subscriptions on iPhone and iPad: pick up where you left off, catch creators live, and keep watching in picture-in-picture.
```

(141)

## Description (4000)

```
Sinkplane is a fan-made app for watching the creators you subscribe to on Floatplane.

Sign in with your Floatplane account and everything you already have access to is there: new videos from every creator you follow, your watch history, and live streams.

WATCH YOUR WAY
• A player built for touch: double-tap to skip 15 seconds, press and hold to watch at 2×, and choose any playback speed
• Resume right where you stopped, on any device
• Keep watching in picture-in-picture or with the screen off
• Shrink a video into a mini player while you browse
• Download videos to watch offline

NEVER MISS A VIDEO
• One feed with the newest posts from all of your subscriptions
• Get notified when a creator you follow posts something new
• The Live tab shows who is streaming right now

MADE FOR EVERY SCREEN
• Works in portrait and landscape on iPhone
• Grid layouts and a roomy player on iPad
• Light and dark themes

Requires an active Floatplane subscription. Sinkplane is an independent, open-source project. It is not affiliated with, endorsed by or sponsored by Floatplane Media Inc. or any creator on Floatplane. All videos and channel content belong to their creators.

Sinkplane doesn't collect any data. Your sign-in goes straight to Floatplane, and your session stays on your device.
```

## Keywords (100)

```
creator,subscription,video,player,live,stream,watch,offline,download,pip,tech,podcast
```

(85) No trademarks (see the caution above).

## What's new (first version)

```
First release.
```

## Screenshots

From `store/screenshots/` (see `store/README.md`):

- **iPhone with Dynamic Island (medium display)**: `app-store/iphone-medium/*.png`, 1206 × 2622.
  App Store Connect rejects the 6.9" set (`app-store/iphone/`, 1320 × 2868) in this slot.
- **iPhone Duo**: `app-store/duo/*.png`, 2853 × 2007 (unfolded, landscape).
- **iPad 13"**: `app-store/ipad/*.png`, 2048 × 2732 (scaled for smaller iPads).

**Product Page Information** (artwork App Store Connect crops for each device and orientation, so
the plane sits in the middle). Each tab takes one asset; either size works, the 16:9 one keeps more
of the picture on iPhone:

- **Header**: `app-store/header/header-5244x2950.png` (or `header-3840x1646.png`).
- **Search Results**: `app-store/search/search-5244x2950.png` (or `search-3840x1646.png`): the same
  scene with the name and tagline. Check the sizes that tab lists; ask to re-render if they differ.

## App Privacy ("nutrition label")

Answer **"No, we do not collect data from this app."**

Why that's accurate: the developer runs no server, analytics, crash reporting or ads. The app talks
only to Floatplane, under Floatplane's own privacy policy, using the account the user signs in with.
The session token, watch position and downloads stay on the device. Apple defines "collect" as
transmitting data off the device in a way that you or your third-party partners can access. Floatplane
is the service the user signs in to, not your partner.

If you later add crash reporting (Sentry, Crashlytics, ...), this answer changes.

## Age rating

Questionnaire answers, given what the app can show:

- Violence, sexual content, profanity, horror, drugs, gambling, contests: **None**. Floatplane
  creators are mostly tech, gaming and hobby channels. If a creator you know of posts mature content,
  answer **Infrequent/Mild** for that category.
- User-generated content: **Yes**. Comments from other Floatplane users are shown under videos.
  There's no reporting or blocking in the app. Floatplane moderates comments on its side.
- Unrestricted web access: **No**. Chat, messaging: **No**.

Expect **13+**.

## Export compliance

`app.json` sets `ITSAppUsesNonExemptEncryption = false`: the app only uses HTTPS from the OS, which
is exempt. App Store Connect won't ask on each build.

## App Review information

- **Sign-in required: Yes.** Demo account: `<Floatplane username>` / `<password>`. It needs an
  **active subscription** to at least one creator, or the app has nothing to show. Use an account
  without two-factor authentication. Never put these credentials in this repo (it's public).
- **Contact**: `<first name, last name, phone, email>`
- **Notes** (paste):

```
Sinkplane is an independent, open-source client for Floatplane (floatplane.com), a subscription video platform. It is not made by Floatplane. Users sign in with their own Floatplane account and only see content they already pay for.

Signing in: enter the demo account's username and password. Floatplane's sign-in shows a Cloudflare "verify you are human" check on the sign-in screen. It usually passes on its own after a second; if it shows a checkbox, tap it.

Things to try:
- Videos tab: newest posts from the account's subscriptions. Tap one to play it.
- In the player: double-tap the left or right side to skip 15 seconds, press and hold for 2× speed, use the speed button for other speeds. Tap the down arrow to keep the video playing in a mini player.
- History tab: previously watched videos with progress.
- Live tab: creators' live streams (they may be offline during review).
- Settings: theme, notifications for new posts, downloads.

Background modes: "Audio, AirPlay, and Picture in Picture" keeps a video playing in picture-in-picture or with the screen locked. Background fetch (BGTaskScheduler) checks for new posts from subscribed creators about every 15 minutes and posts a local notification. The app has no push server.

The app collects no data. Requests go only to Floatplane.
```

## TestFlight

- **Beta App Description** (external testing):

```
Sinkplane is a fan-made app for watching your Floatplane subscriptions on iPhone and iPad. Sign in with your Floatplane account to see new videos, your watch history and live streams.
```

- **Feedback email**: `<email>`
- **What to Test** (per build): see `testflight.md`.
- **Internal testers** (your App Store Connect team, up to 100) need none of the above and no review.
  External testers need Beta App Review, which uses the review information above.
