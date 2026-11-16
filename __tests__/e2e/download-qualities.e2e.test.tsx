/**
 * E2E: the download quality sheet with irregular `scenario=download` delivery info: hidden and
 * disabled variants are skipped, unlabeled variants fall back to their name (else "Video"), and
 * file URLs resolve against the variant's own origin, else the group's, else floatplane.com
 * (absolute URLs are kept).
 */
import { loadRuntime, type Runtime } from './helpers/runtime';
import { GUID, openVideo, untilPlayable } from './helpers/video-page';

let rt: Runtime;

beforeEach(() => {
  rt = loadRuntime();
});

const downloadButton = () => rt.screen.getByTestId('download-button');
const button = (name: string) => rt.screen.getByRole('button', { name });

it('an irregular delivery: hidden / disabled skipped, labels, origins and sizes fall back', async () => {
  rt.api.downloadDeliveries.set(GUID, {
    groups: [
      {
        // No group origin: relative URLs without their own origin go to floatplane.com.
        variants: [
          { name: 'low', url: '/low.mp4', enabled: true },
          { url: 'https://cdn.other.test/abs.mp4', label: 'Abs', enabled: true },
          { name: 'hidden', label: 'Hidden', url: '/h.mp4', enabled: true, hidden: true },
          { name: 'off', label: 'Off', url: '/off.mp4', enabled: false },
          {
            url: '/own.mp4',
            enabled: true,
            origins: [{ url: 'https://variant.origin.test' }],
            meta: { video: { bitrate: { average: 800_000 } } },
          },
        ],
      },
    ] as never,
  });
  await openVideo(rt);
  await untilPlayable(rt);
  await rt.fireEvent.press(downloadButton());
  await rt.until(() => {
    expect(button('Abs')).toBeTruthy();
  });

  const labels = rt.screen
    .getAllByTestId(/^download-option-/)
    .map((option) => option.props['accessibilityLabel'] as string);
  // Best first; the unlabeled variants read their name, else "Video"; video-only bitrate estimate.
  expect(labels).toEqual([expect.stringMatching(/^Video, ~\d+(\.\d)? MB$/), 'Abs', 'low']);
  expect(rt.screen.queryByText('Hidden')).toBeNull();
  expect(rt.screen.queryByText('Off')).toBeNull();

  await rt.fireEvent.press(button('low'));
  await rt.until(() => {
    expect(rt.fileSystem.downloads).toHaveLength(1);
  });
  expect(rt.fileSystem.lastDownload().url).toBe('https://www.floatplane.com/low.mp4');
});

it('a variant with its own origin downloads from there; absolute URLs are kept', async () => {
  rt.api.downloadDeliveries.set(GUID, {
    groups: [
      {
        origins: [{ url: 'https://group.origin.test' }],
        variants: [
          { url: 'https://cdn.other.test/abs.mp4', label: 'Abs', enabled: true },
          {
            url: '/own.mp4',
            label: 'Own',
            enabled: true,
            origins: [{ url: 'https://variant.origin.test' }],
          },
        ],
      },
    ] as never,
  });
  await openVideo(rt);
  await untilPlayable(rt);
  await rt.fireEvent.press(downloadButton());
  await rt.until(() => {
    expect(button('Own')).toBeTruthy();
  });
  await rt.fireEvent.press(button('Own'));
  await rt.until(() => {
    expect(rt.fileSystem.downloads).toHaveLength(1);
  });
  expect(rt.fileSystem.lastDownload().url).toBe('https://variant.origin.test/own.mp4');
  await rt.act(() => {
    rt.fileSystem.lastDownload().fail();
  });
  await rt.until(() => {
    expect(downloadButton()).toHaveTextContent('Download');
  });
  await rt.fireEvent.press(downloadButton());
  await rt.until(() => {
    expect(button('Abs')).toBeTruthy();
  });
  await rt.fireEvent.press(button('Abs'));
  await rt.until(() => {
    expect(rt.fileSystem.downloads).toHaveLength(2);
  });
  expect(rt.fileSystem.lastDownload().url).toBe('https://cdn.other.test/abs.mp4');
});
