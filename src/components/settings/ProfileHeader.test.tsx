import { render, screen } from '@testing-library/react-native';

import { ProfileHeader } from '@/components/settings/ProfileHeader';
import { fixtureUser } from '@test/fixtures';

describe('ProfileHeader', () => {
  it('shows the display name and handle', async () => {
    await render(<ProfileHeader user={fixtureUser} />);

    expect(screen.getByText('Test User')).toBeTruthy();
    expect(screen.getByText('@testuser')).toBeTruthy();
    expect(screen.queryByText('T')).toBeNull();
  });

  it('falls back to the username and its initial without a display name or avatar', async () => {
    await render(<ProfileHeader user={{ username: 'linus', profileImage: null }} />);

    expect(screen.getByText('linus')).toBeTruthy();
    expect(screen.getByText('L')).toBeTruthy();
  });

  it('copes with a session that has no user yet', async () => {
    await render(<ProfileHeader user={undefined} />);

    expect(screen.getByText('Signed in')).toBeTruthy();
    expect(screen.getByText('?')).toBeTruthy();
  });
});
