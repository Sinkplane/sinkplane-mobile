type LogLevel = 'info' | 'error';

/**
 * The app's one console sink, for diagnostics with no UI to surface them (the background task runs
 * headless; captcha troubleshooting on devices). Everything else should report through the UI.
 */
export function log(level: LogLevel, ...details: readonly unknown[]): void {
  // eslint-disable-next-line no-console -- the single sanctioned console sink (see above)
  console[level](...details);
}

export function logError(message: string, error: unknown): void {
  log('error', message, error);
}
