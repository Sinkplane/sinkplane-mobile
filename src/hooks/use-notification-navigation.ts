import { useEffect } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import * as Notifications from 'expo-notifications';

/** The post a tapped notification points at (set by local-notifications.presentNotification). */
function postIdOf(response: Notifications.NotificationResponse): string | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return null;
  }
  const postId = response.notification.request.content.data?.['postId'];
  return typeof postId === 'string' && postId !== '' ? postId : null;
}

/**
 * Open the video page when the user taps a notification — including the tap that launched the app.
 *
 * Mounted in the signed-in tab layout (the video route only exists while signed in), and it waits
 * for the root navigator to be ready: a push made before that is silently dropped, which is what
 * happens to the launch tap on a cold start otherwise.
 */
export function useNotificationNavigation(): void {
  // Typed as always present, but undefined until the root navigator mounts.
  const rootState = useRootNavigationState() as
    ReturnType<typeof useRootNavigationState> | undefined;
  const navigationReady = (rootState?.key ?? '') !== '';

  useEffect(() => {
    if (!navigationReady) {
      return undefined;
    }

    const open = (response: Notifications.NotificationResponse) => {
      Notifications.clearLastNotificationResponse();
      const postId = postIdOf(response);
      if (postId !== null) {
        router.push({ pathname: '/video/[id]', params: { id: postId } });
      }
    };

    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) {
      open(launchResponse);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      subscription.remove();
    };
  }, [navigationReady]);
}
