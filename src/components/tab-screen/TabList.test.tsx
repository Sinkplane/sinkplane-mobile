import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render as renderRaw, screen } from '@testing-library/react-native';

import { TabList, TabScreen, type TabListProps } from '@/components/tab-screen/TabList';
import { setTestWindow, TABLET_LANDSCAPE_WINDOW } from '@test/window-size';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Providers({ children }: Readonly<{ children: ReactNode }>) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderRaw(element, { wrapper: Providers });

interface Item {
  id: string;
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }];

function props(overrides: Partial<TabListProps<Item>> = {}): TabListProps<Item> {
  return {
    testID: 'tab-list',
    data: items,
    keyOf: (item) => item.id,
    renderCell: (item) => <Text>{`item ${item.id}`}</Text>,
    refreshing: false,
    onRefresh: jest.fn(),
    empty: <Text>Nothing here</Text>,
    ...overrides,
  };
}

function paging(overrides: Partial<NonNullable<TabListProps<Item>['paging']>> = {}) {
  return { hasNextPage: true, isFetchingNextPage: false, fetchNextPage: jest.fn(), ...overrides };
}

describe('TabScreen', () => {
  it('renders the screen content', async () => {
    await render(
      <TabScreen>
        <Text>Content</Text>
      </TabScreen>,
    );

    expect(screen.getByText('Content')).toBeTruthy();
  });
});

describe('TabList', () => {
  it('renders a header and a cell per item', async () => {
    await render(<TabList {...props({ header: <Text>Title</Text> })} />);

    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('item a')).toBeTruthy();
    expect(screen.getByText('item b')).toBeTruthy();
  });

  it('shows the empty state without items', async () => {
    await render(<TabList {...props({ data: [] })} />);

    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('pulls to refresh', async () => {
    const list = props();
    await render(<TabList {...list} />);

    const { refreshControl } = screen.getByTestId('tab-list').props as {
      refreshControl: { props: { onRefresh: () => void } };
    };
    refreshControl.props.onRefresh();

    expect(list.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('loads the next page near the end, unless one is loading or none is left', async () => {
    const more = paging();
    await render(<TabList {...props({ paging: more })} />);
    await fireEvent(screen.getByTestId('tab-list'), 'endReached');
    expect(more.fetchNextPage).toHaveBeenCalledTimes(1);

    const loading = paging({ isFetchingNextPage: true });
    await render(<TabList {...props({ paging: loading })} />);
    await fireEvent(screen.getByTestId('tab-list'), 'endReached');
    expect(loading.fetchNextPage).not.toHaveBeenCalled();

    const done = paging({ hasNextPage: false });
    await render(<TabList {...props({ paging: done })} />);
    await fireEvent(screen.getByTestId('tab-list'), 'endReached');
    expect(done.fetchNextPage).not.toHaveBeenCalled();
  });

  it('has no end-reached handler without paging', async () => {
    await render(<TabList {...props()} />);

    expect(screen.getByTestId('tab-list')).toHaveProp('onEndReached', undefined);
  });

  it('lays tablets out as a grid', async () => {
    setTestWindow(TABLET_LANDSCAPE_WINDOW);
    await render(<TabList {...props()} />);

    expect(screen.getByTestId('tab-list')).not.toHaveProp('numColumns', 1);
  });
});
