import type { ReactElement } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  DownloadQualityList,
  DownloadSheetFrame,
  sheetStyles,
  usePressedRowColor,
} from '@/components/downloads/DownloadQualitySheet';
import type { DownloadActions } from '@/components/downloads/use-download-actions';
import { useSaveToPhotos, type SaveToPhotosState } from '@/hooks/use-save-to-photos';
import type { VideoDownloadState } from '@/hooks/use-video-download';
import { useThemeColor } from '@/shared';
import type { DownloadedVideo } from '@/utils/download-library';
import { formatBytes } from '@/utils/download-options';

/** Where "Save to Photos" puts a video, in the platform's words. */
const LIBRARY_NAME = Platform.OS === 'ios' ? 'Photos' : 'your gallery';

const PERCENT = 100;
/** Delete actions, on either theme. */
export const DESTRUCTIVE_COLOR = '#e5484d';

/** A download's progress (0–1) as a whole percent: "42%". */
export function downloadPercent(progress: number): string {
  return `${String(Math.floor(progress * PERCENT))}%`;
}

/** "Downloading 42%", or "Downloading…" before the transfer reports a size. */
export function downloadingLabel(progress: number | null): string {
  return progress === null ? 'Downloading…' : `Downloading ${downloadPercent(progress)}`;
}

interface SheetRowProps {
  readonly testID: string;
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
  readonly destructive?: boolean;
}

/** One action of the menu; without `onPress` it is a disabled (informational) row. */
function SheetRow({ testID, label, onPress, destructive = false }: SheetRowProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const pressedColor = usePressedRowColor();
  const disabled = onPress === undefined;
  const color = destructive ? DESTRUCTIVE_COLOR : textColor;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [sheetStyles.row, pressed && { backgroundColor: pressedColor }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={[sheetStyles.rowLabel, { color: disabled ? mutedColor : color }]}>{label}</Text>
    </Pressable>
  );
}

function saveLabel(state: SaveToPhotosState): string {
  switch (state) {
    case 'saving':
      return `Saving to ${LIBRARY_NAME}…`;
    case 'saved':
      return `Saved to ${LIBRARY_NAME}`;
    default:
      return `Save to ${LIBRARY_NAME}`;
  }
}

/** Why a save didn't happen: access denied (with a link to Settings) or an error. */
function SaveFeedback({ state }: Readonly<{ state: SaveToPhotosState }>): ReactElement | null {
  const mutedColor = useThemeColor({}, 'icon');
  const linkColor = useThemeColor({}, 'link');
  if (state !== 'denied' && state !== 'failed') {
    return null;
  }
  return (
    <Text testID="download-save-status" style={[styles.note, { color: mutedColor }]}>
      {state === 'denied'
        ? `Allow access to ${LIBRARY_NAME} to save videos.`
        : `Couldn't save to ${LIBRARY_NAME}. Try again.`}
      {state === 'denied' ? (
        <Text
          testID="download-open-settings"
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

function DownloadedActions({
  video,
  actions,
}: Readonly<{ video: DownloadedVideo; actions: DownloadActions }>): ReactElement {
  const router = useRouter();
  const photos = useSaveToPhotos();
  const canSave = photos.state !== 'saving' && photos.state !== 'saved';
  const play = () => {
    actions.close();
    router.push({ pathname: '/video/[id]', params: { id: video.postId } });
  };
  const save = () => {
    photos.save(video);
  };
  const remove = () => {
    actions.download.remove();
    actions.close();
  };
  return (
    <>
      <SheetRow testID="download-action-play" label="Play" onPress={play} />
      <SheetRow
        testID="download-action-save"
        label={saveLabel(photos.state)}
        onPress={canSave ? save : undefined}
      />
      <SaveFeedback state={photos.state} />
      <SheetRow
        testID="download-action-delete"
        label="Delete download"
        destructive
        onPress={remove}
      />
    </>
  );
}

function StateActions({ actions }: Readonly<{ actions: DownloadActions }>): ReactElement {
  const { state } = actions.download;
  switch (state.status) {
    case 'downloading':
      return (
        <>
          <SheetRow testID="download-action-progress" label={downloadingLabel(state.progress)} />
          <SheetRow
            testID="download-action-cancel"
            label="Cancel download"
            onPress={actions.download.cancel}
          />
        </>
      );
    case 'downloaded':
      return <DownloadedActions video={state.video} actions={actions} />;
    default:
      return (
        <SheetRow
          testID="download-action-download"
          label="Download…"
          onPress={actions.chooseQuality}
        />
      );
  }
}

/** What the menu says under the title about the download, if anything. */
function stateNote(state: VideoDownloadState): string | undefined {
  if (state.status === 'downloaded') {
    const { label, sizeBytes } = state.video;
    return `${label} · ${formatBytes(sizeBytes)} · Available offline`;
  }
  return state.status === 'failed' ? `Couldn't download ${state.label}. Try again.` : undefined;
}

function ActionMenu({
  title,
  actions,
}: Readonly<{ title: string; actions: DownloadActions }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const note = stateNote(actions.download.state);
  return (
    <>
      <View style={styles.header}>
        <Text testID="download-actions-title" style={[styles.title, { color: textColor }]}>
          {title}
        </Text>
        {note === undefined ? null : (
          <Text testID="download-actions-note" style={[styles.subtitle, { color: mutedColor }]}>
            {note}
          </Text>
        )}
      </View>
      <StateActions actions={actions} />
      <SheetRow
        testID="download-action-close"
        // While downloading, "Cancel" would read as cancelling the download: this only hides the menu.
        label={actions.download.state.status === 'downloading' ? 'Done' : 'Cancel'}
        onPress={actions.close}
      />
    </>
  );
}

/**
 * The download sheets of one video: the actions menu (download, progress + cancel, or play / save
 * to Photos / delete) and the quality list, in a single bottom sheet so switching between them
 * doesn't stack two modals.
 */
export function DownloadSheets({
  actions,
}: Readonly<{ actions: DownloadActions }>): ReactElement | null {
  const { target, sheet } = actions;
  if (target === undefined) {
    return null;
  }
  return (
    <DownloadSheetFrame visible={sheet !== 'none'} onClose={actions.close}>
      {sheet === 'quality' ? (
        <DownloadQualityList query={actions.options} onSelect={actions.select} />
      ) : (
        <ActionMenu key={target.postId} title={target.title} actions={actions} />
      )}
    </DownloadSheetFrame>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
  },
  note: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
});
