import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FormError, PrimaryButton, SignInScreen } from '@/components/sign-in/SignInScreen';

describe('SignInScreen', () => {
  it('renders its content over the photo background', async () => {
    await render(
      <SignInScreen>
        <Text>Form</Text>
      </SignInScreen>,
    );

    expect(screen.getByText('Form')).toBeTruthy();
  });
});

describe('FormError', () => {
  it('announces the error', async () => {
    await render(<FormError error="Wrong password" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password');
  });

  it('renders nothing without an error', async () => {
    await render(<FormError error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();

    await render(<FormError error="" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('PrimaryButton', () => {
  it('shows its label and reports presses', async () => {
    const onPress = jest.fn();
    await render(
      <PrimaryButton label="Sign In" onPress={onPress} disabled={false} waiting={false} />,
    );

    await fireEvent.press(screen.getByText('Sign In'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner instead of the label while waiting', async () => {
    await render(<PrimaryButton label="Sign In" onPress={jest.fn()} disabled waiting />);

    expect(screen.queryByText('Sign In')).toBeNull();
  });
});
