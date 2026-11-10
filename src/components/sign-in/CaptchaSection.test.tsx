import type * as ReactNative from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CaptchaSection, type CaptchaSectionProps } from '@/components/sign-in/CaptchaSection';

jest.mock('@/components/turnstile-widget', () => {
  const { Text } = jest.requireActual<typeof ReactNative>('react-native');
  const TurnstileWidget = ({ siteKey, theme }: { siteKey: string; theme: string }) => (
    <Text testID="turnstile">{`${siteKey}:${theme}`}</Text>
  );
  // Computed key: the module's export is PascalCase, which object-literal naming rules reject.
  return { ['TurnstileWidget']: TurnstileWidget };
});

function props(overrides: Partial<CaptchaSectionProps> = {}): CaptchaSectionProps {
  return {
    captcha: { status: 'ready', siteKey: 'site-key' },
    widgetError: null,
    widgetReady: false,
    hasToken: false,
    turnstileKey: 0,
    onTurnstileEvent: jest.fn(),
    onRetry: jest.fn(),
    onRetryWidget: jest.fn(),
    ...overrides,
  };
}

describe('CaptchaSection', () => {
  it('says when no captcha is required', async () => {
    await render(<CaptchaSection {...props({ captcha: { status: 'disabled' } })} />);

    expect(screen.getByLabelText('Captcha not required')).toBeTruthy();
  });

  it('shows the requirements loading', async () => {
    await render(<CaptchaSection {...props({ captcha: { status: 'loading' } })} />);

    expect(screen.getByText('Loading captcha requirements…')).toBeTruthy();
  });

  it('retries loading the requirements after an error', async () => {
    const onRetry = jest.fn();
    await render(
      <CaptchaSection {...props({ captcha: { status: 'error', message: 'Offline' }, onRetry })} />,
    );

    expect(screen.getByText('Offline')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the dark Turnstile challenge with its progress', async () => {
    await render(<CaptchaSection {...props()} />);
    expect(screen.getByTestId('turnstile')).toHaveTextContent('site-key:dark');
    expect(screen.getByText('Loading challenge…')).toBeTruthy();

    await render(<CaptchaSection {...props({ widgetReady: true })} />);
    expect(screen.getByText('Complete the challenge above')).toBeTruthy();

    await render(<CaptchaSection {...props({ widgetReady: true, hasToken: true })} />);
    expect(screen.getByText('Captcha verified')).toBeTruthy();
  });

  it('offers reloading a widget that failed to render', async () => {
    const onRetryWidget = jest.fn();
    await render(<CaptchaSection {...props({ widgetError: '110200', onRetryWidget })} />);

    expect(screen.getByText('Captcha failed to load (110200)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(onRetryWidget).toHaveBeenCalledTimes(1);
  });
});
