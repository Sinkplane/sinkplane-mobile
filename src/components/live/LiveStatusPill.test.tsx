import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { LIVE_RED, LiveStatusPill } from '@/components/live/LiveStatusPill';

const backgroundOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props['style'] as StyleProp<ViewStyle>)
    ?.backgroundColor;

describe('LiveStatusPill', () => {
  it('is a red LIVE chip while live', async () => {
    await render(<LiveStatusPill status="live" />);

    expect(screen.getByTestId('live-status-live')).toHaveTextContent('LIVE');
    expect(backgroundOf('live-status-live')).toBe(LIVE_RED);
  });

  it.each([
    ['offline', 'OFFLINE'],
    ['loading', 'CHECKING…'],
    ['error', 'UNKNOWN'],
  ] as const)('is a muted %s chip otherwise', async (status, label) => {
    await render(<LiveStatusPill status={status} />);

    expect(screen.getByTestId(`live-status-${status}`)).toHaveTextContent(label);
    expect(backgroundOf(`live-status-${status}`)).not.toBe(LIVE_RED);
  });
});
