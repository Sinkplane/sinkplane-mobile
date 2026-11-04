import { authenticatedFetch } from '@/shared';

/**
 * Floatplane's per-creator notification settings (floatplane.com → Settings → Notifications).
 *
 *   GET  /api/v3/user/notification/list    → [{ creator: {…}, userNotificationSetting: {…} }]
 *   POST /api/v3/user/notification/update  ← { creator, property, newValue }
 *
 * `contentFirebase` is the "push notifications for new content" switch Floatplane's own apps
 * honour; this app honours it the same way (it gates both the live and background notifications).
 */

export type NotificationProperty = 'contentFirebase' | 'contentEmail';

export interface CreatorNotificationSettings {
  creatorId: string;
  title: string;
  iconUrl: string | null;
  contentFirebase: boolean;
  contentEmail: boolean;
}

interface NotificationListEntry {
  creator?: { id?: string; title?: string; icon?: { path?: string; childImages?: { path?: string; width?: number }[] } | null };
  userNotificationSetting?: { creator?: string; contentFirebase?: boolean; contentEmail?: boolean };
}

export const NOTIFICATION_LIST_PATH = '/api/v3/user/notification/list';
export const NOTIFICATION_UPDATE_PATH = '/api/v3/user/notification/update';

async function ensureOk(response: Response, what: string): Promise<Response> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Failed to ${what}: ${response.status} - ${errorText}`);
  }
  return response;
}

/** Smallest icon variant ≥ 100px (the list shows a small avatar), else the original. */
function iconUrl(icon: NonNullable<NotificationListEntry['creator']>['icon']): string | null {
  const child = icon?.childImages?.find(image => (image.width ?? 0) >= 100 && image.path);
  return child?.path ?? icon?.path ?? null;
}

export async function fetchNotificationSettings(token: string): Promise<CreatorNotificationSettings[]> {
  const response = await ensureOk(await authenticatedFetch(NOTIFICATION_LIST_PATH, token), 'load notification settings');
  const entries = (await response.json()) as NotificationListEntry[];
  return (Array.isArray(entries) ? entries : []).flatMap(entry => {
    const creatorId = entry.creator?.id ?? entry.userNotificationSetting?.creator;
    if (!creatorId) return [];
    const settings = entry.userNotificationSetting ?? {};
    return [
      {
        creatorId,
        title: entry.creator?.title ?? 'Creator',
        iconUrl: iconUrl(entry.creator?.icon),
        // Floatplane defaults new subscriptions to push on, email off.
        contentFirebase: settings.contentFirebase ?? true,
        contentEmail: settings.contentEmail ?? false,
      },
    ];
  });
}

export async function updateNotificationSetting(
  token: string,
  creatorId: string,
  property: NotificationProperty,
  newValue: boolean,
): Promise<void> {
  await ensureOk(
    await authenticatedFetch(NOTIFICATION_UPDATE_PATH, token, {
      method: 'POST',
      body: JSON.stringify({ creator: creatorId, property, newValue }),
    }),
    'update notification settings',
  );
}
