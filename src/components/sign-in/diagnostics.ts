import { log } from '@/utils/log';

/** Sign-in diagnostics for the dev console (captcha / Turnstile troubleshooting on devices). */
export function logSignIn(level: 'info' | 'error', ...details: readonly unknown[]): void {
  log(level, ...details);
}
