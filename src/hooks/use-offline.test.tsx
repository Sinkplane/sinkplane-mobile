import { act, renderHook } from '@testing-library/react-native';

import { useIsOffline, useNetworkAvailable } from '@/hooks/use-offline';
import { mockNetwork } from '@test/mocks/expo-network';

let mockSessionOffline = false;
jest.mock('@/shared', () => ({
  ...jest.requireActual<object>('@/shared'),
  useSession: () => ({ offline: mockSessionOffline }),
}));

beforeEach(() => {
  mockSessionOffline = false;
});

describe('useNetworkAvailable', () => {
  it('is true while the connection is unknown', async () => {
    const { result } = await renderHook(() => useNetworkAvailable());
    expect(result.current).toBe(true);
  });

  it('is true when connected and reachable', async () => {
    mockNetwork.online();
    const { result } = await renderHook(() => useNetworkAvailable());
    expect(result.current).toBe(true);
  });

  it('is false when not connected', async () => {
    mockNetwork.set({ isConnected: false });
    const { result } = await renderHook(() => useNetworkAvailable());
    expect(result.current).toBe(false);
  });

  it('is false when the internet is unreachable', async () => {
    mockNetwork.set({ isConnected: true, isInternetReachable: false });
    const { result } = await renderHook(() => useNetworkAvailable());
    expect(result.current).toBe(false);
  });

  it('follows the network as it drops and returns', async () => {
    const { result } = await renderHook(() => useNetworkAvailable());
    await act(() => {
      mockNetwork.offline();
    });
    expect(result.current).toBe(false);
    await act(() => {
      mockNetwork.online();
    });
    expect(result.current).toBe(true);
  });
});

describe('useIsOffline', () => {
  it('is false with a session that could be checked and a network', async () => {
    const { result } = await renderHook(() => useIsOffline());
    expect(result.current).toBe(false);
  });

  it('is true when the session is in offline mode, even with a network', async () => {
    mockSessionOffline = true;
    mockNetwork.online();
    const { result } = await renderHook(() => useIsOffline());
    expect(result.current).toBe(true);
  });

  it('is true when the network is gone, even with a checked session', async () => {
    mockNetwork.offline();
    const { result } = await renderHook(() => useIsOffline());
    expect(result.current).toBe(true);
  });
});
