import { render, screen } from '@testing-library/react-native';

import { LiveDetails } from '@/components/live/LiveDetails';
import { gamingCreator, makeCreatorLiveStream } from '@test/fixtures';

describe('LiveDetails', () => {
  it('shows the live status, stream title, creator and description', async () => {
    await render(<LiveDetails stream={makeCreatorLiveStream('live')} />);

    expect(screen.getByTestId('live-status-live')).toBeTruthy();
    expect(screen.getByTestId('live-title')).toHaveTextContent('Tech Live: Friday Show');
    expect(screen.getByText('Tech Channel')).toBeTruthy();
    expect(screen.getByTestId('live-description')).toHaveTextContent('Live tech talk & news');
  });

  it('shows the offline card while offline', async () => {
    await render(<LiveDetails stream={makeCreatorLiveStream('offline')} />);

    expect(screen.getByTestId('live-status-offline')).toBeTruthy();
    expect(screen.getByTestId('live-title')).toHaveTextContent('We are offline');
    expect(screen.getByTestId('live-description')).toHaveTextContent('Back Friday at 4pm');
  });

  it('omits the description and icon when there are none', async () => {
    const stream = makeCreatorLiveStream('live');
    const creator = { ...gamingCreator, icon: undefined } as unknown as typeof gamingCreator;
    await render(<LiveDetails stream={{ ...stream, creator, liveStream: { ...stream.liveStream, description: '' } }} />);

    expect(screen.getByText('Gaming Channel')).toBeTruthy();
    expect(screen.queryByTestId('live-description')).toBeNull();
  });
});
