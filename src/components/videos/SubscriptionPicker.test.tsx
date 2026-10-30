import { fireEvent, render, screen } from '@testing-library/react-native';

import { SubscriptionPicker } from '@/components/videos/SubscriptionPicker';
import { gamingCreator, techCreator } from '@test/fixtures';

const creators = [techCreator, gamingCreator];

async function renderPicker(props: Partial<Parameters<typeof SubscriptionPicker>[0]> = {}) {
  const onSelect = jest.fn();
  await render(<SubscriptionPicker creators={creators} onSelect={onSelect} {...props} />);
  return { onSelect };
}

const openModal = async () => {
  await fireEvent.press(screen.getByTestId('subscription-picker'));
};

describe('SubscriptionPicker', () => {
  it('shows the merged feed as the current selection', async () => {
    await renderPicker();

    expect(screen.getByText('All Subscriptions')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subscription: All Subscriptions. Tap to change.' })).toBeTruthy();
  });

  it('shows the selected creator on the button', async () => {
    await renderPicker({ selectedCreatorId: techCreator.id });

    expect(screen.getByText('Tech Channel')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subscription: Tech Channel. Tap to change.' })).toBeTruthy();
  });

  it('lists every subscription in the modal, marking the selected one', async () => {
    await renderPicker({ selectedCreatorId: gamingCreator.id });
    await openModal();

    expect(screen.getByTestId('subscription-option-all')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show Tech Channel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show Gaming Channel' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Show Tech Channel' })).not.toBeSelected();
  });

  it('keeps the modal closed until the button is tapped', async () => {
    await renderPicker();
    expect(screen.queryByTestId('subscription-option-all')).toBeNull();

    await openModal();
    expect(screen.getByTestId('subscription-option-all')).toBeTruthy();
  });

  it('switches to a creator and closes the modal', async () => {
    const { onSelect } = await renderPicker();
    await openModal();

    await fireEvent.press(screen.getByTestId(`subscription-option-${gamingCreator.id}`));

    expect(onSelect).toHaveBeenCalledWith(gamingCreator.id);
    expect(screen.queryByTestId('subscription-option-all')).toBeNull();
  });

  it('switches back to the merged feed', async () => {
    const { onSelect } = await renderPicker({ selectedCreatorId: techCreator.id });
    await openModal();

    await fireEvent.press(screen.getByTestId('subscription-option-all'));

    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('re-selecting the current subscription just closes the modal', async () => {
    const { onSelect } = await renderPicker({ selectedCreatorId: techCreator.id });
    await openModal();

    await fireEvent.press(screen.getByTestId(`subscription-option-${techCreator.id}`));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('subscription-option-all')).toBeNull();
  });

  it('dismisses on the backdrop without selecting', async () => {
    const { onSelect } = await renderPicker();
    await openModal();

    await fireEvent.press(screen.getByTestId('subscription-modal-backdrop'));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('subscription-option-all')).toBeNull();
  });
});
