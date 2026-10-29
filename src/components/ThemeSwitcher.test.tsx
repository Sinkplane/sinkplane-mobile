import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { Colors, ThemeProvider, useTheme } from '@/shared';
import { items as secureStore } from '@test/mocks/expo-secure-store';

/** Exposes the provider's state so tests can assert what the switcher changed. */
function ThemeProbe() {
  const { themeMode, colorScheme } = useTheme();
  return <Text testID="theme-probe">{`${themeMode}:${colorScheme ?? 'system'}`}</Text>;
}

async function renderSwitcher() {
  await render(
    <ThemeProvider>
      <ThemeSwitcher />
      <ThemeProbe />
    </ThemeProvider>,
  );
}

const radio = (label: string) => screen.getByRole('radio', { name: `${label} theme` });
const labelColor = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).color;

describe('ThemeSwitcher', () => {
  it('offers System, Light and Dark, with System selected by default', async () => {
    await renderSwitcher();

    expect(radio('System')).toBeSelected();
    expect(radio('Light')).not.toBeSelected();
    expect(radio('Dark')).not.toBeSelected();
    expect(screen.getByTestId('theme-probe')).toHaveTextContent('system:system');
  });

  it('switches to dark mode, persists the choice, and re-themes itself', async () => {
    await renderSwitcher();

    await fireEvent.press(radio('Dark'));

    expect(radio('Dark')).toBeSelected();
    expect(radio('System')).not.toBeSelected();
    expect(screen.getByTestId('theme-probe')).toHaveTextContent('dark:dark');
    expect(labelColor('Dark')).toBe(Colors.dark.text);
    expect(labelColor('Light')).toBe(Colors.dark.icon);
    await waitFor(() => expect(secureStore.get('themeMode')).toBe(JSON.stringify('dark')));
  });

  it('switches to light mode', async () => {
    await renderSwitcher();

    await fireEvent.press(radio('Light'));

    expect(radio('Light')).toBeSelected();
    expect(screen.getByTestId('theme-probe')).toHaveTextContent('light:light');
    expect(labelColor('Light')).toBe(Colors.light.text);
  });

  it('returns to following the system setting', async () => {
    secureStore.set('themeMode', JSON.stringify('dark'));
    await renderSwitcher();
    await waitFor(() => expect(radio('Dark')).toBeSelected());

    await fireEvent.press(radio('System'));

    expect(radio('System')).toBeSelected();
    expect(screen.getByTestId('theme-probe')).toHaveTextContent('system:system');
    await waitFor(() => expect(secureStore.get('themeMode')).toBe(JSON.stringify('system')));
  });

  it('restores a previously saved choice on launch', async () => {
    secureStore.set('themeMode', JSON.stringify('light'));
    await renderSwitcher();

    await waitFor(() => expect(radio('Light')).toBeSelected());
    expect(screen.getByTestId('theme-probe')).toHaveTextContent('light:light');
  });
});
