import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useDownloadOptions } from '@/hooks/use-download-options';
import { makeDownloadDelivery } from '@test/fixtures';

let queryClient: QueryClient;
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL]>();

const deliveryResponse = () =>
  new Response(JSON.stringify(makeDownloadDelivery('guid-1')), { status: 200 });

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(deliveryResponse()));
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  queryClient.clear();
});

const urlOf = (input: RequestInfo | URL | undefined): string => {
  if (input === undefined || typeof input === 'string') {
    return input ?? '';
  }
  return input instanceof URL ? input.href : input.url;
};

const labels = (options: readonly { label: string }[]): string[] =>
  options.map((option) => option.label);

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

async function renderOptions(
  enabled: boolean,
  { token = 'token', guid = 'guid-1' }: { token?: string | null; guid?: string | null } = {},
) {
  return renderHook(
    (props: { enabled: boolean }) =>
      useDownloadOptions(token, guid ?? undefined, {
        enabled: props.enabled,
        durationSeconds: 600,
      }),
    { wrapper, initialProps: { enabled } },
  );
}

describe('useDownloadOptions', () => {
  it('fetches nothing until enabled', async () => {
    const { result } = await renderOptions(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ options: [], isLoading: false, isError: false });
  });

  it("loads the attachment's download delivery when enabled", async () => {
    const { result, rerender } = await renderOptions(false);
    await rerender({ enabled: true });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(labels(result.current.options)).toEqual(['1080p', '720p', '360p']);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.options[2]).toMatchObject({ sizeBytes: 45_000_000, estimated: true });
    expect(urlOf(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/v3/delivery/info?scenario=download&entityId=guid-1',
    );
  });

  it.each([
    ['no session', null, 'guid-1'],
    ['no attachment', 'token', null],
  ])('fetches nothing with %s', async (_case, token, guid) => {
    const { result } = await renderOptions(true, { token, guid });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('reports a failure, and refetch retries it', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('nope', { status: 500 })));
    const { result } = await renderOptions(true);
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    await act(() => {
      result.current.refetch();
    });
    await waitFor(() => {
      expect(result.current.options).toHaveLength(3);
    });
    expect(result.current.isError).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
