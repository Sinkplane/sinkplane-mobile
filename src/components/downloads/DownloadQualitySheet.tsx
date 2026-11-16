import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DownloadOptionsQuery } from '@/hooks/use-download-options';
import { useThemeColor } from '@/shared';
import { formatBytes, type DownloadOption } from '@/utils/download-options';

const SHEET_COLORS = { light: '#ffffff', dark: '#1f2123' };
const PRESSED_COLORS = { light: 'rgba(0, 0, 0, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' };

/** Background of a pressed sheet row. */
export function usePressedRowColor(): string {
  return useThemeColor(PRESSED_COLORS, 'background');
}

interface SheetFrameProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A bottom sheet over a dimmed backdrop; tapping the backdrop (or Android back) closes it. */
export function DownloadSheetFrame({ visible, onClose, children }: SheetFrameProps): ReactElement {
  const sheetColor = useThemeColor(SHEET_COLORS, 'background');
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      <Pressable
        testID="download-sheet-backdrop"
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close download options"
      >
        <View testID="download-sheet" style={[styles.sheet, { backgroundColor: sheetColor }]}>
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

/** `420 MB`, `~420 MB` for an estimate, nothing when unknown. */
function optionSize({ sizeBytes, estimated }: DownloadOption): string {
  if (sizeBytes === undefined) {
    return '';
  }
  return `${estimated ? '~' : ''}${formatBytes(sizeBytes)}`;
}

function QualityOption({
  option,
  onSelect,
}: Readonly<{ option: DownloadOption; onSelect: (option: DownloadOption) => void }>): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const pressedColor = usePressedRowColor();
  const size = optionSize(option);
  return (
    <Pressable
      testID={`download-option-${option.id}`}
      onPress={() => {
        onSelect(option);
      }}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: pressedColor }]}
      accessibilityRole="button"
      accessibilityLabel={size === '' ? option.label : `${option.label}, ${size}`}
    >
      <Text style={[styles.optionLabel, { color: textColor }]}>{option.label}</Text>
      <Text style={[styles.optionSize, { color: mutedColor }]}>{size}</Text>
    </Pressable>
  );
}

interface QualityListProps {
  readonly query: DownloadOptionsQuery;
  readonly onSelect: (option: DownloadOption) => void;
}

/** Loading, error and empty states, or the qualities. */
function QualityBody({ query, onSelect }: QualityListProps): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  const linkColor = useThemeColor({}, 'link');
  if (query.isLoading) {
    return <ActivityIndicator testID="download-options-loading" style={styles.state} />;
  }
  if (query.isError) {
    return (
      <View style={styles.state}>
        <Text style={[styles.message, { color: mutedColor }]}>
          Couldn&apos;t load the download options.
        </Text>
        <Pressable
          testID="download-options-retry"
          onPress={query.refetch}
          accessibilityRole="button"
        >
          <Text style={[styles.retry, { color: linkColor }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (query.options.length === 0) {
    return (
      <Text style={[styles.message, styles.state, { color: mutedColor }]}>
        This video has no downloads available.
      </Text>
    );
  }
  return (
    <>
      {query.options.map((option) => (
        <QualityOption key={option.id} option={option} onSelect={onSelect} />
      ))}
    </>
  );
}

/** The downloadable qualities (best first) with their file sizes, as sheet content. */
export function DownloadQualityList({ query, onSelect }: QualityListProps): ReactElement {
  const mutedColor = useThemeColor({}, 'icon');
  return (
    <>
      <Text style={[styles.heading, { color: mutedColor }]}>Download quality</Text>
      <QualityBody query={query} onSelect={onSelect} />
      <Text style={[styles.caption, { color: mutedColor }]}>
        Saved in the app to watch offline (Settings › Downloads).
      </Text>
    </>
  );
}

export const sheetStyles = StyleSheet.create({
  heading: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});

const styles = StyleSheet.create({
  ...sheetStyles,
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  option: sheetStyles.row,
  optionLabel: sheetStyles.rowLabel,
  optionSize: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  state: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
  },
  retry: {
    fontSize: 15,
    fontWeight: '600',
  },
});
