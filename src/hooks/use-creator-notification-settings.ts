import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { isNonEmpty } from '@/hooks/is-non-empty';
import {
  fetchNotificationSettings,
  updateNotificationSetting,
  type CreatorNotificationSettings,
  type NotificationProperty,
  type NotificationSettingChange,
} from '@/notifications/notification-settings-api';

export const creatorNotificationSettingsKey = (token: string | null | undefined) =>
  ['notifications', 'creators', token] as const;

type SettingsKey = ReturnType<typeof creatorNotificationSettingsKey>;

interface UpdateVariables extends NotificationSettingChange {
  token: string;
}

interface UpdateContext {
  previous: CreatorNotificationSettings[] | undefined;
}

export type CreatorNotificationSettingsResult = UseQueryResult<CreatorNotificationSettings[]> & {
  settings: CreatorNotificationSettings[] | undefined;
  updateError: Error | null;
  update: (creatorId: string, property: NotificationProperty, value: boolean) => void;
};

/** Optimistically apply one switch to the cached list; returns what to roll back to. */
async function applyOptimistically(
  queryClient: QueryClient,
  queryKey: SettingsKey,
  { creatorId, property, value }: UpdateVariables,
): Promise<UpdateContext> {
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<CreatorNotificationSettings[]>(queryKey);
  queryClient.setQueryData<CreatorNotificationSettings[]>(queryKey, (list) =>
    list?.map((entry) => (entry.creatorId === creatorId ? { ...entry, [property]: value } : entry)),
  );
  return { previous };
}

function useUpdateSetting(queryKey: SettingsKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKey,
    mutationFn: ({ token, ...change }: UpdateVariables) => updateNotificationSetting(token, change),
    onMutate: (variables) => applyOptimistically(queryClient, queryKey, variables),
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
    },
    // Re-sync with what Floatplane stored (only once the last of several quick toggles settles).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: queryKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

/**
 * Floatplane's per-creator notification switches (shared with floatplane.com). Updates apply
 * optimistically and roll back when the server refuses them.
 */
export function useCreatorNotificationSettings(
  token: string | null | undefined,
): CreatorNotificationSettingsResult {
  const queryKey = creatorNotificationSettingsKey(token);

  const query = useQuery({
    queryKey,
    queryFn: isNonEmpty(token) ? () => fetchNotificationSettings(token) : skipToken,
  });

  const mutation = useUpdateSetting(queryKey);

  return {
    ...query,
    settings: query.data,
    updateError: mutation.error,
    update: (creatorId, property, value) => {
      if (isNonEmpty(token)) {
        mutation.mutate({ token, creatorId, property, value });
      }
    },
  };
}
