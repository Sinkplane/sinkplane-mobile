import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  DownloadQualityList,
  DownloadSheetFrame,
} from '@/components/downloads/DownloadQualitySheet';
import type { DownloadOptionsQuery } from '@/hooks/use-download-options';
import type { DownloadOption } from '@/utils/download-options';

const option = (overrides: Partial<DownloadOption>): DownloadOption => ({
  id: '720-avc1',
  label: '720p',
  url: 'https://edge.test/720.mp4',
  sizeBytes: 220 * 1024 * 1024,
  estimated: false,
  ...overrides,
});

const query = (overrides: Partial<DownloadOptionsQuery> = {}): DownloadOptionsQuery => ({
  options: [],
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  ...overrides,
});

async function renderSheet(sheetQuery: DownloadOptionsQuery, visible = true) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  await render(
    <DownloadSheetFrame visible={visible} onClose={onClose}>
      <DownloadQualityList query={sheetQuery} onSelect={onSelect} />
    </DownloadSheetFrame>,
  );
  return { onSelect, onClose };
}

describe('DownloadQualityList in its sheet', () => {
  it('lists the qualities with their sizes; an estimate is marked', async () => {
    await renderSheet(
      query({
        options: [
          option({ id: '1080', label: '1080p', sizeBytes: 1.5 * 1024 ** 3 }),
          option({ id: '720', label: '720p' }),
          option({ id: '360', label: '360p', sizeBytes: 45_000_000, estimated: true }),
          option({ id: 'x', label: 'Source', sizeBytes: undefined }),
        ],
      }),
    );
    expect(screen.getByText('Download quality')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1080p, 1.5 GB' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '720p, 220 MB' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '360p, ~43 MB' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Source' })).toBeTruthy();
    expect(
      screen.getByText('Saved in the app to watch offline (Settings › Downloads).'),
    ).toBeTruthy();
  });

  it('selecting a quality hands it over', async () => {
    const chosen = option({ id: '720' });
    const { onSelect } = await renderSheet(query({ options: [chosen] }));
    await fireEvent.press(screen.getByTestId('download-option-720'));
    expect(onSelect).toHaveBeenCalledWith(chosen);
  });

  it('shows a spinner while loading', async () => {
    await renderSheet(query({ isLoading: true }));
    expect(screen.getByTestId('download-options-loading')).toBeTruthy();
  });

  it('shows a failure with Retry', async () => {
    const failed = query({ isError: true });
    await renderSheet(failed);
    expect(screen.getByText("Couldn't load the download options.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('download-options-retry'));
    expect(failed.refetch).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing to download', async () => {
    await renderSheet(query());
    expect(screen.getByText('This video has no downloads available.')).toBeTruthy();
  });

  it('closes from the backdrop', async () => {
    const { onClose } = await renderSheet(query());
    await fireEvent.press(screen.getByTestId('download-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while hidden', async () => {
    await renderSheet(query(), false);
    expect(screen.queryByTestId('download-sheet')).toBeNull();
  });
});
