/**
 * Mobile-safe re-exports from @sinkplane/shared.
 *
 * NEVER import from the '@sinkplane/shared' barrel in this app: it re-exports
 * the TV connection server (TCP + Bonjour + cookie manager), which requires
 * native modules this app does not include — the Metro bundle would fail to
 * resolve them. Import from the mobile-safe subpaths below, or add new ones
 * here (auth, storage, theme, content hooks, and types are all safe).
 */
export { Colors } from '@sinkplane/shared/constants/colors';
export { useStorageState, setStorageItemAsync } from '@sinkplane/shared/storage/useStorageState';

export { SessionProvider, useSession, type AuthState } from '@sinkplane/shared/auth/auth.context';
export { authenticatedFetch } from '@sinkplane/shared/auth/apiClient';
export {
  FloatplaneApiError,
  checkFor2faLogin,
  getCaptchaInfo,
  loginWithPassword,
  logout,
  type CaptchaInfo,
  type LoginResponse,
} from '@sinkplane/shared/auth/passwordLogin';
export { fetchProfile, useGetProfile } from '@sinkplane/shared/auth/useGetProfile';

export { ThemeProvider, useTheme, type ThemeMode } from '@sinkplane/shared/theme/theme.context';
export { useColorScheme } from '@sinkplane/shared/theme/useColorScheme';
export { useThemeColor } from '@sinkplane/shared/theme/useThemeColor';

export { AssDass, useGetVideosInfinite } from '@sinkplane/shared/videos/useGetVideos';
export { useGetVideoProgress } from '@sinkplane/shared/videos/useGetVideoProgress';

export type { User } from '@sinkplane/shared/types/user.interface';
export type { Subscription } from '@sinkplane/shared/types/subscriptions.interface';
export type { Video } from '@sinkplane/shared/types/video.interface';
// The creator-list module intentionally collides with video.interface names (Creator, Channel);
// these are the session-side shapes returned by useSession().
export type { Channel, Creator } from '@sinkplane/shared/types/creator-list.interface';
