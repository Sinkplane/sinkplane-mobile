import { fireEvent, render, screen } from '@testing-library/react-native';

import { CredentialsForm, type CredentialsFormProps } from '@/components/sign-in/CredentialsForm';

// The captcha is disabled in these tests; the native WebView can't load under Jest.
jest.mock('@/components/turnstile-widget', () => ({ ['TurnstileWidget']: () => null }));

function props(overrides: Partial<CredentialsFormProps> = {}): CredentialsFormProps {
  return {
    username: 'linus',
    password: 'hunter2',
    onUsernameChange: jest.fn(),
    onPasswordChange: jest.fn(),
    onSubmit: jest.fn(),
    isSubmitting: false,
    captchaBlocksSubmit: false,
    captcha: {
      captcha: { status: 'disabled' },
      widgetError: null,
      widgetReady: false,
      hasToken: false,
      turnstileKey: 0,
      onTurnstileEvent: jest.fn(),
      onRetry: jest.fn(),
      onRetryWidget: jest.fn(),
    },
    error: null,
    ...overrides,
  };
}

describe('CredentialsForm', () => {
  it('reports typing and submits from the button and the keyboard', async () => {
    const form = props();
    await render(<CredentialsForm {...form} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Username or email'), 'luke');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    await fireEvent(screen.getByPlaceholderText('Password'), 'submitEditing');
    await fireEvent.press(screen.getByText('Sign In'));

    expect(form.onUsernameChange).toHaveBeenCalledWith('luke');
    expect(form.onPasswordChange).toHaveBeenCalledWith('secret');
    expect(form.onSubmit).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Captcha not required')).toBeTruthy();
  });

  it('toggles password visibility', async () => {
    await render(<CredentialsForm {...props()} />);
    const password = () => screen.getByPlaceholderText('Password');
    expect(password()).toHaveProp('secureTextEntry', true);

    await fireEvent.press(screen.getByText('Show'));
    expect(password()).toHaveProp('secureTextEntry', false);

    await fireEvent.press(screen.getByText('Hide'));
    expect(password()).toHaveProp('secureTextEntry', true);
  });

  it('shows the error and blocks submitting while the captcha is unsolved', async () => {
    const form = props({ captchaBlocksSubmit: true, error: 'Wrong password' });
    await render(<CredentialsForm {...form} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password');
    await fireEvent.press(screen.getByText('Sign In'));
    expect(form.onSubmit).not.toHaveBeenCalled();
  });

  it('locks the fields while submitting', async () => {
    await render(<CredentialsForm {...props({ isSubmitting: true })} />);

    expect(screen.getByPlaceholderText('Username or email')).toHaveProp('editable', false);
    expect(screen.getByPlaceholderText('Password')).toHaveProp('editable', false);
  });
});
