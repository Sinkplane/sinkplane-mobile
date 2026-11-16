import type { ReactElement } from 'react';
import { Linking, Platform, StyleSheet, Text } from 'react-native';

import type { SaveToPhotosState } from '@/hooks/use-save-to-photos';
import { useThemeColor } from '@/shared';

/** Where "Save to Photos" copies a video, in the platform's words. */
const PHOTO_LIBRARY = Platform.OS === 'ios' ? 'Photos' : 'your gallery';

/** The action's label: "Save to Photos" (iOS) / "Save to gallery" (Android). */
export const SAVE_TO_PHOTOS_LABEL = Platform.OS === 'ios' ? 'Save to Photos' : 'Save to gallery';

function message(state: SaveToPhotosState): string | null {
  switch (state) {
    case 'saving':
      return `Saving to ${PHOTO_LIBRARY}…`;
    case 'saved':
      return `Saved to ${PHOTO_LIBRARY}.`;
    case 'denied':
      return `Allow access to ${PHOTO_LIBRARY} to save videos.`;
    case 'failed':
      return `Couldn't save to ${PHOTO_LIBRARY}. Try again.`;
    default:
      return null;
  }
}

/** One line after "Save to Photos": saving, saved, failed, or access denied (+ Open Settings). */
export function SaveToPhotosStatus({
  state,
}: Readonly<{ state: SaveToPhotosState }>): ReactElement | null {
  const mutedColor = useThemeColor({}, 'icon');
  const linkColor = useThemeColor({}, 'link');
  const text = message(state);
  if (text === null) {
    return null;
  }
  return (
    <Text testID="save-to-photos-status" style={[styles.status, { color: mutedColor }]}>
      {text}
      {state === 'denied' ? (
        <Text
          testID="save-to-photos-open-settings"
          accessibilityRole="link"
          style={{ color: linkColor }}
          onPress={() => void Linking.openSettings()}
        >
          {' Open Settings'}
        </Text>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  status: {
    fontSize: 13,
  },
});
