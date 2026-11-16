import { downloadDetail, downloadsSummary, totalDownloadBytes } from '@/utils/downloads-summary';
import { DOWNLOADED_VIDEOS, makeDownloadedVideo } from '@test/fixtures-downloads';

describe('downloads summary', () => {
  it('adds up the sizes', () => {
    expect(totalDownloadBytes(DOWNLOADED_VIDEOS)).toBe(1_288_490_189 + 230_686_720);
    expect(totalDownloadBytes([])).toBe(0);
  });

  it.each([
    ['none', [], 'None yet'],
    ['one', [makeDownloadedVideo({ sizeBytes: 230_686_720 })], '1 video · 220 MB'],
    ['two', DOWNLOADED_VIDEOS, '2 videos · 1.4 GB'],
  ])('%s: reads "%s"', (_case, videos, summary) => {
    expect(downloadsSummary(videos)).toBe(summary);
  });

  it('describes one download by quality and size', () => {
    expect(downloadDetail(makeDownloadedVideo())).toBe('1080p · 1.2 GB');
  });
});
