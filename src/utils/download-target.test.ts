import { downloadTargetOf, type DownloadablePost } from '@/utils/download-target';

const BASE: DownloadablePost = { id: 'post-1', title: 'Home Lab Tour' };

describe('downloadTargetOf', () => {
  it('a post page: the first attachment object, its duration, channel and thumbnail', () => {
    expect(
      downloadTargetOf({
        ...BASE,
        channel: { title: 'LTT' },
        thumbnail: { path: 'https://pbs.test/t.jpg' },
        videoAttachments: [
          { guid: 'att-1', duration: 600 },
          { guid: 'att-2', duration: 30 },
        ],
        metadata: { videoDuration: 999 },
      }),
    ).toEqual({
      postId: 'post-1',
      title: 'Home Lab Tour',
      channel: 'LTT',
      thumbnailUrl: 'https://pbs.test/t.jpg',
      durationSeconds: 600,
      attachmentId: 'att-1',
    });
  });

  it('a list item: a bare attachment id and the metadata duration', () => {
    expect(
      downloadTargetOf({ ...BASE, videoAttachments: ['att-9'], metadata: { videoDuration: 120 } }),
    ).toEqual({
      postId: 'post-1',
      title: 'Home Lab Tour',
      channel: undefined,
      thumbnailUrl: undefined,
      durationSeconds: 120,
      attachmentId: 'att-9',
    });
  });

  it.each([
    ['no attachments field', {}],
    ['null attachments', { videoAttachments: null }],
    ['an empty list', { videoAttachments: [] }],
    ['an attachment without a guid', { videoAttachments: [{ duration: 5 }] }],
  ])('no video (%s): undefined', (_case, fields) => {
    expect(downloadTargetOf({ ...BASE, ...fields })).toBeUndefined();
  });

  it.each([
    ['a zero duration', { videoAttachments: [{ guid: 'a', duration: 0 }] }],
    ['no duration anywhere', { videoAttachments: ['a'], metadata: null }],
    ['a zero metadata duration', { videoAttachments: ['a'], metadata: { videoDuration: 0 } }],
  ])('%s: no duration', (_case, fields) => {
    expect(downloadTargetOf({ ...BASE, ...fields })?.durationSeconds).toBeUndefined();
  });

  it.each([
    ['a channel id string', 'channel-id'],
    ['null', null],
    ['an object without a title', { id: 'c' }],
    ['a non-string title', { title: 5 }],
  ])('channel as %s: no channel', (_case, channel) => {
    expect(
      downloadTargetOf({ ...BASE, channel, videoAttachments: ['a'] })?.channel,
    ).toBeUndefined();
  });

  it('a null thumbnail: no thumbnail', () => {
    expect(
      downloadTargetOf({ ...BASE, thumbnail: null, videoAttachments: ['a'] })?.thumbnailUrl,
    ).toBeUndefined();
  });
});
