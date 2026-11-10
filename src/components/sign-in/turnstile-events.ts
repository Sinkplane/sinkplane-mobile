import { logSignIn } from '@/components/sign-in/diagnostics';
import type { TurnstileEvent } from '@/components/turnstile-widget';

function turnstileDetail(event: TurnstileEvent): string {
  if ('error' in event) {
    return event.error;
  }
  return 'token' in event ? `len=${String(event.token.length)}` : '';
}

interface TurnstileSetters {
  setCaptchaToken: (token: string | null) => void;
  setWidgetError: (error: string | null) => void;
  setWidgetReady: (ready: boolean) => void;
}

/** Applies a Turnstile widget event to the widget state. */
export function applyTurnstileEvent(event: TurnstileEvent, state: TurnstileSetters): void {
  logSignIn('info', '[Turnstile] event:', event.type, turnstileDetail(event));
  switch (event.type) {
    case 'token':
      state.setCaptchaToken(event.token);
      state.setWidgetError(null);
      break;
    case 'load':
      state.setWidgetReady(true);
      state.setWidgetError(null);
      break;
    case 'error':
      logSignIn('error', '[Turnstile] widget error:', event.error);
      state.setCaptchaToken(null);
      state.setWidgetError(event.error);
      break;
    case 'expire':
      // Token expired; managed widgets auto-refresh and re-issue a token.
      state.setCaptchaToken(null);
      break;
  }
}
