import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useDownloadMenu } from '@/components/downloads/download-menus';
import { DownloadRow } from '@/components/downloads/DownloadRow';
import { SaveToPhotosStatus } from '@/components/downloads/SaveToPhotosStatus';
import { TabList, TabScreen } from '@/components/tab-screen/TabList';
import { useNetworkAvailable } from '@/hooks/use-offline';
import type { SaveToPhotosState } from '@/hooks/use-save-to-photos';
import { useDownloadedVideos } from '@/hooks/use-video-download';
import { useSession, useThemeColor } from '@/shared';
import type { DownloadedVideo } from '@/utils/download-library';

const OFFLINE_ICON: SymbolViewProps['name'] = {
  ios: 'wifi.slash',
  android: 'wifi_off',
  web: 'wifi_off',
};
const ICON_SIZE = 22;

interface BannerProps {
  readonly retrying: boolean;
  readonly onRetry: () => void;
  readonly saveState: SaveToPhotosState;
}

/** "You're offline": what the list shows, how to get the rest back, and a retry. */
function OfflineBanner({ retrying, onRetry, saveState }: BannerProps): ReactElement {
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'icon');
  const linkColor = useThemeColor({}, 'link');
  return (
    <View style={styles.top}>
      <View testID="offline-banner" style={[styles.banner, { borderColor: `${mutedColor}44` }]}>
        <SymbolView name={OFFLINE_ICON} size={ICON_SIZE} tintColor={textColor} />
        <View style={styles.bannerText}>
          <Text style={[styles.title, { color: textColor }]}>{"You're offline"}</Text>
          <Text style={[styles.body, { color: mutedColor }]}>
            {"Here are the videos you've downloaded. To see all videos, check your connection or "}
            <Text
              testID="offline-open-settings"
              accessibilityRole="link"
              style={{ color: linkColor }}
              onPress={() => void Linking.openSettings()}
            >
              mobile data settings
            </Text>
            .
          </Text>
          <Pressable
            testID="offline-retry"
            onPress={onRetry}
            disabled={retrying}
            accessibilityRole="button"
            accessibilityState={{ disabled: retrying }}
          >
            <Text style={[styles.retry, { color: retrying ? mutedColor : linkColor }]}>
              {retrying ? 'Trying again…' : 'Try again'}
            </Text>
          </Pressable>
        </View>
      </View>
      <SaveToPhotosStatus state={saveState} />
    </View>
  );
}

/** Retries once the OS reports a connection again (not on mount: that's how offline mode began). */
function useRetryWhenConnected(tryAgain: () => void): void {
  const available = useNetworkAvailable();
  const wasAvailable = useRef(available);
  useEffect(() => {
    if (available && !wasAvailable.current) {
      tryAgain();
    }
    wasAvailable.current = available;
  }, [available, tryAgain]);
}

/**
 * Retries the session check (subscriptions): from the banner, pull-to-refresh, when the network
 * comes back, and whenever the app returns to the foreground (e.g. after turning mobile data on in
 * Settings).
 */
function useRetry(): { retrying: boolean; tryAgain: () => void } {
  const { retry } = useSession();
  const [retrying, setRetrying] = useState(false);
  const tryAgain = useCallback(() => {
    setRetrying(true);
    void retry().finally(() => {
      setRetrying(false);
    });
  }, [retry]);
  useRetryWhenConnected(tryAgain);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        tryAgain();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [tryAgain]);
  return { retrying, tryAgain };
}

/**
 * The Videos tab while offline (signed in, but Floatplane can't be reached): the downloaded
 * videos, which play from the device.
 */
export function OfflineDownloads(): ReactElement {
  const router = useRouter();
  const mutedColor = useThemeColor({}, 'icon');
  const videos = useDownloadedVideos();
  const menu = useDownloadMenu();
  const { retrying, tryAgain } = useRetry();
  const renderCell = useCallback(
    (video: DownloadedVideo) => (
      <DownloadRow
        video={video}
        onPress={() => {
          router.push({ pathname: '/video/[id]', params: { id: video.postId } });
        }}
        onMore={menu.open}
      />
    ),
    [router, menu.open],
  );
  return (
    <TabScreen>
      <TabList
        testID="offline-downloads"
        data={videos}
        keyOf={(video) => video.postId}
        renderCell={renderCell}
        refreshing={retrying}
        onRefresh={tryAgain}
        header={<OfflineBanner retrying={retrying} onRetry={tryAgain} saveState={menu.saveState} />}
        empty={
          <Text testID="offline-downloads-empty" style={[styles.empty, { color: mutedColor }]}>
            {"You haven't downloaded any videos yet."}
          </Text>
        }
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  top: {
    gap: 8,
    marginBottom: 12,
  },
  banner: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  bannerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  retry: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
  },
  empty: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 48,
    paddingHorizontal: 24,
  },
});
