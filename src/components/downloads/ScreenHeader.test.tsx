import { fireEvent, render, screen } from '@testing-library/react-native';

import { ScreenHeader } from '@/components/downloads/ScreenHeader';

const mockRouter = { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

beforeEach(() => {
  mockRouter.canGoBack.mockReset();
  mockRouter.back.mockReset();
  mockRouter.replace.mockReset();
});

describe('ScreenHeader', () => {
  it('shows the title as a header', async () => {
    await render(<ScreenHeader title="Downloads" />);
    expect(screen.getByRole('header', { name: 'Downloads' })).toBeTruthy();
  });

  it('Back returns to the previous screen', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    await render(<ScreenHeader title="Downloads" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opened directly, Back goes to the start of the app', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await render(<ScreenHeader title="Downloads" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
