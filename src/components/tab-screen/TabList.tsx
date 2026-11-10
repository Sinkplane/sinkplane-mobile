import { useCallback, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { useListGrid } from '@/hooks/use-screen-layout';
import { useTabScreenInsets } from '@/hooks/use-tab-screen-insets';
import { useThemeColor } from '@/shared';

/** Breathing room below the last row, on top of the tab bar inset. */
const LIST_BOTTOM_PADDING = 24;
/** Start loading the next page this many screen heights before the end. */
const END_REACHED_THRESHOLD = 1.5;

/** Infinite paging, as react-query's infinite queries expose it. */
interface TabListPaging {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => unknown;
}

export interface TabListProps<T> {
  readonly testID: string;
  readonly data: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly renderCell: (item: T) => ReactElement;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly empty: ReactElement;
  readonly header?: ReactElement;
  /** Loads further pages when the end comes near; shows a spinner below the list meanwhile. */
  readonly paging?: TabListPaging;
}

/** The tab screen's background, padded below the status bar. */
export function TabScreen({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  const insets = useTabScreenInsets();
  const backgroundColor = useThemeColor({}, 'background');
  return (
    <View style={[styles.container, { backgroundColor, paddingTop: insets.top }]}>{children}</View>
  );
}

function useLoadMore(paging: TabListPaging | undefined): (() => void) | undefined {
  const loadMore = useCallback(() => {
    if (paging?.hasNextPage === true && !paging.isFetchingNextPage) {
      void paging.fetchNextPage();
    }
  }, [paging]);
  return paging === undefined ? undefined : loadMore;
}

/** Wraps each cell to the grid's column width (undefined = full width on phones). */
function useGridCell<T>(renderCell: (item: T) => ReactElement, columnWidth: number | undefined) {
  return useCallback(
    ({ item }: { item: T }) => <View style={{ width: columnWidth }}>{renderCell(item)}</View>,
    [renderCell, columnWidth],
  );
}

/** A spinner below the list while the next page loads. */
function pagingFooter(paging: TabListPaging | undefined): ReactElement | undefined {
  return paging?.isFetchingNextPage === true ? (
    <ActivityIndicator style={styles.footer} />
  ) : undefined;
}

/**
 * The list of a tab screen (Videos, History, Live): a single column on phones and a grid on
 * tablets, padded clear of the tab bar, with pull-to-refresh and optional infinite paging.
 */
export function TabList<T>({
  testID,
  data,
  keyOf,
  renderCell,
  refreshing,
  onRefresh,
  empty,
  header,
  paging,
}: TabListProps<T>): ReactElement {
  const insets = useTabScreenInsets();
  const { listKey, columnWidth, ...grid } = useListGrid();
  const loadMore = useLoadMore(paging);
  const renderItem = useGridCell(renderCell, columnWidth);

  return (
    <FlatList
      testID={testID}
      key={listKey}
      {...grid}
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + LIST_BOTTOM_PADDING },
      ]}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={data}
      keyExtractor={keyOf}
      renderItem={renderItem}
      onEndReached={loadMore}
      onEndReachedThreshold={END_REACHED_THRESHOLD}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={pagingFooter(paging)}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  footer: {
    marginVertical: 16,
  },
});
