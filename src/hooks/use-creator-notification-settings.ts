import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchNotificationSettings,
  updateNotificationSetting,
  type CreatorNotificationSettings,
  type NotificationProperty,
} from '@/notifications/notification-settings-api';

export const creatorNotificationSettingsKey = (token: string | null | undefined) => ['notifications', 'creators', token] as const;

interface UpdateVariables {
  creatorId: string;
  property: NotificationProperty;
  value: boolean;
}

/**
 * Floatplane's per-creator notification switches (shared with floatplane.com). Updates apply
 * optimistically and roll back when the server refuses them.
 */
export function useCreatorNotificationSettings(token: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = creatorNotificationSettingsKey(token);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchNotificationSettings(token as string),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationKey: queryKey,
    mutationFn: ({ creatorId, property, value }: UpdateVariables) => updateNotificationSetting(token as string, creatorId, property, value),
    onMutate: async ({ creatorId, property, value }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CreatorNotificationSettings[]>(queryKey);
      queryClient.setQueryData<CreatorNotificationSettings[]>(queryKey, list =>
        list?.map(entry => (entry.creatorId === creatorId ? { ...entry, [property]: value } : entry)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(queryKey, context?.previous),
    // Re-sync with what Floatplane stored (only once the last of several quick toggles settles).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: queryKey }) <= 1) void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    ...query,
    settings: query.data,
    updateError: mutation.error,
    update: (creatorId: string, property: NotificationProperty, value: boolean) => {
      if (token) mutation.mutate({ creatorId, property, value });
    },
  };
}
