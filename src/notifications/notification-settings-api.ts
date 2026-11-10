import { authenticatedFetch } from '@/shared';

import {
  arrayField,
  booleanField,
  isJsonObject,
  numberField,
  objectField,
  stringField,
  type JsonObject,
} from './json-fields';

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

/** One creator's change: `{ creator, property, newValue }` on the wire. */
export interface NotificationSettingChange {
  creatorId: string;
  property: NotificationProperty;
  value: boolean;
}

/** The list shows a small avatar: the smallest icon variant at least this wide is used. */
const MIN_ICON_WIDTH = 100;

export const NOTIFICATION_LIST_PATH = '/api/v3/user/notification/list';
export const NOTIFICATION_UPDATE_PATH = '/api/v3/user/notification/update';

async function ensureOk(response: Response, what: string): Promise<Response> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Failed to ${what}: ${response.status.toString()} - ${errorText}`);
  }
  return response;
}

const isUsableIcon = (image: JsonObject): boolean =>
  (numberField(image, 'width') ?? 0) >= MIN_ICON_WIDTH && Boolean(stringField(image, 'path'));

/** Smallest icon variant ≥ 100px (the list shows a small avatar), else the original. */
function iconUrl(icon: JsonObject): string | null {
  const child = arrayField(icon, 'childImages').filter(isJsonObject).find(isUsableIcon);
  return stringField(child ?? {}, 'path') ?? stringField(icon, 'path') ?? null;
}

/** `creator.id`, else the setting's `creator`; null when neither names a creator. */
function creatorIdOf(creator: JsonObject, setting: JsonObject): string | null {
  const creatorId = stringField(creator, 'id') ?? stringField(setting, 'creator');
  return creatorId === undefined || creatorId === '' ? null : creatorId;
}

/** Floatplane defaults new subscriptions to push on, email off. */
function preferencesOf(
  setting: JsonObject,
): Pick<CreatorNotificationSettings, NotificationProperty> {
  return {
    contentFirebase: booleanField(setting, 'contentFirebase') ?? true,
    contentEmail: booleanField(setting, 'contentEmail') ?? false,
  };
}

/** `{ creator: {…}, userNotificationSetting: {…} }` → settings (none without a creator id). */
function settingsOf(entry: JsonObject): CreatorNotificationSettings[] {
  const creator = objectField(entry, 'creator');
  const setting = objectField(entry, 'userNotificationSetting');
  const creatorId = creatorIdOf(creator, setting);
  if (creatorId === null) {
    return [];
  }
  return [
    {
      creatorId,
      title: stringField(creator, 'title') ?? 'Creator',
      iconUrl: iconUrl(objectField(creator, 'icon')),
      ...preferencesOf(setting),
    },
  ];
}

export async function fetchNotificationSettings(
  token: string,
): Promise<CreatorNotificationSettings[]> {
  const response = await ensureOk(
    await authenticatedFetch(NOTIFICATION_LIST_PATH, token),
    'load notification settings',
  );
  const entries: unknown = await response.json();
  return Array.isArray(entries) ? entries.filter(isJsonObject).flatMap(settingsOf) : [];
}

export async function updateNotificationSetting(
  token: string,
  { creatorId, property, value }: NotificationSettingChange,
): Promise<void> {
  await ensureOk(
    await authenticatedFetch(NOTIFICATION_UPDATE_PATH, token, {
      method: 'POST',
      body: JSON.stringify({ creator: creatorId, property, newValue: value }),
    }),
    'update notification settings',
  );
}
