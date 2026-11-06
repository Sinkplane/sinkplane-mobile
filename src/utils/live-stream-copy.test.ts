import { liveStreamCopy } from '@/utils/live-stream-copy';
import { makeCreatorLiveStream, techCreator, techLiveStream } from '@test/fixtures';

describe('liveStreamCopy', () => {
  it('uses the stream’s own title, description and thumbnail while live', () => {
    expect(liveStreamCopy(makeCreatorLiveStream('live'))).toEqual({
      title: 'Tech Live: Friday Show',
      description: 'Live tech talk & news',
      thumbnail: techLiveStream.thumbnail.path,
    });
  });

  it('uses the creator’s offline card otherwise', () => {
    for (const status of ['offline', 'loading', 'error'] as const) {
      expect(liveStreamCopy(makeCreatorLiveStream(status))).toEqual({
        title: 'We are offline',
        description: 'Back Friday at 4pm',
        thumbnail: techLiveStream.offline.thumbnail.path,
      });
    }
  });

  it('falls back to a generic notice and the creator cover without an offline card', () => {
    const liveStream = { ...techLiveStream, offline: undefined } as unknown as typeof techLiveStream;
    expect(liveStreamCopy(makeCreatorLiveStream('offline', { liveStream }))).toEqual({
      title: 'Tech Channel is not live right now.',
      description: '',
      thumbnail: techCreator.cover.path,
    });
  });
});
