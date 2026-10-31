import { getStreamUrl, buildVideoSource } from '@/utils/stream-source';
import { BROWSER_USER_AGENT, type VideoDelivery } from '@/shared';

const delivery = (overrides: Partial<VideoDelivery['groups'][number]['variants'][number]>[] = []): VideoDelivery =>
  ({
    groups: [
      {
        origins: [{ url: 'https://edge.floatplane.test/guid/' }],
        variants: [
          { url: '/360.m3u8', label: '360p' },
          { url: '/720.m3u8', label: '720p' },
          { url: '/1080.m3u8', label: '1080p' },
          ...overrides,
        ],
      },
    ],
  }) as unknown as VideoDelivery;

describe('getStreamUrl', () => {
  it('joins the first origin with the highest playable variant', () => {
    expect(getStreamUrl(delivery())).toBe('https://edge.floatplane.test/guid/1080.m3u8');
  });

  it('accepts variant urls without a leading slash and origins with extra slashes', () => {
    const shape = {
      groups: [{ origins: [{ url: 'https://edge.floatplane.test/guid///' }], variants: [{ url: '720.m3u8' }] }],
    } as unknown as VideoDelivery;
    expect(getStreamUrl(shape)).toBe('https://edge.floatplane.test/guid/720.m3u8');
  });

  it('skips disabled, url-less and access-denied variants, picking the last playable one', () => {
    const shape = {
      groups: [
        {
          origins: [{ url: 'https://edge.floatplane.test/guid/' }],
          variants: [
            { url: '/360.m3u8', enabled: false },
            { url: '/720.m3u8', meta: { common: { access: { deniedReason: 'notSubscribed' } } } },
            { url: '/1080.m3u8' },
            { enabled: true },
          ],
        },
      ],
    } as unknown as VideoDelivery;
    expect(getStreamUrl(shape)).toBe('https://edge.floatplane.test/guid/1080.m3u8');
  });

  it('returns null when there is nothing playable', () => {
    const denied = {
      groups: [
        {
          origins: [{ url: 'https://edge.floatplane.test/guid/' }],
          variants: [{ url: '/720.m3u8', meta: { common: { access: { deniedReason: 'nope' } } } }],
        },
      ],
    } as unknown as VideoDelivery;
    expect(getStreamUrl(denied)).toBeNull();
  });

  it('returns null without delivery, groups, origins or variants', () => {
    expect(getStreamUrl(undefined)).toBeNull();
    expect(getStreamUrl({ groups: [] } as unknown as VideoDelivery)).toBeNull();
    const noOrigins = { groups: [{ origins: [], variants: [] }] } as unknown as VideoDelivery;
    const noVariants = { groups: [{ origins: [{ url: 'https://edge.test/' }], variants: [] }] } as unknown as VideoDelivery;
    expect(getStreamUrl(noOrigins)).toBeNull();
    expect(getStreamUrl(noVariants)).toBeNull();
  });
});

describe('buildVideoSource', () => {
  it('returns null without a url', () => {
    expect(buildVideoSource(null, 'token')).toBeNull();
  });

  it('authenticates the stream like API calls (browser UA + bearer token)', () => {
    const source = buildVideoSource('https://edge.floatplane.test/x.m3u8', 'session-token', {
      title: 'A Video',
      artist: 'A Channel',
      artwork: 'https://cdn.test/art.jpg',
    });
    expect(source).toEqual({
      uri: 'https://edge.floatplane.test/x.m3u8',
      contentType: 'hls',
      headers: { 'User-Agent': BROWSER_USER_AGENT, Authorization: 'Bearer session-token' },
      metadata: { title: 'A Video', artist: 'A Channel', artwork: 'https://cdn.test/art.jpg' },
    });
  });

  it('omits the Authorization header and metadata when absent', () => {
    expect(buildVideoSource('https://edge.floatplane.test/x.m3u8', undefined)).toEqual({
      uri: 'https://edge.floatplane.test/x.m3u8',
      contentType: 'hls',
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });
    expect(buildVideoSource('https://x.test/a.m3u8', null, {})).toEqual({
      uri: 'https://x.test/a.m3u8',
      contentType: 'hls',
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      metadata: {},
    });
    expect(buildVideoSource('https://x.test/a.m3u8', null)).toEqual({
      uri: 'https://x.test/a.m3u8',
      contentType: 'hls',
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });
  });
});
