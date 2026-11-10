import { fireEvent, render, screen } from '@testing-library/react-native';

import { TwoFactorForm, type TwoFactorFormProps } from '@/components/sign-in/TwoFactorForm';

function props(overrides: Partial<TwoFactorFormProps> = {}): TwoFactorFormProps {
  return {
    code: '',
    onCodeChange: jest.fn(),
    onSubmit: jest.fn(),
    onBack: jest.fn(),
    isSubmitting: false,
    error: null,
    ...overrides,
  };
}

describe('TwoFactorForm', () => {
  it('reports the code, submits it, and goes back', async () => {
    const form = props({ code: '123456' });
    await render(<TwoFactorForm {...form} />);

    await fireEvent.changeText(screen.getByPlaceholderText('123456'), '654321');
    await fireEvent(screen.getByPlaceholderText('123456'), 'submitEditing');
    await fireEvent.press(screen.getByText('Verify'));
    await fireEvent.press(screen.getByText('Back to sign in'));

    expect(form.onCodeChange).toHaveBeenCalledWith('654321');
    expect(form.onSubmit).toHaveBeenCalledTimes(2);
    expect(form.onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the error and locks the form while submitting', async () => {
    const form = props({ error: 'Invalid code', isSubmitting: true });
    await render(<TwoFactorForm {...form} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid code');
    expect(screen.getByPlaceholderText('123456')).toHaveProp('editable', false);
    await fireEvent.press(screen.getByText('Back to sign in'));
    expect(form.onBack).not.toHaveBeenCalled();
  });
});
