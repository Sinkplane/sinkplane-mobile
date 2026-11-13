import { Linking } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';

import { floatplanePostId, useOpenLink } from '@/components/video-page/use-open-link';
import * as logModule from '@/utils/log';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

describe('floatplanePostId', () => {
  it.each([
    ['https://www.floatplane.com/post/AbC123', 'AbC123'],
    ['https://floatplane.com/post/abc?t=30', 'abc'],
    ['/post/xyz', 'xyz'],
    ['https://www.floatplane.com/channel/linustechtips/home', undefined],
    ['https://evil.test/post/abc', undefined],
    ['https://www.floatplane.com.evil.test/post/abc', undefined],
  ])('reads %p as %p', (href, expected) => {
    expect(floatplanePostId(href)).toBe(expected);
  });
});

describe('useOpenLink', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(() => {
    openURL.mockRestore();
  });

  async function openLink(href: string): Promise<void> {
    const { result } = await renderHook(() => useOpenLink());
    result.current(href);
  }

  it('opens a Floatplane post link on its in-app video page', async () => {
    await openLink('https://www.floatplane.com/post/AbC123');

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/video/[id]',
      params: { id: 'AbC123' },
    });
    expect(openURL).not.toHaveBeenCalled();
  });

  it('opens other links externally', async () => {
    await openLink('https://www.youtube.com/watch?v=1');
    expect(openURL).toHaveBeenCalledWith('https://www.youtube.com/watch?v=1');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it.each([
    ['/channel/linustechtips/home', 'https://www.floatplane.com/channel/linustechtips/home'],
    ['//cdn.test/file', '//cdn.test/file'],
  ])('resolves %p to %p', async (href, expected) => {
    await openLink(href);
    expect(openURL).toHaveBeenCalledWith(expected);
  });

  it('logs a link the OS cannot open', async () => {
    const error = new Error('no handler');
    openURL.mockRejectedValue(error);
    const logError = jest.spyOn(logModule, 'logError').mockImplementation(() => undefined);

    await openLink('weird:thing');

    await waitFor(() => {
      expect(logError).toHaveBeenCalledWith("Couldn't open link weird:thing", error);
    });
    logError.mockRestore();
  });
});
