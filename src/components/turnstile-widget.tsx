import { useCallback, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type TurnstileEvent =
  | { type: 'load' }
  | { type: 'token'; token: string }
  | { type: 'expire' }
  | { type: 'error'; error: string };

interface TurnstileWidgetProps {
  siteKey: string;
  theme: 'light' | 'dark';
  /** Fired when Cloudflare Turnstile issues, expires, or rejects a token. */
  onEvent: (event: TurnstileEvent) => void;
  /** Bump to force a fresh widget (tokens are single-use). */
  reloadKey?: number;
}

// Turnstile treats generic WebView user agents as bot-like and gets stuck in an
// unsolvable challenge loop. Present as the platform's real browser instead.
const USER_AGENT =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
      'Version/17.4 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/131.0.0.0 Mobile Safari/537.36';

/**
 * Renders a Cloudflare Turnstile "managed" challenge in a WebView and streams
 * the resulting captcha token back to React Native via postMessage. This is
 * the same widget + variant the floatplane.com/login page uses.
 */
export function TurnstileWidget({ siteKey, theme, onEvent, reloadKey = 0 }: TurnstileWidgetProps) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const html = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; padding: 0; width: 100%; background: transparent; overflow: hidden; }
  #widget { width: 100%; min-height: 65px; display: flex; justify-content: center; }
</style>
</head>
<body>
<div id="widget"></div>
<script>
(function () {
  function send(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  window.onerror = function (msg) { send({ type: 'error', error: 'page: ' + msg }); };

  // Define every callback BEFORE the api.js script tag is created: with an
  // async script, onload could otherwise fire before this script runs and the
  // widget would silently never render.
  window.onTsLoad = function () {
    try {
      turnstile.render('#widget', {
        sitekey: ${JSON.stringify(siteKey)},
        size: 'flexible',
        theme: ${JSON.stringify(theme)},
        callback: function (token) { send({ type: 'token', token: token }); },
        'expired-callback': function () { send({ type: 'expire' }); },
        'timeout-callback': function () { send({ type: 'expire' }); },
        'error-callback': function (errorCode) { send({ type: 'error', error: 'turnstile: ' + errorCode }); },
      });
      send({ type: 'load' });
    } catch (err) {
      send({ type: 'error', error: 'render failed: ' + String(err) });
    }
  };

  var script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTsLoad&render=explicit';
  script.async = true;
  script.onerror = function () { send({ type: 'error', error: 'failed to load challenges.cloudflare.com' }); };
  document.head.appendChild(script);
})();
</script>
</body>
</html>`,
    [siteKey, theme],
  );

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as TurnstileEvent;
      onEventRef.current(parsed);
    } catch {
      // Ignore non-JSON messages from the page.
    }
  }, []);

  const handleWebViewError = useCallback((event: { nativeEvent: { description?: string } }) => {
    onEventRef.current({ type: 'error', error: event.nativeEvent.description ?? 'WebView failed to load' });
  }, []);

  return (
    <WebView
      key={reloadKey}
      // baseUrl pins the document origin to floatplane.com so the Turnstile
      // widget (and any domain checks) behave exactly as on the real site.
      source={{ html, baseUrl: 'https://www.floatplane.com/' }}
      originWhitelist={['*']}
      // `style` only sizes the inner native view; the wrapping container is
      // flex: 1 and collapses to zero width inside a centered (alignItems)
      // parent, which leaves the widget rendered but invisible.
      containerStyle={styles.container}
      style={styles.webview}
      userAgent={USER_AGENT}
      javaScriptEnabled
      domStorageEnabled
      onMessage={handleMessage}
      onError={handleWebViewError}
      onRenderError={handleWebViewError}
      onHttpError={e => onEventRef.current({ type: 'error', error: `HTTP ${e.nativeEvent.statusCode}` })}
      scrollEnabled={false}
      nestedScrollEnabled
      setSupportMultipleWindows={false}
      webviewDebuggingEnabled={__DEV__}
    />
  );
}

const styles = {
  container: {
    flex: 0,
    alignSelf: 'stretch' as const,
    height: 70,
  },
  webview: {
    width: '100%' as const,
    height: 70,
    backgroundColor: 'transparent',
  },
};
