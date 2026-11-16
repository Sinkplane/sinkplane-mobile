/**
 * The Android wording. The labels are decided once when the module loads, so this file never
 * imports it statically: it overrides the platform first, then requires it (its first evaluation).
 */
import { Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import type * as StatusModule from '@/components/downloads/SaveToPhotosStatus';

afterEach(() => {
  jest.restoreAllMocks();
});

it('says gallery instead of Photos on Android', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { SAVE_TO_PHOTOS_LABEL, SaveToPhotosStatus } = jest.requireActual<typeof StatusModule>(
    '@/components/downloads/SaveToPhotosStatus',
  );

  expect(SAVE_TO_PHOTOS_LABEL).toBe('Save to gallery');
  await render(<SaveToPhotosStatus state="saved" />);
  expect(screen.getByTestId('save-to-photos-status')).toHaveTextContent('Saved to your gallery.', {
    exact: true,
  });
});
