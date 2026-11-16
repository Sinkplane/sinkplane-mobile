import { DOWNLOAD_SIZE_1080, DOWNLOAD_SIZE_720, makeDownloadDelivery } from '@test/fixtures';
import type { VideoDelivery } from '@/shared';
import { downloadFileName, formatBytes, getDownloadOptions } from '@/utils/download-options';

/** A one-group delivery with the given variants (cast: tests pass the loose API shape). */
const delivery = (variants: unknown[], origins = [{ url: 'https://edge.test/' }]): VideoDelivery =>
  ({ groups: [{ origins, variants }] }) as unknown as VideoDelivery;

describe('getDownloadOptions', () => {
  it('lists the downloadable qualities best first, with absolute signed URLs and sizes', () => {
    // 600 s at 600 kbit/s (500 video + 100 audio) = 45,000,000 bytes, estimated.
    expect(getDownloadOptions(makeDownloadDelivery('guid'), 600)).toEqual([
      {
        id: '1080-avc1',
        label: '1080p',
        url: 'https://edge.floatplane.test/Videos/guid/1080.mp4?token=signed-1080',
        sizeBytes: DOWNLOAD_SIZE_1080,
        estimated: false,
      },
      {
        id: '720-avc1',
        label: '720p',
        url: 'https://edge.floatplane.test/Videos/guid/720.mp4?token=signed-720',
        sizeBytes: DOWNLOAD_SIZE_720,
        estimated: false,
      },
      {
        id: '360-avc1',
        label: '360p',
        url: 'https://edge.floatplane.test/Videos/guid/360.mp4?token=signed-360',
        sizeBytes: 45_000_000,
        estimated: true,
      },
    ]);
  });

  it('has no size for variants without one when the duration or bitrate is unknown', () => {
    const [withoutDuration] = getDownloadOptions(
      delivery([{ url: '/a.mp4', meta: { video: { bitrate: { average: 1000 } } } }]),
    );
    expect(withoutDuration).toMatchObject({ sizeBytes: undefined, estimated: false });

    const [zeroDuration] = getDownloadOptions(
      delivery([{ url: '/a.mp4', meta: { audio: { bitrate: { average: 1000 } } } }]),
      0,
    );
    expect(zeroDuration).toMatchObject({ sizeBytes: undefined, estimated: false });

    const [noBitrate] = getDownloadOptions(delivery([{ url: '/a.mp4' }]), 600);
    expect(noBitrate).toMatchObject({ sizeBytes: undefined, estimated: false });
  });

  it('estimates from the audio bitrate alone when there is no video bitrate', () => {
    const [option] = getDownloadOptions(
      delivery([{ url: '/a.mp4', meta: { audio: { bitrate: { average: 8000 } } } }]),
      10,
    );
    expect(option).toMatchObject({ sizeBytes: 10_000, estimated: true });
  });

  it('skips disabled, hidden, URL-less and access-denied variants', () => {
    const options = getDownloadOptions(
      delivery([
        { url: '/disabled.mp4', label: 'Disabled', enabled: false },
        { url: '/hidden.mp4', label: 'Hidden', hidden: true },
        { url: '', label: 'No URL' },
        {
          url: '/denied.mp4',
          label: 'Denied',
          meta: { common: { access: { deniedReason: 'x' } } },
        },
        { url: '/ok.mp4', label: 'OK', hidden: false },
      ]),
    );
    expect(options.map((option) => option.label)).toEqual(['OK']);
  });

  it("prefers the variant's own origin, then the group's, then floatplane.com", () => {
    const [own] = getDownloadOptions(
      delivery([{ url: '/a.mp4', origins: [{ url: 'https://variant.test/' }] }]),
    );
    expect(own?.url).toBe('https://variant.test/a.mp4');

    const [group] = getDownloadOptions(delivery([{ url: 'a.mp4' }]));
    expect(group?.url).toBe('https://edge.test/a.mp4');

    const [fallback] = getDownloadOptions(delivery([{ url: '/a.mp4' }], []));
    expect(fallback?.url).toBe('https://www.floatplane.com/a.mp4');
  });

  it('uses absolute variant URLs as they are', () => {
    const [option] = getDownloadOptions(delivery([{ url: 'HTTPS://cdn.test/file.mp4?t=1' }]));
    expect(option?.url).toBe('HTTPS://cdn.test/file.mp4?t=1');
  });

  it('labels a variant by its label, else its name, else "Video"; ids fall back to the URL', () => {
    const options = getDownloadOptions(
      delivery([
        { url: '/c.mp4' },
        { url: '/b.mp4', name: '480-avc1' },
        { url: '/a.mp4', label: 'A' },
      ]),
    );
    expect(options.map(({ id, label }) => [id, label])).toEqual([
      ['/a.mp4', 'A'],
      ['480-avc1', '480-avc1'],
      ['/c.mp4', 'Video'],
    ]);
  });

  it('has no options without a delivery or a group', () => {
    expect(getDownloadOptions(undefined)).toEqual([]);
    expect(getDownloadOptions(null)).toEqual([]);
    expect(getDownloadOptions({ groups: [] })).toEqual([]);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [-5, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [10 * 1024, '10 KB'],
    [DOWNLOAD_SIZE_720, '220 MB'],
    [DOWNLOAD_SIZE_1080, '1.2 GB'],
    [5 * 1024 ** 4, '5.0 TB'],
    [2048 * 1024 ** 4, '2048 TB'],
  ])('%d bytes → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe('downloadFileName', () => {
  it('names the file after the title and quality', () => {
    expect(downloadFileName('Home Lab Tour', '1080p')).toBe('Home Lab Tour (1080p).mp4');
  });

  it('replaces characters file systems reject and collapses whitespace', () => {
    expect(downloadFileName('Tech: News / Week 4?  \t"Final"', '4K')).toBe(
      'Tech- News - Week 4- --Final- (4K).mp4',
    );
    expect(downloadFileName('a\\b*c<d>e|f\u0000g\u007fh', 'x')).toBe('a-b-c-d-e-f-g-h (x).mp4');
  });

  it('keeps non-ASCII titles and trims long ones to 80 characters', () => {
    expect(downloadFileName('Café ✓', '720p')).toBe('Café ✓ (720p).mp4');
    const long = downloadFileName(`${'x'.repeat(79)} yyyy`, '720p');
    expect(long).toBe(`${'x'.repeat(79)} (720p).mp4`);
  });

  it('falls back to "video" for titles with nothing left', () => {
    expect(downloadFileName('   ', '720p')).toBe('video (720p).mp4');
  });
});
