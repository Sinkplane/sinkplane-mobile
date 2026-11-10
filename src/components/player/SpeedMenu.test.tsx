import { fireEvent, render, screen } from '@testing-library/react-native';

import { PLAYBACK_SPEEDS } from '@/components/player/constants';
import { formatRate, SpeedMenu } from '@/components/player/SpeedMenu';

describe('formatRate', () => {
  it('labels 1× as Normal and everything else with the × suffix', () => {
    expect(formatRate(1)).toBe('Normal');
    expect(formatRate(0.5)).toBe('0.5×');
    expect(formatRate(1.5)).toBe('1.5×');
  });
});

describe('SpeedMenu', () => {
  const renderMenu = async (props: Partial<Parameters<typeof SpeedMenu>[0]> = {}) =>
    render(
      <SpeedMenu visible={false} rate={1} onSelect={jest.fn()} onClose={jest.fn()} {...props} />,
    );

  it('renders nothing until visible', async () => {
    await renderMenu();
    expect(screen.queryByTestId('speed-menu-backdrop')).toBeNull();
  });

  it('lists every speed, marking the active one selected', async () => {
    await renderMenu({ visible: true, rate: 1.5 });

    for (const speed of PLAYBACK_SPEEDS) {
      expect(screen.getByTestId(`speed-option-${String(speed)}`)).toBeTruthy();
    }
    expect(screen.getByTestId('speed-option-1.5')).toBeSelected();
    expect(screen.getByTestId('speed-option-1')).not.toBeSelected();
    expect(screen.getByText('Normal')).toBeTruthy();
    expect(screen.getByText('1.5×')).toBeTruthy();
  });

  it('selects a speed', async () => {
    const onSelect = jest.fn();
    await renderMenu({ visible: true, rate: 1, onSelect });

    await fireEvent.press(screen.getByTestId('speed-option-2'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('closes from the backdrop', async () => {
    const onClose = jest.fn();
    await renderMenu({ visible: true, rate: 1, onClose });

    await fireEvent.press(screen.getByTestId('speed-menu-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
