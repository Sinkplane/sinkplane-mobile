import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColor, type Creator, type Subscription } from '@/shared';

/** A subscription as the session may hold it (the API can omit the plan). */
type ListedSubscription = Pick<Subscription, 'creator'> & {
  readonly plan?: { readonly title: string } | null;
};

/** A creator as the session may hold it (the API can omit the owner). */
type ListedCreator = Pick<Creator, 'id'> & {
  readonly title?: string;
  readonly owner?: { readonly username: string } | null;
};

interface SubscriptionListProps {
  readonly subscriptions: readonly ListedSubscription[] | undefined;
  readonly creators: readonly ListedCreator[] | undefined;
}

function creatorName(creator: ListedCreator | undefined, creatorId: string): string {
  return creator?.title ?? creator?.owner?.username ?? `Creator ${creatorId}`;
}

function SubscriptionCard({
  subscription,
  creator,
}: Readonly<{
  subscription: ListedSubscription;
  creator: ListedCreator | undefined;
}>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <View style={[styles.card, { borderColor: `${mutedColor}22` }]}>
      <Text style={[styles.cardTitle, { color: textColor }]}>
        {creatorName(creator, subscription.creator)}
      </Text>
      <Text style={[styles.body, { color: mutedColor }]}>
        {subscription.plan?.title ?? 'Active'}
      </Text>
    </View>
  );
}

/** One card per subscription: the creator's name and the plan. */
export function SubscriptionList({ subscriptions, creators }: SubscriptionListProps): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  if (subscriptions === undefined || subscriptions.length === 0) {
    return <Text style={[styles.body, { color: mutedColor }]}>No subscriptions found.</Text>;
  }
  return (
    <>
      {subscriptions.map((subscription) => (
        <SubscriptionCard
          key={subscription.creator}
          subscription={subscription}
          creator={creators?.find((creator) => creator.id === subscription.creator)}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  body: {
    fontSize: 15,
  },
});
