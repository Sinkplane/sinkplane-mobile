# Google Play Console: Sinkplane (Android phones, tablets, foldables)

Draft listing for Play Console. Anything in `<angle brackets>` needs your input.

**Not ready to upload yet**, regardless of the listing:

1. `android.package` isn't set in `app.json`. Pick it once: it can never change after the first
   upload. For example `com.kingdomworks.sinkplane` (match the iOS bundle ID family).
2. The release build crashes at launch with R8 on (`WorkDatabase_Impl.<init>` stripped from
   WorkManager, which `expo-background-task` uses). It needs a keep rule or minify off before an EAS
   production build.
3. Play Console account: an **organization** account (for the LLC) needs a D-U-N-S number. A
   **personal** account created after Nov 2023 must run a closed test with 12+ testers for 14 days
   before it can publish to production.

## Main store listing

| Field                  | Value                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| App name (30)          | `Sinkplane`                                                                               |
| Short description (80) | `Fan-made player for the video creators you subscribe to.` (56)                           |
| App category           | Video Players & Editors                                                                   |
| Tags                   | Video player, Streaming                                                                   |
| Contact email          | `<email>` (shown publicly)                                                                |
| Website                | `https://github.com/Sinkplane/sinkplane-mobile`                                           |
| Privacy policy         | `https://github.com/Sinkplane/sinkplane-mobile/blob/main/store/listing/privacy-policy.md` |

Google's metadata policy bans other companies' trademarks in the title and short description, so
"Floatplane" appears only in the full description, with the not-affiliated line.

### Full description (4000)

```
Sinkplane is a fan-made app for watching the creators you subscribe to on Floatplane.

Sign in with your Floatplane account and everything you already have access to is there: new videos from every creator you follow, your watch history, and live streams.

WATCH YOUR WAY
• A player built for touch: double-tap to skip 15 seconds, press and hold to watch at 2×, and choose any playback speed
• Resume right where you stopped, on any device
• Keep watching in picture-in-picture
• Shrink a video into a mini player while you browse
• Download videos to watch offline
• Play and pause with the space bar on a keyboard

NEVER MISS A VIDEO
• One feed with the newest posts from all of your subscriptions
• Get notified when a creator you follow posts something new
• The Live tab shows who is streaming right now

MADE FOR EVERY SCREEN
• Phones, tablets and foldables, in portrait and landscape
• Grid layouts on tablets, and a split player in tabletop mode on foldables
• Light and dark themes

Requires an active Floatplane subscription. Sinkplane is an independent, open-source project. It is not affiliated with, endorsed by or sponsored by Floatplane Media Inc. or any creator on Floatplane. All videos and channel content belong to their creators.
```

### Graphics

| Asset                  | Size / rules                 | File                                          |
| ---------------------- | ---------------------------- | --------------------------------------------- |
| App icon               | 512 × 512 PNG, 32-bit        | `store/screenshots/play/icon-512.png`         |
| Feature graphic        | 1024 × 500 PNG/JPG, required | `store/screenshots/play/feature-graphic.png`  |
| Phone screenshots      | 2–8, 9:16, 1080 × 1920       | `store/screenshots/play/phone/*.png`          |
| 7" tablet screenshots  | up to 8, 1200 × 1920         | `store/screenshots/play/tablet/*.png` (reuse) |
| 10" tablet screenshots | up to 8, 1600 × 2560         | `store/screenshots/play/tablet/*.png`         |

## Data safety

Play counts data as "collected" when the app sends it off the device, **including to a service the
user signs in to**. So unlike Apple's label, declare what goes to Floatplane:

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS only).
- **Do you provide a way for users to request that their data is deleted?** Data lives in the user's
  Floatplane account. Answer with Floatplane's account deletion: `<Floatplane's account deletion URL>`.
  The app deletes everything it stores on the device when you sign out.

| Data type                                                                   | Collected | Shared | Why                             | Optional? |
| --------------------------------------------------------------------------- | --------- | ------ | ------------------------------- | --------- |
| Personal info › Email address / User IDs                                    | Yes       | No     | Account management (signing in) | Required  |
| App activity › Other actions (watch progress, likes, notification settings) | Yes       | No     | App functionality               | Required  |

Not collected: location, contacts, photos (downloads are saved to the library, never read), files,
messages, health, financial info, device IDs, crash logs, diagnostics. No ads, no analytics.

"Shared" means transferred to a third party other than the service the user deliberately uses, so
**No** for both.

## Content rating (IARC questionnaire)

- Category: **All other app types** (not a game).
- Violence, sexuality, language, controlled substances, gambling: **No**.
- "Does the app allow users to interact or exchange content?" **Yes**: users can read and like
  comments from other Floatplane users (shared on Floatplane, moderated there).
- "Does the app share the user's location?" **No**. Digital purchases: **No**.

Expect **Teen** (IARC 12+) because of the user-generated comments.

## App access (for Google's reviewers)

"All or some functionality is restricted": give a Floatplane account with an active subscription and
no 2FA: `<username>` / `<password>`, and the same notes as App Review in `app-store.md`. Never put
these credentials in this repo.

## Permissions to justify

- `POST_NOTIFICATIONS`: new-post notifications (asked on first sign-in).
- Foreground service / `WAKE_LOCK` (expo-video background playback): keeps a video playing in
  picture-in-picture.
- `READ_MEDIA_VIDEO` (expo-media-library): saving downloaded videos to the gallery.
