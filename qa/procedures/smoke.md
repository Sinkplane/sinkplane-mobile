# Sign in, watch, minimize

Preconditions: a development build is installed and signed out; the Floatplane test account has an active creator subscription.

1. Launch the app → Expect: the sign-in screen with username and password fields over the photo background.
2. Enter the account's credentials, complete the captcha, and tap Sign in (enter the 2FA code if asked) → Expect: the Videos tab lists the creator's newest posts.
3. Tap the first post → Expect: the video page opens and playback starts within a few seconds.
4. Double-tap the right half of the video → Expect: playback jumps forward 15s.
5. Tap the close arrow on the player → Expect: the list returns and a mini player tile keeps playing in the top-right corner.
6. Tap the mini player → Expect: the video page reopens on the same position without restarting.
7. Open the History tab → Expect: the post from step 3 is first, with a progress bar.
8. Open Settings and tap Sign out → Expect: the sign-in screen; the mini player is gone.

Cleanup: none; step 8 returns to the precondition state.
