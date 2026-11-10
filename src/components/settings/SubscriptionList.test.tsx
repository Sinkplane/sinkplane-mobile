import { render, screen } from '@testing-library/react-native';

import { SubscriptionList } from '@/components/settings/SubscriptionList';
import { fixtureCreators, fixtureSubscriptions } from '@test/fixtures';

describe('SubscriptionList', () => {
  it('lists each subscription with its creator and plan', async () => {
    await render(
      <SubscriptionList subscriptions={fixtureSubscriptions} creators={fixtureCreators} />,
    );

    expect(screen.getByText('Tech Channel')).toBeTruthy();
    expect(screen.getByText('Tech Supporter')).toBeTruthy();
    expect(screen.getByText('Gaming Channel')).toBeTruthy();
    expect(screen.getByText('Gaming Supporter')).toBeTruthy();
  });

  it('falls back to the owner, then the creator id, and to "Active" without a plan', async () => {
    await render(
      <SubscriptionList
        subscriptions={[{ creator: 'c1', plan: null }, { creator: 'c2' }]}
        creators={[{ id: 'c1', owner: { username: 'owner1' } }]}
      />,
    );

    expect(screen.getByText('owner1')).toBeTruthy();
    expect(screen.getByText('Creator c2')).toBeTruthy();
    expect(screen.getAllByText('Active')).toHaveLength(2);
  });

  it('says when there are no subscriptions', async () => {
    await render(<SubscriptionList subscriptions={[]} creators={undefined} />);
    expect(screen.getByText('No subscriptions found.')).toBeTruthy();

    await render(<SubscriptionList subscriptions={undefined} creators={undefined} />);
    expect(screen.getByText('No subscriptions found.')).toBeTruthy();
  });
});
