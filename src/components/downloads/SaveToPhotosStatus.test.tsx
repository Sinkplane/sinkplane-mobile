import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  SAVE_TO_PHOTOS_LABEL,
  SaveToPhotosStatus,
} from '@/components/downloads/SaveToPhotosStatus';
import type { SaveToPhotosState } from '@/hooks/use-save-to-photos';

describe('SaveToPhotosStatus', () => {
  it('labels the action for the platform (iOS in tests)', () => {
    expect(SAVE_TO_PHOTOS_LABEL).toBe('Save to Photos');
  });

  it('shows nothing before a save', async () => {
    await render(<SaveToPhotosStatus state="idle" />);
    expect(screen.queryByTestId('save-to-photos-status')).toBeNull();
  });

  it.each<[SaveToPhotosState, string]>([
    ['saving', 'Saving to Photos…'],
    ['saved', 'Saved to Photos.'],
    ['failed', "Couldn't save to Photos. Try again."],
  ])('%s reads "%s"', async (state, text) => {
    await render(<SaveToPhotosStatus state={state} />);
    expect(screen.getByTestId('save-to-photos-status')).toHaveTextContent(text, { exact: true });
    expect(screen.queryByTestId('save-to-photos-open-settings')).toBeNull();
  });

  it('denied: explains and links to the system settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await render(<SaveToPhotosStatus state="denied" />);
    expect(screen.getByTestId('save-to-photos-status')).toHaveTextContent(
      'Allow access to Photos to save videos. Open Settings',
      { exact: true },
    );
    await fireEvent.press(screen.getByRole('link', { name: 'Open Settings' }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
